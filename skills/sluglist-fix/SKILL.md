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
and (for recordings) `recording: true` + `frames_count` + `frames_dir`. There may also be a `context`
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

Open the frames in `<frames_dir>/` **in order** and line them up with the numbered `## Actions` lines
(`— frame NN` ↔ `NN.png`; `01.png` is the initial state). Find the two consecutive frames **between
which the defect appears** — that narrows the buggy code to whatever ran on that step. Frame `NN.png`
shows the state *after* action `NN`.

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
   per issue, `issue → file(s) touched → what you did` (or `needs clarification → why`).

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
