# RUN_EVIDENCE — snaglist (rename + beta feedback mode)

External, verifiable artifacts for each phase. Self-report without artifacts = task not done.

---

## Phase 0 — Pre-flight audit

Date: 2026-07-22. Repo: `~/Documents/dev/libs/sluglist` (to be renamed).

### 0.1 npm state

```
$ curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/snaglist
404                     # snaglist is FREE → no STOP
$ npm view sluglist version
1.1.1                   # current published name/version
```

### 0.2 Occurrences of `sluglist` (grep -ri, excluding node_modules/dist/.git)

| File | count | kind |
|---|---|---|
| `package.json` | 7 | name, keywords, unpkg/jsdelivr, homepage, repo url |
| `README.md` | 7 | title, demo link, install, `<script>` unpkg, `Sluglist` global, import |
| `tsup.config.ts` | 3 | IIFE entry key + `globalName: "Sluglist"` + output filename |
| `docs/src/App.tsx` | 5 | landing copy, links |
| `docs/src/components/Demo.tsx` | 3 | demo import + copy |
| `docs/vite.config.ts` | 3 | `base: "/sluglist/"`, alias |
| `docs/index.html` | 1 | `<title>` |
| `docs/package.json` | 2 | name, gh-pages deploy |
| `package-lock.json` | 2 | own name (regenerate after rename) |
| `docs/package-lock.json` | 2 | own name (regenerate after rename) |

Not present in `CHANGELOG.md` (uses generic wording) or `.github/workflows/ci.yml` (generic `npm` commands, no package name). Other external pointers:

- git remote: `git@github.com:MiraWision/sluglist.git` (repo rename → redirects; **GitHub Pages does not redirect** → new URL `mirawision.github.io/snaglist`).
- IIFE global object name: `Sluglist` → `Snaglist`.

### 0.3 Config structure (`src/types.ts` → `FeedbackWidgetConfig`)

Current fields: `connectors`, `enabled?`, `offlineQueue?`, `project`. New optional fields land here additively:
`identity?`, `custom?` (Phase 2), `privacy?` (Phase 3), `preset?` (Phase 4). Artifact builder
(`src/artifacts.ts`) already appends fields only-when-present via `yamlLine`/`yamlMap`, so `reporter`,
`custom`, `masked` are additive. Identity is fixed at init → `reporter` belongs in `session.yaml`
(session-level) and mirrors into each `NN-issue.md` frontmatter.

### 0.4 Screenshot pipeline & masking mechanics (**decision required — see below**)

Render path: `src/screenshot.ts` calls `html-to-image` (`toCanvas`/`toBlob`) on `document.documentElement`
(full document) then crops. Findings about the clone step:

- html-to-image **does** clone internally (`cloneNode`), BUT:
  - it exposes **no `onclone`/clone hook** (`grep onclone` in dist → 0 hits; Options type has only
    `filter`, `style`, `backgroundColor`, `pixelRatio`, …).
  - its clone **reads from the live original**: `getComputedStyle(nativeNode)` for styles and
    `cloneInputValue(nativeNode, clonedNode)` for form values (`clonedNode.setAttribute('value', nativeNode.value)`,
    textarea `innerHTML = nativeNode.value`, select marks the chosen option).
  - a **detached** clone we build ourselves has no computed styles, so we cannot hand html-to-image a
    pre-masked clone.
- The codebase **already** uses transient live-DOM mutate-and-restore during capture:
  `revealAnimationHiddenElements()` in `screenshot.ts` temporarily sets `opacity/filter/transform` on live
  nodes for the render and restores exact inline values in a `finally`.

**Conclusion:** masking cannot be applied to html-to-image's internal clone. Per the task STOP condition,
options for masking without a persistent live-DOM change (all satisfy the acceptance test
`innerHTML before == after`):

- **Option A — transient value masking + guaranteed restore (recommended).** Before render, replace PII
  element content/values with a placeholder (█ sized to text, or a fill block) on the live node; capture;
  restore exact prior state in `finally`. Same proven mechanism as `revealAnimationHiddenElements`. Smallest,
  highest-fidelity. Tradeoff: the live DOM is briefly mutated during the sub-second capture (a page
  `MutationObserver` could observe it); crash-safe via `finally`.
