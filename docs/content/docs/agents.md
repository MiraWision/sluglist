Test your app locally, click feedback with the widget, and have it land in a `.sluglist/` folder in
your project — then let an agent (e.g. Claude Code) read it and fix the issues. Browser JS can't
write to disk, so a tiny sidecar process, `sluglist dev`, sits between the widget and the folder.

## The local feedback loop

```ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

const widget = createFeedbackWidget({
  project: "my-app",
  connectors: [new LocalConnector()], // POSTs to http://127.0.0.1:4477 by default
});
mountFeedbackWidget(widget);
```

Gate it behind an env flag so it never initializes in production —
`enabled: process.env.NODE_ENV !== "production"`.

Run the sidecar next to your dev server:

```bash
npx sluglist dev                        # writes to ./.sluglist, port 4477
npx sluglist dev --dir .feedback --port 5511
```

Click feedback → the full artifact set appears under `.sluglist/session-*/`. The dev server binds
to `127.0.0.1` only and has **no authentication** — it is local-only by design; don't expose it or
forward its port. If it isn't running, `LocalConnector` warns once and your other connectors keep
working (the UI is never blocked).

> [!WARNING]
> The dev sidecar binds `127.0.0.1` and has **no authentication** — it is local-only by design.
> Don't expose it or forward its port.

> [!TIP]
> Add `.sluglist/` to your project's `.gitignore` — or let `npx sluglist init` do it, which also
> keeps the checklists and `PROJECT.md` tracked.

## Set the project up — `npx sluglist init`

One idempotent command scaffolds everything the loop needs:

```bash
npx sluglist init --agents-md
```

| It creates | Why |
|---|---|
| `.sluglist/checklists/` | Checklists are the committed spec — they live in the repo. |
| `.gitignore` rules | `.sluglist/*` ignored, with `checklists/` and `PROJECT.md` re-included: sessions stay local, the spec and the conventions are versioned. |
| `.claude/skills/*` | The four bundled skills (the `init-skills` step). |
| `.sluglist/PROJECT.md` | Your project's conventions — see [Project conventions](/docs/project-conventions/). |
| a "QA loop (sluglist)" section in `CLAUDE.md` / `AGENTS.md` | Only with `--agents-md`, and only if those files exist. |

Re-running reports what was already there and changes nothing. `--dir <path>` retargets the project
root. Two things are never overwritten: a skill you have edited (`--force` overrides), and
`.sluglist/PROJECT.md` — that holds your answers, so not even `--force` touches it.

## Let an agent fix it (Claude Code skill)

The package ships a `sluglist-fix` skill that reads `.sluglist/` and fixes the reported issues. It
arrives with `npx sluglist init` above, or on its own with:

```bash
npx sluglist init-skills
```

That copies every bundled skill into `.claude/skills/`. Re-running it is safe: unchanged skills are
refreshed silently, and any you have edited are reported and left alone (`--force` replaces them).

<details>
<summary>or copy manually</summary>

```bash
mkdir -p .claude/skills && cp -r node_modules/sluglist/skills/sluglist-fix .claude/skills/
```

</details>

Then, after clicking feedback, ask Claude Code to *"fix feedback"*: it reads each issue (comment,
selector, `element_text`, screenshot, `## Errors`), localizes and fixes the code, and writes a
`.done` report into the session folder.

Why it works well: [each artifact](/docs/artifacts/) is written for a file-reading agent —

- a **CSS selector** plus `dom_path` and `element_text` localize the element;
- a **React component hint** (`component: AnimalCard`, read from the fiber, no React dependency
  needed) localizes the source file;
- `## Errors` carries recent console errors, uncaught exceptions and failed requests with relative
  timestamps;
- `## Actions` carries the click/navigation trail, cross-referenced to record-mode frames.

Works with any agent that can read files — the skill is a convenience, not a dependency.

## Generate a checklist from a branch (the other direction)

