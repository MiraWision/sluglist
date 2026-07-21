import {
  issueMarkdownFile,
  screenshotFile,
  sessionYamlFile,
} from "./artifacts";
import { deliver } from "./deliver";
import {
  collectPageEnvironment,
  isoTimestamp,
  type PageEnvironment,
} from "./metadata";
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
  /** Test seam: environment override instead of reading from window. */
  environment?: () => PageEnvironment;
  /** Test seam: storage override for the session manager. */
  storage?: KeyValueStorage;
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
  const sessions = new SessionManager({
    project: config.project,
    storage: options.storage,
  });
  const readEnvironment = options.environment ?? collectPageEnvironment;
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
      .then(() => deliver(config.connectors, sessionId, files))
      .finally(() => {
        pendingDeliveries--;
      });
    deliveryQueue = delivered;
    return delivered;
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
    const createdAt = isoTimestamp();

    const entry: IssueIndexEntry = {
      id,
      file: mdPath,
      screenshot: pngPaths[0] ?? null,
      ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
      ...(input.category ? { category: input.category } : {}),
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
        createdAt,
        comment,
        consoleErrors: input.consoleErrors,
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
    config,
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
