import type { Metadata } from "next";
import Link from "next/link";
import { ContractDiagram } from "@/components/Diagrams";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { pageMetadata, SITE_URL } from "@/lib/site";
import { SCENARIOS, USE_CASES } from "@/lib/use-cases";

export const metadata: Metadata = pageMetadata({
  path: "/for/",
  title: "Use cases: four ways to collect feedback",
  description:
    "One artifact contract, four entry points: your own dev loop, acceptance with your client and team, real users in production, and an autonomous agent QA loop.",
  type: "website",
});

const TOOLS = USE_CASES.filter((c) => c.group === "tool");

export default function UseCasesIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "sluglist use cases",
          url: `${SITE_URL}/for/`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#software` },
        }}
      />
      <p className="mb-2 font-mono text-[12px] text-[var(--color-brand)] uppercase tracking-widest">
        Use cases
      </p>
      <h1 className="mb-4 max-w-2xl font-bold text-3xl tracking-tight md:text-4xl">
        One contract, four ways in
      </h1>
      <p className="mb-10 max-w-2xl text-[16px] text-[var(--color-ink-2)] leading-relaxed">
        Feedback moves from whoever found the problem to whoever fixes it. Both
        ends can be a person or an agent, and in every combination the thing
        that travels between them is the same: a folder of plain files with a
        documented format. Pick the end you are standing at.
      </p>

      <ContractDiagram />

      <div className="mt-14 grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
        {SCENARIOS.map((c, i) => (
          <div
            className="flex flex-col rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
            key={c.slug}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border tint-brand">
                <Icon name={c.icon} />
              </span>
              <span className="font-mono text-[12px] text-[var(--color-brand)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-semibold text-[17px] tracking-tight">
                <Link
                  className="hover:underline"
                  data-umami-event={`hub-${c.slug}`}
                  href={`/for/${c.slug}/`}
                >
                  {c.label}
                </Link>
              </h2>
            </div>
            <p className="mb-3 text-[13px] text-[var(--color-muted)]">{c.who}</p>
            <p className="mb-4 text-[14px] text-[var(--color-ink-2)] leading-relaxed">
              {c.description}
            </p>
            <ul className="mb-5 space-y-1.5 text-[13.5px] text-[var(--color-ink-2)]">
              {c.benefits.map((b) => (
                <li className="flex gap-2" key={b.title}>
                  <span aria-hidden="true" className="text-[var(--color-pass)]">
                    ✓
                  </span>
                  <span>{b.title}</span>
                </li>
              ))}
            </ul>
            <Link
              className="mt-auto text-[14px] text-[var(--color-brand)] hover:underline"
              href={`/for/${c.slug}/`}
            >
              {c.title} →
            </Link>
          </div>
        ))}
      </div>

      <section className="mt-14 border-[var(--color-line)] border-t pt-8">
        <h2 className="mb-4 font-semibold text-xl tracking-tight">
          Working with a specific tool
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {TOOLS.map((c) => (
            <Link
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition hover:bg-[var(--color-canvas)]"
              href={`/for/${c.slug}/`}
              key={c.slug}
            >
              <p className="font-semibold text-[14px]">{c.title}</p>
              <p className="mt-1 text-[13px] text-[var(--color-ink-2)] leading-relaxed">
                {c.who}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          className="rounded-xl bg-[var(--color-brand)] px-5 py-2.5 font-medium text-[14px] text-[var(--color-brand-ink)] transition hover:opacity-90"
          href="/docs/quick-start/"
        >
          Get started
        </Link>
        <Link
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 font-medium text-[14px] transition hover:bg-[var(--color-canvas)]"
          href="/#demo"
        >
          Try the live demo
        </Link>
      </div>
    </div>
  );
}
