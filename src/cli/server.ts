import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { ATTACHMENT_MIME_TYPES } from "../attachments";

/**
 * The `sluglist dev` HTTP sidecar. Browser JS can't write to disk, so the
 * LocalConnector POSTs artifacts here and this writes them into `.sluglist/`.
 * Binds to 127.0.0.1 only, no auth (local-only by design — documented in README).
 */

export interface DevServerOptions {
  /** Folder to write into (relative to cwd or absolute). Default ".sluglist". */
  dir?: string;
  /** Bind host. Default 127.0.0.1 (local only). */
  host?: string;
  /** Called for each accepted file (session, path, bytes) — for stdout logs. */
  onFile?: (info: { sessionId: string; path: string; bytes: number }) => void;
}

const SESSION_ID = /^session-[a-z0-9-]{1,64}$/i;
// A filename, optionally nested: record-mode frames live two levels deep
// ("01-slug-frames/clip-01/01.png", format 1.2); pre-clip artifacts one
// ("01-slug-frames/02.png"). No "..", no absolute, nothing deeper than two.
const SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]{0,120}";
const FILE_PATH = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){0,2}$`);
// The three mimes the core writes itself, plus everything the attachment
// whitelist can produce (format 1.4 reporter attachments arrive through the
// same /put path). Sourced from the whitelist so the lists cannot drift; a
// custom `accept` config wider than the built-in whitelist is not honored
// here — the sidecar is a security boundary, not a mirror of widget config.
const ALLOWED_MIME = new Set([
  "text/yaml",
  "text/markdown",
  "image/png",
  ...ATTACHMENT_MIME_TYPES,
]);
const MAX_BASE64 = 25 * 1024 * 1024;

/** Origins we reflect for CORS: any localhost / 127.0.0.1 / [::1] port. */
function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the on-disk target for a put, rejecting traversal. Returns null when
 * sessionId/path are invalid or the resolved path escapes the session folder.
 */
export function resolveTarget(
  baseDir: string,
  sessionId: string,
  filePath: string
): string | null {
  if (!(SESSION_ID.test(sessionId) && FILE_PATH.test(filePath))) {
    return null;
  }
  const root = resolve(baseDir);
  const sessionDir = join(root, sessionId);
  const target = resolve(sessionDir, filePath);
  // Defense in depth: the resolved path must stay inside the session folder.
  if (target !== sessionDir && !target.startsWith(sessionDir + sep)) {
    return null;
  }
  return target;
}

interface PutBody {
  sessionId?: unknown;
  path?: unknown;
  mime?: unknown;
  base64?: unknown;
}

export function createDevServer(options: DevServerOptions = {}): Server {
  const dir = options.dir ?? ".sluglist";
  const absDir = resolve(dir);
  const onFile = options.onFile;

  return createServer((req, res) => {
    const origin = req.headers.origin;
    const cors: Record<string, string> = {};
    if (isLocalOrigin(origin)) {
      cors["access-control-allow-origin"] = origin as string;
      cors["access-control-allow-methods"] = "GET, POST, OPTIONS";
      cors["access-control-allow-headers"] = "content-type";
    }
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, {
        "content-type": "application/json",
        ...cors,
      });
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/health") {
      send(200, { ok: true, dir: absDir });
      return;
    }

    if (req.method === "POST" && url === "/put") {
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BASE64 + 4096) {
          aborted = true;
          send(413, { error: "Payload too large" });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (aborted) {
          return;
        }
        let body: PutBody;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          send(400, { error: "Invalid JSON" });
          return;
        }
        const { sessionId, path: filePath, mime, base64 } = body;
        if (
          typeof sessionId !== "string" ||
          typeof filePath !== "string" ||
          typeof mime !== "string" ||
          typeof base64 !== "string"
        ) {
          send(400, { error: "Missing or invalid fields" });
          return;
        }
        if (!ALLOWED_MIME.has(mime)) {
          send(400, { error: "Unsupported mime" });
          return;
        }
        if (base64.length > MAX_BASE64) {
          send(413, { error: "Payload too large" });
          return;
        }
        const target = resolveTarget(absDir, sessionId, filePath);
        if (!target) {
          send(400, { error: "Invalid sessionId or path" });
          return;
        }
        const bytes = Buffer.from(base64, "base64");
        // dirname(target) so a frames/ subfolder is created too.
        mkdir(dirname(target), { recursive: true })
          .then(() => writeFile(target, bytes))
          .then(() => {
            onFile?.({ sessionId, path: filePath, bytes: bytes.length });
            send(200, { ok: true });
          })
          .catch((error) => {
            send(500, { error: `Write failed: ${String(error)}` });
          });
        return;
      });
      return;
    }

    send(404, { error: "Not found" });
  });
}
