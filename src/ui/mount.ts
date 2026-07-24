import { applyMask } from "../mask";
import {
  type ChecklistDef,
  checklistProgress,
  type ChecklistState,
  type Verdict,
} from "../checklist";
import { captureArea, captureElement, captureFullPage } from "../screenshot";
import type { CaptureMode, CaptureResult, FeedbackPrivacy } from "../types";
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
  type FeedbackWidgetStrings,
  formatString,
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
  /** Record mode: ordered frame blobs + object URLs (read-only ribbon). */
  recording: boolean;
  frames: Blob[];
  frameUrls: string[];
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
    return { unmount: () => undefined };
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
  // Record mode config (frames per action).
  const recCfg = core.config.recording ?? {};
  const recordingEnabled = recCfg.enabled !== false;
  const recorder = createRecorder({
    actions: core.actions,
    maxFrames: recCfg.maxFrames ?? 30,
    frameMinInterval: recCfg.frameMinInterval ?? 650,
    privacy,
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

  const host = el("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  host.style.pointerEvents = "none";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = widgetStyles(theme);
  shadow.appendChild(style);

  // The beta preset relabels the button to "Report a problem" unless the caller
  // set an explicit buttonLabel string.
  const buttonLabel =
    uiConfig.strings?.buttonLabel ??
    (core.config.preset === "beta"
      ? strings.reportProblem
      : strings.buttonLabel);
  const fab = el("button", "fab");
  fab.type = "button";
  fab.title = shortcut ? `${buttonLabel} (${shortcutLabel})` : buttonLabel;
  const fabIcon = el("span", "fab-icon");
  // Inline SVG (message-with-pencil) so the glyph is never a missing / empty
  // emoji box on systems without the character.
  fabIcon.innerHTML = FEEDBACK_ICON_SVG;
  const fabLabel = el("span", "fab-label");
  fabLabel.textContent = buttonLabel;
  const badge = el("span", "badge");
  fab.append(fabIcon, fabLabel);
  if (shortcut) {
    const fabHotkey = el("span", "fab-hotkey");
    fabHotkey.textContent = shortcutLabel;
    fab.appendChild(fabHotkey);
  }
  fab.appendChild(badge);
  // Recording indicator: a red dot on the button while record mode is active.
  const recDot = el("span", "rec-dot");
  recDot.style.display = "none";
  fab.appendChild(recDot);

  const menu = el("div", "menu");
  const menuItems: { button: HTMLButtonElement; run: () => void }[] = [];
  // The hotkey digit follows the item's position in the menu.
  function menuItem(label: string, run: () => void) {
    const button = el("button");
    const text = el("span");
    text.textContent = label;
    const kbd = el("kbd");
    kbd.textContent = String(menuItems.length + 1);
    button.append(text, kbd);
    button.addEventListener("click", run);
    menu.appendChild(button);
    menuItems.push({ button, run });
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
  const recSnapKbd = el("kbd");
  recSnapKbd.textContent = "S";
  recSnapBtn.append(recSnapText, recSnapKbd);
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
  const commentBox = el("textarea");
  commentBox.placeholder = strings.commentPlaceholder;
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
  const actions = el("div", "dialog-actions");
  const cancelBtn = el("button");
  cancelBtn.textContent = strings.cancel;
  const sendBtn = el("button", "send");
  sendBtn.textContent = strings.send;
  actions.append(cancelBtn, sendBtn);
  panel.append(
    panelTitle,
    panelContext,
    thumbs,
    chips,
    commentBox,
    consentRow,
    actions
  );

  function syncChips(): void {
    for (const chip of chipButtons) {
      chip.classList.toggle(
        "active",
        Boolean(draft) && chip.dataset.category === draft?.category
      );
    }
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

  const checklistPanel = el("div", "checklist-panel");
  const checklistHead = el("div", "checklist-head");
  const checklistTitle = el("h2");
  const checklistProgressEl = el("span", "checklist-progress");
  checklistHead.append(checklistTitle, checklistProgressEl);
  const checklistBody = el("div", "checklist-body");
  const checklistFoot = el("div", "checklist-foot");
  const checklistDoneBtn = el("button");
  checklistDoneBtn.type = "button";
  checklistDoneBtn.textContent = strings.checklistDone;
  checklistFoot.appendChild(checklistDoneBtn);
  checklistPanel.append(checklistHead, checklistBody, checklistFoot);

  // Note: checklistFab / checklistPanel are built above but attached only when a
  // valid checklist resolves (see whenChecklistReady below), so a widget with no
  // checklist has a shadow tree identical to before this feature existed.
  shadow.append(
    fab,
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
  const collapsedSections = new Set<number>();
  let addingToDraft = false;
  // Whether the recording deck in the thumbs row is expanded into the ribbon.
  let framesExpanded = false;
  let annotating = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverTarget: Element | null = null;
  let retryPayload: Pick<CaptureResult, "files" | "sessionId"> | null = null;
  let retryIssueId = "";

  function refreshBadge(): void {
    const count = core.getIssueCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "block" : "none";
  }

  // --- Checklist mode (second circle) ---
  function checklistTotal(): number {
    return checklistDef
      ? checklistDef.sections.reduce((n, s) => n + s.items.length, 0)
      : 0;
  }

  function updateChecklistBadge(): void {
    if (!checklistDef) {
      return;
    }
    const total = checklistTotal();
    const state = core.getChecklistState();
    const done = state ? checklistProgress(state).done : 0;
    const text = `${done}/${total}`;
    checklistBadge.textContent = text;
    checklistProgressEl.textContent = text;
    const complete = total > 0 && done === total;
    checklistBadge.classList.toggle("complete", complete);
    checklistProgressEl.classList.toggle("complete", complete);
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

  function verdictButton(
    kind: Verdict,
    label: string,
    glyph: string,
    active: boolean
  ): HTMLButtonElement {
    const button = el("button", `cl-act ${kind}${active ? " active" : ""}`);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = glyph;
    return button;
  }

  function renderChecklist(): void {
    if (!checklistDef) {
      return;
    }
    checklistTitle.textContent = checklistDef.title;
    checklistTitle.title = checklistDef.title;
    const verdicts = verdictsById();
    checklistBody.innerHTML = "";
    checklistDef.sections.forEach((section, si) => {
      const sectionEl = el("div", "cl-section");
      if (collapsedSections.has(si)) {
        sectionEl.classList.add("collapsed");
      }
      if (section.title) {
        const head = el("button", "cl-section-head");
        head.type = "button";
        const chevron = el("span", "cl-chevron");
        chevron.textContent = "▾";
        const label = el("span");
        label.textContent = section.title;
        head.append(chevron, label);
        head.addEventListener("click", () => {
          if (collapsedSections.has(si)) {
            collapsedSections.delete(si);
          } else {
            collapsedSections.add(si);
          }
          sectionEl.classList.toggle("collapsed");
        });
        sectionEl.appendChild(head);
      }
      const items = el("div", "cl-items");
      for (const item of section.items) {
        const state = verdicts.get(item.id);
        const verdict = state?.verdict ?? null;
        const row = el("div", "cl-item");
        if (verdict) {
          row.classList.add(verdict);
        }
        const main = el("div", "cl-item-main");
        const title = el("span", "cl-item-title");
        title.textContent = item.title;
        main.appendChild(title);
        if (item.hint) {
          const hintEl = el("span", "cl-item-hint");
          hintEl.textContent = item.hint;
          main.appendChild(hintEl);
        }
        if (item.url) {
          const link = el("a", "cl-item-link");
          link.textContent = `${strings.checklistOpen} ↗`;
          link.href = item.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          main.appendChild(link);
        }
        if (verdict === "fail" && state?.issue) {
          const issueEl = el("span", "cl-item-issue");
          issueEl.textContent = `issue ${state.issue}`;
          main.appendChild(issueEl);
        }
        const actions = el("div", "cl-item-actions");
        const pass = verdictButton(
          "pass",
          strings.checklistPass,
          "✓",
          verdict === "pass"
        );
        const fail = verdictButton(
          "fail",
          strings.checklistFail,
          "✕",
          verdict === "fail"
        );
        const skip = verdictButton(
          "skip",
          strings.checklistSkip,
          "–",
          verdict === "skip"
        );
        pass.addEventListener("click", () => setVerdict(item.id, "pass"));
        skip.addEventListener("click", () => setVerdict(item.id, "skip"));
        fail.addEventListener("click", () => startFailFlow(item.id));
        actions.append(pass, fail, skip);
        row.append(main, actions);
        items.appendChild(row);
      }
      sectionEl.appendChild(items);
      checklistBody.appendChild(sectionEl);
    });
    updateChecklistBadge();
  }

  function setVerdict(itemId: string, verdict: Verdict): void {
    core.recordVerdict(itemId, verdict);
    renderChecklist();
  }

  // Fail: an item marked ✗ must carry evidence, so open the standard capture
  // flow tagged with this item. The verdict is recorded only once the issue is
  // sent (see sendDraft); cancelling leaves the item unset.
  function startFailFlow(itemId: string): void {
    pendingChecklistItem = itemId;
    closeChecklistPanel();
    resetModes();
    openMenu();
  }

  function isChecklistPanelOpen(): boolean {
    return checklistPanel.style.display === "flex";
  }

  function openChecklistPanel(): void {
    pendingChecklistItem = null;
    closeMenu();
    if (isPanelOpen()) {
      closePanel();
    }
    renderChecklist();
    checklistPanel.style.display = "flex";
  }

  function closeChecklistPanel(): void {
    checklistPanel.style.display = "none";
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
    fab.style.display = "flex";
  }

  function discardDraft(): void {
    if (draft) {
      for (const url of draft.urls) {
        URL.revokeObjectURL(url);
      }
      for (const url of draft.frameUrls) {
        URL.revokeObjectURL(url);
      }
    }
    draft = null;
    addingToDraft = false;
    framesExpanded = false;
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
    syncChips();
    if (commentBox.value !== draft.comment) {
      commentBox.value = draft.comment;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = strings.send;
    panel.style.display = "flex";
    commentBox.focus();
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
      draft.frameUrls.length === 0
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
      img.alt = `Screenshot ${i + 1}`;
      thumb.appendChild(img);
      const remove = el("button", "thumb-remove");
      remove.type = "button";
      remove.textContent = "×";
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
    // Recording: one stacked "deck" tile for the whole frame sequence, living
    // next to the regular screenshots. Click toggles the numbered ribbon.
    if (draft.frameUrls.length > 0) {
      const count = draft.frameUrls.length;
      const deckLabel = formatString(strings.recordingFrames, String(count));
      const deck = el("button", "thumb frame-deck");
      deck.type = "button";
      deck.classList.toggle("open", framesExpanded);
      deck.title = deckLabel;
      const img = el("img");
      img.src = draft.frameUrls[0];
      img.alt = deckLabel;
      const badge = el("span", "deck-count");
      badge.textContent = deckLabel;
      deck.append(img, badge);
      deck.addEventListener("click", () => {
        framesExpanded = !framesExpanded;
        renderThumbs();
      });
      const remove = el("button", "thumb-remove");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = strings.recordingRemove;
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!draft) {
          return;
        }
        for (const url of draft.frameUrls) {
          URL.revokeObjectURL(url);
        }
        draft.frames = [];
        draft.frameUrls = [];
        draft.recording = false;
        framesExpanded = false;
        renderThumbs();
      });
      deck.appendChild(remove);
      thumbs.appendChild(deck);
      if (framesExpanded) {
        draft.frameUrls.forEach((url, i) => {
          const frame = el("div", "thumb frame-thumb");
          const fimg = el("img");
          fimg.src = url;
          fimg.alt = `Frame ${i + 1}`;
          const num = el("span", "frame-num");
          num.textContent = String(i + 1).padStart(2, "0");
          frame.append(fimg, num);
          thumbs.appendChild(frame);
        });
      }
    }
    const addBtn = el("button", "add-shot");
    addBtn.type = "button";
    addBtn.textContent = strings.addScreenshot;
    if (shortcutLabel) {
      addBtn.title = `${strings.addScreenshot} (${shortcutLabel})`;
    }
    addBtn.addEventListener("click", addScreenshotToDraft);
    thumbs.appendChild(addBtn);
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
      frames: [],
      frameUrls: [],
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
        console.error("[feedback-widget] capture failed:", error);
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
    captureIntoDraft("element", meta, () => captureElement(target));
  }

  function startElementMode(): void {
    closeMenu();
    fab.style.display = "none";
    showHint(strings.elementHint);
    document.addEventListener("mousemove", onElementHover, true);
    document.addEventListener("click", onElementClick, true);
  }

  function startFullpageMode(): void {
    closeMenu();
    fab.style.display = "none";
    captureIntoDraft("fullpage", null, () => captureFullPage());
    fab.style.display = "flex";
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
    fab.style.display = "none";
    showHint("Drag to select an area. Esc to cancel.");
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
    captureIntoDraft("area", null, () => captureArea(rect));
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
    await recorder.start();
  }

  async function stopRecording(): Promise<void> {
    if (!recorder.recording) {
      return;
    }
    const frames = recorder.stop();
    const maskedAny = recorder.maskedAny;
    // An open draft (recording added via "+ Add screenshot" or with the panel
    // up) keeps its shots and comment: frames are appended, not a new issue.
    if (draft) {
      addingToDraft = false;
      draft.frames.push(...frames);
      draft.frameUrls.push(...frames.map((f) => URL.createObjectURL(f)));
      draft.recording = draft.frames.length > 0;
      draft.maskedAny = draft.maskedAny || maskedAny;
      renderPanel();
      return;
    }
    // Fresh recording: final screenshot (the "moment of Stop"), masked like
    // the frames, then a new draft.
    const mask = applyMask(privacy);
    let main: Blob | null = null;
    try {
      main = await captureFullPage();
    } catch (error) {
      console.error("[sluglist] final capture failed:", error);
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
      recording: true,
      frames,
      frameUrls: frames.map((f) => URL.createObjectURL(f)),
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
    const frames = attachShots ? current.frames : [];
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
        // Record mode: attach the frame sequence (unless consent dropped it).
        ...(current.recording && frames.length > 0
          ? { recording: true, frames }
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

  fab.addEventListener("click", () => {
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
  });
  checklistFab.addEventListener("click", () => {
    if (isChecklistPanelOpen()) {
      closeChecklistPanel();
    } else {
      openChecklistPanel();
    }
  });
  checklistDoneBtn.addEventListener("click", closeChecklistPanel);
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
    })
    .catch(() => undefined);
  // Ordered by expected frequency of use: quick captures first, the
  // no-screenshot escape hatch last.
  menuItem(strings.menuFullpage, startFullpageMode);
  menuItem(strings.menuArea, startAreaMode);
  menuItem(strings.menuElement, startElementMode);
  if (recordingEnabled) {
    menuItem(strings.menuRecord, () => {
      startRecording().catch((error) =>
        console.error("[sluglist] record start failed:", error)
      );
    });
  }
  menuItem(strings.menuNoScreenshot, startNoScreenshot);
  recSnapBtn.addEventListener("click", snapFrame);
  recStopBtn.addEventListener("click", () => {
    stopRecording().catch(() => undefined);
  });
  recCancelBtn.addEventListener("click", cancelRecording);
  cancelBtn.addEventListener("click", closePanel);
  sendBtn.addEventListener("click", () => {
    sendDraft().catch(() => undefined);
  });
  document.addEventListener("keydown", onKeyDown, true);

  refreshBadge();

  return {
    unmount: () => {
      document.removeEventListener("keydown", onKeyDown, true);
      recorder.cancel();
      resetModes();
      closePanel();
      host.remove();
    },
  };
}
