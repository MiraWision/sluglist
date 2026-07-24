import { CodeBlock } from "./components/CodeBlock";
import { Demo } from "./components/Demo";

const REPO = "https://github.com/MiraWision/sluglist";
const NPM = "https://www.npmjs.com/package/sluglist";

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
        Tell Claude Code to <em>&ldquo;read feedback and fix it.&rdquo;</em> The
        bundled skill reads each issue, localizes by selector and frames, fixes
        the code, and writes a <Mono>.done</Mono> report.
      </>
    ),
  },
  {
    n: "+",
    title: "Or hand it a checklist",
    body: (
      <>
        Going the other way, ask the agent to{" "}
        <em>&ldquo;generate a checklist from this branch.&rdquo;</em> It turns
        the diff into a client-facing acceptance list; the client clicks each row
        to check it off (or flags a problem), and every verdict lands in{" "}
        <Mono>session.yaml</Mono>.
      </>
    ),
  },
];

const QUICK_START = `import {
  createFeedbackWidget,
  mountFeedbackWidget,
  DownloadConnector,
} from "sluglist";

const widget = createFeedbackWidget({
  project: "my-app",
  connectors: [new DownloadConnector()],
  enabled: import.meta.env.DEV,
  shortcut: "Shift+F",
});

mountFeedbackWidget(widget, {
  categories: [
    { key: "bug", label: "Bug" },
    { key: "design", label: "Design" },
  ],
  onIssueCaptured: (r) => console.log("captured", r.issueId),
});`;

const CONNECTOR_CODE = `interface ArtifactFile {
  path: string;   // "01-broken-header.png"
  blob: Blob;
  mime: string;   // text/yaml | text/markdown | image/png
}

interface FeedbackConnector {
  id: string;
  put(sessionId: string, file: ArtifactFile): Promise<void>;
}

// Deliver to your own storage / API / tracker:
class MyConnector implements FeedbackConnector {
  id = "my-storage";
  async put(sessionId, file) {
    await fetch("/api/feedback", {
      method: "POST",
      body: file.blob,
      headers: { "x-path": \`\${sessionId}/\${file.path}\` },
    });
  }
}`;

const ARTIFACTS = `my-app/session-2026-07-23-a1b2/
  session.yaml                     # upserted on every issue
  01-save-does-nothing.md          # frontmatter + comment
  01-save-does-nothing.png         # the screenshot
  01-save-does-nothing-frames/     # record-mode steps
    01.png  02.png  03.png
  02-logo-overlap.md
  02-logo-overlap.png`;

const FRONTMATTER = `---
id: "01"
url: /dashboard/animals
selector: 'button[aria-label="Save"]'
selector_strategy: aria
selector_unique: true
mode: element
category: bug
element_text: "Save"
dom_path: "body > main > form > button"
screen: dashboard
viewport: 1512x982
screenshot: 01-save-does-nothing.png
masked: true
errors_count: 1
actions_count: 4
recording: true
frames_count: 3
frames_dir: 01-save-does-nothing-frames
created_at: 2026-07-23T14:05:10Z
reporter:
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
- [1s before report] click button[aria-label="Save"] ("Save") — frame 03`;

const BETA_CODE = `createFeedbackWidget({
  project: "acme",
  preset: "beta",              // mask inputs + consent + "Report a problem"
  connectors: [new HttpConnector("/api/feedback")],
  identity: { userId, email, name },   // → reporter in artifacts
  custom: { plan: "pro", appVersion },  // → custom block per issue
});`;

const FEATURES = [
  {
    title: "Flexible capture",
    body: "Pick an element (with a smart CSS selector), drag an area, grab the full scrollable page, or record a flow.",
  },
  {
    title: "Built-in annotation",
    body: "Arrow, box and text over the screenshot, with color, undo and keyboard shortcuts — flattened at full resolution.",
  },
  {
    title: "Smart selectors",
    body: "data-testid → id → aria → landmark path. Never emits Tailwind utility or hashed CSS-Modules classes.",
  },
  {
    title: "Error capture",
    body: "A ring buffer of recent console errors, uncaught exceptions and promise rejections attaches to each issue as a ## Errors section, with a relative timestamp per entry.",
  },
  {
    title: "Action trail & record mode",
    body: "Every issue carries a ## Actions trail — recent clicks, navigations and typing (never the content). Record mode adds a screenshot frame per step.",
  },
  {
    title: "Checklist mode",
    body: "Pre-seed an acceptance checklist; the client clicks each row to check it off, or flags a problem to open the normal issue flow, linked. Smart links point them at the right page. Get a coverage map in session.yaml — and generate the checklist from a branch diff.",
  },
  {
    title: "Pluggable connectors",
    body: "The core never knows about storage. Deliver artifacts anywhere via a tiny put() interface — fan out to several at once.",
  },
  {
    title: "Offline outbox",
    body: "Undelivered issues are persisted to IndexedDB and retried on the next load. A failed upload never loses feedback.",
  },
  {
    title: "Framework-agnostic",
    body: "Zero UI framework. Style-isolated in a shadow DOM, mountable anywhere — even a Chrome extension content script.",
  },
];

