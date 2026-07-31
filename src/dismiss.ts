/**
 * Dismiss state: "this reporter closed the widget, keep it out of the way".
 *
 * Persisted in localStorage (not sessionStorage) because the point is to
 * survive the tab closing — a customer who dismissed the launcher should not
 * see it again tomorrow. Deliberately tiny and fully guarded: every storage
 * access can throw (Safari private mode, blocked third-party storage, quota),
 * and a widget that cannot remember a dismissal must still work rather than
 * take the host page down with it.
 */

const DAY_MS = 86_400_000;

/** Stored shape. `dismissed_at` is an ISO timestamp. */
export interface DismissRecord {
  dismissed_at: string;
}

export function dismissKey(project: string): string {
  return `sluglist:${project}:dismissed`;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Read the raw record, or null when absent / unreadable / malformed. */
export function readDismiss(project: string): DismissRecord | null {
  const raw = (() => {
    try {
      return store()?.getItem(dismissKey(project)) ?? null;
    } catch {
      return null;
    }
  })();
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as DismissRecord).dismissed_at === "string"
    ) {
      return parsed as DismissRecord;
    }
  } catch {
    // Corrupt entry — treat it as "not dismissed" rather than guessing.
  }
  return null;
}

/**
 * Is the widget currently dismissed? `days` is the return window: `0` means the
 * dismissal never expires (until storage is cleared or `show()` is called). An
 * unparseable timestamp is treated as not dismissed — failing open keeps the
 * feedback path reachable, which is the safer default for a support tool.
 */
export function isDismissed(
  project: string,
  days: number,
  now: number = Date.now()
): boolean {
  const record = readDismiss(project);
  if (!record) {
    return false;
  }
  if (days <= 0) {
    return true;
  }
  const at = Date.parse(record.dismissed_at);
  if (Number.isNaN(at)) {
    return false;
  }
  return now - at < days * DAY_MS;
}

/** Record a dismissal. Silently does nothing when storage is unavailable. */
export function setDismissed(project: string, at: Date = new Date()): void {
  try {
    store()?.setItem(
      dismissKey(project),
      JSON.stringify({ dismissed_at: at.toISOString() } satisfies DismissRecord)
    );
  } catch {
    // No persistence: the widget still hides for this page view, it just comes
    // back on the next load. Better than throwing into the host page.
  }
}

/** Clear a dismissal, bringing the widget back immediately. */
export function clearDismissed(project: string): void {
  try {
    store()?.removeItem(dismissKey(project));
  } catch {
    // Nothing to do — see setDismissed.
  }
}
