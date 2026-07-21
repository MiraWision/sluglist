import { useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

export function CodeBlock({ code, lang = "ts" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-[var(--color-line)] border-b px-4 py-2">
        <span className="font-mono text-[11px] text-[var(--color-muted)] uppercase tracking-wider">
          {lang}
        </span>
        <button
          className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          onClick={copy}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed">
        <code className="font-mono text-[var(--color-ink-2)]">{code}</code>
      </pre>
    </div>
  );
}
