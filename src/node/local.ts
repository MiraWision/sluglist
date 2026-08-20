import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { isArtifactPath, isSessionId } from "../contract";
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


/**
 * Resolve the on-disk target for a put, rejecting traversal. Returns null when
 * sessionId/path are invalid or the resolved path escapes the session folder.
 */
export function resolveArtifactTarget(
  baseDir: string,
  sessionId: string,
  filePath: string
): string | null {
  // The path rule lives in `contract.ts`, which the delivery endpoint imports
  // too — one source, so the sidecar and a consumer's route cannot disagree.
  if (!(isSessionId(sessionId) && isArtifactPath(filePath))) {
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
