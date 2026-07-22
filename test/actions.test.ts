// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActionCapture, renderAction } from "../src/actions";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

function clickOn(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("action trail — click / submit", () => {
  it("records clicks with selector + element text, resolving to the actionable element", () => {
    document.body.innerHTML = `<main><button id="save"><span>Save changes</span></button></main>`;
    const cap = createActionCapture();
    try {
      clickOn(document.querySelector("span")!); // click the inner span
      const snap = cap.snapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0]).toMatchObject({ kind: "click", elementText: "Save changes" });
      expect(snap[0].selector).toContain("save"); // resolved up to the button (#save)
    } finally {
      cap.uninstall();
    }
  });

  it("truncates element text to 40 chars", () => {
    document.body.innerHTML = `<button>${"x".repeat(80)}</button>`;
    const cap = createActionCapture();
    try {
      clickOn(document.querySelector("button")!);
      expect(cap.snapshot()[0].elementText).toHaveLength(41); // 40 + ellipsis
    } finally {
      cap.uninstall();
    }
  });

  it("excludes clicks inside the widget's own UI", () => {
    document.body.innerHTML = `<div data-feedback-widget><button>x</button></div>`;
    const cap = createActionCapture();
    try {
      clickOn(document.querySelector("button")!);
      expect(cap.snapshot()).toHaveLength(0);
    } finally {
      cap.uninstall();
    }
  });

  it("records submit with the form selector", () => {
    document.body.innerHTML = `<form data-testid="animal-form"></form>`;
    const cap = createActionCapture();
    try {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      expect(cap.snapshot()[0]).toMatchObject({ kind: "submit" });
      expect(cap.snapshot()[0].selector).toContain("animal-form");
    } finally {
      cap.uninstall();
    }
  });
});

describe("action trail — typing (PII rule)", () => {
  it("records only a char count after debounce, never the value", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input id="email" type="email" />`;
    const cap = createActionCapture();
    try {
      const input = document.querySelector("input")!;
      input.value = "anna@mail.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(cap.snapshot()).toHaveLength(0); // still debouncing
      vi.advanceTimersByTime(800);
      const snap = cap.snapshot();
      expect(snap[0]).toMatchObject({ kind: "type", chars: 13 });
      // The entered value must not appear ANYWHERE in the record.
      expect(JSON.stringify(snap)).not.toContain("anna@mail.com");
    } finally {
      cap.uninstall();
      vi.useRealTimers();
    }
  });

  it("does not log password fields at all by default", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input type="password" id="pw" />`;
    const cap = createActionCapture();
    try {
      const input = document.querySelector("input")!;
      input.value = "hunter2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(800);
      expect(cap.snapshot()).toHaveLength(0);
    } finally {
      cap.uninstall();
      vi.useRealTimers();
    }
  });

  it("logs the fact (count only) for passwords when capturePasswords is on", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input type="password" id="pw" />`;
    const cap = createActionCapture({ capturePasswords: true });
    try {
      const input = document.querySelector("input")!;
      input.value = "hunter2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(800);
      const snap = cap.snapshot();
      expect(snap[0]).toMatchObject({ kind: "type", chars: 7 });
      expect(JSON.stringify(snap)).not.toContain("hunter2");
    } finally {
      cap.uninstall();
      vi.useRealTimers();
    }
  });
});

describe("action trail — navigation", () => {
  it("records pushState navigations (path without query) without breaking routing", () => {
    history.replaceState(null, "", "/animals");
    const cap = createActionCapture();
    try {
      history.pushState({ page: 1 }, "", "/animals/128?token=secret");
      // routing intact: the real pushState ran (state + location updated)
      expect(history.state).toEqual({ page: 1 });
      expect(window.location.pathname).toBe("/animals/128");
      const nav = cap.snapshot().find((a) => a.kind === "navigate");
      expect(nav).toMatchObject({ from: "/animals", to: "/animals/128" });
      // query string (may hold tokens) must not be recorded
      expect(JSON.stringify(cap.snapshot())).not.toContain("secret");
    } finally {
      cap.uninstall();
    }
  });

  it("restores the original history methods on uninstall", () => {
    const before = history.pushState;
    const cap = createActionCapture();
    expect(history.pushState).not.toBe(before);
    cap.uninstall();
    expect(history.pushState).toBe(before);
  });
});

describe("action trail — buffer + config", () => {
  it("capture:false installs nothing and snapshots empty", () => {
    document.body.innerHTML = `<button>x</button>`;
    const cap = createActionCapture({ capture: false });
    clickOn(document.querySelector("button")!);
    expect(cap.snapshot()).toEqual([]);
  });

  it("keeps only the last N (35 clicks → last 30)", () => {
    document.body.innerHTML = `<button>x</button>`;
    const cap = createActionCapture();
    try {
      for (let i = 0; i < 35; i++) {
        clickOn(document.querySelector("button")!);
      }
      expect(cap.snapshot()).toHaveLength(30);
    } finally {
      cap.uninstall();
    }
  });

  it("subscribe fires per recorded action", () => {
    document.body.innerHTML = `<button>x</button>`;
    const cap = createActionCapture();
    const seen: string[] = [];
    const off = cap.subscribe((r) => seen.push(r.kind));
    try {
      clickOn(document.querySelector("button")!);
      expect(seen).toEqual(["click"]);
      off();
      clickOn(document.querySelector("button")!);
      expect(seen).toEqual(["click"]); // no more after unsubscribe
    } finally {
      cap.uninstall();
    }
  });
});

describe("renderAction", () => {
  it("formats each kind, with the frame suffix when set", () => {
    expect(renderAction({ ts: 0, kind: "navigate", from: "/a", to: "/b" })).toBe(
      "navigate /a → /b"
    );
    expect(
      renderAction({ ts: 0, kind: "click", selector: "button#save", elementText: "Save", frame: 2 })
    ).toBe('click button#save ("Save") — frame 02');
    expect(renderAction({ ts: 0, kind: "submit", selector: "form#f" })).toBe("submit form#f");
    expect(renderAction({ ts: 0, kind: "type", selector: "input#email", chars: 12 })).toBe(
      "type (12 chars) input#email"
    );
  });
});
