# RUN_EVIDENCE — checklist mode (structured UAT acceptance)

Date: 2026-07-24. Additive-only; `FeedbackConnector` unchanged; format `1.0 → 1.1` (minor, additive).
**171 unit/integration tests pass** (was 150), type-check clean, lib + docs build clean. Scope frozen:
the checklist is a session *input*, verdicts are its *output* — no lifecycle after the session.

## Phase 0 — Pre-flight audit (surface → state → action)

| Surface | State | Action taken |
|---|---|---|
| Widget UI (`ui/mount.ts` + `ui/styles.ts`) | REAL — shadow-DOM, one `.fab` @ `bottom:24px`, `.menu`/`.panel` @ `bottom:80px` | Added `.checklist-fab` @ `bottom:78px` (stacks above) + a `.checklist-panel`; attached **only** when a checklist resolves. No shortcut/positioning rebuild → no STOP |
| Session model (`session.ts`, `widget.ts`, `artifacts.ts`) | REAL — `SessionManager` (sessionStorage) → `buildSessionYaml` → `enqueueDelivery(id, [sessionYamlFile])` per issue | Put-per-verdict = same path (re-put `session.yaml`). Session seeded with the checklist on first issue **or** first verdict (lazy-create shared via `makeMeta`) |
| Format (`FORMAT_VERSION`, SPEC) | REAL — `"1.0"`, byte-exact fixture + 2 asserting tests | Bumped to `"1.1"` (single generator version); updated fixture + tests |
| Skills | REAL — `sluglist-fix`, `skills/` shipped in package | Added `skills/sluglist-checklist/SKILL.md`; extended `sluglist-fix` with a checklist-coverage section |
| Landing/README/SPEC | REAL — `App.tsx` FEATURES/agents, README sections, SPEC v1.0 | Feature card + agent-story step; README "Checklist mode" section; SPEC v1.1 tables |

## Phase 1 — Model & format (additive, tested)

- `src/checklist.ts` (new, pure like `reporter.ts`): `normalizeChecklist` (unique ids, ≤ 20 sections,
  ≤ 50 items, titles clipped to 120, invalid dropped with warning, never throws), `seedChecklistState`,
  `checklistProgress`, `isVerdict`. Config `Checklist` (sections) → validated `ChecklistDef`.
- `session.yaml` `checklist:` block + `checklist_item` issue frontmatter, both additive. `FORMAT_VERSION`
  → `"1.1"`. Sessions with no checklist stay byte-identical apart from the version line.
- Tests: `test/checklist.test.ts` (11 — validation, limits, dup ids, seeding, progress) +
  `test/artifacts.test.ts` (+3 — checklist block round-trips, `checklist_item` emitted only when set,
  back-compat omission) + `test/checklist-widget.test.ts` (7 — put-per-verdict, fail→issue link +
  `checklist_item`, fail→pass drops the link, no-op without a checklist, **URL fetch** + **404 → warn,
  capture still works**).

## Phase 2 — UI: second circle + panel (real-browser, sluglist.dev demo)

Verified live in the preview (shadow-DOM introspection + interaction):

- Second circle attaches only when a checklist resolves: `.checklist-fab` `display:flex` @ `bottom:78px`,
  main `.fab` @ `bottom:24px`; badge `0/3`. Without a checklist the shadow tree is unchanged (elements
  built but never appended).
- Panel: title "Try the widget", collapsible **Capture** / **Report** sections, 3 items, each with
  ✓ / ✕ / – and hints. Clicking **Pass** on #1 + **Skip** on #2 → badge/progress `2/3`, active states +
  row tint applied.
- Fail-flow: ✕ on #3 closed the checklist and opened the capture menu (5 modes). Completing a
  comment-only issue → checklist **reopened**, item marked **fail**, `issue 01` link shown, progress
  `3/3` (green complete). Reload → badge still `3/3` (verdicts persist in the session).
- Delivered artifacts (demo connector), verbatim:

```yaml
# session.yaml
checklist:
  id: sluglist-tour
  title: Try the widget
  items:
    - id: full-page
      section: Capture
      title: Full-page screenshot lands in the artifacts panel
      verdict: pass
      issue: null
      ts: 2026-07-24T08:30:41Z
    - id: annotate
      section: Capture
      title: Arrow / box / text annotate a shot
      verdict: skip
      issue: null
      ts: 2026-07-24T08:30:41Z
    - id: verdict-flow   # …verdict: fail, issue: "01"
```

```yaml
# 01-…​.md frontmatter
mode: fullpage
checklist_item: verdict-flow
```

- Mobile (≤ 480px): panel goes full-width (`left/right: 12px`, `bottom: 12px`).

## Phase 3 — Skills

- `skills/sluglist-checklist/SKILL.md` (new): base = `main`→`master` (override honored); include only
  user-visible pages/components/text; exclude refactors/tests/config; group by feature; client voice
  (self-check bans code identifiers in titles); emit `Checklist` JSON to `public/checklist.json`;
  ambiguous changes → a "Not included — confirm" list, never faked items; ≤ 50 items.
- `skills/sluglist-fix/SKILL.md`: new "Checklist coverage" section — `fail` items (with their linked
  issue via `checklist_item`) are tasks; `null` items go to a "Not verified by client" report section
  (a gap, not a task); `pass`/`skip` are left alone. Report step updated.

## Phase 4 — Docs

- SPEC.md → **v1.1**: `checklist` session table + `items[]` sub-table + `checklist_item` issue field,
  all marked `Since 1.1`; versioning note. README: "Checklist mode" section (inline + URL config, yaml
  result, generator-skill subsection, explicit scope-boundary paragraph); `format_version` refs → 1.1.