- **Option B — overlay boxes.** Append one fixed-position container of opaque boxes positioned over each PII
  element's rect (rendered on top by html-to-image), capture, remove the container. PII nodes themselves are
  never touched; only a sibling container is added then removed. Tradeoff: box placement must track rects
  exactly; scroll/transforms edge cases.
- **Option C — full manual clone + offscreen render.** Deep-clone the subtree into an isolated container,
  copy computed styles, mask on the clone, render that. Reimplements html-to-image's clone; high effort and
  fidelity risk. Not recommended.

> **STOP (Phase 3):** awaiting the masking-approach decision before implementing PII masking.
> Phases 1 (rename) and 2 (identity/custom) are independent and proceed.

---
## Phase 1 — Rename sluglist → snaglist

### 1.1 Local rename (done, committed `d8ae832`)

```
$ grep -rn -i sluglist . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
README.md:7:> **Renamed from `sluglist`.** ...        # allowed (Renamed-from note)
README.md:9:> Run `npm install snaglist`. The old `sluglist` ...
RUN_EVIDENCE.md: ...                                  # this evidence file
```
→ 0 matches outside the README "Renamed from" note + this evidence file. package.json diff: name,
version 1.1.1→1.2.0, unpkg/jsdelivr → `snaglist.global.js`, repo/bugs/homepage URLs, keywords
(−sluglist +snaglist +snagging +beta feedback). tsup IIFE `globalName: "Snaglist"`, entry
`snaglist.global.js`. Docs: base `/snaglist/`, alias, landing copy, title. Lockfiles regenerated.

```
$ npm run type-check    # clean
$ npm test              # Test Files 6 passed (6) / Tests 42 passed (42)
$ npm run build         # dist/snaglist.global.js 154.95 KB; index.{js,cjs,d.ts} emitted
```

### 1.2 External (done by me)

```
$ gh repo rename snaglist --repo MiraWision/sluglist --yes
$ gh repo view MiraWision/snaglist -q '.name + " " + .url'
snaglist https://github.com/MiraWision/snaglist
$ git remote set-url origin git@github.com:MiraWision/snaglist.git && git push origin main
  c61b061..d8ae832  main -> main
$ cd docs && npm run deploy       # gh-pages → https://mirawision.github.io/snaglist  (Published)
```

### 1.3 npm publish + deprecate (PENDING — user runs, 2FA/OTP-gated)

```
# to run:
npm publish --access public --otp=<code>          # snaglist@1.2.0
npm deprecate sluglist "Renamed to snaglist — npm install snaglist" --otp=<code>
# verify (outputs to be pasted here):
npm view snaglist version        # expect 1.2.0
npm install sluglist             # expect deprecation warning
```

---
## Phase 2 — Identity + custom fields

Config gains `identity?: {userId,email,name}` and `custom?: Record<string, string|number|boolean>`
(both optional, fully back-compatible). Validated once at init (`src/reporter.ts`):
keys → snake_case, non-primitive/array/null/NaN values dropped with `console.warn`, ≤20 keys,
string values clipped to 200 chars. `reporter` is session-level (`session.yaml`) and mirrored into
each issue; `custom` per issue. All emission is additive (omitted when unconfigured, `null` when
configured-but-empty), so existing byte-exact fixtures are untouched.

### 2.1 Tests

```
$ npm run type-check     # clean
$ npm test               # Test Files 7 passed (7) / Tests 60 passed (60)
```
New: `test/reporter.test.ts` (13 — normalize identity/custom, snake_case, nested-object drop with
warning, 20-key cap, 200-char clip, null/undefined semantics); `test/artifacts.test.ts` +5 (reporter/
custom present, null, omitted, session-level reporter); `test/capture.test.ts` +1 (end-to-end: identity
+custom through `createFeedbackWidget` → `session.yaml` + issue frontmatter, nested `custom.meta` dropped
with warning). Existing 42 format/fixture tests unchanged.

### 2.2 Real emitted artifact (via `dist`, node)

```yaml
# NN-issue.md frontmatter (identity + custom configured)
id: "01"
url: /checkout
selector: null
mode: fullpage
viewport: 1512x982
screenshot: 01-x.png
created_at: 2026-07-22T10:00:00Z
reporter:
  user_id: u_18293
  email: "user@example.com"
  name: Anna K.
custom:
  plan: pro
  app_version: 2.4.1        # note: appVersion → app_version
  seats: 5
```
```yaml
# session.yaml carries the session-level reporter
project: acme
session_id: session-2026-07-22-ab12
...
device_pixel_ratio: 2
reporter:
  user_id: u_18293
  email: "user@example.com"
  name: Anna K.
issues: []
```

