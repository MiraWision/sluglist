/**
 * Example production delivery endpoint — Next.js App Router:
 * `app/api/feedback/route.ts`. Pair it with `HttpConnector` on the client.
 *
 * The endpoint owns storage credentials and does the write; the browser only
 * talks to this route. This is example code, not part of snaglist core.
 *
 * ⚠️  Never put storage write-keys in the browser or a client connector. Keep
 *     them server-side, behind an endpoint like this. Rate limiting and auth are
 *     the endpoint's responsibility — snaglist core does neither by design.
 */

// --- Naive in-memory sliding-window rate limit. -------------------------------
// Fine for a single instance / demo; use Upstash, Redis or @vercel/firewall in
// real production (in-memory state does not survive across serverless workers).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

// --- Payload validation. ------------------------------------------------------
const FILE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const ALLOWED_MIME = new Set(["text/yaml", "text/markdown", "image/png"]);
const MAX_BASE64 = 20 * 1024 * 1024; // ~15 MB decoded

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (rateLimited(ip)) {
    return new Response("Too many requests", { status: 429 });
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
  if (!(sessionId && path && mime && base64)) {
    return new Response("Missing fields", { status: 400 });
  }
  if (!(FILE_PATH.test(path) && ALLOWED_MIME.has(mime))) {
    return new Response("Invalid payload", { status: 400 });
  }
  if (base64.length > MAX_BASE64) {
    return new Response("Payload too large", { status: 413 });
  }

  const bytes = Buffer.from(base64, "base64");
  // Write server-side with YOUR storage's credentials. For example, Vercel Blob:
  //   import { put } from "@vercel/blob";
  //   await put(`feedback/${sessionId}/${path}`, bytes, {
  //     access: "public", contentType: mime, addRandomSuffix: false, allowOverwrite: true,
  //   });
  await storeArtifact(`feedback/${sessionId}/${path}`, bytes, mime);
  return Response.json({ ok: true });
}

// Replace this with your storage SDK call (Vercel Blob, S3, R2, Supabase, …).
declare function storeArtifact(
  key: string,
  bytes: Uint8Array,
  mime: string
): Promise<void>;
