import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { DOC_PAGES, getDocPage } from "@/lib/docs";
import { renderMarkdownFile } from "@/lib/markdown";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return DOC_PAGES.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocPage(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs/${doc.slug}/` },
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getDocPage(slug);
  if (!doc) notFound();
  const html = renderMarkdownFile(`content/docs/${doc.slug}.md`);
  const index = DOC_PAGES.findIndex((d) => d.slug === doc.slug);
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE_URL}/docs/` },
            {
              "@type": "ListItem",
              position: 2,
              name: doc.title,
              item: `${SITE_URL}/docs/${doc.slug}/`,
            },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: doc.title,
          description: doc.description,
          url: `${SITE_URL}/docs/${doc.slug}/`,
          author: { "@id": `${SITE_URL}/#org` },
          about: { "@id": `${SITE_URL}/#software` },
        }}
      />
      <nav className="mb-6 text-[13px] text-[var(--color-muted)]">
        <Link className="hover:text-[var(--color-ink)]" href="/docs/">
          Docs
        </Link>{" "}
        / {doc.label}
      </nav>
      <h1 className="mb-8 font-bold text-3xl tracking-tight md:text-4xl">
        {doc.title}
      </h1>
      <article
        className="prose prose-site max-w-none"
        // Build-time render of our own markdown content.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <nav className="mt-12 flex justify-between gap-4 border-[var(--color-line)] border-t pt-6 text-[14px]">
        {prev ? (
          <Link
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            href={`/docs/${prev.slug}/`}
          >
            ← {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            href={`/docs/${next.slug}/`}
          >
            {next.label} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
