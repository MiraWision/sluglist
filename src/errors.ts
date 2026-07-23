/**
 * Unified page-error capture: one ring buffer fed by three sources —
 * `console.error` (and `console.warn` when enabled), uncaught `error` events,
 * and `unhandledrejection`. Initialized at widget init (not on panel open) and
 * snapshotted into each issue as a `## Errors` section with relative time.
 */

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
  const buffer: ErrorRecord[] = [];
  const push = (record: ErrorRecord): void => {
    buffer.push(record);
    while (buffer.length > size) {
      buffer.shift();
    }
  };

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(stringifyArg).join(" ");
    if (!isSelfLog(message)) {
      push({ ts: now(), source: "console", message: truncate(message) });
    }
    originalError.apply(console, args);
  };

  let originalWarn: typeof console.warn | null = null;
  if (options.captureWarnings) {
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const message = args.map(stringifyArg).join(" ");
      if (!isSelfLog(message)) {
        push({ ts: now(), source: "console", message: truncate(message) });
      }
      (originalWarn as typeof console.warn).apply(console, args);
    };
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

  const hasWindow = typeof window !== "undefined";
  if (hasWindow) {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
  }

  // Network-failure capture (fetch + XHR). Records only the FACT of a failure —
  // method, path (no query), status, duration — never bodies, headers or query.
  const pushNetwork = (
    method: string,
    url: string,
    status: number | "network error",
    startedAt: number
  ): void => {
    const ms = Math.max(0, Math.round(now() - startedAt));
    push({
      ts: now(),
      source: "network",
      message: `${method} ${pathOf(url)} → ${status} (${ms}ms)`,
    });
  };

  const teardowns: Array<() => void> = [];
  const captureNetwork =
    options.captureNetwork !== false &&
    typeof globalThis !== "undefined";

  if (captureNetwork && typeof globalThis.fetch === "function") {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function patchedFetch(
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const startedAt = now();
      const method = (
        init?.method ||
        (typeof input === "object" && "method" in input ? input.method : "") ||
        "GET"
      ).toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return originalFetch.call(this, input as RequestInfo, init).then(
        (res) => {
          if (res.status >= 400) {
            pushNetwork(method, url, res.status, startedAt);
          }
          return res;
        },
        (err: unknown) => {
          pushNetwork(method, url, "network error", startedAt);
          throw err;
        }
      );
    };
    teardowns.push(() => {
      globalThis.fetch = originalFetch;
    });
  }

  if (captureNetwork && typeof XMLHttpRequest !== "undefined") {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    type Tracked = XMLHttpRequest & { __sl?: { method: string; url: string } };
    proto.open = function open(
      this: Tracked,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__sl = { method: (method || "GET").toUpperCase(), url: String(url) };
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to native signature
      return (originalOpen as any).call(this, method, url, ...rest);
    };
    proto.send = function send(this: Tracked, ...args: unknown[]) {
      const info = this.__sl;
      if (info) {
        const startedAt = now();
        this.addEventListener("loadend", () => {
          // status 0 → network error / abort; otherwise the HTTP status.
          if (this.status === 0) {
            pushNetwork(info.method, info.url, "network error", startedAt);
          } else if (this.status >= 400) {
            pushNetwork(info.method, info.url, this.status, startedAt);
          }
        });
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to native signature
      return (originalSend as any).apply(this, args);
    };
    teardowns.push(() => {
      proto.open = originalOpen;
      proto.send = originalSend;
    });
  }

  return {
    snapshot: () => [...buffer],
    uninstall: () => {
      console.error = originalError;
      if (originalWarn) {
        console.warn = originalWarn;
      }
      if (hasWindow) {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
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
