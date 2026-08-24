# sluglist artifact format — v1.8

This is the on-disk contract sluglist produces for each feedback session. It is stable and safe to
build parsers against: **within a major version the format only ever changes additively** (new optional
fields), so a parser written for 1.x keeps working as 1.x grows.

Source of truth: `src/artifacts.ts` (`buildSessionYaml`, `buildIssueMarkdown`, `issueEntries`),
`src/errors.ts`, `src/actions.ts` and `src/checklist.ts`. Every field below exists in that code.

## Versioning

- `session.yaml` starts with `format_version: "1.8"` (a quoted string, always the first line).
- **Missing `format_version` ⇒ treat as `"1.0"`** (artifacts written before versioning was added).
- **1.1** added the additive `checklist:` block (acceptance checklist verdicts) and the
  `checklist_item` issue field; everything from 1.0 is unchanged.
- **1.2** added the additive `clips:` issue frontmatter (a per-clip breakdown of a recording) and the
  `<frames_dir>/<clip-id>/NN.png` frame layout it discriminates. Recordings written before 1.2 have no
  `clips:` and use the flat `<frames_dir>/NN.png` layout — both are readable (see the frames note below).
- **1.3** added the additive `scrubbed` issue field (whether the text surfaces of the issue went through
  the PII scrub). Emitted only when `privacy.scrubText` was set explicitly or by the production preset.
- **1.4** added, all additive and all emitted only when the corresponding feature is used:
  - `screenshot_failed` / `screenshot_error` (issue) — the render failed and the issue was delivered
    without a picture. A reader should treat such an issue as a normal comment-only issue.
  - `form` (session.yaml) — answers to `scope: "session"` reporter fields.
  - `form` (issue) — answers to `scope: "issue"` reporter fields.
  - `attachments` (issue) — files the reporter attached, stored next to the issue.
- **1.5** added, all additive:
  - `reporter.kind` (`"human"` | `"agent"`) in the session/issue `reporter` block and the `fixed_by`
    block below. **Absent ⇒ human** (every pre-1.5 artifact was human-reported).
  - the optional per-session **`fixes.yaml`** file — a fix agent's machine-readable resolution
    records (full dictionary below). **A session without `fixes.yaml` is valid**: it has simply not
    been through a fix pass.
  - `retest_of` in the checklist *config* (input contract, below) — provenance of a re-test checklist.
- **1.6** added, all additive:
  - `checklist.items[].evidence` — optional proof attached to a verdict (`screenshots` + `note`).
    Its purpose is symmetry: a `fail` has always been evidenced by its linked issue, so a `pass` may
    now be evidenced too, and a reader can verify a verdict rather than trust it. **Absent ⇒ the
    reporter recorded a bare verdict**, which stays valid and is still the default.
  - `checklist.intent` (session.yaml) and `intent` in the checklist *config* — why the checklist
    exists (`branch` | `re-test` | `smoke` | `scenario`, open-ended). Absent when undeclared.
- **1.7** added, all additive:
  - `checklist.retest_of` (session.yaml) — the id of the checklist this run re-tests, carried
    through from the checklist config (where `retest_of` has existed since 1.5). It makes the rounds
    of one fix→re-test cycle chainable from `session.yaml` alone, which is what `sluglist status`
    reads to decide whether a loop has converged. **Absent ⇒ a first-pass run.**
- **1.8** added, all additive:
  - `title` in the issue frontmatter — a heading written by whoever files the report (an agent, a
    script), used by `sluglist report` instead of a truncated first sentence. **Absent unless
    written**, and never a replacement for the comment: the report shows the original text verbatim
    underneath, so a title that drifts from what the reporter meant stays checkable.
- The number is `MAJOR.MINOR`:
  - **MINOR** bumps for additive changes (a new optional field/section). Parsers must ignore unknown
    fields and keep working.
  - **MAJOR** bumps only for a breaking change (renaming/removing a field, or changing the meaning or
    type of an existing one). This is avoided; a v2 would be a deliberate new contract.
- The `FeedbackConnector` interface is orthogonal to this and does not change with the format.

## Session folder

Delivered per session, one folder:

