import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { renderMarkdown } from "@/lib/markdown";
import { pageMetadata, SITE_URL } from "@/lib/site";
import { USE_CASES, getUseCase } from "@/lib/use-cases";

export function generateStaticParams() {
  return USE_CASES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) return {};
  return pageMetadata({
    path: `/for/${uc.slug}/`,
    title: uc.metaTitle,
    description: uc.description,
  });
}

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) notFound();
  const html = renderMarkdown(uc.body);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: uc.faq.map((f) => ({
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
          name: uc.metaTitle,
          description: uc.description,
          url: `${SITE_URL}/for/${uc.slug}/`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#software` },
        }}
      />
      <p className="mb-2 font-mono text-[12px] text-[var(--color-muted)] uppercase tracking-widest">
        Use case
      </p>
      <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
        {uc.title}
      </h1>
      <p className="mb-8 text-[16px] text-[var(--color-ink-2)] leading-relaxed">
        {uc.intro}
      </p>
      <article
        className="prose prose-site max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <section className="mt-12 border-[var(--color-line)] border-t pt-8">
        <h2 className="mb-5 font-semibold text-xl tracking-tight">
          Frequently asked questions
        </h2>
        <div className="space-y-5">
          {uc.faq.map((f) => (
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
