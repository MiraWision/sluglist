---
name: sluglist-checklist
description: Generate a client-facing acceptance checklist from the current branch's diff (for the sluglist widget or a QA agent), or a re-test checklist from a fixed session's fixes.yaml. Use when the user says "generate a checklist", "make an acceptance checklist", "checklist from this branch", "re-test checklist", or "sluglist checklist".
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
   terms. Point the client at the page with the link fields below, and add an optional one-line `hint`.
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
  "description": "Walk each item and check it off. Flag anything that looks wrong.",
  "sections": [
    {
      "title": "Export",
      "items": [
        {
          "id": "export-button-visible",
          "title": "On Reports, the Export button is visible and downloads a CSV",
          "url": "/reports",
          "hint": "Click Export — a file should download"
        },
        {
          "id": "assessment-detail-header",
          "title": "Opening any assessment shows the new summary header",
          "hint": "Open the dashboard and pick any assessment",
          "url": "/dashboard",
          "url_match": "/assessments/*"
        }
      ]
    }
  ]
}
```

- `id` (checklist and items): a short kebab-case slug, unique per item.
- `title`: the client-facing sentence (≤ 120 chars). No code identifiers.
- `description` (optional): a 1–2 sentence instruction shown in the panel header (≤ 280 chars).
- `url` (optional): the page where the item is verified. **Static routes only** (see below).
- `url_match` (optional): a wildcard path pattern for **dynamic** routes (see below).
- `hint` (optional): one extra line of human navigation ("Open the dashboard and pick any assessment").
- Limits the widget enforces: ≤ 20 sections, ≤ 50 items total. Stay well under — a checklist a human
  will actually finish is short. If the diff is larger, prioritize the most user-visible changes.

### Linking items to pages — `url` vs `url_match`

The widget shows an **"Open ↗" chip** for `url` (a real navigation) and a subtle **"You're here"** highlight
for `url_match` (no navigation — just tells the tester which items belong to the page they're on). Pick by
whether the route is static or dynamic:

- **Static route** (e.g. `/reports`, `/settings/billing`) → set `url` to it. The chip navigates the client
  straight there.
- **Dynamic route** — a path with an id/uuid/slug segment (`/assessments/:id`, `/orders/:orderId`,
  `/u/9f2c…`) → **do NOT set `url`.** There is no single correct id to link to. Instead:
  - write a `hint` with human navigation ("Open the dashboard and pick any assessment"), and
  - set `url_match` to a **wildcard** pattern for the dynamic route: `"/assessments/*"`. `*` matches one
    path segment. This only drives the "you're here" highlight — it is never navigated.
- **Mixed** (a list page plus a detail page) → set **both**: `url` to the static list (`/dashboard`), and
  `url_match` to the dynamic detail (`/assessments/*`). The chip takes them to the list; the highlight lights
  the item up once they open a detail.

**Never invent a concrete id in `url`.** `url: "/assessments/123"` or any fabricated uuid is wrong — you
cannot know a real id from the diff. A dynamic route is *always* `hint` + `url_match`, never a guessed `url`.
Non-wildcard `url_match` values (a plain static path) are dropped by the widget with a warning, so keep the
`*` in.

## Rules

- **Client voice, always.** Self-check every `title`: if it contains a component name, a prop, a
  function, a CSS class, or a file path, rewrite it. A title should make sense to someone who has never
  seen the code.
- **Don't invent checks.** Only write items you can trace to a real change in the diff. If you're
  guessing what a change does, it doesn't belong in the checklist.
- **Never invent a route id.** For a dynamic route, use `hint` + `url_match` (wildcard) — never a `url`
  with a fabricated id. See "Linking items to pages" above.
- **Surface the ambiguous, don't bury it.** Changes you can't confidently turn into a client check
  (unclear user impact, backend-only, or you can't find where they render) go into a short
  **"Not included — please confirm"** list in your summary to the user — never faked as checklist items.
- **Group by feature, keep it short.** Prefer a few meaningful items over one-per-file exhaustiveness.
- **Additive only.** You produce the checklist JSON; you don't touch the widget config or app code
  unless the user asks you to wire `checklist: "/checklist.json"` into their `createFeedbackWidget`.

## Re-test mode — a checklist from a fixed session

When the user says "re-test checklist" / "generate the re-test" (or points you at a session folder
after a fix pass), you are not reading a diff — you are reading a **session folder** that has been
through the QA → fix cycle:

- `session.yaml` — the original checklist block with verdicts and issue links;
- `NN-*.md` — the filed issues;
- `fixes.yaml` — the fix agent's resolution records (`fixed` | `wontfix` | `needs_info` per issue).

**Input**: the session folder path. If it has no `fixes.yaml`, stop and say so — there is nothing to
re-test until a fix pass has run.

**Algorithm**:

1. Read `fixes.yaml`. Take only records with `status: fixed`.
2. For each fixed record, find its checklist item: the record's `checklist_item`, or the
   `checklist.items[]` entry whose `issue` matches. A fixed issue with no checklist link still gets a
   re-test item — derive it from the issue file's comment (what was reported is what to re-check).
3. Emit a new checklist containing **only** those items, with provenance:
   - checklist `id`: `<original-id>-retest-1` (bump the suffix if that id was already used);
   - checklist `retest_of`: the original checklist id;
   - item `id`: keep the original item id (verdicts must map back);
   - item `title`: a *verification of the fix*, structured as "Previously: <what was broken>.
     Verify: <what must now be true>" — e.g. "Previously: Export button missing on Reports.
     Verify: the button is visible and downloads a file". Client voice still applies.
   - `url` / `url_match` / `hint`: inherited from the original item (or derived from the issue's
     `url` when the item was unlinked).
4. `wontfix` and `needs_info` records are **excluded** from the re-test checklist. List them in your
   summary under two separate headings — "Won't fix (by decision)" and "Needs info (blocked)" — so the
   owner sees exactly what dropped out of the loop and why.
5. Write the file (default `checklist.retest.json` next to the original, or a path the user names) and
   summarize: N items to re-test, the two excluded lists, the file path.

The re-test checklist is a perfectly normal `Checklist` — the widget and the `sluglist-qa` skill
consume it without any special handling; `retest_of` is provenance for readers, nothing more.

## After generation

Tell the user to serve the file and point the widget at it:

```ts
createFeedbackWidget({
  project: "myapp",
  connectors: [/* ... */],
  checklist: "/checklist.json", // or the inline object
});
```

The widget shows a second circle above the feedback button (badge = items left, then ✓ when done). The
client walks the list with a simple model — **click a row to check it off; click the slug button on a row
to flag a problem** (that opens the normal issue flow and links the issue back). Every action lands in
`session.yaml` under `checklist:`: a plain check is `verdict: pass`, a flagged item is `verdict: fail` +
`issue` (linked to the `NN-*.md` via `checklist_item`), and untouched items stay `verdict: null`. The
`sluglist-fix` skill then reads that coverage map.
