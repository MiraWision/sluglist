/**
 * Minimal Chrome DevTools Protocol driver — enough to navigate, evaluate,
 * click and screenshot. Used instead of Playwright so the end-to-end run needs
 * no 150MB browser download: it drives the Chrome already installed on the host.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitFor(fn, timeout = 15000, every = 150) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timed out: ${lastError ?? "condition never became true"}`);
}

export async function launch({ downloadDir, port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "sluglist-chrome-"));
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const version = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok ? await res.json() : null;
  });

  const socket = await connect(version.webSocketDebuggerUrl);

  // One page target, driven through its own session.
  const { targetId } = await socket.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await socket.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  const page = makePage(socket, sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  if (downloadDir) {
    await page.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
    });
  }

  return {
    page,
    async close() {
      try {
        await socket.send("Browser.close");
      } catch {
        // Already gone.
      }
      socket.raw.close();
      child.kill();
    },
  };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: ok, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          fail(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          ok(message.result);
        }
        return;
      }
      for (const listener of listeners) {
        listener(message);
      }
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () =>
      resolve({
        raw: ws,
        on: (fn) => listeners.push(fn),
        send(method, params = {}, sessionId) {
          const id = nextId++;
          return new Promise((ok, fail) => {
            pending.set(id, { resolve: ok, reject: fail });
            ws.send(
              JSON.stringify({
                id,
                method,
                params,
                ...(sessionId ? { sessionId } : {}),
              })
            );
          });
        },
      })
    );
  });
}

function makePage(socket, sessionId) {
  const send = (method, params) => socket.send(method, params, sessionId);

  return {
    send,

    /** Navigate and wait for the load event. */
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const off = (message) => {
          if (
            message.sessionId === sessionId &&
            message.method === "Page.loadEventFired"
          ) {
            resolve();
          }
        };
        socket.on(off);
      });
      await send("Page.navigate", { url });
      await loaded;
      // Let inline scripts attach their handlers.
      await new Promise((r) => setTimeout(r, 120));
    },

    /** Evaluate an expression in the page and return its JSON value. */
    async evaluate(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) {
        throw new Error(
          exceptionDetails.exception?.description ?? exceptionDetails.text
        );
      }
      return result.value;
    },

    /** Click an element by CSS selector; throws when it is absent. */
    async click(selector) {
      const ok = await this.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false; el.click(); return true; })()`
      );
      if (!ok) {
        throw new Error(`no element matches ${selector}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    },

    /** Full-page PNG screenshot as a Buffer. */
    async screenshot() {
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      return Buffer.from(data, "base64");
    },

    text(selector) {
      return this.evaluate(
        `(document.querySelector(${JSON.stringify(selector)})||{}).textContent || ""`
      );
    },

    exists(selector) {
      return this.evaluate(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
    },

    visible(selector) {
      return this.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
        })()`
      );
    },
  };
}
