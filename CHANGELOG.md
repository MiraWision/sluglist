# Changelog

## 1.7.0 — Format versioning + agent context

### Artifact format is now versioned + specified

- `session.yaml` starts with `format_version: "1.0"` (always the first line). Parsers treat a missing
  field as `"1.0"`. Within a major version the format only ever changes additively.
- New **[SPEC.md](SPEC.md)**: the full field dictionary (session.yaml + issue frontmatter), the
  `## Errors` / `## Actions` rules, and the versioning policy — every field verified against the
  generator. Safe to build parsers against.

### Agent context (three additive frontmatter signals)

- **`component`** — in element mode, a best-effort read of the nearest named React component from the
  element's fiber (no React dependency, fully guarded; `null` when absent/anonymous/minified). A direct
  pointer from a report to the source file.
- **Network failures in `## Errors`** — `fetch`/`XHR` wrappers record *only* requests that finish with
  status ≥ 400 or a network error: `network: POST /api/animals → 500 (240ms)`. Never bodies, headers or
  query strings. New `errors.captureNetwork` option (default true).
- **`sluglist.setContext({...})`** — attach runtime host state (tenant, feature flags, build version)
  to every subsequent issue as a `context` block. Same validation as `custom`; merges on repeat calls.
  Unlike `config.custom` (static at init), it reflects state at capture time.

### Domain

- Canonical site is now **sluglist.dev** (GitHub Pages via a `CNAME`); canonical/OG URLs, sitemap and
  package `homepage` updated. No breaking format or connector changes.

## 1.6.0 — Record mode: manual frames + recording attaches to the open draft

### Renamed back to `sluglist` (permanent)

The package, CLI (`npx sluglist dev`), default folder (`.sluglist/`), standalone global
(`Sluglist` / `dist/sluglist.global.js`), skill (`sluglist-fix`) and docs are now `sluglist` — the
final, permanent name (this supersedes the brief `snaglist` naming in 1.3.0). Install
`npm install sluglist`. Compatibility: `sluglist dev` still detects a legacy `.snaglist/` folder and
prints a one-time hint (it never renames your files), and the `sluglist-fix` skill falls back to a
`.snaglist/` folder when no `.sluglist/` exists. The `snaglist` package on npm is deprecated with a
pointer to `sluglist`.

### Manual frames while recording

- The recording bar gained a **`+ Frame`** button (and the **S** key outside text fields) to snap an
  extra frame at any moment — for states auto-capture misses (hover popovers, transient toasts).
  Manual snaps bypass the throttle but still respect `maxFrames`; `Recorder.snap()` is exposed.
- The recording bar now explains itself: "Frames auto-capture on clicks & navigation" under the
  frame counter, so it's clear what record mode is doing.

### Recording no longer replaces an open draft

- **Stop & describe** with a draft open (e.g. record mode started from `+ Add screenshot`) now
  appends the frames to that draft instead of discarding it — screenshots added before the recording
  are kept, and one issue ships both (`screenshots` + `frames_dir`, no format change).
- In the panel, a recording renders as a single stacked "deck" tile (tilted cards behind the first
  frame, red-dot `N frames` badge) next to the regular screenshots. Click expands the numbered frame
  ribbon; `×` drops the recording from the draft. Screenshots stay annotatable/removable, and
  `+ Add screenshot` remains available after a recording.
- Cancelling a recording that was started from an open draft returns to the draft unchanged.

### Other

- Menu reordered by expected frequency of use: Full page → Select area → Select element →
  Record steps → Comment without screenshot. The `1`–`5` hotkeys now follow the position
  automatically (no gaps when record mode is disabled).
- Screenshot consent now covers recording frames too: unchecking "Attach screenshot" sends the
  issue without frames as well (they are screenshots).

No breaking changes; no artifact format changes.

## 1.5.0 — Action trail + record mode

### Action trail (new)

- `config.actions` — a background ring buffer of the user's recent actions (clicks, SPA navigations,
  submits, typing), attached to each issue as a `## Actions` section (relative time) plus an additive
  `actions_count` frontmatter field. The twin of the error capture.
- **Hard PII rule (all modes):** the trail records the fact and place of an action, never entered
  content. `type` logs only a character count; password fields are not logged at all by default.
  Navigation paths drop the query string.

### Record mode (new)

- A `Record steps` menu item captures a frame (masked full-page screenshot) at the start and on each
  click / navigate / submit (not typing), throttled and capped. Frames link to the trail: `## Actions`
  lines gain a `— frame NN` suffix, turning an issue into automatic steps-to-reproduce with images.
- Additive format: `NN-slug-frames/NN.png` + `recording`/`frames_count`/`frames_dir` frontmatter +
  `frames: N` in the session index. `config.recording {enabled, maxFrames, frameMinInterval}`.
- The `snaglist dev` sidecar / `LocalConnector` accept a single `frames/` subfolder (still
  traversal-safe). The `snaglist-fix` skill now reads Actions as steps-to-reproduce and lines frames up
  with them.

### Other

- Default shortcut changed to **`Shift+F`** (was `Shift+Alt+F`). The focus guard still ignores it
  while typing in an input/textarea/contenteditable; override via `config.shortcut`.
- Updated the brand logo (favicon + docs). The widget button keeps its existing mark.

No breaking changes; all artifact additions are additive. `FeedbackConnector` unchanged.

## 1.4.0 — Local feedback loop, error capture, shortcut fix, brand logo

### Local feedback loop (new)

