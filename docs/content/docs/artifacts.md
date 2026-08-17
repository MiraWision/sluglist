Delivered per session under `{project}/session-{YYYY-MM-DD}-{shortid}/`:

```
session.yaml            # upserted on every issue, always consistent
01-{slug}.md            # one markdown file per issue, YAML frontmatter + body
01-{slug}.png           # optional screenshot(s)
01-{slug}-frames/       # record-mode clips
  clip-01/01.png …
02-{slug}.md
...
```

`session.yaml` carries the environment (browser, OS, viewport, screen, DPR, language(s), timezone,
color scheme, reduced-motion) plus an index of issues. Each `NN-{slug}.md` repeats the per-issue
metadata in frontmatter followed by the free-text comment.

**The structure and frontmatter are a stable contract** intended as input for downstream parsers
and agents — they only ever change additively. `session.yaml` starts with
`format_version: "1.4"`; a missing version means `"1.0"`. Within a major version, new fields are
only ever added, never removed or repurposed. The full field dictionary, section rules and
versioning policy live in
[SPEC.md](https://github.com/MiraWision/sluglist/blob/main/SPEC.md) — safe to build parsers
against.

> [!NOTE]
> Within a major version the format only ever changes **additively** — new optional fields. A parser
> written for 1.x keeps working as 1.x grows, so ignore fields you do not know rather than failing on
> them.

## An issue file, annotated

```markdown
---
id: "01"
url: /dashboard/animals
selector: 'button[aria-label="Save"]'
selector_strategy: aria          # how the selector was derived
selector_unique: true            # it matches exactly one element
mode: element                    # element | area | fullpage | comment
category: bug
element_text: "Save"
dom_path: "body > main > form > button"
component: AnimalForm            # React component hint (element mode, best-effort)
screen: dashboard
viewport: 1512x982
screenshot: 01-save-does-nothing.png
masked: true                     # inputs were masked in the render
errors_count: 1
actions_count: 4
recording: true
frames_count: 3
frames_dir: 01-save-does-nothing-frames
created_at: 2026-07-23T14:05:10Z
reporter:                        # present only when identity is configured
  user_id: u_18293
  email: "anna@acme.io"
  name: Anna K.
---

The Save button does nothing after I edit an animal — the form
just sits there, no toast, no error I can see.

## Errors
- [3s before report] console: PATCH /api/animals/128 500 (Internal Server Error)
- [2s before report] exception: Uncaught TypeError: Cannot read properties of undefined (reading 'id')
    at save (/assets/animals-4f2a.js:210:19)

## Actions
- [22s before report] navigate /dashboard → /dashboard/animals
- [12s before report] click #edit-128 ("Edit") — frame 02
- [5s before report] type (11 chars) input#name
- [1s before report] click button[aria-label="Save"] ("Save") — frame 03
```

## Sections an issue can carry

- `## Errors` — recent console errors, uncaught exceptions, promise rejections and failed network
  calls, each with a relative timestamp. See [error capture](/docs/capture/).
- `## Actions` — the action trail: clicks, SPA navigations, submits, typing (character count only,
  never content). Record-mode lines are tagged `— clip N, frame NN`.
- `## Console errors` — programmatic captures can append their own list.

## Optional frontmatter blocks

- `reporter` — from `identity` config (never collected by default).
- `custom` — flat project fields fixed at init.
- `context` — live host state from `setContext`, merged at capture time.
- `form` — the reporter's own answers ([form fields](/docs/capture/)).
- `attachments` — files the reporter attached, with `original_name` kept as data, never as a path.
- `screenshot_failed: true` + `screenshot_error` — when a render failed and the issue was delivered
  comment-only.
- `scrubbed: true` — the artifact went through the [PII text scrub](/docs/production/).

## Checklist verdicts

When [checklist mode](/docs/checklist/) is active, `session.yaml` additionally carries a
`checklist:` block — the coverage map of pass/fail/unchecked verdicts, each linking to the issue
that documents a failure.

## Selector quality

Selectors prefer `data-testid` → `id` → `aria` → landmark path, and never emit Tailwind utility or
hashed CSS-Modules classes. `selector_strategy` names which rung was used and `selector_unique`
says whether it matches exactly one element — an agent can trust the selector or fall back to
`dom_path` + `element_text`.
