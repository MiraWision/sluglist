---
name: sluglist-fix
description: Read local sluglist feedback from a project's .sluglist/ folder and fix the reported issues. Use when the user says "read feedback", "fix feedback", or "sluglist", or when a .sluglist/ folder is present in the project.
---

# sluglist-fix

Close the local feedback loop: someone clicked feedback with the sluglist widget while testing the app
locally, `sluglist dev` wrote it into `.sluglist/`, and now you read those issues and fix them.

## When to use

- The user says "read feedback", "fix feedback", or "sluglist".
- A `.sluglist/` directory exists at the project root (or wherever `sluglist dev --dir` wrote it).
- A legacy `.snaglist/` directory exists (the folder name before the rename) and there is no
  `.sluglist/` — treat it as the feedback folder and note "legacy folder name" in your report.

## What's in `.sluglist/`

```
.sluglist/
  session-YYYY-MM-DD-xxxx/
    session.yaml          # index of issues in this session (order, files, url, selector, screen)
    01-<slug>.md          # one issue: YAML frontmatter + the reporter's comment (+ ## Errors)
    01-<slug>.png         # the screenshot for that issue (may be absent → screenshot: null)
    02-<slug>.md
    ...
    .done                 # YOU create this when the session is handled (its presence = handled)
```

Issue frontmatter fields you rely on: `url` (route/page), `selector` + `selector_strategy`,
`element_text` (the visible text of the clicked element), `component` (nearest named React component,
when known — a direct pointer to the source file), `screen`, `mode`, `errors_count`, `actions_count`,
and (for recordings) `recording: true` + `frames_count` + `frames_dir` + a `clips:` list. There may also be a `context`
block (runtime host state: tenant, feature flags, build version) — useful for reproducing under the
same conditions. The body has a `## Errors` section (recent page errors, including failed network
calls as `network: METHOD /path → status`) and a `## Actions` section (what the user did before
reporting, with relative time).

### `## Actions` — steps to reproduce

Read `## Actions` as the reproduction path. Before hunting for a fix, replay the chain in your head (or
against the code): a bug that only appears after a sequence (e.g. a value lost after navigating away and
back) is invisible from a single screenshot but obvious from the trail. The selectors and paths in the
trail are code entry points **on par with** the issue's own `selector`:

- `click <selector> ("text")` → find that control's handler.
- `navigate <from> → <to>` → the route change; look at what runs on enter/leave (state reset, refetch).
- `submit <selector>` → the form's submit handler.
- `type (N chars) <selector>` → a field was edited (only the count is recorded, never the value).

### Recording issues (`recording: true`)

A recording is split into **clips** — one per Record→Stop cycle. The frontmatter lists them:

```yaml
recording: true
frames_count: 8
frames_dir: 03-checkout-bug-frames
clips:
  - id: clip-01
    frames: 5
  - id: clip-02
    frames: 3
```

Frames live under `<frames_dir>/<clip-id>/NN.png` (e.g. `03-checkout-bug-frames/clip-01/01.png`), and the
`## Actions` lines carry `— clip N, frame NN` pointing at `clip-0N/NN.png`. Within each clip, `01.png` is
the initial state and `NN.png` is the state *after* action `NN`.

**Read each clip as its own sequence — do not stitch clips into one timeline.** Separate clips are separate
attempts/scenarios the tester recorded (e.g. "here's the happy path" then "here's what breaks"); their frame
numbering restarts at `01` per clip. Within a clip, find the two consecutive frames **between which the
defect appears** — that narrows the buggy code to whatever ran on that step.

*Older artifacts* (pre-clips) may instead have flat frames at `<frames_dir>/NN.png` with `frames_count` and
no `clips:` block — treat that as a single clip and read it in order.

### Checklist coverage (`checklist:` in `session.yaml`)

When the session was run against an acceptance checklist, `session.yaml` has a `checklist:` block: an
`id`, `title`, and `items[]`, each with a `verdict` (`pass` | `fail` | `skip` | `null`), an optional
`issue` (the id of the issue that documents a fail), and a `ts`. Read it as the client's sign-off map.
In the widget the client either **checks a row off** or **flags a problem** on it, which maps to three
states — use this vocabulary in your `.done` report:

