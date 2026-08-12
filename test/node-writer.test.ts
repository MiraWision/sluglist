import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { MemoryConnector } from "../src/connectors/memory";
import { createSession } from "../src/node/writer";
import { LocalConnector, resolveArtifactTarget } from "../src/node/local";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";
import type { ArtifactFile } from "../src/types";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function textOf(file: ArtifactFile | undefined): Promise<string> {
  if (!file) {
    throw new Error("file missing");
  }
  return await file.blob.text();
}

describe("node writer", () => {
  it("zero-config: createSession({ connectors }) is a working session", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({ connectors: [memory] });
    const issue = await session.reportIssue({ comment: "Something broke" });
    expect(issue.id).toBe("01");
    expect(issue.report.ok).toBe(true);
    const files = memory.getFiles(issue.sessionId).map((f) => f.path);
    expect(files).toEqual(["01-something-broke.md", "session.yaml"]);
    const yaml = parse(
      await textOf(memory.getFile(issue.sessionId, "session.yaml"))
    );
    expect(yaml.project).toBe("app");
    expect(yaml.issues).toHaveLength(1);
  });

  it("full flow: checklist, verdicts, issue with screenshot buffer", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      project: "demo",
      baseUrl: "http://localhost:5000",
      viewport: "1280x800",
      reporter: { name: "qa-agent", kind: "agent" },
      checklist: {
        id: "release-1",
        title: "Release checks",
        sections: [
          {
            title: "Export",
            items: [
              { id: "export-visible", title: "Export button is visible" },
              { id: "export-works", title: "Export downloads a file" },
            ],
          },
        ],
      },
    });

    const issue = await session.reportIssue({
      comment: "Export button missing on /reports",
      screenshot: PNG,
      category: "bug",
      checklistItem: "export-visible",
      meta: { url: "/reports", selector: "#export", viewport: "1280x800" },
    });
    await session.setVerdict("export-visible", "fail", { issue: issue.id });
    await session.setVerdict("export-works", "pass");

    const yaml = parse(
      await textOf(memory.getFile(issue.sessionId, "session.yaml"))
    );
    expect(yaml.reporter).toEqual({ name: "qa-agent", kind: "agent" });
    expect(yaml.checklist.items).toEqual([
      expect.objectContaining({
        id: "export-visible",
        verdict: "fail",
        issue: "01",
      }),
      expect.objectContaining({ id: "export-works", verdict: "pass", issue: null }),
    ]);
    const md = await textOf(
      memory.getFile(issue.sessionId, issue.file)
    );
    expect(md).toContain("checklist_item: export-visible");
    expect(md).toContain("kind: agent");
    expect(memory.getFile(issue.sessionId, "01-export-button-missing-on-reports.png")).toBeDefined();
  });

  it("issue markdown is structurally identical to the widget's (minus kind)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    try {
      const widgetMemory = new MemoryConnector();
      const widget = createFeedbackWidget(
        {
          project: "parity",
          connectors: [widgetMemory],
          offlineQueue: false,
          identity: { name: "qa-agent" },
          errors: { capture: false },
          actions: { capture: false },
        },
        {
          storage: createMemoryStorage(),
          environment: () => ({
            baseUrl: "http://localhost:5000",
            url: "/reports",
            viewport: "1280x800",
            screen: "1280x800",
            devicePixelRatio: 1,
            browser: "Node 22",
            os: "macOS",
            language: "",
            languages: [""],
            timezone: "",
            colorScheme: "",
            reducedMotion: false,
          }),
        }
      );
      const fromWidget = await widget.captureIssue({
        comment: "Export button missing",
        mode: "fullpage",
        category: "bug",
        screenshot: new Blob([PNG], { type: "image/png" }),
      });
      await fromWidget?.delivered;
      await vi.runAllTimersAsync();

      const nodeMemory = new MemoryConnector();
      const session = await createSession({
        connectors: [nodeMemory],
        project: "parity",
        baseUrl: "http://localhost:5000",
        reporter: { name: "qa-agent" },
        viewport: "1280x800",
      });
      const fromNode = await session.reportIssue({
        comment: "Export button missing",
        screenshot: PNG,
        category: "bug",
        meta: { url: "/reports", viewport: "1280x800" },
      });

      const widgetMd = await textOf(
        widgetMemory.getFile(fromWidget?.sessionId as string, "01-export-button-missing.md")
      );
      const nodeMd = await textOf(
        nodeMemory.getFile(fromNode.sessionId, "01-export-button-missing.md")
      );
      // The widget emits errors_count/actions_count even when capture is off;
      // the writer has no page to capture from. Everything else must match.
      const strip = (s: string): string =>
        s
          .split("\n")
          .filter(
            (line) =>
              !line.startsWith("errors_count:") &&
              !line.startsWith("actions_count:")
          )
          .join("\n");
      expect(strip(nodeMd)).toBe(strip(widgetMd));
    } finally {
      vi.useRealTimers();
    }
  });

  it("reportFix upserts fixes.yaml by issue id", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      project: "demo",
      reporter: { name: "fix-agent", kind: "agent" },
    });
    const issue = await session.reportIssue({ comment: "Broken thing" });
    await session.reportFix({
      issue: issue.id,
      status: "needs_info",
      note: "Cannot reproduce yet",
    });
    await session.reportFix({
      issue: issue.id,
      status: "fixed",
      commit: "a1b2c3d",
      note: "Null check added",
    });
    const fixes = parse(
      await textOf(memory.getFile(issue.sessionId, "fixes.yaml"))
    );
    expect(fixes.format_version).toBe("1.6");
    expect(fixes.fixed_by).toEqual({ name: "fix-agent", kind: "agent" });
    expect(fixes.items).toHaveLength(1);
    expect(fixes.items[0]).toMatchObject({
      issue: "01",
      status: "fixed",
      commit: "a1b2c3d",
      note: "Null check added",
    });
  });

  it("reportFix inherits checklist_item from the verdict link", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      checklist: {
        id: "c",
        title: "C",
        sections: [{ title: "", items: [{ id: "item-1", title: "Item one" }] }],
      },
    });
    const issue = await session.reportIssue({ comment: "Fails" });
    await session.setVerdict("item-1", "fail", { issue: issue.id });
    await session.reportFix({ issue: issue.id, status: "fixed" });
    const fixes = parse(
      await textOf(memory.getFile(issue.sessionId, "fixes.yaml"))
    );
    expect(fixes.items[0].checklist_item).toBe("item-1");
  });

  it("adopted session writes fixes.yaml into the existing folder and refuses issues", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      sessionId: "session-2026-08-09-ab12",
      reporter: { name: "fix-agent", kind: "agent" },
    });
    await session.reportFix({ issue: "02", status: "wontfix", note: "By design" });
    expect(
      memory.getFile("session-2026-08-09-ab12", "fixes.yaml")
    ).toBeDefined();
    await expect(session.reportIssue({ comment: "x" })).rejects.toThrow(
      /adopted session/
    );
  });

  it("LocalConnector writes the on-disk layout, rejecting traversal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sluglist-node-"));
    try {
      const session = await createSession({
        connectors: [new LocalConnector({ dir })],
        project: "demo",
      });
      const issue = await session.reportIssue({
        comment: "Disk issue",
        screenshot: PNG,
        attachments: [
          { name: "log.txt", mime: "text/plain", data: new TextEncoder().encode("line") },
        ],
      });
      expect(issue.report.ok).toBe(true);
      const base = join(dir, issue.sessionId);
      expect(existsSync(join(base, "session.yaml"))).toBe(true);
      expect(existsSync(join(base, "01-disk-issue.md"))).toBe(true);
      expect(existsSync(join(base, "01-disk-issue.png"))).toBe(true);
      expect(readFileSync(join(base, "01-disk-issue-att-01.txt"), "utf8")).toBe("line");

      expect(resolveArtifactTarget(dir, "session-x", "../escape.md")).toBeNull();
      expect(resolveArtifactTarget(dir, "../evil", "a.md")).toBeNull();
      expect(
        resolveArtifactTarget(dir, "session-2026-08-09-ab12", "01-x-frames/clip-01/01.png")
      ).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scrub option redacts page-derived surfaces and flags scrubbed", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({ connectors: [memory], scrub: true });
    const issue = await session.reportIssue({
      comment: "Bad page",
      meta: { url: "/user?email=jane@example.com" },
    });
    const md = await textOf(memory.getFile(issue.sessionId, issue.file));
    expect(md).not.toContain("jane@example.com");
    expect(md).toContain("scrubbed: true");
  });
});