---
## Phase 3 — PII masking + consent

Chosen approach: **Option A** (transient live-DOM mask + guaranteed restore) — html-to-image can't
mask its internal clone (Phase 0). New `src/mask.ts`: `applyMask(privacy)` collects targets
(`[data-private]` always; `input,textarea,select` when `maskInputs`; `maskSelectors`), turns each
into a solid redacted block (`color: transparent !important` + flat fill) and returns
`{ count, restore() }`. Restore writes back the **entire prior `style` attribute** (or removes it),
so the live DOM is byte-identical. Config: `privacy: { maskInputs?, maskSelectors?[], screenshotConsent? }`.
Consent checkbox "Attach screenshot" (default checked) in the issue form; unchecked → `screenshot: null`.
Additive `masked: true|false` in frontmatter (emitted only when privacy is configured).

### 3.1 Tests (jsdom)

```
$ npm test    # Test Files 8 passed (8) / Tests 68 passed (68)
```
New `test/mask.test.ts` (7): maskInputs gating, `[data-private]` always, maskSelectors, widget-UI
excluded, **innerHTML byte-identical after restore** (incl. pre-existing inline style, and no stray
`style=""`), idempotent restore. `test/artifacts.test.ts` +1: `masked` emitted only when defined.

### 3.2 Visual before/after (real html-to-image render)

Harness `evidence/mask-harness.html` (form with name, email, card `4242 4242 4242 4242`, plan select,
and a `data-private` note) served via `evidence/serve.mjs`, driven in a real browser:

```js
> await window.run()
{ maskedCount: 5, identicalAfterRestore: true }   // 3 inputs + 1 select + 1 data-private
```

- **Before:** [`evidence/mask-before.png`](evidence/mask-before.png) — all values legible.
- **After:** [`evidence/mask-after.png`](evidence/mask-after.png) — every value is a solid redacted
  block; **labels still visible, layout unchanged** (same box sizes/positions). 924×669 @ DPR 2.
- `identicalAfterRestore: true` → live DOM innerHTML is unchanged after capture.

Reproduce: `node evidence/serve.mjs` → open `http://localhost:5175/` → run `window.run()`.

---
## Phase 4 — Beta preset + positioning

- `config.preset: "dev" | "beta"` (default dev). `src/preset.ts` `resolvePrivacy()` gives beta the
  defaults `{ maskInputs: true, screenshotConsent: true }`; any explicit `privacy` option overrides
  it. The resolved privacy is exposed on `core.config.privacy` (read by the UI). Beta relabels the
  button to "Report a problem" unless `strings.buttonLabel` is set.
- README: new **Beta feedback mode** section (config example with preset + identity + custom + the
  "never ship storage write-keys" warning) and an explicit **Scope** paragraph (no inbox / statuses /
  threads / replies / accounts — one-way capture by design). "Metadata collected" updated: identity
  is collected only when configured.
- `examples/`: `HttpConnector.ts` (client) + `feedback-route.ts` (~50-line Next.js route with per-IP
  rate limiting + payload validation) + `examples/README.md` with the write-key warning.
- Landing: new "Report a problem" beta section + nav link (`docs/src/App.tsx`).

### 4.1 Tests + compile

```
$ npm test                                   # Test Files 9 passed (9) / Tests 75 passed (75)
$ npx tsc --noEmit -p tsconfig.examples.json # exit 0  → examples compile
$ npm run build                              # dist/snaglist.global.js emitted (v1.3.0)
$ (docs) npm run build                       # ✓ built in ~23s
```
New `test/preset.test.ts` (7): dev→undefined privacy; beta→maskInputs+consent; explicit
`maskInputs:false` overrides beta; `core.config.privacy` reflects the resolved preset. The live
beta-preset UI (masking + consent checkbox + label) is exercised in Phase 5.

---
## Phase 5 — E2E + known limitations

