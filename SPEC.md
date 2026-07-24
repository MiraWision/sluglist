# sluglist artifact format — v1.1

This is the on-disk contract sluglist produces for each feedback session. It is stable and safe to
build parsers against: **within a major version the format only ever changes additively** (new optional
fields), so a parser written for 1.x keeps working as 1.x grows.

Source of truth: `src/artifacts.ts` (`buildSessionYaml`, `buildIssueMarkdown`, `issueEntries`),
`src/errors.ts`, `src/actions.ts` and `src/checklist.ts`. Every field below exists in that code.

## Versioning

- `session.yaml` starts with `format_version: "1.1"` (a quoted string, always the first line).
- **Missing `format_version` ⇒ treat as `"1.0"`** (artifacts written before versioning was added).
- **1.1** added the additive `checklist:` block (acceptance checklist verdicts) and the
  `checklist_item` issue field; everything from 1.0 is unchanged.
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
  01-{slug}.md                     # one issue: YAML frontmatter + body
  01-{slug}.png                    # the issue screenshot (absent when none)
  01-{slug}-2.png                  # extra screenshots (2..n), only if multiple
  01-{slug}-frames/                # record mode only
    01.png  02.png  …
  02-{slug}.md
  …
```

Files are POSIX paths relative to the session folder. `slug` derives from the comment. Issue numbers
are zero-padded and monotonic within a session.

## `session.yaml`

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `format_version` | string | yes | 1.0 | Always `"1.0"`; first line. |
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
| `reporter` | map \| null | optional | 1.0 | Present only when `identity` configured (`null` if empty). Keys: `user_id`, `email`, `name`. |
| `checklist` | map | optional | 1.1 | Present only when a checklist is configured. See below. |
| `issues` | list | yes | 1.0 | `[]` when empty; otherwise a list of the entries below. |

### `checklist` (acceptance checklist, 1.1)

Present only when the widget is configured with a `checklist`. It is the client's per-session sign-off
map — a coverage snapshot of *this* run, not a durable status.

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.1 | Checklist id. |
| `title` | string | yes | 1.1 | Human title. |
| `items` | list | yes | 1.1 | One entry per checklist item (below). |

Each `items[]` entry:

| Field | Type | Required | Since | Notes |
|---|---|---|---|---|
| `id` | string | yes | 1.1 | Item id (unique within the checklist). |
| `section` | string | yes | 1.1 | Section title the item belongs to (may be `""`). |
| `title` | string | yes | 1.1 | The client-facing check. |
| `verdict` | string \| null | yes | 1.1 | `pass` \| `fail` \| `skip`, or `null` when not yet checked. |
| `issue` | string \| null | yes | 1.1 | For a `fail`, the id of the issue that documents it; else `null`. |
| `ts` | string \| null | yes | 1.1 | ISO time the verdict was set; `null` when unset. |

Verdicts are written **put-per-verdict**: every click upserts `session.yaml` (same idempotent path as
per-issue writes). A `fail` opens the normal issue flow; that issue's frontmatter carries
`checklist_item` pointing back at the item.

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
| `checklist_item` | string \| null | optional | 1.1 | Present when this issue is a checklist item's fail-evidence; the item's id. |
| `element_text` | string \| null | optional | 1.0 | Visible text of the clicked element (≤ 80 chars). |
| `dom_path` | string \| null | optional | 1.0 | Tag path with no classes. |
| `component` | string \| null | optional | 1.0 | Nearest named React component; null when unknown (no React / anonymous / minified). |
| `screen` | string \| null | optional | 1.0 | Nearest `data-screen`/`data-page`. |
| `viewport` | string | yes | 1.0 | |
| `screenshot` | string \| null | yes | 1.0 | |
| `screenshots` | string[] | optional | 1.0 | Only when more than one PNG. |
| `masked` | boolean | optional | 1.0 | Emitted only when privacy is configured. |
| `errors_count` | number | optional | 1.0 | Present once error capture is engaged (0 when none). |
| `actions_count` | number | optional | 1.0 | Present once the action trail is engaged. |
| `recording` | boolean (`true`) | optional | 1.0 | Record mode only. |
| `frames_count` | number | optional | 1.0 | Record mode only. |
| `frames_dir` | string | optional | 1.0 | Record mode only. |
| `created_at` | string (ISO 8601) | yes | 1.0 | |
| `reporter` | map \| null | optional | 1.0 | Mirrors the session reporter; present only when `identity` configured. |
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
- [<age> before report] <action>[ — frame NN]
```

`<action>` is one of:

- `click <selector> ("<text>")`
- `navigate <from> → <to>` (paths only, query stripped)
- `submit <selector>`
- `type (<n> chars) <selector>` (character count only — never the typed value)

`— frame NN` is appended when record mode captured a frame for that action (matching `frames_dir/NN.png`).

## Privacy invariants (part of the contract)

- The action trail records the *fact and place* of an action, never entered content; `type` logs only
  a count; password fields are not logged by default; navigation drops query strings.
- Network entries record method, path (no query), status and duration only.
- `component`/`context`/`custom`/`reporter` contain only what the host configured or exposed.
