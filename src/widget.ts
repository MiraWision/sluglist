import {
  issueMarkdownFile,
  screenshotFile,
  sessionYamlFile,
} from "./artifacts";
import { type ActionCapture, createActionCapture } from "./actions";
import {
  type ChecklistDef,
  type ChecklistState,
  normalizeChecklist,
  seedChecklistState,
  type Verdict,
} from "./checklist";
import { deliver } from "./deliver";
import { type ErrorCapture, createErrorCapture } from "./errors";
import {
  collectPageEnvironment,
  isoTimestamp,
  type PageEnvironment,
} from "./metadata";
import {
  createOfflineQueue,
  NOOP_QUEUE,
  type OfflineQueue,
} from "./queue";
import { resolvePrivacy } from "./preset";
import {
  normalizeContext,
  normalizeCustom,
  normalizeIdentity,
} from "./reporter";
import type { YamlScalar } from "./yaml";
import { type KeyValueStorage, SessionManager } from "./session";
import { slugFromComment } from "./slug";
import type {
  ArtifactFile,
  CaptureIssueInput,
  CaptureResult,
  DeliveryReport,
  FeedbackWidgetConfig,
  IssueIndexEntry,
  SessionMeta,
  SessionState,
} from "./types";

export interface FeedbackWidgetCore {
  /** Background action trail; the UI's record mode subscribes to it for frames. */
  readonly actions: ActionCapture;
  /** Capture and deliver one issue. Resolves once artifacts are built; delivery runs in the background. */
  captureIssue(input: CaptureIssueInput): Promise<CaptureResult | null>;
  readonly config: FeedbackWidgetConfig;
  readonly enabled: boolean;
  /**
   * The resolved acceptance checklist, or null when none is configured (or an
   * inline one was invalid). For a URL checklist this is null until the fetch
   * settles — await {@link whenChecklistReady} first.
   */
  getChecklist(): ChecklistDef | null;
  /** Current per-item verdicts, or null before any checklist/session exists. */
  getChecklistState(): ChecklistState | null;
  /** Resolves once a URL checklist has loaded (immediately for inline/none). */
  whenChecklistReady(): Promise<ChecklistDef | null>;
  /**
   * Record a verdict for a checklist item and upsert session.yaml (put-per-verdict,
   * like put-per-issue). A `fail` should carry the evidencing `issueId`; `pass`
   * and `skip` clear any prior issue link. No-op when no checklist is configured.
   */
  recordVerdict(itemId: string, verdict: Verdict, issueId?: string | null): void;
  /** Number of issues captured in the current session. */
  getIssueCount(): number;
  /** Number of delivery batches still uploading. */
  getPendingDeliveries(): number;
  /** Current session state, or null before the first issue. */
  getSession(): SessionState | null;
  /** Re-send a previously failed batch (all files, puts are idempotent). */
  redeliver(
    capture: Pick<CaptureResult, "files" | "sessionId">
  ): Promise<DeliveryReport>;
  /**
   * Attach runtime host state (tenant, feature flags, build version, …) to every
   * subsequent issue as a `context` block. Flat primitives only; validated like
   * `custom` (snake_case, ≤ 20 keys, 200-char values). Merges on repeat calls.
   * Unlike `config.custom` (static at init), this reflects state at capture time.
   */
  setContext(context: Record<string, string | number | boolean>): void;
}

export interface CreateFeedbackWidgetOptions {
  /** Test seam: action-trail override (skip installing global handlers). */
  actionCapture?: ActionCapture;
  /** Test seam: environment override instead of reading from window. */
  environment?: () => PageEnvironment;
  /** Test seam: error-capture override (skip installing global handlers). */
  errorCapture?: ErrorCapture;
  /** Test seam: offline queue override. */
  queue?: OfflineQueue;
  /** Test seam: storage override for the session manager. */
  storage?: KeyValueStorage;
}

function now(): number {
  return Date.now();
}

/**
 * Fetch a checklist from a URL (GET → JSON) and validate it. Any failure
 * (network, non-2xx, bad JSON, invalid shape) resolves to null with a warning:
 * a missing checklist must never block plain capture.
 */
