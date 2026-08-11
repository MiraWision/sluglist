# RUN_EVIDENCE — verdict evidence, checklist intents, `sluglist report`

Date: 2026-08-11. **Additive-only**; the `FeedbackConnector` contract is unchanged; the widget's UI
and its artifacts are untouched. Artifact format `1.5 → 1.6` (minor, additive: verdict `evidence`,
checklist `intent`). **493 tests pass** (was 404 — 89 added across four new files), type-check clean,
package build clean.

**No new dependencies.** `package.json` resolves to exactly the tree it did before this work; the
report's image pipeline is written against `node:zlib` alone. Clean-install log below.

The headline is Phase 6: a full generator → QA (evidence mode `all`) → fix → report cycle against a
demo app with one planted bug, ending in a single HTML file. Everything is in
[`evidence/report/`](evidence/report/).

External artifacts:

| What | Where | Produced by |
|---|---|---|
| **The report** (the deliverable) | [`evidence/report/session/report.html`](evidence/report/session/report.html) | `npx sluglist report`, zero arguments |
| Report — desktop rendering | [`evidence/report/shot-desktop.png`](evidence/report/shot-desktop.png) | headless Chrome, 900px wide |
| Report — lightbox open | [`evidence/report/shot-lightbox.png`](evidence/report/shot-lightbox.png) | headless Chrome, dialog opened on load |
| Report — print rendering | [`evidence/report/shot-print.pdf`](evidence/report/shot-print.pdf) | headless Chrome `--print-to-pdf` (exercises `@media print`) |
| The QA session itself (format 1.6) | [`evidence/report/session/`](evidence/report/session/) | QA agent via `sluglist/node` |
| Smoke checklist (intent `smoke`) | [`evidence/report/smoke-checklist.json`](evidence/report/smoke-checklist.json) | generator, smoke intent |
| Demo app with the planted bug | [`evidence/report/app.mjs`](evidence/report/app.mjs) | `BUG=0` runs the fixed build |
| QA / fix runners, CDP driver | [`qa-run.mjs`](evidence/report/qa-run.mjs), [`fix-run.mjs`](evidence/report/fix-run.mjs), [`cdp.mjs`](evidence/report/cdp.mjs) | this run |

---

## Phase 0 — Pre-flight audit

| Surface | Verdict | Detail |
|---|---|---|
| Task A deliverables (`sluglist/node` writer, `fixes.yaml`, QA skill) | **REAL** | Commit `47179bc`. `src/node/writer.ts` (457 lines) implements `reportIssue` / `setVerdict` / `reportFix`; `buildFixesYaml` in `artifacts.ts`; three skills in `skills/`. Working artifacts committed under `evidence/agent-loop/`. Dependency satisfied. |
| Format version | **DRIFT — see note** | The task specifies "format is 1.2 after task A, bump to 1.3". It is actually **1.5** (1.3 and 1.4 landed in between: `scrubbed`; `screenshot_failed`/`form`/`attachments`). Task A *is* done, so the STOP condition ("dependency not ready") does not apply. Bumped **1.5 → 1.6** instead of 1.3. |
| CLI structure ([`cli/index.ts`](src/cli/index.ts)) | **REAL, single-command** | `sluglist dev` only, with a hand-rolled arg parser. `report` slots in as a second command; the parser gained a positional target and `-o`. |
| Session parsing | **MISSING** | The package has a YAML **writer** (`yaml.ts`) and no reader anywhere in `src/`. Skills read sessions with the agent's own file tools; tests use the `yaml` devDependency. So "reuse the skills' parser" was not possible — there is none. Built one (below). |
| Image processing | **NONE — built** | No image dependency existed. Verdict and reasoning below. |
| Verdict vocabulary | **NOTE** | Verdicts are `pass` / `fail` / `skip` / `null`. The task's "not-tested" is `null` (the QA skill's existing convention); `skip` is a legacy widget value. The report renders all four. |

### Image-library verdict (the STOP condition)

The STOP condition was: *"recompression requires a native dependency in the MAIN package → STOP"*.
**It does not.** No dependency was added at all.

