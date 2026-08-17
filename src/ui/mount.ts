import { applyMask } from "../mask";
import {
  type ChecklistDef,
  checklistProgress,
  type ChecklistState,
  matchUrlPattern,
  type Verdict,
} from "../checklist";
import {
  clearDismissed,
  isDismissed as readIsDismissed,
  setDismissed,
} from "../dismiss";
import { DEFAULT_DISMISS_DAYS } from "../preset";
import {
  type CaptureOptions,
  captureArea,
  captureElement,
  captureFullPage,
} from "../screenshot";
import {
  type AttachmentPolicy,
  checkAttachment,
  extensionOf,
  formatBytes,
  isImageAttachment,
  resolveAttachments,
} from "../attachments";
import {
  collectValues,
  type FormValue,
  type ResolvedFormField,
  validateValue,
} from "../form";
import type {
  AttachmentInput,
  CaptureMode,
  CaptureResult,
  FeedbackPrivacy,
} from "../types";
import type { FeedbackWidgetCore } from "../widget";
import { annotateBlob } from "./annotate";
import {
  collectElementMetadata,
  type ElementMetadata,
} from "../selector";
import {
  formatShortcut,
  matchesShortcut,
  resolveShortcut,
} from "../shortcut";
import { createRecorder } from "./record";
import {
  DEFAULT_STRINGS,
  defaultPluralForm,
  type FeedbackWidgetStrings,
  formatString,
  interpolate,
  plural,
} from "./strings";
import { type UiTheme, widgetStyles } from "./styles";

export interface IssueCategory {
  key: string;
  label: string;
}

export interface FeedbackWidgetUiConfig {
  /** Button accent color. Default near-black graphite. */
  accentColor?: string;
  /**
   * Triage categories shown as chips. Defaults to Bug / Design / Idea.
   * Pass an empty array to hide the chips entirely.
   */
  categories?: IssueCategory[];
  /**
   * Where to mount the widget. Defaults to document.body. Pass any element
   * (e.g. a container in a Chrome extension content script or a custom app
   * region) to embed the widget there instead.
   */
  container?: HTMLElement;
  /**
   * Global hotkey that toggles the widget menu, as "modifier+key".
   * Default "Shift+F". Pass null to disable.
   */
  hotkey?: string | null;
  /** Called after an issue is captured (before background delivery settles). */
  onIssueCaptured?: (result: CaptureResult) => void;
  /** Button corner. Default "bottom-right". */
  position?: "bottom-left" | "bottom-right";
  /** Overrides for user-facing texts (labels, hints, toasts). */
  strings?: Partial<FeedbackWidgetStrings>;
}

export interface MountedFeedbackWidget {
  /**
   * Hide the widget as if the reporter clicked the ✕: the launcher, the
   * shortcut and every panel go away, and the dismissal is persisted. Works
   * whether or not the ✕ itself is enabled.
   */
  dismiss(): void;
  /** Whether the widget is currently hidden by a dismissal. */
  isDismissed(): boolean;
  /**
   * Clear any dismissal and bring the widget back immediately. This is the
   * rescue path: wire it to a "Report a problem" link in your own footer so a
   * customer who dismissed the launcher can always get it back. See the
   * Production section of the README.
   */
  show(): void;
  /**
   * Open the capture menu now, exactly as clicking the launcher does.
   *
   * This is for **your own** entry point — a "Report a problem" item in your
   * menu, a footer link, a help panel — where {@link show} is not enough:
   * `show()` only brings the launcher back and leaves the reporter to find it
   * in the corner. A dismissed widget is un-dismissed first, so a call always
   * ends with an open menu.
   */
  open(): void;
  unmount(): void;
}

interface Draft {
  category: string | null;
  /** Checklist item this draft answers with fail-evidence; null for normal issues. */
  checklistItem: string | null;
  comment: string;
  mode: CaptureMode;
  meta: ElementMetadata | null;
  selector: string | null;
  shots: Blob[];
  urls: string[];
  /** Screenshots still rendering in the background. */
  pending: number;
  /** In-flight capture tasks, awaited before an issue is sent. */
  captures: Promise<void>[];
  /** True if masking redacted at least one element on any shot. */
  maskedAny: boolean;
  /**
   * Files the reporter attached (picker / drop / paste). Images also get an
   * object URL in `attachmentUrls` so they show as real thumbnails and can be
   * annotated like a captured screenshot.
   */
  attachments: DraftAttachment[];
  /**
   * A screenshot was attempted for this issue and failed to render. The issue
   * is still sent — this is what the artifact records instead of the picture.
   */
  screenshotFailed: boolean;
  screenshotError: string | null;
  /** Answers to the reporter form, keyed by field key (session + issue scope). */
  answers: Map<string, FormValue>;
  /**
   * Record mode: one clip per Record→Stop cycle. Kept as separate sequences (not
   * a single flat frame list) so two recordings on the same issue stay distinct
   * clips end to end — in the thumbnails and in the artifacts.
   */
  recording: boolean;
  clips: RecordingClip[];
}

interface DraftAttachment {
  blob: Blob;
  /** Original name from the reporter's machine. */
  name: string;
  mime: string;
  /** Lowercase extension without the dot. */
  extension: string;
  /** Object URL — images only (revoked with the draft). */
  url: string | null;
}

interface RecordingClip {
  frames: Blob[];
  /** Object URLs for the frames (revoked on discard). */
  urls: string[];
}

function defaultCategories(s: FeedbackWidgetStrings): IssueCategory[] {
  return [
    { key: "bug", label: s.categoryBug },
    { key: "design", label: s.categoryDesign },
    { key: "idea", label: s.categoryIdea },
  ];
}

const HOST_ATTRIBUTE = "data-feedback-widget";
const TOAST_MS = 2600;
const DEFAULT_SHORTCUT = "Shift+F";

// sluglist brand mark: the slug mascot (body + two antennae), rendered in
// currentColor. Only the dark art from the 512x512 logo is kept — the button
// itself provides the circular background — and the viewBox is cropped to it.
const FEEDBACK_ICON_SVG = `<svg viewBox="90 82 322 286" width="24" height="24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M341 120C341 133.255 330.255 144 317 144C303.745 144 293 133.255 293 120C293 106.745 303.745 96 317 96C330.255 96 341 106.745 341 120Z"/><path d="M399 156C399 169.255 388.255 180 375 180C361.745 180 351 169.255 351 156C351 142.745 361.745 132 375 132C388.255 132 399 142.745 399 156Z"/><path d="M258 185C311.484 185 350.579 212.45 373.046 243.839C384.237 259.474 391.548 276.403 394.434 291.92C397.231 306.96 396.218 322.919 387.536 334.284C382.961 340.273 377.432 344.574 370.83 347.219C364.412 349.79 357.622 350.539 350.84 350.466C337.999 350.328 321.444 346.997 303.142 344.27C265.412 338.646 210.231 333.572 126.781 353.226C113.761 356.292 99.1403 346.113 101.601 330.486C104.507 312.029 112.736 276.043 135.62 244.407C158.925 212.19 197.138 185 258 185ZM258 209C205.615 209 174.333 231.838 155.066 258.474C137.357 282.956 129.574 311.059 126.26 328.715C210.661 309.543 267.559 314.7 306.68 320.531C327.185 323.587 340.456 326.353 351.098 326.467C356.057 326.52 359.423 325.934 361.905 324.939C364.203 324.019 366.319 322.523 368.464 319.716C371.165 316.18 373.094 308.438 370.838 296.309C368.671 284.657 362.934 270.948 353.529 257.809C334.805 231.648 302.516 209 258 209Z"/><path d="M326.394 127.468C308.125 150.449 296.84 173.733 291.771 199.331L268.229 194.669C274.14 164.817 287.294 138.084 307.606 112.532L326.394 127.468Z"/><path d="M380.794 165.717C357.933 179.8 346.834 197.498 339.232 217.722L316.768 209.278C325.707 185.494 339.673 162.861 368.206 145.283L380.794 165.717Z"/></svg>`;

// Checklist button: a clipboard with a check — a distinct mark from the slug so
// the two stacked circles read as different actions.
const CHECKLIST_ICON_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2"/><path d="M9 13l2 2 4-4"/></svg>`;

// A clean accordion chevron (points down when open; the collapsed class rotates
// it to point right). Crisper and more visible than a `▾` glyph.
const CHEVRON_SVG = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}


/**
 * Mount the capture UI on the host page. Styles and markup live inside a
 * shadow root so nothing leaks in either direction; the host element carries
 * data-feedback-widget so screenshot capture excludes the widget itself.
 */
