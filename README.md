# sluglist

> Universal embeddable feedback widget for dev, staging and beta sites.

**[Live demo & docs → sluglist.dev](https://sluglist.dev)**

A framework-agnostic, dependency-light widget that lets people leave visual feedback directly on
a running web app: pick an element, grab an area or the full page, annotate the screenshot, add a
comment, and the widget produces a standard set of artifacts and hands them to pluggable
**connectors**. The core knows nothing about where feedback is stored; delivery is fully
encapsulated in the connector you provide.

## Install

```bash
npm install sluglist
```

Or drop it into any page without a build step (deps inlined, exposed as `Sluglist`):

```html
<script src="https://unpkg.com/sluglist"></script>
<script>
  const { createFeedbackWidget, mountFeedbackWidget, DownloadConnector } = Sluglist;
  const widget = createFeedbackWidget({
    project: "my-app",
    connectors: [new DownloadConnector()],
  });
  mountFeedbackWidget(widget);
</script>
```

## Quick start

```ts
import {
  createFeedbackWidget,
  mountFeedbackWidget,
  DownloadConnector,
} from "sluglist";

const widget = createFeedbackWidget({
  project: "my-app",              // slug written into session.yaml
  connectors: [new DownloadConnector()],
  enabled: process.env.NODE_ENV !== "production",
  shortcut: "Shift+F",            // toggle key (default); false disables it
});

mountFeedbackWidget(widget, {
  position: "bottom-right",
  accentColor: "#18181b",
  container: document.body,       // mount anywhere (e.g. an extension content root)
  categories: [                   // triage chips; [] hides them
    { key: "bug", label: "Bug" },
    { key: "design", label: "Design" },
  ],
  onIssueCaptured: (result) => analytics.track("feedback", result.issueId),
});
```

Only load it on dev/staging. In a production build, guard the import so the widget code is never
initialized. Ships as ESM and CJS; `html-to-image` is loaded lazily on the first capture, so it is
not part of the initial bundle.

Undelivered issues are persisted to IndexedDB (an outbox) and retried on the next load, so a failed
upload or a closed tab does not lose feedback. Disable with `offlineQueue: false` on the config.

## Capture modes

- **fullpage** — the whole scrollable document
- **area** — drag a rectangle and crop to it
- **element** — hover to highlight, click to capture a single element (records its CSS selector)
- **comment only** — no screenshot

The menu lists them in that order (plus **Record steps**), most-used first, with `1`–`5` hotkeys
following the position.

Each screenshot can be annotated before sending (arrow, box, text; color; undo), with keyboard
shortcuts (A / B / T, Ctrl/Cmd+Z, Esc, click backdrop to close), and an issue can carry multiple
screenshots.

## Connectors

A connector is the only place that knows about storage, auth and credentials.

```ts
interface ArtifactFile {
  path: string; // POSIX path inside the session folder, e.g. "01-broken-header.png"
  blob: Blob;
  mime: string; // "text/yaml" | "text/markdown" | "image/png"
}

interface FeedbackConnector {
  id: string; // used in logs and error reporting
  put(sessionId: string, file: ArtifactFile): Promise<void>;
}
```

Built in: `MemoryConnector` (accumulates in memory, for tests) and `DownloadConnector` (zips a
whole session via JSZip). Real targets (blob storage, an API route, a tracker) are your own
connector. `connectors` is an array, so one issue can fan out to several destinations at once;
a failing connector never blocks the others or the UI, and delivery retries with backoff.

### Connector recipes

Because the browser should never hold storage credentials, the recommended shape is a **thin
API route** on your side that takes the artifact and writes it server-side. The connector just
posts to it.

**Client connector (generic API route):**

```ts
class ApiRouteConnector implements FeedbackConnector {
  id = "api-route";
  constructor(private endpoint: string, private token: string) {}
  async put(sessionId: string, file: ArtifactFile) {
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(await file.blob.arrayBuffer()))
    );
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-feedback-token": this.token },
      body: JSON.stringify({ sessionId, path: file.path, mime: file.mime, base64 }),
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
}
```

**Server route — Vercel Blob** (`POST /api/feedback`):

```ts
import { put } from "@vercel/blob";

export async function POST(req: Request) {
  if (req.headers.get("x-feedback-token") !== process.env.FEEDBACK_TOKEN)
    return new Response("Unauthorized", { status: 401 });
  const { sessionId, path, mime, base64 } = await req.json();
  const bytes = Buffer.from(base64, "base64");
  const { url } = await put(`feedback/${sessionId}/${path}`, bytes, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return Response.json({ ok: true, url });
}
```

**Server route — S3 / R2** (same client connector):

```ts
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function POST(req: Request) {
  const { sessionId, path, mime, base64 } = await req.json();
  await s3.send(new PutObjectCommand({
    Bucket: process.env.FEEDBACK_BUCKET,
    Key: `feedback/${sessionId}/${path}`,
    Body: Buffer.from(base64, "base64"),
    ContentType: mime,
  }));
  return Response.json({ ok: true });
}
```

**Supabase Storage** (client-direct, with an insert-only RLS policy on the bucket):

```ts
import { createClient } from "@supabase/supabase-js";

class SupabaseConnector implements FeedbackConnector {
  id = "supabase";
  private sb = createClient(URL, ANON_KEY);
  async put(sessionId: string, file: ArtifactFile) {
    const { error } = await this.sb.storage
      .from("feedback")
      .upload(`${sessionId}/${file.path}`, file.blob, {
        contentType: file.mime,
        upsert: true, // session.yaml is re-written each issue
      });
    if (error) throw error;
  }
}
```

## Beta feedback mode

Beyond dev/staging, sluglist can power a **"Report a problem"** button for real users on a
production MVP or beta. It stays **one-way capture** (see the scope note below); the extra pieces are
reporter identity, per-issue custom fields, and PII masking so screenshots are safe to store.

```ts
import { createFeedbackWidget, mountFeedbackWidget } from "sluglist";
import { HttpConnector } from "./HttpConnector"; // see examples/

const widget = createFeedbackWidget({
  project: "acme",
  preset: "beta",                       // masks inputs + adds screenshot consent + "Report a problem" label
  connectors: [new HttpConnector("/api/feedback", () => currentUser.token)],
  identity: {                           // recorded once per session → reporter in artifacts
    userId: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
  },
  custom: {                             // flat project fields → custom block per issue
    plan: currentUser.plan,
    appVersion: APP_VERSION,
  },
  privacy: {                            // any explicit option overrides the preset
    maskSelectors: [".account-balance"],
  },
});

mountFeedbackWidget(widget);
```

Mark anything sensitive with `data-private` and it is always redacted in screenshots, regardless of
`maskInputs`. Values are masked only for the screenshot render; the live DOM is restored exactly.

**Delivery in production:** never ship storage write-keys in the browser. Post to a thin endpoint on
your side that owns the credentials and does the write (and rate-limiting). See
[`examples/feedback-route.ts`](examples/feedback-route.ts) (a ~50-line Next.js route handler) and
[`examples/HttpConnector.ts`](examples/HttpConnector.ts).

### Scope — one-way capture by design

sluglist captures feedback and hands it to your storage. It is **not** a support tool:

- **No inbox, no statuses, no threads, no replies to the user, no email notifications.**
- **No user accounts** and no login of its own.

If you need a support loop (triage, back-and-forth, resolution states), that is a different product;
sluglist deliberately stops at capture. Its output is a stable set of artifacts you can pipe into
whatever tracker or workflow you already run.

## Local feedback loop

Test your app locally, click feedback with the widget, and have it land in a `.sluglist/` folder in
your project — then let an agent (e.g. Claude Code) read it and fix the issues. Browser JS can't write
to disk, so a tiny sidecar process, `sluglist dev`, sits between the widget and the folder.

```ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

const widget = createFeedbackWidget({
  project: "my-app",
  connectors: [new LocalConnector()], // POSTs to http://127.0.0.1:4477 by default
  enabled: process.env.NODE_ENV !== "production",
});
mountFeedbackWidget(widget);
```

Run the sidecar next to your dev server:

```bash
npx sluglist dev                        # writes to ./.sluglist, port 4477
npx sluglist dev --dir .feedback --port 5511
```

Click feedback → the full artifact set appears under `.sluglist/session-*/`. The dev server binds to
`127.0.0.1` only and has **no authentication** — it is local-only by design; don't expose it or forward
its port. If it isn't running, `LocalConnector` warns once and your other connectors keep working (the
UI is never blocked).

