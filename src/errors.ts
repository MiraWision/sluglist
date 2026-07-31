/**
 * Unified page-error capture: one ring buffer fed by three sources —
 * `console.error` (and `console.warn` when enabled), uncaught `error` events,
 * and `unhandledrejection`. Initialized at widget init (not on panel open) and
 * snapshotted into each issue as a `## Errors` section with relative time.
 */

import { NOOP_GUARD, restoreIfOurs, type WidgetGuard } from "./guard";

export type ErrorSource = "console" | "exception" | "rejection" | "network";

export interface ErrorRecord {
  /** epoch ms when captured */
  ts: number;
  source: ErrorSource;
  message: string;
  stack?: string;
}

export interface ErrorCapture {
  snapshot(): ErrorRecord[];
  uninstall(): void;
}

export interface ErrorCaptureOptions {
  /** Capture at all. Default true. */
  capture?: boolean;
  /** Ring buffer size. Default 20. */
  bufferSize?: number;
  /** Also wrap console.warn. Default false. */
  captureWarnings?: boolean;
  /**
   * Record failed fetch/XHR calls (status >= 400 or network error) as `network`
   * entries: method, path (no query), status and duration only. Default true.
   */
  captureNetwork?: boolean;
  /** Test seam. */
  now?: () => number;
  /**
   * Fault isolation. Every wrapper below computes its bookkeeping inside the
   * guard and calls the ORIGINAL host function outside it, so a bug in capture
   * can never break a host console call, fetch or XHR. Defaults to a no-op
   * guard, which keeps the standalone unit tests unchanged.
   */
  guard?: WidgetGuard;
}

/** Extract the path (no query, no origin) from a request URL for a network log. */
function pathOf(url: string): string {
  try {
    const base =
      typeof location !== "undefined" ? location.href : "http://localhost/";
    return new URL(url, base).pathname || "/";
  } catch {
    return url.split("?")[0] || url;
  }
}

const DEFAULT_SIZE = 20;
const MAX_LEN = 500;
const TRUNCATE_MARK = "…[truncated]";

export const NOOP_ERROR_CAPTURE: ErrorCapture = {
  snapshot: () => [],
  uninstall: () => undefined,
};

