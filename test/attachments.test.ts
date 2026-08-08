// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachmentPath,
  checkAttachment,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
  extensionOf,
  formatBytes,
  isImageAttachment,
  resolveAttachments,
} from "../src/attachments";
import { NOOP_ACTION_CAPTURE } from "../src/actions";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile } from "../src/types";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget, type MountedFeedbackWidget } from "../src/ui/mount";

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/checkout",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 140",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

const policy = resolveAttachments(undefined);

function file(name: string, size: number, type = ""): {
  name: string;
  size: number;
  type: string;
} {
  return { name, size, type };
}

describe("policy defaults", () => {
  it("is on with 10MB / 5 files outside production", () => {
    expect(policy.enabled).toBe(true);
    expect(policy.maxFileSize).toBe(DEFAULT_MAX_FILE_SIZE);
    expect(policy.maxFiles).toBe(DEFAULT_MAX_FILES);
  });

  it("is OFF by default under the production preset", () => {
    expect(resolveAttachments(undefined, "production").enabled).toBe(false);
  });

  it("but production turns on when asked explicitly", () => {
    expect(
      resolveAttachments({ enabled: true }, "production").enabled
    ).toBe(true);
  });

  it("beta keeps the default-on behaviour", () => {
    expect(resolveAttachments(undefined, "beta").enabled).toBe(true);
  });
});

describe("type whitelist", () => {
  it("accepts the documented types", () => {
    for (const name of [
      "shot.png",
      "photo.JPG",
      "clip.mp4",
      "recording.mov",
      "invoice.pdf",
      "export.csv",
      "payload.json",
      "notes.md",
      "sheet.xlsx",
      "brief.docx",
    ]) {
      expect(checkAttachment(file(name, 1024), policy, 0).ok).toBe(true);
    }
  });

  it("refuses executables and archives", () => {
    for (const name of ["setup.exe", "logs.zip", "app.dmg", "run.sh", "x.jar"]) {
      expect(checkAttachment(file(name, 1024), policy, 0)).toMatchObject({
        ok: false,
        reason: "type",
      });
    }
  });

  it("refuses a file with no extension at all", () => {
    expect(checkAttachment(file("README", 1024), policy, 0).reason).toBe("type");
  });

  it("refuses a mime that contradicts the extension", () => {
    // A renamed executable declaring itself an image.
    expect(
      checkAttachment(
        file("totally-a-picture.png", 1024, "application/x-msdownload"),
        policy,
        0
      ).reason
    ).toBe("type");
  });

  it("accepts an empty mime — browsers report none for .md and .heic", () => {
    expect(checkAttachment(file("notes.md", 100, ""), policy, 0).ok).toBe(true);
  });

  it("archives stay refused even when listed in accept", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const custom = resolveAttachments({ accept: [".zip", ".log"] });
    expect(custom.extensions).toContain("log");
    expect(custom.extensions).not.toContain("zip");
    expect(checkAttachment(file("logs.zip", 10), custom, 0).reason).toBe("type");
    expect(checkAttachment(file("app.log", 10), custom, 0).ok).toBe(true);
    warn.mockRestore();
  });

  it("expands mime entries in accept back to extensions", () => {
    const custom = resolveAttachments({ accept: ["image/*"] });
    expect(custom.extensions.sort()).toEqual(
      ["gif", "heic", "jpeg", "jpg", "png", "webp"].sort()
    );
    expect(checkAttachment(file("doc.pdf", 10), custom, 0).reason).toBe("type");
  });
});

