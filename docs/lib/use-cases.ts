export interface UseCase {
  slug: string;
  /** H1 on the page. */
  title: string;
  /** <title> (30–60 chars incl. template suffix is fine). */
  metaTitle: string;
  /** Meta description (70–160 chars). */
  description: string;
  intro: string;
  /** Markdown body rendered at build time. */
  body: string;
  faq: { q: string; a: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "claude-code",
    title: "Visual feedback for Claude Code & coding agents",
    metaTitle: "Visual feedback for Claude Code & coding agents",
    description:
      "Click a bug on your running app and let Claude Code fix it: sluglist turns visual feedback into local artifacts a coding agent reads, localizes and resolves.",
    intro:
      "The shortest path from “this button is broken” to a diff: report the bug visually on the page, and let the agent read the artifacts and fix the code. No dashboard, no ticket queue, no copy-pasting screenshots into a chat.",
    body: `## The loop

1. **Run the sidecar.** \`npx sluglist dev\` binds \`127.0.0.1\` and writes reports into a local
   \`.sluglist/\` folder — browser JS can't touch disk, so this tiny process does.
2. **Click feedback.** Report a bug with the widget while you use the app. The full artifact set —
   screenshot, comment, CSS selector, page errors and a trail of action frames — lands in the
   folder.
3. **Let the agent fix it.** Tell Claude Code to *"read feedback and fix it."* The bundled
   \`sluglist-fix\` skill reads each issue, localizes by selector and frames, fixes the code, and
   writes a \`.done\` report.

\`\`\`ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

mountFeedbackWidget(
  createFeedbackWidget({
    connectors: [new LocalConnector()],
    enabled: process.env.NODE_ENV !== "production",
  })
);
\`\`\`

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

## The other direction: agent-generated checklists

The second bundled skill, \`sluglist-checklist\`, turns a branch diff into a client-facing
acceptance checklist. The client walks it on staging, checks items off or flags problems, and every
verdict lands in \`session.yaml\` — which the agent can read back to see what failed.
See [Checklist mode](/docs/checklist/).

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
  {
    slug: "client-acceptance",
    title: "Client acceptance testing with a visual checklist",
    metaTitle: "Client acceptance testing on staging, with a checklist",
    description:
      "Put a build on staging with a checklist of what shipped. The client walks it, checks items off, flags problems visually — and you get a coverage map, not a chat thread.",
    intro:
      "A release needs a sign-off, and “looks good 👍 in the chat” is not one. sluglist puts an acceptance checklist directly on the staging site: the client checks each row off where the feature lives, flags what's wrong with an annotated screenshot, and the result is a machine-readable coverage map.",
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

A second circle appears above the feedback button. The client opens it and sees your list —
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

Three states, not two: confirmed, flagged (with the evidence attached), and **never checked** — the
one a chat thread always loses.

## Generate the checklist from the branch

Don't write the list by hand: the bundled \`sluglist-checklist\` skill turns the branch diff into a
client-facing checklist — user-visible changes only, grouped by feature, phrased for a
non-developer. See [Checklist mode](/docs/checklist/).

## Built for non-technical reporters

- Flagging a problem takes a comment and an automatic screenshot; annotation (arrow, box, text) is
  right there.
- **Smart links** navigate the client to the page under test; wildcard matches light up "You're
  here" on dynamic routes.
- The checklist panel is fully usable on a phone.
- Reporter [form fields](/docs/capture/) can ask what only the client knows (device, severity,
  which account).
- The client can [attach their own files](/docs/capture/) — a phone screenshot usually arrives via
  paste.

## Where the feedback goes

Through [a connector you own](/docs/connectors/) — an API route in front of Vercel Blob, S3/R2 or
Supabase Storage is ~50 lines. No sluglist account, no third-party inbox holding your client's
screenshots.`,
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
    title: "A “Report a problem” button for beta & production",
    metaTitle: "Beta & production feedback widget with PII scrubbing",
    description:
      "Let real users report problems with an annotated screenshot — inputs masked, PII scrubbed from text, delivery through an endpoint you own. MIT, self-hosted, no accounts.",
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
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((c) => c.slug === slug);
}
