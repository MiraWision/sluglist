import {
  attachmentFile,
  issueMarkdownFile,
  screenshotFile,
  sessionYamlFile,
} from "./artifacts";
import { attachmentPath, extensionOf } from "./attachments";
import { normalizeForm, type ResolvedFormField } from "./form";
import { type ActionCapture, type ActionRecord, createActionCapture } from "./actions";
import {
  type ChecklistDef,
  type ChecklistState,
  normalizeChecklist,
  seedChecklistState,
  type Verdict,
} from "./checklist";
import { deliver } from "./deliver";
import {
  type ErrorCapture,
  type ErrorRecord,
  createErrorCapture,
} from "./errors";
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
import { createGuard, type WidgetGuard } from "./guard";
import { resolveDismiss, resolveErrors, resolvePrivacy } from "./preset";
import { scrub, scrubMaybe } from "./scrub";
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
  AttachmentMeta,
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
  /**
   * Fault isolation shared by the core and the UI. Every wrapper and listener
   * the widget installs runs through it; after repeated internal failures it
   * trips and the widget uninstalls itself. The UI registers its own teardown
   * here at mount.
   */
  readonly guard: WidgetGuard;
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
  /**
   * Clear an item's verdict back to "not tested" (verdict → null), upserting
   * session.yaml. The `issue` link (if any) is intentionally preserved: an issue
   * already delivered is not retractable, so the connection stays in the yaml
   * for the fix-skill even though the client withdrew their sign-off. No-op when
   * no checklist is configured.
   */
  clearVerdict(itemId: string): void;
  /**
   * The validated `form` config (empty when none is configured). The UI renders
   * `scope: "issue"` fields on every issue and `scope: "session"` fields only
   * while {@link FeedbackWidgetCore.needsSessionForm} is true.
   */
  readonly formFields: ResolvedFormField[];
  /**
   * Whether the session-scoped block still has to be asked. False once
   * {@link FeedbackWidgetCore.setSessionForm} has run for this session — the
   * reporter is asked once, not on every issue.
   */
  needsSessionForm(): boolean;
  /**
   * Store the session-scoped answers on the session and re-put session.yaml.
   * No-op when no session-scoped fields are configured.
   */
  setSessionForm(values: Record<string, string | number | boolean>): void;
  /** Number of issues captured in the current session. */
  getIssueCount(): number;
  /** Number of delivery batches still uploading. */
  getPendingDeliveries(): number;
  /**
   * How many batches are waiting in the offline outbox — undelivered work from
   * this load or a previous one. Zero when the outbox is disabled or
   * unavailable. The UI shows it in the capture menu; surface it in your own
   * chrome if a stuck report matters to your team.
   */
  pendingBatches(): Promise<number>;
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
  /** Test seam: fault guard override (e.g. a lower failure threshold). */
  guard?: WidgetGuard;
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

/**
 * Project slug when the host did not pick one. Derived from the hostname, so
 * artifacts from `app.acme.com` land under `app-acme-com/` without anyone
 * having to name anything. Naming the project stays the better choice — this
 * exists so `createFeedbackWidget({ connectors })` is a complete, working call
 * on its own, which is the whole promise of the quick start.
 */
export function defaultProjectSlug(hostname?: string): string {
  const source =
    hostname ??
    (typeof window !== "undefined" ? window.location?.hostname : "") ??
    "";
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return PROJECT_SLUG.test(slug) ? slug : "app";
}

/**
 * Scrub the page-derived text carried by an error record. `message` covers all
 * four sources — console text, exception and rejection messages, and the
 * `METHOD /path → status` line of a network failure, where the path segments
 * are what needs redacting.
 */
function scrubErrors(records: ErrorRecord[]): ErrorRecord[] {
  return records.map((record) => ({
    ...record,
    message: scrub(record.message),
    ...(record.stack !== undefined ? { stack: scrub(record.stack) } : {}),
  }));
}

/**
 * Scrub the page-derived text carried by an action record: the visible label of
 * a clicked element, the selector it resolved to, and the paths of an SPA
 * navigation. `chars`, `kind`, `frame` and `clip` are counts and never text.
 */
