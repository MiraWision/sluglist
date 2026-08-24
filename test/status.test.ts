import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatStatus,
  readStatus,
  statusJson,
  type StatusResult,
} from "../src/cli/status";
import { LocalConnector } from "../src/node/local";
import { createSession } from "../src/node/writer";

/**
 * `sluglist status` is what makes the loop autonomous: the agent asks the
 * artifacts whether another round is worth running instead of trusting its own
 * memory. So the properties under test are the decisions — green, continue,
 * stalled, blocked — and the chaining that makes "round 2" mean anything.
 *
 * Sessions are written with the real `sluglist/node` writer, not hand-authored
 * YAML: a status report that only works against fixtures we wrote ourselves
 * would prove nothing.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sluglist-status-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ITEMS = [
  { id: "export-visible", title: "The Export button is on the Reports page" },
  { id: "csv-columns", title: "The CSV has all the expected columns" },
];

function checklist(overrides: Record<string, unknown> = {}) {
  return {
    id: "release-1",
    title: "Release 1",
    intent: "branch",
    sections: [{ title: "Reports", items: ITEMS }],
    ...overrides,
  };
}

async function session(overrides: Record<string, unknown> = {}) {
  return await createSession({
    connectors: [new LocalConnector({ dir })],
    project: "demo",
    reporter: { name: "qa-agent", kind: "agent" },
    ...overrides,
  });
}

/** One round: fail `csv-columns` with an issue, pass the rest. */
async function failingRound(list: Record<string, unknown>) {
  const run = await session({ checklist: list });
  const issue = await run.reportIssue({
    comment: "The CSV is missing the total column",
    checklistItem: "csv-columns",
  });
  await run.setVerdict("csv-columns", "fail", { issue: issue.id });
  for (const item of (list.sections as { items: { id: string }[] }[])[0].items) {
    if (item.id !== "csv-columns") {
      await run.setVerdict(item.id, "pass");
    }
  }
  return run;
}

const retest = checklist({
  id: "release-1-retest-1",
  intent: "re-test",
  retest_of: "release-1",
  sections: [{ title: "Reports", items: [ITEMS[1]] }],
});

function chain(result: StatusResult) {
  return result.chains[result.chains.length - 1];
}

describe("readStatus — a single round", () => {
  it("reports empty for a folder with no sessions", async () => {
    const result = await readStatus({ dir });
    expect(result.verdict).toBe("empty");
    expect(result.chains).toEqual([]);
  });

  it("reports empty for a folder that does not exist", async () => {
    const result = await readStatus({ dir: join(dir, "nope") });
    expect(result.verdict).toBe("empty");
  });

  it("is green when every item passed", async () => {
    const run = await session({ checklist: checklist() });
    await run.setVerdict("export-visible", "pass");
    await run.setVerdict("csv-columns", "pass");

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("green");
    expect(chain(result).open).toEqual([]);
    expect(chain(result).rounds).toHaveLength(1);
    expect(chain(result).rounds[0].counts).toEqual({
      pass: 2,
      fail: 0,
      notTested: 0,
      total: 2,
    });
  });

  it("counts an unchecked item as not tested without failing the loop", async () => {
    const run = await session({ checklist: checklist() });
    await run.setVerdict("export-visible", "pass");

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("green");
    expect(chain(result).notTested).toEqual([
      { id: "csv-columns", title: ITEMS[1].title },
    ]);
  });

  it("says continue, with the failing item actionable, before any fix pass", async () => {
    await failingRound(checklist());

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("continue");
    expect(chain(result).open).toEqual([
      {
        id: "csv-columns",
        title: ITEMS[1].title,
        failedRounds: 1,
        issue: "01",
        state: "actionable",
        fixStatus: null,
        note: null,
      },
    ]);
  });

  it("says continue, awaiting re-test, once the fix is recorded", async () => {
    const run = await failingRound(checklist());
    await run.reportFix({
      issue: "01",
      status: "fixed",
      note: "Total column added to the export query",
    });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("continue");
    expect(chain(result).open[0].state).toBe("awaiting-retest");
    expect(result.reason).toContain("re-test");
    expect(chain(result).rounds[0].fixes).toEqual({
      fixed: 1,
      wontfix: 0,
      needsInfo: 0,
    });
  });

  it("is blocked when the only failure is wontfix", async () => {
    const run = await failingRound(checklist());
    await run.reportFix({
      issue: "01",
      status: "wontfix",
      note: "The column is intentionally excluded",
    });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("blocked");
    expect(chain(result).open[0]).toMatchObject({
      state: "blocked",
      fixStatus: "wontfix",
      note: "The column is intentionally excluded",
    });
  });

  it("is blocked on needs_info too — the loop cannot answer its own question", async () => {
    const run = await failingRound(checklist());
    await run.reportFix({
      issue: "01",
      status: "needs_info",
      note: "Which columns are expected?",
    });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("blocked");
  });
});

