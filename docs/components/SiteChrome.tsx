import Link from "next/link";
import { NPM, REPO } from "@/lib/site";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      {/* Decorative: the wordmark next to it names the product. */}
      <img alt="" className="h-7 w-7" height={28} src="/icon.svg" width={28} />
      sluglist
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-[var(--color-line)] border-b bg-[color-mix(in_oklab,var(--color-canvas)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link className="hover:opacity-80" href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-5 text-[14px] text-[var(--color-muted)]">
          <Link className="hover:text-[var(--color-ink)]" href="/docs/">
            Docs
          </Link>
          <Link
            className="hidden hover:text-[var(--color-ink)] sm:inline"
            href="/#demo"
          >
            Demo
          </Link>
          <Link
            className="hidden hover:text-[var(--color-ink)] sm:inline"
            href="/changelog/"
          >
            Changelog
          </Link>
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
  );
}

const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Docs",
    links: [
      { label: "Quick start", href: "/docs/quick-start/" },
      { label: "Connectors", href: "/docs/connectors/" },
      { label: "Checklist mode", href: "/docs/checklist/" },
      { label: "Production", href: "/docs/production/" },
      { label: "Artifact format", href: "/docs/artifacts/" },
      { label: "Agents & CLI", href: "/docs/agents/" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { label: "Claude Code & agents", href: "/for/claude-code/" },
      { label: "Client acceptance", href: "/for/client-acceptance/" },
      { label: "Beta & production", href: "/for/beta-feedback/" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs Marker.io", href: "/compare/marker-io/" },
      { label: "vs Usersnap", href: "/compare/usersnap/" },
      { label: "vs BugHerd", href: "/compare/bugherd/" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Changelog", href: "/changelog/" },
      { label: "GitHub", href: REPO },
      { label: "npm", href: NPM },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-[var(--color-line)] border-t">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 pt-10 text-[14px] sm:grid-cols-4">
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 font-semibold text-[13px] text-[var(--color-ink)]">
              {col.title}
            </p>
            <ul className="space-y-2 text-[var(--color-muted)]">
              {col.links.map((l) =>
                l.href.startsWith("http") ? (
                  <li key={l.href}>
                    <a className="hover:text-[var(--color-ink)]" href={l.href}>
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.href}>
                    <Link className="hover:text-[var(--color-ink)]" href={l.href}>
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 px-6 pt-10 text-[14px] text-[var(--color-muted)] sm:flex-row sm:items-center">
        <Logo />
        <span>MIT © MiraWision</span>
      </div>
      {/* Stated plainly rather than buried: anyone who opens DevTools to check
          the privacy claims will find exactly one third-party request, and this
          line explains it. pr-20 keeps clear of the demo widget's launcher. */}
      <div className="mx-auto max-w-5xl px-6 pt-6 pr-20 pb-10 text-[13px] text-[var(--color-muted)] lg:pr-6">
        Analytics:{" "}
        <code className="rounded bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[0.9em]">
          Umami
        </code>
        , EU data region — cookieless, no personal data, no cross-site tracking.
        No consent banner needed, so there isn&rsquo;t one.
      </div>
    </footer>
  );
}
