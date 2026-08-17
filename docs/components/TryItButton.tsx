"use client";

import { requestDemoOpen } from "@/lib/demo-bus";

/**
 * The hero's secondary action: open the widget that is already running on this
 * page, and scroll to the panel where its artifacts will appear.
 *
 * It stays an anchor rather than a button so the scroll works natively — before
 * hydration, with JavaScript disabled, and on a middle-click. The click handler
 * only adds the part that needs script: `ui.open()` on the mounted widget.
 */
export function TryItButton() {
  return (
    <a
      className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 font-medium text-[14px] transition hover:bg-[var(--color-canvas)]"
      data-umami-event="hero-try-demo"
      href="#demo"
      onClick={() => requestDemoOpen()}
    >
      Report something here ↓
    </a>
  );
}