- **checked-with-issue** = **`verdict: fail`** → a real defect the client hit. Its `issue` points to the
  `NN-*.md` issue with the full context (screenshot, selector, errors); the issue's frontmatter carries
  `checklist_item: <item id>` linking back. **These are your work items** — fix them like any issue, and
  note in `.done` which checklist item each fix closes.
- **not-tested** = **`verdict: null`** → the client did **not** verify this item. This is **not a task for
  you** — you can't manufacture a client's acceptance. List these in `.done` under a
  **"Not verified by client"** heading so the owner knows what still needs a human pass. (A `null` verdict
  that still carries an `issue` id is an item the client checked, flagged, then withdrew their verdict on —
  the issue was already filed and stays linked; treat the issue as a work item but the item as not-signed-off.)
- **checked-clean** = **`verdict: pass`** → confirmed working. Leave it alone; don't "improve" passed items.
- **`verdict: skip`** (legacy) → older artifacts may carry a deliberate skip; the current widget no longer
  produces it. Treat it as not-a-task; mention only if relevant.

The checklist is a per-session snapshot — verdicts are the output of *that* run, not a durable status.
Don't try to reconcile it across sessions or reopen items; just act on this session's fails and report
the gaps.

## Algorithm

1. **Find work.** List `.sluglist/session-*/` folders. If `.sluglist/` does not exist but a legacy
   `.snaglist/` does (the pre-rename folder name), use that folder instead and add a "legacy folder
   name (`.snaglist/`)" line to your `.done` report. Skip any session that already contains a `.done`
   file. Process the rest oldest-first.
2. **Read the index.** Open `session.yaml` for the ordered list of issues and their `base_url`. Its
   first line is `format_version` (e.g. `"1.0"`); a missing field means `"1.0"`. This document
   describes the 1.x format — read fields you don't recognize leniently and ignore unknown ones (the
   format only grows additively within a major version).
3. **Per issue:**
   a. Read `NN-<slug>.md` — the comment is the primary signal; also note `selector`, `element_text`,
      `screen`, `url`, and the `## Errors` section.
   b. **Look at `NN-<slug>.png`.** Always view the screenshot before changing code — the comment plus
      the picture together tell you what's actually wrong.
   c. **Localize the code.** Use, in order: `component` (grep for the component name — the most direct
      pointer when present), `selector` (map to the markup), `element_text` (grep for the visible
      string), and `url` (map to the route/page/file). The `screen` field narrows the area.
   d. **Fix** the smallest change that resolves the report.
4. **Report.** After handling a session, write `.sluglist/{session}/.done` — a short markdown report:
   per issue, `issue → file(s) touched → what you did` (or `needs clarification → why`). If the session
   had a `checklist:` block, add which checklist item each fix closed, and a **"Not verified by client"**
   list of the `verdict: null` items (a signal to the owner, not work you did).

## Rules

- **Use `## Actions` as the reproduction, and frames as evidence — not as spec.** Replay the steps
  against the code before searching for a fix. If your reading of the code contradicts the trail/frames
  (the sequence can't produce the reported state), record the contradiction in `.done` rather than
  forcing a fix to match the trail.
- **Look at the screenshot (and frames) before fixing.** The comment alone is often ambiguous.
- **Never guess a location.** If an issue can't be localized to a specific place with confidence, do
  NOT change code — record it in `.done` as `needs clarification` with what you'd need to proceed.
- **Only fix what was reported.** If you spot other problems while in the code, note them in the
  report; don't fix them silently.
- **Use `## Errors` for diagnosis, not as gospel.** A stack trace pinpoints a runtime bug; errors
  logged long before the report (large relative time) are a weak signal — corroborate with the
  comment/screenshot.
- Production stack traces may be minified, and in beta mode error text can contain PII — treat it as a
  hint.

## Installing this skill in a project

Copy this folder into the project's skills directory (or symlink it):

```bash
mkdir -p .claude/skills
cp -r node_modules/sluglist/skills/sluglist-fix .claude/skills/
```

Then run `npx sluglist dev` alongside your dev server, click feedback with the widget, and ask the
agent to "fix feedback".
