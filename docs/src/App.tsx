import { CodeBlock } from "./components/CodeBlock";
import { Demo } from "./components/Demo";

const REPO = "https://github.com/MiraWision/snaglist";
const NPM = "https://www.npmjs.com/package/snaglist";

const QUICK_START = `import {
  createFeedbackWidget,
  mountFeedbackWidget,
  DownloadConnector,
} from "snaglist";

const widget = createFeedbackWidget({
  project: "my-app",
  connectors: [new DownloadConnector()],
  enabled: import.meta.env.DEV,
});

mountFeedbackWidget(widget, {
  hotkey: "alt+shift+f",
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

const ARTIFACTS = `my-app/session-2026-07-21-a1b2/
  session.yaml            # upserted on every issue
  01-broken-header.md     # frontmatter + comment
  01-broken-header.png    # optional screenshot(s)
  02-logo-overlap.md
  02-logo-overlap.png`;

const FRONTMATTER = `---
id: "01"
url: /dashboard/animals
selector: 'button[aria-label="Save"]'
selector_strategy: aria
selector_unique: true
mode: element
element_text: "Save"
dom_path: "body > main > form > button"
screen: checkout
viewport: 1512x982
screenshot: 01-broken-header.png
created_at: 2026-07-21T14:05:10Z
---

The save button does nothing on the animals form.`;

const FEATURES = [
  {
    title: "Three capture modes",
    body: "Pick an element (with a smart CSS selector), drag an area, or grab the full scrollable page.",
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
  { name: "Comment only", desc: "No screenshot — just a note with all the page metadata." },
];

const CONFIG = [
  ["project", "string", "Slug written into session.yaml."],
  ["connectors", "FeedbackConnector[]", "Delivery targets; runs them all."],
  ["enabled", "boolean", "Gate on env; skip in production."],
  ["offlineQueue", "boolean", "IndexedDB outbox + retry (default on)."],
  ["container", "HTMLElement", "Mount target (default document.body)."],
  ["hotkey", "string | null", "Menu toggle, e.g. \"alt+shift+f\"."],
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

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[var(--color-canvas)]">
        <svg
          aria-hidden
          fill="none"
          height="14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="14"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
      snaglist
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
            <a className="hover:text-[var(--color-ink)]" href="#demo">
              Demo
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
                snaglist
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

      <Section
        eyebrow="Live"
        id="demo"
        title="Try it on this page"
      >
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

      <Section eyebrow="Capture" id="modes" title="Four ways to report">
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