describe("limits", () => {
  it("refuses a file over the size cap", () => {
    const check = checkAttachment(
      file("video.mp4", 11 * 1024 * 1024, "video/mp4"),
      policy,
      0
    );
    expect(check).toMatchObject({ ok: false, reason: "size" });
  });

  it("refuses the sixth file", () => {
    expect(checkAttachment(file("a.png", 10), policy, 4).ok).toBe(true);
    expect(checkAttachment(file("a.png", 10), policy, 5)).toMatchObject({
      ok: false,
      reason: "count",
    });
  });

  it("refuses an empty file", () => {
    expect(checkAttachment(file("a.png", 0), policy, 0).reason).toBe("empty");
  });

  it("formats sizes for the error message", () => {
    expect(formatBytes(11 * 1024 * 1024)).toBe("11 MB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("naming", () => {
  it("names files after the issue, never after the upload", () => {
    expect(attachmentPath("03", "checkout", 0, "png")).toBe(
      "03-checkout-att-01.png"
    );
    expect(attachmentPath("03", "checkout", 4, "pdf")).toBe(
      "03-checkout-att-05.pdf"
    );
  });

  it("extracts a safe extension", () => {
    expect(extensionOf("IMG_4021.PNG")).toBe("png");
    expect(extensionOf("../../etc/passwd")).toBe("");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("classifies images for the thumbnail row", () => {
    expect(isImageAttachment("image/png", "png")).toBe(true);
    expect(isImageAttachment("", "heic")).toBe(true);
    expect(isImageAttachment("application/pdf", "pdf")).toBe(false);
  });
});

describe("artifacts", () => {
  it("writes the file next to the issue and lists it in frontmatter", async () => {
    const memory = new MemoryConnector();
    const core = createFeedbackWidget(
      {
        project: "acme",
        connectors: [memory],
        offlineQueue: false,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    const result = await core.captureIssue({
      comment: "Checkout is broken",
      mode: "fullpage",
      screenshots: [],
      selector: null,
      attachments: [
        {
          blob: new Blob([new Uint8Array(482112)], { type: "image/png" }),
          name: "IMG_4021.png",
          mime: "image/png",
        },
      ],
    });
    await result?.delivered;
    const sessionId = result?.sessionId ?? "";
    const attachment = memory.getFile(
      sessionId,
      "01-checkout-is-broken-att-01.png"
    );
    expect(attachment).toBeDefined();
    expect((attachment as ArtifactFile).mime).toBe("image/png");

    const md = await (
      memory.getFile(sessionId, "01-checkout-is-broken.md") as ArtifactFile
    ).blob.text();
    expect(md).toContain("attachments:\n  - file: 01-checkout-is-broken-att-01.png");
    expect(md).toContain("    mime: image/png");
    expect(md).toContain("    size: 482112");
    expect(md).toContain('    original_name: IMG_4021.png');
  });

  it("omits the block entirely when nothing is attached", async () => {
    const memory = new MemoryConnector();
    const core = createFeedbackWidget(
      { project: "acme", connectors: [memory], offlineQueue: false },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    const result = await core.captureIssue({
      comment: "Plain issue",
      mode: "fullpage",
      screenshots: [],
      selector: null,
    });
    await result?.delivered;
    const md = await (
      memory.getFile(result?.sessionId ?? "", "01-plain-issue.md") as ArtifactFile
    ).blob.text();
    expect(md).not.toContain("attachments:");
  });
});

describe("the button in the panel", () => {
  let ui: MountedFeedbackWidget | null = null;

  afterEach(() => {
    ui?.unmount();
    ui = null;
    document.body.innerHTML = "";
  });

  function mount(config: Record<string, unknown>) {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
        ...config,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget);
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    (shadow.querySelector(".fab") as HTMLButtonElement).click();
    const items = [...shadow.querySelectorAll(".menu button")];
    (items.at(-1) as HTMLButtonElement).click(); // comment-only
    return shadow;
  }

  it("is present in the dev preset (default on)", () => {
    expect(mount({}).querySelector(".attach-file")).not.toBeNull();
  });

  it("is absent under the production preset", () => {
    expect(
      mount({ preset: "production" }).querySelector(".attach-file")
    ).toBeNull();
  });

  it("comes back when production enables it explicitly", () => {
    expect(
      mount({
        preset: "production",
        attachments: { enabled: true },
      }).querySelector(".attach-file")
    ).not.toBeNull();
  });
});