```
{project}/session-{YYYY-MM-DD}-{shortid}/
  session.yaml                     # index, upserted on every issue
  fixes.yaml                       # 1.5, optional: fix-agent resolution records (upserted per fix)
  report.html                      # 1.6, optional: `sluglist report` output — a self-contained
                                   #   rendering of this folder, not an input to any reader
  ev-{item-id}-01.png              # 1.6, optional: verdict evidence, numbered per checklist item
  01-{slug}.md                     # one issue: YAML frontmatter + body
  01-{slug}.png                    # the issue screenshot (absent when none)
  01-{slug}-2.png                  # extra screenshots (2..n), only if multiple
  01-{slug}-att-01.png             # reporter attachments (1.4), numbered per issue;
                                   #   the extension is the attached file's own
  01-{slug}-frames/                # record mode only
    clip-01/                       # one folder per clip (a Record→Stop cycle)
      01.png  02.png  …            # per-clip, 1-based; 01.png = clip's start state
    clip-02/
      01.png  …
  02-{slug}.md
  …
```

Files are POSIX paths relative to the session folder. `slug` derives from the comment. Issue numbers
are zero-padded and monotonic within a session.

## `session.yaml`

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `format_version` | string | yes | 1.0 | The format version this session was written with (currently `"1.8"`); always the first line. |
| `project` | string | yes | 1.0 | Project slug. |
| `session_id` | string | yes | 1.0 | `session-YYYY-MM-DD-xxxx`. |
| `created_at` | string (ISO 8601) | yes | 1.0 | Session start. |
| `base_url` | string | yes | 1.0 | Origin the session ran on. |
| `browser` | string | yes | 1.0 | e.g. `Chrome 138`. |
| `os` | string | yes | 1.0 | e.g. `macOS`. |
| `viewport` | string | yes | 1.0 | `WxH` CSS px. |
| `device_pixel_ratio` | number | yes | 1.0 | |
| `screen` | string | optional | 1.0 | Physical resolution `WxH`; emitted when known. |
| `language` | string | optional | 1.0 | Primary UI language. |
| `languages` | string[] | optional | 1.0 | Ordered preferences. |
| `timezone` | string | optional | 1.0 | IANA tz. |
| `color_scheme` | string | optional | 1.0 | `light` \| `dark`. |
| `reduced_motion` | boolean | optional | 1.0 | |
| `reporter` | map \| null | optional | 1.0 | Present only when `identity` configured (`null` if empty). Keys: `user_id`, `email`, `name`, `kind` (1.5: `human` \| `agent`; absent ⇒ human). |
| `form` | map | optional | 1.4 | Answers to `scope: "session"` reporter fields, asked once on the first issue. Snake_case keys → string/number/boolean. Never scrubbed. |
| `checklist` | map | optional | 1.1 | Present only when a checklist is configured. See below. |
| `issues` | list | yes | 1.0 | `[]` when empty; otherwise a list of the entries below. |

### `checklist` (acceptance checklist, 1.1)

Present only when the widget is configured with a `checklist`. It is the client's per-session sign-off
map — a coverage snapshot of *this* run, not a durable status.

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.1 | Checklist id. |
| `title` | string | yes | 1.1 | Human title. |
| `intent` | string | optional | 1.6 | Why this checklist exists — see the vocabulary below. Open vocabulary: readers must tolerate an unknown value. Absent when the config declared none. |
| `retest_of` | string | optional | 1.7 | Id of the checklist this run re-tests, carried from the config. Present only on a re-test round; it chains the rounds of one fix→re-test cycle. |
| `items` | list | yes | 1.1 | One entry per checklist item (below). |

#### `intent` vocabulary (1.6)

Provenance only — no consumer behaviour depends on the value, and an unknown one must be carried
through untouched.

| Value | The checklist is built from | Lifecycle |
|---|---|---|
| `branch` | `git diff <base>...HEAD` | One release/PR hand-off; discarded after the run. |
| `re-test` | a session's `fixes.yaml` | One follow-up run; carries `retest_of` back to the original. |
| `smoke` | the app's routes + docs | One broad pass; regenerated freely, not kept. |
| `regression` | the app's routes + docs initially, then the branch diff | **Maintained**: committed at `.sluglist/checklists/regression.json` and updated incrementally after each merge — additions and removals proposed to the user, item ids kept stable so verdicts in past sessions still map. Never regenerated in place. |
| `scenario` | a written brief from the owner | One focused run; kept only if the flow is re-tested often. |

