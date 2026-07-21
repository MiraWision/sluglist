import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile, FeedbackConnector } from "../src/types";
import { createFeedbackWidget } from "../src/widget";

const SESSION_ID_FORMAT = /^session-\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/;

const testEnvironment = () => ({
  baseUrl: "https://dev.trugenix.example",
  url: "/dashboard/animals",
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

function makeWidget(connectors: FeedbackConnector[]) {
  return createFeedbackWidget(
    { project: "trugenix", connectors },
    { storage: createMemoryStorage(), environment: testEnvironment }
  );
}

describe("captureIssue", () => {
  it("numbers issues monotonically and upserts session.yaml", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);

    const first = await widget.captureIssue({
      comment: "First problem here",
      mode: "fullpage",
    });
    const second = await widget.captureIssue({
      comment: "Second problem there",
      mode: "element",
      selector: "header > nav .logo",
      screenshot: new Blob([new Uint8Array([137, 80, 78, 71])], {
        type: "image/png",
      }),
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    await first?.delivered;
    await second?.delivered;

    expect(first?.sessionId).toBe(second?.sessionId);
    expect(first?.issueId).toBe("01");
    expect(second?.issueId).toBe("02");

    const sessionId = first?.sessionId as string;
    expect(sessionId).toMatch(SESSION_ID_FORMAT);

    const files = memory.getFiles(sessionId).map((f) => f.path);
    expect(files).toContain("01-first-problem-here.md");
    expect(files).toContain("02-second-problem-there.md");
    expect(files).toContain("02-second-problem-there.png");
    expect(files).toContain("session.yaml");
    // session.yaml is upserted, not duplicated.
    expect(files.filter((p) => p === "session.yaml")).toHaveLength(1);

    const yaml = memory.getFile(sessionId, "session.yaml");
    const parsed = parse(await (yaml as ArtifactFile).blob.text());
    expect(parsed.project).toBe("trugenix");
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.issues[0].id).toBe("01");
    expect(parsed.issues[0].screenshot).toBeNull();
    expect(parsed.issues[1].id).toBe("02");
    expect(parsed.issues[1].screenshot).toBe("02-second-problem-there.png");
    expect(parsed.issues[1].selector).toBe("header > nav .logo");
  });

  it("one failing connector does not affect the others", async () => {
    const memory = new MemoryConnector();
    const broken: FeedbackConnector = {
      id: "broken",
      put: () => Promise.reject(new Error("storage down")),
    };
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const widget = makeWidget([broken, memory]);
    const result = await widget.captureIssue({
      comment: "Still delivered",
      mode: "fullpage",
    });
    await result?.delivered;

    const sessionId = result?.sessionId as string;
    expect(memory.getFiles(sessionId).map((f) => f.path)).toContain(
      "session.yaml"
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"broken"'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("retries transient connector failures", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const flaky: FeedbackConnector = {
        id: "flaky",
        put: () => {
          attempts++;
          if (attempts <= 2) {
            return Promise.reject(new Error("transient"));
          }
          return Promise.resolve();
        },
      };
      const widget = makeWidget([flaky]);
      const result = await widget.captureIssue({
        comment: "Retry me",
        mode: "fullpage",
      });
      const delivered = result?.delivered;
      await vi.runAllTimersAsync();
      const report = await delivered;
      expect(report?.ok).toBe(true);
      // First file needed 3 attempts (2 retries), the second file succeeds first try.
      expect(attempts).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("numbers multiple screenshots and reports failed deliveries with redeliver", async () => {
    const memory = new MemoryConnector();
    let failing = true;
    const flaky: FeedbackConnector = {
      id: "flaky",
      put: (sessionId, file) =>
        failing
          ? Promise.reject(new Error("storage down"))
          : memory.put(sessionId, file),
    };
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      const widget = makeWidget([flaky]);
      const png = (n: number) =>
        new Blob([new Uint8Array([137, 80, 78, 71, n])], { type: "image/png" });
      const result = await widget.captureIssue({
        comment: "Multi shot issue",
        mode: "area",
        screenshots: [png(1), png(2), png(3)],
      });
      const deliveredPromise = result?.delivered;
      await vi.runAllTimersAsync();
      const report = await deliveredPromise;
      expect(report?.ok).toBe(false);
      expect(report?.failures[0]?.connectorId).toBe("flaky");

      const paths = result?.files.map((f) => f.path);
      expect(paths).toEqual([
        "01-multi-shot-issue.png",
        "01-multi-shot-issue-2.png",
        "01-multi-shot-issue-3.png",
        "01-multi-shot-issue.md",
        "session.yaml",
      ]);

      failing = false;
      const retryPromise = widget.redeliver({
        sessionId: result?.sessionId as string,
        files: result?.files ?? [],
      });
      await vi.runAllTimersAsync();
      const retryReport = await retryPromise;
      expect(retryReport.ok).toBe(true);
      expect(
        memory.getFiles(result?.sessionId as string).map((f) => f.path)
      ).toContain("01-multi-shot-issue-3.png");
    } finally {
      vi.useRealTimers();
      errorSpy.mockRestore();
    }
  });

  it("returns null and captures nothing when disabled", async () => {
    const memory = new MemoryConnector();
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const widget = createFeedbackWidget(
      { project: "trugenix", connectors: [memory], enabled: false },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );
    const result = await widget.captureIssue({
      comment: "Should be ignored",
      mode: "fullpage",
    });
    expect(result).toBeNull();
    expect(memory.getSessionIds()).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("keeps the session across widget instances via storage", async () => {
    const storage = createMemoryStorage();
    const memory = new MemoryConnector();
    const options = { storage, environment: testEnvironment };
    const config = { project: "trugenix", connectors: [memory] };

    const first = createFeedbackWidget(config, options);
    const a = await first.captureIssue({ comment: "One", mode: "fullpage" });
    await a?.delivered;

    // Simulate a page navigation: new widget instance, same sessionStorage.
    const second = createFeedbackWidget(config, options);
    const b = await second.captureIssue({ comment: "Two", mode: "fullpage" });
    await b?.delivered;

    expect(b?.sessionId).toBe(a?.sessionId);
    expect(b?.issueId).toBe("02");
    expect(second.getIssueCount()).toBe(2);
  });
});
