import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ArtifactFile, FeedbackConnector } from "../types";

/**
 * Node-side LocalConnector: writes artifacts straight to disk (no `sluglist
 * dev` sidecar — a Node process can use the filesystem itself). Produces the
 * same `{dir}/{session-id}/…` layout the sidecar writes, so the fix skill and
 * every artifact reader see no difference.
 */
export interface LocalConnectorOptions {
  /** Folder to write into (relative to cwd or absolute). Default ".sluglist". */
  dir?: string;
}

const SESSION_ID = /^session-[a-z0-9-]{1,64}$/i;
// A filename, optionally nested (frames live two levels deep:
// "01-slug-frames/clip-01/01.png"). No "..", no absolute paths.
const SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]{0,120}";
const FILE_PATH = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){0,2}$`);

/**
 * Resolve the on-disk target for a put, rejecting traversal. Returns null when
 * sessionId/path are invalid or the resolved path escapes the session folder.
 */
export function resolveArtifactTarget(
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

export class LocalConnector implements FeedbackConnector {
  readonly id = "local-fs";
  private readonly dir: string;

  constructor(options: LocalConnectorOptions = {}) {
    this.dir = options.dir ?? ".sluglist";
  }

  async put(sessionId: string, file: ArtifactFile): Promise<void> {
    const target = resolveArtifactTarget(this.dir, sessionId, file.path);
    if (!target) {
      throw new Error(
        `[sluglist] invalid artifact path ${JSON.stringify(file.path)} in session ${JSON.stringify(sessionId)}`
      );
    }
    const bytes = Buffer.from(await file.blob.arrayBuffer());
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