E2E harness `evidence/beta-e2e.html`: mounts the **real widget** via `preset: "beta"` + `identity` +
`custom`, into a page with a PII form (name / email / card) and a `data-private` note, delivering to a
`MemoryConnector`. Driven through the actual UI (fab → full page → comment → send) for three issues,
one with the consent checkbox unchecked. Full artifacts in [`evidence/e2e/`](evidence/e2e/).

Verified end-to-end:

- Button label is **"Report a problem"** (beta preset).
- Session `session-2026-07-22-4850` has 3 issues; files: `01…png`, `01…md`, `02…png`, `02…md`,
  `03…md`, `session.yaml` — **no `03…png`** (consent off → PNG not created).
- **`session.yaml`** carries the session-level `reporter` block.
- **01 & 02** frontmatter: `screenshot: <png>`, **`masked: true`**, `reporter`, `custom`
  (`app_version` from `appVersion`).
- **03** (consent unchecked): **`screenshot: null`**, no `masked`, still has `reporter` + `custom`.
- The widget's own full-page capture is redacted: [`evidence/e2e/01-header-overlaps-the-nav.png`](evidence/e2e/01-header-overlaps-the-nav.png)
  shows every form value as a solid block, labels intact.
- Phase-3 standalone masking evidence: [`evidence/mask-before.png`](evidence/mask-before.png) /
  [`evidence/mask-after.png`](evidence/mask-after.png).

### Test suite (full)

```
$ npm run type-check     # clean
$ npm test               # Test Files 9 passed (9) / Tests 75 passed (75)
$ npm run build          # ESM + CJS + IIFE (dist/snaglist.global.js), types
```

### Known limitations

- **Masking is declarative only** (inputs + `data-private` + `maskSelectors`); no content-based PII
  autodetection (out of scope by design).
- Masking mutates the live DOM transiently during the capture (Option A) and restores it exactly; a
  page `MutationObserver` could observe the momentary change. html-to-image exposes no clone hook, so
  a zero-mutation clone-only approach is not available (Phase 0).
- Screenshot fidelity follows html-to-image (WebGL / some cross-origin content may not render). In the
  headless preview a full-page capture takes ~12 s (rAF is shimmed through `setTimeout`); real browsers
  are much faster.
- Rate limiting / auth live in the delivery endpoint (see `examples/`), never in core.
- No inbox / statuses / replies / accounts — one-way capture by design.

---

## Rollout & release status

- **npm:** `snaglist@1.3.0` publish + `npm deprecate sluglist` are **pending the user** (2FA/OTP).
  Commands in §1.3. Once run, paste `npm view snaglist version` + the `npm install sluglist`
  deprecation warning here.
- **GitHub/docs (done):** repo renamed to `MiraWision/snaglist`, docs live at
  `https://mirawision.github.io/snaglist`.
- **TruGenix:** switch the dependency `sluglist` → `snaglist` and the import string after 1.3.0 is on
  npm.

---
---

# v2 — local loop + error capture + shortcut fix + favicon

## Phase 0 — Pre-flight audit

Date: 2026-07-22. Repo `~/Documents/dev/libs/sluglist` (package `snaglist@1.3.0`).

| Area | Verdict | Detail |
|---|---|---|
| Error capture | **REAL-PARTIAL** | `src/ui/console-buffer.ts` patches only `console.error` (ring buffer 20, calls original, drops `[feedback-widget]` lines). Installed at UI mount; `CaptureIssueInput.consoleErrors` → body `## Console errors` (```code blocks```), fixture `test/fixtures/02-with-console-errors.md`. MISSING: `window 'error'`, `unhandledrejection`, per-record source, relative time, `errors_count` frontmatter, `## Errors` section, init-at-widget-init, `config.errors`. |
| Shortcut | **BUG CONFIRMED** | `matchesHotkey` (`src/ui/mount.ts:117`) compares `event.key.toLowerCase() === key`. On macOS `Shift+Option+F` sets `e.key` to a dead/special char (never `"f"`) → never matches. Focus guard `isEditableTarget` exists (composedPath + input/textarea/isContentEditable). Config today is `uiConfig.hotkey` (`"alt+shift+f"`), not core `config.shortcut`. |
| Landing head | **MISSING** | `docs/index.html` head = title + description only; no favicon/icons/OG. Vite `base: "/snaglist/"`. |
| CLI infra | **MISSING** | No `bin` field, no CLI. `tsup.config.ts` has 2 browser-oriented entries (ESM/CJS + IIFE). Need a 3rd Node-only entry for the CLI, kept out of the browser bundle (not imported by `src/index.ts`). |
| HttpConnector | **EXAMPLE-ONLY** | Lives in `examples/HttpConnector.ts`, not core. Core connectors: `download`, `memory`. `LocalConnector` will reuse its base64-POST pattern with a fixed `127.0.0.1:{port}` URL. |

