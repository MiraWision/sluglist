# RUN_EVIDENCE — checklist UX v2 + clips + smart links + polish

Date: 2026-07-24. **Additive-only**; `FeedbackConnector` contract unchanged; artifact format `1.1 → 1.2`
(minor, additive: the `clips:` issue field + its `<frames_dir>/<clip-id>/NN.png` layout). **182
unit/integration tests pass** (was 179 at the start of this iteration), type-check clean, lib + docs build
clean. Scope frozen: the checklist is a session *input*, verdicts are its *output* — no lifecycle after the
session; `skip` remains valid on read but the v2 UI never generates it.

External artifacts of the full run live under [`evidence/checklist-v2-e2e/`](evidence/checklist-v2-e2e/)
(real session.yaml, issue markdown, per-clip PNG subfolders, and the fix-skill `.done` report), produced by
the end-to-end test [`test/e2e-checklist-v2.test.ts`](test/e2e-checklist-v2.test.ts).

## Phase 0 — Pre-flight audit (REAL / root cause / decision)

| Surface | State | Root cause / decision |
|---|---|---|
| Checklist panel (`ui/mount.ts`, `ui/styles.ts`) | REAL — accordion + three verdict buttons (pass/fail/skip) per row, `done/total` counter, Done button | **Reused** the pure `checklist.ts` module + fail-flow; **replaced** the 3-button model with click-row-to-check + one slug "flag" button, the counter with a summary line, and removed the Done button. |
| Recording model (`ui/record.ts`, `ui/mount.ts`) | REAL — `Recorder` holds one flat `frames[]`; `stop()` returns+resets it (correct per-recording) | **Slippage root cause:** `stopRecording()` did `draft.frames.push(...frames)` into the Draft's single flat `frames[]`, so two Record→Stop cycles concatenated into one list. **Fixed structurally:** `Draft.clips: RecordingClip[]`; each stop pushes a new clip. Added `ActionRecord.clip` (set by `recorder.start(clipIndex)`) for the `— clip N, frame NN` marking. |
| Layers / Send overlap (`ui/styles.ts`) | REAL — `.fab`/`.checklist-fab` and `.panel`/`.checklist-panel` all at `z-index:2147483646` | On **mobile** the full-width panel (`bottom:12px`) sits under the fab (`bottom:16px right:16px`) → the fab covers **Send**. **Decision (no re-layer):** hide both circles (`visibility:hidden; pointer-events:none`) while any panel is open — they are useless while composing and this also frees modal focus order. No STOP: contained, reversible. |
| i18n (`ui/strings.ts`) | REAL — one interface + `DEFAULT_STRINGS` + `formatString(t,{id})` (single token) | Added `interpolate(t, vars)` (multi-token) + `plural(one, many, n)`; all new UI strings live in `FeedbackWidgetStrings` and stay overridable. |
| Routing awareness (`actions.ts`) | REAL — pushState/replaceState/popstate/hashchange wrapped; path exposed only as a trail buffer | **Decision (per STOP condition):** `url_match` matches `window.location.pathname` directly and re-renders on `navigate` records from `core.actions.subscribe` — read-only, no SPA-router coupling. |

## Phase 1 — Format (additive)

- `src/checklist.ts`: `Checklist.description`, `ChecklistItem.url_match` (+ `ChecklistDef*`). `normalizeChecklist`
  validates `url_match` as a **wildcard** pattern (must start with `/` and contain `*`; non-wildcard dropped
  with a warning) and clips `description` to 280 chars. New pure `matchUrlPattern(pattern, path)` (`*` = one
  `[^/]+` segment, trailing-slash tolerant).
- `src/artifacts.ts`: additive `clips:` block in issue frontmatter; `FORMAT_VERSION` → `"1.2"`.
- `src/actions.ts`: `ActionRecord.clip`; `renderAction` emits `— clip N, frame NN` (falls back to `— frame NN`
  for pre-1.2 records).