Each `items[]` entry:

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.1 | Item id (unique within the checklist). |
| `section` | string | yes | 1.1 | Section title the item belongs to (may be `""`). |
| `title` | string | yes | 1.1 | The client-facing check. |
| `verdict` | string \| null | yes | 1.1 | `pass` \| `fail` \| `skip`, or `null` when not yet checked. See note on `skip`. |
| `issue` | string \| null | yes | 1.1 | The id of the issue that documents a flag; else `null`. See note. |
| `ts` | string \| null | yes | 1.1 | ISO time the verdict was set; `null` when unset. |
| `evidence` | map | optional | 1.6 | Proof for this verdict (below). Absent for a bare verdict. |

#### `evidence` (verdict proof, 1.6)

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `screenshots` | list of string | yes | 1.6 | Evidence file names, in order; each sits next to `session.yaml` as `ev-<item-id>-NN.png`. `[]` is valid (a note-only observation). |
| `note` | string | optional | 1.6 | One line stating the **observed fact**; ≤ 500 chars. Scrubbed with the session's other page-derived text when `scrubText` is on. |

The block is valid on **any** verdict:

- on `pass` it is the point of the feature — the screenshot and note that let a reader verify the
  sign-off instead of trusting the reporter;
- on `fail` it is supplementary: the linked `issue` remains the primary evidence;
- an item with **no verdict** (`null`) carries no evidence — there is nothing to show.

`evidence` has **no `ts` of its own**: it is captured at the moment the verdict is recorded, which the
item's own `ts` already states.

**Semantics a reader should know** (enforced by the `sluglist-qa` skill, not by the format): a
screenshot proves *the screen looked like this*, never *the action worked*. For checks whose result is
invisible on screen — a download, a submission, a background job — the `note` is expected to carry the
observable fact (downloaded file name and size, toast text, a changed counter) rather than a
restatement of the item's title.

Verdicts are written **put-per-verdict**: every action upserts `session.yaml` (same idempotent path as
per-issue writes). In the widget the client either **checks a row off** (`verdict: pass`) or **flags a
problem** on it (`verdict: fail`), which opens the normal issue flow; that issue's frontmatter carries
`checklist_item` pointing back at the item.

- **`skip`** remains a valid value **on read** (older artifacts may carry it), but the current widget UI no
  longer generates it — a v1.2 session will only ever write `pass`, `fail`, or `null`.
- A `null` verdict may still carry a non-null `issue`: the client checked an item, flagged it, then withdrew
  their verdict. The filed issue is not retractable, so the link is preserved even though the sign-off is not.

### `issues[]` (session index entry)

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.0 | Zero-padded, e.g. `"01"`. |
| `file` | string | yes | 1.0 | Markdown file name. |
| `screenshot` | string \| null | yes | 1.0 | First PNG file name, or null. |
| `category` | string | optional | 1.0 | Emitted only when set. |
| `screenshots` | string[] | optional | 1.0 | Only when an issue has more than one PNG. |
| `screen` | string \| null | optional | 1.0 | For grouping; emitted only when set. |
| `frames` | number | optional | 1.0 | Record mode: frame count. |
| `url` | string | yes | 1.0 | Path relative to `base_url`. |
| `selector` | string \| null | yes | 1.0 | Element-mode selector, else null. |
| `created_at` | string (ISO 8601) | yes | 1.0 | |

## `NN-{slug}.md` — issue file

YAML frontmatter between `---` fences, then the reporter's comment, then optional sections.

