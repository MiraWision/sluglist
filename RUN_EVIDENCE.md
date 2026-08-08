# RUN_EVIDENCE — resilience, mobile, form fields, attachments, docs, i18n

Date: 2026-08-08. **Additive-only**; the `FeedbackConnector` contract is unchanged. Artifact format
`1.3 → 1.4` (minor, additive: `screenshot_failed`/`screenshot_error`, `form`, `attachments`).
**392 tests pass** (was 312 at the start of this iteration — 80 added), type-check clean, build clean,
landing page builds clean.

Every feature added here is optional. The headline check is Phase 7 run 1: a widget created with
**nothing but a connector** completes a whole issue with a clean console. That run is in
[`evidence/iteration-e2e/`](evidence/iteration-e2e/).

External artifacts:

| What | Where | Produced by |
|---|---|---|
| Browser × mode matrix + PNGs | [`evidence/capture-matrix/`](evidence/capture-matrix/) | Playwright over `evidence/capture-matrix-harness.html` |
| Fallback issues (throw / timeout / blank) | [`evidence/capture-fallback/`](evidence/capture-fallback/) | Playwright over `evidence/fallback-harness.html` |
| Zero-config + full-config + mobile run | [`evidence/iteration-e2e/`](evidence/iteration-e2e/) | Playwright over `evidence/iteration-e2e-harness.html` |
| Landing page, three-scenario section | [`evidence/landing-scenarios.png`](evidence/landing-scenarios.png) | built `docs/` |

---

## Phase 0 — Pre-flight audit

### 0.1 Screenshot pipeline — REAL, with no failure handling

| Surface | State as found | Decision |
|---|---|---|
| [`screenshot.ts`](src/screenshot.ts) `captureFullPage` / `captureElement` / `captureArea` | **REAL**. All three route through `withCaptureGuards` (rAF shim + a **60s** timeout). Full page used `toBlob`; element/area rendered the document to a canvas and cropped. | Timeout to 8s; full page now also goes through a canvas so blankness is checkable; every failure becomes one `CaptureFailedError` with a `reason`. |
| Failure handling in the UI | **MISSING in effect.** `captureIntoDraft` caught and `console.error`-ed, then decremented `pending`. The reporter saw the placeholder disappear and **no message at all** — an issue silently became comment-only with nothing recorded. | The catch now sets `screenshotFailed`/`screenshotError` on the draft, shows a toast, and the flags reach the frontmatter. |
| Blank / white render | **MISSING.** Nothing looked at the pixels; a silently white canvas shipped as a normal screenshot. | Heuristic added (see 1.2 — and the false-positive it nearly caused). |
| Record-mode frames ([`ui/record.ts`](src/ui/record.ts)) | **REAL**, `catch` → `console.error`, frame dropped silently, recording continued. | Kept the continue-on-failure behaviour, made it visible: `skippedFrames` + `frameFailed` on the action → `— frame skipped (render failed)` in `## Actions`. |
| Cross-origin images | **BROKEN** (found by measurement, not by reading) | See 1.3. |

### 0.2 Touch / mobile — one thing done, the rest untouched

| Surface | State as found |
|---|---|
| Checklist per-item issue button | **REAL** — v2 already detects `(hover: none)` and shows the button persistently (`.cl-issue-btn.touch`). |
| Capture modes on touch | **FACADE.** All five modes were offered. Element mode is `mousemove` + hover highlight — no hover, no highlight. Area mode is a pointer drag over an overlay competing with scroll. Record mode captures on click during touch-scrolling. |
| Panel at 360–390px | **PARTIAL.** A `@media (max-width: 480px)` block existed and made the panel full-width, but: no `max-height`, so a long panel grew off-screen; **the launcher rule targeted `.fab`, which is not the fixed element** (`.fab-wrap` is) — that rule had been dead since the dismiss ✕ was added; no safe-area inset; no 44px targets; 13px inputs (iOS zooms in on focus and never zooms back). |
| Kbd hints | Shown unconditionally, including on touch. |

### 0.3 Label registry — 174-line module, four hardcodes

`ui/strings.ts` held 78 keys, and `annotate.ts` was fully strings-driven. A grep for English literals
assigned to `textContent` / `placeholder` / `.title` / `.alt` / `aria-label` found **four leaks**, all in
`ui/mount.ts`: the area-mode hint (`"Drag to select an area. Esc to cancel."`), `` `Screenshot ${i+1}` ``
and `` `Frame ${i+1}` `` alt text, and `` `issue ${state.issue}` ``. All four now go through the registry
(`areaHint`, `imageAlt`, `frameAlt`, `checklistItemIssueLink`), and the grep is now an automated test —
see Phase 6.

