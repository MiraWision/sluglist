export interface UseCase {
  slug: string;
  /** H1 on the page. */
  title: string;
  /** <title> (30–60 chars incl. template suffix is fine). */
  metaTitle: string;
  /** Meta description (70–160 chars). */
  description: string;
  /** Short label for cards, indexes and cross-links. */
  label: string;
  /**
   * `scenario` — one of the four ways sluglist is actually used; these are the
   * entry points a visitor picks between. `tool` — a page about working with a
   * specific tool, which cuts across the scenarios.
   */
  group: "scenario" | "tool";
  /** One line naming the reader. The index shows it under the label. */
  who: string;
  /** What this scenario is worth, concretely. Three per page. */
  benefits: { title: string; body: string }[];
  intro: string;
  /** Markdown body rendered at build time — always ends with "how to run it". */
  body: string;
  faq: { q: string; a: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "local-dev",
    label: "Your own dev loop",
    group: "scenario",
    title: "Catch it while you build — feedback from yourself",
    metaTitle: "Local dev feedback loop: click a bug, an agent fixes it",
    description:
      "Click the bug on your running localhost app and it becomes a file: screenshot, selector, component, console errors, action trail — in a local folder your coding agent reads.",
    who: "You, with the app running on localhost.",
    benefits: [
      {
        title: "Describing a bug costs one click",
        body: "You are already looking at it. Click the element instead of writing a paragraph — the screenshot, the CSS selector, the nearest React component, the console error and your last few actions are attached for you.",
      },
      {
        title: "Nothing leaves the machine",
        body: "A sidecar bound to 127.0.0.1 writes into a local .sluglist/ folder. No account, no upload, no dashboard — and the folder is gitignored by the installer.",
      },
      {
        title: "Your agent stops guessing where",
        body: "component: AnimalForm plus a stable selector plus a PATCH 500 in the error trail usually names the file before the agent opens anything.",
      },
    ],
    intro:
      "The bug you find in your own app at 2am is the one that gets lost. A note in a scratch file loses the screenshot; a memory loses the console error. Click it instead: the report lands in a folder next to your code, and the agent that fixes it reads the same folder.",
    body: `## Set it up once

\`\`\`bash
npm install sluglist
\`\`\`

\`\`\`ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

mountFeedbackWidget(
  createFeedbackWidget({
    connectors: [new LocalConnector()],
  })
);
\`\`\`

Gate it behind an env flag so it never initializes in production —
\`enabled: process.env.NODE_ENV !== "production"\`.

Then, next to your dev server:

\`\`\`bash
npx sluglist dev        # writes to ./.sluglist, port 4477
\`\`\`

Browser JavaScript cannot write to disk, which is the only reason this process exists. It binds
\`127.0.0.1\`, has no authentication, and is not meant to be exposed.

## Use it while you work

Click the launcher (or press <kbd>Shift</kbd>+<kbd>F</kbd>), pick an element, type what is wrong.
Every issue arrives as a folder of plain files:

\`\`\`
.sluglist/session-2026-08-16-a1b2/
  session.yaml
  01-save-does-nothing.md          # frontmatter + your comment + ## Errors + ## Actions
  01-save-does-nothing.png
\`\`\`

When a bug needs a sequence, **record mode** captures a screenshot per click and navigation, so the
report carries steps-to-reproduce as numbered frames instead of a sentence you have to write.

## Hand it to the agent

\`\`\`bash
npx sluglist init       # skills, .sluglist/checklists/, .gitignore rules, PROJECT.md
\`\`\`

Then tell Claude Code *"read feedback and fix it."* The bundled \`sluglist-fix\` skill reads each
issue, looks at the screenshot, localizes by component and selector, fixes the code, and records the
outcome in \`fixes.yaml\` — \`fixed\`, \`wontfix\` or \`needs_info\`, never a guess.

\`\`\`bash
npx sluglist status     # what is still open, and what a pass left unanswered
\`\`\`

## Where it goes next

The same widget, one config line different, collects feedback from
[your team](/for/client-acceptance/) and from [real users](/for/beta-feedback/) — with the same
artifact format, so nothing downstream changes. And the whole cycle can run
[agent to agent](/for/agent-loop/) when you want the tester to be an agent too.`,
    faq: [
      {
        q: "Does the widget slow down my dev build?",
        a: "The screenshot library (html-to-image) is loaded lazily on the first capture, so it is not in your initial bundle. The widget itself is small, framework-agnostic, and lives in a shadow DOM so it cannot collide with your styles.",
      },
      {
        q: "What if I forget to start the sidecar?",
        a: "LocalConnector warns once in the console and the UI is never blocked. Any other connectors you configured still run, and undelivered issues persist in an IndexedDB outbox and retry on the next load.",
      },
      {
        q: "Should .sluglist/ be committed?",
        a: "No — sessions are local noise. `npx sluglist init` writes the .gitignore rules that keep sessions out while re-including the two things that belong in the repo: .sluglist/checklists/ and .sluglist/PROJECT.md.",
      },
      {
        q: "Does this work outside React?",
        a: "Yes. The widget has no framework dependency; the React component hint is an extra that resolves when a React fiber is present and is simply absent otherwise.",
      },
    ],
  },
  {
    slug: "client-acceptance",
    label: "Your team & client",
    group: "scenario",
    title: "Acceptance testing with your client, PM and testers",
    metaTitle: "Client & team acceptance testing with a visual checklist",
    description:
      "Put a build on staging with a checklist of what shipped. The client, PM or tester walks it, checks items off, flags problems visually — and you get a coverage map, not a chat thread.",
    who: "The people who decide whether it shipped correctly — the client, the PM, the tester.",
    benefits: [
      {
        title: "A coverage map instead of “looks good 👍”",
        body: "Every item ends the session as confirmed, flagged with evidence, or never checked. The third state is the one a chat thread always loses, and it is usually the one that matters.",
      },
      {
        title: "Nothing for them to install or sign up for",
        body: "The checklist lives on the staging site you already sent them. No accounts, no invitations, no seats — sluglist has no hosted service at all.",
      },
      {
        title: "You do not write the list by hand",
        body: "An agent turns the branch diff into a client-voice checklist — user-visible changes only, grouped by feature, with links that navigate the reviewer to the right page.",
      },
    ],
    intro:
      "A release needs a sign-off, and “looks good 👍 in the chat” is not one. sluglist puts an acceptance checklist directly on the staging site: the reviewer checks each row off where the feature lives, flags what is wrong with an annotated screenshot, and the result is a machine-readable coverage map — plus one HTML file you can forward.",
    body: `## How it works

\`\`\`ts
mountFeedbackWidget(
  createFeedbackWidget({
    project: "acme",
    connectors: [new HttpConnector("/api/feedback", () => token)],
    checklist: "/checklist.json",   // or an inline object
  })
);
\`\`\`

A second circle appears above the feedback button. The reviewer opens it and sees your list —
sections, items, hints, and "Open ↗" links that navigate to the right page. One natural motion per
item: **click the row to check it off; click the slug button to flag a problem** (that opens the
normal issue flow with screenshot and annotation, linked back to the item).

## The output: a coverage map, not a thread

Every verdict lands in \`session.yaml\`:

\`\`\`yaml
checklist:
  items:
    - id: export-button
      title: "On Reports, the Export button downloads a CSV"
      verdict: pass
    - id: csv-columns
      title: "The CSV has all the expected columns"
      verdict: fail
      issue: "03"        # the annotated issue that documents it
    - id: email-sent
      title: "An email arrives after an export"
      verdict: null      # never checked — you know what wasn't looked at
\`\`\`

Three states, not two: confirmed, flagged (with the evidence attached), and **never checked**.

## Generate the checklist from the branch

Don't write the list by hand: the bundled \`sluglist-checklist\` skill turns the branch diff into a
client-facing checklist — user-visible changes only, phrased for a non-developer. See
[Checklist mode](/docs/checklist/).

## Send back one file, not a folder

\`\`\`bash
npx sluglist report
\`\`\`

The session becomes a single self-contained HTML file: what passed, what failed, the fact observed
behind each verdict, every screenshot inlined. It opens offline, forwards as one attachment, and
prints to PDF cleanly — the artifact a client can actually read. See [Reports](/docs/artifacts/).

## Built for non-technical reviewers

- Flagging a problem takes a comment and an automatic screenshot; annotation (arrow, box, text) is
  right there.
- **Smart links** navigate the reviewer to the page under test; wildcard matches light up "You're
  here" on dynamic routes.
- The checklist panel is fully usable on a phone.
- Reporter [form fields](/docs/capture/) can ask what only they know (device, severity, which
  account).
- They can [attach their own files](/docs/capture/) — a phone screenshot usually arrives via paste.

## Where the feedback goes

Through [a connector you own](/docs/connectors/) — an API route in front of Vercel Blob, S3/R2 or
Supabase Storage is ~50 lines. No sluglist account, no third-party inbox holding your client's
screenshots.

The same checklist can be walked by [a QA agent](/for/agent-loop/) instead of a person when you want
a pass before the client sees it — the artifacts are identical either way.`,
    faq: [
      {
        q: "Does the client need an account or an app?",
        a: "No. The widget lives on your staging site; the client just opens the link you already sent them. There are no sluglist accounts at all.",
      },
      {
        q: "Can I see what the client didn't test?",
        a: "Yes — that is the point of the coverage map. Every checklist item ends the session as pass, fail (linked to the flagged issue) or null (never checked), so untested areas are explicit.",
      },
      {
        q: "Where do the reports and screenshots go?",
        a: "To connectors you configure — typically a thin API route that writes to your own storage (Vercel Blob, S3/R2, Supabase). Nothing is sent to sluglist; there is no hosted service.",
      },
      {
        q: "Can checklist verdicts carry over to the next session?",
        a: "No, deliberately. The checklist is a session input and verdicts are its output; every session runs it from scratch. sluglist stays a capture tool, not a workflow tracker.",
      },
    ],
  },
  {
    slug: "beta-feedback",
    label: "Real users",
    group: "scenario",
    title: "A “Report a problem” button for beta & production",
    metaTitle: "Beta & production feedback widget with PII scrubbing",
    description:
      "Let real users report problems with an annotated screenshot — inputs masked, PII scrubbed from text, delivery through an endpoint you own. MIT, self-hosted, no accounts.",
    who: "Real users in your beta or production app.",
    benefits: [
      {
        title: "The report arrives with the context you would have asked for",
        body: "Route, viewport, browser, the console errors from the last minute and the actions before the click — instead of “it doesn't work on my end”.",
      },
      {
        title: "Privacy is the default, not a setting you remember",
        body: "One preset masks every form input in the screenshot, scrubs emails, long digit runs and tokens out of collected text, and asks consent before attaching an image.",
      },
      {
        title: "It cannot become your problem",
        body: "Everything the widget wraps calls the original, it uninstalls itself after repeated internal failures, and undelivered reports wait in an offline outbox.",
      },
    ],
    intro:
      "Once real users are in the product, “email us a screenshot” stops working. The production preset turns sluglist into a privacy-safe “Report a problem” button: form inputs masked in screenshots, PII scrubbed out of collected text, a dismiss ✕ for users who don't want it — and every report delivered to infrastructure you own.",
    body: `## One preset, safe defaults

\`\`\`ts
const widget = createFeedbackWidget({
  project: "acme",
  preset: "production",        // masking + consent + scrub + dismiss
  connectors: [new HttpConnector("/api/feedback", () => session.token)],
  identity: { userId: user.id, email: user.email },  // → reporter in artifacts
  custom: { plan: user.plan, appVersion: APP_VERSION },
});
const ui = mountFeedbackWidget(widget);
footerLink.onclick = () => ui.show();   // rescue path after dismiss
\`\`\`

\`preset: "production"\` turns on, all at once: input masking in screenshots, a screenshot-consent
checkbox, PII text scrubbing, a dismiss ✕, and forced-off \`console.warn\` capture. Every option
can still be overridden explicitly. See [the preset table](/docs/production/).

## What PII protection actually means here

- **Screenshots:** every input, textarea and select is redacted before the render; anything marked
  \`data-private\` is always redacted. The live DOM is untouched — masking happens only in the
  rendered image.
- **Text:** emails → \`[email]\`, long digit runs → \`[digits]\`, hex/base64 tokens → \`[token]\` —
  across element text, URLs, error messages and the action trail. Dates, versions and stack-trace
  line numbers survive, so reports stay readable.
- **The trail records facts, not content:** typing is logged as a character count; password fields
  aren't logged at all; navigation paths drop the query string.
- **Collected automatically:** URL path, viewport, browser/OS, timezone, color scheme, recent
  errors. **Deliberately not collected:** full user agent, IP, cookies, storage, geolocation.

## Your infrastructure, not ours

There is no sluglist server. Reports go to [connectors you configure](/docs/connectors/) — the
recommended shape is a ~50-line API route in front of your own storage, holding the credentials
server-side. The widget makes no other network requests, and that claim is enforced by an automated
test.

## It cannot break your app

Everything the widget wraps (\`fetch\`, \`console.error\`, \`history\`) always calls the original;
after repeated internal failures it uninstalls itself and gets out of the way. Undelivered reports
persist in an IndexedDB outbox and retry on the next load.

## Real users, real languages

Label bundles ship for English, Russian, Ukrainian, Spanish and German — one line to apply, with
correct plural rules. Your own copy (categories, checklist titles, form labels) stays yours.
See [Localization](/docs/production/).

## Then what?

A user report is the same artifact a teammate or an agent produces, so it drops straight into the
[fix loop](/for/local-dev/): pull the session folder into the repo and the agent reads it exactly as
if you had clicked it yourself.

## Before you ship

Walk the [production checklist](/docs/production/): env gating, a delivery token, server-side
validation, retention, and a privacy-policy paragraph to adapt.`,
    faq: [
      {
        q: "Is it safe to store the screenshots?",
        a: "The production preset masks every form input in the rendered screenshot, always redacts elements marked data-private, and adds a consent checkbox — the reporter chooses whether a screenshot is attached at all. The live page is never modified.",
      },
      {
        q: "Do I need a backend?",
        a: "A thin endpoint, yes — roughly 50 lines. It holds your storage credentials, validates a bearer token, rate-limits, and writes artifacts to your own storage. Write-keys never ship to the browser.",
      },
      {
        q: "Can users turn the widget off?",
        a: "Yes — the production preset adds a ✕ on the launcher that hides the widget and remembers the choice (7 days by default). ui.show() wired to a footer link is the rescue path back.",
      },
      {
        q: "Is there an inbox or ticketing built in?",
        a: "No, by design. sluglist is one-way capture with a stable artifact format; pipe it into the tracker or workflow you already run. No accounts, no statuses, no replies.",
      },
    ],
  },
  {
    slug: "agent-loop",
    label: "Agent-to-agent QA",
    group: "scenario",
    title: "An autonomous QA loop: test, fix, re-test, until green",
    metaTitle: "Autonomous agent QA loop: test, fix, re-test until green",
    description:
      "A QA agent walks the checklist in a real browser and writes evidence-backed verdicts; a fix agent answers them; a re-test round closes the loop — and sluglist status decides when to stop.",
    who: "A repo where an agent can run the app in a browser and edit the code.",
    benefits: [
      {
        title: "Evidence, not claims",
        body: "The QA agent may not record a fail without a screenshot, or a pass without performing the check. An item it could not reach is reported as not tested — the honest answer an eager agent would otherwise invent.",
      },
      {
        title: "The loop stops for the right reasons",
        body: "npx sluglist status reads the artifacts and returns green, continue, stalled or blocked. An item that already survived a fix pass goes to a human instead of being ground on for another round.",
      },
      {
        title: "You get an audit trail, not a “done”",
        body: "Every round leaves a session folder and a single-file HTML report — verdicts, observed facts, screenshots — so you can check the work instead of trusting the summary.",
      },
    ],
    intro:
      "Both ends of the loop can be agents: one walks the app in a browser and writes down what it saw, another reads those artifacts and fixes the code. What makes it more than a demo is that neither of them is trusted — every verdict carries evidence, and a third command decides whether another round is worth running.",
    body: `## Set the project up

\`\`\`bash
npx sluglist init --agents-md
\`\`\`

That installs the four bundled skills into \`.claude/skills/\`, creates \`.sluglist/checklists/\`,
writes the \`.gitignore\` rules, and drops a \`.sluglist/PROJECT.md\` to fill in. Fill it in — it is
where the loop learns your base branch, how to start the app, how to sign in (referenced, never
stored), the actions it must never complete, and how far it may go on its own:

\`\`\`
max rounds: 3
fix without asking: no
commits: leave the changes uncommitted, one summary at the end
\`\`\`

## Ask for the whole thing

> QA this branch and fix everything until it passes.

The \`sluglist-loop\` skill takes it from there:

1. **Checklist** — the branch diff becomes a client-voice list at \`.sluglist/checklists/\`.
2. **QA run** — a browser walks every item and writes verdicts and issues through the headless
   writer, \`sluglist/node\`.
3. **Report** — \`npx sluglist report\` renders the round as one HTML file.
4. **Status** — \`npx sluglist status --json\` says what is still failing and whether it is worth
   another round.
5. **Fix** — the failing issues are patched; each outcome is recorded in \`fixes.yaml\`.
6. **Re-test** — a checklist of only the fixed items, ids preserved and provenance attached, then
   back to step 4.

## The decision point

\`\`\`bash
npx sluglist status
\`\`\`

\`\`\`
release-2026-08 · branch · 3 items
  1  session-2026-08-15-tw1w  1 pass · 1 fail · 1 not tested  ·  1 fixed
  2  session-2026-08-15-jtyf  0 pass · 1 fail · 0 not tested  ·  no fix pass yet

  still failing (1)
    csv-columns — for the next fix pass · failed in 2 rounds · issue 01

verdict: stalled — 1 item failed in 2 or more rounds — a fix pass has already been tried
\`\`\`

It is derived entirely from the artifacts — the verdicts in \`session.yaml\`, the resolutions in
\`fixes.yaml\`, and the \`retest_of\` chain that links round 2 back to round 1. That matters: the one
thing an agent should not be asked is whether its own work is done.

| Verdict | The loop |
|---|---|
| \`green\` | stops — hand over the report |
| \`continue\` | runs another round, if the budget allows |
| \`stalled\` | stops — a human takes the item that keeps coming back |
| \`blocked\` | stops — \`wontfix\` and \`needs_info\` are the owner's calls |

## The guarantees that make it usable

- **No fail without a screenshot; no pass without performing the check.** An unreachable item is
  *not tested*, with the reason.
- **A screenshot proves the screen looked right, never that the action worked.** For downloads,
  submissions and background jobs the verdict carries the observed fact — the file name and size,
  the toast text, the row count.
- **The loop may not manufacture green.** It cannot edit, narrow or delete a check so it stops
  failing, and it cannot write \`wontfix\` to end a round; those are proposals surfaced to you.
- **Hard limits are enforced.** Live payments, real emails, external submissions: the run stops at
  the last safe step and records *not tested* with the reason.

## Drive it yourself

The skills are convenience, not dependency — the writer is a public API:

\`\`\`ts
import { createSession, LocalConnector } from "sluglist/node";

const session = await createSession({
  connectors: [new LocalConnector({ dir: ".sluglist" })],
  project: "acme",
  baseUrl: "http://localhost:3000",
  checklist: ".sluglist/checklists/release-2026-08.json",
  reporter: { name: "qa-agent", kind: "agent" },
});

await session.setVerdict("csv-columns", "pass", {
  evidence: {
    screenshots: [png],
    note: "Exported reports-2026-08.csv — 4.1 KB, 57 rows, all 9 columns present",
  },
});
\`\`\`

Any language that can write files can produce the same artifacts:
[the format is documented field by field](/docs/artifacts/).`,
    faq: [
      {
        q: "Which agent runs this?",
        a: "Any that can read files, run a browser and edit code. Claude Code is supported out of the box through the four bundled skills; everything they do is a documented CLI command or a public API on sluglist/node.",
      },
      {
        q: "What stops it looping forever?",
        a: "Two things. sluglist status returns stalled as soon as an item has failed in two rounds — a fix pass already tried and did not work — and blocked when everything left is wontfix or needs_info. On top of that the skill has a round ceiling, three by default, set in PROJECT.md.",
      },
      {
        q: "Can an agent just mark everything as passing?",
        a: "It can lie the way any agent can, which is why the protocol makes lying visible: a pass in evidence mode all carries the screenshot and the observed fact, the report inlines both, and the skill's hard prohibitions forbid editing a check or writing wontfix to reach green. You audit artifacts, not a chat summary.",
      },
      {
        q: "Do humans and agents produce different artifacts?",
        a: "No. The headless writer emits byte-identical structure to the browser widget, with reporter.kind recording which one it was. A session a client produced and a session an agent produced are read by the same tools.",
      },
    ],
  },
  {
    slug: "claude-code",
    label: "Claude Code",
    group: "tool",
    title: "Visual feedback for Claude Code & coding agents",
    metaTitle: "Visual feedback for Claude Code & coding agents",
    description:
      "Click a bug on your running app and let Claude Code fix it: sluglist turns visual feedback into local artifacts a coding agent reads, localizes and resolves.",
    who: "Anyone whose fixes get written by Claude Code.",
    benefits: [
      {
        title: "Four skills, one install",
        body: "npx sluglist init drops sluglist-loop, -checklist, -qa and -fix into .claude/skills/ — and never overwrites one you have edited.",
      },
      {
        title: "Project knowledge lives in the repo",
        body: ".sluglist/PROJECT.md holds the base branch, how to run and sign in, hard limits and loop budget, so the skills stay upgradeable instead of being edited per project.",
      },
      {
        title: "Reports an agent can act on",
        body: "Selector, DOM path, React component hint, console and network errors, and an action trail — the localization work is mostly done before the agent starts.",
      },
    ],
    intro:
      "The shortest path from “this button is broken” to a diff: report the bug visually on the page, and let the agent read the artifacts and fix the code. No dashboard, no ticket queue, no copy-pasting screenshots into a chat.",
    body: `## The loop

1. **Run the sidecar.** \`npx sluglist dev\` binds \`127.0.0.1\` and writes reports into a local
   \`.sluglist/\` folder — browser JS can't touch disk, so this tiny process does.
2. **Click feedback.** Report a bug with the widget while you use the app. The full artifact set —
   screenshot, comment, CSS selector, page errors and a trail of action frames — lands in the
   folder.
3. **Let the agent fix it.** Install the bundled skills once with \`npx sluglist init\`, then tell
   Claude Code to *"read feedback and fix it."* The \`sluglist-fix\` skill reads each issue,
   localizes by selector and frames, fixes the code, and writes a \`.done\` report.

\`\`\`ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

mountFeedbackWidget(
  createFeedbackWidget({
    connectors: [new LocalConnector()],
  })
);
\`\`\`

Gate it behind an env flag so it never initializes in production —
\`enabled: process.env.NODE_ENV !== "production"\`.

\`\`\`bash
npx sluglist dev        # sidecar that writes to ./.sluglist
\`\`\`

## Why agents resolve these reports well

Every issue is a markdown file written for a file-reading agent, not a human dashboard:

- **A smart CSS selector** (\`data-testid\` → \`id\` → \`aria\` → landmark path — never Tailwind
  utility or hashed classes), plus \`dom_path\` and \`element_text\`, localize the element.
- **A React component hint** — sluglist reads the nearest named component from the element's fiber
  and records \`component: AnimalForm\`. No React dependency required; \`null\` when unavailable.
- **\`## Errors\`** carries recent console errors, uncaught exceptions and failed requests
  (\`PATCH /api/animals/128 → 500\`) with relative timestamps — often the root cause is already in
  the report.
- **\`## Actions\` + record-mode frames** give steps-to-reproduce as numbered screenshots,
  cross-referenced line by line.

The agent doesn't guess what the user meant; it reads what the page knew.

## The four bundled skills

| Skill | Role |
|---|---|
| \`sluglist-loop\` | Owns the cycle: intent → checklist → QA → report → (fix → re-test) until green. Start here. |
| \`sluglist-checklist\` | Generates or maintains a checklist: branch / re-test / smoke / regression / scenario. |
| \`sluglist-qa\` | Walks a checklist in a browser and writes evidence-backed verdicts. |
| \`sluglist-fix\` | Fixes what failed and records \`fixed\` / \`wontfix\` / \`needs_info\`. |

\`npx sluglist init\` installs all four, plus \`.sluglist/PROJECT.md\` for the project specifics the
skills read first. A skill you have edited is never overwritten — which is exactly why project
knowledge belongs in \`PROJECT.md\` rather than in an edited prompt.

## The other direction: agent-generated checklists

\`sluglist-checklist\` turns a branch diff into a client-facing acceptance checklist. The client walks
it on staging, checks items off or flags problems, and every verdict lands in \`session.yaml\` — which
the agent can read back to see what failed. See [Checklist mode](/docs/checklist/).

Let an agent walk it instead and the loop closes without you:
[the autonomous QA loop](/for/agent-loop/).

## Not just Claude Code

The artifacts are [a stable, documented format](/docs/artifacts/) — plain markdown, YAML and PNG in
a folder. Any agent or script that can read files can consume them; the Claude Code skills are a
convenience, not a dependency.`,
    faq: [
      {
        q: "Does this work with agents other than Claude Code?",
        a: "Yes. The artifacts are plain markdown, YAML and PNG files in a folder with a documented, stable format. Any coding agent or script that can read files can consume them; the bundled skills just make Claude Code work out of the box.",
      },
      {
        q: "Does the feedback leave my machine?",
        a: "No. In the dev loop, the widget posts to a sidecar bound to 127.0.0.1 that writes into a local .sluglist/ folder. The widget itself makes no network requests except to the connectors you configure — enforced by an automated test.",
      },
      {
        q: "What does the agent actually receive?",
        a: "Per issue: a markdown file with YAML frontmatter (URL, CSS selector, DOM path, React component hint, viewport), the annotated screenshot, a ## Errors section with recent console and network failures, and a ## Actions trail — optionally with record-mode frames as numbered screenshots.",
      },
      {
        q: "Is sluglist free?",
        a: "Yes — MIT-licensed open source. There is no hosted service, no account and no paid tier; delivery goes through connectors you own.",
      },
    ],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((c) => c.slug === slug);
}

/** The four entry points, in the order a visitor should meet them. */
export const SCENARIOS = USE_CASES.filter((c) => c.group === "scenario");
