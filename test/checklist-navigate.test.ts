// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOOP_ACTION_CAPTURE } from "../src/actions";
import type { Checklist } from "../src/checklist";
import { MemoryConnector } from "../src/connectors/memory";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import { createMemoryStorage } from "../src/session";
import {
  mountFeedbackWidget,
  type MountedFeedbackWidget,
} from "../src/ui/mount";
import { createFeedbackWidget } from "../src/widget";

/**
 * The "Open" chip on a checklist item. By default it is a new tab, which is
 * right for an app that reloads on every navigation and wrong for a
 * single-page app, where it costs the tester their place in the list. A host
 * that routes itself passes `onNavigate` and keeps them on the page.
 */

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/",
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

const checklist: Checklist = {
  id: "nav",
  title: "Navigation",
  sections: [
    {
      title: "Reports",
      items: [
        { id: "reports-open", title: "Reports page opens", url: "/reports" },
      ],
    },
  ],
};

describe("checklist Open chip", () => {
  let ui: MountedFeedbackWidget | null = null;

  afterEach(() => {
    ui?.unmount();
    ui = null;
    document.body.innerHTML = "";
  });

  async function mountAndOpen(
    onNavigate?: (url: string, item: { id: string }) => boolean | void
  ): Promise<{ link: HTMLAnchorElement; shadow: ShadowRoot }> {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
        checklist,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(
      widget,
      onNavigate ? { hotkey: null, onNavigate } : { hotkey: null }
    );
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    // The checklist panel attaches after the definition resolves.
    await vi.waitFor(() => {
      const fab = shadow.querySelector(".checklist-fab") as HTMLButtonElement | null;
      expect(fab).not.toBeNull();
    });
    (shadow.querySelector(".checklist-fab") as HTMLButtonElement).click();
    const link = await vi.waitFor(() => {
      const found = shadow.querySelector(
        ".cl-item-link"
      ) as HTMLAnchorElement | null;
      expect(found).not.toBeNull();
      return found as HTMLAnchorElement;
    });
    return { link, shadow };
  }

  function clickLink(
    link: HTMLAnchorElement,
    init: MouseEventInit = {}
  ): MouseEvent {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    link.dispatchEvent(event);
    return event;
  }

  it("opens a new tab when the host does not route", async () => {
    const { link } = await mountAndOpen();
    expect(link.target).toBe("_blank");
    expect(link.getAttribute("href")).toBe("/reports");

    const event = clickLink(link);
    expect(event.defaultPrevented).toBe(false);
  });

  it("hands the url to the host and stays on the page", async () => {
    const onNavigate = vi.fn();
    const { link } = await mountAndOpen(onNavigate);
    expect(link.target).toBe("_self");

    const event = clickLink(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][0]).toBe("/reports");
    expect(onNavigate.mock.calls[0][1]).toMatchObject({ id: "reports-open" });
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a modified click to the browser", async () => {
    const onNavigate = vi.fn();
    const { link } = await mountAndOpen(onNavigate);

    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      const event = clickLink(link, { [modifier]: true });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("returning false opts that url back into the default", async () => {
    const onNavigate = vi.fn(() => false);
    const { link } = await mountAndOpen(onNavigate);

    const event = clickLink(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("a throwing host handler still lets the chip navigate", async () => {
    const onNavigate = vi.fn(() => {
      throw new Error("router blew up");
    });
    const { link } = await mountAndOpen(onNavigate);

    const event = clickLink(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("clicking the chip does not tick the item off", async () => {
    const onNavigate = vi.fn();
    const { link, shadow } = await mountAndOpen(onNavigate);

    clickLink(link);
    const row = shadow.querySelector(".cl-item") as HTMLElement;
    expect(row.classList.contains("checked")).toBe(false);
  });
});
