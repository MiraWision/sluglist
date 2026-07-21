import JSZip from "jszip";
import type { ArtifactFile, FeedbackConnector } from "../types";

/**
 * Debug connector that accumulates artifacts in memory and can produce a zip
 * of a whole session on demand (browser download or raw Blob for tests).
 */
export class DownloadConnector implements FeedbackConnector {
  readonly id: string;
  private readonly sessions = new Map<string, Map<string, ArtifactFile>>();

  constructor(id = "download") {
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

  /** Build a zip Blob for a session (defaults to the only / latest session). */
  async buildZipBlob(sessionId?: string): Promise<Blob> {
    const id = sessionId ?? this.latestSessionId();
    if (!id) {
      throw new Error("[feedback-widget] no session to zip");
    }
    const files = this.sessions.get(id);
    if (!files || files.size === 0) {
      throw new Error(`[feedback-widget] session ${id} has no files`);
    }
    const zip = new JSZip();
    for (const file of files.values()) {
      // ArrayBuffer instead of Blob so the same code works in Node (tests).
      zip.file(`${id}/${file.path}`, await file.blob.arrayBuffer());
    }
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    return new Blob([buffer], { type: "application/zip" });
  }

  /** Trigger a browser download of the session zip. */
  async downloadZip(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.latestSessionId();
    const blob = await this.buildZipBlob(id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${id}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private latestSessionId(): string | undefined {
    const ids = [...this.sessions.keys()];
    return ids.at(-1);
  }
}
