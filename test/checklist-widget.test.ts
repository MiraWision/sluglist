import { afterEach, describe, expect, it, vi } from "vitest";
import type { Checklist } from "../src/checklist";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile, FeedbackConnector } from "../src/types";
import { createFeedbackWidget } from "../src/widget";
import { parse } from "yaml";

const testEnvironment = () => ({
  baseUrl: "https://dev.trugenix.example",
  url: "/reports",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 138",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "dark",
  reducedMotion: false,
});

const checklist: Checklist = {
  id: "export-release",
  title: "Export release",
  sections: [
    {
      title: "Export",
      items: [
        { id: "button-visible", title: "Export button is visible" },
        { id: "csv-downloads", title: "CSV downloads" },
      ],
    },
    {
      title: "Notifications",
      items: [{ id: "email-sent", title: "Email is sent" }],
    },
  ],
};

function makeWidget(connectors: FeedbackConnector[], withChecklist = true) {
  return createFeedbackWidget(
    {
      project: "trugenix",
      connectors,
      ...(withChecklist ? { checklist } : {}),
    },
    { storage: createMemoryStorage(), environment: testEnvironment }
  );
}

async function sessionYaml(memory: MemoryConnector, sessionId: string) {
  const file = memory.getFile(sessionId, "session.yaml") as ArtifactFile;
  return parse(await file.blob.text());
}

describe("checklist verdicts (put-per-verdict)", () => {
  it("resolves an inline checklist and seeds all items null", async () => {
    const widget = makeWidget([new MemoryConnector()]);
    const def = await widget.whenChecklistReady();
    expect(def?.id).toBe("export-release");
    // No session yet → no state.
    expect(widget.getChecklistState()).toBeNull();
  });

  it("records pass/skip verdicts and upserts session.yaml", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);

    widget.recordVerdict("button-visible", "pass");
    widget.recordVerdict("email-sent", "skip");
    // Flush background delivery.
    await widget.captureIssue({ comment: "unrelated", mode: "fullpage" }).then((r) => r?.delivered);

    const state = widget.getChecklistState();
    expect(state?.items.find((i) => i.id === "button-visible")?.verdict).toBe("pass");
    expect(state?.items.find((i) => i.id === "email-sent")?.verdict).toBe("skip");
    expect(state?.items.find((i) => i.id === "csv-downloads")?.verdict).toBeNull();

    const sessionId = widget.getSession()?.session_id as string;
    const yaml = await sessionYaml(memory, sessionId);
    expect(yaml.format_version).toBe("1.2");
    expect(yaml.checklist.id).toBe("export-release");
    const csv = yaml.checklist.items.find((i: { id: string }) => i.id === "csv-downloads");
    expect(csv.verdict).toBeNull();
    const passed = yaml.checklist.items.find((i: { id: string }) => i.id === "button-visible");
    expect(passed.verdict).toBe("pass");
    expect(passed.ts).toBeTruthy();
  });

  it("links a fail verdict to its issue and stamps checklist_item on the issue", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);

    const result = await widget.captureIssue({
      comment: "CSV is missing the total column",
      mode: "fullpage",
      checklistItem: "csv-downloads",
    });
    await result?.delivered;
    widget.recordVerdict("csv-downloads", "fail", result?.issueId ?? null);
    await widget.captureIssue({ comment: "flush", mode: "fullpage" }).then((r) => r?.delivered);

    const item = widget
      .getChecklistState()
      ?.items.find((i) => i.id === "csv-downloads");
    expect(item?.verdict).toBe("fail");
    expect(item?.issue).toBe(result?.issueId);

    // The issue file carries checklist_item.
    const sessionId = result?.sessionId as string;
    const md = memory
      .getFiles(sessionId)
      .find((f) => f.path.endsWith(".md") && f.path.startsWith(result?.issueId ?? "")) as ArtifactFile;
    const fm = parse((await md.blob.text()).split("---\n")[1]);
    expect(fm.checklist_item).toBe("csv-downloads");
  });

  it("changing fail → pass drops the issue link", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);

    const result = await widget.captureIssue({
      comment: "broken",
      mode: "fullpage",
      checklistItem: "csv-downloads",
    });
    widget.recordVerdict("csv-downloads", "fail", result?.issueId ?? null);
    widget.recordVerdict("csv-downloads", "pass");
    await widget.captureIssue({ comment: "flush", mode: "fullpage" }).then((r) => r?.delivered);

    const item = widget.getChecklistState()?.items.find((i) => i.id === "csv-downloads");
    expect(item?.verdict).toBe("pass");
    expect(item?.issue).toBeNull();
  });

  it("clearVerdict resets the verdict to null but preserves the issue link", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);

    const result = await widget.captureIssue({
      comment: "broken",
      mode: "fullpage",
      checklistItem: "csv-downloads",
    });
    widget.recordVerdict("csv-downloads", "fail", result?.issueId ?? null);
    // The client checked it, flagged it, then withdrew their verdict.
    widget.clearVerdict("csv-downloads");
    await widget.captureIssue({ comment: "flush", mode: "fullpage" }).then((r) => r?.delivered);

    const item = widget.getChecklistState()?.items.find((i) => i.id === "csv-downloads");
    expect(item?.verdict).toBeNull();
    // The delivered issue is not retractable — the link stays for the fix-skill.
    expect(item?.issue).toBe(result?.issueId);
  });

  it("no checklist configured → no checklist block, verdicts are a no-op", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory], false);
    expect(await widget.whenChecklistReady()).toBeNull();
    expect(widget.getChecklist()).toBeNull();
    widget.recordVerdict("whatever", "pass"); // no-op, no throw

    await widget.captureIssue({ comment: "plain issue", mode: "fullpage" }).then((r) => r?.delivered);
    const sessionId = widget.getSession()?.session_id as string;
    const yaml = await sessionYaml(memory, sessionId);
    expect("checklist" in yaml).toBe(false);
    expect(yaml.format_version).toBe("1.2");
  });
});

describe("checklist from a URL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function widgetWithUrl(url: string, connectors: FeedbackConnector[]) {
    return createFeedbackWidget(
      { project: "trugenix", connectors, checklist: url },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );
  }

  it("fetches + validates a checklist JSON at init", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => checklist,
      }))
    );
    const widget = widgetWithUrl("/checklist.json", [new MemoryConnector()]);
    const def = await widget.whenChecklistReady();
    expect(def?.id).toBe("export-release");
    expect(def?.sections).toHaveLength(2);
  });

  it("a 404 warns and skips the checklist; capture still works", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    );
    const memory = new MemoryConnector();
    const widget = widgetWithUrl("/missing.json", [memory]);
    expect(await widget.whenChecklistReady()).toBeNull();
    expect(warn).toHaveBeenCalled();

    // Capture is unaffected by the failed checklist load.
    const result = await widget.captureIssue({ comment: "still works", mode: "fullpage" });
    await result?.delivered;
    const sessionId = result?.sessionId as string;
    const yaml = await sessionYaml(memory, sessionId);
    expect("checklist" in yaml).toBe(false);
    expect(yaml.issues).toHaveLength(1);
    warn.mockRestore();
  });
});