| Frontmatter | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.0 | |
| `url` | string | yes | 1.0 | |
| `selector` | string \| null | yes | 1.0 | |
| `selector_strategy` | string \| null | optional | 1.0 | `testid` \| `id` \| `aria` \| `path`. Emitted for every mode (null off-element). |
| `selector_unique` | boolean \| null | optional | 1.0 | |
| `mode` | string | yes | 1.0 | `element` \| `fullpage` \| `area`. |
| `category` | string | optional | 1.0 | |
| `title` | string | optional | 1.8 | Author-written heading, 5–8 words describing what was seen. The report prefers it over the first sentence; it never replaces the comment. |
| `checklist_item` | string \| null | optional | 1.1 | Present when this issue is a checklist item's fail-evidence; the item's id. |
| `element_text` | string \| null | optional | 1.0 | Visible text of the clicked element (≤ 80 chars). |
| `dom_path` | string \| null | optional | 1.0 | Tag path with no classes. |
| `component` | string \| null | optional | 1.0 | Nearest named React component; null when unknown (no React / anonymous / minified). |
| `screen` | string \| null | optional | 1.0 | Nearest `data-screen`/`data-page`. |
| `viewport` | string | yes | 1.0 | |
| `screenshot` | string \| null | yes | 1.0 | |
| `screenshots` | string[] | optional | 1.0 | Only when more than one PNG. |
| `masked` | boolean | optional | 1.0 | Emitted only when privacy is configured. |
| `scrubbed` | boolean | optional | 1.3 | Whether the text surfaces went through the PII scrub. |
| `screenshot_failed` | boolean (`true`) | optional | 1.4 | Only on the failure path: a screenshot was attempted, the render failed, the issue was sent without it. `screenshot` is `null`. |
| `screenshot_error` | string \| null | optional | 1.4 | Why it failed (renderer message, `timed out`, `blank image`). Scrubbed like any page-derived text. |
| `form` | map | optional | 1.4 | Answers to `scope: "issue"` reporter fields. Never scrubbed — the reporter typed them deliberately. |
| `attachments` | list | optional | 1.4 | Files the reporter attached. One entry per file: `{ file, mime, size, original_name }`. |
| `errors_count` | number | optional | 1.0 | Present once error capture is engaged (0 when none). |
| `actions_count` | number | optional | 1.0 | Present once the action trail is engaged. |
| `recording` | boolean (`true`) | optional | 1.0 | Record mode only. |
| `frames_count` | number | optional | 1.0 | Record mode only. Total frames across all clips. |
| `frames_dir` | string | optional | 1.0 | Record mode only. Parent dir; frames live under `<frames_dir>/<clip-id>/NN.png`. |
| `clips` | list | optional | 1.2 | Record mode only. One entry per clip: `{ id, frames }`. See below. |
| `created_at` | string (ISO 8601) | yes | 1.0 | |
| `reporter` | map \| null | optional | 1.0 | Mirrors the session reporter; present only when `identity` configured. `kind` key since 1.5. |
| `custom` | map \| null | optional | 1.0 | Static project fields (`config.custom`). Present only when configured. |
| `context` | map \| null | optional | 1.0 | Runtime host state (`setContext`). Present only once `setContext` has been called. |

`reporter`, `custom` and `context` are one-level maps of snake_case keys → string/number/boolean, or
`null` when configured-but-empty.

### Body sections

The body is the trimmed comment, optionally followed by these sections (in this order):

**`## Errors`** — one line per captured error, newest context last:

```
- [<age> before report] <source>: <message>
      <indented stack, if any>
```

`<age>` is relative (`3s` / `2m` / `1h`). `<source>` ∈ `console` | `exception` | `rejection` |
`network`. Network lines are failed requests only (status ≥ 400 or a network error) and carry no
bodies, headers or query strings:

```
- [4s before report] network: POST /api/animals → 500 (240ms)
- [2s before report] network: GET /api/feed → network error (120ms)
```

**`## Actions`** — one line per recent user action (the reproduction trail):

```
- [<age> before report] <action>[ — clip N, frame NN]
```

`<action>` is one of:

- `click <selector> ("<text>")`
- `navigate <from> → <to>` (paths only, query stripped)
- `submit <selector>`
- `type (<n> chars) <selector>` (character count only — never the typed value)

`— clip N, frame NN` is appended when record mode captured a frame for that action, matching
`<frames_dir>/clip-0N/NN.png`. Older (pre-1.2) artifacts instead append `— frame NN` matching the flat
`<frames_dir>/NN.png`; a reader should accept both.

### `clips` (record-mode breakdown, 1.2)

Present in a recording issue's frontmatter, one entry per clip (a Record→Stop cycle), in order:

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.2 | `clip-01`, `clip-02`, … — also the subfolder name under `frames_dir`. |
| `frames` | number | yes | 1.2 | Frame count in this clip (files `01.png … NN.png` inside `<frames_dir>/<id>/`). |

Read each clip as its own sequence — clips are separate recordings on the same issue, not one continuous
timeline; frame numbering restarts at `01` per clip. A recording always has at least `clip-01` (a single
recording is one clip). An artifact with `recording: true`, `frames_count`/`frames_dir`, and **no** `clips`
is a pre-1.2 recording with the flat `<frames_dir>/NN.png` layout.

