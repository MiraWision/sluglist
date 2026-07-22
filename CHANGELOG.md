# Changelog

## 1.2.0 — Renamed to snaglist

- **Package renamed `sluglist` → `snaglist`** (from a *snagging list*, the punch list of defects a
  client marks on handover). Install with `npm install snaglist`; import from `"snaglist"`. The
  standalone bundle now exposes the global `Snaglist` (`dist/snaglist.global.js`). No API changes.
- The old `sluglist` package is deprecated on npm and points here. Same code, same version line.

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