export function mountFeedbackWidget(
  core: FeedbackWidgetCore,
  uiConfig: FeedbackWidgetUiConfig = {}
): MountedFeedbackWidget {
  if (!core.enabled) {
    return {
      dismiss: () => undefined,
      isDismissed: () => false,
      show: () => undefined,
      open: () => undefined,
      unmount: () => undefined,
    };
  }

  const theme: UiTheme = {
    accentColor: uiConfig.accentColor ?? "#18181b",
    position: uiConfig.position ?? "bottom-right",
  };
  const strings: FeedbackWidgetStrings = {
    ...DEFAULT_STRINGS,
    ...uiConfig.strings,
  };
  const categories = uiConfig.categories ?? defaultCategories(strings);
  const container = uiConfig.container ?? document.body;
  // Privacy comes from the core config (masking + consent). `data-private`
  // masking runs even with no privacy config; the `masked` frontmatter flag is
  // emitted whenever privacy is explicitly configured.
  const privacy: FeedbackPrivacy = core.config.privacy ?? {};
  const privacyConfigured = core.config.privacy !== undefined;
  const consentEnabled = privacy.screenshotConsent === true;
  // Dismiss: resolved by the preset (on in production, off in dev/beta).
  const dismissCfg = core.config.dismiss ?? {};
  const dismissEnabled = dismissCfg.enabled === true;
  const dismissDays = dismissCfg.days ?? DEFAULT_DISMISS_DAYS;
  // Record mode config (frames per action).
  const recCfg = core.config.recording ?? {};
  // Screenshot render limits, shared by every mode and by record frames.
  const captureOptions: CaptureOptions = { ...(core.config.capture ?? {}) };
  /**
   * Coarse pointer = graceful mode (see below). Detected from the pointer, not
   * the user agent: a touch laptop reports a fine pointer and keeps the full
   * menu, and a UA string proves nothing about the input device.
   */
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches);
  // Record mode needs a stream of deliberate clicks; on a touch screen the
  // frames land mid-scroll and the result is unreadable. Hidden rather than
  // half-working — see the mobile section of the README.
  const recordingEnabled = recCfg.enabled !== false && !coarsePointer;
  const attachPolicy: AttachmentPolicy = resolveAttachments(
    core.config.attachments,
    core.config.preset
  );
  // Reporter form: `issue` fields on every issue, `session` fields on the first
  // one only. Empty unless `form` is configured.
  const issueFields = core.formFields.filter((f) => f.scope === "issue");
  const sessionFields = core.formFields.filter((f) => f.scope === "session");
  const recorder = createRecorder({
    actions: core.actions,
    maxFrames: recCfg.maxFrames ?? 30,
    frameMinInterval: recCfg.frameMinInterval ?? 650,
    privacy,
    captureOptions,
    onChange: () => syncRecordingUi(),
  });
  // Resolve the toggle shortcut: core `config.shortcut` (new, canonical) wins,
  // then the legacy `uiConfig.hotkey`, then the default. `false`/`null` disable
  // it; an invalid string warns and falls back to the default.
  const rawShortcut: string | false | null =
    core.config.shortcut !== undefined
      ? core.config.shortcut
      : (uiConfig.hotkey ?? DEFAULT_SHORTCUT);
  const shortcut = resolveShortcut(rawShortcut);
  const shortcutLabel = shortcut ? formatShortcut(shortcut) : "";

  /**
   * Wrap a UI handler so a render or click failure is counted by the shared
   * guard instead of escaping into the host page. On failure the panels are
   * closed: a half-rendered dialog the reporter cannot dismiss is worse than no
   * dialog, and closing keeps the page usable rather than leaving an overlay
   * stuck over it.
   */
  function guardUi<A extends unknown[]>(
    site: string,
    handler: (...args: A) => void
  ): (...args: A) => void {
    return core.guard.wrap(site, handler, () => {
      resetModes();
      closeMenu();
      closePanel();
      closeChecklistPanel();
    });
  }

  const host = el("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  host.style.pointerEvents = "none";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = widgetStyles(theme);
  shadow.appendChild(style);

  // The beta and production presets relabel the button to "Report a problem"
  // (it faces real users) unless the caller set an explicit buttonLabel string.
  const realUserPreset =
    core.config.preset === "beta" || core.config.preset === "production";
  const buttonLabel =
    uiConfig.strings?.buttonLabel ??
    (realUserPreset ? strings.reportProblem : strings.buttonLabel);
  const fab = el("button", "fab");
  fab.type = "button";
  fab.title = shortcut ? `${buttonLabel} (${shortcutLabel})` : buttonLabel;
  fab.setAttribute("aria-label", buttonLabel);
  const fabIcon = el("span", "fab-icon");
  // Inline SVG (message-with-pencil) so the glyph is never a missing / empty
  // emoji box on systems without the character.
  fabIcon.innerHTML = FEEDBACK_ICON_SVG;
  const fabLabel = el("span", "fab-label");
  fabLabel.textContent = buttonLabel;
  const badge = el("span", "badge");
  // Dismiss ✕: a sibling of the launcher (a button cannot nest inside a
  // button), positioned against its corner by .fab-wrap.
  const fabWrap = el("div", "fab-wrap");
  const dismissBtn = el("button", "fab-dismiss");
  dismissBtn.type = "button";
  dismissBtn.textContent = "×";
  dismissBtn.title = strings.dismiss;
  dismissBtn.setAttribute("aria-label", strings.dismiss);
  if (dismissEnabled) {
    dismissBtn.classList.add("enabled");
    fab.classList.add("has-dismiss");
  }
  fab.append(fabIcon, fabLabel);
  if (shortcut && !coarsePointer) {
    const fabHotkey = el("span", "fab-hotkey");
    fabHotkey.textContent = shortcutLabel;
    fab.appendChild(fabHotkey);
  }
  fab.appendChild(badge);
  // Recording indicator: a red dot on the button while record mode is active.
  const recDot = el("span", "rec-dot");
  recDot.style.display = "none";
  fab.appendChild(recDot);
  fabWrap.append(fab, dismissBtn);

  const menu = el("div", "menu");
  const menuItems: { button: HTMLButtonElement; run: () => void }[] = [];
  // The hotkey digit follows the item's position in the menu.
  function menuItem(label: string, run: () => void) {
    const button = el("button");
    const text = el("span");
    text.textContent = label;
    button.appendChild(text);
    if (!coarsePointer) {
      const kbd = el("kbd");
      kbd.textContent = String(menuItems.length + 1);
      button.appendChild(kbd);
    }
    const guardedRun = guardUi(`ui.menu:${label}`, run);
    button.addEventListener("click", guardedRun);
    menu.appendChild(button);
    // The keyboard path (digit hotkeys) runs the same guarded handler.
    menuItems.push({ button, run: guardedRun });
  }

  const hint = el("div", "hint");
  const highlight = el("div", "highlight");
  const areaOverlay = el("div", "area-overlay");
  const areaRect = el("div", "area-rect");

  // Recording bar: shown while record mode is active (status + what's being
  // captured + manual frame + stop/cancel).
  const recBar = el("div", "rec-bar");
  const recBarDot = el("span", "rec-bar-dot");
  const recBarCol = el("span", "rec-bar-col");
  const recBarText = el("span", "rec-bar-text");
  const recBarHint = el("span", "rec-bar-hint");
  recBarHint.textContent = strings.recordingHint;
  recBarCol.append(recBarText, recBarHint);
  const recSnapBtn = el("button", "rec-snap");
  recSnapBtn.type = "button";
  const recSnapText = el("span");
  recSnapText.textContent = strings.recordingSnap;
  recSnapBtn.appendChild(recSnapText);
  if (!coarsePointer) {
    const recSnapKbd = el("kbd");
    recSnapKbd.textContent = "S";
    recSnapBtn.appendChild(recSnapKbd);
  }
  const recStopBtn = el("button", "rec-stop");
  recStopBtn.type = "button";
  recStopBtn.textContent = strings.recordingStop;
  const recCancelBtn = el("button", "rec-cancel");
  recCancelBtn.type = "button";
  recCancelBtn.textContent = strings.recordingCancel;
  recBar.append(recBarDot, recBarCol, recSnapBtn, recStopBtn, recCancelBtn);
  recBar.style.display = "none";

  // Corner panel instead of a centered modal: the page stays visible and
  // scrollable while the reporter writes the comment.
  const panel = el("div", "panel");
  const panelTitle = el("h2");
  const panelContext = el("p", "panel-context");
  const thumbs = el("div", "thumbs");
  const chips = el("div", "chips");
  const chipButtons = categories.map(({ key, label }) => {
    const chip = el("button", "chip");
    chip.type = "button";
    chip.textContent = label;
    chip.dataset.category = key;
    chip.addEventListener("click", () => {
      if (!draft) {
        return;
      }
      draft.category = draft.category === key ? null : key;
      syncChips();
    });
    chips.appendChild(chip);
    return chip;
  });
  // Reporter form. Two containers, both empty (and `display: none`) unless
  // `form` is configured: the session block sits above everything (asked once),
  // the issue block sits under the comment (asked every time).
  const sessionFormBox = el("div", "form-block form-session");
  sessionFormBox.style.display = "none";
  const issueFormBox = el("div", "form-block form-issue");
  issueFormBox.style.display = "none";
  const commentBox = el("textarea");
  commentBox.placeholder = strings.commentPlaceholder;
  // Mobile: the on-screen keyboard covers the lower half of the viewport, and a
  // bottom-anchored panel puts the textarea exactly there. Scroll it back into
  // view once the keyboard has animated in.
  commentBox.addEventListener("focus", () => {
    if (!coarsePointer) {
      return;
    }
    setTimeout(() => {
      commentBox.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  });
  // Screenshot consent (beta): a checked-by-default "Attach screenshot" toggle.
  // Unchecked → the issue is sent without any screenshot (screenshot: null).
  const consentRow = el("label", "consent");
  const consentBox = el("input");
  consentBox.type = "checkbox";
  consentBox.checked = true;
  const consentText = el("span");
  consentText.textContent = strings.attachScreenshot;
  consentRow.append(consentBox, consentText);
  consentRow.style.display = consentEnabled ? "flex" : "none";
  // Attachments: a hidden <input type=file> driven by the "+ Attach file"
  // button in the thumbnail row, plus a drop overlay for drag & drop. Created
  // only when the feature is on, so a widget without it has the same tree.
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = attachPolicy.acceptAttribute;
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    if (fileInput.files) {
      addFiles([...fileInput.files]);
    }
    fileInput.value = ""; // so picking the same file twice still fires
  });
  const dropHint = el("div", "drop-hint");
  dropHint.textContent = strings.attachDrop;
  dropHint.style.display = "none";
  const formError = el("div", "form-error");
  formError.style.display = "none";
  const actions = el("div", "dialog-actions");
  const cancelBtn = el("button");
  cancelBtn.textContent = strings.cancel;
  const sendBtn = el("button", "send");
  sendBtn.textContent = strings.send;
  actions.append(cancelBtn, sendBtn);
  panel.append(
    panelTitle,
    panelContext,
    sessionFormBox,
    thumbs,
    chips,
    commentBox,
    issueFormBox,
    consentRow,
    formError,
    actions
  );
  if (attachPolicy.enabled) {
    panel.append(fileInput, dropHint);
  }

  function syncChips(): void {
    for (const chip of chipButtons) {
      chip.classList.toggle(
        "active",
        Boolean(draft) && chip.dataset.category === draft?.category
      );
    }
    // Placeholder follows the category (Bug / Design / Idea → default).
    commentBox.placeholder = placeholderFor(draft?.category ?? null);
  }

  const toast = el("div", "toast");
  const toastSpinner = el("span", "toast-spinner");
  const toastText = el("span");
  const toastRetry = el("button", "toast-retry");
  toastRetry.type = "button";
  toastRetry.textContent = strings.retry;
  toast.append(toastSpinner, toastText, toastRetry);

  // Second circle + its panel: created up front but hidden; shown only if a
  // valid checklist resolves (inline immediately, or after a URL fetch settles).
  const checklistFab = el("button", "checklist-fab");
  checklistFab.type = "button";
  checklistFab.title = strings.checklistButton;
  checklistFab.setAttribute("aria-label", strings.checklistButton);
  const checklistFabIcon = el("span", "cl-fab-icon");
  checklistFabIcon.innerHTML = CHECKLIST_ICON_SVG;
  const checklistBadge = el("span", "cl-badge");
  checklistFab.append(checklistFabIcon, checklistBadge);

  // v2 panel: a document-style header (title → optional description → a summary
  // line) over an accordion of sections. No Done button — closed via the ✕,
  // a click outside, Esc, or the shortcut.
  const checklistPanel = el("div", "checklist-panel");
  checklistPanel.setAttribute("role", "dialog");
  checklistPanel.setAttribute("aria-label", strings.checklistButton);
  const checklistHead = el("div", "checklist-head");
  const checklistTitleRow = el("div", "cl-title-row");
  const checklistTitle = el("h2");
  const checklistClose = el("button", "cl-close");
  checklistClose.type = "button";
  checklistClose.textContent = "×";
  checklistClose.title = strings.close;
  checklistClose.setAttribute("aria-label", strings.close);
  checklistTitleRow.append(checklistTitle, checklistClose);
  const checklistDescription = el("p", "cl-description");
  checklistDescription.style.display = "none";
  const checklistSummary = el("div", "cl-summary");
  checklistHead.append(checklistTitleRow, checklistDescription, checklistSummary);
  const checklistBody = el("div", "checklist-body");
  checklistPanel.append(checklistHead, checklistBody);

  // Note: checklistFab / checklistPanel are built above but attached only when a
  // valid checklist resolves (see whenChecklistReady below), so a widget with no
  // checklist has a shadow tree identical to before this feature existed.
  shadow.append(
    fabWrap,
    menu,
    hint,
    highlight,
    areaOverlay,
    areaRect,
    recBar,
    panel,
    toast
  );
  container.appendChild(host);

  let draft: Draft | null = null;
  // Resolved checklist (null until ready / when none configured) + the item a
  // pending fail-flow capture belongs to, and which sections are collapsed.
  let checklistDef: ChecklistDef | null = null;
  let pendingChecklistItem: string | null = null;
  // Accordion: explicit collapsed set + the last-rendered completion state per
  // section, so we can detect the "section just completed" event that drives
  // self-navigation (collapse it, open the next incomplete one).
  const collapsedSections = new Set<number>();
  let lastSectionComplete: boolean[] = [];
  let checklistInitialized = false;
  // Touch devices have no hover, so the per-item issue button is always visible
  // (muted) instead of hover-revealed.
  const isTouch = coarsePointer;
  // Always defined: the core resolves it from the hostname when omitted.
  const project = core.config.project as string;
  let addingToDraft = false;
  // True while the current draft still has to ask the session-scoped block.
  // Latched when the draft opens so the block does not disappear mid-compose.
  let askingSessionForm = false;
  // Which recording clips are expanded into their numbered frame ribbon.
  const expandedClips = new Set<number>();
  let annotating = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverTarget: Element | null = null;
  let retryPayload: Pick<CaptureResult, "files" | "sessionId"> | null = null;
  let retryIssueId = "";

  // Plural forms come from the bundle: English needs two, Russian and
  // Ukrainian three (1 кадр / 2 кадра / 5 кадров).
  const pluralForm = strings.pluralForm ?? defaultPluralForm;
  function issueCount(n: number): string {
    return plural(
      strings.checklistSummaryIssueOne,
      strings.checklistSummaryIssueMany,
      n,
      strings.checklistSummaryIssueFew,
      pluralForm
    );
  }
  function frameCount(n: number): string {
    return plural(
      strings.recordingFrameOne,
      strings.recordingFrameMany,
      n,
      strings.recordingFrameFew,
      pluralForm
    );
  }

  function refreshBadge(): void {
    const count = core.getIssueCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "block" : "none";
  }

  // Layer safety: while any widget panel is open, hide the floating circles so
  // they can never cover the panel's own controls (the Send button lands under
  // them on a full-width mobile panel) or steal modal focus order. They are not
  // needed while composing — the panel has its own close affordances.
  function syncOverlayState(): void {
    const modalOpen = isPanelOpen() || isChecklistPanelOpen();
    fab.style.visibility = modalOpen ? "hidden" : "visible";
    fab.style.pointerEvents = modalOpen ? "none" : "auto";
    if (checklistDef) {
      checklistFab.style.visibility = modalOpen ? "hidden" : "visible";
      checklistFab.style.pointerEvents = modalOpen ? "none" : "auto";
    }
  }

  // A <kbd> chip showing the live toggle shortcut (platform-formatted, honoring
  // a custom config value). Null when the shortcut is disabled.
  function makeKbd(): HTMLElement | null {
    // No keyboard on a touch device — a shortcut chip there is decoration that
    // costs horizontal space the panel does not have.
    if (!shortcutLabel || coarsePointer) {
      return null;
    }
    const kbd = el("kbd", "kbd-hint");
    kbd.textContent = shortcutLabel;
    return kbd;
  }

  // The comment placeholder adapts to the chosen category.
  function placeholderFor(category: string | null): string {
    switch (category) {
      case "bug":
        return strings.placeholderBug;
      case "design":
        return strings.placeholderDesign;
      case "idea":
        return strings.placeholderIdea;
      default:
        return strings.commentPlaceholder;
    }
  }

  // --- Checklist mode (second circle) ---
  // An item is "checked" once it has any verdict (pass = clean, fail = with an
  // issue); null = not tested. v2 no longer generates `skip`, but a `skip` read
  // from an older artifact still counts as checked.
  function isChecked(verdict: Verdict | null): boolean {
    return verdict !== null;
  }

  function checklistTotal(): number {
    return checklistDef
      ? checklistDef.sections.reduce((n, s) => n + s.items.length, 0)
      : 0;
  }

  function verdictsById(): Map<string, ChecklistState["items"][number]> {
    const map = new Map<string, ChecklistState["items"][number]>();
    const state = core.getChecklistState();
    if (state) {
      for (const item of state.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }

  interface SectionStat {
    done: number;
    total: number;
    issues: number;
    complete: boolean;
  }

  function sectionStat(
    section: ChecklistDef["sections"][number],
    verdicts: Map<string, ChecklistState["items"][number]>
  ): SectionStat {
    let done = 0;
    let issues = 0;
    for (const item of section.items) {
      const verdict = verdicts.get(item.id)?.verdict ?? null;
      if (isChecked(verdict)) {
        done++;
      }
      if (verdict === "fail") {
        issues++;
      }
    }
    const total = section.items.length;
    return { done, total, issues, complete: total > 0 && done === total };
  }

  // Circle badge: the number of items still to check, or a check when done.
  function updateChecklistBadge(): void {
    if (!checklistDef) {
      return;
    }
    const total = checklistTotal();
    const state = core.getChecklistState();
    const done = state ? checklistProgress(state).done : 0;
    const remaining = total - done;
    const complete = total > 0 && remaining === 0;
    checklistBadge.textContent = complete ? "✓" : String(remaining);
    checklistBadge.classList.toggle("complete", complete);
  }

  // Summary line: "5 of 12 checked · 2 issues · 7 left", collapsing to
  // "12 checked · 2 issues" + an autosave note in the completed state.
  function renderSummary(): void {
    const total = checklistTotal();
    const verdicts = verdictsById();
    let done = 0;
    let issues = 0;
    if (checklistDef) {
      for (const section of checklistDef.sections) {
        const stat = sectionStat(section, verdicts);
        done += stat.done;
        issues += stat.issues;
      }
    }
    const remaining = total - done;
    const complete = total > 0 && remaining === 0;
    const parts: string[] = [];
    parts.push(
      complete
        ? interpolate(strings.checklistSummaryDone, { n: total })
        : interpolate(strings.checklistSummaryChecked, { done, total })
    );
    if (issues > 0) {
      parts.push(issueCount(issues));
    }
    if (remaining > 0) {
      parts.push(interpolate(strings.checklistSummaryLeft, { n: remaining }));
    }
    checklistSummary.textContent = "";
    const line = el("span", "cl-summary-line");
    line.textContent = parts.join(" · ");
    checklistSummary.appendChild(line);
    checklistSummary.classList.toggle("complete", complete);
    if (complete) {
      const note = el("span", "cl-summary-note");
      note.textContent = strings.checklistAutosaved;
      checklistSummary.appendChild(note);
    }
  }

  function currentPath(): string {
    return typeof window !== "undefined" ? window.location.pathname : "";
  }

  function renderChecklist(): void {
    if (!checklistDef) {
      return;
    }
    checklistTitle.textContent = checklistDef.title;
    checklistTitle.title = checklistDef.title;
    if (checklistDef.description) {
      checklistDescription.textContent = checklistDef.description;
      checklistDescription.style.display = "block";
    } else {
      checklistDescription.style.display = "none";
    }
    const verdicts = verdictsById();
    const path = currentPath();
    checklistBody.innerHTML = "";
    const completion: boolean[] = [];
    checklistDef.sections.forEach((section, si) => {
      const stat = sectionStat(section, verdicts);
      completion[si] = stat.complete;
      const sectionEl = el("div", "cl-section");
      if (stat.complete) {
        sectionEl.classList.add("done");
      }
      if (collapsedSections.has(si)) {
        sectionEl.classList.add("collapsed");
      }
      if (section.title) {
        const head = el("button", "cl-section-head");
        head.type = "button";
        head.setAttribute(
          "aria-expanded",
          collapsedSections.has(si) ? "false" : "true"
        );
        const chevron = el("span", "cl-chevron");
        chevron.innerHTML = CHEVRON_SVG;
        chevron.setAttribute("aria-hidden", "true");
        const label = el("span", "cl-section-name");
        label.textContent = section.title;
        // Mini-progress: "2/4 · 1 issue".
        const meta = el("span", "cl-section-meta");
        const metaParts = [`${stat.done}/${stat.total}`];
        if (stat.issues > 0) {
          metaParts.push(issueCount(stat.issues));
        }
        meta.textContent = metaParts.join(" · ");
        head.append(chevron, label, meta);
        head.addEventListener("click", () => toggleSection(si, sectionEl, head));
        sectionEl.appendChild(head);
      }
      const items = el("div", "cl-items");
      const itemsInner = el("div", "cl-items-inner");
      for (const item of section.items) {
        const state = verdicts.get(item.id);
        const verdict = state?.verdict ?? null;
        const checked = isChecked(verdict);
        const here = Boolean(
          item.url_match && matchUrlPattern(item.url_match, path)
        );
        const row = el("div", "cl-item");
        if (verdict) {
          row.classList.add(verdict);
        }
        if (checked) {
          row.classList.add("checked");
        }
        if (here) {
          row.classList.add("here");
        }
        row.setAttribute("role", "checkbox");
        row.setAttribute("aria-checked", checked ? "true" : "false");
        row.tabIndex = 0;

        // A check indicator on the left; the whole row toggles it.
        const box = el("span", "cl-check");
        box.setAttribute("aria-hidden", "true");
        box.textContent = verdict === "fail" ? "!" : checked ? "✓" : "";

        const main = el("div", "cl-item-main");
        const titleRow = el("div", "cl-item-titlerow");
        const title = el("span", "cl-item-title");
        title.textContent = item.title;
        titleRow.appendChild(title);
        if (here) {
          const hereEl = el("span", "cl-item-here");
          hereEl.textContent = strings.checklistHere;
          titleRow.appendChild(hereEl);
        }
        main.appendChild(titleRow);
        if (item.hint) {
          const hintEl = el("span", "cl-item-hint");
          hintEl.textContent = item.hint;
          main.appendChild(hintEl);
        }
        const links = el("div", "cl-item-links");
        if (item.url) {
          // Static route → a real navigation chip (does not toggle the item).
          const link = el("a", "cl-item-link");
          link.textContent = `${strings.checklistOpen} ↗`;
          link.href = item.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.addEventListener("click", (e) => e.stopPropagation());
          links.appendChild(link);
        }
        if (verdict === "fail" && state?.issue) {
          const issueEl = el("span", "cl-item-issue");
          issueEl.textContent = interpolate(strings.checklistItemIssueLink, {
            id: state.issue,
          });
          links.appendChild(issueEl);
        }
        if (links.childElementCount > 0) {
          main.appendChild(links);
        }

        // The slug (issue) button: flags a problem for this item. Always
        // present; hover-revealed on pointer devices, persistent on touch.
        const issueBtn = el("button", "cl-issue-btn");
        issueBtn.type = "button";
        issueBtn.title = strings.checklistItemIssue;
        issueBtn.setAttribute("aria-label", strings.checklistItemIssue);
        issueBtn.innerHTML = FEEDBACK_ICON_SVG;
        if (isTouch) {
          issueBtn.classList.add("touch");
        }
        issueBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          startFailFlow(item.id);
        });

        const activate = (): void => toggleItem(item.id, verdict);
        row.addEventListener("click", activate);
        row.addEventListener("keydown", (e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            activate();
          }
        });

        row.append(box, main, issueBtn);
        itemsInner.appendChild(row);
      }
      items.appendChild(itemsInner);
      sectionEl.appendChild(items);
      checklistBody.appendChild(sectionEl);
    });
    lastSectionComplete = completion;
    renderSummary();
    updateChecklistBadge();
  }

  function toggleSection(
    si: number,
    sectionEl: HTMLElement,
    head: HTMLElement
  ): void {
    const collapsing = !collapsedSections.has(si);
    if (collapsing) {
      collapsedSections.add(si);
    } else {
      collapsedSections.delete(si);
    }
    sectionEl.classList.toggle("collapsed", collapsing);
    head.setAttribute("aria-expanded", collapsing ? "false" : "true");
  }

  // Toggle an item's checked state. null → pass (checked clean); pass/skip →
  // cleared; fail → cleared, but confirmed first (the issue is already sent and
  // stays linked in the yaml — only the verdict is withdrawn).
  function toggleItem(itemId: string, verdict: Verdict | null): void {
    if (verdict === null) {
      core.recordVerdict(itemId, "pass");
    } else if (verdict === "fail") {
      const item = verdictsById().get(itemId);
      if (
        item?.issue &&
        typeof window !== "undefined" &&
        typeof window.confirm === "function" &&
        !window.confirm(
          interpolate(strings.checklistUncheckIssue, { id: item.issue })
        )
      ) {
        return;
      }
      core.clearVerdict(itemId);
    } else {
      core.clearVerdict(itemId);
    }
    afterVerdictChange();
  }

  // Self-navigation: when a verdict change completes a section, collapse it and
  // open the next incomplete one, scrolling to it. Fires only on the
  // incomplete→complete transition, so manual open/close is never overridden.
  function afterVerdictChange(): void {
    const before = lastSectionComplete;
    const verdicts = verdictsById();
    let scrollTo = -1;
    checklistDef?.sections.forEach((section, si) => {
      const complete = sectionStat(section, verdicts).complete;
      if (complete && !before[si]) {
        collapsedSections.add(si);
        const next = nextIncompleteSection(si, verdicts);
        if (next >= 0) {
          collapsedSections.delete(next);
          scrollTo = next;
        }
      }
    });
    renderChecklist();
    if (scrollTo >= 0) {
      const sections = checklistBody.querySelectorAll(".cl-section");
      sections[scrollTo]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function nextIncompleteSection(
    after: number,
    verdicts: Map<string, ChecklistState["items"][number]>
  ): number {
    const sections = checklistDef?.sections ?? [];
    // Prefer the next section after the one that just completed, then wrap.
    for (let step = 1; step <= sections.length; step++) {
      const si = (after + step) % sections.length;
      if (!sectionStat(sections[si], verdicts).complete) {
        return si;
      }
    }
    return -1;
  }

  function firstIncompleteSection(): number {
    const verdicts = verdictsById();
    const sections = checklistDef?.sections ?? [];
    for (let si = 0; si < sections.length; si++) {
      if (!sectionStat(sections[si], verdicts).complete) {
        return si;
      }
    }
    return -1;
  }

  // Fail: an item flagged with an issue must carry evidence, so open the
  // standard capture flow tagged with this item. The verdict is recorded only
  // once the issue is sent (see sendDraft); cancelling leaves the item unset.
  function startFailFlow(itemId: string): void {
    pendingChecklistItem = itemId;
    closeChecklistPanel();
    resetModes();
    openMenu();
  }

  function isChecklistPanelOpen(): boolean {
    return checklistPanel.style.display === "flex";
  }

  // Seed the accordion the first time the panel opens: collapse every section
  // except the first incomplete one. Manual toggles persist after that.
  function initAccordion(): void {
    if (checklistInitialized || !checklistDef) {
      return;
    }
    checklistInitialized = true;
    const first = firstIncompleteSection();
    checklistDef.sections.forEach((_, si) => {
      if (si !== first) {
        collapsedSections.add(si);
      }
    });
  }

  function openChecklistPanel(): void {
    pendingChecklistItem = null;
    closeMenu();
    if (isPanelOpen()) {
      closePanel();
    }
    initAccordion();
    renderChecklist();
    checklistPanel.style.display = "flex";
    syncOverlayState();
  }

  function closeChecklistPanel(): void {
    checklistPanel.style.display = "none";
    syncOverlayState();
  }

  // Auto-open the panel once per session when the checklist has no verdicts yet
  // (the client just landed to walk it). The once-per-session guard is a
  // sessionStorage flag, so an in-session page navigation does not reopen it.
  function maybeAutoOpen(): void {
    if (!checklistDef) {
      return;
    }
    const state = core.getChecklistState();
    const done = state ? checklistProgress(state).done : 0;
    if (done > 0) {
      return;
    }
    const key = `feedback-widget:${project}:cl-autoopen`;
    try {
      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(key)) {
          return;
        }
        sessionStorage.setItem(key, "1");
      }
    } catch {
      // Storage blocked (private mode / cross-origin) — fall through and open
      // once for this mount; without persistence it may reopen on reload.
    }
    openChecklistPanel();
  }

  function hideToast(): void {
    toast.style.display = "none";
  }

  function showToast(
    message: string,
    opts: { error?: boolean; retry?: boolean; spinner?: boolean } = {}
  ): void {
    toastText.textContent = message;
    toast.classList.toggle("error", opts.error === true);
    toastSpinner.style.display = opts.spinner ? "inline-block" : "none";
    toastRetry.style.display = opts.retry ? "inline-block" : "none";
    toast.style.display = "flex";
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (!(opts.spinner || opts.retry)) {
      toastTimer = setTimeout(hideToast, TOAST_MS);
    }
  }

  function showHint(message: string): void {
    hint.textContent = message;
    hint.style.display = "block";
  }

  function isMenuOpen(): boolean {
    return menu.style.display === "flex";
  }

  function closeMenu(): void {
    menu.style.display = "none";
  }

  function openMenu(): void {
    closeChecklistPanel();
    menu.style.display = "flex";
  }

  function isPanelOpen(): boolean {
    return panel.style.display === "flex";
  }

  /**
   * Add another screenshot to the issue being composed: keep the draft (and the
   * comment typed so far), hide the panel, and reopen the capture menu. Shared
   * by the "+ Add screenshot" button and the global shortcut while a draft is open.
   */
  function addScreenshotToDraft(): void {
    if (!draft) {
      return;
    }
    draft.comment = commentBox.value;
    addingToDraft = true;
    panel.style.display = "none";
    syncOverlayState();
    openMenu();
  }

  function resetModes(): void {
    hint.style.display = "none";
    highlight.style.display = "none";
    areaOverlay.style.display = "none";
    areaRect.style.display = "none";
    document.removeEventListener("mousemove", onElementHover, true);
    document.removeEventListener("click", onElementClick, true);
    hoverTarget = null;
    fabWrap.style.display = "flex";
  }

  function discardDraft(): void {
    if (draft) {
      for (const url of draft.urls) {
        URL.revokeObjectURL(url);
      }
      for (const clip of draft.clips) {
        for (const url of clip.urls) {
          URL.revokeObjectURL(url);
        }
      }
      for (const file of draft.attachments) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
    }
    draft = null;
    addingToDraft = false;
    expandedClips.clear();
  }

  // --- Reporter form ---------------------------------------------------------
  // Rendered from the validated config. With no `form` configured both
  // containers stay empty and hidden, and the panel is what it always was.

  /** Build the inputs for one scope into its container. */
  function renderFormBlock(
    box: HTMLElement,
    fields: ResolvedFormField[],
    heading: string | null
  ): void {
    box.innerHTML = "";
    if (fields.length === 0 || !draft) {
      box.style.display = "none";
      return;
    }
    const owner = draft;
    if (heading) {
      const title = el("div", "form-heading");
      title.textContent = heading;
      box.appendChild(title);
    }
    for (const field of fields) {
      const row = el("label", "form-row");
      row.dataset.field = field.key;
      const labelText = el("span", "form-label");
      labelText.textContent = field.label;
      if (field.required) {
        const star = el("span", "form-required");
        star.textContent = "*";
        star.setAttribute("aria-hidden", "true");
        labelText.appendChild(star);
      }
      const current = owner.answers.get(field.key);
      if (field.type === "select") {
        const select = el("select");
        if (!field.required) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = strings.formChoose;
          select.appendChild(empty);
        }
        for (const option of field.options ?? []) {
          const opt = document.createElement("option");
          opt.value = option;
          opt.textContent = option;
          select.appendChild(opt);
        }
        select.value = typeof current === "string" ? current : "";
        // A required select with no empty option starts on its first value, so
        // record that as the answer rather than leaving it silently unset.
        if (field.required && !current) {
          owner.answers.set(field.key, select.value);
        }
        select.addEventListener("change", () => {
          owner.answers.set(field.key, select.value);
          clearFieldError(row);
        });
        row.append(labelText, select);
      } else if (field.type === "checkbox") {
        const input = el("input");
        input.type = "checkbox";
        input.checked = current === true;
        input.addEventListener("change", () => {
          owner.answers.set(field.key, input.checked);
          clearFieldError(row);
        });
        row.classList.add("form-row-check");
        row.append(input, labelText);
      } else {
        const input = el("input");
        input.type = field.type === "email" ? "email" : "text";
        input.value = typeof current === "string" ? current : "";
        input.addEventListener("input", () => {
          owner.answers.set(field.key, input.value);
          clearFieldError(row);
        });
        row.append(labelText, input);
      }
      box.appendChild(row);
    }
    box.style.display = "flex";
  }

  function clearFieldError(row: HTMLElement): void {
    row.classList.remove("invalid");
    formError.style.display = "none";
  }

  /** Which fields this draft is asking about (session block only on the first issue). */
  function activeFields(): ResolvedFormField[] {
    return askingSessionForm ? [...sessionFields, ...issueFields] : issueFields;
  }

  function renderForm(): void {
    renderFormBlock(
      sessionFormBox,
      askingSessionForm ? sessionFields : [],
      strings.formSessionTitle
    );
    renderFormBlock(issueFormBox, issueFields, null);
  }

  /**
   * Validate every visible field. On the first problem the row is highlighted,
   * the message is shown once above the buttons, and sending is blocked.
   */
  function validateForm(): boolean {
    if (!draft) {
      return true;
    }
    formError.style.display = "none";
    for (const box of [sessionFormBox, issueFormBox]) {
      for (const row of box.querySelectorAll<HTMLElement>(".form-row")) {
        row.classList.remove("invalid");
      }
    }
    for (const field of activeFields()) {
      const problem = validateValue(field, draft.answers.get(field.key));
      if (!problem) {
        continue;
      }
      const row =
        sessionFormBox.querySelector<HTMLElement>(
          `.form-row[data-field="${field.key}"]`
        ) ??
        issueFormBox.querySelector<HTMLElement>(
          `.form-row[data-field="${field.key}"]`
        );
      row?.classList.add("invalid");
      formError.textContent =
        problem === "email" ? strings.formInvalidEmail : strings.formRequired;
      formError.style.display = "block";
      row?.querySelector("input, select")?.scrollIntoView?.({
        block: "nearest",
      });
      return false;
    }
    return true;
  }

  // Full (re)open of the panel: sets the comment field and focuses it. Called
  // once when a draft opens. Live updates (a screenshot finishing) go through
  // renderThumbs so the reporter's typing and cursor are never disturbed.
  function renderPanel(): void {
    if (!draft) {
      return;
    }
    panelTitle.textContent = strings.dialogTitle;
    const context = [draft.mode, draft.selector, window.location.pathname]
      .filter(Boolean)
      .join(" · ");
    panelContext.textContent = context;
    panelContext.title = context;
    renderThumbs();
    renderForm();
    syncChips();
    if (commentBox.value !== draft.comment) {
      commentBox.value = draft.comment;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = strings.send;
    panel.style.display = "flex";
    commentBox.focus();
    syncOverlayState();
  }

  /**
   * Take files from the picker, a drop or a paste into the open draft. Each is
   * checked against the policy on its own: one refused file never costs the
   * reporter the ones that were fine, and every refusal says why in a message
   * that names the file and the actual limit.
   */
  function addFiles(files: File[]): void {
    if (!(attachPolicy.enabled && draft)) {
      return;
    }
    const owner = draft;
    for (const file of files) {
      const check = checkAttachment(file, attachPolicy, owner.attachments.length);
      if (!check.ok) {
        showToast(rejectionMessage(file, check.reason), { error: true });
        continue;
      }
      const extension = check.extension ?? extensionOf(file.name);
      const mime = file.type || guessMime(extension);
      const isImage = isImageAttachment(mime, extension);
      owner.attachments.push({
        blob: file,
        name: file.name,
        mime,
        extension,
        // Images join the thumbnail row as real previews, so a pasted phone
        // screenshot annotates exactly like a captured one.
        url: isImage ? URL.createObjectURL(file) : null,
      });
    }
    if (draft === owner) {
      renderThumbs();
    }
  }

  function rejectionMessage(
    file: { name: string; size: number },
    reason: ReturnType<typeof checkAttachment>["reason"]
  ): string {
    switch (reason) {
      case "size":
        return interpolate(strings.attachRejectedSize, {
          name: file.name,
          size: formatBytes(file.size),
          limit: formatBytes(attachPolicy.maxFileSize),
        });
      case "count":
        return interpolate(strings.attachRejectedCount, {
          n: attachPolicy.maxFiles,
        });
      case "empty":
        return interpolate(strings.attachRejectedEmpty, { name: file.name });
      default:
        return interpolate(strings.attachRejectedType, { name: file.name });
    }
  }

  /** Fallback mime for files the browser reported nothing for (.md, .heic, …). */
  function guessMime(extension: string): string {
    switch (extension) {
      case "md":
        return "text/markdown";
      case "csv":
        return "text/csv";
      case "json":
        return "application/json";
      case "txt":
        return "text/plain";
      case "heic":
        return "image/heic";
      default:
        return "application/octet-stream";
    }
  }

  // Rebuilds only the thumbnail row (real shots + pending placeholders + the
  // "add" button). Safe to call while the reporter is typing.
  function renderThumbs(): void {
    if (!draft) {
      return;
    }
    thumbs.innerHTML = "";
    if (
      draft.urls.length === 0 &&
      draft.pending === 0 &&
      draft.clips.length === 0
    ) {
      const empty = el("span", "no-shot");
      empty.textContent = strings.noScreenshot;
      thumbs.appendChild(empty);
    }
    draft.urls.forEach((url, i) => {
      const thumb = el("button", "thumb");
      thumb.type = "button";
      const img = el("img");
      img.src = url;
      img.alt = interpolate(strings.imageAlt, { n: i + 1 });
      thumb.appendChild(img);
      const remove = el("button", "thumb-remove");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = strings.removeScreenshot;
      remove.setAttribute("aria-label", strings.removeScreenshot);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        URL.revokeObjectURL(url);
        draft?.shots.splice(i, 1);
        draft?.urls.splice(i, 1);
        renderThumbs();
      });
      thumb.appendChild(remove);
      thumb.title = strings.annotateArrow;
      thumb.addEventListener("click", async () => {
        if (!draft) {
          return;
        }
        annotating = true;
        try {
          const annotated = await annotateBlob(shadow, draft.shots[i], strings);
          if (annotated) {
            URL.revokeObjectURL(draft.urls[i]);
            draft.shots[i] = annotated;
            draft.urls[i] = URL.createObjectURL(annotated);
            renderThumbs();
          }
        } finally {
          annotating = false;
        }
      });
      thumbs.appendChild(thumb);
    });
    // Placeholder tiles for screenshots that are still rendering. They show a
    // spinner so the reporter can see the shot is on its way while they type.
    for (let i = 0; i < draft.pending; i += 1) {
      const loading = el("div", "thumb thumb-pending");
      loading.title = strings.capturing;
      const spin = el("div", "spinner");
      loading.appendChild(spin);
      thumbs.appendChild(loading);
    }
    // Recording: one stacked "deck" tile per clip (a Record→Stop cycle), each
    // labeled "Clip N · M frames" with its first frame as the cover. Clips are
    // independent — deleting one leaves the others untouched. Click toggles the
    // clip's numbered ribbon.
    draft.clips.forEach((clip, ci) => {
      const count = clip.urls.length;
      const expanded = expandedClips.has(ci);
      const deckLabel = `${interpolate(strings.recordingClip, {
        n: ci + 1,
      })} · ${frameCount(count)}`;
      const deck = el("button", "thumb frame-deck");
      deck.type = "button";
      deck.classList.toggle("open", expanded);
      deck.title = deckLabel;
      deck.setAttribute("aria-label", deckLabel);
      const img = el("img");
      img.src = clip.urls[0];
      img.alt = deckLabel;
      const badge = el("span", "deck-count");
      badge.textContent = deckLabel;
      deck.append(img, badge);
      deck.addEventListener("click", () => {
        if (expandedClips.has(ci)) {
          expandedClips.delete(ci);
        } else {
          expandedClips.add(ci);
        }
        renderThumbs();
      });
      const remove = el("button", "thumb-remove");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = strings.recordingRemove;
      remove.setAttribute("aria-label", strings.recordingRemove);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!draft) {
          return;
        }
        for (const url of clip.urls) {
          URL.revokeObjectURL(url);
        }
        draft.clips.splice(ci, 1);
        draft.recording = draft.clips.length > 0;
        expandedClips.clear(); // indices shifted; simplest to collapse all
        renderThumbs();
      });
      deck.appendChild(remove);
      thumbs.appendChild(deck);
      if (expanded) {
        clip.urls.forEach((url, i) => {
          const frame = el("div", "thumb frame-thumb");
          const fimg = el("img");
          fimg.src = url;
          fimg.alt = interpolate(strings.frameAlt, { n: i + 1 });
          const num = el("span", "frame-num");
          num.textContent = String(i + 1).padStart(2, "0");
          frame.append(fimg, num);
          thumbs.appendChild(frame);
        });
      }
    });
    // Attachments share the thumbnail row: an image is a real preview (and
    // annotatable), anything else is a labelled tile with its type and size.
    draft.attachments.forEach((file, i) => {
      const remove = el("button", "thumb-remove");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = strings.attachRemove;
      remove.setAttribute("aria-label", strings.attachRemove);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!draft) {
          return;
        }
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
        draft.attachments.splice(i, 1);
        renderThumbs();
      });
      const label = `${file.name} · ${formatBytes(file.blob.size)}`;
      if (file.url) {
        const thumb = el("button", "thumb");
        thumb.type = "button";
        thumb.title = label;
        const img = el("img");
        img.src = file.url;
        img.alt = file.name;
        thumb.append(img, remove);
        thumb.addEventListener("click", async () => {
          if (!draft) {
            return;
          }
          annotating = true;
          try {
            const annotated = await annotateBlob(shadow, file.blob, strings);
            if (annotated) {
              URL.revokeObjectURL(file.url as string);
              file.blob = annotated;
              file.url = URL.createObjectURL(annotated);
              renderThumbs();
            }
          } finally {
            annotating = false;
          }
        });
        thumbs.appendChild(thumb);
        return;
      }
      const tile = el("div", "thumb file-tile");
      tile.title = label;
      const ext = el("span", "file-ext");
      ext.textContent = file.extension.toUpperCase();
      const name = el("span", "file-name");
      name.textContent = file.name;
      const size = el("span", "file-size");
      size.textContent = formatBytes(file.blob.size);
      tile.append(ext, name, size, remove);
      thumbs.appendChild(tile);
    });
    const addBtn = el("button", "add-shot");
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", strings.addScreenshot);
    const addText = el("span");
    addText.textContent = strings.addScreenshot;
    addBtn.appendChild(addText);
    const addKbd = makeKbd();
    if (addKbd) {
      addBtn.appendChild(addKbd);
      addBtn.title = `${strings.addScreenshot} (${shortcutLabel})`;
    }
    addBtn.addEventListener("click", addScreenshotToDraft);
    thumbs.appendChild(addBtn);
    if (attachPolicy.enabled) {
      const attachBtn = el("button", "add-shot attach-file");
      attachBtn.type = "button";
      attachBtn.textContent = strings.attachFile;
      attachBtn.setAttribute("aria-label", strings.attachFile);
      attachBtn.addEventListener("click", () => fileInput.click());
      thumbs.appendChild(attachBtn);
    }
  }

  // Start (or reuse) the draft that a capture belongs to. When adding a shot to
  // an open draft, the existing draft (and its comment) is kept.
  function ensureDraft(
    mode: CaptureMode,
    meta: ElementMetadata | null
  ): Draft {
    if (addingToDraft && draft) {
      addingToDraft = false;
      return draft;
    }
    discardDraft();
    consentBox.checked = true; // fresh draft → consent defaults to checked
    // Session-scoped fields are asked once per session, on the first issue.
    askingSessionForm = core.needsSessionForm();
    // A fail-flow capture stamps the draft with its checklist item, consumed
    // once so a later unrelated capture is never mislabeled.
    const checklistItem = pendingChecklistItem;
    pendingChecklistItem = null;
    draft = {
      mode,
      meta,
      selector: meta?.selector ?? null,
      shots: [],
      urls: [],
      comment: "",
      category: null,
      checklistItem,
      pending: 0,
      captures: [],
      maskedAny: false,
      recording: false,
      clips: [],
      attachments: [],
      screenshotFailed: false,
      screenshotError: null,
      answers: new Map(),
    };
    return draft;
  }

  // Open the panel immediately with a pending placeholder, then render the
  // screenshot in the background. The reporter can write their comment while it
  // loads instead of staring at a blocking spinner.
  function captureIntoDraft(
    mode: CaptureMode,
    meta: ElementMetadata | null,
    work: () => Promise<Blob>
  ): void {
    const owner = ensureDraft(mode, meta);
    owner.pending += 1;
    renderPanel();
    const task = (async () => {
      try {
        // Mask PII on the live DOM for the duration of the render, then restore
        // it exactly. Masking must wrap the html-to-image render inside work().
        const mask = applyMask(privacy);
        let shot: Blob;
        try {
          shot = await work();
        } finally {
          mask.restore();
        }
        if (mask.count > 0) {
          owner.maskedAny = true;
        }
        if (draft !== owner) {
          return; // draft was cancelled or replaced mid-capture
        }
        owner.shots.push(shot);
        owner.urls.push(URL.createObjectURL(shot));
      } catch (error) {
        // The screenshot is the one part of an issue that can fail on the
        // browser's terms — a webfont that never resolves, a tainted canvas, a
        // render that hangs. It must never cost the report: the panel stays
        // open with what the reporter already typed, they are told once, and
        // the issue goes out comment-only with the reason in its frontmatter.
        const message =
          error instanceof Error ? error.message : String(error);
        if (draft === owner) {
          owner.screenshotFailed = true;
          owner.screenshotError = message;
        }
        showToast(strings.screenshotFailed, { error: true });
        console.warn("[sluglist] screenshot failed:", error);
      } finally {
        if (draft === owner) {
          owner.pending = Math.max(0, owner.pending - 1);
          renderThumbs();
        }
      }
    })();
    owner.captures.push(task);
  }

  function closePanel(): void {
    panel.style.display = "none";
    discardDraft();
    syncOverlayState();
  }

  // Element mode: hover highlight, capture on click.
  function onElementHover(event: MouseEvent): void {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === hoverTarget || host.contains(target)) {
      return;
    }
    hoverTarget = target;
    const rect = target.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = `${rect.left - 2}px`;
    highlight.style.top = `${rect.top - 2}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function onElementClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target =
      hoverTarget ?? document.elementFromPoint(event.clientX, event.clientY);
    resetModes();
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // Collect selector + metadata synchronously, before the capture (which
    // reveals scroll-hidden nodes and could otherwise perturb the DOM).
    const meta = collectElementMetadata(target);
    captureIntoDraft("element", meta, () => captureElement(target, captureOptions));
  }

  function startElementMode(): void {
    closeMenu();
    fabWrap.style.display = "none";
    showHint(strings.elementHint);
    document.addEventListener("mousemove", onElementHover, true);
    document.addEventListener("click", onElementClick, true);
  }

  function startFullpageMode(): void {
    closeMenu();
    fabWrap.style.display = "none";
    captureIntoDraft("fullpage", null, () => captureFullPage(captureOptions));
    fabWrap.style.display = "flex";
  }

  // Area mode: drag a rectangle over the overlay.
  let dragStart: { x: number; y: number } | null = null;

  function drawAreaRect(x1: number, y1: number, x2: number, y2: number): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    areaRect.style.display = "block";
    areaRect.style.left = `${left}px`;
    areaRect.style.top = `${top}px`;
    areaRect.style.width = `${Math.abs(x2 - x1)}px`;
    areaRect.style.height = `${Math.abs(y2 - y1)}px`;
  }

  function startAreaMode(): void {
    closeMenu();
    fabWrap.style.display = "none";
    showHint(strings.areaHint);
    areaOverlay.style.display = "block";
  }

  areaOverlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    areaOverlay.setPointerCapture(event.pointerId);
    dragStart = { x: event.clientX, y: event.clientY };
    drawAreaRect(event.clientX, event.clientY, event.clientX, event.clientY);
  });
  areaOverlay.addEventListener("pointermove", (event) => {
    if (dragStart) {
      drawAreaRect(dragStart.x, dragStart.y, event.clientX, event.clientY);
    }
  });
  areaOverlay.addEventListener("pointerup", (event) => {
    if (!dragStart) {
      return;
    }
    const rect = {
      x: Math.min(dragStart.x, event.clientX),
      y: Math.min(dragStart.y, event.clientY),
      width: Math.abs(event.clientX - dragStart.x),
      height: Math.abs(event.clientY - dragStart.y),
    };
    dragStart = null;
    resetModes();
    if (rect.width < 8 || rect.height < 8) {
      return;
    }
    captureIntoDraft("area", null, () => captureArea(rect, captureOptions));
  });

  function startNoScreenshot(): void {
    closeMenu();
    ensureDraft("fullpage", null);
    renderPanel();
  }

  // --- Record mode ---
  function syncRecordingUi(): void {
    const on = recorder.recording;
    recDot.style.display = on ? "block" : "none";
    recBar.style.display = on ? "flex" : "none";
    if (on) {
      const n = recorder.frameCount;
      recBarText.textContent = recorder.atLimit
        ? formatString(strings.recordingLimit, `${n}/${recorder.maxFrames}`)
        : formatString(strings.recording, String(n));
      recSnapBtn.disabled = recorder.atLimit;
    }
  }

  async function startRecording(): Promise<void> {
    closeMenu();
    if (recorder.recording) {
      return;
    }
    // The clip index is this recording's slot in the draft (its frames' actions
    // are tagged with it), so a second recording on the same issue is clip 2.
    const clipIndex = (draft ? draft.clips.length : 0) + 1;
    await recorder.start(clipIndex);
  }

  function makeClip(frames: Blob[]): RecordingClip {
    return { frames, urls: frames.map((f) => URL.createObjectURL(f)) };
  }

  async function stopRecording(): Promise<void> {
    if (!recorder.recording) {
      return;
    }
    const frames = recorder.stop();
    const maskedAny = recorder.maskedAny;
    // An open draft (recording added via "+ Add screenshot" or with the panel
    // up) keeps its shots and comment: this recording becomes a NEW clip on the
    // draft — never merged into a prior one.
    if (draft) {
      addingToDraft = false;
      if (frames.length > 0) {
        draft.clips.push(makeClip(frames));
      }
      draft.recording = draft.clips.length > 0;
      draft.maskedAny = draft.maskedAny || maskedAny;
      renderPanel();
      return;
    }
    // Fresh recording: final screenshot (the "moment of Stop"), masked like
    // the frames, then a new draft carrying this recording as clip-01.
    const mask = applyMask(privacy);
    let main: Blob | null = null;
    let failure: string | null = null;
    try {
      main = await captureFullPage(captureOptions);
    } catch (error) {
      // Same rule as every other capture: the recording and the comment are
      // still worth sending without the closing screenshot.
      failure = error instanceof Error ? error.message : String(error);
      showToast(strings.screenshotFailed, { error: true });
      console.warn("[sluglist] final capture failed:", error);
    } finally {
      mask.restore();
    }
    consentBox.checked = true;
    draft = {
      mode: "fullpage",
      meta: null,
      selector: null,
      shots: main ? [main] : [],
      urls: main ? [URL.createObjectURL(main)] : [],
      comment: "",
      category: null,
      checklistItem: null,
      pending: 0,
      captures: [],
      maskedAny: maskedAny || mask.count > 0,
      recording: frames.length > 0,
      clips: frames.length > 0 ? [makeClip(frames)] : [],
      attachments: [],
      screenshotFailed: failure !== null,
      screenshotError: failure,
      answers: new Map(),
    };
    renderPanel();
  }

  function cancelRecording(): void {
    recorder.cancel();
    syncRecordingUi();
    if (addingToDraft && draft) {
      // Recording was being added to an open draft: return to it unchanged.
      addingToDraft = false;
      renderPanel();
    }
  }

  function snapFrame(): void {
    if (!recorder.recording || recorder.atLimit) {
      return;
    }
    recorder
      .snap()
      .catch((error) =>
        console.error("[sluglist] manual frame failed:", error)
      );
  }

  async function trackDelivery(result: CaptureResult): Promise<void> {
    showToast(formatString(strings.sending, result.issueId), {
      spinner: true,
    });
    const report = await result.delivered;
    if (report.ok) {
      retryPayload = null;
      showToast(formatString(strings.saved, result.issueId));
    } else {
      retryPayload = { files: result.files, sessionId: result.sessionId };
      retryIssueId = result.issueId;
      showToast(formatString(strings.deliveryFailed, result.issueId), {
        error: true,
        retry: true,
      });
    }
  }

  toastRetry.addEventListener("click", async () => {
    if (!retryPayload) {
      return;
    }
    const payload = retryPayload;
    showToast(formatString(strings.sending, retryIssueId), { spinner: true });
    const report = await core.redeliver(payload);
    if (report.ok) {
      retryPayload = null;
      showToast(formatString(strings.saved, retryIssueId));
    } else {
      showToast(formatString(strings.deliveryFailed, retryIssueId), {
        error: true,
        retry: true,
      });
    }
  });

  async function sendDraft(): Promise<void> {
    if (!draft) {
      return;
    }
    const comment = commentBox.value.trim();
    if (!comment) {
      commentBox.focus();
      return;
    }
    // Required fields block sending, with the offending row highlighted. This
    // runs before anything is captured or delivered, so nothing is half-sent.
    if (!validateForm()) {
      return;
    }
    sendBtn.disabled = true;
    const current = draft;
    // A screenshot may still be rendering in the background. Wait for it so it
    // ships with the issue instead of being silently dropped.
    if (current.pending > 0) {
      sendBtn.textContent = strings.capturing;
      await Promise.allSettled(current.captures);
      sendBtn.textContent = strings.send;
      if (draft !== current) {
        return; // draft was cancelled while we waited
      }
    }
    // Consent: when the reporter unchecks "Attach screenshot", the issue is
    // sent with no screenshot (the format already supports screenshot: null).
    // Recording frames are screenshots too, so consent drops them as well.
    const attachShots = !(consentEnabled && !consentBox.checked);
    const shots = attachShots ? current.shots : [];
    // Each clip ships as its own ordered frame sequence.
    const clips = attachShots ? current.clips.map((c) => c.frames) : [];
    const frameTotal = clips.reduce((n, c) => n + c.length, 0);
    // `masked` reflects the shipped screenshots: omitted with no screenshot or
    // when privacy is not configured; else whether anything was redacted.
    const masked =
      shots.length === 0
        ? undefined
        : current.maskedAny
          ? true
          : privacyConfigured
            ? false
            : undefined;
    // Session-scoped answers are stored on the session BEFORE the capture, so
    // the session.yaml this issue puts already carries them.
    if (askingSessionForm) {
      const sessionValues = collectValues(sessionFields, current.answers);
      if (sessionValues) {
        core.setSessionForm(sessionValues);
      }
    }
    const issueValues = collectValues(issueFields, current.answers);
    const attachments: AttachmentInput[] = current.attachments.map((file) => ({
      blob: file.blob,
      name: file.name,
      mime: file.mime,
    }));
    try {
      const meta = current.meta;
      const result = await core.captureIssue({
        comment,
        screenshots: shots,
        selector: current.selector,
        mode: current.mode,
        ...(current.category ? { category: current.category } : {}),
        ...(current.checklistItem
          ? { checklistItem: current.checklistItem }
          : {}),
        ...(masked !== undefined ? { masked } : {}),
        // A failed render is recorded rather than silently dropped — but only
        // when nothing was salvaged, so a two-shot issue that lost one still
        // reads as a normal issue.
        ...(current.screenshotFailed && shots.length === 0
          ? {
              screenshotFailed: true,
              screenshotError: current.screenshotError,
            }
          : {}),
        ...(issueValues ? { form: issueValues } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        // Record mode: attach the clips (unless consent dropped them).
        ...(current.recording && frameTotal > 0
          ? { recording: true, clips }
          : {}),
        // Present for every mode (null when not element) so the artifact fields
        // are always there.
        selectorStrategy: meta?.selectorStrategy ?? null,
        selectorUnique: meta?.selectorUnique ?? null,
        elementText: meta?.elementText ?? null,
        domPath: meta?.domPath ?? null,
        screen: meta?.screen ?? null,
        component: meta?.component ?? null,
      });
      closePanel();
      refreshBadge();
      if (result) {
        uiConfig.onIssueCaptured?.(result);
        trackDelivery(result).catch(() => undefined);
        // Fail-flow: the issue is the evidence, so record the verdict now and
        // return to the checklist with the item marked fail + linked.
        if (current.checklistItem) {
          core.recordVerdict(current.checklistItem, "fail", result.issueId);
          openChecklistPanel();
        }
      }
    } catch (error) {
      sendBtn.disabled = false;
      console.error("[feedback-widget] capture failed:", error);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    // A dismissed widget is fully out of the way — the shortcut must not bring
    // it back, or the ✕ would not be a real "leave me alone".
    if (dismissed) {
      return;
    }
    // While the annotation editor is open it owns the keyboard (its own
    // document listener handles Escape); do not let Escape close the panel.
    if (annotating) {
      return;
    }
    if (event.key === "Escape") {
      if (isChecklistPanelOpen()) {
        closeChecklistPanel();
      } else if (isPanelOpen()) {
        closePanel();
      } else {
        // Abandoning the menu (incl. a fail-flow that never captured): drop the
        // pending checklist item so a later capture is never mislabeled.
        pendingChecklistItem = null;
        resetModes();
        closeMenu();
        if (addingToDraft && draft) {
          // Back out of adding a shot: return to the panel unchanged.
          addingToDraft = false;
          renderPanel();
        }
      }
      return;
    }
    if (
      isPanelOpen() &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      sendDraft().catch(() => undefined);
      return;
    }
    // Record mode: S snaps an extra frame manually (outside text fields).
    if (
      recorder.recording &&
      (event.key === "s" || event.key === "S") &&
      !(event.metaKey || event.ctrlKey || event.altKey) &&
      !isEditableTarget(event)
    ) {
      event.preventDefault();
      snapFrame();
      return;
    }
    if (isMenuOpen() && !isEditableTarget(event)) {
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < menuItems.length) {
        event.preventDefault();
        menuItems[index].run();
        return;
      }
    }
    if (
      shortcut &&
      matchesShortcut(event, shortcut) &&
      !isEditableTarget(event)
    ) {
      event.preventDefault();
      if (isPanelOpen()) {
        // Composing an issue: the toggle key adds another screenshot to the draft.
        addScreenshotToDraft();
      } else if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  }

  // --- dismiss ---------------------------------------------------------------
  // Hiding the whole shadow host takes the launcher, every panel and the
  // overlays out in one move; `dismissed` additionally short-circuits the
  // keyboard shortcut, so a dismissed widget has no way back in except show().
  let dismissed = false;

  function applyDismissed(next: boolean): void {
    dismissed = next;
    host.style.display = next ? "none" : "";
  }

  function dismissWidget(): void {
    if (recorder.recording) {
      recorder.cancel();
    }
    resetModes();
    closeMenu();
    closeChecklistPanel();
    closePanel();
    hideToast();
    setDismissed(project);
    applyDismissed(true);
  }

  function showWidget(): void {
    clearDismissed(project);
    applyDismissed(false);
  }

  dismissBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissWidget();
  });
  // Honour a dismissal from a previous page load before anything is shown.
  if (dismissEnabled && readIsDismissed(project, dismissDays)) {
    applyDismissed(true);
  }

  fab.addEventListener(
    "click",
    guardUi("ui.fab", () => {
      if (recorder.recording) {
        stopRecording().catch(() => undefined);
        return;
      }
      if (isMenuOpen()) {
        pendingChecklistItem = null;
        closeMenu();
      } else {
        openMenu();
      }
    })
  );
  checklistFab.addEventListener(
    "click",
    guardUi("ui.checklistFab", () => {
      if (isChecklistPanelOpen()) {
        closeChecklistPanel();
      } else {
        openChecklistPanel();
      }
    })
  );
  checklistClose.addEventListener(
    "click",
    guardUi("ui.checklistClose", closeChecklistPanel)
  );
  // Close the checklist panel on a click outside it (but not on its own circle,
  // which toggles). The capture panel keeps its explicit Cancel button.
  const guardedPointerDown = guardUi("ui.pointerdown", (event: PointerEvent) => {
    if (!isChecklistPanelOpen()) {
      return;
    }
    const path = event.composedPath();
    if (!path.includes(checklistPanel) && !path.includes(checklistFab)) {
      closeChecklistPanel();
    }
  });
  document.addEventListener("pointerdown", guardedPointerDown, true);
  // Reveal the second circle once the checklist resolves (inline immediately,
  // or after a URL fetch). A null result (none configured / invalid / 404)
  // leaves the widget exactly as it is today.
  core
    .whenChecklistReady()
    .then((def) => {
      if (!def) {
        return;
      }
      checklistDef = def;
      // Attach the second circle + panel now (only ever when a checklist exists).
      shadow.append(checklistFab, checklistPanel);
      checklistFab.style.display = "flex";
      updateChecklistBadge();
      // url_match highlighting depends on the current path; re-render on SPA
      // navigation (from the existing navigate interception) while open.
      core.actions.subscribe((record) => {
        if (record.kind === "navigate" && isChecklistPanelOpen()) {
          renderChecklist();
        }
      });
      // Auto-open once per session: a configured checklist with no verdicts yet
      // is a strong signal the client just arrived to walk it.
      maybeAutoOpen();
    })
    .catch(() => undefined);
  // Ordered by expected frequency of use: quick captures first, the
  // no-screenshot escape hatch last.
  menuItem(strings.menuFullpage, startFullpageMode);
  // Graceful mobile mode: area needs a drag that a touch screen spends on
  // scrolling, and element mode is built on hover, which does not exist. Both
  // are hidden on coarse pointers rather than offered and then failing —
  // full page and comment-only cover the report either way.
  if (!coarsePointer) {
    menuItem(strings.menuArea, startAreaMode);
    menuItem(strings.menuElement, startElementMode);
  }
  if (recordingEnabled) {
    menuItem(strings.menuRecord, () => {
      startRecording().catch((error) =>
        console.error("[sluglist] record start failed:", error)
      );
    });
  }
  menuItem(strings.menuNoScreenshot, startNoScreenshot);
  recSnapBtn.addEventListener("click", guardUi("ui.recSnap", snapFrame));
  recStopBtn.addEventListener(
    "click",
    guardUi("ui.recStop", () => {
      stopRecording().catch(() => undefined);
    })
  );
  recCancelBtn.addEventListener("click", guardUi("ui.recCancel", cancelRecording));
  cancelBtn.addEventListener("click", guardUi("ui.cancel", closePanel));
  sendBtn.addEventListener(
    "click",
    guardUi("ui.send", () => {
      sendDraft().catch(() => undefined);
    })
  );
  // --- Attachments: drag & drop and paste ------------------------------------
  // Both are registered only when attachments are enabled, so a widget without
  // them installs no extra listeners at all.
  let dragDepth = 0;
  const guardedPaste = guardUi("ui.paste", (event: ClipboardEvent) => {
    if (!(isPanelOpen() && draft && event.clipboardData)) {
      return;
    }
    // The headline case: a screenshot taken on a phone or lifted from an email,
    // pasted straight into the panel with Cmd/Ctrl+V. Clipboard images have no
    // file name, so they get a generated one — the artifact keeps it as
    // `original_name` and the file itself is renamed after the issue anyway.
    const files: File[] = [];
    for (const item of event.clipboardData.items) {
      if (item.kind !== "file") {
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        files.push(
          file.name
            ? file
            : new File([file], `pasted.${(file.type.split("/")[1] || "png")}`, {
                type: file.type,
              })
        );
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  });
  if (attachPolicy.enabled) {
    document.addEventListener("paste", guardedPaste);
    panel.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth += 1;
      dropHint.style.display = "flex";
    });
    panel.addEventListener("dragover", (event) => {
      // Without this the browser navigates to the dropped file and the
      // half-written issue is gone.
      event.preventDefault();
    });
    panel.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropHint.style.display = "none";
      }
    });
    panel.addEventListener(
      "drop",
      guardUi("ui.drop", (event: DragEvent) => {
        event.preventDefault();
        dragDepth = 0;
        dropHint.style.display = "none";
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length > 0) {
          addFiles(files);
        }
      })
    );
  }
  const guardedKeyDown = guardUi("ui.keydown", onKeyDown);
  document.addEventListener("keydown", guardedKeyDown, true);
  // The UI's share of the self-disable path: drop the two document listeners it
  // owns and take the shadow host out of the page, so a tripped breaker leaves
  // the host DOM exactly as it found it.
  core.guard.onTrip(() => {
    document.removeEventListener("keydown", guardedKeyDown, true);
    document.removeEventListener("pointerdown", guardedPointerDown, true);
    document.removeEventListener("paste", guardedPaste);
    recorder.cancel();
    host.remove();
  });

  refreshBadge();

  return {
    dismiss: dismissWidget,
    isDismissed: () => dismissed,
    show: showWidget,
    open: guardUi("ui.open", () => {
      // A dismissed widget is hidden entirely, so opening the menu without
      // clearing the dismissal would open something invisible.
      if (dismissed) {
        showWidget();
      }
      openMenu();
    }),
    unmount: () => {
      document.removeEventListener("keydown", guardedKeyDown, true);
      document.removeEventListener("pointerdown", guardedPointerDown, true);
      document.removeEventListener("paste", guardedPaste);
      recorder.cancel();
      resetModes();
      closePanel();
      host.remove();
    },
  };
}
