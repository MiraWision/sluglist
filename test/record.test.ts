import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCapture, ActionRecord } from "../src/actions";
import { createRecorder } from "../src/ui/record";

// Deterministic capture: html-to-image is mocked so frame timing is controlled.
vi.mock("../src/screenshot", () => ({
  captureFullPage: vi.fn(() =>
    Promise.resolve(new Blob(["png"], { type: "image/png" }))
  ),
}));
vi.mock("../src/mask", () => ({
  applyMask: vi.fn(() => ({ count: 0, restore: () => undefined })),
}));

/** A fake action trail whose `emit` drives the recorder's subscription. */
function fakeActions() {
  const listeners = new Set<(r: ActionRecord) => void>();
  const capture: ActionCapture & { emit: (r: ActionRecord) => void } = {
    snapshot: () => [],
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    uninstall: () => undefined,
    emit: (record) => {
      for (const l of listeners) {
        l(record);
      }
    },
  };
  return capture;
}

const click = (): ActionRecord => ({ ts: 0, kind: "click", selector: "button" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createRecorder", () => {
  it("captures a start frame, then one per action, linking record.frame", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    await recorder.start();
    expect(recorder.frameCount).toBe(1); // start frame

    const a = click();
    actions.emit(a);
    await vi.runAllTimersAsync();
    expect(recorder.frameCount).toBe(2);
    expect(a.frame).toBe(2); // linked to file 02.png
  });

  it("stamps the clip index onto action-linked frames", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    // Second recording on the same issue → clip 2.
    await recorder.start(2);
    const a = click();
    actions.emit(a);
    await vi.runAllTimersAsync();
    expect(a.frame).toBe(2); // per-clip frame numbering (01 = start)
    expect(a.clip).toBe(2);
  });

  it("does not capture a frame for typing", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    await recorder.start();
    const t: ActionRecord = { ts: 0, kind: "type", selector: "input", chars: 3 };
    actions.emit(t);
    await vi.runAllTimersAsync();
    expect(recorder.frameCount).toBe(1); // only the start frame
    expect(t.frame).toBeUndefined();
  });

  it("caps at maxFrames; further actions stay in the trail without frames", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 3,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    await recorder.start(); // frame 1
    for (let i = 0; i < 5; i++) {
      const a = click();
      actions.emit(a);
      await vi.runAllTimersAsync();
    }
    expect(recorder.frameCount).toBe(3); // 1 start + 2 actions, then capped
    expect(recorder.atLimit).toBe(true);
  });

  it("throttles frames closer than frameMinInterval", async () => {
    const actions = fakeActions();
    let t = 0;
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 1000,
      privacy: {},
      now: () => t,
    });
    await recorder.start(); // frame 1 at t=0 (lastFrameTs=0)
    t = 500; // within the 1000ms window → throttled
    actions.emit(click());
    await vi.runAllTimersAsync();
    expect(recorder.frameCount).toBe(1);
    t = 1200; // beyond the window → captures
    actions.emit(click());
    await vi.runAllTimersAsync();
    expect(recorder.frameCount).toBe(2);
  });

  it("snap() captures a manual frame, bypassing the throttle", async () => {
    const actions = fakeActions();
    let t = 0;
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 1000,
      privacy: {},
      now: () => t,
    });
    await recorder.start(); // frame 1 at t=0
    t = 100; // within the throttle window: an action would be skipped
    await recorder.snap();
    expect(recorder.frameCount).toBe(2);
  });

  it("snap() is a no-op when not recording or at the frame cap", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 1,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    await recorder.snap(); // not recording
    expect(recorder.frameCount).toBe(0);
    await recorder.start(); // frame 1 = the cap
    await recorder.snap();
    expect(recorder.frameCount).toBe(1);
  });

  it("stop returns the frames; cancel discards them", async () => {
    const actions = fakeActions();
    const recorder = createRecorder({
      actions,
      maxFrames: 30,
      frameMinInterval: 0,
      privacy: {},
      now: () => 0,
    });
    await recorder.start();
    actions.emit(click());
    await vi.runAllTimersAsync();
    const frames = recorder.stop();
    expect(frames).toHaveLength(2);
    expect(recorder.recording).toBe(false);

    await recorder.start();
    actions.emit(click());
    await vi.runAllTimersAsync();
    recorder.cancel();
    expect(recorder.frameCount).toBe(0);
    expect(recorder.recording).toBe(false);
  });
});
