import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFeedbackHandler } from "../examples/feedback-route";

/**
 * The example endpoint is copy-pasted into client projects, so its rejections
 * are part of what sluglist ships in practice. These tests pin the four that
 * matter for a production deployment: auth, size, content type and abuse caps.
 */

const TOKEN = "s3cret-token-value";

function makeHandler(overrides: Record<string, unknown> = {}) {
  const store = vi.fn(async () => undefined);
  const handler = createFeedbackHandler({
    store,
    token: () => TOKEN,
    ...overrides,
  });
  return { handler, store };
}

function request(
  body: unknown,
  init: { token?: string | null; headers?: Record<string, string> } = {}
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...init.headers,
  };
  const token = init.token === undefined ? TOKEN : init.token;
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request("https://app.example/api/feedback", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function markdown(content = "# hello") {
  return {
    sessionId: "session-2026-07-31-ab12",
    path: "01-broken-header.md",
    mime: "text/markdown",
    base64: Buffer.from(content).toString("base64"),
  };
}

describe("feedback endpoint — auth", () => {
  it("accepts a valid bearer token", async () => {
    const { handler, store } = makeHandler();
    const res = await handler(request(markdown()));
    expect(res.status).toBe(200);
    expect(store).toHaveBeenCalledWith(
      "feedback/session-2026-07-31-ab12/01-broken-header.md",
      expect.anything(),
      "text/markdown"
    );
  });

  it("401 with no Authorization header", async () => {
    const { handler, store } = makeHandler();
    const res = await handler(request(markdown(), { token: null }));
    expect(res.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it("401 with the wrong token", async () => {
    const { handler } = makeHandler();
    const res = await handler(request(markdown(), { token: "wrong-token" }));
    expect(res.status).toBe(401);
  });

  it("401 with a token that is a prefix of the real one", async () => {
    const { handler } = makeHandler();
    const res = await handler(request(markdown(), { token: TOKEN.slice(0, 5) }));
    expect(res.status).toBe(401);
  });

  it("503 — not 200 — when the server has no token configured", async () => {
    const { handler, store } = makeHandler({ token: () => undefined });
    const res = await handler(request(markdown()));
    expect(res.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });
});

describe("feedback endpoint — size", () => {
  it("413 when the decoded payload exceeds the limit", async () => {
    const { handler, store } = makeHandler({ maxBytes: 1024 });
    const big = Buffer.alloc(2048, 0x41).toString("base64");
    const res = await handler(
      request({ ...markdown(), mime: "image/png", base64: big })
    );
    expect(res.status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it("413 on a declared content-length far over the limit", async () => {
    const { handler } = makeHandler({ maxBytes: 1024 });
    const res = await handler(
      request(markdown(), { headers: { "content-length": "999999" } })
    );
    expect(res.status).toBe(413);
  });

  it("accepts a payload just under the limit", async () => {
    const { handler } = makeHandler({ maxBytes: 4096 });
    const body = Buffer.alloc(1024, 0x41).toString("base64");
    const res = await handler(
      request({ ...markdown(), mime: "image/png", base64: body })
    );
    expect(res.status).toBe(200);
  });
});

describe("feedback endpoint — content type", () => {
  it.each(["text/yaml", "text/markdown", "image/png"])(
    "accepts %s",
    async (mime) => {
      const { handler } = makeHandler();
      const res = await handler(request({ ...markdown(), mime }));
      expect(res.status).toBe(200);
    }
  );

  it.each([
    "application/javascript",
    "text/html",
    "application/octet-stream",
    "image/svg+xml",
  ])("415 for %s", async (mime) => {
    const { handler, store } = makeHandler();
    const res = await handler(request({ ...markdown(), mime }));
    expect(res.status).toBe(415);
    expect(store).not.toHaveBeenCalled();
  });
});

describe("feedback endpoint — path validation", () => {
  it("accepts the nested recording-frame layout", async () => {
    const { handler, store } = makeHandler();
    const res = await handler(
      request({
        ...markdown(),
        path: "01-discount-lost-frames/clip-01/02.png",
        mime: "image/png",
      })
    );
    expect(res.status).toBe(200);
    expect(store).toHaveBeenCalledWith(
      "feedback/session-2026-07-31-ab12/01-discount-lost-frames/clip-01/02.png",
      expect.anything(),
      "image/png"
    );
  });

  it.each([
    "../../etc/passwd",
    "/absolute/path.md",
    ".hidden.md",
    "a/b/c/d/too-deep.md",
  ])("400 for path %s", async (path) => {
    const { handler, store } = makeHandler();
    const res = await handler(request({ ...markdown(), path }));
    expect(res.status).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });

  it("400 for a session id with traversal", async () => {
    const { handler } = makeHandler();
    const res = await handler(
      request({ ...markdown(), sessionId: "../other-tenant" })
    );
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const { handler } = makeHandler();
    const res = await handler(request("{not json"));
    expect(res.status).toBe(400);
  });

  it("400 on missing fields", async () => {
    const { handler } = makeHandler();
    const res = await handler(request({ sessionId: "session-1" }));
    expect(res.status).toBe(400);
  });
});

describe("feedback endpoint — abuse caps", () => {
  it("409 once a session hits the file cap", async () => {
    const { handler } = makeHandler({ maxFilesPerSession: 2 });
    expect((await handler(request(markdown("one")))).status).toBe(200);
    expect((await handler(request(markdown("two")))).status).toBe(200);
    expect((await handler(request(markdown("three")))).status).toBe(409);
  });

  it("the cap is per session, not global", async () => {
    const { handler } = makeHandler({ maxFilesPerSession: 1 });
    expect((await handler(request(markdown()))).status).toBe(200);
    expect(
      (
        await handler(
          request({ ...markdown(), sessionId: "session-2026-07-31-cd34" })
        )
      ).status
    ).toBe(200);
  });

  it("429 past the per-IP rate limit", async () => {
    const { handler } = makeHandler({ maxFilesPerSession: 10_000 });
    const headers = { "x-forwarded-for": "203.0.113.7" };
    let last = 0;
    for (let i = 0; i < 25; i++) {
      last = (await handler(request(markdown(), { headers }))).status;
    }
    expect(last).toBe(429);
  });

  it("rate limits are per IP", async () => {
    const { handler } = makeHandler({ maxFilesPerSession: 10_000 });
    for (let i = 0; i < 25; i++) {
      await handler(
        request(markdown(), { headers: { "x-forwarded-for": "203.0.113.7" } })
      );
    }
    const other = await handler(
      request(markdown(), { headers: { "x-forwarded-for": "203.0.113.8" } })
    );
    expect(other.status).toBe(200);
  });
});

/**
 * Attachments arrive through the same route with the mime of whatever the
 * reporter picked, so the endpoint needs its own whitelist and its own size
 * cap — the client-side checks are a UX affordance, not a control.
 */
describe("feedback endpoint — attachments", () => {
  function attachment(
    overrides: Record<string, unknown> = {},
    bytes = 32
  ): Record<string, unknown> {
    return {
      sessionId: "session-2026-07-31-ab12",
      path: "03-checkout-att-01.png",
      mime: "image/png",
      base64: Buffer.from(new Uint8Array(bytes)).toString("base64"),
      ...overrides,
    };
  }

  it("accepts a whitelisted attachment", async () => {
    const { handler, store } = makeHandler();
    const res = await handler(request(attachment()));
    expect(res.status).toBe(200);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("accepts the office and text types the widget allows", async () => {
    const { handler } = makeHandler();
    for (const [path, mime] of [
      ["03-checkout-att-01.pdf", "application/pdf"],
      ["03-checkout-att-02.csv", "text/csv"],
      [
        "03-checkout-att-03.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      ["03-checkout-att-04.mp4", "video/mp4"],
    ]) {
      const res = await handler(request(attachment({ path, mime })));
      expect(res.status).toBe(200);
    }
  });

  it("415s a mime that is not on either whitelist", async () => {
    const { handler, store } = makeHandler();
    const res = await handler(
      request(
        attachment({
          path: "03-checkout-att-01.zip",
          mime: "application/zip",
        })
      )
    );
    expect(res.status).toBe(415);
    expect(store).not.toHaveBeenCalled();
  });

  it("415s an attachment mime on a core artifact path", async () => {
    // A file claiming to be an issue markdown but declaring a video mime is
    // either a bug or an attempt; either way it is not stored.
    const { handler } = makeHandler();
    const res = await handler(
      request(
        attachment({ path: "01-broken-header.md", mime: "video/mp4" })
      )
    );
    expect(res.status).toBe(415);
  });

  it("413s an attachment over the attachment cap", async () => {
    const { handler, store } = makeHandler({ maxAttachmentBytes: 1024 });
    const res = await handler(request(attachment({}, 4096)));
    expect(res.status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it("keeps the core-artifact cap independent of the attachment cap", async () => {
    const { handler } = makeHandler({ maxAttachmentBytes: 16 });
    const res = await handler(request(markdown("x".repeat(2048))));
    expect(res.status).toBe(200);
  });
});
