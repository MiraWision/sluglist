import { highlight } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

/**
 * A code sample: language label, copy button, and VS Code's own colours.
 *
 * A server component — the highlighting runs at build time and ships as plain
 * HTML, so a page full of samples still costs no client JavaScript beyond the
 * copy button.
 */
export async function CodeBlock({ code, lang = "ts" }: CodeBlockProps) {
  const html = await highlight(code, lang);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-[var(--color-line)] border-b px-4 py-2">
        <span className="font-mono text-[11px] text-[var(--color-muted)] uppercase tracking-wider">
          {lang}
        </span>
        <CopyButton code={code} />
      </div>
      <div
        className="code-shiki overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed"
        // Build-time Shiki output for our own code samples.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