The second bundled skill, `sluglist-checklist`, turns a branch diff into a client-facing acceptance
checklist (user-visible changes only, phrased for a non-developer), written to
`.sluglist/checklists/<name>.json` — which the widget loads with
`checklist: "/checklists/<name>.json"`. Ask Claude Code to *"generate a checklist from this
branch"*. See [Checklist mode](/docs/checklist/).

## The whole cycle — the `sluglist-loop` skill

Four skills ship in the package: one per stage, plus one that owns the cycle.

| Skill | Role |
|---|---|
| `sluglist-loop` | Picks the intent, runs the stages in order, carries the evidence mode, and keeps fixing and re-testing until green when you ask for it. **Start here.** |
| `sluglist-checklist` | Generate or maintain a checklist: branch / re-test / smoke / regression / scenario. |
| `sluglist-qa` | Browser QA: no fail without a screenshot, no pass without performing the check. |
| `sluglist-fix` | Fix what failed, plus `fixes.yaml` (`fixed` \| `wontfix` \| `needs_info`). |

Ask for *"run the QA loop on this branch"* and the orchestrator does the rest: checklist → QA run →
`npx sluglist report` → (on request) fix → re-test → final report. Project specifics it needs — base
branch, how to run and sign in, hard limits, evidence mode, loop limits — come from
[`.sluglist/PROJECT.md`](/docs/project-conventions/), not from editing the skills.

## Until green — `npx sluglist status`

Ask for the fixes too — *"QA this branch and fix everything until it passes"* — and the cycle
repeats: QA finds failures, the fix skill resolves them, a re-test round checks the fixes. What keeps
that honest is a decision point the agent cannot answer from memory:

```bash
npx sluglist status
```

```
.sluglist — 1 chain, 2 sessions

release-2026-08 · branch · 3 items
  1  session-2026-08-15-tw1w  1 pass · 1 fail · 1 not tested  ·  1 fixed
  2  session-2026-08-15-jtyf  0 pass · 1 fail · 0 not tested  ·  no fix pass yet

  still failing (1)
    csv-columns — for the next fix pass · failed in 2 rounds · issue 01
      "The CSV has every expected column"

  not tested (1) — email-receipt

verdict: stalled — 1 item failed in 2 or more rounds — a fix pass has already been tried
```

Everything is derived from artifacts already on disk: the verdicts in `session.yaml`, the resolutions
in `fixes.yaml`, and the `retest_of` chain linking round 2 back to round 1. No new file, no state to
keep in sync.

| Verdict | Meaning | What the loop does |
|---|---|---|
| `green` | Nothing is failing | Stop; hand over the report. |
| `continue` | Failures a fix pass can still act on | Another round, if the budget allows. |
| `stalled` | Every remaining failure already survived a fix pass | Stop; hand the list to a human. |
| `blocked` | Everything left is `wontfix` / `needs_info` | Stop; those are the owner's calls. |
| `empty` | No sessions on disk | Nothing ran. |

`--json` gives an agent the same result as data; `--all` includes older chains; a session folder as
the argument restricts the report to the chain containing it. It works for the plain dev loop too,
where the work items are the issues themselves rather than checklist verdicts.

The loop's ceiling is **3 QA rounds** by default — the first pass plus two fix→re-test rounds — and
it stops early on `stalled` or `blocked` rather than grinding the same item. Both are set in
[`PROJECT.md`](/docs/project-conventions/). And the rule that makes the whole thing trustworthy: the
loop may never make a run green by editing a checklist item or recording `wontfix` to get out — green
is a fact about the app, not a target.

## Programmatic capture

The UI is optional. Produce and deliver an issue without any chrome:

```ts
await widget.captureIssue({
  comment: "Logo overlaps the nav on narrow screens",
  mode: "element",
  selector: "header > nav .logo",
  screenshot: pngBlob,        // optional
  category: "bug",            // optional: bug | design | idea | ...
  consoleErrors: [...],       // optional, appended as a "## Console errors" section
});
```

See also: [the autonomous QA loop](/for/agent-loop/) — the whole cycle end to end — and
[sluglist for Claude Code & coding agents](/for/claude-code/) for the workflow with terminal
transcripts.
