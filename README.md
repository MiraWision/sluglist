# snaglist

> Universal embeddable feedback widget for dev, staging and beta sites.

**[Live demo & docs → mirawision.github.io/snaglist](https://mirawision.github.io/snaglist)**

> **Renamed from `sluglist`.** The package was briefly published as `sluglist`; it is now
> **`snaglist`** (from a *snagging list* — the punch list of defects a client marks on handover).
> Run `npm install snaglist`. The old `sluglist` package is deprecated and points here.

A framework-agnostic, dependency-light widget that lets people leave visual feedback directly on
a running web app: pick an element, grab an area or the full page, annotate the screenshot, add a
comment, and the widget produces a standard set of artifacts and hands them to pluggable
**connectors**. The core knows nothing about where feedback is stored; delivery is fully
encapsulated in the connector you provide.

## Install

```bash
npm install snaglist
```

Or drop it into any page without a build step (deps inlined, exposed as `Snaglist`):

```html
<script src="https://unpkg.com/snaglist"></script>
<script>
  const { createFeedbackWidget, mountFeedbackWidget, DownloadConnector } = Snaglist;
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
} from "snaglist";

const widget = createFeedbackWidget({
  project: "my-app",              // slug written into session.yaml
  connectors: [new DownloadConnector()],
  enabled: process.env.NODE_ENV !== "production",
});

mountFeedbackWidget(widget, {
  hotkey: "alt+shift+f",          // menu toggle; "" or null disables it
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

- **element** — hover to highlight, click to capture a single element (records its CSS selector)
- **fullpage** — the whole scrollable document
- **area** — drag a rectangle and crop to it
- **comment only** — no screenshot

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
are a stable contract intended as input for downstream parsers; it only changes additively.

## Metadata collected

Automatically, no personal data: URL path, viewport and screen size, device pixel ratio, browser
and OS (parsed from the user agent), UI language(s), timezone, color scheme, reduced-motion, and up
to the last 20 `console.error` messages. Deliberately not collected: full user agent, IP, cookies,
storage, geolocation, identity, or any DOM content beyond the screenshot pixels.

## Notes and limits

- Desktop-first. Area selection and annotation use pointer events and work on touch; element mode
  relies on hover and is desktop-oriented.
- Screenshots use `html-to-image` (DOM to canvas). WebGL/canvas content and some cross-origin
  images may not render; elements parked by scroll-reveal animations are temporarily revealed
  during capture.
- Style isolation via shadow DOM; nothing leaks in or out of the host page.

## License

MIT (c) Yelysei Lukin / MiraWision
