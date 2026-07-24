import type { ActionCapture, ActionRecord } from "../actions";
import { applyMask } from "../mask";
import { captureFullPage } from "../screenshot";
import type { FeedbackPrivacy } from "../types";

/**
 * Record mode: captures a frame (full-page screenshot) at the start of a
 * recording and on each click / navigate / submit (NOT type), throttled and
 * capped; the reporter can also snap extra frames manually via `snap()`.
 * Frames are tagged onto the action-trail records (`record.frame`) so
 * the `## Actions` lines get a `— frame NN` suffix. Frames respect privacy
 * masking. Frame capture is deferred a tick so the action's DOM effect is
 * applied before the shot.
 */

const FRAME_DEFER_MS = 60;

export interface RecorderOptions {
  actions: ActionCapture;
  maxFrames: number;
  frameMinInterval: number;
  privacy: FeedbackPrivacy;
  /** Called whenever recording/frame state changes (for the indicator). */
  onChange?: () => void;
  now?: () => number;
}

export interface Recorder {
  readonly recording: boolean;
  readonly frameCount: number;
  readonly maxFrames: number;
  readonly atLimit: boolean;
  /** True if masking redacted anything on any captured frame. */
  readonly maskedAny: boolean;
  /**
   * Begin recording and capture the initial frame. `clipIndex` (1-based) is
   * stamped onto each action-linked frame's `record.clip`, so the `## Actions`
   * lines can read `— clip N, frame NN`. Each start()→stop() is one clip.
   */
  start(clipIndex?: number): Promise<void>;
  /**
   * Manually capture a frame right now (the "+ Frame" button / S key).
   * Bypasses the action throttle; still respects the frame cap.
   */
  snap(): Promise<void>;
  /** Stop and return the captured frames (in order). */
  stop(): Blob[];
  /** Discard the recording; returns nothing. */
  cancel(): void;
}

export function createRecorder(options: RecorderOptions): Recorder {
  const now = options.now ?? (() => Date.now());
  let recording = false;
  let frames: Blob[] = [];
  let lastFrameTs = 0;
  let capturing = false;
  let maskedAny = false;
  let clipIndex = 1;
  let unsubscribe: (() => void) | null = null;

  async function captureFrame(record: ActionRecord | null): Promise<void> {
    if (!recording || capturing || frames.length >= options.maxFrames) {
      return;
    }
    capturing = true;
    lastFrameTs = now(); // reserve the throttle window at capture start
    try {
      const mask = applyMask(options.privacy);
      let blob: Blob;
      try {
        blob = await captureFullPage();
      } finally {
        mask.restore();
      }
      if (mask.count > 0) {
        maskedAny = true;
      }
      if (!recording) {
        return; // cancelled mid-capture
      }
      frames.push(blob);
      if (record) {
        // Link this frame to the action line (1-based, per clip; frame 01 =
        // start state). `clip` lets `## Actions` read "— clip N, frame NN".
        record.frame = frames.length;
        record.clip = clipIndex;
      }
    } catch (error) {
      console.error("[sluglist] frame capture failed:", error);
    } finally {
      capturing = false;
      options.onChange?.();
    }
  }

  return {
    get recording() {
      return recording;
    },
    get frameCount() {
      return frames.length;
    },
    get maxFrames() {
      return options.maxFrames;
    },
    get atLimit() {
      return frames.length >= options.maxFrames;
    },
    get maskedAny() {
      return maskedAny;
    },
    async start(clip = 1) {
      recording = true;
      frames = [];
      lastFrameTs = 0;
      maskedAny = false;
      clipIndex = clip;
      options.onChange?.();
      await captureFrame(null); // initial state → frame 01
      unsubscribe = options.actions.subscribe((record) => {
        if (record.kind === "type" || !recording) {
          return; // typing never triggers a frame
        }
        if (frames.length >= options.maxFrames) {
          options.onChange?.(); // at the cap: trail continues, indicator updates
          return;
        }
        if (now() - lastFrameTs < options.frameMinInterval) {
          return; // throttled → action stays in the trail without a frame
        }
        // Defer so the click/navigation effect is applied before the shot.
        setTimeout(() => {
          captureFrame(record);
        }, FRAME_DEFER_MS);
      });
    },
    async snap() {
      await captureFrame(null);
    },
    stop() {
      recording = false;
      unsubscribe?.();
      unsubscribe = null;
      const result = frames;
      frames = [];
      options.onChange?.();
      return result;
    },
    cancel() {
      recording = false;
      unsubscribe?.();
      unsubscribe = null;
      frames = [];
      options.onChange?.();
    },
  };
}