async function fetchChecklist(url: string): Promise<ChecklistDef | null> {
  if (typeof fetch !== "function") {
    return null;
  }
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      console.warn(
        `[sluglist] checklist: GET ${url} → ${res.status}; checklist skipped`
      );
      return null;
    }
    return normalizeChecklist(await res.json());
  } catch (error) {
    console.warn(
      `[sluglist] checklist: could not load ${url} (${String(error)}); checklist skipped`
    );
    return null;
  }
}

const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function createFeedbackWidget(
  config: FeedbackWidgetConfig,
  options: CreateFeedbackWidgetOptions = {}
): FeedbackWidgetCore {
  if (!(config.project && PROJECT_SLUG.test(config.project))) {
    throw new Error(
      `[feedback-widget] invalid project slug: ${JSON.stringify(config.project)}`
    );
  }
  const enabled = config.enabled !== false;
  // Resolve the preset once so `core.config` exposes the effective privacy
  // (the UI reads it for masking + the consent checkbox).
  const resolvedConfig: FeedbackWidgetConfig = {
    ...config,
    privacy: resolvePrivacy(config),
  };
  // Identity + custom are validated once at init and fixed for the session.
  // `undefined` means "not configured" → the fields are omitted from artifacts
  // (backward compatible); `null` means "configured but empty".
  const reporter = normalizeIdentity(config.identity);
  const custom = normalizeCustom(config.custom);
  // Runtime host context (setContext). `undefined` until the host calls it →
  // omitted from artifacts (back-compat); `null`/map once configured.
  let context: Record<string, YamlScalar> | null | undefined;
  // Acceptance checklist. Inline objects validate synchronously; a URL is
  // fetched at init (GET → JSON). Either way an invalid/unreachable checklist
  // resolves to null and never blocks capture. `checklistReady` lets the UI
  // wait for a URL fetch before deciding whether to render the second button.
  let checklistDef: ChecklistDef | null = null;
  let checklistReady: Promise<ChecklistDef | null>;
  const rawChecklist = config.checklist;
  if (rawChecklist === undefined) {
    checklistReady = Promise.resolve(null);
  } else if (typeof rawChecklist === "string") {
    checklistReady = fetchChecklist(rawChecklist).then((def) => {
      checklistDef = def;
      return def;
    });
  } else {
    checklistDef = normalizeChecklist(rawChecklist);
    checklistReady = Promise.resolve(checklistDef);
  }
  // Error capture starts at widget init (not on panel open) so errors that
  // happen before the reporter opens the widget are still recorded.
  const errorCapture =
    options.errorCapture ?? createErrorCapture(config.errors);
  // Action trail installs at widget init too, so actions before the widget is
  // opened are still in the buffer.
  const actionCapture =
    options.actionCapture ?? createActionCapture(config.actions);
  const sessions = new SessionManager({
    project: config.project,
    storage: options.storage,
  });
  const readEnvironment = options.environment ?? collectPageEnvironment;
  const queue =
    options.queue ??
    (config.offlineQueue === false
      ? NOOP_QUEUE
      : createOfflineQueue(config.project));
  // Deliveries are chained so batches never interleave: otherwise a slow
  // upload of issue N's session.yaml could overwrite the newer index written
  // by issue N+1.
  let deliveryQueue: Promise<unknown> = Promise.resolve();
  let pendingDeliveries = 0;

  // Warn before the tab closes while uploads are still in flight, so the
  // last issue is not silently lost.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (event) => {
      if (pendingDeliveries > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  function enqueueDelivery(
    sessionId: string,
    files: ArtifactFile[]
  ): Promise<DeliveryReport> {
    pendingDeliveries++;
    const delivered = deliveryQueue
      .then(async () => {
        // Outbox: persist before delivering so the issue survives a failed
        // upload or the tab closing; drop it from the queue on success.
        const queueId = await queue.enqueue({
          sessionId,
          files,
          createdAt: now(),
        });
        const report = await deliver(config.connectors, sessionId, files);
        if (report.ok && queueId !== null) {
          await queue.remove(queueId);
        }
        return report;
      })
      .finally(() => {
        pendingDeliveries--;
      });
    deliveryQueue = delivered;
    return delivered;
  }

  // On load, retry anything left undelivered from a previous session,
  // oldest first, before new captures run.
  function flushQueue(): void {
    deliveryQueue = deliveryQueue.then(async () => {
      const pending = await queue.all();
      for (const batch of pending) {
        const report = await deliver(
          config.connectors,
          batch.sessionId,
          batch.files
        );
        if (report.ok) {
          await queue.remove(batch.id);
        }
      }
    });
  }
  flushQueue();

  // Session metadata factory (shared by capture and verdict recording), so a
  // verdict recorded before any issue creates a session identically to a capture.
  function makeMeta(): Omit<SessionMeta, "session_id" | "created_at"> {
    const env = readEnvironment();
    return {
      project: config.project,
      base_url: env.baseUrl,
      browser: env.browser,
      os: env.os,
      viewport: env.viewport,
      device_pixel_ratio: env.devicePixelRatio,
      screen: env.screen,
      language: env.language,
      languages: env.languages,
      timezone: env.timezone,
      color_scheme: env.colorScheme,
      reduced_motion: env.reducedMotion,
      // Session-level reporter: present only when identity was configured.
      ...(reporter !== undefined ? { reporter } : {}),
    };
  }

  // Seed the full checklist (all verdicts null) into the session the first time,
  // so session.yaml carries the complete coverage map from the start. Additive:
  // does nothing when no checklist is configured. Returns true if it wrote.
  function seedChecklist(state: SessionState): boolean {
    if (checklistDef && state.checklist?.id !== checklistDef.id) {
      state.checklist = seedChecklistState(checklistDef);
      sessions.write(state);
      return true;
    }
    return false;
  }

  function ensureSession(): SessionState {
    const state = sessions.ensure(makeMeta);
    seedChecklist(state);
    return state;
  }

  function doCapture(input: CaptureIssueInput): CaptureResult | null {
    if (!enabled) {
      console.warn("[feedback-widget] disabled, issue ignored");
      return null;
    }
    const comment = input.comment?.trim();
    if (!comment) {
      throw new Error("[feedback-widget] comment is required");
    }

    const env = readEnvironment();
    const state = ensureSession();

    const id = sessions.nextIssueId(state);
    const slug = slugFromComment(comment);
    const mdPath = `${id}-${slug}.md`;
    const shots: Blob[] = [];
    if (input.screenshot) {
      shots.push(input.screenshot);
    }
    if (input.screenshots) {
      shots.push(...input.screenshots.filter((s) => s !== input.screenshot));
    }
    const pngPaths = shots.map((_, i) =>
      i === 0 ? `${id}-${slug}.png` : `${id}-${slug}-${i + 1}.png`
    );
    const createdAtMs = now();
    const createdAt = isoTimestamp(new Date(createdAtMs));
    // Snapshot the error + action buffers at issue time; relative ages vs createdAtMs.
    const errorSnapshot = errorCapture.snapshot();
    const actionSnapshot = actionCapture.snapshot();

    // Record-mode frames: a subfolder of numbered PNGs (additive, only when set).
    const frames = input.frames ?? [];
    const isRecording = input.recording === true && frames.length > 0;
    const framesDir = isRecording ? `${id}-${slug}-frames` : null;
    const framePaths = isRecording
      ? frames.map((_, i) => `${framesDir}/${String(i + 1).padStart(2, "0")}.png`)
      : [];

    const entry: IssueIndexEntry = {
      id,
      file: mdPath,
      screenshot: pngPaths[0] ?? null,
      ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.screen ? { screen: input.screen } : {}),
      ...(isRecording ? { frames: frames.length } : {}),
      url: env.url,
      selector: input.selector ?? null,
      created_at: createdAt,
    };
    state.issues.push(entry);
    sessions.write(state);

    const files: ArtifactFile[] = shots.map((shot, i) =>
      screenshotFile(pngPaths[i], shot)
    );
    for (let i = 0; i < frames.length && isRecording; i++) {
      files.push(screenshotFile(framePaths[i], frames[i]));
    }
    files.push(
      issueMarkdownFile(mdPath, {
        id,
        url: env.url,
        selector: entry.selector,
        mode: input.mode,
        viewport: env.viewport,
        screenshot: pngPaths[0] ?? null,
        ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
        ...(input.category ? { category: input.category } : {}),
        // Checklist fail-evidence link (only when this issue came from a ✗).
        ...(input.checklistItem !== undefined
          ? { checklistItem: input.checklistItem }
          : {}),
        // Element metadata: forwarded when the UI provides it (element mode
        // passes values; other modes pass null so the fields are present).
        ...(input.selectorStrategy !== undefined
          ? { selectorStrategy: input.selectorStrategy }
          : {}),
        ...(input.selectorUnique !== undefined
          ? { selectorUnique: input.selectorUnique }
          : {}),
        ...(input.elementText !== undefined
          ? { elementText: input.elementText }
          : {}),
        ...(input.domPath !== undefined ? { domPath: input.domPath } : {}),
        ...(input.screen !== undefined ? { screen: input.screen } : {}),
        ...(input.masked !== undefined ? { masked: input.masked } : {}),
        // Reporter + custom mirrored into each issue (present only when
        // configured), so an issue file is self-contained.
        ...(reporter !== undefined ? { reporter } : {}),
        ...(custom !== undefined ? { custom } : {}),
        // Runtime context, mirrored per issue (present only once setContext ran).
        ...(context !== undefined ? { context } : {}),
        // Nearest named React component (element mode); null when unknown.
        ...(input.component !== undefined ? { component: input.component } : {}),
        // Captured page errors: `errors_count` is always present once capture is
        // engaged (0 when off/none); the `## Errors` section only when non-empty.
        errors: errorSnapshot,
        errorsAt: createdAtMs,
        errorsCount: errorSnapshot.length,
        // Action trail: same shape as errors (## Actions + actions_count).
        actions: actionSnapshot,
        actionsAt: createdAtMs,
        actionsCount: actionSnapshot.length,
        // Record mode: recording flag + frames dir (only for recordings).
        ...(isRecording
          ? {
              recording: true,
              framesCount: frames.length,
              framesDir: framesDir as string,
            }
          : {}),
        createdAt,
        comment,
      })
    );
    // session.yaml is upserted with every issue so the session stays
    // consistent even if the tab is closed right after.
    files.push(sessionYamlFile(state));

    return {
      sessionId: state.session_id,
      issueId: id,
      files,
      delivered: enqueueDelivery(state.session_id, files),
    };
  }

  return {
    actions: actionCapture,
    config: resolvedConfig,
    enabled,
    // Promise-wrapped so the public API stays async while the artifact build
    // itself is synchronous.
    captureIssue: (input) => Promise.resolve().then(() => doCapture(input)),
    getSession: () => sessions.read(),
    getIssueCount: () => sessions.read()?.issues.length ?? 0,
    getPendingDeliveries: () => pendingDeliveries,
    redeliver: (capture) => enqueueDelivery(capture.sessionId, capture.files),
    setContext: (next) => {
      context = normalizeContext(next ?? {}, context ?? null);
    },
    getChecklist: () => checklistDef,
    getChecklistState: () => sessions.read()?.checklist ?? null,
    whenChecklistReady: () => checklistReady,
    recordVerdict: (itemId, verdict, issueId = null) => {
      if (!enabled) {
        return;
      }
      if (!checklistDef) {
        console.warn(
          "[sluglist] recordVerdict called with no checklist configured"
        );
        return;
      }
      const state = ensureSession();
      const item = state.checklist?.items.find((i) => i.id === itemId);
      if (!item) {
        console.warn(`[sluglist] unknown checklist item "${itemId}"`);
        return;
      }
      item.verdict = verdict;
      // A fail carries its evidencing issue; pass/skip drop any prior link.
      item.issue = verdict === "fail" ? (issueId ?? item.issue) : null;
      item.ts = isoTimestamp(new Date());
      sessions.write(state);
      // Put-per-verdict: re-put only the session index (like put-per-issue),
      // so a verdict survives the tab closing right after.
      enqueueDelivery(state.session_id, [sessionYamlFile(state)]);
    },
  };
}
