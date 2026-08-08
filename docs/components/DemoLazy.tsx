"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Demo = dynamic(() => import("./Demo"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] text-[14px] text-[var(--color-muted)]">
      Loading the live demo…
    </div>
  ),
});

/**
 * The demo (and the widget library behind it) stays out of the initial bundle:
 * it loads when the section scrolls near the viewport. The page that has to
 * rank stays light; the widget still feels instant by the time you reach it.
 */
export function DemoLazy() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{visible ? <Demo /> : <div className="min-h-[260px]" />}</div>;
}
