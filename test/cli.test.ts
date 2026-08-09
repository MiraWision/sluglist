import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LocalConnector } from "../src/connectors/local";
import { createDevServer, resolveTarget } from "../src/cli/server";

describe("resolveTarget", () => {
  it("accepts a flat filename inside the session folder", () => {
    const t = resolveTarget("/base", "session-2026-07-22-ab12", "01-x.md");
    expect(t).toBe("/base/session-2026-07-22-ab12/01-x.md");
  });

  it("accepts a single frames subfolder (pre-clip recordings)", () => {
    expect(
      resolveTarget("/base", "session-1", "01-x-frames/02.png")
    ).toBe("/base/session-1/01-x-frames/02.png");
  });

  it("accepts two-level clip frame paths (format 1.2 recordings)", () => {
    expect(
      resolveTarget("/base", "session-1", "01-x-frames/clip-01/01.png")
    ).toBe("/base/session-1/01-x-frames/clip-01/01.png");
  });

  it("rejects traversal, absolute paths, deep nesting and bad session ids", () => {
    const base = "/base";
    expect(resolveTarget(base, "session-1", "../../etc/passwd")).toBeNull();
    expect(resolveTarget(base, "session-1", "/etc/passwd")).toBeNull();
    expect(resolveTarget(base, "session-1", "a/b/c/d.md")).toBeNull(); // > 2 levels
    expect(resolveTarget(base, "session-1", "frames/../../x")).toBeNull();
    expect(resolveTarget(base, "../evil", "x.md")).toBeNull();
    expect(resolveTarget(base, "notasession", "x.md")).toBeNull();
  });
});

describe("sluglist dev server", () => {
  let server: Server;
  let dir: string;
  let base: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sluglist-"));
    server = createDevServer({ dir });
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((res) => server.close(() => res()));
    await rm(dir, { recursive: true, force: true });
  });

  it("GET /health reports ok + absolute dir", async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dir).toContain("sluglist-");
  });

  it("POST /put writes the file with the decoded bytes", async () => {
    const base64 = Buffer.from("project: acme\n").toString("base64");
    const res = await fetch(`${base}/put`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-2026-07-22-ab12",
        path: "session.yaml",
        mime: "text/yaml",
        base64,
      }),
    });
    expect(res.status).toBe(200);
    const written = await readFile(
      join(dir, "session-2026-07-22-ab12", "session.yaml"),
      "utf8"
    );
    expect(written).toBe("project: acme\n");
  });

  it("accepts a clip frame two levels deep (recording put)", async () => {
    const res = await fetch(`${base}/put`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-2026-07-22-ab12",
        path: "03-bug-frames/clip-01/01.png",
        mime: "image/png",
        base64: Buffer.from([137, 80, 78, 71]).toString("base64"),
      }),
    });
    expect(res.status).toBe(200);
    const written = await stat(
      join(dir, "session-2026-07-22-ab12", "03-bug-frames", "clip-01", "01.png")
    );
    expect(written.size).toBe(4);
  });

  it("accepts attachment mimes (text/plain) and still refuses unknown ones", async () => {
    const put = (path: string, mime: string) =>
      fetch(`${base}/put`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-2026-07-22-ab12",
          path,
          mime,
          base64: Buffer.from("evidence line\n").toString("base64"),
        }),
      });
    const txt = await put("03-bug-att-01.txt", "text/plain");
    expect(txt.status).toBe(200);
    expect(
      await readFile(
        join(dir, "session-2026-07-22-ab12", "03-bug-att-01.txt"),
        "utf8"
      )
    ).toBe("evidence line\n");
    const pdf = await put("03-bug-att-02.pdf", "application/pdf");
    expect(pdf.status).toBe(200);
    // Not on any whitelist — still refused.
    const evil = await put("03-bug-att-03.html", "text/html");
    expect(evil.status).toBe(400);
    const exe = await put("03-bug-att-04.exe", "application/x-msdownload");
    expect(exe.status).toBe(400);
  });

  it("rejects path traversal with 400 and writes nothing", async () => {
    const res = await fetch(`${base}/put`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-2026-07-22-ab12",
        path: "../../etc/x",
        mime: "text/yaml",
        base64: Buffer.from("x").toString("base64"),
      }),
    });
    expect(res.status).toBe(400);
    await expect(stat(join(dir, "etc"))).rejects.toBeTruthy();
  });

  it("reflects CORS for a localhost origin", async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
  });
});

describe("LocalConnector when the dev server is down", () => {
  it("warns once per session and rethrows (never blocks)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Port 4 is a reserved/unused port → connection refused.
    const connector = new LocalConnector({ port: 4 });
    const file = {
      path: "session.yaml",
      mime: "text/yaml",
      blob: new Blob(["x"], { type: "text/yaml" }),
    };
    await expect(connector.put("session-1", file)).rejects.toBeTruthy();
    await expect(connector.put("session-1", file)).rejects.toBeTruthy();
    expect(warn).toHaveBeenCalledOnce(); // one warn across two puts
  });
});
