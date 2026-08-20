import { FORMAT_VERSION } from "../artifacts";
import type { ArtifactPayload } from "../contract";
import { PermanentDeliveryError } from "../deliver";
import type { ArtifactFile, FeedbackConnector } from "../types";

/**
 * Deliver artifacts to an endpoint you own.
 *
 * This is the production shape: the browser posts to a thin route on your side,
 * and that route holds the storage credentials. **Never put a bucket write-key
 * in a connector** — it ships to every visitor.
 *
 * The receiving end can validate the payload with the same rules this sends,
 * imported from `sluglist/contract`:
 *
 * ```ts
 * import { validateArtifactUpload, base64ByteLength } from "sluglist/contract";
 * ```
 */

/** Statuses worth another attempt: a timeout and a rate limit, nothing else. */
const RETRYABLE_4XX = new Set([408, 429]);

/**
 * Default body budget. Not a sluglist limit — a platform one: a serverless
 * function on Vercel rejects a request body over ~4.5 MB before any of your
 * code runs, and base64 inflates bytes by a third. So a 4 MB file is already
 * ~5.3 MB of JSON and dies at the edge with a 413 nobody can explain from the
 * client side. This check turns that into a message that names the file.
 */
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface HttpConnectorOptions {
  /**
   * Bearer token for the endpoint, read at delivery time so a rotated or
   * refreshed token is picked up without re-mounting the widget.
   */
  token?: () => string | undefined | null;
  /** Extra headers, merged after the defaults. */
  headers?: () => Record<string, string>;
  /**
   * Refuse to send a file whose encoded body would exceed this many bytes,
   * before the request is made. Default 4 MB — see {@link DEFAULT_MAX_BODY_BYTES}.
   * Raise it if your endpoint accepts more; set `Infinity` to disable.
   */
  maxBodyBytes?: number;
  /** Test seam. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Connector id in delivery reports. Default `"http"`. */
  id?: string;
}

/** base64 without blowing the stack on a multi-megabyte frame. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export class HttpConnector implements FeedbackConnector {
  readonly id: string;
  private readonly endpoint: string;
  private readonly options: HttpConnectorOptions;

  /**
   * Two call shapes, because the short one has been in the docs since long
   * before this class shipped and reads better at the call site:
   *
   * ```ts
   * new HttpConnector("/api/feedback", () => session.token)
   * new HttpConnector("/api/feedback", { token: () => session.token, maxBodyBytes: 8e6 })
   * ```
   */
  constructor(
    endpoint: string,
    tokenOrOptions: HttpConnectorOptions | (() => string | undefined | null) = {}
  ) {
    this.endpoint = endpoint;
    this.options =
      typeof tokenOrOptions === "function"
        ? { token: tokenOrOptions }
        : tokenOrOptions;
    this.id = this.options.id ?? "http";
  }

  async put(sessionId: string, file: ArtifactFile): Promise<void> {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const base64 = toBase64(bytes);
    const budget = this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (base64.length > budget) {
      // Permanent on purpose: the same file will be the same size next time.
      throw new PermanentDeliveryError(
        `${file.path} is ${bytes.length} bytes (${base64.length} encoded), over the ${budget}-byte body budget — raise maxBodyBytes if your endpoint accepts more, or upload large files straight to storage`
      );
    }

    const payload: ArtifactPayload = {
      format: FORMAT_VERSION,
      sessionId,
      path: file.path,
      mime: file.mime,
      base64,
    };
    const token = this.options.token?.();
    const doFetch = this.options.fetch ?? globalThis.fetch;
    const res = await doFetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...this.options.headers?.(),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return;
    }
    // The body often says exactly what was wrong ("invalid artifact path: …").
    // It is the difference between a debuggable toast and a shrug, so it is
    // read here rather than thrown away — capped, since it is untrusted.
    const detail = await res
      .text()
      .then((t) => t.trim().slice(0, 200))
      .catch(() => "");
    const message = `${res.status} ${res.statusText} for ${file.path}${
      detail ? ` — ${detail}` : ""
    }`;
    if (res.status >= 400 && res.status < 500 && !RETRYABLE_4XX.has(res.status)) {
      throw new PermanentDeliveryError(message);
    }
    throw new Error(message);
  }
}
