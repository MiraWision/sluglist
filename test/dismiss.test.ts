// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDismissed,
  dismissKey,
  isDismissed,
  readDismiss,
  setDismissed,
} from "../src/dismiss";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { FeedbackWidgetConfig } from "../src/types";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget, type MountedFeedbackWidget } from "../src/ui/mount";

const PROJECT = "acme";
const DAY_MS = 86_400_000;

const testEnvironment = () => ({
  baseUrl: "https://app.acme.example",
  url: "/pricing",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 138",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

describe("dismiss storage", () => {
  beforeEach(() => localStorage.clear());

  it("is not dismissed with nothing stored", () => {
    expect(isDismissed(PROJECT, 7)).toBe(false);
    expect(readDismiss(PROJECT)).toBeNull();
  });

  it("records an ISO dismissed_at under a project-scoped key", () => {
    setDismissed(PROJECT, new Date("2026-07-31T09:00:00.000Z"));
    expect(localStorage.getItem(dismissKey(PROJECT))).toBe(
      '{"dismissed_at":"2026-07-31T09:00:00.000Z"}'
    );
    expect(readDismiss(PROJECT)).toEqual({
      dismissed_at: "2026-07-31T09:00:00.000Z",
    });
  });

  it("stays dismissed inside the window and returns after it", () => {
    const at = new Date("2026-07-01T00:00:00.000Z");
    setDismissed(PROJECT, at);
    const sixDaysLater = at.getTime() + 6 * DAY_MS;
    const eightDaysLater = at.getTime() + 8 * DAY_MS;
    expect(isDismissed(PROJECT, 7, sixDaysLater)).toBe(true);
    expect(isDismissed(PROJECT, 7, eightDaysLater)).toBe(false);
  });

  it("days: 0 never expires", () => {
    const at = new Date("2020-01-01T00:00:00.000Z");
    setDismissed(PROJECT, at);
    expect(isDismissed(PROJECT, 0, at.getTime() + 3650 * DAY_MS)).toBe(true);
  });

  it("clearDismissed brings it back immediately", () => {
    setDismissed(PROJECT);
    expect(isDismissed(PROJECT, 7)).toBe(true);
    clearDismissed(PROJECT);
    expect(isDismissed(PROJECT, 7)).toBe(false);
  });

  it("is scoped per project", () => {
    setDismissed("acme");
    expect(isDismissed("other", 7)).toBe(false);
  });

  it("fails open on a corrupt entry", () => {
    localStorage.setItem(dismissKey(PROJECT), "not json{");
    expect(isDismissed(PROJECT, 7)).toBe(false);
    localStorage.setItem(dismissKey(PROJECT), '{"dismissed_at":42}');
    expect(isDismissed(PROJECT, 7)).toBe(false);
    localStorage.setItem(dismissKey(PROJECT), '{"dismissed_at":"never"}');
    expect(isDismissed(PROJECT, 7)).toBe(false);
  });
});

describe("dismiss in the mounted widget", () => {
  let mounted: MountedFeedbackWidget | null = null;

  function mount(config: Partial<FeedbackWidgetConfig> = {}) {
    const core = createFeedbackWidget(
      { project: PROJECT, connectors: [new MemoryConnector()], ...config },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );
    mounted = mountFeedbackWidget(core);
    return mounted;
  }

  function shadow(): ShadowRoot {
    const host = document.querySelector("[data-feedback-widget]");
    return (host as HTMLElement).shadowRoot as ShadowRoot;
  }

  function hostEl(): HTMLElement {
    return document.querySelector("[data-feedback-widget]") as HTMLElement;
  }

  function pressShortcut(): void {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F",
        code: "KeyF",
        shiftKey: true,
        bubbles: true,
      })
    );
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it("production preset renders an enabled ✕", () => {
    mount({ preset: "production" });
    const x = shadow().querySelector(".fab-dismiss") as HTMLElement;
    expect(x).not.toBeNull();
    expect(x.classList.contains("enabled")).toBe(true);
    expect(x.getAttribute("aria-label")).toBe("Hide feedback button");
  });

  it("dev preset renders no visible ✕", () => {
    mount();
    const x = shadow().querySelector(".fab-dismiss") as HTMLElement;
    expect(x.classList.contains("enabled")).toBe(false);
  });

  it("beta preset renders no visible ✕", () => {
    mount({ preset: "beta" });
    const x = shadow().querySelector(".fab-dismiss") as HTMLElement;
    expect(x.classList.contains("enabled")).toBe(false);
  });

  it("clicking ✕ hides the widget and persists the dismissal", () => {
    const m = mount({ preset: "production" });
    (shadow().querySelector(".fab-dismiss") as HTMLElement).click();
    expect(hostEl().style.display).toBe("none");
    expect(m.isDismissed()).toBe(true);
    expect(readDismiss(PROJECT)).not.toBeNull();
  });

  it("the shortcut does nothing while dismissed", () => {
    mount({ preset: "production" });
    (shadow().querySelector(".fab-dismiss") as HTMLElement).click();
    pressShortcut();
    const menu = shadow().querySelector(".menu") as HTMLElement;
    expect(menu.style.display).not.toBe("flex");
    expect(hostEl().style.display).toBe("none");
  });

  it("the shortcut still opens the menu when not dismissed", () => {
    mount({ preset: "production" });
    pressShortcut();
    expect((shadow().querySelector(".menu") as HTMLElement).style.display).toBe(
      "flex"
    );
  });

  it("a reload keeps it hidden", () => {
    const first = mount({ preset: "production" });
    (shadow().querySelector(".fab-dismiss") as HTMLElement).click();
    first.unmount();
    document.body.innerHTML = "";

    const second = mount({ preset: "production" });
    expect(second.isDismissed()).toBe(true);
    expect(hostEl().style.display).toBe("none");
  });

  it("a dismissal older than dismissDays brings the widget back", () => {
    const first = mount({ preset: "production" });
    (shadow().querySelector(".fab-dismiss") as HTMLElement).click();
    first.unmount();
    document.body.innerHTML = "";

    // Backdate the stored dismissal by 8 days (default window is 7).
    setDismissed(PROJECT, new Date(Date.now() - 8 * DAY_MS));

    const second = mount({ preset: "production" });
    expect(second.isDismissed()).toBe(false);
    expect(hostEl().style.display).not.toBe("none");
  });

  it("a dismissal inside dismissDays stays hidden", () => {
    setDismissed(PROJECT, new Date(Date.now() - 3 * DAY_MS));
    const m = mount({ preset: "production" });
    expect(m.isDismissed()).toBe(true);
  });

  it("dismiss.days: 0 keeps it hidden indefinitely", () => {
    setDismissed(PROJECT, new Date(Date.now() - 3650 * DAY_MS));
    const m = mount({ preset: "production", dismiss: { days: 0 } });
    expect(m.isDismissed()).toBe(true);
  });

  it("show() brings it back immediately and clears storage", () => {
    const m = mount({ preset: "production" });
    (shadow().querySelector(".fab-dismiss") as HTMLElement).click();
    expect(m.isDismissed()).toBe(true);

    m.show();
    expect(m.isDismissed()).toBe(false);
    expect(hostEl().style.display).not.toBe("none");
    expect(readDismiss(PROJECT)).toBeNull();
    // And the shortcut works again.
    pressShortcut();
    expect((shadow().querySelector(".menu") as HTMLElement).style.display).toBe(
      "flex"
    );
  });

  it("dismiss() works programmatically even when the ✕ is disabled", () => {
    const m = mount();
    expect(
      (shadow().querySelector(".fab-dismiss") as HTMLElement).classList.contains(
        "enabled"
      )
    ).toBe(false);
    m.dismiss();
    expect(m.isDismissed()).toBe(true);
    expect(hostEl().style.display).toBe("none");
  });

  it("a stored dismissal is ignored while dismiss is disabled (dev)", () => {
    setDismissed(PROJECT);
    const m = mount();
    expect(m.isDismissed()).toBe(false);
    expect(hostEl().style.display).not.toBe("none");
  });
});