- **`snaglist dev` CLI** (`npx snaglist dev`): a local sidecar that writes feedback artifacts into a
  `.snaglist/` folder (`--dir` / `--port`). Binds to `127.0.0.1` only, path-traversal-safe, logs each
  file. Ships a `snaglist-fix` skill (`skills/snaglist-fix/`) that reads `.snaglist/` and fixes issues.
- **`LocalConnector`**: posts artifacts to the sidecar (default `127.0.0.1:4477`); warns once and stays
  out of the way when the server isn't running.

### Error capture (new)

- `config.errors` — a ring buffer fed by `console.error`, uncaught `error` events and
  `unhandledrejection`. Each issue gets a `## Errors` section (source + relative time) and an additive
  `errors_count` frontmatter field. `capture` / `bufferSize` / `captureWarnings` options.

### Shortcut

- **Fixed:** the default `Shift+Alt+F` never fired on macOS because matching used `event.key` (which is
  a dead/special char for Option+letter). Matching is now by physical `event.code`.
- `config.shortcut` (`"Shift+Alt+F"` string or `false`) with a proper parser and focus guard.

### Branding

- Adopted the snaglist brand logo across the favicon, docs header, and the widget button.

No breaking changes; all artifact additions are additive. `FeedbackConnector` unchanged.

## 1.3.0 — Renamed to snaglist + beta feedback mode

**Renamed `sluglist` → `snaglist`** (from a *snagging list*, the punch list of defects a client marks
on handover). Install `npm install snaglist`; import from `"snaglist"`; the standalone bundle exposes
the global `Snaglist` (`dist/snaglist.global.js`). The old `sluglist` package is deprecated and points
here.

New **beta feedback mode** for real users on a production beta (still one-way capture: no inbox,
statuses or replies). All additive and backward compatible:

- **Identity** — `config.identity: { userId, email, name }` → session-level `reporter` in `session.yaml`
  and each issue's frontmatter.
- **Custom fields** — `config.custom` (flat primitives) → `custom` block per issue. Validated at init:
  snake_case keys, non-primitives dropped with a warning, max 20 keys, values clipped to 200 chars.
- **PII masking** — `config.privacy.maskInputs` / `maskSelectors`; `[data-private]` is always masked.
  Values are redacted to solid blocks before the screenshot render and the live DOM is restored exactly
  (layout preserved). Additive `masked: true|false` in frontmatter.
- **Screenshot consent** — `config.privacy.screenshotConsent` adds an "Attach screenshot" checkbox
  (default checked); unchecking sends the issue with `screenshot: null`.
- **Preset** — `config.preset: "dev" | "beta"`. `beta` defaults `maskInputs` + `screenshotConsent` on
  and relabels the button "Report a problem"; any explicit option overrides the preset.
- **Examples** — `examples/HttpConnector.ts` + `examples/feedback-route.ts` (thin rate-limited endpoint)
  showing safe production delivery without exposing storage keys in the browser.

## 1.1.1 — Fix text annotation closing the editor

- Placing text on a screenshot no longer commits and closes the annotation
  editor. The text tool inserts its input under the cursor, so the browser's
  synthesized click resolved to the backdrop and tripped the click-to-close
  handler. Backdrop-close now requires the press to *start* on the backdrop
  (standard click-outside guard), matching arrow/box behavior.

## 1.1.0 — Non-blocking capture

- **Capture no longer blocks the panel.** Selecting an element, area or full page
  now opens the comment panel immediately with a loading placeholder, and the
  screenshot renders in the background. You can start writing your comment right
  away instead of waiting on a modal spinner.
- The comment field keeps focus and text while a shot finishes rendering; only
  the thumbnail row updates when it arrives.
- Sending waits for any still-rendering screenshot so it is never dropped.
- Removed the blocking capture overlay and its `capturingCancel` string.

## 1.0.0 — Initial public release

First published version. A framework-agnostic, embeddable visual feedback widget
for dev and staging sites.

### Capture

- Four modes: **element** (hover-highlight + click), **area** (drag a rectangle),
  **full page** (whole scrollable document), and **comment only**.
- Screenshots via `html-to-image`, loaded lazily on the first capture.
- Element capture crops the element out of a full-document render, preserving its
  real background (gradients, images, surrounding context).

### Annotation

- Arrow, box and text tools with a color picker and undo.
- Keyboard shortcuts (A / B / T, Ctrl/Cmd+Z, Esc, click backdrop to close).
- Annotations are flattened onto the screenshot at full resolution.

### Selectors & metadata

- Smart descriptive selectors: `data-testid`/`test`/`cy` → clean `id` →
  `aria-label`/`role` → landmark-anchored tag path. Never emits Tailwind utility
  or hashed (CSS Modules / styled-components) classes; skips auto-generated ids.
- Per-issue metadata: `selector_strategy`, `selector_unique`, `element_text`,
  `dom_path`, `screen`, plus session-level browser / OS / viewport / screen /
  DPR / language(s) / timezone / color-scheme / reduced-motion and buffered
  `console.error`s.

### Delivery

- Pluggable **connectors** (`FeedbackConnector.put`); the core never knows about
  storage. Built-in `MemoryConnector` and `DownloadConnector` (zip). Fan-out to
  several at once; failures retry with backoff and never block the UI.
- **Offline outbox**: undelivered artifacts are persisted to IndexedDB and
  retried on the next load.
- Stable, additive-only artifact contract: `session.yaml` index + one
  `NN-slug.md` (YAML frontmatter + comment) + screenshots per session.

### Integration

- Configurable button (position, accent), hotkey, categories, `onIssueCaptured`
  callback, mount `container`, and full string overrides (i18n).
- Style-isolated via shadow DOM; mountable anywhere (including a Chrome
  extension content script).
- Ships as ESM and CJS with TypeScript types.
