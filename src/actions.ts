import { generateSelector } from "./selector";

/**
 * Action trail: a background ring buffer of the user's recent actions (clicks,
 * SPA navigations, submits, typing) attached to each issue as `## Actions` — a
 * lightweight "what they did before reporting", the architectural twin of the
 * error capture in errors.ts (same buffer + relative-time shape).
 *
 * Hard PII rule (independent of any privacy setting): the trail records the
 * FACT and PLACE of an action, never the entered content. `type` logs only a
 * character COUNT and the field selector — never the value. Password fields are
 * not logged at all by default (not even the fact).
 */

export type ActionKind = "click" | "navigate" | "submit" | "type";

export interface ActionRecord {
  ts: number;
  kind: ActionKind;
  /** click / submit / type: the target selector. */
  selector?: string;
  /** click: trimmed visible text of the element (≤ 40 chars). */
  elementText?: string;
  /** navigate: path (no query) before / after. */
  from?: string;
  to?: string;
  /** type: number of characters in the field — never the value. */
  chars?: number;
  /** record mode: the frame number captured for this action (set externally). */
  frame?: number;
}

export interface ActionCapture {
  snapshot(): ActionRecord[];
  /**
   * Subscribe to each newly recorded action (record mode snaps a frame and tags
   * the live record via `record.frame`). Returns an unsubscribe function.
   */
  subscribe(listener: (record: ActionRecord) => void): () => void;
  uninstall(): void;
}

export interface ActionCaptureOptions {
  /** Capture actions at all. Default true. */
  capture?: boolean;
  /** Ring buffer size. Default 30. */
  bufferSize?: number;
  /** Also log the FACT of typing into password fields (never the value). Default false. */
  capturePasswords?: boolean;
  /** Test seam. */
  now?: () => number;
}

const DEFAULT_SIZE = 30;
const TYPE_DEBOUNCE_MS = 800;
const ELEMENT_TEXT_MAX = 40;
const WIDGET_ATTR = "[data-feedback-widget]";
const ACTIONABLE =
  'button, a, [role="button"], input, select, textarea, label, summary';

export const NOOP_ACTION_CAPTURE: ActionCapture = {
  snapshot: () => [],
  subscribe: () => () => undefined,
  uninstall: () => undefined,
};

/** Current route as a path without the query string (query may hold tokens/PII). */
function currentPath(): string {
  return `${window.location.pathname}${window.location.hash}`;
}

function isInsideWidget(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(WIDGET_ATTR) !== null;
}

function elementText(element: Element): string | undefined {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  return text.length > ELEMENT_TEXT_MAX
    ? `${text.slice(0, ELEMENT_TEXT_MAX)}…`
    : text;
}

function isTextField(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement
  );
}

/**
 * Install the trail. Listens on the document (capture phase, passive) for
 * click/submit/input, wraps history.pushState/replaceState and listens for
 * popstate/hashchange. Returns a no-op capture when disabled.
 */
export function createActionCapture(
  options: ActionCaptureOptions = {}
): ActionCapture {
  if (options.capture === false || typeof document === "undefined") {
    return NOOP_ACTION_CAPTURE;
  }
  const size = Math.max(1, options.bufferSize ?? DEFAULT_SIZE);
  const now = options.now ?? (() => Date.now());
  const buffer: ActionRecord[] = [];
  const typeTimers = new Map<Element, ReturnType<typeof setTimeout>>();
  const listeners = new Set<(record: ActionRecord) => void>();

  function push(record: ActionRecord): void {
    buffer.push(record);
    while (buffer.length > size) {
      buffer.shift();
    }
    for (const listener of listeners) {
      listener(record);
    }
  }

  // --- click ---
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (isInsideWidget(target) || !(target instanceof Element)) {
      return;
    }
    const actionable = target.closest(ACTIONABLE) ?? target;
    push({
      ts: now(),
      kind: "click",
      selector: generateSelector(actionable).selector,
      elementText: elementText(actionable),
    });
  };

  // --- submit ---
  const onSubmit = (event: Event): void => {
    const target = event.target;
    if (isInsideWidget(target) || !(target instanceof Element)) {
      return;
    }
    push({ ts: now(), kind: "submit", selector: generateSelector(target).selector });
  };

  // --- type (debounced per field; count only, never the value) ---
  const onInput = (event: Event): void => {
    const target = event.target;
    if (isInsideWidget(target) || !(target instanceof Element)) {
      return;
    }
    if (!isTextField(target)) {
      return;
    }
    // Password fields: not logged at all by default (not even the fact).
    if (
      target instanceof HTMLInputElement &&
      target.type === "password" &&
      options.capturePasswords !== true
    ) {
      return;
    }
    const existing = typeTimers.get(target);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      typeTimers.delete(target);
      push({
        ts: now(),
        kind: "type",
        selector: generateSelector(target).selector,
        chars: target.value.length, // COUNT only — never the value
      });
    }, TYPE_DEBOUNCE_MS);
    typeTimers.set(target, timer);
  };

  // --- navigation (wrap pushState/replaceState + popstate/hashchange) ---
  let lastPath = currentPath();
  const recordNavigation = (from: string): void => {
    const to = currentPath();
    lastPath = to;
    if (from !== to) {
      push({ ts: now(), kind: "navigate", from, to });
    }
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function patchedPushState(
    this: History,
    ...args: Parameters<History["pushState"]>
  ) {
    const from = currentPath();
    const result = originalPushState.apply(this, args);
    recordNavigation(from);
    return result;
  };
  history.replaceState = function patchedReplaceState(
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    const from = currentPath();
    const result = originalReplaceState.apply(this, args);
    recordNavigation(from);
    return result;
  };
  const onPopState = (): void => recordNavigation(lastPath);
  const onHashChange = (): void => recordNavigation(lastPath);

  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("submit", onSubmit, { capture: true, passive: true });
  document.addEventListener("input", onInput, { capture: true, passive: true });
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);

  return {
    snapshot: () => [...buffer],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    uninstall: () => {
      for (const timer of typeTimers.values()) {
        clearTimeout(timer);
      }
      typeTimers.clear();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    },
  };
}

/** Render an action record's text (after the "[age before report] " prefix). */
export function renderAction(record: ActionRecord): string {
  const frameSuffix =
    record.frame !== undefined
      ? ` — frame ${String(record.frame).padStart(2, "0")}`
      : "";
  switch (record.kind) {
    case "navigate":
      return `navigate ${record.from} → ${record.to}${frameSuffix}`;
    case "click": {
      const text = record.elementText ? ` ("${record.elementText}")` : "";
      return `click ${record.selector}${text}${frameSuffix}`;
    }
    case "submit":
      return `submit ${record.selector}${frameSuffix}`;
    default:
      // type never triggers a frame → no suffix
      return `type (${record.chars} chars) ${record.selector}`;
  }
}