describe("readStatus — chained rounds", () => {
  it("chains a re-test round through retest_of and keeps them in order", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });
    const second = await session({ checklist: retest });
    await second.setVerdict("csv-columns", "pass");

    const result = await readStatus({ dir });
    const only = chain(result);
    expect(result.chains).toHaveLength(1);
    expect(only.key).toBe("release-1");
    expect(only.rounds.map((r) => r.checklistId)).toEqual([
      "release-1",
      "release-1-retest-1",
    ]);
    expect(only.rounds[1].retestOf).toBe("release-1");
    expect(result.verdict).toBe("green");
    expect(result.reason).toContain("round 2");
  });

  it("stalls when the same item fails again after a fix pass", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });

    const second = await session({ checklist: retest });
    const issue = await second.reportIssue({
      comment: "Still missing the total column",
      checklistItem: "csv-columns",
    });
    await second.setVerdict("csv-columns", "fail", { issue: issue.id });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("stalled");
    expect(chain(result).open[0]).toMatchObject({
      id: "csv-columns",
      failedRounds: 2,
      state: "actionable",
    });
    expect(result.reason).toContain("2 or more rounds");
  });

  it("keeps a round-1 coverage gap visible after a re-test round", async () => {
    // The re-test list only carries the fixed items, so an item nobody ever
    // checked would vanish if the latest round were read on its own.
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });
    const second = await session({ checklist: retest });
    await second.setVerdict("csv-columns", "pass");

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("green");
    expect(chain(result).notTested).toEqual([]);

    // Same chain, but round 1 left `export-visible` unchecked.
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), "sluglist-status-"));
    const third = await session({ checklist: checklist() });
    const issue = await third.reportIssue({
      comment: "The CSV is missing the total column",
      checklistItem: "csv-columns",
    });
    await third.setVerdict("csv-columns", "fail", { issue: issue.id });
    await third.reportFix({ issue: "01", status: "fixed" });
    const fourth = await session({ checklist: retest });
    await fourth.setVerdict("csv-columns", "pass");

    const after = await readStatus({ dir });
    expect(after.verdict).toBe("green");
    expect(after.chains[0].notTested).toEqual([
      { id: "export-visible", title: ITEMS[0].title },
    ]);
  });

  it("still reports a wontfix item the re-test round never re-listed", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({
      issue: "01",
      status: "wontfix",
      note: "Excluded on purpose",
    });
    // A re-test list carries only the fixed items, so this one is absent —
    // which must not read as "nothing is failing any more".
    const second = await session({
      checklist: checklist({
        id: "release-1-retest-1",
        intent: "re-test",
        retest_of: "release-1",
        sections: [{ title: "Reports", items: [ITEMS[0]] }],
      }),
    });
    await second.setVerdict("export-visible", "pass");

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("blocked");
    expect(chain(result).open).toHaveLength(1);
    expect(chain(result).open[0]).toMatchObject({
      id: "csv-columns",
      state: "blocked",
      fixStatus: "wontfix",
    });
  });

  it("chains a pre-1.7 session by its <id>-retest-N name alone", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed" });
    // No retest_of: what a session written before format 1.7 looks like.
    const second = await session({
      checklist: checklist({
        id: "release-1-retest-1",
        intent: "re-test",
        sections: [{ title: "Reports", items: [ITEMS[1]] }],
      }),
    });
    await second.setVerdict("csv-columns", "pass");

    const result = await readStatus({ dir });
    expect(result.chains).toHaveLength(1);
    expect(chain(result).rounds).toHaveLength(2);
    expect(result.verdict).toBe("green");
  });

  it("keeps unrelated checklists in separate chains and shows the newest", async () => {
    // Two chains a week apart: `created_at` is what orders them, and only a
    // fake clock makes that testable — the writer stamps the real one.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-09T10:00:00Z"));
      const first = await session({ checklist: checklist() });
      await first.setVerdict("export-visible", "pass");
      await first.setVerdict("csv-columns", "pass");
      vi.setSystemTime(new Date("2026-08-16T10:00:00Z"));
      await failingRound(checklist({ id: "release-2", title: "Release 2" }));
    } finally {
      vi.useRealTimers();
    }

    const result = await readStatus({ dir });
    expect(result.chains).toHaveLength(1);
    expect(result.older).toBe(1);
    expect(chain(result).key).toBe("release-2");
    expect(result.verdict).toBe("continue");

    const all = await readStatus({ dir, all: true });
    expect(all.chains.map((c) => c.key)).toEqual(["release-1", "release-2"]);
    // The verdict still describes the loop you are in, not the archive.
    expect(all.verdict).toBe("continue");
  });

  it("restricts the report to the chain containing a given session", async () => {
    const first = await session({ checklist: checklist() });
    await first.setVerdict("export-visible", "pass");
    await first.setVerdict("csv-columns", "pass");
    await failingRound(checklist({ id: "release-2", title: "Release 2" }));

    const result = await readStatus({ dir, target: first.sessionId });
    expect(result.chains).toHaveLength(1);
    expect(chain(result).key).toBe("release-1");
    expect(result.verdict).toBe("green");
  });
});

