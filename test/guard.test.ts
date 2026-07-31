// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionCapture } from "../src/actions";
import { createErrorCapture } from "../src/errors";
import { createGuard } from "../src/guard";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";

/**
 * The contract under test is blunt: a broken widget must never be able to break
 * the page it is embedded in. Host behaviour (console, fetch, XHR, history,
 * clicks) always happens; internal failures are counted; after enough of them
 * the widget uninstalls itself and the page is left exactly as it was.
 */

let debugSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  debugSpy.mockRestore();
  warnSpy.mockRestore();
});

describe("guard basics", () => {
  it("swallows a throw and returns the fallback", () => {
    const guard = createGuard();
    const value = guard.run(
      "test",
      () => {
        throw new Error("boom");
      },
      "fallback"
    );
    expect(value).toBe("fallback");
    expect(guard.failures).toBe(1);
  });

  it("logs failures with console.debug, not console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const guard = createGuard();
    guard.wrap("test", () => {
      throw new Error("boom");
    })();
    expect(debugSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a wrapped listener never rethrows", () => {
    const guard = createGuard();
    const listener = guard.wrap("test", () => {
      throw new Error("boom");
    });
    expect(() => listener()).not.toThrow();
  });

  it("trips at the threshold, runs teardowns once, and warns once", () => {
    const teardown = vi.fn();
    const guard = createGuard({ threshold: 5 });
    guard.onTrip(teardown);
    const failing = guard.wrap("test", () => {
      throw new Error("boom");
    });
    for (let i = 0; i < 4; i++) {
      failing();
    }
    expect(guard.tripped).toBe(false);
    expect(teardown).not.toHaveBeenCalled();

    failing();
    expect(guard.tripped).toBe(true);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[sluglist] sluglist disabled itself after repeated internal errors"
    );

    // Further calls are inert: no more failures, no second warning.
    failing();
    failing();
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("one failing teardown does not stop the others", () => {
    const second = vi.fn();
    const guard = createGuard({ threshold: 1 });
    guard.onTrip(() => {
      throw new Error("teardown blew up");
    });
    guard.onTrip(second);
    guard.fail("test", new Error("boom"));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("calls onTrip teardowns registered after the trip immediately", () => {
    const late = vi.fn();
    const guard = createGuard({ threshold: 1 });
    guard.fail("test", new Error("boom"));
    guard.onTrip(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe("wrappers proxy to the original even when capture is broken", () => {
  it("fetch: the host request is still issued", async () => {
    const originalFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = originalFetch as unknown as typeof fetch;
    const guard = createGuard();
    // A `now` that throws breaks the metadata step of the fetch wrapper.
    const capture = createErrorCapture({
      guard,
      now: () => {
        throw new Error("clock broke");
      },
    });

    const res = await fetch("/api/things");
    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(guard.failures).toBeGreaterThan(0);

    capture.uninstall();
  });

  it("fetch: a rejection from the host still rejects", async () => {
    const boom = new Error("offline");
    globalThis.fetch = vi.fn(async () => {
      throw boom;
    }) as unknown as typeof fetch;
    const guard = createGuard();
    const capture = createErrorCapture({ guard });

    await expect(fetch("/api/things")).rejects.toBe(boom);
    capture.uninstall();
  });

  it("console.error: the host's log still happens", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const guard = createGuard();
    const capture = createErrorCapture({
      guard,
      now: () => {
        throw new Error("clock broke");
      },
    });

    console.error("host message");
    expect(errorSpy).toHaveBeenCalledWith("host message");
    expect(guard.failures).toBe(1);

    capture.uninstall();
    errorSpy.mockRestore();
  });

  it("history.pushState: the host navigation still happens", () => {
    const guard = createGuard();
    const capture = createActionCapture({
      guard,
      now: () => {
        throw new Error("clock broke");
      },
    });

    history.pushState({}, "", "/checkout");
    expect(window.location.pathname).toBe("/checkout");

    capture.uninstall();
  });

  it("a click listener that throws does not stop the host's own handler", () => {
    const guard = createGuard();
    const hostHandler = vi.fn();
    document.addEventListener("click", hostHandler);
    const capture = createActionCapture({
      guard,
      now: () => {
        throw new Error("clock broke");
      },
    });

    const button = document.createElement("button");
    document.body.appendChild(button);
    expect(() => button.click()).not.toThrow();
    expect(hostHandler).toHaveBeenCalledTimes(1);

    capture.uninstall();
    document.removeEventListener("click", hostHandler);
    button.remove();
  });
});

describe("host errors are data, not widget failures", () => {
  it("recording a page error does not touch the failure counter", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const guard = createGuard();
    const capture = createErrorCapture({ guard });

    // Three things a broken HOST page does. All are captured as data.
    console.error("TypeError: cannot read property 'x' of undefined");
    window.dispatchEvent(
      new ErrorEvent("error", { message: "host exploded", error: new Error("host") })
    );
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("host promise"),
      })
    );

    expect(capture.snapshot().length).toBe(3);
    expect(guard.failures).toBe(0);
    expect(guard.tripped).toBe(false);

    capture.uninstall();
    errorSpy.mockRestore();
  });
});

describe("circuit breaker restores the page", () => {
  it("after five internal failures every global is back to the original", () => {
    const originalConsoleError = console.error;
    const originalFetch = globalThis.fetch;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    const guard = createGuard({ threshold: 5 });
    const core = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()] },
      { storage: createMemoryStorage(), guard }
    );

    // Everything really is wrapped to start with.
    expect(console.error).not.toBe(originalConsoleError);
    expect(globalThis.fetch).not.toBe(originalFetch);
    expect(history.pushState).not.toBe(originalPushState);
    expect(XMLHttpRequest.prototype.open).not.toBe(originalXhrOpen);

    for (let i = 0; i < 5; i++) {
      core.guard.fail("injected", new Error(`internal failure ${i + 1}`));
    }
    expect(core.guard.tripped).toBe(true);

    // Reference identity, not just "callable": the exact original is back.
    expect(console.error).toBe(originalConsoleError);
    expect(globalThis.fetch).toBe(originalFetch);
    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);
    expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
    expect(XMLHttpRequest.prototype.send).toBe(originalXhrSend);
  });

  it("the host page keeps working after the widget switched itself off", () => {
    const hostHandler = vi.fn();
    const guard = createGuard({ threshold: 2 });
    const core = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()] },
      { storage: createMemoryStorage(), guard }
    );
    document.addEventListener("click", hostHandler);

    core.guard.fail("injected", new Error("one"));
    core.guard.fail("injected", new Error("two"));
    expect(core.guard.tripped).toBe(true);

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.click();
    expect(hostHandler).toHaveBeenCalledTimes(1);

    history.pushState({}, "", "/after-trip");
    expect(window.location.pathname).toBe("/after-trip");

    document.removeEventListener("click", hostHandler);
    button.remove();
  });

  it("removes the mounted UI from the host DOM", async () => {
    const { mountFeedbackWidget } = await import("../src/ui/mount");
    const guard = createGuard({ threshold: 3 });
    const core = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()], preset: "production" },
      { storage: createMemoryStorage(), guard }
    );
    const mounted = mountFeedbackWidget(core);
    expect(document.querySelector("[data-feedback-widget]")).not.toBeNull();

    for (let i = 0; i < 3; i++) {
      core.guard.fail("injected", new Error("boom"));
    }

    expect(document.querySelector("[data-feedback-widget]")).toBeNull();
    mounted.unmount();
  });

  it("a throwing UI handler closes the panel instead of leaving it stuck", async () => {
    const { mountFeedbackWidget } = await import("../src/ui/mount");
    const guard = createGuard({ threshold: 5 });
    const core = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()] },
      { storage: createMemoryStorage(), guard }
    );
    const mounted = mountFeedbackWidget(core);
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;

    // Open the menu, then break the capture the first menu item runs.
    (shadow.querySelector(".fab") as HTMLElement).click();
    expect((shadow.querySelector(".menu") as HTMLElement).style.display).toBe(
      "flex"
    );

    const menuButton = shadow.querySelector(".menu button") as HTMLElement;
    // captureFullPage has no canvas in jsdom, so this click really does fail
    // inside the widget — no fault injection needed.
    expect(() => menuButton.click()).not.toThrow();
    // Whatever happened, the host page is not left under a stuck overlay.
    expect((shadow.querySelector(".menu") as HTMLElement).style.display).toBe(
      "none"
    );
    expect(guard.tripped).toBe(false);

    mounted.unmount();
  });

  it("leaves a foreign wrapper alone instead of clobbering it", () => {
    const guard = createGuard({ threshold: 1 });
    const capture = createErrorCapture({ guard });
    // Another library wraps console.error AFTER us — the common real-world case.
    const foreign = console.error;
    const theirs = (...args: unknown[]) => (foreign as typeof console.error)(...args);
    console.error = theirs;

    capture.uninstall();

    // Their wrapper survives; ours is left in the chain but inert.
    expect(console.error).toBe(theirs);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("console.error was wrapped by something else")
    );
    console.error("after uninstall");
    expect(capture.snapshot()).toHaveLength(0);
  });
});
