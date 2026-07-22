/**
 * Unified page-error capture: one ring buffer fed by three sources —
 * `console.error` (and `console.warn` when enabled), uncaught `error` events,
 * and `unhandledrejection`. Initialized at widget init (not on panel open) and
 * snapshotted into each issue as a `## Errors` section with relative time.
 */

export type ErrorSource = "console" | "exception" | "rejection";

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
  /** Test seam. */
  now?: () => number;
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
    message.startsWith("[snaglist]") || message.startsWith("[feedback-widget]")
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