| Option | Rejected because |
|---|---|
| `sharp` | Native binary. Would be pulled into every browser project's `npm install sluglist`. |
| `sharp` as `optionalDependencies` | **Does not solve it** — npm installs optional dependencies by default; they merely tolerate failure. The binary still downloads. |
| `sharp` as optional `peerDependency` | Not installed by default, so `sluglist report` breaks zero-config until the user installs it manually. |
| `jimp` (pure JS) | Satisfies "no native binaries" but adds a large tree to a package whose entire runtime is two lazily-imported deps. |
| **Hand-rolled, `node:zlib` only** | **Chosen.** Zero install cost, zero tree growth, CLI-only code path so the browser bundle is unaffected. |

Feasibility was spiked before committing: PNG's happy path is `zlib.inflateSync` plus scanline
unfiltering, and Node ships zlib. [`src/cli/png.ts`](src/cli/png.ts) decodes (non-interlaced, 8/16-bit,
colour types 0/2/3/4/6, tRNS) and box-filter downscales; [`src/cli/jpeg.ts`](src/cli/jpeg.ts) is a
baseline JPEG encoder with the standard T.81 Annex K tables, 4:4:4 (chroma is **not** subsampled —
report screenshots are text and UI edges, where 4:2:0 smears coloured type).

Unsupported input never breaks a report: the original bytes are embedded verbatim instead.

---

## Phase 1 — Evidence in the format and the writer

Format **1.6**, additive. `checklist.items[].evidence` = `screenshots` (list) + optional `note`.

```yaml
    - id: reports-export-csv
      section: Reports
      title: "On Reports, Export CSV downloads a CSV file of the table"
      verdict: pass
      issue: null
      ts: 2026-08-11T14:43:00Z
      evidence:
        screenshots:
          - ev-reports-export-csv-01.png
        note: "Clicked Export CSV on /reports — reports-2026-08.csv downloaded, 57 bytes, header \"Report,Rows\", 3 data rows (Q1 revenue,412 …)"
```

Schema decisions, fixed in [SPEC.md](SPEC.md):

- **`screenshots` is always a list**, never a scalar alternative — chosen up front so the shape never
  has to change. `[]` is valid (a note-only observation).
- **No `ts` inside `evidence`.** The task sketch had one, but the item's own `ts` already records the
  moment the verdict (and therefore its evidence) was captured; a second timestamp would be noise
  that could disagree with the first.
- `note` is clipped to 500 chars and scrubbed with the session's other page-derived text.
- Files are `ev-<item-id>-NN.png`, following the existing zero-padded per-subject numbering.

Writer: `setVerdict(id, verdict, { evidence: { screenshots, note } })`, screenshots as buffers **or**
file paths. Valid on any verdict — on `fail` it supplements the linked issue, which stays primary.

**Backward compatibility** is asserted, not assumed: a session recording neither evidence nor intent
is byte-identical to a 1.5 one apart from the version line
([`test/evidence.test.ts`](test/evidence.test.ts), "byte-identical to 1.5"). All 404 pre-existing
tests still pass unchanged except for the deliberate version-string bump.

15 tests in [`test/evidence.test.ts`](test/evidence.test.ts): pass with evidence, pass without, fail
with evidence over its issue, multi-screenshot numbering, note clipping, note scrubbing, file-path
input, note-only evidence, not-tested staying bare, and the intent cases.

---

## Phase 1b — The session reader (unplanned, required)

The audit found no reader, so `sluglist report` needed one. Adding the `yaml` package as a runtime
dependency would have put a parser into every browser install for a CLI-only feature, so
[`src/node/read.ts`](src/node/read.ts) parses exactly the subset the serializer emits.

Hand-rolling a parser is the risky half of this change, so it is verified **differentially**: for
every YAML artifact in the repository, `parseYaml` must return exactly what the reference `yaml`
implementation returns ([`test/read.test.ts`](test/read.test.ts), 29 tests).

That test found two real things:

1. **A pre-existing serializer defect.** `formatScalar` leaves `0x0` (a mobile graceful-mode viewport)
   unquoted, and a spec-compliant YAML parser reads it as hexadecimal **0**, not the string `"0x0"` —
   so any third-party parser misreads that field. Out of scope here; the divergence is asserted
   explicitly in the test rather than hidden, and the fix is queued as separate work.
2. My own test fixture was unrealistic (`id: 01` unquoted); the writer does quote it, correctly.

---

## Phase 2 — QA skill: evidence mode + the anti-theatre rule

[`skills/sluglist-qa/SKILL.md`](skills/sluglist-qa/SKILL.md) gains `evidence: "fails" | "all"`
(`fails` = previous behaviour, still the default) and the rule, stated in full with worked
good/bad notes:

