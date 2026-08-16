# Changelog

## 1.15.0 — `sluglist init`, project conventions, the loop skill, `sluglist status`, regression lifecycle

Everything here is additive. The widget's UI, the `FeedbackConnector` contract and every existing
command and skill behave exactly as before; the one library change is a new optional field in
`session.yaml` (**format 1.7**, below), emitted only on a re-test run. **No new dependencies.** This
release upstreams the glue that had to be written by hand in every project that adopted the 1.12–1.14
agent loop, and closes the loop it left open: fix → re-test → *decide whether to go again*.

### `npx sluglist init` — one-command project scaffold

`init-skills` installed the skills; four more things were identical in every integration and are now
done for you, idempotently:

- **`.sluglist/checklists/`** — the committed-checklists convention from 1.13, as a real folder.
- **`.gitignore` rules** — `.sluglist/*`, with `!.sluglist/checklists/` and
  `!.sluglist/PROJECT.md` re-included: QA sessions stay local while the checklists (the spec) and the
  project's conventions are versioned. An existing `.gitignore` is appended to, never rewritten, and
  the block is not duplicated on a re-run — even if you kept the rules and dropped the comment.
- **The skills** — the `init-skills` step, with identical semantics and identical output.
- **`.sluglist/PROJECT.md`** — the project-conventions template (below), written only when absent.
- **Agent instructions**, behind `--agents-md`: a short "QA loop (sluglist)" section appended to
  `CLAUDE.md` and `AGENTS.md` when those files exist. The CLI never prompts, so this is a flag; a
  second run appends nothing.

`--dir <path>` retargets the project root, `--force` passes through to the skills step, and a re-run
reports what was created versus what was already present. **`.sluglist/PROJECT.md` is never
overwritten — not even with `--force`**: it holds your answers, not our file. `init-skills` stays as
the skills-only command.

### `.sluglist/PROJECT.md` — project conventions as data, not skill edits

The bundled skills invite you to edit them, and an edited skill is never overwritten by `init` — which
means it also stops receiving upstream improvements. That tension is now resolved in the file system
instead of in the prompts: project specifics live in one committed file that every skill reads first.

It is a short fill-in questionnaire: **base branch** for `branch`-intent diffs; **how to run the app**
for QA (command, port, warm-up); **how to sign in** (credentials *referenced* — env vars, a seed
script — never written into a committed file); **hard limits**, the actions QA must never complete
(live payments, real emails, external submissions), pre-filled commented-out; **evidence-mode
defaults** per intent; and **environment quirks** as free text.

Each bundled skill gained one short "Project conventions first" instruction — read the file if it
exists, its answers override the skill's defaults, and if it is absent fall back and mention that
`npx sluglist init` creates it. `sluglist-qa` also gained a hard prohibition: an action listed under
the file's hard limits is never completed, whatever a checklist item appears to ask for — the run
stops at the last safe step and records **not tested** with the reason.

### `sluglist-loop` — the bundled orchestrator skill

There were three per-stage skills and nothing that owned the cycle. The new fourth skill maps a
request to an intent (finished branch → `branch`, "does everything still work" → `regression`, a
written brief → `scenario`, after a fix pass → `re-test`), then runs the stages in order: checklist →
QA run → `npx sluglist report` + a short summary → on request fix → re-test → final report.

It encodes the cycle-level decisions the stage skills cannot see: the evidence-mode heuristic
(acceptance and hand-off runs → `all`, long `regression`/`smoke` sweeps → `fails`, an explicit request
always wins, `PROJECT.md` can change the defaults), the round budget, and the post-merge offer to
update the regression baseline. Stage rules are delegated, not copied — one sentence each on what a
sub-skill guarantees, and when the two disagree the stage skill wins.