## `fixes.yaml` — fix-agent resolution records (1.5)

Written into the session folder by a fix pass (the `sluglist-fix` skill via the `sluglist/node`
writer, or any tool producing the same shape). **Optional**: a session without it is valid and simply
has not been fixed yet. Upserted **by `issue` id** as fixing progresses — re-fixing an issue replaces
its record; the file never accumulates duplicates.

```yaml
format_version: "1.8"
fixed_by:
  name: fix-agent
  kind: agent
items:
  - issue: "01"
    status: fixed
    commit: a1b2c3d
    note: Null check added in ExportButton
    checklist_item: export-button-visible
    ts: 2026-08-09T18:40:00Z
```

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `format_version` | string | yes | 1.5 | First line, same versioning as session.yaml. |
| `fixed_by` | map \| null | optional | 1.5 | Fixer identity; same keys/rules as `reporter` (incl. `kind`). |
| `items` | list | yes | 1.5 | `[]` when empty; one entry per handled issue. |

Each `items[]` entry:

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `issue` | string | yes | 1.5 | Issue id the record resolves, e.g. `"01"`. Unique within the file (upsert key). |
| `status` | string | yes | 1.5 | `fixed` \| `wontfix` \| `needs_info`. |
| `commit` | string | optional | 1.5 | Commit hash of the fix (expected for `fixed`). |
| `note` | string | optional | 1.5 | One-line note: what was done / why not / what is missing. |
| `checklist_item` | string | optional | 1.5 | The checklist item the issue was evidence for, when linked. |
| `ts` | string (ISO 8601) | yes | 1.5 | When the record was written. |

Reader rules: only `status: fixed` items enter a re-test checklist; `wontfix` and `needs_info` are
surfaced to the owner instead. Unknown fields are ignored (additive growth, as everywhere).

## Checklist config (input — the shape the generator emits)

Not an on-disk artifact, but the contract between the `sluglist-checklist` generator skill and the widget:
the developer authors this JSON (inline or served at a URL) and the widget renders it. Documented here so
the generator and the reader agree on one source of truth.

```ts
interface Checklist {
  id: string;                    // kebab-case slug; a re-test checklist uses "<orig>-retest-N"
  title: string;                 // document-style heading
  description?: string;          // 1–2 sentence instruction shown in the panel header (≤ 280 chars)
  retest_of?: string;            // 1.5, additive: id of the checklist this one re-tests (provenance;
                                 //   set by the generator's re-test mode, ignored by the widget)
  intent?: string;               // 1.6, additive: why this checklist exists — "branch" | "re-test" |
                                 //   "smoke" | "regression" | "scenario". Open vocabulary; carried into
                                 //   session.yaml as `checklist.intent`. Ignored by the widget.
  sections: { title: string; items: ChecklistItem[] }[];
}
interface ChecklistItem {
  id: string;                    // unique kebab-case slug
  title: string;                 // client-voice check (≤ 120 chars, no code terms)
  hint?: string;                 // one-line human navigation ("Open the dashboard and pick any assessment")
  url?: string;                  // STATIC route only → rendered as an "Open ↗" navigation chip
  url_match?: string;            // wildcard pattern for DYNAMIC routes ("/assessments/*") → "you're here"
                                 //   highlight only, never navigated. Must contain `*`.
}
```

Rules the widget enforces (invalid input is dropped with a `console.warn`, never thrown — a bad checklist
must not block plain capture): ≤ 20 sections, ≤ 50 items total, titles clipped to 120 chars, description to
280, `intent` to 40 and matching the id pattern, unique item ids. **`url` is for static routes only**; a dynamic route (an id/uuid segment) uses `hint`
+ a **wildcard** `url_match` and never a guessed `url`. A `url_match` without a `*` is not a pattern (it is a
static path) and is dropped with a warning. `url` and `url_match` may coexist (a list `url` + a detail
`url_match`). The widget maps a check to `verdict: pass`, a flag to `verdict: fail` + an issue; it never
emits `skip`.

## Privacy invariants (part of the contract)

- The action trail records the *fact and place* of an action, never entered content; `type` logs only
  a count; password fields are not logged by default; navigation drops query strings.
- Network entries record method, path (no query), status and duration only.
- `component`/`context`/`custom`/`reporter` contain only what the host configured or exposed.
