/** Ring buffer of the most recent console.error messages. */

const DEFAULT_CAPACITY = 20;

export interface ConsoleErrorBuffer {
  /** Snapshot of buffered errors, oldest first. */
  snapshot(): string[];
  /** Restore the original console.error. */
  uninstall(): void;
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

/**
 * Patch console.error to keep the last `capacity` messages. The widget's own
 * log lines (prefixed with [feedback-widget]) are excluded so connector
 * failures do not pollute captured issues.
 */
export function installConsoleErrorBuffer(
  capacity = DEFAULT_CAPACITY
): ConsoleErrorBuffer {
  const buffer: string[] = [];
  const original = console.error;

  console.error = (...args: unknown[]) => {
    const message = args.map(stringifyArg).join(" ");
    if (!message.startsWith("[feedback-widget]")) {
      buffer.push(message);
      if (buffer.length > capacity) {
        buffer.shift();
      }
    }
    original.apply(console, args);
  };

  return {
    snapshot: () => [...buffer],
    uninstall: () => {
      console.error = original;
    },
  };
}
