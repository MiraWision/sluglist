import { describe, expect, it, vi } from "vitest";
import { MemoryConnector } from "../src/connectors/memory";
import type { OfflineQueue, QueuedBatch } from "../src/queue";
import { createMemoryStorage } from "../src/session";
import type { FeedbackConnector } from "../src/types";
import { createFeedbackWidget } from "../src/widget";

const env = () => ({
  baseUrl: "https://dev.example",
  url: "/x",
  viewport: "800x600",
  screen: "800x600",
  devicePixelRatio: 1,
  browser: "Chrome 138",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "UTC",
  colorScheme: "light",
  reducedMotion: false,
});

function memoryQueue(seed: QueuedBatch[] = []) {
  let seq = seed.reduce((m, b) => Math.max(m, b.id), 0);
  const items: QueuedBatch[] = [...seed];
  const queue: OfflineQueue & { items: QueuedBatch[] } = {
    items,
    enqueue: (b) => {
      const id = ++seq;
      items.push({ ...b, id });
      return Promise.resolve(id);
    },
    remove: (id) => {
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) {
        items.splice(i, 1);
      }
      return Promise.resolve();
    },
    all: () => Promise.resolve([...items].sort((a, b) => a.id - b.id)),
  };
  return queue;
}

describe("offline queue (outbox)", () => {
  it("enqueues then removes a batch on successful delivery", async () => {
    const queue = memoryQueue();
    const widget = createFeedbackWidget(
      { project: "p", connectors: [new MemoryConnector()] },
      { storage: createMemoryStorage(), environment: env, queue }
    );
    const r = await widget.captureIssue({ comment: "ok", mode: "fullpage" });
    await r?.delivered;
    expect(queue.items).toHaveLength(0);
  });

  it("keeps the batch queued when delivery fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: FeedbackConnector = {
      id: "down",
      put: () => Promise.reject(new Error("offline")),
    };
    const queue = memoryQueue();
    vi.useFakeTimers();
    try {
      const widget = createFeedbackWidget(
        { project: "p", connectors: [failing] },
        { storage: createMemoryStorage(), environment: env, queue }
      );
      const r = await widget.captureIssue({ comment: "fail", mode: "fullpage" });
      const delivered = r?.delivered;
      await vi.runAllTimersAsync();
      await delivered;
      expect(queue.items).toHaveLength(1);
      expect(queue.items[0].files.some((f) => f.path === "session.yaml")).toBe(
        true
      );
    } finally {
      vi.useRealTimers();
      errorSpy.mockRestore();
    }
  });

  it("flushes pending batches on init and removes them on success", async () => {
    const memory = new MemoryConnector();
    const seed: QueuedBatch = {
      id: 1,
      sessionId: "session-2026-07-21-aaaa",
      createdAt: 1,
      files: [
        {
          path: "session.yaml",
          mime: "text/yaml",
          blob: new Blob(["project: p\n"], { type: "text/yaml" }),
        },
      ],
    };
    const queue = memoryQueue([seed]);
    createFeedbackWidget(
      { project: "p", connectors: [memory] },
      { storage: createMemoryStorage(), environment: env, queue }
    );
    // Let the flush (chained on the delivery queue) settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.items).toHaveLength(0);
    expect(
      memory.getFiles("session-2026-07-21-aaaa").map((f) => f.path)
    ).toContain("session.yaml");
  });
});

describe("outbox visibility", () => {
  it("reports how many batches are waiting", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failing: FeedbackConnector = {
      id: "down",
      put: () => Promise.reject(new Error("offline")),
    };
    const queue = memoryQueue();
    const widget = createFeedbackWidget(
      { project: "p", connectors: [failing] },
      { storage: createMemoryStorage(), environment: env, queue }
    );

    expect(await widget.pendingBatches()).toBe(0);
    const r = await widget.captureIssue({ comment: "lost", mode: "fullpage" });
    await r?.delivered;

    // The mechanic existed; nobody could see it. This is what the menu line
    // and any host-side "1 report waiting" indicator read.
    expect(await widget.pendingBatches()).toBe(1);
    errorSpy.mockRestore();
  });

  it("reports what the boot-time flush did", async () => {
    const flushes: unknown[] = [];
    const queue = memoryQueue([
      {
        id: 1,
        sessionId: "session-2026-08-16-a1b2",
        files: [
          {
            path: "01-x.md",
            mime: "text/markdown",
            blob: new Blob(["x"], { type: "text/markdown" }),
          },
        ],
        createdAt: 1,
      },
    ]);

    const widget = createFeedbackWidget(
      {
        project: "p",
        connectors: [new MemoryConnector()],
        onQueueFlush: (report) => flushes.push(report),
      },
      { storage: createMemoryStorage(), environment: env, queue }
    );
    // The flush runs on the delivery chain; wait for it to settle.
    await widget.captureIssue({ comment: "next", mode: "fullpage" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(flushes[0]).toEqual({ batches: 1, delivered: 1, failed: 0 });
    expect(await widget.pendingBatches()).toBe(0);
  });
});