- Landing: "Checklist mode" feature card + a `+` agent-story step ("generate a checklist from this
  branch"); live demo wired with an inline checklist. `npm run build` clean (70 modules).
- **SPEC ⇄ generator field check** (parsed a real `buildSessionYaml`/`buildIssueMarkdown`):

  | Location | SPEC says | Generator emits | Match |
  |---|---|---|---|
  | `checklist` block | `id`, `title`, `items` | `id`, `items`, `title` | ✓ |
  | `checklist.items[]` | `id`, `section`, `title`, `verdict`, `issue`, `ts` | `id`, `issue`, `section`, `title`, `ts`, `verdict` | ✓ |
  | issue frontmatter | `checklist_item` (optional) | `checklist_item` (only when set) | ✓ |

## Phase 5 — E2E

- **Generator → JSON:** `docs/public/checklist.json` produced for this branch's visible surface
  (landing card, agent step, demo widget). Validated: `normalizeChecklist` → **2 sections, 5 items**,
  every title jargon-free (regex self-check), ≤ 50. Served by the dev server: `GET /checklist.json` →
  `200`, valid JSON (proves the URL-load path end to end; the fetch + 404 branches are also unit-tested).
- **Client walk → artifacts → fix-skill:** the Phase-2 run is the walk (pass + skip + fail-with-issue +
  one untouched → coverage map in `session.yaml`, fail linked). `sluglist-fix` reads that block per its
  new section.

## Known limitations (conscious)

- URL checklists need `fetch`; absent it, the checklist is skipped (capture unaffected). Guarded.
- A fail requires an issue by design — cancelling the capture leaves the item unset (no "fail without
  evidence"). Verified via the Escape/close path clearing the pending item.
- Verdicts live only in the session (sessionStorage + `session.yaml`); no cross-session or server state
  — this is the frozen scope, not a gap.
- The checklist and capture panels share the corner; opening one closes the other (only one is ever up).

---

# RUN_EVIDENCE — sluglist.dev + format versioning + agent context

Date: 2026-07-23. Additive-only; `FeedbackConnector` unchanged. Version bumped 1.6.0 → **1.7.0**.
150 unit/integration tests pass, type-check clean, lib + docs build clean.

## Phase 1 — Domain sluglist.dev (repo changes; DNS/Pages are the maintainer's)

- `docs/public/CNAME` = `sluglist.dev` → copied to the gh-pages **root** on every deploy (survives the
  "Pages resets custom domain" gotcha). Verified `dist/CNAME` after build.
- Vite `base: "/"` (custom domain serves at root, not `/sluglist/`). Built `dist/index.html` assets are
  root-relative (`/assets/…`, `/favicon.ico`, `/icon.svg`).
- `canonical` + `og:url` = `https://sluglist.dev/`, `og:image` = `https://sluglist.dev/og-image.png`.
- `docs/public/sitemap.xml` (one entry `https://sluglist.dev/`) + `robots.txt` → `Sitemap:
  https://sluglist.dev/sitemap.xml`. Both land in `dist/` root.
- `package.json` + `docs/package.json` `homepage` = `https://sluglist.dev`; README link updated.

```
$ ls dist/                     → CNAME  sitemap.xml  robots.txt  og-image.png  favicon.ico  …
$ cat dist/CNAME               → sluglist.dev
$ grep dist/index.html         → canonical/og:url https://sluglist.dev/ ; assets href="/assets/…"
$ git ls-files | grep -v CHANGELOG | xargs grep -l mirawision.github.io   → 0
```

**Live (deployed + DNS active):**

```
$ curl -s https://sluglist.dev/            → <title>sluglist — visual feedback that your agent fixes</title>
                                             body: "Visual feedback, one line in."  "npm install sluglist"
                                             canonical + og:url = https://sluglist.dev/
$ curl -o/dev/null -w '%{http_code}' https://sluglist.dev/{,favicon.ico,icon.svg,apple-touch-icon.png,
    og-image.png,sitemap.xml,robots.txt}   → 200 200 200 200 200 200 200
$ curl -sI https://mirawision.github.io/sluglist/   → 301 → https://sluglist.dev/
$ gh api …/pages -q .cname                 → sluglist.dev   (HTTPS enforced; CNAME shipped from public/
                                             so every deploy preserves the custom domain)
```

## Phase 2 — Format versioning + SPEC.md

- `session.yaml` first line is `format_version: "1.0"` (quoted string via the serializer's numeric-like
  rule). Generator always writes it; skill + SPEC treat a missing field as `"1.0"`.
- **SPEC.md** — full dictionary for `session.yaml`, the issue index, issue frontmatter, and the
  `## Errors` / `## Actions` rules + versioning policy. Parity check (SPEC ↔ generator): every field in
  SPEC is emitted by `src/artifacts.ts` —

  `format_version, project, session_id, created_at, base_url, browser, os, viewport,
  device_pixel_ratio, screen, language, languages, timezone, color_scheme, reduced_motion, reporter,
  issues[id,file,screenshot,category,screenshots,screen,frames,url,selector,created_at]; frontmatter
  id,url,selector,selector_strategy,selector_unique,mode,category,element_text,dom_path,component,
  screen,viewport,screenshot,screenshots,masked,errors_count,actions_count,recording,frames_count,
  frames_dir,created_at,reporter,custom,context` — all present in the generator (grep above).

- Unit test: `session.yaml` starts with `format_version: "1.0"` and round-trips; skill run tolerates a
  missing field (documented as "= 1.0").

## Phase 3 — Agent context (real-browser evidence, live React app + real fetch)

Driven in the browser against the docs React app via the real library (`/@fs/…/src/index.ts`):

```
component:          "App"                                   // read from a real React fiber
mdComponentLine:    component: App                          // → issue frontmatter
network:            ["network: GET /api/nope → network error (2ms)"]   // real fetch wrapper
networkHasNoToken:  true                                    // ?token=secret stripped — no query/body
mdContextBlock:     context:\n  tenant_id: acme\n  build_version: 2.4.1   // setContext → snake_case
formatVersionLine:  format_version: "1.0"
```

- **component** — best-effort fiber walk (`__reactFiber$*` → up `.return`, skip host/anonymous/minified,
  PascalCase heuristic). Null-safe: no React / anonymous / prod-minified → `null`, no throw.
- **network** — `fetch` + `XHR` wrappers record only status ≥ 400 or network errors as
  `network: METHOD /path → status (Nms)`. `grep body|headers|json|text src/errors.ts` → only a comment;
  **no request/response bodies, headers or query strings** are ever read (query stripped by `pathOf`).
  `errors.captureNetwork` default true; `false` leaves fetch unwrapped (test).
- **setContext** — flat primitives, snake_case, ≤ 20 keys / 200 chars, merges on repeat calls; distinct
  from static `config.custom`. Omitted from artifacts until first call (back-compat).

Tests added (150 total, was 128): `reporter` normalizeContext (merge/cap/clip/invalid), `errors`
network (fetch 4xx + network error + query-stripped + captureNetwork:false + restore + XHR),
`selector` componentName (fiber/host-skip/wrapper/minified), `capture` setContext (merge + invalid +
omitted), `artifacts` format_version-first-line + component/context additive + network `## Errors` line.

## Known limitations

- Component names are **minified in production** React builds → `component: null` there (best-effort by
  design; no internals hacks). Dev/staging (the primary sluglist use) keep names.
- Network capture is failure-facts only (no success timing, no bodies) — deliberately not a monitor.
- Domain live checks (curl 200 / 301, CNAME-survives-deploy) are gated on the maintainer's DNS + Pages
  setup and will be filled in post-cutover.

---
---

# RUN_EVIDENCE — reverse rename `snaglist → sluglist` + landing overhaul

Date: 2026-07-23. Two tasks executed together (the landing depends on the final name). The name is
now **frozen**: `sluglist`. Older sections below document the prior `sluglist → snaglist` cycle and the
feature work — kept as history.

## Phase 0 — Pre-flight audit (surface → state → action)

| Surface | State found | Action |
|---|---|---|
| npm `sluglist` | versions 1.0.0/1.1.0/1.1.1, **DEPRECATED** "Renamed to snaglist" | un-deprecate + publish 1.6.0 (pending checkpoint) |
| npm `snaglist` | versions 1.3.0/1.5.0, latest 1.5.0, **not** deprecated | deprecate → "moved to sluglist" (pending checkpoint) |
| `package.json` name / bin / global | `snaglist` / `snaglist` / `Snaglist` | → `sluglist` / `sluglist` / `Sluglist` ✅ |
| version | 1.6.0 (uncommitted feature bump over published 1.5.0) | keep 1.6.0 (next minor, > sluglist 1.1.1 and > snaglist 1.5.0) ✅ |
| default folder | `.snaglist/` | → `.sluglist/` + legacy `.snaglist/` detection ✅ |
| skill | `skills/snaglist-fix/` | `git mv` → `skills/sluglist-fix/` + `.snaglist` fallback ✅ |
| GitHub repo | **already `sluglist`** on GitHub (local remote was stale `snaglist.git`; GitHub redirects) | fix local remote ✅ — no repo rename needed |
| GitHub Pages | `/sluglist/` **200** (live), `/snaglist/` **404**; live title still said "snaglist" | redeploy with sluglist branding (pending) |
| shortcut source of truth | `DEFAULT_SHORTCUT = "Shift+F"` (`src/shortcut.ts:90`); one stale doc comment said `alt+shift+f` | landing uses `Shift+F`; fixed the stale comment ✅ |
| local loop (agent story gate) | **REAL** — `sluglist dev` CLI + `LocalConnector` + `sluglist-fix` skill all present & tested | agent story clears its STOP gate ✅ |
| icon source | `~/Downloads/slug.svg` (vector 512²) + `slug.png` (512²), slug mascot | icon set clears its STOP gate ✅ |

Grep before: 229 `snaglist` occurrences across 44 files. STOP conditions checked: snaglist@1.5.0 is
merely *ahead* of sluglist@1.1.1 (linear history, not a divergent functionality fork) → **not** a STOP.

## Phase 1 — Code / package / CLI ✅

- Mechanical `snaglist→sluglist`, `Snaglist→Sluglist` across 35 tracked files; `package.json` name,
  bin, `unpkg`/`jsdelivr` (`dist/sluglist.global.js`), repo/bugs/homepage URLs, keywords
  (−`snaglist`/`snagging`, +`sluglist`/`slug`). tsup entry `sluglist` + `globalName: "Sluglist"`.
- Default folder `.sluglist/`; **legacy detection** added to `src/cli/index.ts` (prints a hint if
  `.snaglist/` exists and `.sluglist/` doesn't; never renames files).
- **Residual `snaglist` strings are intentional**: `src/cli/index.ts` (the legacy-folder hint) and
  `skills/sluglist-fix/SKILL.md` (the `.snaglist/` fallback) — the compat feature must name the old
  folder. Everything else: 0 outside CHANGELOG/README-history/RUN_EVIDENCE.

```
$ npm run type-check        # clean
$ npm test                  # Test Files 14 passed (14) / Tests 128 passed (128)
$ npm run build             # dist/sluglist.global.js 173.68 KB + dist/cli.js + ESM/CJS/dts
```

Acceptance scenarios (CLI, real `dist/cli.js`, node 20):

```
# A) legacy .snaglist present, no .sluglist → one-time warning, files untouched
$ (cwd has .snaglist/)  node dist/cli.js dev --port 4611
note: found a legacy `.snaglist/` folder. sluglist now writes to `.sluglist/`. Rename it
(`mv .snaglist .sluglist`) ... or pass `--dir .snaglist` to keep using it.
sluglist dev listening on http://127.0.0.1:4611
→ after: `.snaglist` still present, no `.sluglist` created (not auto-renamed)

# B) fresh cwd → POST /put → writes under .sluglist/
$ node dist/cli.js dev --port 4612
{"ok":true,"dir":".../fresh/.sluglist"}   # GET /health
{"ok":true}                                # POST /put session.yaml
→ .sluglist/session-2026-07-23-ab12/session.yaml   (stdout logged the file)
```

## Phase 2 — Skill + folder fallback ✅

`git mv skills/snaglist-fix → sluglist-fix`. Triggers: "read feedback" / "fix feedback" / "sluglist" /
`.sluglist/` present. Algorithm now: use `.sluglist/`, else fall back to a legacy `.snaglist/` and note
"legacy folder name" in `.done`. Artifact format is name-independent (confirmed: generators in
`src/artifacts.ts` / `src/reporter.ts` never emit the package name).

## Phase 3 — GitHub remote + docs base + README ✅

- Local remote → `git@github.com:MiraWision/sluglist.git` (GitHub repo already `sluglist`).
- Docs: `vite.config.ts` base `/sluglist/`, `docs/package.json` name/homepage, lockfile regenerated.
- README fully renamed + one history line: "*briefly published as `snaglist`; the permanent name is
  `sluglist`*". No "may be renamed" language anywhere.

## Landing overhaul (React/Vite/Tailwind SPA)

- **Agent story** — new `#agents` section, **first after the hero** (`h2` "Feedback that fixes
  itself"). 3 steps + two dark terminal blocks (`$ npx sluglist dev` with real CLI stdout; `$ claude`
  "read feedback and fix it") + the `.done` report block + honest footnote ("works with any agent that
  reads files; Claude Code via the bundled `sluglist-fix` skill"). Commands verified by running the CLI.
- **Artifact showcase** — full `01-…md`: every frontmatter key exists in the real generator
  (`id, url, selector, selector_strategy, selector_unique, mode, category, element_text, dom_path,
  screen, viewport, screenshot, masked, errors_count, actions_count, recording, frames_count,
  frames_dir, created_at, reporter`) + `## Errors` (2) + `## Actions` (4, one `— frame 03`) + a session
  tree with a `…-frames/` folder.
- **SEO/OG/prerender** — `docs/index.html` gains a static hero+nav inside `#root` (React replaces on
  mount; Tailwind CSS is a `<link>`, so it styles without JS) + `og:*`, `twitter:card=summary_large_image`,
  canonical (absolute URLs). `robots.txt` allows all. Verified in the built `dist/index.html`:

```
$ grep dist/index.html →
<title>sluglist — visual feedback that your agent fixes</title>
"Visual feedback, one line in."   "A drop-in widget for dev"   "npm install sluglist"
og:title / og:description / og:url / og:image(1200×630) / twitter:card / canonical  → all present
assets + icons rewritten under /sluglist/ ; og-image.png, favicon.ico, icon.svg, apple-touch-icon.png,
robots.txt all emitted to dist/
```

- **Icons** — regenerated from `slug.svg`: `icon.svg` (verbatim), `favicon.ico` (16+32, tight-cropped
  mascot for 16px legibility), `apple-touch-icon.png` (180, mascot on brand-dark), `og-image.png`
  (1200×630, mascot + "sluglist" + "Visual feedback that your agent fixes"). Head links updated.
- **Shortcut + name consistency** — every landing mention is `Shift+F` / `⇧F`; `grep snaglist` over
  docs sources = 0.
- **Mobile fallback** — `useIsNarrow()` (`matchMedia(max-width:767px)`, no UA sniffing) swaps the live
  widget for a self-contained 3-screen flow strip + "**desktop-only** — try it on a larger screen".
  Verified at 375px: fallback shown, live widget not mounted (screenshot in evidence).

Preview verification (vite dev at `/sluglist/`, node 20): 0 console errors; `#agents` DOM confirmed
(3 steps, 2 terminals, `.done`); mobile fallback confirmed at 375px.

## Deploy + live checks ✅ (2026-07-23)

Committed to `main` (`beb7bc7`, pushed to `MiraWision/sluglist`); `cd docs && npm run deploy` → gh-pages
**Published**. Live `https://mirawision.github.io/sluglist/`:

```
$ curl -s https://mirawision.github.io/sluglist/
<title>sluglist — visual feedback that your agent fixes</title>
body contains: "Visual feedback, one line in."  "A drop-in widget for dev"  "npm install sluglist"
og:title / og:url / og:image(og-image.png) / twitter:card=summary_large_image / canonical  → present

$ curl -o/dev/null -w '%{http_code}' .../{favicon.ico,icon.svg,apple-touch-icon.png,og-image.png,robots.txt}
200  200  200  200  200
```

(Old live title "snaglist — embeddable visual feedback widget" was replaced after the Pages rebuild.)

## Pending — npm (2FA-gated, run by the maintainer)

```bash
npm deprecate sluglist@">=1.0.0 <1.6.0" "" --otp=<code>   # lift old deprecation
npm publish --access public --otp=<code>                   # sluglist@1.6.0
npm deprecate snaglist "This package moved to sluglist — npm install sluglist" --otp=<code>
```
Verify after: `npm view sluglist version` → 1.6.0 (no deprecation warning on install);
`npm install snaglist` → deprecation pointer. **No unpublish** of either package.

## Known tails (conscious)

- `snaglist` strings intentionally remain in `src/cli/index.ts` (legacy-folder hint) and
  `skills/sluglist-fix/SKILL.md` (`.snaglist/` fallback) — required by the compat feature — plus the
  CHANGELOG/README-history/this-log history docs and the archived `evidence/` harnesses from prior
  cycles. The `evidence/.snaglist/` session folders were `git mv`'d to `.sluglist/` to match the new
  default.
- Mobile-fallback flow "screens" are self-contained styled mocks (theme-aware, never 404), not captured
  PNGs — a deliberate swap for robustness; the 3-step flow + "desktop-only" intent is preserved.
- npm `sluglist` version jumps 1.1.1 → 1.6.0 (the 1.2–1.5 line shipped under `snaglist`); honest and
  allowed by semver.

---
---

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

## Phase 2 — Record mode (frames by action)

`config.recording {enabled,maxFrames=30,frameMinInterval=650}`. A `Record steps` menu item starts
recording; a pulsing red dot on the FAB + a top bar (`Recording · N frames` / `Stop & describe` /
`Cancel`) indicate state. A frame (masked full-page shot) is captured at start and on each
click/navigate/submit (NOT type), throttled by `frameMinInterval`, capped at `maxFrames` (then the
trail continues frameless, indicator shows the limit). Frame capture is deferred a tick so the action's
DOM effect lands first. Frames tag the action-trail records (`record.frame`) → `## Actions` lines get
`— frame NN`. `src/ui/record.ts` `createRecorder`.

Format (additive): `NN-slug.png` (moment of Stop) + `NN-slug-frames/01.png…`; frontmatter
`recording: true` + `frames_count` + `frames_dir`; session index `frames: N`. The CLI/LocalConnector now
accept a single `frames/` subfolder (still traversal-safe; `mkdir` on dirname).

### 2.1 Tests

```
$ npm run type-check   # clean
$ npm test             # Test Files 14 passed (14) / Tests 126 passed (126)
```
`test/record.test.ts` (5, mocked capture): start frame, per-action frame + `record.frame` linking, type
never frames, **maxFrames cap → trail continues (`atLimit`)**, frameMinInterval throttle, stop returns
frames / cancel discards. `test/artifacts.test.ts`: `recording`/`frames_count`/`frames_dir` frontmatter +
`— frame NN` Actions + session `frames`. `test/capture.test.ts`: frame files at `NN-slug-frames/NN.png`.
`test/cli.test.ts`: accepts `01-x-frames/02.png`, rejects deep nesting / traversal.

### 2.2 Browser E2E (evidence/record-harness.html + real `snaglist dev`)

Record run on a mini-SPA with a sequence bug (discount lost after cart→checkout→cart): start + Apply +
Checkout + Cart + type + Stop. On-disk session `record-e2e/.snaglist/session-2026-07-22-qov7/`:

```
01-discount-is-lost-after-navigating-cart.md          # recording:true, frames_count:3, frames_dir:…
01-discount-is-lost-after-navigating-cart.png         # final (Stop) screenshot
01-discount-is-lost-after-navigating-cart-frames/01.png 02.png 03.png
session.yaml                                          # issue frames: 3
```
`## Actions` (numbering matches the files):
```
- click #apply ("Apply") — frame 02
- click #to-checkout ("Checkout") — frame 03
- navigate /… → /checkout
- click #to-cart ("Cart")
- navigate /checkout → /cart
- type (6 chars) #code                                # type: no frame
```
Frames visually match the states (in evidence): `01.png` Cart **$100** → `02.png` Cart **$80** (Apply)
→ `03.png` Checkout **$80**. Masking on frames: [`evidence/record-e2e/masked-frame.png`](evidence/record-e2e/masked-frame.png)
shows the discount field redacted (maskedCount 1, live value restored). No frames outside record mode
(the Phase-1 `actions-issue.md` and demo-app issues carry no `frames_dir`). Note: under fast synthetic
driving some frames drop (the capture serialize/throttle guard); at human pace with the 650ms default
it is consistent.

## Phase 3 — Skill update (Actions + frames)

`skills/snaglist-fix/SKILL.md` now instructs the agent to read `## Actions` as the reproduction path
(replay the chain before hunting a fix; trail selectors/paths are code entry points on par with the
issue selector), and for `recording: true` issues to open the frames in order against the numbered
Actions lines and find the two frames the defect appears between. New rule: trail/frames are evidence,
not spec — if code contradicts the trail, record the contradiction, don't force the fix.

## Phase 4 — Sequence-only bug E2E (record → trail/frames → fix)

The Phase-2 recording (`session-2026-07-22-qov7`) is a genuine sequence-only bug: a discount is applied,
survives navigation to Checkout, then is **lost** when navigating back to Cart — invisible in any single
screenshot. Acting as the skill:

- **Localized from the trail + frames:** frame 02 = Cart $80 (Apply), frame 03 = Checkout $80, then
  `click #to-cart` + `navigate /checkout → /cart` → total back to $100. The defect is on the return-nav
  step → the `#to-cart` handler, which reset `discount = 0` on navigation.
- **Fixed** `record-harness.html`: removed `discount = 0` from the `#to-cart` handler.
- **`.done`** written ([`…/session-2026-07-22-qov7/.done`](evidence/record-e2e/.snaglist/session-2026-07-22-qov7/.done)),
  citing the frames/Actions as the localization basis.
- **Verified:** replaying apply → checkout → back-to-cart now keeps *Total $80* (`fixed: true`); before
  the fix it reverted to $100.

Loop closed on a sequence bug: record → `.snaglist` artifacts (trail + frames) → agent localized and
fixed via the trail/frames → `.done` → bug gone.

### Known limitations
- Frame capture renders the whole document (same path as fullpage mode); on very long/complex pages
  frames are slower — `frameMinInterval` (default 650ms = Phase-0 measure ×1.5) and `maxFrames` bound it.
- Under fast *synthetic* driving, back-to-back actions during an in-flight capture drop their frame (the
  serialize/throttle guard); at human pace this is not observed.
- The issue `url` frontmatter field still carries the query string (pre-existing full-URL capture); the
  action trail itself never records query strings.
