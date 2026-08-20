import { describe, expect, it, vi } from "vitest";
import { HttpConnector } from "../src/connectors/http";
import { FORMAT_VERSION } from "../src/artifacts";
import type { ArtifactPayload } from "../src/contract";
import { deliver, PermanentDeliveryError } from "../src/deliver";
import type { ArtifactFile, FeedbackConnector } from "../src/types";

/**
 * The connector is half of the delivery contract, so what it puts on the wire
 * is behaviour, not detail: the endpoint parses this shape. The other half of
 * the suite is about failure — a rejection must not be retried, and its reason
 * must survive all the way to the caller, because that string is what ends up
 * in the toast a tester screenshots.
 */

function file(overrides: Partial<ArtifactFile> = {}): ArtifactFile {
  return {
    path: "01-save-does-nothing.png",
    mime: "image/png",
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
    ...overrides,
  };
}

function respond(status: number, body = ""): Response {
  return new Response(body, { status, statusText: status === 400 ? "Bad Request" : "" });
}

describe("HttpConnector — the request", () => {
  it("posts the payload the endpoint expects, format included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200));
    const connector = new HttpConnector("/api/feedback", {
      token: () => "tok",
      fetch: fetchMock,
    });

    await connector.put("session-2026-08-16-a1b2", file());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(init.headers.authorization).toBe("Bearer tok");
    const payload = JSON.parse(init.body) as ArtifactPayload;
    expect(payload).toEqual({
      format: FORMAT_VERSION,
      sessionId: "session-2026-08-16-a1b2",
      path: "01-save-does-nothing.png",
      mime: "image/png",
      base64: Buffer.from([1, 2, 3, 4]).toString("base64"),
    });
  });

  it("accepts the short constructor form the docs have always shown", async () => {
    // `new HttpConnector(url, () => token)` predates this class by several
    // versions of README, so it has to keep working — verified against the
    // real path, global fetch and all.
    const fetchMock = vi.fn().mockResolvedValue(respond(200));
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    try {
      await new HttpConnector("/api/feedback", () => "tok").put(
        "session-2026-08-16-a1b2",
        file()
      );
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
  });

  it("reads a token per delivery, so a refreshed one is picked up", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200));
    let token = "first";
    const connector = new HttpConnector("/api/feedback", {
      token: () => token,
      fetch: fetchMock,
    });

    await connector.put("session-2026-08-16-a1b2", file());
    token = "second";
    await connector.put("session-2026-08-16-a1b2", file());

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer first");
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer second");
  });

  it("sends no authorization header when there is no token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200));
    await new HttpConnector("/api/feedback", { fetch: fetchMock }).put(
      "session-2026-08-16-a1b2",
      file()
    );
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
  });
});

describe("HttpConnector — failure", () => {
  it("treats a 4xx as permanent and carries the endpoint's reason", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(respond(400, "invalid artifact path: ../x.png"))
      );
    const connector = new HttpConnector("/api/feedback", { fetch: fetchMock });

    await expect(
      connector.put("session-2026-08-16-a1b2", file())
    ).rejects.toThrow(PermanentDeliveryError);
    await expect(
      connector.put("session-2026-08-16-a1b2", file())
    ).rejects.toThrow(/invalid artifact path/);
  });

  it("leaves 408 and 429 retryable — they are timing, not shape", async () => {
    for (const status of [408, 429]) {
      const connector = new HttpConnector("/api/feedback", {
        fetch: vi.fn().mockResolvedValue(respond(status)),
      });
      const error = await connector
        .put("session-2026-08-16-a1b2", file())
        .catch((e: unknown) => e);
      expect(error, `status ${status}`).not.toBeInstanceOf(PermanentDeliveryError);
    }
  });

  it("treats 5xx as worth retrying", async () => {
    const connector = new HttpConnector("/api/feedback", {
      fetch: vi.fn().mockResolvedValue(respond(500)),
    });
    const error = await connector
      .put("session-2026-08-16-a1b2", file())
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PermanentDeliveryError);
  });

  it("refuses an oversized body before the request, naming the file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200));
    const connector = new HttpConnector("/api/feedback", {
      fetch: fetchMock,
      maxBodyBytes: 4,
    });

    const error = await connector
      .put("session-2026-08-16-a1b2", file({ path: "big.png" }))
      .catch((e: unknown) => e);

    // The platform would have answered 413 from the edge, with nothing the
    // client could explain. This never reaches the network.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(PermanentDeliveryError);
    expect((error as Error).message).toContain("big.png");
    expect((error as Error).message).toContain("body budget");
  });
});

describe("delivery retries", () => {
  function countingConnector(error: unknown): {
    connector: FeedbackConnector;
    attempts: () => number;
  } {
    let attempts = 0;
    return {
      attempts: () => attempts,
      connector: {
        id: "counting",
        put: async () => {
          attempts++;
          throw error;
        },
      },
    };
  }

  it("stops immediately on a permanent rejection", async () => {
    const { connector, attempts } = countingConnector(
      new PermanentDeliveryError("415 Unsupported Media Type")
    );
    const report = await deliver([connector], "session-2026-08-16-a1b2", [file()]);
    expect(attempts()).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.failures[0].permanent).toBe(true);
  });

  it("still retries an ordinary failure three times", async () => {
    const { connector, attempts } = countingConnector(new Error("network down"));
    const report = await deliver([connector], "session-2026-08-16-a1b2", [file()]);
    expect(attempts()).toBe(3);
    expect(report.failures[0].permanent).toBeUndefined();
  });

  it("recognises a permanent failure by shape, across module copies", async () => {
    // A connector bundled from a different copy of sluglist throws an error
    // that is not `instanceof` ours; the `permanent` flag is the contract.
    const foreign = Object.assign(new Error("415"), { permanent: true });
    const { connector, attempts } = countingConnector(foreign);
    const report = await deliver([connector], "session-2026-08-16-a1b2", [file()]);
    expect(attempts()).toBe(1);
    expect(report.failures[0].permanent).toBe(true);
  });
});
