/**
 * Example production delivery endpoint — Next.js App Router:
 * `app/api/feedback/route.ts`. Pair it with `HttpConnector` on the client.
 *
 * The endpoint owns storage credentials and does the write; the browser only
 * talks to this route. This is example code, not part of sluglist core.
 *
 * ⚠️  Never put storage write-keys in the browser or a client connector. Keep
 *     them server-side, behind an endpoint like this. Auth, rate limiting and
 *     size limits are the endpoint's responsibility — sluglist core does none
 *     of them by design.
 *
 * **The shape rules are imported, not copied.** Path safety, the mime sets and
 * the size caps come from `sluglist/contract` — a DOM-free subpath built for
 * exactly this. When the artifact layout grows (another level of nesting, a new
 * artifact kind), upgrading the package updates this validation with it; a
 * hand-written regex would keep rejecting the new shape as "invalid path", which
 * is the failure this endpoint exists to avoid.
 *
 * What this example enforces, and why each one matters when the widget is
 * pointed at real users (see docs/production-checklist.md):
 *
 *   401  no / wrong bearer token   — an open endpoint is an open write to your
 *                                    storage bill and your triage queue
 *   413  body too large            — recordings are many PNGs; cap them
 *   415  unexpected content type   — core artifacts are three mime types;
 *                                    attachments are a short whitelist
 *   429  too many requests         — per-IP sliding window
 *   400  malformed path or payload — path traversal, missing fields
 *   409  session file cap reached  — one runaway page cannot fill a bucket
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  type ArtifactPayload,
  base64ByteLength,
  classifyArtifactPath,
  validateArtifactUpload,
} from "sluglist/contract";

// --- limits -------------------------------------------------------------------
/** Max artifacts accepted for a single session id. */
const MAX_FILES_PER_SESSION = 200;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/**
 * Body budget. **Not a sluglist limit — a platform one.** A Vercel serverless
 * function rejects a request body over ~4.5 MB before your code runs, and
 * base64 inflates bytes by a third, so a 4 MB artifact is already ~5.3 MB of
 * JSON. `HttpConnector` refuses to send past its own `maxBodyBytes` (4 MB by
 * default) with a message that names the file; keep the two in step, and for
 * genuinely large attachments upload straight to storage instead of through a
 * function.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * If you do NOT enable reporter attachments, pass `ARTIFACT_MIME_TYPES` as
 * `allowedMimeTypes` and set `rejectAttachments` — a narrower endpoint is a
 * better endpoint.
 */

export interface FeedbackRouteDeps {
  /** Write the artifact with YOUR storage credentials. */
  store(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Expected bearer token. Defaults to `process.env.SLUGLIST_FEEDBACK_TOKEN`. */
  token?(): string | undefined;
  /** Test seam. */
  now?(): number;
  maxBytes?: number;
  /** Per-attachment cap; keep it equal to the widget's attachments.maxFileSize. */
  maxAttachmentBytes?: number;
  maxFilesPerSession?: number;
}

/**
 * Compare two secrets without leaking their length or contents through timing.
 * Both are hashed first so `timingSafeEqual` always gets equal-length buffers —
 * comparing raw strings of different lengths would throw and, worse, reveal the
 * length difference.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1] : null;
}

export function createFeedbackHandler(
  deps: FeedbackRouteDeps
): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const maxBytes = deps.maxBytes ?? MAX_BYTES;
  const maxFiles = deps.maxFilesPerSession ?? MAX_FILES_PER_SESSION;
  const expectedToken =
    deps.token ?? (() => process.env.SLUGLIST_FEEDBACK_TOKEN);

  // Naive in-process state. Fine for a single instance or a demo; use Upstash,
  // Redis or @vercel/firewall in real production, because in-process state does
  // not survive across serverless workers.
  const hits = new Map<string, number[]>();
  const sessionFileCount = new Map<string, number>();

  function rateLimited(key: string): boolean {
    const at = now();
    const recent = (hits.get(key) ?? []).filter((t) => at - t < WINDOW_MS);
    recent.push(at);
    hits.set(key, recent);
    return recent.length > MAX_PER_WINDOW;
  }

  return async function POST(req: Request): Promise<Response> {
    // 1. Auth first: an unauthenticated caller learns nothing about the rest.
    const expected = expectedToken();
    if (!expected) {
      // Failing closed. A misconfigured endpoint must not become an open one.
      return new Response("Endpoint not configured", { status: 503 });
    }
    const provided = bearer(req);
    if (!(provided && tokenMatches(provided, expected))) {
      return new Response("Unauthorized", { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
    if (rateLimited(ip)) {
      return new Response("Too many requests", { status: 429 });
    }

    // 2. Reject an oversized body before reading it into memory, when the
    //    client was honest enough to declare a length.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > maxBytes * 2) {
      return new Response("Payload too large", { status: 413 });
    }

    let body: Partial<ArtifactPayload>;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const { sessionId, path, mime, base64, format } = body;
    if (typeof base64 !== "string") {
      return new Response("Missing fields", { status: 400 });
    }

    // 3. Shape, path safety, media type and size — one call, the library's own
    //    rules. The reason is returned in the body and logged: a client that
    //    sees "invalid artifact path: 01-x-frames/clip-01/02.png" knows in one
    //    read what a bare 400 would have sent it to the server logs for.
    //    `base64ByteLength` sizes the payload without decoding it, so a 1 GB
    //    string is never materialised as a buffer.
    const rejection = validateArtifactUpload(
      { sessionId, path, mime, byteLength: base64ByteLength(base64) },
      {
        maxBytes,
        maxAttachmentBytes: deps.maxAttachmentBytes ?? maxBytes,
        // rejectAttachments: true,  // ← if your widget does not enable them
      }
    );
    if (rejection) {
      console.warn(
        `[feedback] rejected ${String(path)} (format ${format ?? "?"}): ${rejection.reason}`
      );
      return new Response(rejection.reason, { status: rejection.status });
    }
    // Narrowed by the validator above; restated for TypeScript.
    const key = `${sessionId as string}/${path as string}`;

    // 4. Per-session cap: a page stuck in a loop cannot fill the bucket.
    const count = sessionFileCount.get(key.split("/")[0]) ?? 0;
    if (count >= maxFiles) {
      return new Response("Session file limit reached", { status: 409 });
    }
    sessionFileCount.set(key.split("/")[0], count + 1);

    // The kind is informational — useful in logs and metrics, never a gate.
    const kind = classifyArtifactPath(path as string);
    const bytes = Buffer.from(base64, "base64");
    await deps.store(`feedback/${key}`, bytes, mime as string);
    return Response.json({ ok: true, kind });
  };
}

/**
 * Replace this with your storage SDK call. For example, Vercel Blob:
 *
 *   import { put } from "@vercel/blob";
 *   await put(key, bytes, {
 *     access: "public", contentType: mime,
 *     addRandomSuffix: false, allowOverwrite: true,
 *   });
 *
 * S3, R2 and Supabase Storage all work the same way — the credentials live in
 * this process, never in the browser.
 */
async function storeArtifact(
  _key: string,
  _bytes: Uint8Array,
  _mime: string
): Promise<void> {
  throw new Error(
    "storeArtifact: wire this to your storage SDK before deploying"
  );
}

/** The Next.js route export. `SLUGLIST_FEEDBACK_TOKEN` must be set. */
export const POST = createFeedbackHandler({ store: storeArtifact });
