/**
 * Descriptive selector generator for element-mode feedback. Unlike a selector
 * meant to survive a reload and re-anchor a pin, this one only has to let a
 * human (or an agent reading the artifact) identify which element was reported
 * and roughly where it lives in the code. Strategies are tried in order; the
 * first that produces a selector wins.
 */

export type SelectorStrategy = "testid" | "id" | "aria" | "path";

export interface SelectorResult {
  selector: string;
  strategy: SelectorStrategy;
  /** Whether the selector resolves to exactly one element right now. */
  unique: boolean;
}

const TESTID_ATTRS = ["data-testid", "data-test", "data-cy"];
const LANDMARK_TAGS = new Set([
  "HEADER",
  "NAV",
  "MAIN",
  "ASIDE",
  "FOOTER",
  "FORM",
  "SECTION",
  "ARTICLE",
  "DIALOG",
]);

/**
 * Tailwind-style utility classes. A class matching any of these is never used
 * to build a selector (it identifies styling, not the element).
 */
const UTILITY_PREFIX =
  /^-?(flex|grid|table|contents|block|inline|inline-block|hidden|absolute|relative|fixed|sticky|static|float|clear|isolate|object-|overflow-|overscroll-|container|columns|box-|order-|col-|row-|auto-|gap-|justify-|content-|items-|self-|place-|p[xytblrse]?-|m[xytblrse]?-|space-|w-|min-w-|max-w-|h-|min-h-|max-h-|text-|font-|leading-|tracking-|antialiased|italic|not-italic|normal-|uppercase|lowercase|capitalize|underline|line-through|decoration-|indent-|align-|whitespace-|break-|list-|bg-|from-|via-|to-|gradient-|rounded|border|divide-|outline-|ring-|shadow|opacity-|mix-blend-|filter|blur|brightness-|contrast-|drop-shadow|grayscale|invert|saturate-|sepia|backdrop-|transition|duration-|ease-|delay-|animate-|transform|scale-|rotate-|translate-|skew-|origin-|accent-|appearance-|cursor-|caret-|pointer-events-|resize|scroll-|snap-|touch-|select-|will-change-|top-|right-|bottom-|left-|inset-|z-|basis-|grow|shrink|aspect-|placeholder-|fill-|stroke-)/;
// Responsive / state variant prefixes such as "md:" or "hover:".
const UTILITY_VARIANT =
  /^(sm|md|lg|xl|2xl|hover|focus|active|group|peer|dark|first|last|odd|even|disabled|visited|checked|motion-safe|motion-reduce|print|rtl|ltr):/;

const HEX_RUN = /^[0-9a-f]{6,}$/i;
const HAS_LETTER = /[a-z]/i;
const HAS_DIGIT = /[0-9]/;
const VOWEL = /[aeiou]/i;
const STYLED_COMPONENT = /^(sc|css)-[a-z0-9]/i;
const SEGMENT_SPLIT = /[_-]+/;

function isRandomSegment(segment: string): boolean {
  if (segment.length < 5) {
    return false;
  }
  if (HEX_RUN.test(segment)) {
    return true;
  }
  // Mixed letters and digits with no word structure, e.g. CSS Modules "x8f2k".
  if (HAS_LETTER.test(segment) && HAS_DIGIT.test(segment)) {
    return true;
  }
  const letters = segment.replace(/[^a-z]/gi, "");
  return letters.length >= 6 && !VOWEL.test(letters);
}

/** Utility (Tailwind-like) class that should never appear in a selector. */
export function isUtilityClass(cls: string): boolean {
  return UTILITY_PREFIX.test(cls) || UTILITY_VARIANT.test(cls);
}

/**
 * Hash-like class from CSS Modules (`_btn_x8f2k`) or styled-components
 * (`sc-bdVaJa`): a machine-generated name that identifies nothing.
 */
export function isHashLike(cls: string): boolean {
  if (STYLED_COMPONENT.test(cls)) {
    return true;
  }
  return cls.split(SEGMENT_SPLIT).filter(Boolean).some(isRandomSegment);
}

const NUMERIC = /^\d+$/;
const HEX_ID = /^[0-9a-f]{8,}$/i;
const HAS_COLON = /[:.]/;

/** Auto-generated id (framework-assigned), unsuitable for identification. */
function isAutoId(id: string): boolean {
  if (NUMERIC.test(id) || HEX_ID.test(id) || HAS_COLON.test(id)) {
    return true;
  }
  const letters = id.replace(/[^a-z]/gi, "");
  if (id.length > 8 && letters.length > 0 && !VOWEL.test(letters)) {
    return true;
  }
  return (
    id.length > 8 &&
    HAS_LETTER.test(id) &&
    HAS_DIGIT.test(id) &&
    !id.includes("-") &&
    !id.includes("_")
  );
}

function isLandmark(node: Element | null): boolean {
  return Boolean(
    node && (LANDMARK_TAGS.has(node.tagName) || hasTestId(node))
  );
}

function hasTestId(node: Element): boolean {
  return TESTID_ATTRS.some((attr) => node.hasAttribute(attr));
}

function escapeAttrValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function escapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([^\w-])/g, "\\$1");
}

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** A path segment: `tag` or `tag:nth-child(n)` when the tag is ambiguous. */
function pathSegment(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const parent = node.parentElement;
  if (!parent) {
    return tag;
  }
  const sameTag = [...parent.children].filter(
    (c) => c.tagName === node.tagName
  );
  if (sameTag.length <= 1) {
    return tag;
  }
  const index = [...parent.children].indexOf(node) + 1;
  return `${tag}:nth-child(${index})`;
}

