import type {
  ArtifactFile,
  DeliveryFailure,
  DeliveryReport,
  FeedbackConnector,
} from "./types";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

/**
 * A failure that retrying cannot fix.
 *
 * Delivery retries three times with backoff, which is right for a dropped
 * connection and wrong for a rejection: a 400, 413 or 415 will be a 400, 413 or
 * 415 again, so the retries only cost the reporter time and upload a
 * multi-megabyte frame twice more for nothing. A connector that can tell the
 * difference throws this instead, and delivery gives up at once and marks the
 * failure `permanent` so the UI can say *rejected* rather than *failed*.
 *
 * ```ts
 * if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) {
 *   throw new PermanentDeliveryError(`${res.status} ${res.statusText}`);
 * }
 * ```
 */
export class PermanentDeliveryError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = "PermanentDeliveryError";
  }
}

/**
 * Recognise a permanent failure without relying on `instanceof`, which breaks
 * across duplicated module copies (two sluglist versions in one bundle, a
 * connector loaded from a different chunk).
 */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof PermanentDeliveryError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { permanent?: unknown }).permanent === true)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function putWithRetry(
  connector: FeedbackConnector,
  sessionId: string,
  file: ArtifactFile
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      await connector.put(sessionId, file);
      return;
    } catch (error) {
      lastError = error;
      if (isPermanent(error)) {
        break;
      }
    }
  }
  throw lastError;
}

/**
 * Deliver files to every connector. Per connector the files are uploaded in
 * order (screenshots, markdown, then session.yaml last, so the index never
 * references a missing file). Connector failures are logged with the connector
 * id and never propagate: one broken connector must not affect the others or
 * the UI. The returned promise never rejects; it resolves with a report the
 * UI can use to offer a retry.
 */
export async function deliver(
  connectors: FeedbackConnector[],
  sessionId: string,
  files: ArtifactFile[]
): Promise<DeliveryReport> {
  const failures: DeliveryFailure[] = [];
  await Promise.all(
    connectors.map(async (connector) => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await putWithRetry(connector, sessionId, file);
        } catch (error) {
          console.error(
            `[feedback-widget] connector "${connector.id}" failed to put ${file.path}:`,
            error
          );
          failures.push({
            connectorId: connector.id,
            path: file.path,
            error: error instanceof Error ? error.message : String(error),
            ...(isPermanent(error) ? { permanent: true } : {}),
          });
          // Stop this connector for the remaining files of this batch: if a
          // screenshot failed there is little point uploading an index that
          // references it. The batch can be re-sent whole via redeliver.
          for (const skipped of files.slice(i + 1)) {
            failures.push({
              connectorId: connector.id,
              path: skipped.path,
              error: "skipped after a previous failure in this batch",
            });
          }
          return;
        }
      }
    })
  );
  return { ok: failures.length === 0, failures };
}
