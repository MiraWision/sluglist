import type { ArtifactFile, FeedbackConnector } from "../types";

/**
 * Debug connector that accumulates artifacts in memory. Put is an upsert keyed
 * by path within a session, mirroring real storage semantics (session.yaml is
 * overwritten on every issue).
 */
export class MemoryConnector implements FeedbackConnector {
  readonly id: string;
  private readonly sessions = new Map<string, Map<string, ArtifactFile>>();

  constructor(id = "memory") {
    this.id = id;
  }

  put(sessionId: string, file: ArtifactFile): Promise<void> {
    let files = this.sessions.get(sessionId);
    if (!files) {
      files = new Map();
      this.sessions.set(sessionId, files);
    }
    files.set(file.path, file);
    return Promise.resolve();
  }

  getSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getFiles(sessionId: string): ArtifactFile[] {
    return [...(this.sessions.get(sessionId)?.values() ?? [])];
  }

  getFile(sessionId: string, path: string): ArtifactFile | undefined {
    return this.sessions.get(sessionId)?.get(path);
  }
}
