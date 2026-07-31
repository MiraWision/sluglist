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

  it("threads identity + custom through to session.yaml and the issue file", async () => {
    const memory = new MemoryConnector();
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const widget = createFeedbackWidget(
      {
        project: "trugenix",
        connectors: [memory],
        identity: { userId: "u_18293", email: "user@example.com", name: "Anna K." },
        custom: {
          plan: "pro",
          appVersion: "2.4.1",
          // dropped: nested object
          meta: { a: 1 } as unknown as string,
        },
      },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );
    const result = await widget.captureIssue({
      comment: "Beta report",
      mode: "fullpage",
    });
    await result?.delivered;
    const sessionId = result?.sessionId as string;

    const session = parse(
      await (memory.getFile(sessionId, "session.yaml") as ArtifactFile).blob.text()
    );
    expect(session.reporter).toEqual({
      user_id: "u_18293",
      email: "user@example.com",
      name: "Anna K.",
    });

    const issue = memory
      .getFiles(sessionId)
      .find((f) => f.path.endsWith(".md")) as ArtifactFile;
    const fm = parse((await issue.blob.text()).split("---\n")[1]);
    expect(fm.reporter).toEqual({
      user_id: "u_18293",
      email: "user@example.com",
      name: "Anna K.",
    });
    // camelCase → snake_case; nested object dropped with a warning.
    expect(fm.custom).toEqual({ plan: "pro", app_version: "2.4.1" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("meta"));
    warnSpy.mockRestore();
  });

  const png = (n: number) =>
    new Blob([new Uint8Array([137, 80, 78, 71, n])], { type: "image/png" });

  it("writes a single recording as clip-01 + a clips block", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    const result = await widget.captureIssue({
      comment: "Checkout bug via a sequence",
      mode: "fullpage",
      screenshot: png(0),
      recording: true,
      // Legacy flat `frames` form is treated as one clip (clip-01).
      frames: [png(1), png(2), png(3)],
    });
    await result?.delivered;
    const sessionId = result?.sessionId as string;
    const paths = memory.getFiles(sessionId).map((f) => f.path);
    expect(paths).toContain("01-checkout-bug-via-a-sequence.png");
    expect(paths).toContain("01-checkout-bug-via-a-sequence-frames/clip-01/01.png");
    expect(paths).toContain("01-checkout-bug-via-a-sequence-frames/clip-01/02.png");
    expect(paths).toContain("01-checkout-bug-via-a-sequence-frames/clip-01/03.png");

    const md = await (
      memory.getFiles(sessionId).find((f) => f.path.endsWith(".md")) as ArtifactFile
    ).blob.text();
    const fm = parse(md.split("---\n")[1]);
    expect(fm.recording).toBe(true);
    expect(fm.frames_count).toBe(3);
    expect(fm.frames_dir).toBe("01-checkout-bug-via-a-sequence-frames");
    expect(fm.clips).toEqual([{ id: "clip-01", frames: 3 }]);

    const session = parse(
      await (memory.getFile(sessionId, "session.yaml") as ArtifactFile).blob.text()
    );
    expect(session.issues[0].frames).toBe(3);
  });

  it("writes two clips into separate subfolders with a per-clip breakdown", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    const result = await widget.captureIssue({
      comment: "Two recordings",
      mode: "fullpage",
      screenshot: png(0),
      recording: true,
      clips: [
        [png(1), png(2), png(3), png(4), png(5)],
        [png(6), png(7), png(8)],
      ],
    });
    await result?.delivered;
    const sessionId = result?.sessionId as string;
    const paths = memory.getFiles(sessionId).map((f) => f.path);
    expect(paths).toContain("01-two-recordings-frames/clip-01/05.png");
    expect(paths).toContain("01-two-recordings-frames/clip-02/03.png");
    // No cross-clip flattening: clip-02 restarts frame numbering at 01.
    expect(paths).toContain("01-two-recordings-frames/clip-02/01.png");
    expect(paths).not.toContain("01-two-recordings-frames/clip-01/06.png");

    const fm = parse(
      (
        await (
          memory.getFiles(sessionId).find((f) => f.path.endsWith(".md")) as ArtifactFile
        ).blob.text()
      ).split("---\n")[1]
    );
    expect(fm.frames_count).toBe(8);
    expect(fm.clips).toEqual([
      { id: "clip-01", frames: 5 },
      { id: "clip-02", frames: 3 },
    ]);
    const session = parse(
      await (memory.getFile(sessionId, "session.yaml") as ArtifactFile).blob.text()
    );
    expect(session.issues[0].frames).toBe(8);
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

describe("setContext (runtime host context)", () => {
  async function mdText(memory: MemoryConnector, id: string): Promise<string> {
    const sessionId = memory.getSessionIds()[0];
    const file = memory
      .getFiles(sessionId)
      .find((f) => f.path.startsWith(`${id}-`) && f.path.endsWith(".md"));
    return (await file?.blob.text()) ?? "";
  }

  it("attaches context to issues and merges on repeat calls", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    widget.setContext({ tenantId: "acme", buildVersion: "2.4.1" });
    const first = await widget.captureIssue({
      comment: "Alpha issue here",
      mode: "fullpage",
    });
    await first?.delivered;
    widget.setContext({ tenantId: "beta", darkMode: true }); // update + add
    const second = await widget.captureIssue({
      comment: "Bravo issue here",
      mode: "fullpage",
    });
    await second?.delivered;

    const ctx1 = parse((await mdText(memory, "01")).split("---\n")[1]).context;
    expect(ctx1).toEqual({ tenant_id: "acme", build_version: "2.4.1" });
    const ctx2 = parse((await mdText(memory, "02")).split("---\n")[1]).context;
    expect(ctx2).toEqual({
      tenant_id: "beta",
      build_version: "2.4.1",
      dark_mode: true,
    });
  });

  it("drops invalid context values with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    // @ts-expect-error — testing runtime rejection of a nested object
    widget.setContext({ ok: "yes", nested: { a: 1 } });
    const r = await widget.captureIssue({ comment: "Ctx issue", mode: "fullpage" });
    await r?.delivered;
    const ctx = parse((await mdText(memory, "01")).split("---\n")[1]).context;
    expect(ctx).toEqual({ ok: "yes" });
    expect(warn).toHaveBeenCalled();
  });

  it("omits context entirely when setContext was never called", async () => {
    const memory = new MemoryConnector();
    const widget = makeWidget([memory]);
    const r = await widget.captureIssue({ comment: "No context", mode: "fullpage" });
    await r?.delivered;
    expect(await mdText(memory, "01")).not.toContain("context:");
  });
});
