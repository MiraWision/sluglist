"use client";

import { useState } from "react";

/**
 * The only interactive part of a code block — kept separate so the block
 * itself can stay a server component and be highlighted at build time.
 */
export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
      onClick={copy}
      type="button"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
