import {
  issueMarkdownFile,
  screenshotFile,
  sessionYamlFile,
} from "./artifacts";
import { type ActionCapture, createActionCapture } from "./actions";
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
import { normalizeCustom, normalizeIdentity } from "./reporter";
import { type KeyValueStorage, SessionManager } from "./session";
import { slugFromComment } from "./slug";
import type {
  ArtifactFile,
  CaptureIssueInput,
  CaptureResult,
  DeliveryReport,
  FeedbackWidgetConfig,
  IssueIndexEntry,
  SessionState,
} from "./types";

export interface FeedbackWidgetCore {
  /** Background action trail; the UI's record mode subscribes to it for frames. */
  readonly actions: ActionCapture;
  /** Capture and deliver one issue. Resolves once artifacts are built; delivery runs in the background. */
  captureIssue(input: CaptureIssueInput): Promise<CaptureResult | null>;
  readonly config: FeedbackWidgetConfig;
  readonly enabled: boolean;
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
    const state = sessions.ensure(() => ({
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
    }));

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

    const entry: IssueIndexEntry = {
      id,
      file: mdPath,
      screenshot: pngPaths[0] ?? null,
      ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.screen ? { screen: input.screen } : {}),
      url: env.url,
      selector: input.selector ?? null,
      created_at: createdAt,
    };
    state.issues.push(entry);
    sessions.write(state);

    const files: ArtifactFile[] = shots.map((shot, i) =>
      screenshotFile(pngPaths[i], shot)
    );
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
        // Captured page errors: `errors_count` is always present once capture is
        // engaged (0 when off/none); the `## Errors` section only when non-empty.
        errors: errorSnapshot,
        errorsAt: createdAtMs,
        errorsCount: errorSnapshot.length,
        // Action trail: same shape as errors (## Actions + actions_count).
        actions: actionSnapshot,
        actionsAt: createdAtMs,
        actionsCount: actionSnapshot.length,
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
  };
}