### 0.4 README structure as found

`Install → Quick start → Capture modes → Connectors → Beta → Production → Checklist → Local loop →
Programmatic → Artifact format → Metadata → Errors → Actions/record → Notes`. Linear and complete, but
organised by *feature*, so a reader had to know what they wanted before the page helped them. The quick
start was a 25-line block with five options in it.

### 0.5 Issue panel structure

`panelTitle → panelContext → thumbs → chips → textarea → consent → actions`. Custom fields go above
(session block) and below the comment (issue block); attachments join `thumbs`, which already handled
mixed tiles (screenshots, pending spinners, recording clip decks) and had per-tile remove buttons — so
attachment tiles slot in with no new layout. **No `paste` or `drop` handlers existed anywhere.**

### 0.6 Example endpoint

`examples/feedback-route.ts` — REAL and thorough (401/413/415/429/400/409), but `ALLOWED_MIME` was
exactly the three types the core produces. Any attachment would have been rejected 415. Extended in
Phase 4.

---

## Phase 1 — Cross-browser capture resilience

### 1.1 The matrix

Harness: [`evidence/capture-matrix-harness.html`](evidence/capture-matrix-harness.html) — one page built
out of the known DOM-to-canvas failure modes: a webfont, a **cross-origin image with CORS and one
without** (served from a second local origin, `evidence/cross-origin.mjs`), `filter` +
`backdrop-filter`, emoji, `position: fixed`, and 700px of filler so full-page means full-page.

Engines are real builds driven by Playwright — **Safari was exercised through WebKit 26.5, the engine
Safari ships**, not skipped and not assumed.

| | Chromium 151 | Firefox 153 | WebKit 26.5 (Safari) |
|---|---|---|---|
| fullpage | ✅ 84ms | ✅ 93ms | ✅ 101ms |
| area | ✅ 50ms | ✅ 56ms | ✅ 51ms |
| element | ✅ 49ms | ✅ 55ms | ✅ 51ms |
| record (3 frames) | ✅ | ✅ | ✅ |
| annotate (canvas round-trip) | ✅ | ✅ | ✅ |
| webfont text | ✅ | ✅ | ✅ |
| emoji | ✅ | ✅ | ✅ |
| `position: fixed` | ✅ once, at top | ✅ | ✅ |
| CSS `filter` | ✅ | ✅ | ✅ |
| `backdrop-filter` | ⚠️ dropped | ⚠️ dropped | ⚠️ dropped |
| cross-origin img **with** CORS | ✅ | ✅ | ✅ |
| cross-origin img **without** CORS | ⚠️ blank, rest of page fine | ⚠️ blank | ⚠️ blank |

Raw numbers and per-mode PNGs: [`evidence/capture-matrix/results.json`](evidence/capture-matrix/results.json).

Verdict per failing case:

| Case | Verdict |
|---|---|
| Cross-origin image without CORS killed **every** capture | **Fixed** — see 1.3 |
| `[object Event]` as the recorded error message | **Fixed** — `describeRenderError` |
| `backdrop-filter` not rendered | **Documented** (README → Notes and limits). Not fixable: it depends on what is painted behind the element, which a cloned subtree does not have. |
| Cross-origin image without CORS renders blank | **Documented.** The browser will not hand over pixels it refuses to read. The rest of the page captures. |
| WebGL / `<canvas>` / video | **Documented** (pre-existing limit, unchanged) |

*One fixture note, in the interest of honesty:* the first Firefox run showed both cross-origin images
blank. That was **my test fixture, not sluglist** — the inline 4×4 PNG I generated was malformed, and
Firefox refuses malformed PNGs that Chromium and WebKit decode anyway. Replaced with a valid 8×8 stream;
the row above is from the corrected run.

### 1.2 Graceful fallback

Any failed render → the issue is **never blocked**. The reporter keeps everything typed, sees
*"Screenshot failed — sending without it"*, and the issue is delivered comment-only with
`screenshot_failed: true` and a scrubbed `screenshot_error`.

Driven through the **real widget UI in a real browser**, with the failure injected at the browser
boundary (not by stubbing sluglist), so the shipped code path runs:

