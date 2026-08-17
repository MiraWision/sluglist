import type { Metadata } from "next";
import Link from "next/link";
import { IconBadge } from "@/components/Icons";
import { DOC_PAGES } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/docs/",
  title: "Documentation",
  description:
    "sluglist documentation: quick start, capture modes, connectors, checklist mode, production privacy, the agent loop and the artifact format.",
  type: "website",
});

export default function DocsIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
      <p className="mb-2 font-mono text-[12px] text-[var(--color-brand)] uppercase tracking-widest">
        Docs
      </p>
      <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
        Documentation
      </h1>
      <p className="mb-10 max-w-2xl text-[15px] text-[var(--color-ink-2)] leading-relaxed">
        Everything is optional beyond one line of config. Start with the quick
        start; add pieces when you need them. Not sure which pieces?{" "}
        <Link className="text-[var(--color-brand)] hover:underline" href="/for/">
          pick the scenario that matches you
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        {DOC_PAGES.map((d) => (
          <Link
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 transition hover:bg-[var(--color-canvas)]"
            href={`/docs/${d.slug}/`}
            key={d.slug}
          >
            <IconBadge name={d.icon} />
            <h2 className="mb-2 font-semibold text-[15px]">{d.title}</h2>
            <p className="text-[14px] text-[var(--color-ink-2)] leading-relaxed">
              {d.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
