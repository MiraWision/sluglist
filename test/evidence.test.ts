import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildSessionYaml, FORMAT_VERSION } from "../src/artifacts";
import { normalizeChecklist, seedChecklistState } from "../src/checklist";
import { MemoryConnector } from "../src/connectors/memory";
import { createSession } from "../src/node/writer";
import type { ArtifactFile } from "../src/types";

/**
 * Format 1.6: verdict evidence (`checklist.items[].evidence`) and checklist
 * `intent`. Both additive — the central assertion of this file is that a
 * session which records neither is byte-identical to a pre-1.6 one.
 */

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function textOf(file: ArtifactFile | undefined): Promise<string> {
  if (!file) {
    throw new Error("file missing");
  }
  return await file.blob.text();
}

const CHECKLIST = {
  id: "release-1",
  title: "Release checks",
  sections: [
    {
      title: "Reports",
      items: [
        { id: "export-downloads-xlsx", title: "Export downloads an xlsx" },
        { id: "header-visible", title: "Header is visible" },
        { id: "unclear-item", title: "Something ambiguous" },
      ],
    },
  ],
};

async function sessionWithChecklist(memory: MemoryConnector) {
  return await createSession({
    connectors: [memory],
    project: "demo",
    baseUrl: "http://localhost:5000",
    checklist: CHECKLIST,
    reporter: { name: "qa-agent", kind: "agent" },
  });
}

describe("format 1.6 — verdict evidence", () => {
  it("pass with one screenshot + note writes the file and the evidence block", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    await session.setVerdict("export-downloads-xlsx", "pass", {
      evidence: {
        screenshots: [PNG],
        note: "Clicked Export on /reports — report_2026-08.xlsx downloaded, 247 rows",
      },
    });

    const sessionId = session.sessionId;
    const paths = memory.getFiles(sessionId).map((f) => f.path);
    expect(paths).toContain("ev-export-downloads-xlsx-01.png");

    const yaml = parse(await textOf(memory.getFile(sessionId, "session.yaml")));
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "export-downloads-xlsx"
    );
    expect(item.verdict).toBe("pass");
    expect(item.evidence).toEqual({
      screenshots: ["ev-export-downloads-xlsx-01.png"],
      note: "Clicked Export on /reports — report_2026-08.xlsx downloaded, 247 rows",
    });
    // A pass never carries an issue link, evidence or not.
    expect(item.issue).toBeNull();
  });

  it("numbers multiple evidence screenshots per item", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    await session.setVerdict("header-visible", "pass", {
      evidence: { screenshots: [PNG, PNG, PNG], note: "Header rendered" },
    });

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "header-visible"
    );
    expect(item.evidence.screenshots).toEqual([
      "ev-header-visible-01.png",
      "ev-header-visible-02.png",
      "ev-header-visible-03.png",
    ]);
    const paths = memory.getFiles(session.sessionId).map((f) => f.path);
    for (const p of item.evidence.screenshots) {
      expect(paths).toContain(p);
    }
  });

  it("pass without evidence emits no evidence key (pre-1.6 shape)", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    await session.setVerdict("header-visible", "pass");

    const raw = await textOf(memory.getFile(session.sessionId, "session.yaml"));
    expect(raw).not.toContain("evidence");
    const yaml = parse(raw);
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "header-visible"
    );
    expect(item.verdict).toBe("pass");
    expect("evidence" in item).toBe(false);
  });

  it("fail carries evidence on top of its linked issue", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    const issue = await session.reportIssue({
      comment: "Expected an Export button; the toolbar only has Print",
      screenshot: PNG,
      checklistItem: "export-downloads-xlsx",
    });
    await session.setVerdict("export-downloads-xlsx", "fail", {
      issue: issue.id,
      evidence: {
        screenshots: [PNG],
        note: "Toolbar after full reload — still no Export control",
      },
    });

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "export-downloads-xlsx"
    );
    // The issue link remains the primary evidence; the block is supplementary.
    expect(item.issue).toBe("01");
    expect(item.evidence.screenshots).toEqual([
      "ev-export-downloads-xlsx-01.png",
    ]);
    expect(item.evidence.note).toContain("still no Export control");
  });

  it("not-tested items stay verdict-null with no evidence", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    await session.setVerdict("header-visible", "pass", {
      evidence: { screenshots: [PNG], note: "Header rendered" },
    });

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "unclear-item"
    );
    expect(item.verdict).toBeNull();
    expect("evidence" in item).toBe(false);
  });

  it("clips a note to 500 chars", async () => {
    const memory = new MemoryConnector();
    const session = await sessionWithChecklist(memory);

    await session.setVerdict("header-visible", "pass", {
      evidence: { screenshots: [PNG], note: "x".repeat(900) },
    });

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "header-visible"
    );
    expect(item.evidence.note).toHaveLength(500);
  });

  it("scrubs the note when the session scrubs", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      checklist: CHECKLIST,
      scrub: true,
    });

    await session.setVerdict("header-visible", "pass", {
      evidence: {
        screenshots: [PNG],
        note: "Toast read: sent to ada@example.com",
      },
    });

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    const item = yaml.checklist.items.find(
      (i: { id: string }) => i.id === "header-visible"
    );
    expect(item.evidence.note).not.toContain("ada@example.com");
  });

  it("accepts a file path as a screenshot source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sluglist-ev-"));
    try {
      const file = join(dir, "shot.png");
      writeFileSync(file, PNG);
      const memory = new MemoryConnector();
      const session = await sessionWithChecklist(memory);

      await session.setVerdict("header-visible", "pass", {
        evidence: { screenshots: [file], note: "Read from disk" },
      });

      const written = memory.getFile(
        session.sessionId,
        "ev-header-visible-01.png"
      );
      expect(written).toBeDefined();
      expect(await written?.blob.arrayBuffer()).toEqual(PNG.buffer);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("note-only evidence emits an empty screenshots list", () => {
    const def = normalizeChecklist(CHECKLIST);
    if (!def) {
      throw new Error("checklist did not normalize");
    }
    const state = seedChecklistState(def);
    state.items[0].verdict = "pass";
    state.items[0].evidence = { screenshots: [], note: "Counter went 4 → 5" };
    const yaml = buildSessionYaml({
      project: "demo",
      session_id: "session-2026-08-11-aaaa",
      created_at: "2026-08-11T10:00:00Z",
      base_url: "http://localhost:5000",
      browser: "Node 22",
      os: "macOS",
      viewport: "1280x800",
      device_pixel_ratio: 1,
      checklist: state,
      issues: [],
    });
    expect(yaml).toContain("screenshots: []");
    const parsed = parse(yaml);
    expect(parsed.checklist.items[0].evidence).toEqual({
      screenshots: [],
      note: "Counter went 4 → 5",
    });
  });
});