| Scenario | Injection | Result | Artifact |
|---|---|---|---|
| Renderer throws | `HTMLCanvasElement.toBlob` throws | issue delivered, `screenshot: null`, `screenshot_error: "injected: canvas encode refused"` | [`render-throw.md`](evidence/capture-fallback/render-throw.md) |
| Timeout | `toBlob` never calls back | fallback fired at **8000ms**, `screenshot_error: screenshot render timed out after 8000ms` | [`timeout.md`](evidence/capture-fallback/timeout.md) |
| Blank canvas | every sampled pixel forced identical | `screenshot_error: screenshot render produced a blank image` | [`blank-canvas.md`](evidence/capture-fallback/blank-canvas.md) |

In all three: 2 files delivered (`.md` + `session.yaml`), toast shown, panel closed normally.

**The blank heuristic had to be sharpened — and this is the STOP-condition compromise, reported.** The
brief specified "> 98% single-colour pixels". Implemented literally, the very first end-to-end run
**false-positived on its own harness**: a short checkout card on a white page is ~99% one colour, and a
perfectly good screenshot was being thrown away. Discarding a real screenshot is worse than the failure
the check exists to catch. The rule is now **two conditions**: dominant colour > 98% **and** at most 4
distinct colours in a 128×128 sample. A failed render is one flat fill; any real page has hundreds of
shades, because downscaling blends every glyph edge into its own. Both parts are tested, including the
sparse-light-page case that motivated the change (`test/capture-fallback.test.ts`).

The other half of that compromise: **8s cannot distinguish a hang from a slow success.** It is a
judgement that a render still running after 8s is far more often a webfont that will never resolve than
a page that would have finished at 9s. The cost of being wrong is bounded and visible (one comment-only
issue that says why), and `capture: { timeoutMs }` is the escape hatch for genuinely heavy pages.

Blank detection runs on **full-page captures only**, not element/area crops: a solid-colour button or a
dragged area over empty space is a legitimate screenshot.

### 1.3 The fix worth having

**One cross-origin image without CORS headers failed every capture mode, in every engine.**

Measured, not assumed: the first matrix run returned `ok: false` for fullpage, area *and* element, with
the useless message `[object Event]`. Removing the single offending `<img>` made all three pass. The
cause: html-to-image rejects the whole render when a cloned `<img>` fires `error`, and that fires for
every cross-origin image served without `access-control-allow-origin` — which describes CDN avatars,
third-party badges and analytics pixels on a large share of real pages.

Fixed in [`screenshot.ts`](src/screenshot.ts) with `onImageErrorHandler` + a transparent
`imagePlaceholder`: the unreadable image comes out blank, everything else on the page is captured. A
screenshot with one gap beats no screenshot.

Also fixed: `describeRenderError` turns a DOM `Event` rejection into `failed to load image <src>`
instead of `[object Event]`, so the frontmatter says something a week later.

---

## Phase 2 — Mobile graceful mode

Deliberate subtraction, keyed on **`(pointer: coarse)` / `(hover: none)`**, never on the user agent — a
touch laptop keeps the full desktop UI.

| Decision | Why |
|---|---|
| Menu = full page + comment only | Element mode is hover-driven; area mode needs a drag the browser spends on scrolling |
| Record mode hidden | Frames captured mid-touch-scroll are unreadable; deferred, not shipped bad |
| Kbd chips hidden (launcher, menu, `+ Add screenshot`, `+ Frame`) | No keyboard to hint at |
| `.fab-wrap` bottom = `calc(16px + env(safe-area-inset-bottom))` | **Fixes a dead rule**: the old one targeted `.fab`, which stopped being the fixed element when the dismiss ✕ landed |
| Panel `max-height: calc(100vh - 80px)` + `overflow-y: auto` | A bottom-anchored panel with a form grew off-screen |
| 44px minimum targets, 92×68 thumbnails | A finger-sized ✕ would otherwise swallow a 76px thumbnail |
| 16px inputs and textarea | Below 16px iOS zooms in on focus and never zooms back — it strands the reporter mid-report |
| `scrollIntoView` on textarea focus (300ms after) | The keyboard covers exactly where a bottom-anchored panel puts it |

Emulated iPhone 14 Pro (390pt, DPR 3, touch), production preset + form + Ukrainian labels:

- Menu contains exactly `["Знімок усієї сторінки", "Коментар без знімка"]` —
  [`mobile-menu.png`](evidence/iteration-e2e/mobile-menu.png)
- Full flow completes (fullpage + form + send) — [`mobile-panel-uk.png`](evidence/iteration-e2e/mobile-panel-uk.png),
  [`mobile-issue.md`](evidence/iteration-e2e/mobile-issue.md)
