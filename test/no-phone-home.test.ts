// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Checklist } from "../src/checklist";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget } from "../src/ui/mount";

/**
 * PERMANENT CI GUARD — do not delete.
 *
 * sluglist's entire compliance argument is that reports never touch a third
 * party: artifacts go only where the host's own connectors send them. That is
 * an architectural claim, and architectural claims rot silently — a dependency
 * bump, an analytics import, a "just fetch the config" convenience, and it is
 * quietly untrue.
 *
 * So this test drives the whole flow (init, capture, screenshots, recording
 * frames, checklist verdicts, redelivery) against an in-memory connector, with
 * every outbound channel the browser offers replaced by a counting spy, and
 * asserts the count is zero.
 *
 * Deliberately out of scope, and documented in RUN_EVIDENCE.md rather than
 * hidden: (a) a `checklist:` URL, which is a fetch the host explicitly asked
 * for, and (b) html-to-image re-fetching the page's OWN images and webfonts to
 * inline them into a PNG at capture time. Neither reaches a sluglist endpoint —
 * there is no sluglist endpoint.
 */

interface Channels {
  calls: string[];
  restore(): void;
}

/** Replace every way a browser can talk to the network with a counting spy. */
function trapNetwork(): Channels {
  const calls: string[] = [];
  const g = globalThis as Record<string, unknown>;

  const original = {
    fetch: g.fetch,
    XMLHttpRequest: g.XMLHttpRequest,
    WebSocket: g.WebSocket,
    EventSource: g.EventSource,
    Image: g.Image,
    sendBeacon: navigator.sendBeacon,
  };

  g.fetch = (input: unknown) => {
    calls.push(`fetch ${String(input)}`);
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  class TrapXhr {
    open(method: string, url: string) {
      calls.push(`xhr ${method} ${url}`);
    }
    send() {
      /* nothing leaves */
    }
    addEventListener() {
      /* nothing to notify */
    }
    readonly status = 0;
  }
  g.XMLHttpRequest = TrapXhr;
  class TrapSocket {
    constructor(url: string) {
      calls.push(`websocket ${url}`);
    }
  }
  g.WebSocket = TrapSocket;
  class TrapSource {
    constructor(url: string) {
      calls.push(`eventsource ${url}`);
    }
  }
  g.EventSource = TrapSource;
  class TrapImage {
    set src(value: string) {
      calls.push(`image ${value}`);
    }
  }
  g.Image = TrapImage;
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (url: string) => {
      calls.push(`beacon ${url}`);
      return true;
    },
  });

  return {
    calls,
    restore() {
      g.fetch = original.fetch;
      g.XMLHttpRequest = original.XMLHttpRequest;
      g.WebSocket = original.WebSocket;
      g.EventSource = original.EventSource;
      g.Image = original.Image;
      Object.defineProperty(navigator, "sendBeacon", {
        configurable: true,
        value: original.sendBeacon,
      });
    },
  };
}

const checklist: Checklist = {
  id: "beta-acceptance",
  title: "Beta acceptance",
  sections: [
    {
      title: "Checkout",
      items: [
        { id: "cart-totals", title: "Cart totals are correct" },
        { id: "discount", title: "Discount applies" },
      ],
    },
  ],
};

const testEnvironment = () => ({
  baseUrl: "https://app.acme.example",
  url: "/checkout",
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

function png(): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
}

/**
 * The whole widget lifecycle a real session goes through. Returns nothing —
 * the assertion is on what the network trap saw.
 */
async function runFullFlow(): Promise<void> {
  const memory = new MemoryConnector();
  const core = createFeedbackWidget(
    {
      project: "acme",
      connectors: [memory],
      preset: "production",
      checklist,
      identity: { email: "qa@acme.example", name: "QA" },
      custom: { build: "2026.07.31" },
    },
    { storage: createMemoryStorage(), environment: testEnvironment }
  );
  const mounted = mountFeedbackWidget(core);

  await core.whenChecklistReady();
  core.setContext({ tenant: "acme-eu" });

  // A plain issue with a screenshot.
  const first = await core.captureIssue({
    comment: "Cart totals are wrong after applying a discount",
    mode: "element",
    selector: '[data-testid="cart-total"]',
    elementText: "Total: 42.00",
    screenshot: png(),
  });
  await first?.delivered;

  // A recording with two clips.
  const second = await core.captureIssue({
    comment: "Discount is lost after navigating away",
    mode: "fullpage",
    recording: true,
    clips: [[png(), png()], [png()]],
    screenshot: png(),
  });
  await second?.delivered;

  // Checklist verdicts, both directions.
  core.recordVerdict("cart-totals", "fail", first?.issueId ?? null);
  core.recordVerdict("discount", "pass");
  core.clearVerdict("discount");

  // Redelivery of a batch (the retry path behind the failed-upload toast).
  if (first) {
    await core.redeliver({ files: first.files, sessionId: first.sessionId });
  }

  mounted.unmount();
}

describe("no phone home", () => {
  let trap: Channels;

  beforeEach(() => {
    trap = trapNetwork();
    localStorage.clear();
  });

  afterEach(() => {
    trap.restore();
    document.body.innerHTML = "";
  });

  it("a full session with a memory connector makes zero network calls", async () => {
    await runFullFlow();
    expect(trap.calls).toEqual([]);
  });

  it("the guard actually catches a stray call (negative check)", async () => {
    // Proves the test above is not vacuous: if any code in the flow reached for
    // the network, these are the channels that would report it.
    await runFullFlow();
    expect(trap.calls).toEqual([]);

    await fetch("https://telemetry.example/collect");
    new WebSocket("wss://telemetry.example/socket");
    navigator.sendBeacon("https://telemetry.example/beacon");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://telemetry.example/xhr");
    xhr.send();

    expect(trap.calls).toEqual([
      "fetch https://telemetry.example/collect",
      "websocket wss://telemetry.example/socket",
      "beacon https://telemetry.example/beacon",
      "xhr POST https://telemetry.example/xhr",
    ]);
  });

  it("the only fetch a widget ever makes is the checklist URL the host configured", async () => {
    const core = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        preset: "production",
        checklist: "/acceptance.json",
      },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );
    await core.whenChecklistReady();

    // Exactly one call, to exactly the URL the host passed in.
    expect(trap.calls).toEqual(["fetch /acceptance.json"]);
  });
});