> **A screenshot proves "the screen looked like this". It does not prove "the action worked."**
> … A `pass` with no observable fact behind it is not a pass — it is `not tested`.

Good: *"Clicked Export on /reports — report_2026-08.xlsx downloaded, 34 KB, 247 rows"*.
Bad: *"Export works"* (restates the item), *"Clicked Export, no errors"* (absence of errors is not
evidence the file arrived).

Proven in Phase 6 rather than asserted: the export item's note carries the real downloaded filename,
byte count and row count — read off the file on disk, because the screen showed nothing.

---

## Phase 3 — Checklist intents and the storage convention

- Additive `intent` on the config, carried to `session.yaml` as `checklist.intent`. Validated for
  *shape* (slug, ≤ 40 chars) but not vocabulary, so a future intent needs no format change.
- [`skills/sluglist-checklist/SKILL.md`](skills/sluglist-checklist/SKILL.md) restructured around four
  intents, with two new modes:
  - **smoke** — routes/navigation first, then project docs; one or two checks per page ("what would
    fail loudly if this page were broken"); critical paths ordered auth → core CRUD → payment; capped
    at 30 items by default with anything cut named in the summary.
  - **scenario** — decomposes a written brief into steps and the error cases the brief names, grounded
    in the real routes. Its defining rule: **stay inside the brief**; anything the generator thinks
    belongs but the brief omits goes to a "Possibly worth adding" list, never a silent item.
- Convention `.sluglist/checklists/<name>.json`, documented in both skills and the README.
- **Dev server**: the task made this conditional on being cheap. It was — `GET /checklists/<name>.json`
  serves that one folder read-only, so the widget can load a checklist without a copy into `public/`.
  The name pattern makes traversal unrepresentable (no separators, `.json` required); four tests cover
  traversal, wrong extension, and non-exposure of session artifacts through the route.

---

## Phase 4 — `sluglist report`

`npx sluglist report [session-dir] [-o out.html]`. With no arguments: newest session in `.sluglist/`,
output `report.html` beside it.

**Self-containment** is asserted statically and observed at runtime:

- Tests: no `<link>`, no `<iframe>`, no `@import`, no `<script src=>`; every `src` is a `data:` URI;
  every `href` is an in-document anchor.
- Runtime: opened from `file://` in the browser pane with devtools recording — **zero network
  requests**. Static inventory of the file: 3 `<img>` (all `data:`), 1 inline `<script>`, 0 `<link>`.
  The only `http://` string in the document is the application URL shown as text.

| Property | Result |
|---|---|
| Report size, Phase 6 session (5 items, 6 screenshots) | **146 KB** (149,524 bytes) — budget was ≤ 8 MB |
| Source PNGs in that session | 103,315 bytes across 5 files |
| Size guard | > 25 MB triggers one rebuild at 800px / q50 with a warning |
| Lightbox | Native `<dialog>`; the full image **is** the thumbnail, CSS-scaled — verified `lightbox.src === thumbnail.src`, so each image is stored once |
| Print | `@media print` drops the lightbox, grids the thumbnails, forces a light theme — [shot-print.pdf](evidence/report/shot-print.pdf) |
| No checklist | Renders as a plain issue list (tested) |
| Missing image file | Warned, and the note still renders (tested) |
| Hostile content | Titles/notes are escaped, not injected (tested with `</h1><img src=x onerror=…>`) |

Image pipeline correctness is established against an **independent decoder** rather than its own
inverse: JPEGs are handed to the platform image stack (`sips`) and the pixels compared with what the
encoder was given. A real screenshot round-trips at **mean absolute error 2.3/255** at q70, and flat
colours at < 2 — consistent with lossy JPEG, and impossible if the encoder were structurally wrong.
On hosts without `sips` those three tests skip; the structural ones still run.

The report also keeps whichever encoding is smaller: for the sparse demo screenshots the source PNG
beat JPEG, so those were embedded as PNG.

---

## Phase 5 — Documentation

| Doc | Change |
|---|---|
| [SPEC.md](SPEC.md) | → v1.6. `evidence` sub-table with its semantics note, `checklist.intent`, `intent` in the config interface, `ev-*.png` and `report.html` in the folder layout, the "no `ts` of its own" decision recorded. |
| [README.md](README.md) | New **Reports** section (one command, the screenshot, what's in the file, offline/lightbox/print/budget). "Generate a checklist — four intents" table + the `.sluglist/checklists/` convention. "Evidence-backed passes" under *For agents*, with the anti-theatre rule. Report referenced from the *Client acceptance* scenario and the agent-loop diagram. Format version → 1.6. |
| [CHANGELOG.md](CHANGELOG.md) | 1.13.0 entry, including why the image pipeline is hand-rolled. |
| Skills | QA: evidence modes, the rule, new prohibitions, report hand-off. Generator: four intents, smoke + scenario algorithms, storage convention. |

---

## Phase 6 — E2E: generator → QA (`all`) → fix → report

Demo app "Reportly" ([`app.mjs`](evidence/report/app.mjs)) with three pages and **one planted bug**
(the Save handler looks up element id `tost`, so the confirmation never shows). The checklist was
built for the `smoke` intent and deliberately mixes the three evidence shapes.

Driven by headless Chrome over the **DevTools Protocol** ([`cdp.mjs`](evidence/report/cdp.mjs)) rather
than Playwright — the previous run's driver is not installed here, and a ~150 MB browser download was
not worth it when the host already has Chrome.

Result — every verdict kind, with the right evidence for each:

| Item | Verdict | Evidence |
|---|---|---|
| `dashboard-greeting` | **pass** | Screenshot + *"heading read \"Good afternoon, Dana\", open report count showed 3"* |
| `reports-table` | **pass** | Screenshot + *"table listed 3 reports: Q1 revenue = 412; Q2 revenue = 388; Churn cohort = 97"* |
| `reports-export-csv` | **pass** | Screenshot + *"reports-2026-08.csv downloaded, 57 bytes, header \"Report,Rows\", 3 data rows"* ← **invisible result: the fact comes from the file on disk, not the screen** |
| `settings-save-confirms` | **fail** | Issue `01` with screenshot, plus supplementary evidence *"the toast element is still display:none"* |
| `settings-digest-persists` | **not tested** | No verdict, no evidence — the item names a "quarterly reconciliation" with no surface in the app |

Then the fix agent adopted the session and wrote `fixes.yaml` (`fixed`, commit, note,
`checklist_item`), and `npx sluglist report` — **no arguments** — produced the file. The report shows
all of it: 3 pass / 1 fail / 1 not tested, the notes, the thumbnails, the issue in full, and its
`FIXED` badge with the commit.

### Clean install — no native binaries

```
$ npm pack && npm install ./sluglist-1.13.0.tgz     # in an empty project
added 15 packages, and audited 16 packages in 598ms
found 0 vulnerabilities

installed: core-util-is html-to-image immediate inherits isarray jszip lie pako
           process-nextick-args readable-stream safe-buffer setimmediate sluglist
           string_decoder util-deprecate

native artifacts (*.node, *.dylib, *.so, *.a): 0
packages with install/build scripts: none
```

The tree is **identical to 1.12.0's** — this work added no dependency. `npx sluglist report` was then
run from that clean install against the Phase 6 session and produced the same 146 KB file, proving
the image pipeline needs nothing beyond Node.

---

## Limitations & deferrals (as scoped)

- **No viewer app, no live updates.** The report is a static snapshot of a finished run.
- **English only.** No locale option in v1.
- **No diff reports** between sessions.
- **No video.** A recording is represented by the first frame of each clip, captioned with the frame
  count and the folder — embedding frame sequences as base64 would inflate the file for little proof.
- **No PDF generation in the tool.** The print stylesheet plus the browser's Print → PDF is enough.
- Attachments are **listed, not inlined** (name, mime, size, and the filename in the session folder).
  The report is a document, not a container.

## Known issues found but not fixed here

- **`formatScalar` leaves hex-ambiguous scalars unquoted** (`viewport: 0x0` → `0` in any compliant
  YAML parser). Pre-existing, unrelated to this change, and fixing it alters serializer output bytes,
  so it is queued separately rather than folded in. `test/read.test.ts` documents the exact divergence.

## Open — needs your call

- **`npm publish`** — version is bumped to 1.13.0 (minor, additive) and the changelog is written, but
  nothing has been published or pushed.
- **Landing page.** The README carries the report screenshot; `docs/` (the Next.js site) has not been
  touched and nothing has been deployed. Deploying is an outward-facing action, so it is left for you
  — say the word and I will add the report to the checklist/agent section and deploy.