> Add `.sluglist/` to your project's `.gitignore`.

### Let an agent fix it (Claude Code skill)

The package ships a `sluglist-fix` skill that reads `.sluglist/` and fixes the reported issues. Install
it into your project once:

```bash
mkdir -p .claude/skills && cp -r node_modules/sluglist/skills/sluglist-fix .claude/skills/
```

Then, after clicking feedback, ask Claude Code to "fix feedback": it reads each issue (comment,
selector, `element_text`, screenshot, `## Errors`), localizes and fixes the code, and writes a
`.done` report into the session folder. See [`skills/sluglist-fix/SKILL.md`](skills/sluglist-fix/SKILL.md).

## Programmatic capture

The UI is optional. Produce and deliver an issue without any chrome:

```ts
await widget.captureIssue({
  comment: "Logo overlaps the nav on narrow screens",
  mode: "element",
  selector: "header > nav .logo",
  screenshot: pngBlob,        // optional
  category: "bug",            // optional: bug | design | idea | ...
  consoleErrors: [...],       // optional, appended as a "## Console errors" section
});
```

## Artifact format (contract)

Delivered per session under `{project}/session-{YYYY-MM-DD}-{shortid}/`:

```
session.yaml            # upserted on every issue, always consistent
01-{slug}.md            # one markdown file per issue, YAML frontmatter + body
01-{slug}.png           # optional screenshot(s)
02-{slug}.md
...
```