const MODES = [
  { name: "Element", desc: "Hover to highlight, click to capture; records a descriptive CSS selector + text + DOM path." },
  { name: "Area", desc: "Drag a rectangle and crop the page to it." },
  { name: "Full page", desc: "The entire scrollable document, top to bottom." },
  { name: "Record steps", desc: "Capture a frame on each click, navigation and submit — automatic steps-to-reproduce as numbered screenshots." },
  { name: "Comment only", desc: "No screenshot — just a note with all the page metadata." },
];

const CONFIG = [
  ["project", "string", "Slug written into session.yaml."],
  ["connectors", "FeedbackConnector[]", "Delivery targets; runs them all."],
  ["enabled", "boolean", "Gate on env; skip in production."],
  ["offlineQueue", "boolean", "IndexedDB outbox + retry (default on)."],
  ["container", "HTMLElement", "Mount target (default document.body)."],
  ["shortcut", "string | false", "Toggle key (default \"Shift+F\")."],
  ["position", "\"bottom-left\" | \"bottom-right\"", "Button corner."],
  ["accentColor", "string", "Accent for primary actions."],
  ["categories", "{ key, label }[]", "Triage chips; [] hides them."],
  ["onIssueCaptured", "(result) => void", "Fired after each capture."],
  ["strings", "Partial<Strings>", "Override any UI text (i18n)."],
];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 md:py-24" id={id}>
      <p className="mb-2 font-mono text-[12px] text-[var(--color-muted)] uppercase tracking-widest">
        {eyebrow}
      </p>
      <h2 className="mb-8 font-semibold text-2xl tracking-tight md:text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--color-ink)]">
      {children}
    </code>
  );
}

function Terminal({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#18181b] shadow-sm">
      <div className="flex items-center gap-2 border-white/10 border-b px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[11px] text-white/40">{title}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed">
        <code className="font-mono text-[#e4e4e7]">{code}</code>
      </pre>
    </div>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <img
        alt=""
        className="h-7 w-7"
        height={28}
        src={`${import.meta.env.BASE_URL}icon.svg`}
        width={28}
      />
      sluglist
    </span>
  );
}

