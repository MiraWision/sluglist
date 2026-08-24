---
name: sluglist-checklist
description: Generate or maintain a client-facing acceptance checklist for the sluglist widget or a QA agent — from the current branch's diff, from a fixed session's fixes.yaml (re-test), as a broad smoke pass over the app, as the project's standing regression baseline, or focused on a written scenario. Use when the user says "generate a checklist", "make an acceptance checklist", "checklist from this branch", "re-test checklist", "smoke checklist", "regression checklist", "update the regression list from this branch", "checklist for <scenario>", or "sluglist checklist".
---

# sluglist-checklist

Produce a **client acceptance checklist** the sluglist widget can render (checklist mode) and the
`sluglist-qa` agent can walk. The developer runs this before a release; a client or a QA agent then
opens the app, walks the checklist, and records a verdict per item (pass / fail / skip). Your job is
to turn some source of truth into a list of things a **non-developer** can open, look at, and confirm.

## Project conventions first

If `.sluglist/PROJECT.md` exists, **read it before anything else**. Its answers override this skill's
defaults — the base branch for a `branch` diff above all. If it is absent, use the defaults below and
mention that `npx sluglist init` creates the file.

## Intents — pick one first

The source of truth differs; everything downstream (voice, limits, rules) is shared. Record the
choice in the checklist's `intent` field.

| Intent | Source of truth | Use when |
| --- | --- | --- |
| `branch` | `git diff <base>...HEAD` | "checklist from this branch/PR", a release hand-off. **Default.** |
| `re-test` | a session folder's `fixes.yaml` | "re-test checklist", after a fix pass |
| `smoke` | the app's routes/navigation + its docs | "smoke checklist", "test the basic flows", a first pass on an unfamiliar app |
| `regression` | the maintained `.sluglist/checklists/regression.json` (plus the branch diff, when updating it) | "the regression checklist", "update the regression list from this branch" |
| `scenario` | a written brief from the owner | "check the whole card-payment flow including the error cases" |

If the request is ambiguous, ask which one — the five produce very different lists.

`smoke` and `regression` share a generation algorithm and differ in **lifecycle**: a smoke list is a
one-off pass you throw away, a regression list is a committed baseline you *maintain* after every
merge. See "Regression mode" below.

## Where checklists live

Write to `.sluglist/checklists/<name>.json` (`smoke.json`, `regression.json`,
`feature-export.json`, `release-2026-08.json`…). One folder, one file per checklist, named for what
it covers. Both consumers take a path:

```ts
// widget
createFeedbackWidget({ checklist: "/checklists/smoke.json" /* or an inline object */ });
// QA agent / headless writer
createSession({ checklist: ".sluglist/checklists/smoke.json" });
```

The widget fetches over HTTP, so a checklist it must load has to be served by the app (copy or
symlink it under `public/`, or pass the object inline). The `sluglist/node` writer reads a **local
path** directly, which is what the QA agent uses — no serving needed.

## Input — `branch` intent

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