It has **two modes**. *One pass* is the default and ends at the report. *Until green* is opt-in — the
user asks for it in words, or `PROJECT.md` says the loop may run unattended — and repeats
fix → re-test → decide until a stop condition fires: green, `stalled`, `blocked`, the round ceiling
(**default 3 QA rounds**), a hard limit, or an app that stops running. An autonomous loop has an
obvious cheat available to it, so the prohibitions name it: never edit, narrow or delete a checklist
item so it stops failing, and never record `wontfix` to end a round. `wontfix` and `needs_info`
written during an unattended run are proposals surfaced to the owner, not decisions taken on their
behalf.

### `npx sluglist status` — is another round worth running?

The new command answers the only question a loop has to get right, and answers it from the artifacts
rather than from an agent's memory of what it just did:

```
release-2026-08 · branch · 3 items
  1  session-2026-08-15-tw1w  1 pass · 1 fail · 1 not tested  ·  1 fixed
  2  session-2026-08-15-jtyf  0 pass · 1 fail · 0 not tested  ·  no fix pass yet

  still failing (1)
    csv-columns — for the next fix pass · failed in 2 rounds · issue 01

verdict: stalled — 1 item failed in 2 or more rounds — a fix pass has already been tried
```

It reads the sessions on disk, chains them into rounds through `checklist.retest_of` (falling back to
the `<id>-retest-N` naming for pre-1.7 artifacts), and reports one verdict: **`green`** (nothing is
failing), **`continue`** (failures a fix pass can still act on), **`stalled`** (everything left has
already survived a fix pass), **`blocked`** (everything left is `wontfix` / `needs_info`) or
**`empty`**. Per item it gives the state (`actionable`, `awaiting-retest`, `blocked`), how many rounds
it has failed in, the linked issue and the fix agent's note.

Because it is derived, there is no new artifact and no state to keep in sync — deleting `.sluglist/`
loses history, not correctness. Chain-level rather than last-round-only: a re-test list carries only
the items that were fixed, so a coverage gap from round 1 and a failure the fix pass declined to take
both stay visible instead of quietly reading as green.

`--json` gives an agent the same result as data, `--all` includes older chains, and a session folder
as the argument restricts the report to the chain containing it. It also covers the plain dev loop,
where the work items are the issues themselves: an issue with no record in `fixes.yaml` is open.

### Format 1.7 — `checklist.retest_of` in `session.yaml`

One additive field. The checklist *config* has carried `retest_of` since 1.5; it is now written into
`session.yaml` alongside `intent`, so the rounds of one fix→re-test cycle can be chained from the
session alone. **Absent on a first-pass run**, so sessions that are not re-tests are byte-identical
apart from the version line, and a 1.x parser is unaffected.

### Regression as a first-class checklist lifecycle

`smoke` produces a broad one-off pass. A standing regression list is the same kind of list with a
different life: it lives in the repo and is updated after every merge. `sluglist-checklist` now has a
documented `regression` intent with two modes:

- **Seeding** (no file yet) — the smoke algorithm (routes + docs, critical paths first, ~30-item cap)
  written to `.sluglist/checklists/regression.json` with `"intent": "regression"`.
- **Maintenance** (the file exists) — the new part. Read the existing list *and* the branch diff, then
  propose **additions** for new user-visible surface (1–2 loud checks per feature, folded into an
  existing section when one fits) and **removals** for surface the diff deleted. Removals are
  **proposed, never silent** — the user confirms. The ~30-item cap is enforced by naming what to cut
  rather than growing the file. **Item ids stay stable** for unchanged items, because verdict history
  in past sessions maps by id and a renamed id orphans it silently. The summary is a diff of the list
  (`+ added` / `- removed` / `= unchanged`), not a new list.

SPEC.md gains an `intent` vocabulary table with the lifecycle of each value; `regression` is
additive and the field stays an open vocabulary, so no reader needs updating.

### Docs