`session.yaml` carries the environment (browser, OS, viewport, screen, DPR, language(s),
timezone, color scheme, reduced-motion) plus an index of issues. Each `NN-{slug}.md` repeats the
per-issue metadata in frontmatter followed by the free-text comment. The structure and frontmatter
are a stable contract intended as input for downstream parsers; **it only changes additively**.

The full field dictionary, section rules and versioning policy live in **[SPEC.md](SPEC.md)** — safe
to build parsers against. `session.yaml` starts with `format_version: "1.0"`; a missing version means
`"1.0"`. Within a major version, new fields are only ever added, never removed or repurposed.

## Metadata collected

Automatically, no personal data: URL path, viewport and screen size, device pixel ratio, browser
and OS (parsed from the user agent), UI language(s), timezone, color scheme, reduced-motion, and up
to the last 20 `console.error` messages. Deliberately not collected: full user agent, IP, cookies,
storage, geolocation, or any DOM content beyond the screenshot pixels.

Reporter **identity** and **custom** fields are collected only when you explicitly configure them
(see [Beta feedback mode](#beta-feedback-mode)); by default neither is present in the artifacts.

**Component hint (React).** In element mode, sluglist makes a best-effort read of the nearest named
React component from the element's fiber and records it as `component` in the frontmatter (e.g.
`component: AnimalCard`) — a strong localization hint for an agent. It needs no React dependency, is
fully guarded, and is `null` when React is absent, the component is anonymous, or names are minified in
production.

**Runtime context (`setContext`).** Attach live host state (tenant, feature flags, build version) to
every subsequent issue:

```ts
const widget = createFeedbackWidget({ project: "my-app", connectors: [/* … */] });
widget.setContext({ tenantId: "acme", featureFlags: "new-nav", buildVersion: APP_VERSION });
```

It lands as a `context` block in each issue's frontmatter. Same rules as `custom` (flat primitives,
snake_case keys, ≤ 20 keys, values clipped to 200 chars); repeat calls merge. Unlike `config.custom`
(fixed at init), `setContext` reflects state at capture time.

