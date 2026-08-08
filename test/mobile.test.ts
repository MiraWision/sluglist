// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOOP_ACTION_CAPTURE } from "../src/actions";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget, type MountedFeedbackWidget } from "../src/ui/mount";
import { DEFAULT_STRINGS } from "../src/ui/strings";

/**
 * Phase 2 — mobile graceful mode.
 *
 * Not a mobile UI: a deliberate subtraction. On a coarse pointer the two modes
 * that depend on hover and on a drag the browser spends scrolling are removed,
 * record mode with them, and the keyboard affordances stop being advertised to
 * a device with no keyboard. What remains — full page and comment-only —
 * carries the whole report.
 */

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/checkout",
  viewport: "390x844",
  screen: "390x844",
  devicePixelRatio: 3,
  browser: "Safari 18",
  os: "iOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

/** Emulate an iPhone: 390px wide, coarse pointer, no hover. */
function setPointer(coarse: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: coarse
        ? query.includes("pointer: coarse") || query.includes("hover: none")
        : query.includes("pointer: fine") || query.includes("hover: hover"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

describe("capture menu on a coarse pointer", () => {
  let ui: MountedFeedbackWidget | null = null;

  afterEach(() => {
    ui?.unmount();
    ui = null;
    document.body.innerHTML = "";
  });

  function mountAndOpen(): ShadowRoot {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget);
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    (shadow.querySelector(".fab") as HTMLButtonElement).click();
    return shadow;
  }

  function menuLabels(shadow: ShadowRoot): string[] {
    return [...shadow.querySelectorAll(".menu button span")].map(
      (s) => s.textContent ?? ""
    );
  }

  it("offers exactly full page and comment-only on touch", () => {
    setPointer(true);
    expect(menuLabels(mountAndOpen())).toEqual([
      DEFAULT_STRINGS.menuFullpage,
      DEFAULT_STRINGS.menuNoScreenshot,
    ]);
  });

  it("keeps every mode on a fine pointer", () => {
    setPointer(false);
    expect(menuLabels(mountAndOpen())).toEqual([
      DEFAULT_STRINGS.menuFullpage,
      DEFAULT_STRINGS.menuArea,
      DEFAULT_STRINGS.menuElement,
      DEFAULT_STRINGS.menuRecord,
      DEFAULT_STRINGS.menuNoScreenshot,
    ]);
  });

  it("shows no keyboard hints on touch", () => {
    setPointer(true);
    const shadow = mountAndOpen();
    expect(shadow.querySelectorAll(".menu kbd")).toHaveLength(0);
    expect(shadow.querySelector(".fab-hotkey")).toBeNull();
    // …and the panel's "+ Add screenshot" chip is bare too.
    const items = [...shadow.querySelectorAll(".menu button")];
    (items.at(-1) as HTMLButtonElement).click();
    expect(shadow.querySelector(".kbd-hint")).toBeNull();
  });

  it("shows them on a fine pointer", () => {
    setPointer(false);
    const shadow = mountAndOpen();
    expect(shadow.querySelectorAll(".menu kbd").length).toBeGreaterThan(0);
    expect(shadow.querySelector(".fab-hotkey")).not.toBeNull();
  });

  it("comment-only still runs the whole flow on touch", async () => {
    setPointer(true);
    const memory = new MemoryConnector();
    const widget = createFeedbackWidget(
      { project: "acme", connectors: [memory], offlineQueue: false },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget);
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    (shadow.querySelector(".fab") as HTMLButtonElement).click();
    const items = [...shadow.querySelectorAll(".menu button")];
    (items.at(-1) as HTMLButtonElement).click();
    const comment = shadow.querySelector("textarea") as HTMLTextAreaElement;
    comment.value = "Header overlaps on my phone";
    (shadow.querySelector(".send") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(widget.getIssueCount()).toBe(1);
  });

  it("the per-item checklist button is visible without hover (v2 regression)", () => {
    setPointer(true);
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
        checklist: {
          id: "release-1",
          title: "Release check",
          sections: [
            { title: "Checkout", items: [{ id: "pay", title: "Payment works" }] },
          ],
        },
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget);
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    return widget.whenChecklistReady().then(() => {
      (shadow.querySelector(".checklist-fab") as HTMLButtonElement).click();
      const button = shadow.querySelector(".cl-issue-btn") as HTMLElement;
      expect(button.classList).toContain("touch");
    });
  });
});

describe("mobile stylesheet", () => {
  beforeEach(() => setPointer(true));

  it("moves the launcher, not the inner button, and clears the safe area", async () => {
    const { widgetStyles } = await import("../src/ui/styles");
    const css = widgetStyles({ accentColor: "#18181b", position: "bottom-right" });
    expect(css).toContain("env(safe-area-inset-bottom");
    // The old rule targeted .fab, which is not the fixed element.
    expect(css).toMatch(/\.fab-wrap \{\s*bottom: calc\(16px/);
  });

  it("gives touch targets a 44px floor", async () => {
    const { widgetStyles } = await import("../src/ui/styles");
    const css = widgetStyles({ accentColor: "#18181b", position: "bottom-right" });
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("min-height: 44px");
    // iOS zoom-on-focus guard.
    expect(css).toContain("font-size: 16px");
  });
});
