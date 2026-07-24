import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Checklist } from "../src/checklist";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile, FeedbackConnector } from "../src/types";
import { createFeedbackWidget } from "../src/widget";

/**
 * Phase 7 end-to-end: drive a full checklist-v2 session through the real core
 * and write the resulting artifacts to `evidence/checklist-v2-e2e/` so they can
 * be inspected outside the test (RUN_EVIDENCE.md links them). This exercises the
 * whole cycle a client walks: check items off, flag a problem with two separate
 * recording clips, and leave one item untested.
 */

const evidenceDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "evidence",
  "checklist-v2-e2e"
);

const testEnvironment = () => ({
  baseUrl: "https://beta.trugenix.example",
  url: "/assessments/9f2c-3a71-uuid",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 138",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

// What the sluglist-checklist generator would emit for a branch with a static
// route (/reports), a dynamic route (/assessments/:id → hint + url_match), and
// a mixed case (list url + detail url_match). No fabricated ids anywhere.
const checklist: Checklist = {
  id: "beta-acceptance-2026-07",
  title: "Beta acceptance — assessments release",
  description: "Walk each item and check it off. Flag anything that looks wrong.",
  sections: [
    {
      title: "Reports",
      items: [
        {
          id: "export-csv",
          title: "On Reports, Export downloads a CSV with all columns",
          url: "/reports",
          hint: "Click Export — a file should download",
        },
      ],
    },
    {
      title: "Assessments",
      items: [
        {
          id: "assessment-header",
          title: "Opening any assessment shows the new summary header",
          hint: "Open the dashboard and pick any assessment",
          url: "/dashboard",
          url_match: "/assessments/*",
        },
        {
          id: "assessment-score",
          title: "The score badge renders on an assessment",
          hint: "Any assessment detail page",
          url_match: "/assessments/*",
        },
      ],
    },
  ],
};

const png = (marker: number) =>
  new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, marker])], {
    type: "image/png",
  });

function makeWidget(connectors: FeedbackConnector[]) {
  return createFeedbackWidget(
    { project: "trugenix", connectors, checklist },
    { storage: createMemoryStorage(), environment: testEnvironment }
  );
}

async function writeEvidence(memory: MemoryConnector, sessionId: string) {
  rmSync(evidenceDir, { recursive: true, force: true });
  for (const file of memory.getFiles(sessionId)) {
    const full = join(evidenceDir, sessionId, file.path);
    mkdirSync(dirname(full), { recursive: true });
    const buf = Buffer.from(await file.blob.arrayBuffer());
    writeFileSync(full, buf);
  }
}

describe("Phase 7 — checklist v2 end-to-end", () => {
  it("runs the full v2 flow and emits correct artifacts", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    await widget.whenChecklistReady();

    // 1) Check a clean item off (row click → pass).
    widget.recordVerdict("export-csv", "pass");

    // 2) Flag a problem on an assessment item with TWO separate recording clips
    //    (two Record→Stop cycles), then link the fail to the issue.
    const flagged = await widget.captureIssue({
      comment: "The summary header overlaps the score badge on narrow screens",
      mode: "fullpage",
      screenshot: png(0),
      checklistItem: "assessment-header",
      recording: true,
      clips: [
        [png(1), png(2), png(3)], // clip-01: the happy path
        [png(4), png(5)], // clip-02: the broken repro
      ],
    });
    await flagged?.delivered;
    widget.recordVerdict("assessment-header", "fail", flagged?.issueId ?? null);

    // 3) Leave "assessment-score" untested (verdict stays null).
    await widget
      .captureIssue({ comment: "flush", mode: "fullpage" })
      .then((r) => r?.delivered);

    const sessionId = widget.getSession()?.session_id as string;
    // Only (re)write the on-disk evidence snapshot when explicitly asked, so a
    // normal `vitest run` never dirties the tracked evidence/ folder.
    // Regenerate with: SLUGLIST_EVIDENCE=1 npx vitest run test/e2e-checklist-v2.test.ts
    if (process.env.SLUGLIST_EVIDENCE) {
      await writeEvidence(memory, sessionId);
    }

    // --- session.yaml coverage map ---
    const session = parse(
      await (memory.getFile(sessionId, "session.yaml") as ArtifactFile).blob.text()
    );
    expect(session.format_version).toBe("1.2");
    const items: Array<{ id: string; verdict: string | null; issue: string | null }> =
      session.checklist.items;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["export-csv"].verdict).toBe("pass");
    expect(byId["assessment-header"].verdict).toBe("fail");
    expect(byId["assessment-header"].issue).toBe(flagged?.issueId);
    expect(byId["assessment-score"].verdict).toBeNull();

    // --- the flagged issue file: clips + checklist_item ---
    const issueMd = memory
      .getFiles(sessionId)
      .find(
        (f) => f.path.endsWith(".md") && f.path.startsWith(flagged?.issueId ?? "")
      ) as ArtifactFile;
    const fm = parse((await issueMd.blob.text()).split("---\n")[1]);
    expect(fm.checklist_item).toBe("assessment-header");
    expect(fm.recording).toBe(true);
    expect(fm.frames_count).toBe(5);
    expect(fm.clips).toEqual([
      { id: "clip-01", frames: 3 },
      { id: "clip-02", frames: 2 },
    ]);

    // --- clip subfolders on disk, per-clip numbering ---
    const paths = memory.getFiles(sessionId).map((f) => f.path);
    const dir = fm.frames_dir as string;
    expect(paths).toContain(`${dir}/clip-01/03.png`);
    expect(paths).toContain(`${dir}/clip-02/02.png`);
    expect(paths).not.toContain(`${dir}/clip-01/04.png`); // no cross-clip flatten
  });
});