describe("readStatus — sessions with no checklist", () => {
  it("treats an unfixed issue as open work", async () => {
    const run = await session();
    await run.reportIssue({ comment: "Save does nothing" });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("continue");
    expect(chain(result).open).toEqual([
      {
        id: "issue 01",
        title: "save does nothing",
        failedRounds: 1,
        issue: "01",
        state: "actionable",
        fixStatus: null,
        note: null,
      },
    ]);
  });

  it("is green once every issue has a fix record", async () => {
    const run = await session();
    await run.reportIssue({ comment: "Save does nothing" });
    await run.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("green");
    expect(chain(result).open).toEqual([]);
  });

  it("is blocked when the only issue needs information", async () => {
    const run = await session();
    await run.reportIssue({ comment: "Save does nothing" });
    await run.reportFix({
      issue: "01",
      status: "needs_info",
      note: "Which account were you on?",
    });

    const result = await readStatus({ dir });
    expect(result.verdict).toBe("blocked");
    expect(chain(result).open[0].fixStatus).toBe("needs_info");
  });
});

describe("formatStatus", () => {
  it("prints one line per round and ends with the verdict", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });
    const second = await session({ checklist: retest });
    const issue = await second.reportIssue({
      comment: "Still missing the total column",
      checklistItem: "csv-columns",
    });
    await second.setVerdict("csv-columns", "fail", { issue: issue.id });

    const text = formatStatus(await readStatus({ dir })).join("\n");

    expect(text).toContain("release-1 · branch · 2 items");
    expect(text).toContain("1 pass · 1 fail · 0 not tested");
    expect(text).toContain("1 fixed");
    expect(text).toContain("still failing (1)");
    expect(text).toContain("csv-columns — for the next fix pass · failed in 2 rounds");
    expect(text).toContain(`"${ITEMS[1].title}"`);
    expect(text.trimEnd().split("\n").pop()).toMatch(/^verdict: stalled — /);
  });

  it("says so plainly when there is nothing on disk", async () => {
    const text = formatStatus(await readStatus({ dir })).join("\n");
    expect(text).toContain("no sessions yet");
    expect(text).toContain("verdict: empty");
  });

  it("names the blocked items with the reason the fix pass gave", async () => {
    const run = await failingRound(checklist());
    await run.reportFix({
      issue: "01",
      status: "wontfix",
      note: "Excluded on purpose",
    });

    const text = formatStatus(await readStatus({ dir })).join("\n");
    expect(text).toContain("blocked (1)");
    expect(text).toContain("csv-columns — wontfix: Excluded on purpose");
  });
});

describe("statusJson", () => {
  it("carries the verdict, the rounds and the open items", async () => {
    const first = await failingRound(checklist());
    await first.reportFix({ issue: "01", status: "fixed", commit: "a1b2c3d" });
    const second = await session({ checklist: retest });
    await second.setVerdict("csv-columns", "pass");

    const json = statusJson(await readStatus({ dir })) as {
      verdict: string;
      older_chains: number;
      chains: {
        key: string;
        intent: string;
        rounds: {
          round: number;
          checklist: string;
          retest_of: string | null;
          fixes: { fixed: number } | null;
        }[];
        open: unknown[];
        not_tested: unknown[];
      }[];
    };

    expect(json.verdict).toBe("green");
    expect(json.older_chains).toBe(0);
    expect(json.chains).toHaveLength(1);
    expect(json.chains[0].intent).toBe("branch");
    expect(json.chains[0].rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(json.chains[0].rounds[0].fixes).toEqual({
      fixed: 1,
      wontfix: 0,
      needs_info: 0,
    });
    expect(json.chains[0].rounds[1].retest_of).toBe("release-1");
    expect(json.chains[0].open).toEqual([]);
    expect(json.chains[0].not_tested).toEqual([]);
  });
});
