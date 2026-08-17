import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-32 text-center">
      <p className="mb-2 font-mono text-[12px] text-[var(--color-muted)] uppercase tracking-widest">
        404
      </p>
      <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
        Page not found
      </h1>
      <p className="mb-8 max-w-md text-[15px] text-[var(--color-ink-2)] leading-relaxed">
        The page you&rsquo;re looking for doesn&rsquo;t exist. The docs index or
        the homepage is probably where you want to go.
      </p>
      <div className="flex gap-3">
        <Link
          className="rounded-xl bg-[var(--color-brand)] px-5 py-2.5 font-medium text-[14px] text-[var(--color-brand-ink)] transition hover:opacity-90"
          href="/"
        >
          Homepage
        </Link>
        <Link
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 font-medium text-[14px] transition hover:bg-[var(--color-canvas)]"
          href="/docs/"
        >
          Docs
        </Link>
      </div>
    </div>
  );
}