Format decisions (kept additive on the contract): frontmatter gains `errors_count` only; existing
fields unchanged. The **body** `## Console errors` section is replaced by the spec's richer `## Errors`
(source + relative time) — an explicit Phase 3 deliverable, not an accidental break; the one affected
fixture is updated. `FeedbackConnector` contract is untouched.

## Phase 1 — Shortcut fix + config

**Cause (confirmed):** `matchesHotkey` compared `event.key.toLowerCase() === "f"`. On macOS
`Shift+Option+F` sets `event.key` to a special char (harness log below shows `key="ƒ"`), so the
comparison `"ƒ" === "f"` is always false and the widget never opened. Fix: match the physical key by
`event.code === "KeyF"` (layout- and modifier-independent) + exact `shiftKey/altKey/ctrlKey/metaKey`.

New `src/shortcut.ts`: `parseShortcut` (modifiers + one letter/digit → `{code, shift, alt, ctrl, meta}`,
aliases Option/Cmd/Control, invalid → null), `matchesShortcut`, `resolveShortcut` (false/null disable,
undefined → default, invalid string → warn + default), `formatShortcut`. Core config gains
`shortcut?: string | false` (default `"Shift+Alt+F"`); legacy `uiConfig.hotkey` still honored. Focus
guard (`isEditableTarget`, composedPath) unchanged.

### 1.1 Tests

```
$ npm test    # Test Files 10 passed (10) / Tests 87 passed (87)
```
`test/shortcut.test.ts` (12): parse valid/aliases/bare/invalid; matchesShortcut on `code` ignoring
`e.key` (incl. `key:"ƒ", code:"KeyF"` → true); exact-modifier match; resolve false/null/undefined/invalid.

### 1.2 Browser proof (evidence/shortcut-harness.html, real IIFE bundle)

Synthetic `keydown` dispatched at `document`:

```
opensWithMacOptionF_specialKey: true   // {code:'KeyF', key:'ƒ', shift, alt} → menu opens
opensWithCodeKeyF:              true
blockedWhenInputFocused:        false  // same event while a host <input> is focused → stays closed
ignoresOtherKeys:               false  // {code:'KeyG', ...} → stays closed
oldKeyMatcherWouldMatch:        false  // ('ƒ').toLowerCase() === 'f'  → the old bug
```
Screenshot: harness log line `last keydown: key="ƒ" code=KeyF shift=true alt=true` with the widget
menu open. NOTE: the headless preview cannot inject a real OS Option+F keystroke, so the synthetic
event carries the macOS `e.key` value; final manual macOS keypress confirmation is the user's.

## Phase 2 — Landing favicon

Monogram **"S"** in the landing palette (graphite `#18181b` rounded square, `#fafafa` letter — same
accent as the site logo). Source `docs/public/icon.svg`; rasters generated at 32px + 180px;
`favicon.ico` built as a 32×32 PNG-in-ICO container. Head links use Vite `%BASE_URL%` so they resolve
under the GitHub Pages base `/snaglist/`.

Files: `docs/public/favicon.ico`, `docs/public/icon.svg`, `docs/public/apple-touch-icon.png`.
Preview of the mark: [`evidence/apple-touch-icon.png`](evidence/apple-touch-icon.png).

### Live verification (after gh-pages deploy)