function truncate(value: string): string {
  return value.length > MAX_LEN
    ? value.slice(0, MAX_LEN) + TRUNCATE_MARK
    : value;
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function safeString(value: unknown): string {
  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }
    return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Skip the widget's own log lines so connector noise never pollutes issues. */
function isSelfLog(message: string): boolean {
  return (
    message.startsWith("[sluglist]") || message.startsWith("[feedback-widget]")
  );
}

/**
 * Install the capture. Wraps console.error (calling the original), optionally
 * console.warn, and adds window listeners for `error` and `unhandledrejection`.
 * Returns a no-op capture when disabled.
 */
export function createErrorCapture(
  options: ErrorCaptureOptions = {}
): ErrorCapture {
  if (options.capture === false) {
    return NOOP_ERROR_CAPTURE;
  }
  const size = Math.max(1, options.bufferSize ?? DEFAULT_SIZE);
  const now = options.now ?? (() => Date.now());
  const guard = options.guard ?? NOOP_GUARD;
  const buffer: ErrorRecord[] = [];
  const push = (record: ErrorRecord): void => {
    buffer.push(record);
    while (buffer.length > size) {
      buffer.shift();
    }
  };

  /**
   * Set once `uninstall()` has run. A wrapper we could not remove (because
   * someone else wrapped on top of it) stays installed but stops capturing, so
   * it degrades to a transparent passthrough instead of a leak.
   */
  let stopped = false;

  /** Buffer a console line. Guarded; the caller still forwards to the original. */
  const captureConsole = (site: string, args: unknown[]): void => {
    if (stopped) {
      return;
    }
    guard.run(
      site,
      () => {
        const message = args.map(stringifyArg).join(" ");
        if (!isSelfLog(message)) {
          push({ ts: now(), source: "console", message: truncate(message) });
        }
      },
      undefined
    );
  };

  const originalError = console.error;
  const patchedError = (...args: unknown[]) => {
    captureConsole("console.error", args);
    // Outside the guard: the host's log must happen whatever capture did.
    originalError.apply(console, args);
  };
  console.error = patchedError;

  let originalWarn: typeof console.warn | null = null;
  let patchedWarn: typeof console.warn | null = null;
  if (options.captureWarnings) {
    originalWarn = console.warn;
    patchedWarn = (...args: unknown[]) => {
      captureConsole("console.warn", args);
      (originalWarn as typeof console.warn).apply(console, args);
    };
    console.warn = patchedWarn;
  }

  const onError = (event: ErrorEvent): void => {
    const message = event.message || safeString(event.error) || "Unknown error";
    const stack =
      event.error instanceof Error && event.error.stack
        ? truncate(event.error.stack)
        : undefined;
    push({ ts: now(), source: "exception", message: truncate(message), stack });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : safeString(reason);
    const stack =
      reason instanceof Error && reason.stack
        ? truncate(reason.stack)
        : undefined;
    push({
      ts: now(),
      source: "rejection",
      message: truncate(`Unhandled rejection: ${message}`),
      stack,
    });
  };

  // Guarded listeners: a throw while recording a page error must not become a
  // second page error. Note this counts WIDGET failures only — a host page
  // error arriving here is data, and recording it successfully is not a failure.
  const hasWindow = typeof window !== "undefined";
  const guardedOnError = guard.wrap("window.error", onError);
  const guardedOnRejection = guard.wrap("window.unhandledrejection", onRejection);
  if (hasWindow) {
    window.addEventListener("error", guardedOnError);
    window.addEventListener("unhandledrejection", guardedOnRejection);
  }

  // Network-failure capture (fetch + XHR). Records only the FACT of a failure —
  // method, path (no query), status, duration — never bodies, headers or query.
  const pushNetwork = (
    method: string,
    url: string,
    status: number | "network error",
    startedAt: number
  ): void => {
    if (stopped) {
      return;
    }
    guard.run(
      "network.record",
      () => {
        const ms = Math.max(0, Math.round(now() - startedAt));
        push({
          ts: now(),
          source: "network",
          message: `${method} ${pathOf(url)} → ${status} (${ms}ms)`,
        });
      },
      undefined
    );
  };

  const teardowns: Array<() => void> = [];
  const captureNetwork =
    options.captureNetwork !== false &&
    typeof globalThis !== "undefined";

  if (captureNetwork && typeof globalThis.fetch === "function") {
    const originalFetch = globalThis.fetch;
    const patchedFetch = function patchedFetch(
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      // Everything the widget needs is computed first, inside the guard, so a
      // failure here yields `null` instead of throwing.
      const meta = guard.run<{
        method: string;
        startedAt: number;
        url: string;
      } | null>(
        "fetch.meta",
        () => ({
          startedAt: now(),
          method: (
            init?.method ||
            (typeof input === "object" && "method" in input ? input.method : "") ||
            "GET"
          ).toUpperCase(),
          url:
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
        }),
        null
      );
      // The host's request is issued unconditionally, on the original fetch.
      const response = originalFetch.call(this, input as RequestInfo, init);
      if (!meta) {
        return response;
      }
      return response.then(
        (res) => {
          if (res.status >= 400) {
            pushNetwork(meta.method, meta.url, res.status, meta.startedAt);
          }
          return res;
        },
        (err: unknown) => {
          pushNetwork(meta.method, meta.url, "network error", meta.startedAt);
          throw err;
        }
      );
    };
    globalThis.fetch = patchedFetch;
    teardowns.push(() =>
      restoreIfOurs("fetch", globalThis.fetch, patchedFetch, () => {
        globalThis.fetch = originalFetch;
      })
    );
  }

  if (captureNetwork && typeof XMLHttpRequest !== "undefined") {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    type Tracked = XMLHttpRequest & { __sl?: { method: string; url: string } };
    const patchedOpen = function open(
      this: Tracked,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      guard.run(
        "xhr.open",
        () => {
          this.__sl = {
            method: (method || "GET").toUpperCase(),
            url: String(url),
          };
        },
        undefined
      );
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to native signature
      return (originalOpen as any).call(this, method, url, ...rest);
    };
    proto.open = patchedOpen;
    const patchedSend = function send(this: Tracked, ...args: unknown[]) {
      guard.run(
        "xhr.send",
        () => {
          const info = this.__sl;
          if (!info || stopped) {
            return;
          }
          const startedAt = now();
          this.addEventListener(
            "loadend",
            guard.wrap("xhr.loadend", () => {
              // status 0 → network error / abort; otherwise the HTTP status.
              if (this.status === 0) {
                pushNetwork(info.method, info.url, "network error", startedAt);
              } else if (this.status >= 400) {
                pushNetwork(info.method, info.url, this.status, startedAt);
              }
            })
          );
        },
        undefined
      );
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to native signature
      return (originalSend as any).apply(this, args);
    };
    proto.send = patchedSend;
    teardowns.push(() => {
      restoreIfOurs("XMLHttpRequest.open", proto.open, patchedOpen, () => {
        proto.open = originalOpen;
      });
      restoreIfOurs("XMLHttpRequest.send", proto.send, patchedSend, () => {
        proto.send = originalSend;
      });
    });
  }

  return {
    snapshot: () => [...buffer],
    uninstall: () => {
      // `stopped` first: any wrapper we cannot remove is already inert by the
      // time we find out we have to leave it in place.
      stopped = true;
      restoreIfOurs("console.error", console.error, patchedError, () => {
        console.error = originalError;
      });
      if (originalWarn && patchedWarn) {
        restoreIfOurs("console.warn", console.warn, patchedWarn, () => {
          console.warn = originalWarn as typeof console.warn;
        });
      }
      if (hasWindow) {
        window.removeEventListener("error", guardedOnError);
        window.removeEventListener("unhandledrejection", guardedOnRejection);
      }
      for (const teardown of teardowns) {
        teardown();
      }
    },
  };
}

/** Relative age like "3s", "2m", "1h" for the `## Errors` section. */
export function formatErrorAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.round(minutes / 60)}h`;
}