## Algorithm — `branch` intent

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
5. **Emit JSON** in the `Checklist` shape (below) to `.sluglist/checklists/<name>.json` (see "Where
   checklists live"), or a path the user names, with `"intent": "branch"`. Then give the user a short
   summary: how many sections/items, and the file path.

## Output shape

Write valid JSON matching the widget's `Checklist` type:

```json
{
  "id": "export-release-2026-07",
  "title": "Export + notifications release",
  "description": "Walk each item and check it off. Flag anything that looks wrong.",
  "intent": "branch",
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
- `intent` (optional): `branch` | `re-test` | `smoke` | `regression` | `scenario` — why this checklist exists. Set it
  always; it is carried into `session.yaml` and shown in the generated report.
- `retest_of` (optional, re-test only): the id of the checklist this one re-tests.
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

## Smoke mode — a broad pass over the whole app

When the user says "smoke checklist", "test the basic flows", "general checklist for the app", you
are not reading a diff — you are mapping **what the application is**.

**Sources**, in order of authority:

1. **Routes / navigation** — the router config, the pages/app directory, the nav menu component.
   This is the backbone: every significant page becomes one or a few items.
2. **The project's own docs** — README, docs/, onboarding notes. They say what the app is *for*,
   which tells you which pages are critical and which are incidental.
3. **The running app**, if it is up — the fastest way to see what a page actually offers.

**Algorithm**:

1. Enumerate the routes. Drop the ones with no user-facing surface (API handlers, redirects,
   `_app`/layout files, error boundaries).
2. For each remaining page, ask *what is this page for?* and write the **one or two checks that
   would fail loudly if the page were broken** — it loads, its primary content is there, its primary
   action works. Not an exhaustive audit of every control.
3. **Prioritise critical paths.** In order: authentication (sign in / sign out), the app's core CRUD
   (whatever the product is fundamentally for), payment or billing if present, then everything else.
   If you must cut, cut from the bottom.
4. **Cap the list at 30 items by default** (the widget's hard limit is 50; a smoke list a human will
   actually finish is shorter). If the app is bigger than that, keep the critical paths and say in
   your summary which areas you left out.
5. Group by area/page, one section per coherent area.
6. Write to `.sluglist/checklists/smoke.json` with `"intent": "smoke"`.

**Rules specific to smoke mode**: cover breadth, not depth — one solid check per page beats five
variations of the same one. Do not invent features you have not seen in the routes, the docs, or the
running app; if you cannot tell what a page does, list it under "Not included — please confirm"
rather than guessing a check for it.

## Regression mode — a standing baseline you maintain

A regression checklist is the same *kind* of list as a smoke one and a different *thing*: it lives in
the repo at **`.sluglist/checklists/regression.json`**, it is committed, and it is updated
incrementally after every merge. It answers "does everything that used to work still work?", so its
value comes entirely from staying current and staying finishable.

Two modes. Which one you are in is decided by whether the file already exists.

### Seeding it (the file does not exist yet)

Run the **smoke algorithm** exactly as written above — routes and docs as sources, one or two loud
checks per page, critical paths first (auth → core CRUD → payment → the rest), capped at ~30 items —
and write the result to `.sluglist/checklists/regression.json` with `"intent": "regression"`.

Then tell the user it is a committed baseline: commit it, and update it from each branch rather than
regenerating it (regenerating renames ids and throws away the verdict history in past sessions).

### Maintenance mode (the file exists) — the usual case

Trigger: "update the regression checklist from this branch", "add this feature to the regression
list", or the post-merge step of the `sluglist-loop` skill.

**Inputs**: the existing `regression.json` **and** `git diff <base>...HEAD` (base from
`.sluglist/PROJECT.md`, else `main`, else `master` — same resolution as the `branch` intent).

**Algorithm**:

1. **Read the existing file first.** You are editing a document with history, not producing a new one.
   Note its sections and every item id.
2. **Propose additions** for user-visible surface the diff *added*: **1–2 loud checks per feature**, at
   the same altitude as the rest of the list ("does this page still work", not "does this validation
   message have the right comma"). Fold each one into an existing section when one fits; only add a
   section for a genuinely new area. The "never include" list applies unchanged — refactors, tests,
   config and invisible backend work produce no items.
3. **Propose removals** for items whose surface the diff *deleted* — a route that no longer exists, a
   control that was removed. **Removals are proposed, never silent.** List each one as
   `<item id> — <title>` with the reason (the file/route the diff deleted), and wait for the user to
   confirm before writing. A removal you cannot justify from the diff is not a removal: leave the item
   and say you are unsure.
4. **Enforce the cap.** The list stays at **~30 items**. If your additions would push it past that, do
   **not** grow the file: say so, and name which existing items you would cut and why (lowest-value
   first — incidental pages, near-duplicate checks, areas covered by another item). Cutting is the
   user's call, exactly like a removal.
5. **Keep ids stable.** An unchanged item keeps its `id`, its `title` and its section — verdict
   history in past sessions maps by id, so a renamed id silently orphans it. Rewrite an item's title
   only when the diff changed what that check should say, and then keep the id.
6. **Write the file** in place (same path, `"intent": "regression"`), applying the additions and the
   confirmed removals. New items get ids in the existing naming style.
7. **Summarize as a diff of the list**, not as a new list: `+ N added` (id → title), `- N removed
   (confirmed)`, `= N unchanged`, plus anything you deliberately left out under "Not included —
   please confirm".

**Rules specific to regression mode**: never regenerate the file from scratch when it already exists
(that is what breaks id stability); never delete an item on your own judgement; and keep the list
finishable — a regression list nobody completes reports nothing.

## Scenario mode — a focused checklist from a written brief

When the owner describes a flow in words — "check the whole card-payment flow including the error
cases", "test what happens when an invite expires" — the brief is the specification and the
checklist is its decomposition.

**Algorithm**:

1. **Decompose the brief into steps a tester performs**, in the order they occur. A flow brief
   becomes: entry point → each step → the success end state → each error case the brief names.
2. **Ground each item in the real app.** Find the actual routes and controls for the flow (read the
   code or open the app) so items carry correct `url` / `url_match` / `hint`. The brief says *what*
   to test; the code says *where*.
3. **Stay inside the brief.** This is the defining rule of the intent: the owner asked for a focused
   list, and a focused list that quietly grows is no longer the thing they asked for.
   - In scope: everything the brief names, including error cases it names.
   - Out of scope: adjacent features, "while we're here" checks, general regressions.
   - Anything you believe genuinely belongs but the brief does not cover goes in your summary under
     **"Possibly worth adding"** — a suggestion for the owner, never a silent checklist item.
4. If the brief is too vague to decompose ("test the app properly"), say so and offer `smoke`
   instead — do not quietly turn a scenario request into a broad sweep.
5. Write to `.sluglist/checklists/<flow-name>.json` (e.g. `card-payment.json`) with
   `"intent": "scenario"`.

**Rules specific to scenario mode**: depth over breadth — here the variations *are* the point, so
error cases, edge inputs and the unhappy paths the brief names each get their own item.

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
   - checklist `intent`: `"re-test"`;
   - item `id`: keep the original item id (verdicts must map back);
   - item `title`: a *verification of the fix*, structured as "Previously: <what was broken>.
     Verify: <what must now be true>" — e.g. "Previously: Export button missing on Reports.
     Verify: the button is visible and downloads a file". Client voice still applies.
   - `url` / `url_match` / `hint`: inherited from the original item (or derived from the issue's
     `url` when the item was unlinked).
4. `wontfix` and `needs_info` records are **excluded** from the re-test checklist. List them in your
   summary under two separate headings — "Won't fix (by decision)" and "Needs info (blocked)" — so the
   owner sees exactly what dropped out of the loop and why.
5. Write the file (default `.sluglist/checklists/<original-name>-retest-1.json`, or a path the user
   names) and summarize: N items to re-test, the two excluded lists, the file path.

The re-test checklist is a perfectly normal `Checklist` — the widget and the `sluglist-qa` skill
consume it without any special handling; `retest_of` is provenance for readers, nothing more.

## After generation

Point the consumer at the file. For a QA agent, the local path is enough:

```ts
createSession({ connectors: [/* ... */], checklist: ".sluglist/checklists/smoke.json" });
```

For the widget, serve it (copy under `public/`) or pass the object inline:

```ts
createFeedbackWidget({
  project: "myapp",
  connectors: [/* ... */],
  checklist: "/checklists/smoke.json", // or the inline object
});
```

The widget shows a second circle above the feedback button (badge = items left, then ✓ when done). The
client walks the list with a simple model — **click a row to check it off; click the slug button on a row
to flag a problem** (that opens the normal issue flow and links the issue back). Every action lands in
`session.yaml` under `checklist:`: a plain check is `verdict: pass`, a flagged item is `verdict: fail` +
`issue` (linked to the `NN-*.md` via `checklist_item`), and untouched items stay `verdict: null`. The
`sluglist-fix` skill then reads that coverage map.
