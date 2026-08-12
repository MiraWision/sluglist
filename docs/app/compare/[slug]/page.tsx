import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { COMPARE_PAGES, getComparePage } from "@/lib/compare";
import { pageMetadata, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return COMPARE_PAGES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cp = getComparePage(slug);
  if (!cp) return {};
  return pageMetadata({
    path: `/compare/${cp.slug}/`,
    title: cp.metaTitle,
    description: cp.description,
  });
}

export default async function ComparePageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cp = getComparePage(slug);
  if (!cp) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: cp.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: cp.metaTitle,
          description: cp.description,
          url: `${SITE_URL}/compare/${cp.slug}/`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#software` },
        }}
      />
      <p className="mb-2 font-mono text-[12px] text-[var(--color-muted)] uppercase tracking-widest">
        Comparison
      </p>
      <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
        sluglist vs {cp.name}
      </h1>
      <p className="mb-6 text-[16px] text-[var(--color-ink-2)] leading-relaxed">
        {cp.intro}
      </p>
      <div className="mb-10 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-2 font-semibold text-[15px]">What {cp.name} is</h2>
        <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
          {cp.otherSummary}
        </p>
        <p className="mt-3 text-[12px] text-[var(--color-muted)] leading-relaxed">
          Written in good faith from public information, August 2026. {cp.name}{" "}
          is a trademark of its owner and is not affiliated with sluglist —
          check their site for current features and pricing.
        </p>
      </div>

      <h2 className="mb-4 font-semibold text-xl tracking-tight">
        Side by side
      </h2>
      <div className="mb-10 overflow-x-auto rounded-xl border border-[var(--color-line)]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="bg-[var(--color-surface)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
              <th className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                sluglist
              </th>
              <th className="px-4 py-2.5 font-medium">{cp.name}</th>
            </tr>
          </thead>
          <tbody>
            {cp.rows.map((r) => (
              <tr className="border-[var(--color-line)] border-t align-top" key={r.label}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-ink)]">
                  {r.label}
                </td>
                <td className="min-w-[220px] px-4 py-3 text-[var(--color-ink-2)]">
                  {r.sluglist}
                </td>
                <td className="min-w-[220px] px-4 py-3 text-[var(--color-ink-2)]">
                  {r.other}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-10 grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 font-semibold text-[15px]">
            Pick {cp.name} when…
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[14px] text-[var(--color-ink-2)] leading-relaxed">
            {cp.pickOtherWhen.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 font-semibold text-[15px]">
            Pick sluglist when…
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-[14px] text-[var(--color-ink-2)] leading-relaxed">
            {cp.pickSluglistWhen.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>

      <section className="border-[var(--color-line)] border-t pt-8">
        <h2 className="mb-5 font-semibold text-xl tracking-tight">
          Frequently asked questions
        </h2>
        <div className="space-y-5">
          {cp.faq.map((f) => (
            <div key={f.q}>
              <h3 className="mb-1.5 font-semibold text-[15px]">{f.q}</h3>
              <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[14px] text-[var(--color-canvas)] transition hover:opacity-90"
          href="/docs/quick-start/"
        >
          Get started with sluglist
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
