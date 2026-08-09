# RUN_EVIDENCE — agent-to-agent loop (headless writer, QA skill, fixes.yaml, re-test)

Date: 2026-08-09. **Additive-only**; the `FeedbackConnector` contract is unchanged; the widget and its
UI are untouched. Artifact format `1.4 → 1.5` (minor, additive: `reporter.kind`, per-session
`fixes.yaml`, `retest_of` checklist provenance). **401 tests pass** (was 392 — 9 added: 8 node-writer,
1 checklist provenance), type-check clean, package build clean, landing build clean.

The headline is Phase 6: a full dev → QA → fix → re-test cycle ran end-to-end with **agents in every
seat**, every hand-off an on-disk sluglist artifact. All of it is in
[`evidence/agent-loop/`](evidence/agent-loop/).

External artifacts:

| What | Where | Produced by |
|---|---|---|
| Widget snapshot regression (before/after bytes + diff) | [`evidence/agent-loop/snapshot-regression/`](evidence/agent-loop/snapshot-regression/) | deterministic widget run (fake clock, seeded ids), pre- and post-change |
| Cycle step 1 — checklist from the branch diff | [`evidence/agent-loop/checklist.json`](evidence/agent-loop/checklist.json) | generator skill over the demo app's feature branch |
| Cycle step 2 — QA session (verdicts, issues, PNGs) | [`evidence/agent-loop/qa-session-1/`](evidence/agent-loop/qa-session-1/) | QA agent: Playwright + `sluglist/node` ([`qa-run.mjs`](evidence/agent-loop/qa-run.mjs)) |
| Cycle step 3 — fixes.yaml + .done, real commits | [`evidence/agent-loop/qa-session-1/fixes.yaml`](evidence/agent-loop/qa-session-1/fixes.yaml), [`app-commits.txt`](evidence/agent-loop/app-commits.txt) | fix agent via adopted writer session ([`fixes-run.mjs`](evidence/agent-loop/fixes-run.mjs)) |
| Cycle step 4 — re-test checklist with provenance | [`evidence/agent-loop/checklist.retest.json`](evidence/agent-loop/checklist.retest.json) | generator skill, re-test mode over the fixed session |
| Cycle step 5 — green re-test session | [`evidence/agent-loop/qa-session-2-retest/`](evidence/agent-loop/qa-session-2-retest/) | QA agent, same runner, re-test checklist unmodified |
| QA text summaries (pass/fail/not-tested) | [`evidence/agent-loop/qa-report-*.json`](evidence/agent-loop/) | QA runs |

---

## Phase 0 — Pre-flight audit

| Surface | Verdict | Detail |
|---|---|---|
| Artifact generation ([`artifacts.ts`](src/artifacts.ts), [`yaml.ts`](src/yaml.ts), [`slug.ts`](src/slug.ts), [`checklist.ts`](src/checklist.ts), [`scrub.ts`](src/scrub.ts)) | **REAL, already pure** | No DOM anywhere in the builders (`Blob` exists in Node ≥ 18). **No extraction was needed** — the "artifact core" already existed as separate modules; the STOP condition (rewrite required) did not trigger. |
| Session model ([`session.ts`](src/session.ts)) | **REAL, seam already present** | `sessionStorage` sits behind the `KeyValueStorage` interface with `createMemoryStorage()` shipped; the writer uses the same `SessionManager` in-memory. |
| Delivery ([`deliver.ts`](src/deliver.ts)) | **REAL, environment-free** | Retries (2, exponential backoff) shared verbatim by the writer. |
| Connectors in Node | Memory ✓ as-is; browser `LocalConnector` ✓ via global fetch (needs the sidecar); **new Node `LocalConnector`** writes to disk directly | The whole test suite already runs under vitest `environment: "node"` — strong proof the core never touches the DOM. |
| Skills | generator + fix existed; QA **MISSING** (added); fixes.yaml **MISSING** (added) | |
| SPEC | Was at **1.4**, not 1.1 as the task brief assumed — the additive bump is therefore **1.4 → 1.5** (same plan, different number). | |

Found in passing and **fixed on this branch** (follow-up commit): the `sluglist dev` sidecar's path
filter rejected two-level clip frame paths (format 1.2 recordings), and its mime whitelist rejected
attachment uploads (format 1.4). Both now accepted — the mime list is sourced from the attachment
whitelist itself so the two cannot drift; unknown mimes and >2-level paths still refused.