- New page: **[Project conventions](https://sluglist.dev/docs/project-conventions/)** — what goes in
  `PROJECT.md`, why credentials are referenced rather than stored, and why hard limits are enforced
  rather than advisory.
- **Agents & CLI** documents `sluglist init` and the four-skill table with `sluglist-loop` first.
- **Checklist mode** documents the five intents and the regression lifecycle.
- **Agents & CLI** also documents `sluglist status` and the until-green loop.
- README: the `init` scaffold table, the project-conventions section, the `sluglist status` verdict
  table and the regression lifecycle.
- The site gained per-scenario landing pages, a contract diagram and a colour system — see the
  release notes on [sluglist.dev](https://sluglist.dev/).

## 1.14.0 — `sluglist init-skills`, per-page social metadata

A polish release: one new CLI command and a set of site/docs consistency fixes. No library code and
no artifact-format change — the widget, the writer and the format are untouched.

### `sluglist init-skills`

- New command replacing the documented
  `mkdir -p .claude/skills && cp -r node_modules/sluglist/skills/… .claude/skills/` line: it copies
  every bundled skill into `.claude/skills/`, creating the folder if needed.
- Zero-config; `--dir <path>` retargets and `--force` overrides.
- **A skill you have edited is never overwritten.** Skills are prompts and editing them to fit a
  project is expected, so a file identical to the bundled copy is refreshed silently, and anything
  that differs is reported and kept. A partially-edited skill is left entirely alone rather than
  half-updated. Note that a package upgrade produces the same "differs" state, so the message names
  both causes and `--force` is how you take new versions after upgrading.
- Docs now show the command, with the manual `cp` kept as a collapsed fallback for unusual layouts.

### Site and docs

- **Per-page social metadata.** Internal pages set `title` and `description` but inherited the home
  page's `og:title`/`og:url`, so sharing a doc in Slack or X showed the home page's headline. Every
  page (docs, `/for/*`, `/compare/*`, docs index, changelog) now emits its own `og:title`,
  `og:url`, `og:description` and `twitter:*`, matching its canonical URL and its `<title>`. The
  shared `og:image` is unchanged.
- **One canonical dev-loop snippet.** Quick-start showed `LocalConnector` bare while the agents page
  showed it behind `enabled: process.env.NODE_ENV !== "production"`. All five places (README ×2,
  quick start, agents, `/for/claude-code/`) now show the clean one-liner followed by the same
  reminder to gate it behind an env flag.
- **Privacy footnote** under the artifact example on the landing page: `reporter` comes from the
  `identity` you configure, so it is not a scrubbing miss — scrubbing applies to text the widget
  captures, not to fields you set on purpose.

## 1.13.0 — Verdict evidence, checklist intents, `sluglist report`

Everything here is additive. The `FeedbackConnector` contract is unchanged and the widget — its UI
and its artifacts — is untouched. A session that records no evidence and no intent is byte-identical
to a 1.12 one apart from the format-version line. **No new dependencies**: `npm install sluglist`
resolves to exactly the same tree as before, with no native binaries.

### Evidence for a verdict (format 1.6)

- `checklist.items[].evidence` in `session.yaml`: `screenshots` (files stored next to the session as
  `ev-<item-id>-NN.png`) plus a one-line `note` (≤ 500 chars, scrubbed with the session's other
  page-derived text). Absent unless recorded, so a bare verdict stays exactly as it was.
- Writer API: `setVerdict(id, verdict, { evidence: { screenshots, note } })`. Screenshots may be
  buffers or file paths. Valid on any verdict — on `pass` it is the point (a verifiable sign-off
  rather than a self-report); on `fail` it supplements the linked issue.
- The reason it exists: a `fail` has always been evidenced by its issue, while a `pass` was a bare
  tick. Now both can be checked.

### The anti-theatre rule (`sluglist-qa`)

- New run parameter `evidence: "fails" | "all"` — `fails` is the previous behaviour and stays the
  default; `all` requires a screenshot and a note for every pass.
- The skill now states, and enforces by example, that **a screenshot proves "the screen looked like
  this", not "the action worked"**. For a check with no visible result (a download, a submission, a
  background job) the note must carry the observed fact — the downloaded file's name and size, the
  toast's text, the counter that changed — and a pass with nothing observable behind it must be
  recorded as *not tested*.

### Checklist intents (format 1.6)

- Additive `intent` on the checklist config, carried into `session.yaml` as `checklist.intent`:
  `branch` | `re-test` | `smoke` | `scenario` (open vocabulary — readers tolerate unknown values).
- `sluglist-checklist` gains two generator modes: **smoke** (a broad pass built from the app's routes
  and docs, critical paths first, capped at 30 items) and **scenario** (a focused list decomposed
  from a written brief, with anything outside the brief surfaced as a suggestion, never a silent
  item).
- Convention: checklists live in `.sluglist/checklists/<name>.json`. `sluglist dev` serves that
  folder read-only at `GET /checklists/<name>.json` so the widget can load one without a copy into
  `public/`.

### `sluglist report`

- New command: `npx sluglist report [session-dir] [-o out.html]`. Zero-config — with no arguments it
  reports the newest session in `.sluglist/` and writes `report.html` beside it.
- Output is **one self-contained HTML file**: inlined CSS/JS, system fonts, `data:` URI images, no
  external request of any kind. It opens from `file://` offline and forwards as a single attachment.
- Contents: header (title, date, application, reporter, intent), summary tiles, the checklist as an
  article with verdict badges / notes / evidence thumbnails, every issue in full with its fix status
  from `fixes.yaml`, and a footer naming the format version. A session with no checklist renders as a
  plain issue list.
- Click a thumbnail for a full-size `<dialog>` lightbox (the full image *is* the thumbnail, scaled by
  CSS — each image is stored once). A print stylesheet drops the lightbox, grids the thumbnails and
  forces a light theme, so Print → Save as PDF gives a clean document.
- Images are downscaled to 1200px and re-encoded before inlining; a typical session (5 items, 6
  screenshots) lands around 150 KB. Over 25 MB the report is rebuilt once at 800px / q50 with a
  warning.
- The PNG decoder and baseline JPEG encoder are **part of the CLI, written against `node:zlib`
  alone**. This was deliberate: `sharp` is a native binary and `optionalDependencies` install by
  default, so it would land in every browser project; `jimp` is pure JS but a large tree for a
  package whose whole runtime is two lazily-imported deps.

### Internal

- New dependency-free reader (`parseYaml`, `readSession`) for the subset the serializer emits, tested
  differentially against a reference YAML implementation on every artifact in the repository.

## 1.12.0 — Agent-to-agent loop: headless writer, QA skill, fixes.yaml, re-test

Everything here is additive. The `FeedbackConnector` contract is unchanged, and the widget — its UI
and its artifacts — is untouched (byte-for-byte, minus the format-version line). sluglist becomes a
protocol between agents: dev agent → checklist → QA agent → issues → fix agent → fixes.yaml →
re-test checklist → QA again.

### `sluglist/node` — the headless writer

- New subpath export for Node ≥ 18 (no DOM, no browser code; the bundle's only imports are
  `node:fs/promises` and `node:path`): `createSession` → `reportIssue` (PNG buffers, attachments,
  form, category, checklist links) / `setVerdict` (put-per-verdict) / `reportFix`. Same builders,
  same delivery retries, same format as the widget. Zero-config: one connector is a working session.
- Node-side `LocalConnector({ dir })` writes artifacts straight to disk (no sidecar needed in a Node
  process), with the sidecar's traversal defenses.
- `createSession({ sessionId })` adopts an existing session folder for fix passes (fix-only by
  design: connectors are put-only).
- Documented simplification: no offline outbox in Node — the delivery report is returned instead.

### Format 1.5 (additive)

- `reporter.kind`: `"human" | "agent"` in `reporter`/`fixed_by` blocks; absent ⇒ human.
- `fixes.yaml`: per-session machine-readable resolution records
  (`fixed | wontfix | needs_info`, commit, note, checklist_item, ts), upserted by issue id. Absence
  is valid — the session just has not been through a fix pass.
- `retest_of` on the checklist input: provenance of a re-test checklist (`<orig>-retest-N`).

### Skills

- **New `sluglist-qa`**: a browser-driving QA agent walks the checklist through the writer. Protocol
  rule: no `fail` without a screenshot-backed issue, no `pass` without performing the check, unclear
  item ⇒ not-tested with a reason — never a guess. QA never writes to the repo.
- **`sluglist-fix`**: now records every resolution in `fixes.yaml` (writer API or direct file);
  `needs_info` over guessed fixes; `.done` stays for humans, fixes.yaml is the status truth.
- **`sluglist-checklist`**: new re-test mode — a checklist from a fixed session's `fixes.yaml`
  (`status: fixed` only, "Previously: … Verify: …" phrasing, url/hint inherited, wontfix/needs_info
  surfaced separately).

The full evidence for the end-to-end cycle (two planted bugs → fail with screenshots → real fix
commits → green re-test) is in `RUN_EVIDENCE.md` and `evidence/agent-loop/`.

## 1.11.0 — Capture resilience, mobile graceful mode, form fields, attachments, i18n

Everything here is additive. The `FeedbackConnector` contract is unchanged, and a widget configured
the way it was before this release behaves exactly as it did. Every new feature is optional: none of
them adds a required parameter or a setup step.

### `project` is now optional

- `createFeedbackWidget({ connectors: [...] })` is a complete call. An omitted `project` defaults to
  the page's hostname as a slug (`app.acme.com` → `app-acme-com`). An explicit slug is still
  validated exactly as before. Naming it is still the better choice — it is what your artifacts sort
  under.

### A failed screenshot no longer costs the issue

- Any render failure — a throw, a render slower than **8s** (was 60s), or a blank canvas — now
  delivers the issue **comment-only** instead of silently dropping the screenshot. The reporter keeps
  everything they typed and sees "Screenshot failed — sending without it".
- Format **1.3 → 1.4** (additive): `screenshot_failed: true` and `screenshot_error: "<why>"` on such
  issues. The message is scrubbed like any other page-derived text.
- **Fixed: one cross-origin image without CORS headers used to fail every capture mode**, in every
  engine. Measured across Chromium 151, Firefox 153 and WebKit 26.5. The unreadable image now renders
  blank and the rest of the page still captures.
- Record mode: a failed frame is skipped and the recording continues, with the gap marked in
  `## Actions` as `— frame skipped (render failed)`.
- New optional `capture: { timeoutMs, detectBlank }` for unusually heavy pages.
- `backdrop-filter` is not rendered by any engine — now documented in Notes and limits rather than
  discovered in production.

### Mobile graceful mode

- On a coarse pointer (detected from the pointer, never the user agent) the menu offers **full page**
  and **comment only**. Element mode (hover) and area mode (a drag the browser spends on scrolling)
  are hidden rather than offered and then failing. Record mode is hidden.
- Panels are usable at 360–390px: capped height with internal scrolling, 44px targets, 16px inputs so
  iOS does not zoom in and strand the reporter, and the textarea scrolls itself clear of the keyboard.
- **Fixed:** the mobile launcher rule targeted `.fab`, which stopped being the fixed element when the
  dismiss ✕ was added — the launcher never moved. It now also clears the home indicator
  (`safe-area-inset-bottom`).
- Shortcut hints are no longer shown on devices without a keyboard.

### Reporter form fields (`form`)

- Ask the reporter what only they can answer. `scope: "session"` is asked once, on the first issue,
  and lands in `session.yaml`; `scope: "issue"` is asked every time and lands in the issue
  frontmatter (both additive, format 1.4).
- Types `text | email | select | checkbox`; `required` blocks sending with the row highlighted;
  `email` is pattern-checked; values capped at 500 chars; at most 8 fields, with invalid ones dropped
  with a warning rather than breaking the widget.
- **Form values are never scrubbed**, including under the production preset — the reporter typed them
  for you on purpose.
- With no `form` configured the panel is unchanged.

### Attachments

- The reporter can attach their own files through a picker, drag & drop, or **paste** (Cmd/Ctrl+V) —
  the last being the common case, since a client's evidence usually arrives in their clipboard.
- Attached images join the thumbnail row and annotate like any capture; other types render as a
  labelled tile.
- Whitelist by default: images, video, pdf, txt/csv/json/md, xlsx/docx — checked on **both** the
  extension and the mime. **Executables and archives are never accepted**, not even through `accept`.
- Limits: 10MB per file, 5 files per issue, both configurable. Nothing is compressed client-side; an
  oversized file is an honest error naming the actual limit.
- Format 1.4 (additive): an `attachments:` list per issue; files land next to it as
  `NN-slug-att-01.<ext>` with the reporter's own name kept as `original_name`, never as a path.
- **Off by default under `preset: "production"`** — accepting uploads from anonymous users is a
  decision, not a default. `examples/feedback-route.ts` gained a matching server-side whitelist and
  size cap (415 / 413), and `docs/production-checklist.md` a section on what is your side of the line.

### Localization

- Ready-made bundles for `en`, `ru`, `uk`, `es`, `de`: `import { labels } from "sluglist/labels"`,
  then `mountFeedbackWidget(widget, { strings: labels.uk })`. Partial overrides work by spreading;
  anything omitted falls back to English.
- Plurals now go through the bundle's own rule, so Russian and Ukrainian get all three forms
  (`1 кадр / 2 кадра / 5 кадров`), including the 11–14 exception. `slavicPluralForm` is exported.
- Four remaining hardcoded strings moved into the label registry; a test now enforces that there are
  no others.

### Docs

- README opens with a one-line quick start and three scenarios (Dev loop / Client acceptance /
  Beta & Production), with an "Attach your user" recipe putting `identity`, `setContext` and `form`
  in one place. Notes and limits rewritten from the measured browser matrix.
- SPEC.md updated to 1.4 (it had drifted at 1.2 while the code emitted 1.3).
- The `sluglist-fix` skill reads attachments (images as screenshots, text files as evidence), `form`
  answers, and understands `screenshot_failed`.

## 1.10.0 — Production preset, PII text scrub, dismiss, self-isolation

Everything here is additive. The `FeedbackConnector` contract is unchanged and the `dev` preset
behaves exactly as before — artifacts written without the new options are byte-identical.

### `preset: "production"`

- New preset: `beta` (mask inputs + screenshot consent + "Report a problem" label) plus text
  scrubbing, the dismiss control, and `errors.captureWarnings` forced off. Explicit options still win
  over the preset — except `captureWarnings`, which `production` forces to `false` and warns about,
  since `console.warn` is the noisiest text channel in a real app.

### PII text scrub

- New `privacy.scrubText` (on by default under `production`, available on its own). Redacts emails →
  `[email]`, runs of 6+ digits → `[digits]`, and hex/base64-shaped tokens → `[token]` across the text
  surfaces of an artifact: `element_text`, `url` (including the query string), `selector`,
  `dom_path`, every message and stack in `## Errors` (network paths included), and the selectors and
  labels in `## Actions`.
- Dates, ISO timestamps, version numbers, IPv4, viewport strings, stack-trace line numbers and
  ordinary prose are deliberately left alone. Values *you* supply (`context`, `custom`, `identity`,
  checklist titles) and the reporter's own comment are never scrubbed.
- Format **1.2 → 1.3** (additive): a `scrubbed: true|false` issue field, emitted only when
  `scrubText` was set explicitly.

### Dismiss

- The launcher gets a ✕ — hover-revealed on desktop, always visible (muted) on touch. Hides the
  widget completely, shortcut included, and remembers it for `dismiss.days` (default 7; `0` = until
  storage is cleared). New `dismiss: { enabled, days }` config, on by default only in `production`.
- `mountFeedbackWidget()` now returns `show()`, `dismiss()` and `isDismissed()`. Wire `show()` to a
  "Report a problem" link in your footer so the ✕ is never a one-way door.

### Self-isolation

- Every host global the widget wraps (`console.error`, `fetch`, `XMLHttpRequest`,
  `history.pushState`) now calls the original **unconditionally** — a bug inside sluglist can no
  longer fail your request, swallow your log or block your navigation.
- Circuit breaker: after five internal failures in a session the widget uninstalls itself (originals
  restored by reference, listeners removed, UI taken out of the DOM) and logs one warning. Host page
  errors are captured as data and never count toward it.
- A global another library wrapped on top of ours is left intact rather than clobbered; our wrapper
  degrades to a transparent passthrough.
- Fixed: the `beforeunload` and `pointerdown` listeners were never removed.

### Endpoint, docs, CI guard

- `examples/feedback-route.ts` hardened: bearer auth with a constant-time compare (401), fail-closed
  when unconfigured (503), 10 MB body cap (413), mime allowlist (415), per-session file cap (409),
  and path validation that accepts the nested recording-frame layout. Now testable, covered by 27
  tests.
- New `docs/production-checklist.md`: env gating, token generation, retention, storage access, a
  privacy-policy paragraph to adapt, and a pre-flight list. Linked from the README.
- New permanent CI guard `test/no-phone-home.test.ts`: a full session with every outbound channel
  trapped must make zero network calls, with a negative check proving the trap works.

## 1.9.0 — Checklist UX v2, clips, smart links, polish

### Checklist panel v2

- **Simpler model:** click a row to **check it off** (grey + strikethrough); click the per-row **slug
  button** to **flag a problem** (opens the normal issue flow, auto-marks the item and links the issue
  back). Replaces the three verdict buttons. Unchecking a flagged item confirms first and keeps the
  issue link in `session.yaml` (a delivered issue is not retractable).
- **Self-navigating accordion:** finishing a section collapses it and opens the next incomplete one
  (scrolled into view); manual open/close always works. A **summary** line
  (`5 of 12 checked · 2 issues · 7 left`) replaces the bare counter; the circle badge counts what's
  left, then shows `✓`. Panel **auto-opens once per session** when nothing is checked yet; the Done
  button is gone (close via ✕ / click-outside / Esc / shortcut). New `config.checklist.description`.
- **Smart links:** `url` (static routes only) renders an "Open ↗" navigation chip; `url_match` (a
  wildcard like `/assessments/*`) highlights the item with a "You're here" tag when the current path
  matches — never navigates. Use `hint` + `url_match` for dynamic routes instead of guessing an id.

### Recording clips

- Each **Record→Stop** cycle is now its own **clip**. Two recordings on one issue stay two independent
  clips end to end — in the modal (`Clip 1 · 5 frames`, first frame as cover, delete per clip) and in
  the artifacts (`NN-slug-frames/clip-01/…`, `clip-02/…`; `## Actions` tagged `— clip N, frame NN`).
  Fixes the bug where a second recording merged into the first's flat frame list.
- Format **1.1 → 1.2** (additive): a `clips:` list in issue frontmatter (`{ id, frames }` per clip) and
  the `<frames_dir>/<clip-id>/NN.png` layout it discriminates. Pre-1.2 recordings (flat
  `<frames_dir>/NN.png`, no `clips:`) stay readable.

### Polish

- Floating circles hide while any panel is open — the **Send** button is never covered (was overlapped
  on mobile), and modal focus order is freed.
- `<Kbd>` hints show the live, platform-formatted shortcut (`⇧F` / `Shift+F`, incl. a custom one) on
  **+ Add screenshot** and the button tooltip.
- Issue-count badge is now **neutral** (brand accent); red is reserved for delivery problems.
- Frame **pluralization** (`1 frame` / `2 frames`), **category placeholders** (Bug / Design / Idea), and
  **aria-labels + roles** on all icon buttons and the panel.

### Skills & docs

- `sluglist-checklist`: link rules (static → `url`, dynamic → `hint` + wildcard `url_match`, mixed →
  both) with an explicit "never invent a route id". `sluglist-fix`: clips read as separate sequences;
  v2 vocabulary (checked-clean / checked-with-issue / not-tested).
- SPEC.md → v1.2 (clips, config appendix, `skip` valid-on-read); README + landing demo updated to v2.

### Scope (unchanged)

The checklist is a session input; verdicts are its output — no lifecycle after the session. `skip`
stays valid on read but the v2 UI never generates it. `FeedbackConnector` is unchanged.

## 1.8.0 — Checklist mode (structured acceptance)

### Acceptance checklist + verdicts

- **`config.checklist`** — pass an inline `Checklist` (sections of items) or a URL string (fetched
  `GET` → JSON at init). A **second circle** appears above the feedback button with a progress badge;
  the client walks the list and records **pass / fail / skip** per item. Entirely opt-in — with no
  checklist the widget is byte-identical to before (the elements aren't even attached).
- **Fail opens the normal issue flow**, linked both ways: the item stores the issue id, and the issue's
  frontmatter carries `checklist_item`. A fail always has evidence — cancelling the capture leaves the
  item unset.
- Verdicts are written **put-per-verdict**: every click upserts `session.yaml` (same idempotent path as
  per-issue writes), so progress survives the tab closing. Result: a **coverage map** — confirmed,
  failed (with issue links), and never-checked.
- Format **1.0 → 1.1** (additive): a `checklist:` block in `session.yaml` and the `checklist_item`
  issue field. Missing `format_version` still means `1.0`; parsers ignore unknown fields.
- **`sluglist-checklist` skill** (new): Claude Code turns a branch diff into a client-facing checklist
  (`git diff <base>...HEAD`, user-visible changes only, grouped by feature, client voice) →
  `public/checklist.json`. The `sluglist-fix` skill now reads the coverage map: fails are tasks,
  unchecked items are reported as gaps.

### Scope (deliberate)

The checklist is a session input; verdicts are its output. No lifecycle after the session — no
reopening, no cross-session sync, no server-side status, and issues are never blocked on completion.
Every session runs the checklist fresh. `FeedbackConnector` is unchanged.

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
- The `sluglist dev` sidecar / `LocalConnector` accept a single `frames/` subfolder (still
  traversal-safe). The `sluglist-fix` skill now reads Actions as steps-to-reproduce and lines frames up
  with them.

### Other

- Default shortcut changed to **`Shift+F`** (was `Shift+Alt+F`). The focus guard still ignores it
  while typing in an input/textarea/contenteditable; override via `config.shortcut`.
- Updated the brand logo (favicon + docs). The widget button keeps its existing mark.

No breaking changes; all artifact additions are additive. `FeedbackConnector` unchanged.

## 1.4.0 — Local feedback loop, error capture, shortcut fix, brand logo

### Local feedback loop (new)

- **`sluglist dev` CLI** (`npx sluglist dev`): a local sidecar that writes feedback artifacts into a
  `.sluglist/` folder (`--dir` / `--port`). Binds to `127.0.0.1` only, path-traversal-safe, logs each
  file. Ships a `sluglist-fix` skill (`skills/sluglist-fix/`) that reads `.sluglist/` and fixes issues.
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

- Adopted the brand logo across the favicon, docs header, and the widget button.

No breaking changes; all artifact additions are additive. `FeedbackConnector` unchanged.

## 1.3.0 — Beta feedback mode

**Beta feedback mode** for real users on a production beta (still one-way capture: no inbox,
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
