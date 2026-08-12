export function Section({
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

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--color-ink)]">
      {children}
    </code>
  );
}

export function Terminal({ title, code }: { title: string; code: string }) {
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