- `src/types.ts`: `CaptureIssueInput.clips?: Blob[][]` (legacy flat `frames` still accepted as one clip).
- `src/widget.ts`: `doCapture` writes `<framesDir>/clip-NN/NN.png` per clip, emits `clips` + total `frames_count`.
- Tests: `matchUrlPattern`, `url_match`/`description` validation ([test/checklist.test.ts](test/checklist.test.ts));
  single- and two-clip artifact structure ([test/capture.test.ts](test/capture.test.ts)); clips frontmatter +
  clip-tagged Actions ([test/artifacts.test.ts](test/artifacts.test.ts)).

## Phase 2 — Checklist panel v2 (verified live on the docs demo)

- Structure: **document-style title → optional `description` → summary line → accordion**. Summary =
  `5 of 12 checked · 2 issues · 7 left`, collapsing to `12 checked` + "Everything is saved automatically" when
  complete. Circle badge = items **left**, `✓` when done.
- Item model: **row click toggles checked** (pass ⇄ null; grey + strikethrough when clean). A per-row **slug
  button** opens the issue flow → the item auto-marks `fail` + red `!` + `issue NN` link. Unchecking a flagged
  item confirms first and **preserves the issue link** (`clearVerdict` on core: verdict → null, `issue` kept).
- Accordion self-navigation: completing a section collapses it and opens the next incomplete one (scroll into
  view); manual toggles always work and are never overridden (fires only on the incomplete→complete transition).
- Smart links: `url` → "Open ↗" chip (navigation); `url_match` → subtle highlight + "You're here" tag when
  `location.pathname` matches, re-evaluated on SPA navigation.
- Auto-open once per session (sessionStorage guard) when there are zero verdicts; Done button removed (close via
  ✕ / click-outside / Esc / shortcut). Touch: slug button persistent (muted) instead of hover-revealed.
- Core: `FeedbackWidgetCore.clearVerdict(itemId)` added (additive).
- Live verification on the running demo (`docs`): checking items updated the summary (`1 of 3 checked · 2 left`),
  completing "Capture" collapsed it and expanded "Report" (`collapsed:true/done:true` → next `collapsed:false`),
  and the completed state read `3 checked` + the autosave note with a `✓` badge.

## Phase 3 — Clips (recordings kept separate)

- `Recorder.start(clipIndex)` stamps `record.clip`; `Draft.clips: RecordingClip[]`; each Record→Stop pushes a
  **new** clip (never merged). Per-clip decks in the issue modal (`Clip 1 · 5 frames`, first frame as cover),
  independent delete, `sendDraft` ships `clips: Blob[][]`.
- Live verification: two Record→Stop cycles on one issue produced two decks — `Clip 1 · 1 frame`,
  `Clip 2 · 1 frame`; deleting clip 1 left one deck relabeled `Clip 1` (clean renumber). Singular "frame"
  pluralization confirmed.
- Tests: recorder clip-tag ([test/record.test.ts](test/record.test.ts)); two-clip subfolders + per-clip
  breakdown ([test/capture.test.ts](test/capture.test.ts)).

## Phase 4 — Polish pack

1. **Overlap (bug):** both circles hidden while any panel is open (`visibility:hidden; pointer-events:none`) —
   verified on mobile: with the issue panel open, `fabVisibility:"hidden"`, `clfabVisibility:"hidden"`, Send
   fully clear.
2. **Kbd hints:** `makeKbd()` renders the live, platform-formatted shortcut (`⇧F` on macOS, `Shift+F`
   elsewhere; honors a custom `config.shortcut`) on **+ Add screenshot** and the FAB tooltip — verified
   `addKbd:"⇧F"`.
3. **Badges:** issue-count badge is now neutral (`theme.accentColor`, `rgb(24,24,27)` verified; was red
   `#dc2626`). Red stays reserved for delivery problems (surfaced by the toast). No new outbox logic.
4. **Pluralization:** `1 frame` / `2 frames` via `plural()` (`recordingFrameOne`/`recordingFrameMany`).
5. **Placeholders by type:** Bug → "Describe the problem...", Design → "What looks off?...", Idea → "Describe
   your idea..." — verified all three switch with the category chip.
