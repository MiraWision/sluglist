import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatShortcut,
  matchesShortcut,
  parseShortcut,
  resolveShortcut,
} from "../src/shortcut";

afterEach(() => vi.restoreAllMocks());

describe("parseShortcut", () => {
  it("parses modifiers + a letter by code", () => {
    expect(parseShortcut("Shift+Alt+F")).toEqual({
      shift: true,
      alt: true,
      ctrl: false,
      meta: false,
      code: "KeyF",
    });
  });

  it("is case-insensitive and accepts aliases (Option, Cmd, Control)", () => {
    expect(parseShortcut("option+shift+f")?.code).toBe("KeyF");
    expect(parseShortcut("Cmd+K")).toMatchObject({ meta: true, code: "KeyK" });
    expect(parseShortcut("Control+Alt+9")).toMatchObject({
      ctrl: true,
      alt: true,
      code: "Digit9",
    });
  });

  it("accepts a bare key (no modifiers)", () => {
    expect(parseShortcut("k")).toMatchObject({
      code: "KeyK",
      shift: false,
      alt: false,
    });
  });

  it("rejects malformed input with null", () => {
    for (const bad of [
      "",
      "   ",
      "Shift+Alt", // no key
      "Shift+FF", // multi-char token
      "F+G", // two keys
      "Foo+F", // unknown modifier
      "Shift++F", // empty token tolerated but still one key -> actually valid
    ]) {
      if (bad === "Shift++F") {
        expect(parseShortcut(bad)).not.toBeNull(); // empty parts filtered
      } else {
        expect(parseShortcut(bad)).toBeNull();
      }
    }
  });
});

describe("matchesShortcut", () => {
  const ev = (o: Partial<KeyboardEvent>) => o as KeyboardEvent;
  const sc = parseShortcut("Shift+Alt+F")!;

  it("matches on code + exact modifiers (independent of e.key)", () => {
    // macOS Option+F: e.key is the special char, but e.code is stable.
    expect(
      matchesShortcut(
        ev({ code: "KeyF", key: "ƒ", shiftKey: true, altKey: true, ctrlKey: false, metaKey: false }),
        sc
      )
    ).toBe(true);
  });

  it("does not match when an extra modifier is held", () => {
    expect(
      matchesShortcut(
        ev({ code: "KeyF", shiftKey: true, altKey: true, ctrlKey: true, metaKey: false }),
        sc
      )
    ).toBe(false);
  });

  it("does not match a different physical key", () => {
    expect(
      matchesShortcut(ev({ code: "KeyG", shiftKey: true, altKey: true }), sc)
    ).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("false / null disable the shortcut", () => {
    expect(resolveShortcut(false)).toBeNull();
    expect(resolveShortcut(null)).toBeNull();
  });

  it("undefined uses the default", () => {
    expect(resolveShortcut(undefined)?.code).toBe("KeyF");
  });

  it("invalid string warns and falls back to the default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = resolveShortcut("Nonsense++");
    expect(r?.code).toBe("KeyF");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("valid string is parsed", () => {
    expect(resolveShortcut("Ctrl+Shift+K")).toMatchObject({
      ctrl: true,
      shift: true,
      code: "KeyK",
    });
  });
});

describe("formatShortcut", () => {
  it("renders a readable form ending in the key with both modifiers", () => {
    // Mac (⌥⇧F) vs PC (Alt+Shift+F) depends on the platform; assert both parts.
    const s = formatShortcut(parseShortcut("Shift+Alt+F")!);
    expect(s.endsWith("F")).toBe(true);
    expect(/⇧|Shift/.test(s)).toBe(true);
    expect(/⌥|Alt/.test(s)).toBe(true);
  });
});