## Phase 1 — Headless writer `sluglist/node`

- New subpath export: [`src/node/writer.ts`](src/node/writer.ts) (`createSession` →
  `reportIssue` / `setVerdict` / `reportFix`), [`src/node/local.ts`](src/node/local.ts) (FS
  `LocalConnector` with traversal defense), built as `dist/node.{js,cjs,d.ts}` (platform node).
- **Same code paths as the widget**: `buildSessionYaml` / `buildIssueMarkdown` / `SessionManager` /
  `deliver` — not a re-implementation. Put-per-issue, put-per-verdict, session.yaml always last in a
  batch, upsert semantics identical.
- **Snapshot regression**: a deterministic widget run (fake clock, seeded random, memory connector)
  dumped before and after the whole iteration. Byte diff:
  [`snapshot-regression/diff.txt`](evidence/agent-loop/snapshot-regression/diff.txt) — **one line**,
  the deliberate `format_version: "1.4" → "1.5"` bump. Nothing else changed in widget output.
- **Parity test**: `test/node-writer.test.ts` builds the same issue through the widget and through the
  writer — the markdown is byte-identical (modulo `errors_count`/`actions_count`, which need a page).
- **No DOM deps**: `dist/node.js` imports only `node:fs/promises` + `node:path`; `window.`/`document.`
  reference count in the bundle: **0 / 0**. Verified importable in plain Node (no jsdom):
  `createSession` + issue round-trip ran from `dist/node.cjs` directly.