6. **Accessibility:** aria-labels + tooltips on icon buttons (slug button, ✕ closes, thumb/clip removes, add-shot),
   `role="dialog"` on the checklist panel, `role="checkbox"`+`aria-checked` on items, `aria-expanded` on section
   heads; focus order freed by (1).

## Phase 5 — Skills

- `sluglist-checklist` (generator): new **"Linking items to pages — `url` vs `url_match`"** section — static
  route → `url`; dynamic route → `hint` + wildcard `url_match` (never a guessed id); mixed → both. Explicit
  "**Never invent a route id**" rule; `description` documented; the "after generation" copy updated to the v2
  model (click = check, slug = flag).
- `sluglist-fix`: recording section rewritten for **clips as separate sequences** (per-clip subfolders, restart
  numbering, don't stitch; pre-1.2 flat fallback). Checklist-coverage section uses v2 vocabulary
  (**checked-clean / checked-with-issue / not-tested**), keeps the "Not verified by client" heading, and notes
  the `null`-verdict-with-`issue` withdraw case.

## Phase 6 — Docs & landing

- [SPEC.md](SPEC.md) → v1.2: clip folder layout, `clips` frontmatter table, `— clip N, frame NN` Actions, the
  `skip`-valid-on-read note, the `null`+`issue` case, and a new **"Checklist config (input)"** appendix
  (description/hint/url/url_match with the static-only rule) as the single source the generator matches.
- [README.md](README.md): checklist section rewritten to the v2 model + smart-links; recording section rewritten
  to clips.
- Landing: [docs/src/components/Demo.tsx](docs/src/components/Demo.tsx) demo checklist retitled from "Try the
  widget" to a real acceptance document — **"Beta acceptance — feedback widget"** with a `description` and v2
  content; [docs/src/App.tsx](docs/src/App.tsx) feature/agent copy updated to click-to-check. Verified live:
  auto-opens, shows the description, summary `0 of 5 checked · 5 left`, first section expanded and the rest
  collapsed.

## Phase 7 — End-to-end

[`test/e2e-checklist-v2.test.ts`](test/e2e-checklist-v2.test.ts) drives the real core through the full cycle and
writes [`evidence/checklist-v2-e2e/`](evidence/checklist-v2-e2e/):

- Generator-shaped checklist with a **static** route (`/reports` → `url`), a **dynamic** route
  (`/assessments/:id` → `hint` + `url_match:"/assessments/*"`, **no fabricated id**), and a **mixed** item
  (list `url` + detail `url_match`).
- Client flow: check `export-csv` off (→ `pass`); flag `assessment-header` with **two clips**
  (`[3 frames]`, `[2 frames]`) → `fail` linked to issue `01`; leave `assessment-score` untested (`null`).
- Artifacts (real files on disk):
  - `session.yaml` (`format_version: "1.2"`) — checklist block with `pass` / `fail`+`issue: "01"` / `null`.
  - `01-…-frames/clip-01/{01,02,03}.png` and `clip-02/{01,02}.png` — separate subfolders, per-clip numbering.
  - `01-….md` frontmatter — `checklist_item: assessment-header`, `frames_count: 5`, `clips: [{clip-01,3},{clip-02,2}]`.
  - `.done` — fix-skill report in v2 vocabulary: `assessment-header` a work item (defect localized to clip-02
    frames 01→02, but no code changed because the target app repo isn't present — per the skill's
    "never guess a location" rule), `assessment-score` under "Not verified by client", `export-csv` left alone.

## Limitations / scope deferrals (as specified)

- No checklist lifecycle after the session (input → output only); no client-side item editing; no cross-session
  rollups.
- `url_match` is highlight-only — it never navigates ("подскажи как дойти" is out of scope).
- The fix-skill `.done` in the E2E stops at localization because the referenced `assessments` app is
  hypothetical; on a real repo it would proceed to a diff.
- Headless recording via html-to-image is slow (~3 s/frame) in the preview harness — a UI timing property of the
  environment, not the code; clip structure is proven deterministically by unit + capture tests.

## Verify

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"   # repo needs Node 20+ (system default is 16)
npm run type-check && npx vitest run && npm run build
```

182 tests across 17 files pass; type-check clean; `tsup` + docs `vite build` clean.
