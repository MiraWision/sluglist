Beyond dev and staging, sluglist can power a **"Report a problem"** button for real users on a
production MVP or beta. It stays one-way capture; the extra pieces are reporter identity, per-issue
custom fields, and PII masking so screenshots are safe to store.

## Presets

`preset: "beta"` masks inputs, adds screenshot consent and relabels the launcher.
`preset: "production"` is `beta` plus the three things a widget needs once it faces paying
customers: PII scrubbed out of the text it collects, a way for the reporter to make it go away, and
no `console.warn` capture.

| | `dev` | `beta` | `production` |
| --- | --- | --- | --- |
| `privacy.maskInputs` | – | ✓ | ✓ |
| `privacy.screenshotConsent` | – | ✓ | ✓ |
| `privacy.scrubText` | – | – | ✓ |
| `errors.captureWarnings` | opt-in | opt-in | forced off |
| `dismiss.enabled` | – | – | ✓ |
| Button label | "Feedback" | "Report a problem" | "Report a problem" |

```ts
const widget = createFeedbackWidget({
  project: "acme",
  preset: "production",
  connectors: [new HttpConnector("/api/feedback", () => session.token)],
  identity: { userId: user.id, email: user.email, name: user.name },
  custom: { plan: user.plan, appVersion: APP_VERSION },
});
const ui = mountFeedbackWidget(widget);
```

Every option can still be set explicitly and wins over the preset — except
`errors.captureWarnings` under `production`, which is forced to `false` (warnings are the noisiest
text channel in a real app; asking for them anyway logs a warning).

Mark anything sensitive with `data-private` and it is always redacted in screenshots, regardless of
`maskInputs`. Values are masked only for the screenshot render; the live DOM is restored exactly.

## Text scrubbing

With `scrubText` on, the text surfaces of every artifact — `element_text`, the issue `url`, each
message and stack in `## Errors` (including failed-request paths), and the selectors and labels in
`## Actions` — have emails replaced by `[email]`, runs of 6+ digits by `[digits]`, and
hex/base64-shaped tokens by `[token]`. Dates, version numbers, viewport strings, stack-trace line
numbers and ordinary prose are left alone. Values *you* supply (`context`, `custom`, `identity`,
checklist titles) and the reporter's own comment are never scrubbed. Issues carry `scrubbed: true`
in their frontmatter so a reader knows which artifacts went through it.

## Dismiss

The launcher gets a ✕ — shown on hover on desktop, always visible (muted) on touch. Clicking it
hides the widget completely, shortcut included, and remembers that for `dismiss.days` (default 7;
`0` means until storage is cleared).

The rescue path is `ui.show()`, which clears the dismissal immediately. Wire it to a link in your
own footer so the ✕ is never a one-way door:

```ts
footerLink.addEventListener("click", () => ui.show());
```

**Your own entry point.** `ui.open()` goes one step further: it opens the capture menu right away,
exactly as clicking the launcher does, and un-dismisses first if it has to. Use it wherever *you*
want the reporting flow to start — a "Report a problem" item in your menu, a help panel, an empty
state — instead of showing the launcher and asking the reporter to find it:

```ts
menuItem.addEventListener("click", () => ui.open());
```

## Self-isolation

Everything the widget wraps (`console.error`, `fetch`, `XMLHttpRequest`, `history.pushState`) calls
the original host function unconditionally — a bug inside sluglist cannot fail your request,
swallow your log or block your navigation. Internal failures are counted; after five in one session
the widget uninstalls itself (originals restored by reference, listeners removed, UI taken out of
the DOM), logs one warning, and the page carries on without it.

**Zero phone-home:** the widget makes no network requests except to your configured connectors —
enforced by an automated test that drives a full session with every outbound channel trapped and
asserts the count is zero.

## Localization

Real users are the ones who need the widget in their own language. Bundles ship for **en**
(default), **ru**, **uk**, **es** and **de** — one line:

```ts
import { labels } from "sluglist/labels";

mountFeedbackWidget(widget, { strings: labels.uk });
```

Override a single string by spreading: `{ strings: { ...labels.uk, send: "Полетіли" } }`. Anything
a bundle leaves out falls back to English. The locale is **chosen by you, not sniffed from the
browser**. Plurals go through the bundle's own rule, so Slavic languages get all three forms,
including the 11–14 exception (`slavicPluralForm` is exported for custom bundles).

## Metadata collected

Automatically, no personal data: URL path, viewport and screen size, device pixel ratio, browser
and OS (parsed from the user agent), UI language(s), timezone, color scheme, reduced-motion, and up
to the last 20 `console.error` messages. Deliberately not collected: full user agent, IP, cookies,
storage, geolocation, or any DOM content beyond the screenshot pixels.

Reporter `identity` and `custom` fields are collected only when you explicitly configure them; by
default neither is present in the artifacts.

## The production checklist

Before pointing the widget at real users, walk this list. These are decisions that are **yours,
not the library's** — sluglist deliberately has no opinion about where your data lives, how long
you keep it, or what your privacy policy says.

1. **Turn on the production preset** (everything in the table above, at once).
2. **Gate the widget on your environment** — decide at build time whether it is even constructed:

   ```ts
   if (process.env.NEXT_PUBLIC_FEEDBACK === "on") {
     mountFeedbackWidget(createFeedbackWidget({ /* … */ }));
   }
   ```

   `enabled: false` also works at runtime, but environment gating is stronger: it keeps the code
   out of the paths you never intend to run it on.
3. **Generate and store a delivery token.** Your endpoint should reject any request without a
   matching bearer token, and refuse to start if the server has no token configured.
4. **Own the endpoint.** Never ship storage write-keys in the browser. Post to a thin route that
   owns the credentials, does the write, rate-limits, and — if you enable attachments — enforces a
   server-side mime whitelist and size cap (415 / 413).
5. **Decide retention.** The artifacts contain screenshots of your app as a user saw it; decide how
   long they live and who can read them.
6. **Add a privacy-policy paragraph.** Tell users what the "Report a problem" button collects; the
   [metadata list above](#metadata-collected) is the honest inventory to adapt.

The repository version of this checklist with the full endpoint example lives in
[`docs/production-checklist.md`](https://github.com/MiraWision/sluglist/blob/main/docs/production-checklist.md)
and [`examples/feedback-route.ts`](https://github.com/MiraWision/sluglist/blob/main/examples/feedback-route.ts).