- Console clean.
- Checklist v2 regression (report button visible without hover on touch) covered in
  `test/mobile.test.ts`.

---

## Phase 3 — Reporter form fields

`scope: "session"` is asked once, on the first issue, and lands in `session.yaml`; `scope: "issue"` is
asked every time and lands in the issue frontmatter. Both verified end to end:

```yaml
# evidence/iteration-e2e/full-session.yaml
form:
  email: "anna@client.com"
  device: "iPhone 15, Safari"

# evidence/iteration-e2e/full-issue.md
form:
  severity: "блокує"
```

Second issue of the same session: `sessionRows: 0, issueRows: 1` — the session block is not asked again
([`results.json`](evidence/iteration-e2e/results.json)).

- `required` blocks sending, highlights the row, shows one message; nothing is captured or delivered
  (asserted against the mounted panel, `test/form.test.ts`).
- `email` is pattern-checked; values clipped at 500 chars; max 8 fields; invalid fields dropped with a
  warning and the widget keeps working.
- **No `form` configured → the panel is byte-identical to before**: both containers are empty and
  `display: none`, zero `.form-row` nodes (asserted).
- **Form values are never scrubbed**, including under the production preset (asserted). A reporter
  typing their address into a field labelled *Your email* is telling it to you on purpose; scrubbing it
  would defeat the field. The scrub stays on page-derived text.

Session answers are written **before** the capture, so the `session.yaml` that ships with the first
issue already carries them.

---

## Phase 4 — Attachments

Three intake paths, all verified in a real browser against the shipped bundle:

| Path | Result |
|---|---|
| File picker | `.attach-file` opens a native picker with the whitelist as `accept` |
| Drag & drop onto the panel | verified (used to exercise the rejections below) |
| **Paste (Cmd/Ctrl+V)** | verified with a real `ClipboardEvent` carrying a PNG `File` — the headline case, a screenshot from a phone or an email |

Artifact from the paste run ([`full-issue.md`](evidence/iteration-e2e/full-issue.md)):

```yaml
attachments:
  - file: 01-znizhka-ne-vrahovu-tsya-u-p-dsumkov-i-att-01.png
    mime: image/png
    size: 4164
    original_name: IMG_4021.png
```

The reporter's own file name is **never** a path — it is kept as data (`original_name`) and the file is
named after the issue, so a hostile name cannot become a traversal.

Rejections, with the messages the reporter actually saw (Ukrainian bundle, from the live run):

| Input | Message |
|---|---|
| `setup.exe` | `setup.exe: такий тип файлу не приймається` |
| `logs.zip` | `logs.zip: такий тип файлу не приймається` |
| 11MB `clip.mp4` | `clip.mp4 важить 11 MB — ліміт 10 MB` |
| 6th file | `Можна прикріпити щонайбільше 5 файлів…` (unit-tested) |

Checked on **both** extension and mime, so a renamed binary declaring `image/png` is refused.
**Executables and archives are refused even through `accept`** — an archive is opaque to every check
downstream. No client-side compression: an oversized phone video is an honest error.

Attached images join the thumbnail row and **annotate exactly like a capture** (same `annotateBlob`
path), so you can put arrows on the client's own screenshot. Non-images render as a type/name/size tile.

Preset behaviour (asserted against the mounted panel):

| Config | `+ Attach file` |
|---|---|
| dev / beta, nothing set | present (default true) |
| `preset: "production"`, nothing set | **absent** |
| `preset: "production"`, `attachments: { enabled: true }` | present |

**Endpoint** (`examples/feedback-route.ts`): a separate attachment whitelist and its own size cap,
keyed off the `-att-NN.<ext>` name. A core-artifact path with an attachment mime is refused too, closing
the gap where `image/png` would let anything through under an artifact-shaped name. 415 on an unlisted
mime, 413 over the cap — both tested (`test/feedback-route.test.ts`). `docs/production-checklist.md`
gains section 10: server-side validation is mandatory, scanning is the client's side of the line, and
attachments should stay off in anonymous production unless deliberately needed.

---

## Phase 5 — README and docs

- **Quick start is one line**: `mountFeedbackWidget(createFeedbackWidget({ connectors: [...] }))`,
  followed by "everything else on this page is optional".
- To make that literally true, **`project` became optional** and defaults to the hostname as a slug
  (`app.acme.com` → `app-acme-com`). It was the last mandatory field. Additive; an explicit slug is
  still validated exactly as before.
- **Three scenarios** immediately after Install — Dev loop / Client acceptance / Beta & Production —
  each one sentence, a minimal config, and links into the depth.