```
$ curl -sIL https://mirawision.github.io/snaglist/favicon.ico          → 200
$ curl -sIL https://mirawision.github.io/snaglist/icon.svg             → 200
$ curl -sIL https://mirawision.github.io/snaglist/apple-touch-icon.png → 200
$ curl -s -o /dev/null -w '%{content_type} %{size_download}' .../favicon.ico
image/vnd.microsoft.icon 1020

# live page <head>:
<link rel="icon" href="/snaglist/favicon.ico" sizes="32x32" />
<link rel="icon" type="image/svg+xml" href="/snaglist/icon.svg" />
<link rel="apple-touch-icon" href="/snaglist/apple-touch-icon.png" />
<meta name="theme-color" content="#18181b" />
```
(The headless preview cannot capture the OS browser-tab strip; the icon is proven served + valid +
linked. The literal tab glance is the user's.)

## Phase 3 — Unified error capture

New `src/errors.ts` `createErrorCapture({capture,bufferSize,captureWarnings})`: one ring buffer (default
20) fed by `console.error` (calls the original), optional `console.warn`, `window 'error'`, and
`'unhandledrejection'` (reason via safe `String`). Records `{ts, source: console|exception|rejection,
message, stack?}`, truncated to 500 chars with `…[truncated]`; the widget's own `[snaglist]` lines are
skipped. Installed at **widget init** in `createFeedbackWidget` (not on panel open). Config gains
`errors?: {capture,bufferSize,captureWarnings}`.

Artifacts (additive): frontmatter `errors_count: N` (always present once capture is engaged; 0 when
off/none); body `## Errors` with `- [<age> before report] <source>: <message>` (+ indented stack).
The old `## Console errors` section + `CaptureIssueInput.consoleErrors` are replaced (retired
`src/ui/console-buffer.ts` and its fixture). `FeedbackConnector` contract unchanged.

### 3.1 Tests

```
$ npm run type-check   # clean
$ npm test             # Test Files 11 passed (11) / Tests 97 passed (97)
```
`test/errors.test.ts` (9): three sources + labels; console.error still calls original; `capture:false`
installs nothing → empty; 25 → last 20; warn only when `captureWarnings`; skips self lines; 500-char
truncation; uninstall restores. `test/artifacts.test.ts`: `## Errors` with source + relative age (2m/3s),
`errors_count` present/omitted semantics.

### 3.2 Browser E2E (evidence/errors-harness.html, real IIFE)

Fire `console.error` + an uncaught `TypeError` + a rejected promise, then capture an issue:

```
consolePrinted: true    // the original console.error still runs
```
Artifact ([`evidence/errors-issue.md`](evidence/errors-issue.md)) frontmatter `errors_count: 3` and:
```
## Errors
- [0s before report] console: Failed to load resource: /api/animals 500
- [0s before report] exception: Uncaught TypeError: Cannot read properties of undefined (reading 'id')
        at .../errors-harness.html:43:36
- [0s before report] rejection: Unhandled rejection: network down
        at .../errors-harness.html:45:26
```
Second widget with `errors: { capture: false }` → `errors_count: 0`, no `## Errors` section.
(All three fired within the same second → "0s"; distinct ages 2m/3s covered by the unit test.)

## Phase 4 — Local delivery: `snaglist dev` + LocalConnector

`LocalConnector({port?})` (default 127.0.0.1:4477) POSTs base64 artifacts to the sidecar; if the server
is down it warns **once per session** and rethrows (UI never blocks, other connectors keep working).
CLI `src/cli/` (separate Node tsup entry → `dist/cli.js` with `#!/usr/bin/env node`; `bin.snaglist`):
binds 127.0.0.1 only, `POST /put` → `.snaglist/{session}/{file}` (`--dir`/`--port` override), `GET
/health` → `{ok,dir}`, CORS reflects localhost origins, path traversal → 400, sessionId `session-*`
validated, one stdout line per accepted file. Browser bundle contains **zero** `node:http`/`node:fs`
(grep = 0).

### 4.1 Tests

```
$ npm test    # Test Files 12 passed (12) / Tests 104 passed (104)
```
`test/cli.test.ts` (7): resolveTarget accept/reject (traversal, absolute, subdir, bad session); live
server GET /health, POST /put writes decoded bytes, traversal → 400 (nothing written), CORS reflected;
LocalConnector warns once across two puts when the server is down.

### 4.2 E2E — real CLI + browser widget (evidence/local-e2e/)

`node dist/cli.js dev --dir …/evidence/local-e2e/.snaglist --port 4477`, then the widget with a
LocalConnector captured 2 issues (`evidence/local-harness.html`). `deliveredOk: true`. Folder listing:

```
.snaglist/session-2026-07-22-qrwi/
  02-header-overlaps-the-nav-on-mobile.md
  02-header-overlaps-the-nav-on-mobile.png
  03-save-button-does-nothing.md
  03-save-button-does-nothing.png
  session.yaml
```
Dev-server stdout ([`evidence/local-e2e/devserver.log`](evidence/local-e2e/devserver.log)):
```
snaglist dev listening on http://127.0.0.1:4477
writing feedback to …/evidence/local-e2e/.snaglist
  ← session-2026-07-22-qrwi/02-header-overlaps-the-nav-on-mobile.png  (110 bytes)
  ← …/02-header-overlaps-the-nav-on-mobile.md  (236 bytes)
  ← …/session.yaml  (731 bytes)
  ← …/03-save-button-does-nothing.png  (110 bytes)
  ← …/03-save-button-does-nothing.md  (224 bytes)
  ← …/session.yaml  (934 bytes)
```

### 4.3 --dir / --port override

```
$ (cd scratch && node dist/cli.js dev --dir .feedback --port 5511)
$ curl 127.0.0.1:5511/health → {"ok":true,"dir":".../.feedback"}
$ curl -X POST 127.0.0.1:5511/put -d '{sessionId:session-2026-07-22-zz99, path:session.yaml, ...}'
→ {"ok":true}; wrote .feedback/session-2026-07-22-zz99/session.yaml
```

## Phase 5 — snaglist-fix skill + live loop E2E

Skill at `skills/snaglist-fix/SKILL.md` (triggers, algorithm: sessions without `.done` → session.yaml →
per-issue md + screenshot → localize by selector/element_text/url → fix → write `.done`; rules: view the
screenshot, never guess, only fix what's reported, use `## Errors` as a hint). Shipped in the package
(`files: [dist, skills]`) + README "Let an agent fix it" section.

### Live loop (the main E2E) — evidence/demo-app/

A demo app (`evidence/demo-app/app.html`) with 3 intentional defects, the widget wired to a
`LocalConnector`, and a real `snaglist dev` writing to `evidence/demo-app/.snaglist/`.

1. **Report** (through the widget → LocalConnector → CLI): 3 element-mode issues captured with real
   screenshots. `deliveredOk: true`. Folder `.snaglist/session-2026-07-22-e9q2/` = session.yaml + 3 md +
   3 png; the CLI logged every file (`evidence/demo-app/devserver.log`).
2. **Fix** (acting as the skill): read session.yaml + each md, viewed each png, localized by
   `element_text`/`selector`, applied 3 fixes to `app.html`, wrote `.snaglist/…/.done`.

| Issue | Reported | Fix |
|---|---|---|
| 01 | Heading typo "Wlecome" | `Wlecome to Acme` → `Welcome to Acme` |
| 02 | "Get started" button unreadable (no contrast) | `.cta` `#f2f2f2/#f5f5f5` → `#fff/#18181b` |
| 03 | Tagline overlaps the title | `.tagline` `margin-top: -38px` → `8px` |

3. **Verify** (reload): `heading: "Welcome to Acme"`, `ctaColor: rgb(255,255,255)`,
   `ctaBg: rgb(24,24,27)`, `taglineMarginTop: 8px`, `overlap: false`. Before/after screenshots:
   [`evidence/demo-app/before.png`](evidence/demo-app/before.png) →
   [`evidence/demo-app/after.png`](evidence/demo-app/after.png). Report:
   [`.done`](evidence/demo-app/.snaglist/session-2026-07-22-e9q2/.done).

Loop closed: click on localhost → `.snaglist/` → agent read + fixed → `.done` → defects gone.

## Phase 6 — Summary

All phases have external, verifiable artifacts above. Final gate: `npm run type-check` clean,
`npm test` = 104 passing across 12 files, `npm run build` emits ESM+CJS+IIFE + `dist/cli.js`.

### Known limitations
- Browser tab favicon and the manual macOS Option+F keypress can't be captured by the headless preview
  (curl 200 + rendered icon + synthetic-event proof stand in; final tab/keypress glance is the user's).
- Error relative-time in the live E2E shows "0s" (all fired within a second); distinct ages are unit-tested.
- The `snaglist dev` server has no auth by design (local-only, README-documented).

---
---

# v3 — action trail + record mode

## Phase 0 — Pre-flight audit

Date: 2026-07-22. `snaglist` local repo at v1.4.0.

| Area | Verdict | Detail |
|---|---|---|
| Selector generator | **REAL / reusable** | `src/selector.ts` `generateSelector(el): {selector,strategy,unique}` + `collectElementMetadata(el)`. Action trail will log `generateSelector(el).selector` (same quality as element-mode issues) + short element text. |
| Error capture (twin) | **REAL** | `src/errors.ts`: `ErrorRecord {ts,source,message,stack?}`, `createErrorCapture` (ring buffer via push/shift + wrapped globals + `uninstall`), `formatErrorAge(ms)` → "3s/2m/1h". Reusable primitive extracted for the trail: `formatErrorAge` (relative age) is imported directly; the buffer+listener-wrap+uninstall shape is mirrored in a new `src/actions.ts`. |
| Frame timing (STOP gate) | **PASS** | See measurement below. |
| Widget UI | **REAL** | Capture modes are a menu (`menuItem 1..4`); Record becomes a 5th item. The panel's `thumbs` row already renders a screenshot ribbon → reused for frame thumbnails. Recording indicator → a state on the FAB (badge/dot). |

### Frame duration (html-to-image `captureFullPage`)

Test page: header + nav + a 4-field form + **60 cards** (`evidence/timing-harness.html`), viewport ~900px.
Warm-up run discarded (lazy html-to-image import), then 6 runs:

```
runs (ms): [354, 358, 361, 430, 454, 469]   median 430   min 354   max 469
```

**430ms median ≪ 1.5s STOP threshold → no STOP.** Record mode proceeds. Per the floor rule
(`frameMinInterval` ≥ Phase-0 measure × 1.5), the default is set to **650ms** (430 × 1.5 ≈ 645, rounded)
rather than the spec's nominal 500ms. Note: frames render the whole document (same path as the fullpage
mode); very long/complex pages will be slower — `frameMinInterval` throttling + `maxFrames` bound the cost.
(TruGenix not running in this session; measured on the representative harness.)

## Phase 1 — Action trail

New `src/actions.ts` `createActionCapture({capture,bufferSize,capturePasswords})`: a ring buffer
(default 30, twin of errors.ts) fed by document-capture-phase listeners — `click` (resolved to the
nearest actionable ancestor via `generateSelector`, element text ≤40), `submit`, `input` (debounced
800ms → `type` with a **char count only**), and navigation via wrapped `history.pushState`/`replaceState`
+ `popstate`/`hashchange` (paths **without query**). Widget-own events excluded; password fields not
logged at all unless `capturePasswords`. Exposed on `core.actions` (with `subscribe`) for record mode.
Additive: `## Actions` (after `## Errors`) + `actions_count` frontmatter. Installed at widget init.

**Hard PII rule:** the trail records the fact + place, never entered content. `type (12 chars) input#email`
— never the value.

### 1.1 Tests

```
$ npm run type-check   # clean
$ npm test             # Test Files 13 passed (13) / Tests 117 passed (117)
```
`test/actions.test.ts` (13): click→actionable selector + text (+40-char truncation), widget exclusion,
submit, type records count only (grep: value absent), password not logged (default) / count-only when on,
pushState navigation w/o query + routing intact (history.state + location updated) + methods restored on
uninstall, capture:false, 35→30, subscribe fires/unsubscribes, renderAction formatting.

### 1.2 Browser E2E (evidence/actions-harness.html, real IIFE)

Scenario: 3 clicks + 2 SPA pushState navigations + type into #email ("anna@mail.com") + type into a
password field ("hunter2") + submit. Resulting `## Actions` ([`evidence/actions-issue.md`](evidence/actions-issue.md)),
`actions_count: 7`:

```
## Actions
- [1s before report] click #to-animals ("Animals")
- [1s before report] navigate /evidence/actions-harness.html → /animals
- [1s before report] click #to-detail ("Animal 128")
- [1s before report] navigate /animals → /animals/128          # query ?token=… dropped
- [1s before report] click #refresh ("Refresh")
- [0s before report] type (13 chars) #email                    # count only, no value
- [0s before report] submit [data-testid="animal-form"]        # password field: not logged at all
```

**PII grep on the artifact:** `anna@mail.com` → absent, `hunter2` → absent, `#pw` → absent. Routing
intact (SPA navigated to `/animals/128?token=…`). NOTE: the URL query token appears **only** in the
pre-existing `url:` frontmatter field (full-URL capture for reconstruction), never in the trail;
stripping query from that existing field would be a non-additive change to an existing field → left as-is
and flagged here.