function scrubActions(records: ActionRecord[]): ActionRecord[] {
  return records.map((record) => ({
    ...record,
    ...(record.selector !== undefined ? { selector: scrub(record.selector) } : {}),
    ...(record.elementText !== undefined
      ? { elementText: scrub(record.elementText) }
      : {}),
    ...(record.from !== undefined ? { from: scrub(record.from) } : {}),
    ...(record.to !== undefined ? { to: scrub(record.to) } : {}),
  }));
}

export function createFeedbackWidget(
  config: FeedbackWidgetConfig,
  options: CreateFeedbackWidgetOptions = {}
): FeedbackWidgetCore {
  // An omitted project is filled in from the hostname; a provided one still has
  // to be a valid slug, because it becomes a storage path.
  const project = config.project ?? defaultProjectSlug();
  if (config.project !== undefined && !PROJECT_SLUG.test(config.project)) {
    throw new Error(
      `[feedback-widget] invalid project slug: ${JSON.stringify(config.project)}`
    );
  }
  const enabled = config.enabled !== false;
  // Resolve the preset once so `core.config` exposes the effective options: the
  // UI reads `privacy` for masking + the consent checkbox and `dismiss` for the
  // ✕, and the core reads `privacy.scrubText` when building artifacts.
  const resolvedPrivacy = resolvePrivacy(config);
  const resolvedErrors = resolveErrors(config);
  const resolvedConfig: FeedbackWidgetConfig = {
    ...config,
    // The UI and the storage keys read this, so it must be the resolved slug,
    // not the possibly-absent one the caller passed.
    project,
    privacy: resolvedPrivacy,
    ...(resolvedErrors !== undefined ? { errors: resolvedErrors } : {}),
    dismiss: resolveDismiss(config),
  };
  // Text scrubbing is a build-time transform, decided once at init.
  const scrubbing = resolvedPrivacy?.scrubText === true;
  // `scrubbed` is emitted only when scrubText was set explicitly (directly or
  // by the production preset), so dev and default-beta artifacts are unchanged.
  const scrubbedFlag =
    resolvedPrivacy?.scrubText === undefined
      ? undefined
      : resolvedPrivacy.scrubText === true;
  const text = (value: string): string => (scrubbing ? scrub(value) : value);
  // Identity + custom are validated once at init and fixed for the session.
  // `undefined` means "not configured" → the fields are omitted from artifacts
  // (backward compatible); `null` means "configured but empty".
  const reporter = normalizeIdentity(config.identity);
  const custom = normalizeCustom(config.custom);
  // Reporter form fields, validated once at init. An invalid field is dropped
  // with a warning; an absent `form` leaves the panel exactly as it was.
  const formFields = normalizeForm(config.form);
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
  // One guard per widget, shared by every wrapper, listener and the UI. When it
  // trips, the teardowns registered below put the page back exactly as it was.
  const guard = options.guard ?? createGuard();
  // Error capture starts at widget init (not on panel open) so errors that
  // happen before the reporter opens the widget are still recorded.
  const errorCapture =
    options.errorCapture ?? createErrorCapture({ ...resolvedErrors, guard });
  // Action trail installs at widget init too, so actions before the widget is
  // opened are still in the buffer.
  const actionCapture =
    options.actionCapture ?? createActionCapture({ ...config.actions, guard });
  // Self-disable path: restore console/fetch/XHR/history and drop every
  // document listener the capture modules installed.
  guard.onTrip(() => errorCapture.uninstall());
  guard.onTrip(() => actionCapture.uninstall());
  const sessions = new SessionManager({
    project,
    storage: options.storage,
  });
  const readEnvironment = options.environment ?? collectPageEnvironment;
  const queue =
    options.queue ??
    (config.offlineQueue === false
      ? NOOP_QUEUE
      : createOfflineQueue(project));
  // Deliveries are chained so batches never interleave: otherwise a slow
  // upload of issue N's session.yaml could overwrite the newer index written
  // by issue N+1.
  let deliveryQueue: Promise<unknown> = Promise.resolve();
  let pendingDeliveries = 0;

  // Warn before the tab closes while uploads are still in flight, so the
  // last issue is not silently lost.
  if (typeof window !== "undefined") {
    const onBeforeUnload = guard.wrap(
      "widget.beforeunload",
      (event: BeforeUnloadEvent) => {
        if (pendingDeliveries > 0) {
          event.preventDefault();
          event.returnValue = "";
        }
      }
    );
    window.addEventListener("beforeunload", onBeforeUnload);
    // Registered so a tripped breaker leaves no listener behind — a widget that
    // switched itself off must not still be blocking the host's tab close.
    guard.onTrip(() =>
      window.removeEventListener("beforeunload", onBeforeUnload)
    );
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
      let delivered = 0;
      for (const batch of pending) {
        const report = await deliver(
          config.connectors,
          batch.sessionId,
          batch.files
        );
        if (report.ok) {
          await queue.remove(batch.id);
          delivered++;
        }
      }
      if (pending.length > 0 || config.onQueueFlush) {
        // Reported even when empty, so a caller can use it as "the outbox is
        // settled" rather than having to guess when to ask.
        guard.run(
          "config.onQueueFlush",
          () =>
            config.onQueueFlush?.({
              batches: pending.length,
              delivered,
              failed: pending.length - delivered,
            }),
          undefined
        );
      }
    });
  }
  flushQueue();

  // Session metadata factory (shared by capture and verdict recording), so a
  // verdict recorded before any issue creates a session identically to a capture.
  function makeMeta(): Omit<SessionMeta, "session_id" | "created_at"> {
    const env = readEnvironment();
    return {
      project,
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
    // `url` is `pathname + search`, so it carries whatever the app puts in the
    // query string — tokens and emails included. Scrubbed like any other
    // page-derived text surface, in both the issue file and the session index.
    const issueUrl = text(env.url);

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
    // Attachments: named after the issue, never after the reporter's file (a
    // remote-supplied name must not become a path). The original name is kept
    // in the metadata, where it is data rather than a location.
    const attachmentInputs = input.attachments ?? [];
    const attachmentsMeta: AttachmentMeta[] = attachmentInputs.map(
      (file, i) => ({
        file: attachmentPath(id, slug, i, extensionOf(file.name) || "bin"),
        mime: file.mime,
        size: file.blob.size,
        original_name: file.name,
      })
    );
    const createdAtMs = now();
    const createdAt = isoTimestamp(new Date(createdAtMs));
    // Snapshot the error + action buffers at issue time; relative ages vs createdAtMs.
    // Both carry arbitrary page text, so both go through the scrub when it is on.
    const rawErrors = errorCapture.snapshot();
    const rawActions = actionCapture.snapshot();
    const errorSnapshot = scrubbing ? scrubErrors(rawErrors) : rawErrors;
    const actionSnapshot = scrubbing ? scrubActions(rawActions) : rawActions;

    // Record-mode clips: each Record→Stop cycle is one clip, written to its own
    // `<framesDir>/clip-NN/` subfolder of numbered PNGs (additive, only when set).
    // `clips` wins; a legacy flat `frames` array is treated as a single clip.
    const clipBlobs: Blob[][] = (
      input.clips ?? (input.frames ? [input.frames] : [])
    ).filter((c) => c.length > 0);
    const frameTotal = clipBlobs.reduce((n, c) => n + c.length, 0);
    const isRecording = input.recording === true && frameTotal > 0;
    const framesDir = isRecording ? `${id}-${slug}-frames` : null;
    const clipId = (ci: number): string => `clip-${String(ci + 1).padStart(2, "0")}`;
    // Flat list of [path, blob] for every frame across every clip.
    const framePairs: { path: string; blob: Blob }[] = isRecording
      ? clipBlobs.flatMap((clip, ci) =>
          clip.map((blob, fi) => ({
            path: `${framesDir}/${clipId(ci)}/${String(fi + 1).padStart(2, "0")}.png`,
            blob,
          }))
        )
      : [];
    const clipsMeta = isRecording
      ? clipBlobs.map((clip, ci) => ({ id: clipId(ci), frames: clip.length }))
      : [];

    const entry: IssueIndexEntry = {
      id,
      file: mdPath,
      screenshot: pngPaths[0] ?? null,
      ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.screen ? { screen: input.screen } : {}),
      ...(isRecording ? { frames: frameTotal } : {}),
      url: issueUrl,
      selector: scrubbing ? scrubMaybe(input.selector ?? null) : (input.selector ?? null),
      created_at: createdAt,
    };
    state.issues.push(entry);
    sessions.write(state);

    const files: ArtifactFile[] = shots.map((shot, i) =>
      screenshotFile(pngPaths[i], shot)
    );
    for (const frame of framePairs) {
      files.push(screenshotFile(frame.path, frame.blob));
    }
    attachmentInputs.forEach((file, i) => {
      files.push(
        attachmentFile(attachmentsMeta[i].file, file.blob, file.mime)
      );
    });
    files.push(
      issueMarkdownFile(mdPath, {
        id,
        url: issueUrl,
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
        // Element text and dom path are read straight off the page, so they are
        // scrubbed alongside the other text surfaces.
        ...(input.elementText !== undefined
          ? {
              elementText: scrubbing
                ? scrubMaybe(input.elementText)
                : input.elementText,
            }
          : {}),
        ...(input.domPath !== undefined
          ? { domPath: scrubbing ? scrubMaybe(input.domPath) : input.domPath }
          : {}),
        ...(input.screen !== undefined ? { screen: input.screen } : {}),
        ...(input.masked !== undefined ? { masked: input.masked } : {}),
        ...(scrubbedFlag !== undefined ? { scrubbed: scrubbedFlag } : {}),
        // A failed render never blocks the issue; it is recorded instead. The
        // message comes from the renderer, so it is a page-derived text surface
        // and goes through the scrub with the rest of them.
        ...(input.screenshotFailed
          ? {
              screenshotFailed: true,
              screenshotError: input.screenshotError
                ? text(input.screenshotError)
                : null,
            }
          : {}),
        // Reporter-entered fields (scope: "issue"). Deliberately NOT scrubbed —
        // see the note on collectValues.
        ...(input.form !== undefined ? { form: input.form } : {}),
        ...(attachmentsMeta.length > 0
          ? { attachments: attachmentsMeta }
          : {}),
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
        // Record mode: recording flag + frames dir + per-clip breakdown.
        ...(isRecording
          ? {
              recording: true,
              framesCount: frameTotal,
              framesDir: framesDir as string,
              clips: clipsMeta,
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
    guard,
    // Promise-wrapped so the public API stays async while the artifact build
    // itself is synchronous.
    captureIssue: (input) => Promise.resolve().then(() => doCapture(input)),
    getSession: () => sessions.read(),
    formFields,
    needsSessionForm: () =>
      formFields.some((f) => f.scope === "session") &&
      sessions.read()?.form === undefined,
    setSessionForm: (values) => {
      if (!(enabled && formFields.some((f) => f.scope === "session"))) {
        return;
      }
      const state = ensureSession();
      state.form = values;
      sessions.write(state);
      // Put-per-answer, like put-per-verdict: the answers survive the tab
      // closing between the first issue and the next.
      enqueueDelivery(state.session_id, [sessionYamlFile(state)]);
    },
    getIssueCount: () => sessions.read()?.issues.length ?? 0,
    getPendingDeliveries: () => pendingDeliveries,
    pendingBatches: () => queue.all().then((batches) => batches.length),
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
    clearVerdict: (itemId) => {
      if (!enabled || !checklistDef) {
        return;
      }
      const state = ensureSession();
      const item = state.checklist?.items.find((i) => i.id === itemId);
      if (!item || item.verdict === null) {
        return;
      }
      item.verdict = null;
      // `issue` is deliberately left in place (see interface docs).
      item.ts = isoTimestamp(new Date());
      sessions.write(state);
      enqueueDelivery(state.session_id, [sessionYamlFile(state)]);
    },
  };
}
