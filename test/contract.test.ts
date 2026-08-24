import { describe, expect, it } from "vitest";
import {
  ARTIFACT_MIME_TYPES,
  ARTIFACT_PATH_MAX_SEGMENTS,
  ATTACHMENT_MIME_TYPES,
  base64ByteLength,
  classifyArtifactPath,
  DELIVERY_MIME_TYPES,
  FORMAT_VERSION,
  isArtifactPath,
  isSessionId,
  validateArtifactUpload,
} from "../src/contract";

/**
 * `sluglist/contract` exists because every consumer was re-deriving these rules
 * by hand, and the one they got wrong was always the same: a record-mode frame
 * path has slashes in it. So that case leads, and the rest of the suite pins
 * the two properties an endpoint depends on — traversal is refused, and a valid
 * path we do not recognise is still accepted.
 */

const FRAME = "03-checkout-bug-frames/clip-01/02.png";

describe("isArtifactPath", () => {
  it("accepts a nested record-mode frame", () => {
    expect(isArtifactPath(FRAME)).toBe(true);
    expect(ARTIFACT_PATH_MAX_SEGMENTS).toBe(3);
  });

  it("accepts every shape the writer produces", () => {
    for (const path of [
      "session.yaml",
      "fixes.yaml",
      "01-save-does-nothing.md",
      "01-save-does-nothing.png",
      "03-checkout-att-01.png",
      "ev-export-button-01.png",
      "01-slug-frames/02.png",
      FRAME,
    ]) {
      expect(isArtifactPath(path), path).toBe(true);
    }
  });

  it("refuses traversal, absolute paths and hidden files", () => {
    for (const path of [
      "../etc/passwd",
      "01-slug-frames/../../escape.png",
      "/absolute.png",
      ".env",
      "a//b.png",
      "",
    ]) {
      expect(isArtifactPath(path), path).toBe(false);
    }
  });

  it("refuses more nesting than the format uses", () => {
    expect(isArtifactPath("a/b/c/d.png")).toBe(false);
  });
});

describe("classifyArtifactPath", () => {
  it("names each kind", () => {
    expect(classifyArtifactPath("session.yaml")).toBe("session");
    expect(classifyArtifactPath("fixes.yaml")).toBe("fixes");
    expect(classifyArtifactPath("01-save.md")).toBe("issue");
    expect(classifyArtifactPath("01-save.png")).toBe("screenshot");
    expect(classifyArtifactPath("03-checkout-att-01.pdf")).toBe("attachment");
    expect(classifyArtifactPath("ev-export-button-01.png")).toBe("evidence");
    expect(classifyArtifactPath(FRAME)).toBe("frame");
  });

  it("returns null only for a structurally invalid path", () => {
    expect(classifyArtifactPath("../escape.png")).toBeNull();
  });

  it("calls a valid but unrecognised path unknown, never invalid", () => {
    // The format only ever grows. An endpoint written today must not start
    // rejecting artifacts a later version adds.
    expect(classifyArtifactPath("summary-2027.json")).toBe("unknown");
    expect(classifyArtifactPath("clips/clip-01/frame.webp")).toBe("unknown");
  });
});

describe("validateArtifactUpload", () => {
  const ok = {
    sessionId: "session-2026-08-16-a1b2",
    path: FRAME,
    mime: "image/png",
    byteLength: 1024,
  };

  it("accepts a well-formed frame upload", () => {
    expect(validateArtifactUpload(ok)).toBeNull();
  });

  it("rejects a bad path with 400 and says which path", () => {
    const rejection = validateArtifactUpload({ ...ok, path: "../x.png" });
    expect(rejection?.status).toBe(400);
    expect(rejection?.reason).toContain("../x.png");
  });

  it("rejects a session id that is not sluglist's", () => {
    expect(validateArtifactUpload({ ...ok, sessionId: "../etc" })?.status).toBe(
      400
    );
    expect(isSessionId("session-2026-08-16-a1b2")).toBe(true);
    expect(isSessionId("anything-else")).toBe(false);
  });

  it("rejects an unknown media type with 415", () => {
    const rejection = validateArtifactUpload({
      ...ok,
      mime: "application/x-msdownload",
    });
    expect(rejection?.status).toBe(415);
  });

  it("refuses a core artifact wearing an attachment's mime", () => {
    // The gap this closes: "application/pdf" under an issue-shaped name.
    const rejection = validateArtifactUpload({
      ...ok,
      path: "01-save.md",
      mime: "application/pdf",
    });
    expect(rejection?.status).toBe(415);
    expect(rejection?.reason).toContain("issue");
  });

  it("sizes attachments on their own limit", () => {
    const input = {
      ...ok,
      path: "03-checkout-att-01.pdf",
      mime: "application/pdf",
      byteLength: 5_000_000,
    };
    expect(
      validateArtifactUpload(input, { maxBytes: 1000, maxAttachmentBytes: 6e6 })
    ).toBeNull();
    const rejection = validateArtifactUpload(input, {
      maxBytes: 1000,
      maxAttachmentBytes: 1e6,
    });
    expect(rejection?.status).toBe(413);
    expect(rejection?.reason).toContain("5000000");
  });

  it("can refuse attachments outright", () => {
    const rejection = validateArtifactUpload(
      { ...ok, path: "03-checkout-att-01.pdf", mime: "application/pdf" },
      { rejectAttachments: true }
    );
    expect(rejection?.status).toBe(415);
  });

  it("rejects missing fields rather than throwing", () => {
    expect(
      validateArtifactUpload({
        sessionId: undefined,
        path: FRAME,
        mime: "image/png",
        byteLength: 1,
      })?.status
    ).toBe(400);
  });
});

describe("the published constants", () => {
  it("carries the three core mimes and the attachment whitelist", () => {
    expect([...ARTIFACT_MIME_TYPES].sort()).toEqual([
      "image/png",
      "text/markdown",
      "text/yaml",
    ]);
    expect(ATTACHMENT_MIME_TYPES.has("application/pdf")).toBe(true);
    // The union is what an endpoint accepting attachments allows.
    for (const mime of [...ARTIFACT_MIME_TYPES, ...ATTACHMENT_MIME_TYPES]) {
      expect(DELIVERY_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it("exposes the format version the client sends", () => {
    expect(FORMAT_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it("sizes base64 without decoding it", () => {
    for (const bytes of [0, 1, 2, 3, 10, 4096]) {
      const b64 = Buffer.from(new Uint8Array(bytes)).toString("base64");
      expect(base64ByteLength(b64), `${bytes} bytes`).toBe(bytes);
    }
  });
});
