---
name: sluglist-checklist
description: Generate a client-facing acceptance checklist from the current branch's diff, for the sluglist widget's checklist mode. Use when the user says "generate a checklist", "make an acceptance checklist", "checklist from this branch", or "sluglist checklist".
---

# sluglist-checklist

Turn a branch of work into a **client acceptance checklist** the sluglist widget can render (checklist
mode). The developer runs this before a release; the client opens the app with the widget, walks the
checklist, and records a verdict per item (pass / fail / skip). Your job is to translate a code diff
into a list of things a **non-developer** can open, look at, and confirm.

## When to use

- The user says "generate a checklist", "acceptance checklist", "checklist from this branch/PR", or
  "sluglist checklist".
- A release/QA hand-off where someone will click through the app to sign off on what shipped.

## Input

- The current branch versus its base: `git diff <base>...HEAD` (three-dot: what this branch added).
- **Base branch:** default to `main`, then `master` if `main` is absent. Honor an explicit base the
  user gives ("checklist against `develop`").
- Also useful: `git diff --stat <base>...HEAD` for the shape, and reading the changed files
  themselves — the diff shows *what* changed; the files show *where it renders*.

## What goes in the checklist (and what never does)

A checklist item is something a client can **see or do in the running app**. Include:

- New or changed **pages / routes / screens**.
- New or changed **UI components** (buttons, forms, modals, tables, empty states, toasts).
- **User-visible text** (labels, copy, error messages) — when the change is meaningful to a user.
- New **user-facing flows** (an export, an invite, a checkout step, a filter).

**Never** include — these are invisible to a client and only add noise:

- Refactors, renames, internal restructuring that doesn't change behavior.
- Tests, fixtures, snapshots.
- Build config, CI, tooling, dependency bumps, types, lockfiles.
- Pure backend/internal changes with no visible surface (unless they change something on screen).

## Algorithm

1. **Resolve the base** (above) and read `git diff <base>...HEAD`. If the branch is huge, work from
   `--stat` first, then read the files with user-facing changes.
2. **Extract the visible surface.** For each changed file that renders something, ask: *what would a
   user notice?* Map the change to a route/page where it appears (read the router / file path to find
   the URL). Discard anything from the "never include" list.
3. **Group into sections by feature**, not by file. A "Export" feature might touch a button, a route,
   and a toast — that's one section, three items (or fewer). Keep sections coherent and few.
4. **Write each item in the client's voice.** State what to open and what to see or do, with no code
   terms. Give the `url` of the page where it's checked, and an optional one-line `hint`.
   - Bad (developer voice): "`ExportButton` renders when `canExport` is true".
   - Good (client voice): "On **Reports**, the **Export** button is visible and downloads a CSV."
5. **Emit JSON** in the `Checklist` shape (below) to the project's checklist file — default
   `public/checklist.json` (so the app can serve it and pass `checklist: "/checklist.json"`), or a
   path the user names. Then give the user a short summary: how many sections/items, and the file path.

## Output shape

Write valid JSON matching the widget's `Checklist` type:

```json
{
  "id": "export-release-2026-07",
  "title": "Export + notifications release",
  "sections": [
    {
      "title": "Export",
      "items": [
        {
          "id": "export-button-visible",
          "title": "On Reports, the Export button is visible and downloads a CSV",
          "url": "/reports",
          "hint": "Click Export — a file should download"
        }
      ]
    }
  ]
}
```

- `id` (checklist and items): a short kebab-case slug, unique per item.
- `title`: the client-facing sentence (≤ 120 chars). No code identifiers.
- `url` (optional): the page where the item is verified.
- `hint` (optional): one extra line of guidance.
- Limits the widget enforces: ≤ 20 sections, ≤ 50 items total. Stay well under — a checklist a human
  will actually finish is short. If the diff is larger, prioritize the most user-visible changes.

## Rules

- **Client voice, always.** Self-check every `title`: if it contains a component name, a prop, a
  function, a CSS class, or a file path, rewrite it. A title should make sense to someone who has never
  seen the code.
- **Don't invent checks.** Only write items you can trace to a real change in the diff. If you're
  guessing what a change does, it doesn't belong in the checklist.
- **Surface the ambiguous, don't bury it.** Changes you can't confidently turn into a client check
  (unclear user impact, backend-only, or you can't find where they render) go into a short
  **"Not included — please confirm"** list in your summary to the user — never faked as checklist items.
- **Group by feature, keep it short.** Prefer a few meaningful items over one-per-file exhaustiveness.
- **Additive only.** You produce the checklist JSON; you don't touch the widget config or app code
  unless the user asks you to wire `checklist: "/checklist.json"` into their `createFeedbackWidget`.

## After generation

Tell the user to serve the file and point the widget at it:

```ts
createFeedbackWidget({
  project: "myapp",
  connectors: [/* ... */],
  checklist: "/checklist.json", // or the inline object
});
```

The widget shows a second circle above the feedback button with a progress badge; the client walks the
list, and every verdict lands in `session.yaml` under `checklist:` (fails linked to their issue via
`checklist_item`). The `sluglist-fix` skill then reads that coverage map.
