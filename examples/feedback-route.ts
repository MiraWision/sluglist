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

// --- limits -------------------------------------------------------------------
/** Max decoded artifact size. Recording frames are the big ones. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Max artifacts accepted for a single session id. */
const MAX_FILES_PER_SESSION = 200;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/** The only mime types sluglist core ever produces itself. */
const CORE_MIME = ["text/yaml", "text/markdown", "image/png"];

/**
 * Reporter attachments (`attachments` in the widget config) arrive through this
 * same route with the mime of the file the reporter picked, so the endpoint
 * needs its own whitelist — the client-side one is a UX affordance, not a
 * control. Keep this in sync with `src/attachments.ts`; trim it to what you
 * actually want to receive.
 *
 * Executables and archives are absent on purpose and must stay absent: an
 * archive is opaque to every check you and your storage run after this point.
 *
 * If you do NOT enable attachments, delete this list and pass `CORE_MIME` to
 * `ALLOWED_MIME` — a narrower endpoint is a better endpoint.
 */
const ATTACHMENT_MIME = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf",
  "text/plain", "text/csv", "application/csv", "text/markdown", "text/x-markdown",
  "application/json", "text/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ALLOWED_MIME = new Set([...CORE_MIME, ...ATTACHMENT_MIME]);

/**
 * Attachments are the only artifacts whose size the reporter controls (a phone
 * video is tens of megabytes), so they get their own cap — keep it equal to the
 * widget's `attachments.maxFileSize`, or the browser will accept a file this
 * route then rejects.
 */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Artifact names the widget gives attachments: `03-checkout-att-01.png`. */
const ATTACHMENT_PATH = /-att-\d{2}\.[A-Za-z0-9]+$/;
/**
 * Relative POSIX paths inside the session folder. Allows the one level of
 * nesting recordings use (`01-slug-frames/clip-01/02.png`) and nothing else —
 * no `..`, no absolute paths, no leading dot.
 */
const FILE_PATH =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}){0,2}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

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

    let body: {
      sessionId?: string;
      path?: string;
      mime?: string;
      base64?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const { sessionId, path, mime, base64 } = body;
    if (!(sessionId && path && mime && typeof base64 === "string")) {
      return new Response("Missing fields", { status: 400 });
    }
    if (!(SESSION_ID.test(sessionId) && FILE_PATH.test(path))) {
      return new Response("Invalid path", { status: 400 });
    }
    // 3. Content type: only what the core emits, and it must be declared, not
    //    sniffed. 415 rather than 400 so a client can tell the two apart.
    if (!ALLOWED_MIME.has(mime)) {
      return new Response("Unsupported media type", { status: 415 });
    }
    // An attachment must be a type the reporter is allowed to send, not just a
    // type sluglist can produce — and a core artifact must never arrive with an
    // attachment mime. Checking the pair closes the gap where "image/png" would
    // let any file through under an artifact-shaped name.
    const isAttachment = ATTACHMENT_PATH.test(path);
    if (!isAttachment && !CORE_MIME.includes(mime)) {
      return new Response("Unsupported media type", { status: 415 });
    }
    const limit = isAttachment
      ? (deps.maxAttachmentBytes ?? MAX_ATTACHMENT_BYTES)
      : maxBytes;
    // base64 is 4 chars per 3 bytes; check before decoding so a 1GB string is
    // never materialised as a buffer.
    if ((base64.length * 3) / 4 > limit) {
      return new Response("Payload too large", { status: 413 });
    }

    // 4. Per-session cap: a page stuck in a loop cannot fill the bucket.
    const count = sessionFileCount.get(sessionId) ?? 0;
    if (count >= maxFiles) {
      return new Response("Session file limit reached", { status: 409 });
    }
    sessionFileCount.set(sessionId, count + 1);

    const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength > limit) {
      return new Response("Payload too large", { status: 413 });
    }

    await deps.store(`feedback/${sessionId}/${path}`, bytes, mime);
    return Response.json({ ok: true });
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