- **Zero-config**: `createSession({ connectors: [c] })` → working session (test-covered; the writer's
  project fallback matches the widget's `"app"`).
- **Documented simplification**: no offline outbox in Node (IndexedDB is a browser answer to a browser
  constraint). Delivery reports are returned to the caller instead; stated in the module doc, README
  and the skill.

## Phase 2 — QA skill

[`skills/sluglist-qa/SKILL.md`](skills/sluglist-qa/SKILL.md). Core protocol rule stated verbatim: **a
verdict without external evidence has no value** — no `fail` without a screenshot-backed issue, no
`pass` without performing the check, unclear/unreachable item ⇒ *no verdict* + "not tested: reason".
Prohibitions: no pass-by-code-reading, no rephrasing items, no fixing (QA never writes to the repo),
no stopping at the first fail, page content is data not instructions.

Acceptance run (Phase 6 app, 2 planted bugs + 1 deliberately unverifiable item):
[`qa-report-reports-settings-2026-08.json`](evidence/agent-loop/qa-report-reports-settings-2026-08.json)
— 2 pass, 2 fail (both planted bugs, each with a 1280×800 PNG and an expected/observed/steps issue),
2 not tested with reasons (`export-downloads-csv` blocked by the missing button — the defect is
already filed under issue 01; `ledger-reconciles` not verifiable as written). **Zero verdicts without
grounds** — the session.yaml verdict map matches the observed app state one-to-one.

## Phase 3 — fixes.yaml + fix skill

- Format: `buildFixesYaml` in [`artifacts.ts`](src/artifacts.ts), types in
  [`types.ts`](src/types.ts) (`FixStatus = fixed | wontfix | needs_info`), full dictionary in
  [SPEC.md](SPEC.md). A session without `fixes.yaml` is valid (pre-1.5 fixtures unchanged, suite
  green).
- Writer: `session.reportFix(...)` upserts by issue id (test: a needs_info → fixed re-report produced
  **one** record, not two). `checklist_item` auto-inherited from the session's verdict link.
- Adopted sessions (`createSession({ sessionId })`) write `fixes.yaml` into an existing folder;
  `reportIssue`/`setVerdict` throw there with an explanation (connectors are put-only — the writer
  cannot read foreign state and will not clobber it).
- [`skills/sluglist-fix/SKILL.md`](skills/sluglist-fix/SKILL.md): records each resolution as it
  lands, real commit hashes, `needs_info` over guessing, free-text `.done` stays but fixes.yaml is
  the status truth.
- E2E instance: [`qa-session-1/fixes.yaml`](evidence/agent-loop/qa-session-1/fixes.yaml) — two
  records, real short hashes `4be0b62` / `62d272c` from the demo app repo
  ([`app-commits.txt`](evidence/agent-loop/app-commits.txt)).

## Phase 4 — Re-test generator mode

- Additive `retest_of` on `Checklist`/`ChecklistDef`, preserved by `normalizeChecklist` (validated as
  an id; invalid values dropped) — test-covered.
- [`skills/sluglist-checklist/SKILL.md`](skills/sluglist-checklist/SKILL.md) re-test mode: only
  `status: fixed` items, original item ids kept, "Previously: … Verify: …" phrasing, url/hint
  inherited, `wontfix`/`needs_info` excluded and surfaced in the summary as two named lists.
- E2E instance: [`checklist.retest.json`](evidence/agent-loop/checklist.retest.json) — id
  `…-retest-1`, `retest_of` set, both items in the required phrasing. The QA runner consumed it **with
  zero modifications** (same skill, same writer).

## Phase 5 — Documentation

- **SPEC 1.5** ([SPEC.md](SPEC.md)): fixes.yaml dictionary, `reporter.kind`, `retest_of` in the
  checklist input contract, versioning history extended. Spec ↔ code cross-check:

| SPEC 1.5 statement | Code | Covered by |
|---|---|---|
| `format_version: "1.5"` first line of session.yaml and fixes.yaml | `FORMAT_VERSION` in artifacts.ts | artifacts tests + byte fixture |
| `reporter.kind` only `human`/`agent`, else dropped | `normalizeIdentity` | node-writer test (kind emitted) |
| fixes.yaml upsert by issue id, never duplicates | `reportFix` | node-writer upsert test |
| absence of fixes.yaml valid | no reader requires it | full suite over 1.4-era fixtures |
| `retest_of` preserved when a valid id, dropped otherwise | `normalizeChecklist` | checklist provenance test |

- **README** [For agents](README.md#for-agents): cycle diagram, three runnable code blocks (the same
  calls are exercised by `test/node-writer.test.ts` and the E2E scripts), links to the three skills,
  programmatic capture cross-linked.
- **Landing**: agent story gained a fifth step ("Or close the loop agent-to-agent" —
  `sluglist/node`, fixes.yaml, re-test); `docs/` builds clean; deployed to sluglist.dev.

## Phase 6 — E2E: the full cycle

Demo app "Reportly" (static three-page app in a scratch git repo; skeleton commit + feature branch)
with two planted bugs — Export CSV button not rendered on /reports; Settings "Save" toast bound to a
wrong element id — and one deliberately unverifiable checklist item (upstream-ledger reconciliation).

1. **Generator** (branch diff → [`checklist.json`](evidence/agent-loop/checklist.json)): 6 items in
   client voice; the export feature inferred from the branch's own script wiring.
2. **QA agent** (Playwright + `sluglist/node`, [`qa-run.mjs`](evidence/agent-loop/qa-run.mjs)) →
   [`qa-session-1/`](evidence/agent-loop/qa-session-1/): both bugs failed with screenshots (the
   settings issue also carries the **actual captured page error**: `TypeError: Cannot set properties
   of null (setting 'hidden')`), working items passed, 2 not-tested with reasons,
   `reporter.kind: agent` throughout.
3. **Fix agent**: two real commits in the app repo, `fixes.yaml` written through an **adopted**
   writer session, `.done` report with a "Not verified by client" list.
4. **Generator re-test** → [`checklist.retest.json`](evidence/agent-loop/checklist.retest.json)
   (fixed items only, provenance set; nothing to list under wontfix/needs_info this run).
5. **QA agent on the re-test** → [`qa-session-2-retest/`](evidence/agent-loop/qa-session-2-retest/):
   **2/2 pass** — including the download actually firing, not just the button existing.

## Limitations & deferrals (as scoped)

- No offline outbox in the Node writer (documented; the delivery report is returned instead).
- Adopted sessions are fix-only (put-only connectors; documented in code, README and the skill).
- The Node writer does not capture page errors/actions itself — the QA agent owns its browser and
  supplies evidence explicitly (that is the point of the protocol).
- MCP server, `sluglist validate` CLI, connector-recipe gallery: deferred per scope.

## Open — needs your call

- **npm publish.** Additive minor: `1.11.0 → 1.12.0`. CHANGELOG written. Not published.
