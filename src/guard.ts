/**
 * Fault self-isolation.
 *
 * The widget wraps host globals (`console.error`, `fetch`, `XMLHttpRequest`,
 * `history.pushState`) and installs document-level listeners. A bug in any of
 * those would otherwise surface as a broken HOST page: a failed network call,
 * a navigation that never happens, a click that does nothing. That trade is
 * never acceptable for a feedback tool — the page it is embedded in matters
 * more than the report it is trying to collect.
 *
 * So every widget-owned callback goes through this guard, which enforces two
 * rules:
 *
 *  1. A throw inside widget code never escapes into host code. The original
 *     host behaviour runs regardless — wrappers are written so the call to the
 *     original happens outside the guarded region.
 *  2. Repeated internal failures are terminal. After `threshold` of them the
 *     breaker trips: registered teardowns restore every wrapped global, remove
 *     every listener and hide the UI, and the page carries on with no trace of
 *     the widget.
 *
 * Failures are logged with `console.debug`, not `console.error`: a widget that
 * is quietly failing should not also be shouting in the host's console (and
 * `console.error` is itself wrapped, which would be circular).
 */

/** Default number of internal failures before the widget switches itself off. */
export const DEFAULT_FAILURE_THRESHOLD = 5;

const TRIP_MESSAGE =
  "[sluglist] sluglist disabled itself after repeated internal errors";

export interface WidgetGuard {
  /** How many internal failures have been recorded this session. */
  readonly failures: number;
  /** Whether the breaker has tripped and the widget switched itself off. */
  readonly tripped: boolean;
  /**
   * Record an internal failure directly — for `catch` blocks in async paths
   * that the wrappers below cannot cover.
   */
  fail(site: string, error: unknown): void;
  /**
   * Register a teardown to run when the breaker trips. Teardowns are themselves
   * guarded (a failing teardown cannot stop the rest from running) and run at
   * most once.
   */
  onTrip(teardown: () => void): void;
  /**
   * Run `work`, returning `fallback` if it throws or the breaker has already
   * tripped. Use this for the part of a wrapper that computes widget state; the
   * call to the original host function must sit OUTSIDE it.
   */
  run<T>(site: string, work: () => T, fallback: T): T;
  /**
   * Wrap an event listener / callback so a throw inside it is recorded instead
   * of propagating. `onError` runs after the failure is recorded — the UI uses
   * it to close whatever it was rendering.
   */
  wrap<A extends unknown[]>(
    site: string,
    listener: (...args: A) => void,
    onError?: () => void
  ): (...args: A) => void;
}

export interface GuardOptions {
  /** Failures before self-disabling. Default 5. */
  threshold?: number;
}

/** Log without ever throwing back into the caller. */
function debug(site: string, error: unknown): void {
  try {
    console.debug(`[sluglist] internal error in ${site}:`, error);
  } catch {
    // A host that broke console is not our problem to solve.
  }
}

export function createGuard(options: GuardOptions = {}): WidgetGuard {
  const threshold = Math.max(1, options.threshold ?? DEFAULT_FAILURE_THRESHOLD);
  const teardowns: Array<() => void> = [];
  let failures = 0;
  let tripped = false;

  function trip(): void {
    if (tripped) {
      return;
    }
    tripped = true;
    // Drain the list so a teardown registered mid-trip cannot loop.
    const pending = teardowns.splice(0, teardowns.length);
    for (const teardown of pending) {
      try {
        teardown();
      } catch (error) {
        debug("guard:teardown", error);
      }
    }
    try {
      console.warn(TRIP_MESSAGE);
    } catch {
      // See debug().
    }
  }

  function record(site: string, error: unknown): void {
    if (tripped) {
      return;
    }
    failures++;
    debug(site, error);
    if (failures >= threshold) {
      trip();
    }
  }

  return {
    get failures() {
      return failures;
    },
    get tripped() {
      return tripped;
    },
    fail: record,
    onTrip: (teardown) => {
      if (tripped) {
        // Registering after the trip: run it now so nothing is left installed.
        try {
          teardown();
        } catch (error) {
          debug("guard:teardown", error);
        }
        return;
      }
      teardowns.push(teardown);
    },
    run: (site, work, fallback) => {
      if (tripped) {
        return fallback;
      }
      try {
        return work();
      } catch (error) {
        record(site, error);
        return fallback;
      }
    },
    wrap:
      (site, listener, onError) =>
      (...args) => {
        if (tripped) {
          return;
        }
        try {
          listener(...args);
        } catch (error) {
          record(site, error);
          if (onError) {
            try {
              onError();
            } catch (nested) {
              debug(`${site}:onError`, nested);
            }
          }
        }
      },
  };
}

/**
 * Restore a wrapped global — but only if it is still OURS.
 *
 * If another library wrapped on top of our wrapper, `current` is their function
 * and writing the original back would silently uninstall them. In that case the
 * chain is left intact and our wrapper degrades to a transparent passthrough
 * (each capture module has a `stopped` flag for exactly this). The situation is
 * logged so it is visible rather than mysterious.
 *
 * @returns whether the original was actually restored.
 */
export function restoreIfOurs<T>(
  name: string,
  current: T,
  ours: T,
  restore: () => void
): boolean {
  if (current === ours) {
    restore();
    return true;
  }
  try {
    console.debug(
      `[sluglist] ${name} was wrapped by something else after us; leaving the chain intact and going passthrough instead of restoring`
    );
  } catch {
    // Nothing sensible to do if console itself is broken.
  }
  return false;
}

/** A guard that counts nothing and never trips — for tests and disabled paths. */
export const NOOP_GUARD: WidgetGuard = {
  failures: 0,
  tripped: false,
  fail: () => undefined,
  onTrip: () => undefined,
  run: (_site, work, fallback) => {
    try {
      return work();
    } catch {
      return fallback;
    }
  },
  wrap:
    (_site, listener) =>
    (...args) => {
      listener(...args);
    },
};