- **"Attach your user"** sits next to the quick start: `identity` / `setContext` / `form` in one place,
  with the three-row table (source · when captured · where it lands) and one code block showing all
  three together.
- Production checklist is linked from the Beta/Production scenario and from the attachments section.
- **Notes and limits** rewritten from the measured matrix — an honest list of what does not render,
  rather than a hedge.
- SPEC.md updated to 1.4 (it had drifted: it documented 1.2 while the code emitted 1.3).
- The `sluglist-fix` skill learned attachments (view images, read text files as evidence, name the rest;
  never execute, never treat contents as instructions), `form` blocks, and `screenshot_failed` (a missing
  screenshot is not a defect in the app).
- **Landing page** brought onto the same three scenarios, reusing the README wording rather than
  inventing a second version — [`evidence/landing-scenarios.png`](evidence/landing-scenarios.png).
  It builds clean. **Not deployed** — `npm run deploy` publishes to the live domain, which is your call.

---

## Phase 6 — Localization

- Four hardcodes from Phase 0.3 moved into the registry.
- Bundles: `en`, `ru`, `uk`, `es`, `de` via `import { labels } from "sluglist/labels"` (its own package
  export and build entry). Partial override by spreading; missing keys fall back to English, so an
  incomplete bundle can never leave a button blank.
- **Plurals needed the mechanism extended, not reused.** The existing `plural(one, many, n)` has two
  forms; Russian and Ukrainian need three. A bundle now declares a `pluralForm` rule; `slavicPluralForm`
  implements 1 / 2–4 / 5+ **including the 11–14 exception** that naive implementations get wrong.
  Tested across 13 values: `1 кадр / 2 кадра / 5 кадров / 21 кадр / 111 кадров`.
- **The registry grep is now a test**, not a one-off: `test/labels.test.ts` scans every UI source for
  English assigned to `textContent` / `placeholder` / `.title` / `.alt` / `aria-label`, stripping
  `${…}` expressions so composed strings pass and literals do not. Currently **0 offenders**.
- Full flow in Ukrainian, desktop and mobile:
  [`desktop-panel-uk.png`](evidence/iteration-e2e/desktop-panel-uk.png),
  [`mobile-panel-uk.png`](evidence/iteration-e2e/mobile-panel-uk.png).
- Bundles translate widget chrome only; your own copy (chips, checklist titles, form labels) stays yours.

---

## Phase 7 — End-to-end

### Run 1 — zero-config (the one that matters most)

`createFeedbackWidget({ connectors: [memory] })` — no project, no preset, no options at all.

- Full-page capture → panel → comment → send: **issue delivered with its screenshot**
  (`01-…png`, `01-…md`, `session.yaml`).
- **Console completely clean** (`"console": []` in
  [`results.json`](evidence/iteration-e2e/results.json)).
- Defaults observed: hostname-derived project, all five capture modes, no consent checkbox, no dismiss
  ✕, attachments on, no form block, English labels.
- Artifacts: [`zero-config-issue.md`](evidence/iteration-e2e/zero-config-issue.md),
  [`zero-config-session.yaml`](evidence/iteration-e2e/zero-config-session.yaml).

This run is also a unit test (`test/capture-fallback.test.ts` → "zero-config init"), so a future option
cannot quietly make itself mandatory.

### Run 2 — everything on

Production preset + form fields + attachments (explicitly enabled) + `labels.uk`, desktop then mobile:
paste-attachment, three rejections, form filled, issue delivered with screenshot + attachment, second
issue skipping the session block, mobile flow at 390pt. Console clean throughout. All covered above.

---

## Scope deferrals — honoured

Not attempted, by instruction: full mobile element/area/record (graceful degradation only), client-side
compression or transcoding, executables/archives in attachments (never, not even via `accept`), content
scanning (the client's server-side concern, noted in the production checklist), an artifact viewer,
GitHub/Slack connectors, an `enrich` hook, and browser-language autodetection (the locale is the
developer's choice).

## One environment note

Node 25 defines its own `globalThis.localStorage` stub, which shadows jsdom's and made 23 pre-existing
tests fail locally (CI runs Node 20 and never saw it). Repaired in `test/setup.ts` — test-environment
plumbing, not product code.

## Open — needs your call

- **npm publish.** Additive minor: `1.10.0 → 1.11.0`. CHANGELOG written. Not published.
- **Landing deploy.** `docs/` builds clean; `npm run deploy` publishes to sluglist.dev. Not run.
