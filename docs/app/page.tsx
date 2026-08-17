import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { DemoLazy } from "@/components/DemoLazy";
import { ContractDiagram, LoopDiagram } from "@/components/Diagrams";
import { Icon, IconBadge, type IconName } from "@/components/Icons";
import { TryItButton } from "@/components/TryItButton";
import { JsonLd } from "@/components/JsonLd";
import { Mono, Section, Terminal } from "@/components/Section";
import { DEPENDENCY_COUNT, LICENSE, VERSION } from "@/lib/pkg";
import { REPO, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Agent story — commands and output copied from the real `sluglist dev` CLI
// and the `sluglist-fix` skill's `.done` report shape.
const DEV_TERMINAL = `$ npx sluglist dev
sluglist dev listening on http://127.0.0.1:4477
writing feedback to ./.sluglist
waiting for reports (Ctrl+C to stop)…
  ← session-2026-07-23-a1b2/01-save-does-nothing.png   (48 KB)
  ← session-2026-07-23-a1b2/01-save-does-nothing.md    (612 B)
  ← session-2026-07-23-a1b2/session.yaml               (1.1 KB)`;

const AGENT_TERMINAL = `$ claude
› read feedback and fix it

● Reading .sluglist/session-2026-07-23-a1b2 …
  01 — Save button does nothing · button[aria-label="Save"]
  frames 02→03: save clicked, no response · PATCH 500 in ## Errors
● Fixed src/api/animals.ts + AnimalForm.tsx
● Wrote …/session-2026-07-23-a1b2/.done`;

// Real output — `sluglist status` after a fix pass and a re-test round.
const STATUS_TERMINAL = `$ npx sluglist status

release-2026-08 · branch · 12 items
  1  session-2026-08-16-a1b2  9 pass · 3 fail · 0 not tested  ·  2 fixed, 1 wontfix
  2  session-2026-08-16-c3d4  2 pass · 1 fail · 0 not tested  ·  no fix pass yet

  still failing (1)
    csv-columns — for the next fix pass · failed in 2 rounds · issue 02

verdict: stalled — 1 item failed in 2 or more rounds`;

// Real output — `sluglist report` with no arguments takes the newest session.
const REPORT_TERMINAL = `$ npx sluglist report

session-2026-08-11-2elz
  → …/session-2026-08-11-2elz/report.html  (146.0 KB)`;

const DONE_REPORT = `# session-2026-07-23-a1b2 — done

## 01 — Save button does nothing
- files: src/api/animals.ts, src/forms/AnimalForm.tsx
- fix: the PATCH sent the record id in the body, but the route
  reads it from the URL — the handler threw on \`undefined.id\`.
  Moved the id into the path and guarded the response.
  Save persists and shows the success toast now.`;

const AGENT_STEPS: { n: string; title: string; body: React.ReactNode }[] = [
  {
    n: "1",
    title: "Run the sidecar",
    body: (
      <>
        Start <Mono>npx sluglist dev</Mono> next to your dev server. It binds{" "}
        <Mono>127.0.0.1</Mono> and writes reports into a local{" "}
        <Mono>.sluglist/</Mono> folder — browser JS can&rsquo;t touch disk, so
        this tiny process does.
      </>
    ),
  },
  {
    n: "2",
    title: "Click feedback",
    body: (
      <>
        Report a bug with the widget while you use the app. The full artifact
        set — screenshot, comment, CSS selector, page errors and a trail of
        action frames — lands in the folder.
      </>
    ),
  },
  {
    n: "3",
    title: "Let the agent fix it",
    body: (
      <>
        Install the skills once with <Mono>npx sluglist init-skills</Mono>, then
        tell Claude Code to <em>&ldquo;read feedback and fix it.&rdquo;</em> The
        skill reads each issue, localizes by selector and frames, fixes the
        code, and writes a <Mono>.done</Mono> report.
      </>
    ),
  },
];

const QUICK_START = `import {
  createFeedbackWidget,
  mountFeedbackWidget,
  DownloadConnector,
} from "sluglist";

mountFeedbackWidget(
  createFeedbackWidget({
    connectors: [new DownloadConnector()],
  })
);`;

/** The four entry points — the same four the /for/ index routes between. */
const SCENARIOS: {
  n: string;
  title: string;
  body: string;
  code: string;
  /** Grammar for the snippet; the label under it says so too. */
  lang?: string;
  href: string;
  icon: IconName;
}[] = [
  {
    n: "01",
    title: "Your own dev loop",
    icon: "laptop",
    body: "Click the bug on localhost, have it land in a folder, let your agent fix it.",
    code: `import { LocalConnector } from "sluglist";

mountFeedbackWidget(
  createFeedbackWidget({
    connectors: [new LocalConnector()],
  })
);
// then: npx sluglist dev`,
    href: "/for/local-dev/",
  },
  {
    n: "02",
    title: "Your team & client",
    icon: "team",
    body: "Staging plus a checklist of what shipped. They walk it and flag problems; you get a coverage map.",
    code: `createFeedbackWidget({
  project: "acme",
  connectors: [new HttpConnector(url, token)],
  checklist: "/checklist.json",
});`,
    href: "/for/client-acceptance/",
  },
  {
    n: "03",
    title: "Real users",
    icon: "globe",
    body: "A \"Report a problem\" button for production: PII masked and scrubbed, delivery through an endpoint you own.",
    code: `createFeedbackWidget({
  project: "acme",
  preset: "production",
  connectors: [new HttpConnector(url, token)],
  identity: { userId: user.id, email: user.email },
});`,
    href: "/for/beta-feedback/",
  },
  {
    n: "04",
    title: "Agent-to-agent QA",
    icon: "robot",
    body: "A QA agent walks the checklist in a browser, a fix agent answers it, and the loop runs until green.",
    code: `npx sluglist init --agents-md

# then, to your coding agent:
#   "QA this branch and fix everything until it passes"
npx sluglist status --json`,
    lang: "bash",
    href: "/for/agent-loop/",
  },
];

/**
 * What is in the box, and where the detail lives.
 *
 * Each card links to the docs page that owns its subject: the home page makes
 * the argument, the docs pages carry the reference — and stop competing with
 * this one for the same searches.
 */
const IN_THE_BOX: {
  title: string;
  body: string;
  href: string;
  icon: IconName;
}[] = [
  {
    title: "Four capture modes",
    icon: "crosshair",
    body: "Pick an element, drag an area, grab the whole scrollable page, or record a flow as numbered frames.",
    href: "/docs/capture/",
  },
  {
    title: "Annotation",
    icon: "pen",
    body: "Arrow, box and text over the screenshot, with colour, undo and keyboard shortcuts — flattened at full resolution.",
    href: "/docs/capture/",
  },
  {
    title: "Smart selectors",
    icon: "crosshair",
    body: "data-testid → id → aria → landmark path, plus a React component hint. Never a Tailwind utility or a hashed class.",
    href: "/docs/artifacts/",
  },
  {
    title: "Errors and an action trail",
    icon: "alert",
    body: "Recent console errors, exceptions and failed requests, plus what the reporter did before the click — never what they typed.",
    href: "/docs/capture/",
  },
  {
    title: "Checklist mode",
    icon: "checklist",
    body: "Pre-seed an acceptance list; every verdict lands in session.yaml as a coverage map — pass, fail, or never checked.",
    href: "/docs/checklist/",
  },
  {
    title: "Pluggable connectors",
    icon: "plug",
    body: "The core never knows about storage. Deliver anywhere through a two-method interface; fan out to several at once.",
    href: "/docs/connectors/",
  },
  {
    title: "PII masking and scrubbing",
    icon: "eye-off",
    body: "Inputs redacted in the screenshot; emails, long digit runs and tokens scrubbed out of every text surface.",
    href: "/docs/production/",
  },
  {
    title: "A production preset",
    icon: "shield",
    body: "One line turns on masking, screenshot consent, text scrubbing and a dismiss ✕ for real users.",
    href: "/docs/production/",
  },
  {
    title: "A stable artifact format",
    icon: "folder",
    body: "A folder per session: session.yaml plus one markdown file per issue. Versioned, and only ever extended.",
    href: "/docs/artifacts/",
  },
  {
    title: "Agent skills and a CLI",
    icon: "terminal",
    body: "dev, report, status, init — and four Claude Code skills that run the loop from checklist to green.",
    href: "/docs/agents/",
  },
  {
    title: "Project conventions",
    icon: "settings-doc",
    body: "One committed file holds your base branch, how to run and sign in, hard limits and loop budget.",
    href: "/docs/project-conventions/",
  },
  {
    title: "Framework-agnostic",
    icon: "layers",
    body: "Zero UI framework, style-isolated in a shadow DOM, an offline outbox, and it never breaks the page it is on.",
    href: "/docs/quick-start/",
  },
];

const CONFIG = [
  ["project", "string", "Slug written into session.yaml."],
  ["connectors", "FeedbackConnector[]", "Delivery targets; runs them all."],
  ["enabled", "boolean", "Gate on env; skip where you don't want it."],
  ["preset", "\"dev\" | \"beta\" | \"production\"", "Privacy, scrub and dismiss defaults."],
  ["privacy.scrubText", "boolean", "Redact PII from artifact text (on in production)."],
  ["dismiss", "{ enabled, days }", "✕ on the launcher; ui.show() brings it back."],
  ["offlineQueue", "boolean", "IndexedDB outbox + retry (default on)."],
  ["container", "HTMLElement", "Mount target (default document.body)."],
  ["shortcut", "string | false", "Toggle key (default \"Shift+F\")."],
  ["position", "\"bottom-left\" | \"bottom-right\"", "Button corner."],
  ["accentColor", "string", "Accent for primary actions."],
  ["categories", "{ key, label }[]", "Triage chips; [] hides them."],
  ["onIssueCaptured", "(result) => void", "Fired after each capture."],
  ["strings", "Partial<Strings>", "Override any UI text (i18n)."],
];

const SOFTWARE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: "sluglist",
  headline: SITE_TITLE,
  description: SITE_DESCRIPTION,
  url: `${SITE_URL}/`,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web browser",
  softwareVersion: VERSION,
  license: "https://opensource.org/license/mit",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  downloadUrl: "https://www.npmjs.com/package/sluglist",
  softwareHelp: `${SITE_URL}/docs/`,
  releaseNotes: `${SITE_URL}/changelog/`,
  author: { "@id": `${SITE_URL}/#org` },
  sameAs: [REPO],
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={SOFTWARE_JSONLD} />

      {/* Hero. The headline promises the loop rather than the widget: a visual
          feedback widget is a crowded category, and what is actually different
          here is that the report ends in a diff. */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-14 text-center md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] tint-brand">
            Feedback → artifacts → fix → re-test → green
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-bold text-4xl tracking-tight md:text-6xl">
            Feedback that ends
            <br />
            in a diff.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] text-[var(--color-ink-2)] md:text-lg">
            Anyone reports a bug on the running app — a client, a tester, a
            customer, or a QA agent driving a browser. It lands as a folder of
            plain files. Your coding agent reads it, fixes the code, and
            re-tests until the checklist is green.
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-[14px]">
              <span>
                <span className="text-[var(--color-muted)]">$ </span>npm install
                sluglist
              </span>
            </div>
            <div className="flex gap-3">
              <Link
                className="rounded-xl bg-[var(--color-brand)] px-5 py-2.5 font-medium text-[14px] text-[var(--color-brand-ink)] transition hover:opacity-90"
                data-umami-event="hero-get-started"
                href="/docs/quick-start/"
              >
                Get started
              </Link>
              <TryItButton />
            </div>
          </div>

          {/* Facts, not adjectives — and read from the library's own
              package.json, so the version and the dependency count cannot
              drift from what was published. */}
          <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[var(--color-muted)]">
            {[
              `v${VERSION}`,
              `${LICENSE} licence`,
              `${DEPENDENCY_COUNT} dependencies`,
              "no account, no server",
              "4 Claude Code skills",
            ].map((fact) => (
              <li className="flex items-center gap-2" key={fact}>
                <span aria-hidden="true" className="text-[var(--color-pass)]">
                  ✓
                </span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>


      {/* The demo comes first, before any explanation: this page is running the
          real widget, and touching it is more convincing than a paragraph
          about it. It also produces the artifacts the next section explains. */}
      <Section eyebrow="Live" id="demo" title="Try it on this page">
        <p className="mb-8 max-w-2xl text-[15px] text-[var(--color-ink-2)] leading-relaxed md:text-[16px]">
          The widget is already mounted here. Report something — the launcher is
          in the bottom-right corner, or press{" "}
          <Mono>Shift+F</Mono> — and the artifacts it produces appear below,
          exactly as they would land in your project&rsquo;s folder.
        </p>
        <DemoLazy />
      </Section>

      {/* The idea the rest of the page is an implementation of. */}
      <Section
        eyebrow="The standard"
        id="contract"
        title="One contract, humans and agents on both ends"
      >
        <p className="mb-8 max-w-2xl text-[15px] text-[var(--color-ink-2)] leading-relaxed md:text-[16px]">
          Feedback travels from whoever found the problem to whoever fixes it.
          sluglist fixes the shape of what travels — a folder of plain files,
          versioned and documented — so the two ends can be a client and a
          developer, a customer and an agent, or two agents, without anything in
          between having to change.
        </p>
        <ContractDiagram />
      </Section>

      {/* The four scenarios — the same four the /for/ index routes between, so
          a reader who arrives from either side sees one product. */}
      <Section
        eyebrow="Scenarios"
        id="scenarios"
        title="Pick the one that matches you"
      >
        {/* Two columns, not four: each card carries a code block, and four
            across squeezes every snippet into a horizontal scroller. */}
        <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
          {/* The card is a div, not an anchor: CodeBlock contains a Copy
              button, and an interactive control inside a link is both invalid
              markup and a trap — copying would navigate away. The heading is
              the link instead. */}
          {SCENARIOS.map((s) => (
            <div
              className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
              key={s.n}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border tint-brand">
                  <Icon name={s.icon} />
                </span>
                <span className="font-mono text-[13px] text-[var(--color-muted)]">
                  {s.n}
                </span>
                <Link
                  className="font-semibold text-[15px] hover:underline"
                  data-umami-event={`scenario-${s.href.replace(/^\/for\/|\/$/g, "")}`}
                  href={s.href}
                >
                  {s.title}
                </Link>
              </div>
              <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                {s.body}
              </p>
              <div className="mt-auto">
                <CodeBlock code={s.code} lang={s.lang} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[14px] text-[var(--color-ink-2)]">
          Each one, with the benefits and the exact setup:{" "}
          <Link
            className="text-[var(--color-brand)] hover:underline"
            data-umami-event="scenarios-see-all"
            href="/for/"
          >
            the four use cases
          </Link>
          .
        </p>
      </Section>

      {/* Agent story — the differentiator, first section after the hero */}
      <section
        className="border-[var(--color-line)] border-y bg-[var(--color-surface)]"
        id="agents"
      >
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <p className="mb-2 font-mono text-[12px] text-[var(--color-brand)] uppercase tracking-widest">
            Works with Claude Code
          </p>
          <h2 className="max-w-2xl font-semibold text-2xl tracking-tight md:text-3xl">
            Feedback that fixes itself
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] text-[var(--color-ink-2)] leading-relaxed md:text-[16px]">
            Skip the dashboard and the ticket queue. Feedback clicked on a page
            lands in a local folder as clean artifacts, and a coding agent reads
            it, finds the code, and fixes it — the report goes straight to a
            diff.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3 [&>*]:min-w-0">
            {AGENT_STEPS.map((s) => (
              <div
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-5"
                key={s.n}
              >
                <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent)] font-mono text-[13px] text-[var(--color-canvas)]">
                  {s.n}
                </div>
                <h3 className="mb-1.5 font-semibold text-[15px]">{s.title}</h3>
                <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 md:items-start [&>*]:min-w-0">
            <Terminal code={DEV_TERMINAL} title="your project" />
            <Terminal code={AGENT_TERMINAL} title="claude code" />
          </div>

          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] text-[var(--color-muted)] uppercase tracking-wider">
              …/.done — the agent&rsquo;s report
            </p>
            <CodeBlock code={DONE_REPORT} lang="markdown" />
          </div>

          {/* The cycle — including the part that decides whether to go again. */}
          <div className="mt-14 border-[var(--color-line)] border-t pt-12">
            <p className="mb-2 font-mono text-[12px] text-[var(--color-brand)] uppercase tracking-widest">
              Agent to agent
            </p>
            <h3 className="max-w-2xl font-semibold text-xl tracking-tight md:text-2xl">
              Or hand over the whole cycle — until it&rsquo;s green
            </h3>
            <p className="mt-3 max-w-2xl text-[15px] text-[var(--color-ink-2)] leading-relaxed">
              The tester can be an agent too. One walks the checklist in a real
              browser and writes down what it saw; another reads those artifacts
              and fixes the code; a re-test round checks the fixes. Neither is
              trusted: every verdict carries evidence, and a third command
              decides whether another round is worth running.
            </p>

            <div className="mt-8 grid gap-6 md:grid-cols-[1.15fr_1fr] md:items-start [&>*]:min-w-0">
              <LoopDiagram />
              <div className="space-y-4">
                <Terminal code={STATUS_TERMINAL} title="your project" />
                <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                  <Mono>npx sluglist status</Mono> is derived entirely from the
                  artifacts on disk — the verdicts, the fix records, and the
                  chain linking round 2 back to round 1. It answers the one
                  question an agent should never answer from memory:{" "}
                  <em>is my own work done?</em>
                </p>
                <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                  An item that already survived a fix pass goes to a human
                  instead of being ground on for another round — and the loop is
                  forbidden to reach green by editing a check or writing it off.
                  Full protocol:{" "}
                  <Link
                    className="text-[var(--color-brand)] hover:underline"
                    href="/for/agent-loop/"
                  >
                    the autonomous QA loop
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* The report — the artifact a client actually receives. */}
          <div className="mt-12 grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-center [&>*]:min-w-0">
            <div>
              <p className="mb-2 font-mono text-[12px] text-[var(--color-brand)] uppercase tracking-widest">
                Single-file HTML proof
              </p>
              <h3 className="font-semibold text-xl tracking-tight md:text-2xl">
                One command, one file you can send
              </h3>
              <p className="mt-3 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
                A session folder is the machine-readable truth — but it is not
                something you email a client.{" "}
                <Mono>npx sluglist report</Mono> renders it as an article:
                what passed, what failed, and the fact observed behind each
                verdict, with every screenshot inlined.
              </p>
              <p className="mt-3 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
                Nothing is fetched when it opens — no stylesheet, script, font
                or image. It works from <Mono>file://</Mono> with the network
                off, and Print → Save as PDF gives a clean document.
              </p>
              <div className="mt-5">
                <Terminal code={REPORT_TERMINAL} title="your project" />
              </div>
            </div>

            <figure className="min-w-0">
              <img
                alt="A sluglist report: a pass/fail/not-tested summary, then each checklist item with its verdict badge, the observed fact recorded for it, and its evidence screenshot — all inlined in one HTML file"
                className="w-full rounded-xl border border-[var(--color-line)]"
                height={1180}
                loading="lazy"
                src="/report-example.jpg"
                width={900}
              />
              <figcaption className="mt-2 text-[12px] text-[var(--color-muted)] leading-relaxed">
                A real report from the QA agent&rsquo;s own run — a screenshot
                proves the screen looked right, so the note carries what was
                actually observed (the downloaded file&rsquo;s name and size,
                the row counts).
              </figcaption>
            </figure>
          </div>

          <p className="mt-6 text-[13px] text-[var(--color-muted)] leading-relaxed">
            Works with any agent that can read files. Claude Code is supported
            out of the box via the bundled <Mono>sluglist-fix</Mono> skill. Full
            guide:{" "}
            <Link className="underline underline-offset-2" href="/for/claude-code/">
              sluglist for Claude Code &amp; coding agents
            </Link>
            .
          </p>
        </div>
      </section>

      <Section eyebrow="Install" id="start" title="Quick start">
        <div className="grid gap-6 md:grid-cols-2 md:items-start [&>*]:min-w-0">
          <CodeBlock code={QUICK_START} />
          <div className="space-y-4 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
            <p>
              One line of config: a connector, and nothing else. That is a
              complete widget — launcher, capture modes, annotation, error and
              action capture, the offline outbox, a project slug taken from your
              hostname. <strong>Everything else is optional.</strong>
            </p>
            <p>
              Gate it behind an env flag so the code never initializes in
              production. It ships as ESM and CJS, and{" "}
              <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                html-to-image
              </code>{" "}
              loads lazily on the first capture — nothing in your initial
              bundle. Full setup:{" "}
              <Link className="underline underline-offset-2" href="/docs/quick-start/">
                the quick-start guide
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>


      <Section eyebrow="In the box" id="features" title="Everything else, one click away">
        <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
          {IN_THE_BOX.map((f) => (
            <Link
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 transition hover:bg-[var(--color-canvas)]"
              href={f.href}
              key={f.title}
            >
              <IconBadge name={f.icon} />
              <h3 className="mb-2 font-semibold text-[15px]">{f.title}</h3>
              <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                {f.body}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Reference" id="config" title="Configuration">
        {/* overflow-x-auto, not overflow-hidden: the table is ~570px wide, so on
            a phone `hidden` silently amputated the entire Description column.
            Scrolling inside its own box keeps the page itself from panning. */}
        <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-[var(--color-surface)] text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Option</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {CONFIG.map(([name, type, desc]) => (
                <tr className="border-[var(--color-line)] border-t" key={name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[var(--color-ink)]">
                    {name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[var(--color-muted)]">
                    {type}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-2)]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
