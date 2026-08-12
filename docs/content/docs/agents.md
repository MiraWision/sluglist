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

> Add `.sluglist/` to your project's `.gitignore`.

## Let an agent fix it (Claude Code skill)

The package ships a `sluglist-fix` skill that reads `.sluglist/` and fixes the reported issues.
Install the bundled skills into your project once:

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
`public/checklist.json` — which the widget loads with `checklist: "/checklist.json"`. Ask Claude
Code to *"generate a checklist from this branch"*. See [Checklist mode](/docs/checklist/).

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

See also: [sluglist for Claude Code & coding agents](/for/claude-code/) — the full workflow with
terminal transcripts.
