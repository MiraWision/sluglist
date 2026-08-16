import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { renderMarkdownFile } from "@/lib/markdown";
import { pageMetadata, SITE_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/changelog/",
  title: "Changelog",
  description:
    "Release notes for the sluglist feedback widget: every version, every feature, and the additive artifact-format history.",
});

export default async function ChangelogPage() {
  // The library CHANGELOG is the single source of truth; rendered at build time.
  const html = await renderMarkdownFile("../CHANGELOG.md");
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "sluglist changelog",
          url: `${SITE_URL}/changelog/`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#software` },
        }}
      />
      <article
        className="prose prose-site max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