describe("format 1.6 — checklist intent", () => {
  it("carries a valid intent into session.yaml", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      checklist: { ...CHECKLIST, intent: "smoke" },
    });
    await session.setVerdict("header-visible", "pass");

    const yaml = parse(
      await textOf(memory.getFile(session.sessionId, "session.yaml"))
    );
    expect(yaml.checklist.intent).toBe("smoke");
  });

  it("omits intent entirely when the checklist declares none", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      checklist: CHECKLIST,
    });
    await session.setVerdict("header-visible", "pass");

    const raw = await textOf(memory.getFile(session.sessionId, "session.yaml"));
    expect(raw).not.toContain("intent");
  });

  it("drops a structurally invalid intent but keeps the checklist", () => {
    const def = normalizeChecklist({ ...CHECKLIST, intent: "not a slug!" });
    expect(def).not.toBeNull();
    expect(def?.intent).toBeUndefined();
    expect(def?.sections[0].items).toHaveLength(3);
  });

  it("accepts an unknown intent verbatim (vocabulary is not enforced)", () => {
    const def = normalizeChecklist({ ...CHECKLIST, intent: "some-future-mode" });
    expect(def?.intent).toBe("some-future-mode");
  });
});

describe("format 1.6 — backward compatibility", () => {
  it("declares 1.6", () => {
    expect(FORMAT_VERSION).toBe("1.6");
  });

  it("a session with neither evidence nor intent is byte-identical to 1.5", async () => {
    const memory = new MemoryConnector();
    const session = await createSession({
      connectors: [memory],
      project: "demo",
      checklist: CHECKLIST,
    });
    await session.setVerdict("header-visible", "pass");
    const raw = await textOf(memory.getFile(session.sessionId, "session.yaml"));
    // Only the version line may differ from what 1.5 would have produced.
    const downgraded = raw.replace(
      'format_version: "1.6"',
      'format_version: "1.5"'
    );
    expect(downgraded).not.toContain("evidence");
    expect(downgraded).not.toContain("intent");
    expect(downgraded.split("\n")[0]).toBe('format_version: "1.5"');
  });
});