## Error capture

From the moment the widget initializes, sluglist keeps a small ring buffer of recent page errors from
four sources — `console.error`, uncaught `error` events, `unhandledrejection`, and **failed network
calls** — and attaches a snapshot to each issue as a `## Errors` section (with a relative timestamp per
entry) plus an `errors_count` field in the frontmatter. The original `console.error` still runs, so
nothing is swallowed.

Network capture wraps `fetch` and `XMLHttpRequest` and records **only** requests that finish with a
status ≥ 400 or a network error — method, path (no query), status and duration, never bodies, headers
or query strings:

```
## Errors
- [4s before report] network: POST /api/animals → 500 (240ms)
```

```ts
createFeedbackWidget({
  project: "my-app",
  connectors: [/* ... */],
  errors: {
    capture: true,          // default; set false to disable entirely
    bufferSize: 20,         // default
    captureWarnings: false, // default; true also captures console.warn
    captureNetwork: true,   // default; wrap fetch/XHR for failed-request facts
  },
});
```

> **Note:** error messages and stack traces can contain user data — in beta mode they may include PII.
> Production stack traces are usually minified. Treat captured errors as diagnostic hints, not ground
> truth; sluglist stores them verbatim and does not resolve source maps.

## Action trail & record mode

Some bugs need a sequence, not a single screenshot. sluglist has two layers for that.

**Action trail** (always on) keeps a small ring buffer of recent actions — clicks, SPA navigations,
submits, typing — and attaches them to every issue as a `## Actions` section (plus `actions_count`):

```markdown
## Actions
- [45s before report] navigate /animals → /animals/128
- [12s before report] click button[aria-label="Save"] ("Save")
- [11s before report] type (12 chars) input#email
- [10s before report] submit form[data-testid="animal-form"]
```

**PII rule (independent of any privacy setting):** the trail records the *fact and place* of an action,
never the entered content. `type` logs only a character count; password fields aren't logged at all by
default; navigation paths drop the query string.

**Record mode** turns a sequence into steps-to-reproduce *with images*. Click **Record steps**, do the
thing, then **Stop & describe**. A frame is captured at the start and on each click / navigation /
submit (not typing), so the issue gets a `NN-slug-frames/` folder of numbered screenshots and the
matching `## Actions` lines are tagged `— frame NN`. Frames respect PII masking. Need a state the
auto-capture misses (a hover popover, a transient toast)? Hit **`+ Frame`** in the recording bar — or
press **S** — to snap one manually.

Recordings and screenshots mix in one issue: start a recording from an open draft (via
`+ Add screenshot` → `Record steps`) and the frames attach to it instead of replacing it. In the
panel the recording shows as a single stacked tile next to the screenshots; click it to expand the
numbered frame ribbon, `×` to drop it.

```ts
createFeedbackWidget({
  project: "my-app",
  connectors: [/* ... */],
  actions: { capture: true, bufferSize: 30, capturePasswords: false }, // defaults
  recording: { enabled: true, maxFrames: 30, frameMinInterval: 650 },  // defaults
});
```

Deliberately **not** built: session replay (rrweb), real video (`getDisplayMedia`/`MediaRecorder`), or
network capture. The output is artifacts for an agent to read, not a replay a human scrubs.

## Notes and limits

- Desktop-first. Area selection and annotation use pointer events and work on touch; element mode
  relies on hover and is desktop-oriented.
- Screenshots use `html-to-image` (DOM to canvas). WebGL/canvas content and some cross-origin
  images may not render; elements parked by scroll-reveal animations are temporarily revealed
  during capture.
- Style isolation via shadow DOM; nothing leaks in or out of the host page.

## License

MIT (c) Yelysei Lukin / MiraWision
