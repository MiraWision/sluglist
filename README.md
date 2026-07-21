# sluglist

> Universal embeddable feedback widget for dev and staging sites.

A framework-agnostic, dependency-light widget that lets people leave visual feedback directly on
a running web app: pick an element, grab an area or the full page, annotate the screenshot, add a
comment, and the widget produces a standard set of artifacts and hands them to pluggable
**connectors**. The core knows nothing about where feedback is stored; delivery is fully
encapsulated in the connector you provide.

## Install

```bash
npm install sluglist
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
});

mountFeedbackWidget(widget, {
  hotkey: "alt+shift+f",          // menu toggle; "" or null disables it
  position: "bottom-right",
  accentColor: "#18181b",
});
```

Only load it on dev/staging. In a production build, guard the import so the widget code is never
initialized.

## Capture modes

- **element** — hover to highlight, click to capture a single element (records its CSS selector)
- **fullpage** — the whole scrollable document
- **area** — drag a rectangle and crop to it
- **comment only** — no screenshot

Each screenshot can be annotated (arrow / box, color, undo) before sending, and an issue can carry
multiple screenshots.

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