export function App() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-[var(--color-line)] border-b bg-[color-mix(in_oklab,var(--color-canvas)_85%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Logo />
          <nav className="flex items-center gap-5 text-[14px] text-[var(--color-muted)]">
            <a className="hover:text-[var(--color-ink)]" href="#agents">
              Agents
            </a>
            <a className="hidden hover:text-[var(--color-ink)] sm:inline" href="#demo">
              Demo
            </a>
            <a className="hidden hover:text-[var(--color-ink)] sm:inline" href="#beta">
              Beta
            </a>
            <a className="hidden hover:text-[var(--color-ink)] sm:inline" href="#start">
              Docs
            </a>
            <a className="hover:text-[var(--color-ink)]" href={NPM}>
              npm
            </a>
            <a
              className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"
              href={REPO}
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-16 text-center md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-[12px] text-[var(--color-muted)]">
            MIT · zero-config · ESM + CJS
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-bold text-4xl tracking-tight md:text-6xl">
            Visual feedback,
            <br />
            one line in.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-[var(--color-ink-2)] md:text-lg">
            A drop-in widget for dev and staging sites. Pick an element,
            screenshot, annotate, and deliver clean artifacts through your own
            connectors.
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-[14px]">
              <span>
                <span className="text-[var(--color-muted)]">$ </span>npm install
                sluglist
              </span>
            </div>
            <div className="flex gap-3">
              <a
                className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[14px] text-[var(--color-canvas)] transition hover:opacity-90"
                href="#start"
              >
                Get started
              </a>
              <a
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 font-medium text-[14px] transition hover:bg-[var(--color-canvas)]"
                href="#demo"
              >
                Try the demo
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Agent story — the differentiator, first section after the hero */}
      <section
        className="border-[var(--color-line)] border-y bg-[var(--color-surface)]"
        id="agents"
      >
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <p className="mb-2 font-mono text-[12px] text-[var(--color-muted)] uppercase tracking-widest">
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

          <div className="mt-10 grid gap-5 md:grid-cols-3">
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

          <div className="mt-6 grid gap-5 md:grid-cols-2 md:items-start">
            <Terminal code={DEV_TERMINAL} title="your project" />
            <Terminal code={AGENT_TERMINAL} title="claude code" />
          </div>

          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] text-[var(--color-muted)] uppercase tracking-wider">
              …/.done — the agent&rsquo;s report
            </p>
            <CodeBlock code={DONE_REPORT} lang="markdown" />
          </div>

          <p className="mt-6 text-[13px] text-[var(--color-muted)] leading-relaxed">
            Works with any agent that can read files. Claude Code is supported
            out of the box via the bundled <Mono>sluglist-fix</Mono> skill.
          </p>
        </div>
      </section>

      <Section eyebrow="Live" id="demo" title="Try it on this page">
        <Demo />
      </Section>

      <Section eyebrow="Why" id="features" title="Everything a feedback loop needs">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
              key={f.title}
            >
              <h3 className="mb-2 font-semibold text-[15px]">{f.title}</h3>
              <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Install" id="start" title="Quick start">
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <CodeBlock code={QUICK_START} />
          <div className="space-y-4 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
            <p>
              Create a widget with one or more connectors, then mount it. That's
              it — a floating button appears and people can start reporting.
            </p>
            <p>
              Gate it behind an env flag so the code never initializes in
              production. It ships as ESM and CJS, and{" "}
              <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                html-to-image
              </code>{" "}
              loads lazily on the first capture — nothing in your initial
              bundle.
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Capture" id="modes" title="Five ways to report">
        <div className="grid gap-4 sm:grid-cols-2">
          {MODES.map((m) => (
            <div
              className="flex gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
              key={m.name}
            >
              <div className="font-semibold text-[15px]">{m.name}</div>
              <div className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                {m.desc}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Delivery" id="connectors" title="Connectors own the storage">
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <p className="text-[15px] text-[var(--color-ink-2)] leading-relaxed">
            The core produces artifacts and hands them to your connectors. All
            auth, credentials and knowledge of where things go live in the
            connector — never in the widget. Built-ins:{" "}
            <code className="font-mono text-[13px]">MemoryConnector</code> and{" "}
            <code className="font-mono text-[13px]">DownloadConnector</code> (zips
            a session). Failures retry with backoff and never block the UI.
          </p>
          <CodeBlock code={CONNECTOR_CODE} />
        </div>
      </Section>

      <Section
        eyebrow="Beta"
        id="beta"
        title="A &ldquo;Report a problem&rdquo; button for real users"
      >
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <div>
            <p className="mb-4 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
              The <code className="font-mono text-[13px]">beta</code> preset turns
              sluglist into a feedback button for people on a production MVP: it
              masks form inputs and anything marked{" "}
              <code className="font-mono text-[13px]">data-private</code> in the
              screenshot, adds a screenshot-consent checkbox, and attaches the
              reporter&rsquo;s identity plus any custom fields you pass.
            </p>
            <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
              Still one-way capture by design: no inbox, no statuses, no replies,
              no accounts. Deliver through a thin endpoint that owns your storage
              keys — never ship write-keys to the browser.
            </p>
          </div>
          <CodeBlock code={BETA_CODE} />
        </div>
      </Section>

      <Section eyebrow="Contract" id="artifacts" title="A stable artifact format">
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <div>
            <p className="mb-4 text-[15px] text-[var(--color-ink-2)] leading-relaxed">
              Every session is a folder: an upserted{" "}
              <code className="font-mono text-[13px]">session.yaml</code> index
              plus one markdown file per issue with YAML frontmatter. Structure
              and fields are a contract — they only ever change additively.
            </p>
            <CodeBlock code={ARTIFACTS} lang="text" />
          </div>
          <CodeBlock code={FRONTMATTER} lang="markdown" />
        </div>
      </Section>

      <Section eyebrow="Reference" id="config" title="Configuration">
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
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

      <footer className="border-[var(--color-line)] border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-10 text-[14px] text-[var(--color-muted)] sm:flex-row">
          <Logo />
          <div className="flex items-center gap-5">
            <a className="hover:text-[var(--color-ink)]" href={REPO}>
              GitHub
            </a>
            <a className="hover:text-[var(--color-ink)]" href={NPM}>
              npm
            </a>
            <span>MIT © MiraWision</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