/** Semantic path from the nearest landmark (or testid) ancestor to the element. */
function landmarkPath(element: Element): string {
  const segments: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.documentElement) {
    segments.unshift(pathSegment(node));
    if (node !== element && isLandmark(node)) {
      return segments.join(" > ");
    }
    if (node === document.body) {
      return segments.join(" > ");
    }
    node = node.parentElement;
  }
  return segments.join(" > ");
}

export function generateSelector(element: Element): SelectorResult {
  for (const attr of TESTID_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `[${attr}="${escapeAttrValue(value)}"]`;
      return { selector, strategy: "testid", unique: isUnique(selector) };
    }
  }

  const id = element.getAttribute("id");
  if (id && !isAutoId(id)) {
    const selector = `#${escapeIdent(id)}`;
    return { selector, strategy: "id", unique: isUnique(selector) };
  }

  const tag = element.tagName.toLowerCase();
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    const selector = `${tag}[aria-label="${escapeAttrValue(ariaLabel)}"]`;
    return { selector, strategy: "aria", unique: isUnique(selector) };
  }
  const role = element.getAttribute("role");
  if (role) {
    const selector = `${tag}[role="${escapeAttrValue(role)}"]`;
    return { selector, strategy: "aria", unique: isUnique(selector) };
  }

  const selector = landmarkPath(element);
  return { selector, strategy: "path", unique: isUnique(selector) };
}

export interface ElementMetadata {
  selector: string;
  selectorStrategy: SelectorStrategy;
  selectorUnique: boolean;
  /** innerText, trimmed to 80 chars, or null when empty. */
  elementText: string | null;
  /** Full tag path with no classes, e.g. "body > div > main > form > button". */
  domPath: string;
  /** Nearest data-screen | data-page ancestor value, or null. */
  screen: string | null;
  /** Nearest named React component, or null (no React / anonymous / minified). */
  component: string | null;
}

const MAX_TEXT = 80;

// Wrapper / internal names that are never a useful localization hint.
const GENERIC_COMPONENTS = new Set([
  "Unknown",
  "Anonymous",
  "ForwardRef",
  "Memo",
  "Fragment",
  "Suspense",
  "Profiler",
  "StrictMode",
]);

/** Best-effort readable name for a fiber `type` (function/class/memo/forwardRef). */
function displayNameOf(type: unknown, depth = 0): string | null {
  if (!type || depth > 4) {
    return null;
  }
  if (typeof type === "function") {
    return (type as { displayName?: string }).displayName || type.name || null;
  }
  if (typeof type === "object") {
    const t = type as {
      displayName?: string;
      render?: unknown;
      type?: unknown;
    };
    // memo(Comp) → .type; forwardRef(render) → .render
    return (
      t.displayName ||
      displayNameOf(t.render, depth + 1) ||
      displayNameOf(t.type, depth + 1)
    );
  }
  return null;
}

/**
 * Best-effort nearest named React component for an element, read from the React
 * fiber attached to the DOM node (`__reactFiber$*` / `__reactInternalInstance$*`).
 * No React dependency; returns null when React is absent, the component is
 * anonymous, or names are minified away in production. Fully guarded — never
 * throws and never touches anything but these well-known keys.
 */
export function componentName(element: Element): string | null {
  try {
    const key = Object.keys(element).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$")
    );
    if (!key) {
      return null;
    }
    let fiber = (element as unknown as Record<string, { type?: unknown; elementType?: unknown; return?: unknown } | null>)[key];
    let hops = 0;
    while (fiber && hops < 80) {
      // Host components (div, span, …) have a string `type` → skip them.
      const type = fiber.type ?? fiber.elementType;
      if (type && typeof type !== "string") {
        const name = displayNameOf(type);
        // PascalCase heuristic: filters minified single letters and wrappers.
        if (name && name.length >= 2 && /^[A-Z]/.test(name) && !GENERIC_COMPONENTS.has(name)) {
          return name;
        }
      }
      fiber = (fiber.return ?? null) as typeof fiber;
      hops++;
    }
    return null;
  } catch {
    return null;
  }
}

/** Full tag path (no classes) from body down to the element. */
export function domPath(element: Element): string {
  const tags: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.documentElement) {
    tags.unshift(node.tagName.toLowerCase());
    node = node.parentElement;
  }
  return tags.join(" > ");
}

/** Nearest data-screen / data-page ancestor value, or null. */
export function screenOf(element: Element): string | null {
  let node: Element | null = element;
  while (node) {
    const value =
      node.getAttribute("data-screen") ?? node.getAttribute("data-page");
    if (value) {
      return value;
    }
    node = node.parentElement;
  }
  return null;
}

/** Collect all element-mode metadata synchronously (no extra reflow/requests). */
export function collectElementMetadata(element: Element): ElementMetadata {
  const { selector, strategy, unique } = generateSelector(element);
  const rawText = (element as HTMLElement).innerText ?? element.textContent ?? "";
  const text = rawText.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT);
  return {
    selector,
    selectorStrategy: strategy,
    selectorUnique: unique,
    elementText: text.length > 0 ? text : null,
    domPath: domPath(element),
    screen: screenOf(element),
    component: componentName(element),
  };
}
