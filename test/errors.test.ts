// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorCapture, formatErrorAge } from "../src/errors";

afterEach(() => vi.restoreAllMocks());

describe("createErrorCapture", () => {
  it("captures all three sources with correct source labels", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cap = createErrorCapture();
    try {
      console.error("console boom");
      window.dispatchEvent(
        new ErrorEvent("error", { message: "uncaught boom", error: new Error("uncaught boom") })
      );
      const rej = new Event("unhandledrejection") as Event & { reason: unknown };
      rej.reason = new Error("rejected boom");
      window.dispatchEvent(rej);

      const snap = cap.snapshot();
      expect(snap.map((r) => r.source)).toEqual([
        "console",
        "exception",
        "rejection",
      ]);
      expect(snap[0].message).toBe("console boom");
      expect(snap[1].message).toBe("uncaught boom");
      expect(snap[2].message).toBe("Unhandled rejection: rejected boom");
      expect(snap[1].stack).toContain("Error");
    } finally {
      cap.uninstall();
    }
  });

  it("still calls the original console.error", () => {
    const original = vi.fn();
    const saved = console.error;
    console.error = original;
    const cap = createErrorCapture();
    try {
      console.error("boom", 42);
      expect(original).toHaveBeenCalledWith("boom", 42);
      expect(cap.snapshot()[0].message).toBe("boom 42");
    } finally {
      cap.uninstall();
      console.error = saved;
    }
  });

  it("capture:false installs nothing and snapshots empty", () => {
    const saved = console.error;
    const cap = createErrorCapture({ capture: false });
    expect(console.error).toBe(saved); // not wrapped
    console.error = vi.fn(); // silence
    console.error("x");
    expect(cap.snapshot()).toEqual([]);
    console.error = saved;
  });

  it("keeps only the last N (25 errors → last 20)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cap = createErrorCapture();
    try {
      for (let i = 0; i < 25; i++) {
        console.error(`e${i}`);
      }
      const snap = cap.snapshot();
      expect(snap).toHaveLength(20);
      expect(snap[0].message).toBe("e5");
      expect(snap.at(-1)?.message).toBe("e24");
    } finally {
      cap.uninstall();
    }
  });

  it("captures console.warn only when captureWarnings is set", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const off = createErrorCapture();
    console.warn("ignored");
    expect(off.snapshot()).toHaveLength(0);
    off.uninstall();

    const on = createErrorCapture({ captureWarnings: true });
    console.warn("kept");
    expect(on.snapshot()).toMatchObject([{ source: "console", message: "kept" }]);
    on.uninstall();
  });

  it("ignores the widget's own log lines", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cap = createErrorCapture();
    console.error("[sluglist] delivery failed: 500");
    expect(cap.snapshot()).toHaveLength(0);
    cap.uninstall();
  });

  it("truncates long messages to 500 chars with a marker", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cap = createErrorCapture();
    console.error("y".repeat(1000));
    const msg = cap.snapshot()[0].message;
    expect(msg.length).toBeLessThan(1000);
    expect(msg.endsWith("…[truncated]")).toBe(true);
    cap.uninstall();
  });

  it("uninstall restores console.error", () => {
    const saved = console.error;
    const cap = createErrorCapture();
    expect(console.error).not.toBe(saved);
    cap.uninstall();
    expect(console.error).toBe(saved);
  });
});

describe("formatErrorAge", () => {
  it("formats seconds/minutes/hours", () => {
    expect(formatErrorAge(3000)).toBe("3s");
    expect(formatErrorAge(120_000)).toBe("2m");
    expect(formatErrorAge(3_600_000)).toBe("1h");
    expect(formatErrorAge(-50)).toBe("0s");
  });
});

describe("network capture", () => {
  it("records failed fetch (>=400) and network errors; path has no query", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((url: unknown) =>
      String(url).includes("boom")
        ? Promise.reject(new TypeError("failed to fetch"))
        : Promise.resolve({ status: 500 } as Response)
    ) as typeof fetch;
    const cap = createErrorCapture();
    try {
      await globalThis.fetch("/api/animals?token=secret").catch(() => undefined);
      await globalThis.fetch("/api/boom").catch(() => undefined);
      const snap = cap.snapshot();
      expect(snap.map((r) => r.source)).toEqual(["network", "network"]);
      expect(snap[0].message).toMatch(/^GET \/api\/animals → 500 \(\d+ms\)$/);
      expect(snap[0].message).not.toContain("token");
      expect(snap[1].message).toMatch(
        /^GET \/api\/boom → network error \(\d+ms\)$/
      );
    } finally {
      cap.uninstall();
      globalThis.fetch = savedFetch;
    }
  });

  it("ignores successful (2xx) fetch and respects the request method", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((url: unknown) =>
      Promise.resolve({ status: String(url).includes("bad") ? 404 : 200 } as Response)
    ) as typeof fetch;
    const cap = createErrorCapture();
    try {
      await globalThis.fetch("/ok");
      await globalThis.fetch("/bad", { method: "post" });
      const snap = cap.snapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0].message).toMatch(/^POST \/bad → 404 \(\d+ms\)$/);
    } finally {
      cap.uninstall();
      globalThis.fetch = savedFetch;
    }
  });

  it("captureNetwork:false leaves fetch unwrapped", async () => {
    const savedFetch = globalThis.fetch;
    const spy = vi.fn(() => Promise.resolve({ status: 500 } as Response));
    globalThis.fetch = spy as unknown as typeof fetch;
    const cap = createErrorCapture({ captureNetwork: false });
    try {
      expect(globalThis.fetch).toBe(spy);
      await globalThis.fetch("/x");
      expect(cap.snapshot()).toHaveLength(0);
    } finally {
      cap.uninstall();
      globalThis.fetch = savedFetch;
    }
  });

  it("restores the original fetch on uninstall", () => {
    const savedFetch = globalThis.fetch;
    const ref = vi.fn() as unknown as typeof fetch;
    globalThis.fetch = ref;
    const cap = createErrorCapture();
    expect(globalThis.fetch).not.toBe(ref);
    cap.uninstall();
    expect(globalThis.fetch).toBe(ref);
    globalThis.fetch = savedFetch;
  });

  it("wraps XHR and records failed status (query stripped)", () => {
    const savedXHR = globalThis.XMLHttpRequest;
    class FakeXHR extends EventTarget {
      status = 0;
      open(_method: string, _url: string): void {
        // no-op
      }
      send(): void {
        // no-op
      }
    }
    globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
    const cap = createErrorCapture();
    try {
      const x = new globalThis.XMLHttpRequest() as unknown as FakeXHR;
      x.open("POST", "/api/save?secret=1");
      x.send();
      x.status = 503;
      x.dispatchEvent(new Event("loadend"));
      const snap = cap.snapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0].source).toBe("network");
      expect(snap[0].message).toMatch(/^POST \/api\/save → 503 \(\d+ms\)$/);
      expect(snap[0].message).not.toContain("secret");
    } finally {
      cap.uninstall();
      globalThis.XMLHttpRequest = savedXHR;
    }
  });
});
