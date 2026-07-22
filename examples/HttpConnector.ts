import type { ArtifactFile, FeedbackConnector } from "snaglist";

/**
 * Example client connector for beta / production: POST each artifact as JSON to
 * your own endpoint. The browser never holds storage credentials — the endpoint
 * (see `feedback-route.ts`) owns them and does the write.
 *
 * This is example code, not part of snaglist core. Copy and adapt it.
 */
export class HttpConnector implements FeedbackConnector {
  readonly id = "http";

  constructor(
    private readonly endpoint: string,
    private readonly getToken?: () => string | undefined
  ) {}

  async put(sessionId: string, file: ArtifactFile): Promise<void> {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const token = this.getToken?.();
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        sessionId,
        path: file.path,
        mime: file.mime,
        base64: btoa(binary),
      }),
    });
    if (!res.ok) {
      throw new Error(`[snaglist] delivery failed: ${res.status} for ${file.path}`);
    }
  }
}
