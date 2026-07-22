/**
 * Keyboard shortcut parsing and matching.
 *
 * The letter/digit key is matched by `event.code` (physical key, e.g. "KeyF"),
 * NOT `event.key`. On macOS, `Option+F` sets `event.key` to a dead/special
 * character ("ƒ"), so a `Shift+Alt+F` shortcut compared on `event.key` never
 * fires — that was the bug. `event.code` is independent of layout and modifiers.
 */

export interface ParsedShortcut {
  alt: boolean;
  /** KeyboardEvent.code of the main key, e.g. "KeyF" or "Digit5". */
  code: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

const MODIFIER_ALIASES: Record<string, "shift" | "alt" | "ctrl" | "meta"> = {
  shift: "shift",
  alt: "alt",
  option: "alt",
  opt: "alt",
  ctrl: "ctrl",
  control: "ctrl",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  super: "meta",
};

/** Map a single character to its KeyboardEvent.code, or null if unsupported. */
function keyToCode(token: string): string | null {
  if (token.length !== 1) {
    return null;
  }
  if (token >= "a" && token <= "z") {
    return `Key${token.toUpperCase()}`;
  }
  if (token >= "0" && token <= "9") {
    return `Digit${token}`;
  }
  return null;
}

/**
 * Parse a shortcut string like "Shift+Alt+F" (case-insensitive, aliases such as
 * Option/Cmd allowed). Requires zero or more modifiers plus exactly one
 * letter/digit key. Returns null on any malformed input.
 */
export function parseShortcut(input: string): ParsedShortcut | null {
  if (typeof input !== "string" || input.trim() === "") {
    return null;
  }
  const parts = input
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const result: ParsedShortcut = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    code: "",
  };
  let keyCount = 0;
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part];
    if (modifier) {
      result[modifier] = true;
      continue;
    }
    const code = keyToCode(part);
    if (!code) {
      return null; // unknown token
    }
    keyCount += 1;
    result.code = code;
  }
  if (keyCount !== 1) {
    return null; // need exactly one main key
  }
  return result;
}

export const DEFAULT_SHORTCUT = "Shift+F";

/**
 * Resolve a config value into a parsed shortcut (or null = disabled).
 * `false`/`null` disable it; `undefined` uses the fallback; an invalid string
 * warns once and falls back to the default. Kept here so the disable/fallback
 * behavior is unit-testable without mounting the UI.
 */
export function resolveShortcut(
  raw: string | false | null | undefined,
  fallback: string = DEFAULT_SHORTCUT
): ParsedShortcut | null {
  if (raw === false || raw === null) {
    return null;
  }
  const source = raw ?? fallback;
  const parsed = parseShortcut(source);
  if (parsed) {
    return parsed;
  }
  console.warn(
    `[snaglist] invalid shortcut ${JSON.stringify(source)}; falling back to "${DEFAULT_SHORTCUT}"`
  );
  return parseShortcut(DEFAULT_SHORTCUT);
}

/** True when the keyboard event matches the parsed shortcut exactly. */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ParsedShortcut
): boolean {
  return (
    event.code === shortcut.code &&
    event.shiftKey === shortcut.shift &&
    event.altKey === shortcut.alt &&
    event.ctrlKey === shortcut.ctrl &&
    event.metaKey === shortcut.meta
  );
}

const MAC_PLATFORM = /mac|iphone|ipad/i;

/** Human-readable form, e.g. "⇧⌥F" on Mac or "Shift+Alt+F" elsewhere. */
export function formatShortcut(shortcut: ParsedShortcut): string {
  const letter = shortcut.code.replace(/^Key|^Digit/, "");
  const isMac =
    typeof navigator !== "undefined" &&
    MAC_PLATFORM.test(navigator.platform || navigator.userAgent);
  const order: ("ctrl" | "alt" | "shift" | "meta")[] = isMac
    ? ["ctrl", "alt", "shift", "meta"]
    : ["ctrl", "alt", "shift", "meta"];
  const macGlyph = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
  const pcName = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
  const mods = order.filter((m) => shortcut[m]);
  if (isMac) {
    return mods.map((m) => macGlyph[m]).join("") + letter;
  }
  return [...mods.map((m) => pcName[m]), letter].join("+");
}
