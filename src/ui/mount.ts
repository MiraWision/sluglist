import { captureArea, captureElement, captureFullPage } from "../screenshot";
import type { CaptureMode, CaptureResult } from "../types";
import type { FeedbackWidgetCore } from "../widget";
import { annotateBlob } from "./annotate";
import {
  type ConsoleErrorBuffer,
  installConsoleErrorBuffer,
} from "./console-buffer";
import { computeCssSelector } from "./selector";
import {
  DEFAULT_STRINGS,
  type FeedbackWidgetStrings,
  formatString,
} from "./strings";
import { type UiTheme, widgetStyles } from "./styles";

export interface FeedbackWidgetUiConfig {
  /** Button accent color. Default near-black graphite. */
  accentColor?: string;
  /**
   * Global hotkey that toggles the widget menu, as "modifier+key".
   * Default "alt+shift+f". Pass null to disable.
   */
  hotkey?: string | null;
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
  comment: string;
  mode: CaptureMode;
  selector: string | null;
  shots: Blob[];
  urls: string[];
}

const CATEGORIES: {
  key: string;
  label: (s: FeedbackWidgetStrings) => string;
}[] = [
  { key: "bug", label: (s) => s.categoryBug },
  { key: "design", label: (s) => s.categoryDesign },
  { key: "idea", label: (s) => s.categoryIdea },
];

const HOST_ATTRIBUTE = "data-feedback-widget";
const TOAST_MS = 2600;
const CAPTURE_SETTLE_MS = 60;
const DEFAULT_HOTKEY = "alt+shift+f";
const MAC_PLATFORM = /mac|iphone|ipad/i;

// Round chat bubble (rendered in currentColor). The dot marks the visual
// center of the bubble body so it optically centers in the round button.
const FEEDBACK_ICON_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split("+");
  const key = parts.at(-1) ?? "";
  return (
    event.key.toLowerCase() === key &&
    parts.includes("alt") === event.altKey &&
    parts.includes("shift") === event.shiftKey &&
    (parts.includes("ctrl") || parts.includes("cmd")) ===
      (event.ctrlKey || event.metaKey)
  );
}

/** Human-readable hotkey, e.g. "⌥⇧F" on Mac or "Alt+Shift+F" elsewhere. */
function prettyHotkey(hotkey: string): string {
  const isMac = MAC_PLATFORM.test(navigator.platform || navigator.userAgent);
  const parts = hotkey.toLowerCase().split("+");
  const key = (parts.at(-1) ?? "").toUpperCase();
  if (!isMac) {
    return parts
      .slice(0, -1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .concat(key)
      .join("+");
  }
  const mods = parts
    .slice(0, -1)
    .map((p) =>
      p === "alt" ? "⌥" : p === "shift" ? "⇧" : p === "ctrl" ? "⌃" : "⌘"
    )
    .join("");
  return mods + key;
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
  const hotkey =
    uiConfig.hotkey === null ? null : (uiConfig.hotkey ?? DEFAULT_HOTKEY);

  const host = el("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  host.style.pointerEvents = "none";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = widgetStyles(theme);
  shadow.appendChild(style);

  const fab = el("button", "fab");
  fab.type = "button";
  fab.title = hotkey
    ? `${strings.buttonLabel} (${prettyHotkey(hotkey)})`
    : strings.buttonLabel;
  const fabIcon = el("span", "fab-icon");
  // Inline SVG (message-with-pencil) so the glyph is never a missing / empty
  // emoji box on systems without the character.
  fabIcon.innerHTML = FEEDBACK_ICON_SVG;
  const fabLabel = el("span", "fab-label");
  fabLabel.textContent = strings.buttonLabel;
  const badge = el("span", "badge");
  fab.append(fabIcon, fabLabel);
  if (hotkey) {
    const fabHotkey = el("span", "fab-hotkey");
    fabHotkey.textContent = prettyHotkey(hotkey);
    fab.appendChild(fabHotkey);
  }
  fab.appendChild(badge);

  const menu = el("div", "menu");
  const menuItems: { button: HTMLButtonElement; run: () => void }[] = [];
  function menuItem(label: string, key: string, run: () => void) {
    const button = el("button");
    const text = el("span");
    text.textContent = label;
    const kbd = el("kbd");
    kbd.textContent = key;
    button.append(text, kbd);
    button.addEventListener("click", run);
    menu.appendChild(button);
    menuItems.push({ button, run });
  }

  const hint = el("div", "hint");
  const highlight = el("div", "highlight");
  const areaOverlay = el("div", "area-overlay");
  const areaRect = el("div", "area-rect");

  const captureOverlay = el("div", "capture-overlay");
  const captureCard = el("div", "capture-card");
  const spinner = el("div", "spinner");
  const captureText = el("span");
  captureText.textContent = strings.capturing;
  const captureCancelBtn = el("button");
  captureCancelBtn.type = "button";
  captureCancelBtn.textContent = strings.capturingCancel;
  captureCard.append(spinner, captureText, captureCancelBtn);
  captureOverlay.appendChild(captureCard);

  // Corner panel instead of a centered modal: the page stays visible and
  // scrollable while the reporter writes the comment.
  const panel = el("div", "panel");
  const panelTitle = el("h2");
  const panelContext = el("p", "panel-context");
  const thumbs = el("div", "thumbs");
  const chips = el("div", "chips");
  const chipButtons = CATEGORIES.map(({ key, label }) => {
    const chip = el("button", "chip");
    chip.type = "button";
    chip.textContent = label(strings);
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
  const actions = el("div", "dialog-actions");
  const cancelBtn = el("button");
  cancelBtn.textContent = strings.cancel;
  const sendBtn = el("button", "send");
  sendBtn.textContent = strings.send;
  actions.append(cancelBtn, sendBtn);
  panel.append(panelTitle, panelContext, thumbs, chips, commentBox, actions);

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

  shadow.append(
    fab,
    menu,
    hint,
    highlight,
    areaOverlay,
    areaRect,
    captureOverlay,
    panel,
    toast
  );
  document.body.appendChild(host);

  const errors: ConsoleErrorBuffer = installConsoleErrorBuffer();

  let draft: Draft | null = null;
  let addingToDraft = false;
  let captureCancelled = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverTarget: Element | null = null;
  let retryPayload: Pick<CaptureResult, "files" | "sessionId"> | null = null;
  let retryIssueId = "";

  function refreshBadge(): void {
    const count = core.getIssueCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "block" : "none";
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
    menu.style.display = "flex";
  }

  function isPanelOpen(): boolean {
    return panel.style.display === "flex";
  }

  function showCaptureOverlay(): void {
    captureCancelled = false;
    captureOverlay.style.display = "flex";
  }

  function hideCaptureOverlay(): void {
    captureOverlay.style.display = "none";
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
    }
    draft = null;
    addingToDraft = false;
  }

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

    thumbs.innerHTML = "";
    if (draft.urls.length === 0) {
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
        renderPanel();
      });
      thumb.appendChild(remove);
      thumb.title = strings.annotateArrow;
      thumb.addEventListener("click", async () => {
        if (!draft) {
          return;
        }
        const annotated = await annotateBlob(shadow, draft.shots[i], strings);
        if (annotated) {
          URL.revokeObjectURL(draft.urls[i]);
          draft.shots[i] = annotated;
          draft.urls[i] = URL.createObjectURL(annotated);
          renderPanel();
        }
      });
      thumbs.appendChild(thumb);
    });
    const addBtn = el("button", "add-shot");
    addBtn.type = "button";
    addBtn.textContent = strings.addScreenshot;
    addBtn.addEventListener("click", () => {
      if (!draft) {
        return;
      }
      draft.comment = commentBox.value;
      addingToDraft = true;
      panel.style.display = "none";
      openMenu();
    });
    thumbs.appendChild(addBtn);

    syncChips();
    commentBox.value = draft.comment;
    sendBtn.disabled = false;
    panel.style.display = "flex";
    commentBox.focus();
  }

  function addShot(shot: Blob | null): void {
    if (!draft) {
      return;
    }
    if (shot) {
      draft.shots.push(shot);
      draft.urls.push(URL.createObjectURL(shot));
    }
    addingToDraft = false;
    renderPanel();
  }

  function openDraft(
    mode: CaptureMode,
    shot: Blob | null,
    selector: string | null
  ): void {
    if (addingToDraft && draft) {
      addShot(shot);
      return;
    }
    discardDraft();
    draft = {
      mode,
      selector,
      shots: shot ? [shot] : [],
      urls: shot ? [URL.createObjectURL(shot)] : [],
      comment: "",
      category: null,
    };
    renderPanel();
  }

  function closePanel(): void {
    panel.style.display = "none";
    discardDraft();
  }

  async function runCapture(work: () => Promise<Blob>): Promise<Blob | null> {
    showCaptureOverlay();
    try {
      await sleep(CAPTURE_SETTLE_MS);
      const shot = await work();
      return captureCancelled ? null : shot;
    } catch (error) {
      console.error("[feedback-widget] capture failed:", error);
      return null;
    } finally {
      hideCaptureOverlay();
    }
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

  async function onElementClick(event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const target =
      hoverTarget ?? document.elementFromPoint(event.clientX, event.clientY);
    resetModes();
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const selector = computeCssSelector(target);
    const shot = await runCapture(() => captureElement(target));
    if (captureCancelled) {
      return;
    }
    openDraft("element", shot, selector);
  }

  function startElementMode(): void {
    closeMenu();
    fab.style.display = "none";
    showHint(strings.elementHint);
    document.addEventListener("mousemove", onElementHover, true);
    document.addEventListener("click", onElementClick, true);
  }

  async function startFullpageMode(): Promise<void> {
    closeMenu();
    fab.style.display = "none";
    const shot = await runCapture(() => captureFullPage());
    fab.style.display = "flex";
    if (captureCancelled) {
      return;
    }
    openDraft("fullpage", shot, null);
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
  areaOverlay.addEventListener("pointerup", async (event) => {
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
    const shot = await runCapture(() => captureArea(rect));
    if (captureCancelled) {
      return;
    }
    openDraft("area", shot, null);
  });

  function startNoScreenshot(): void {
    closeMenu();
    if (addingToDraft && draft) {
      addShot(null);
      return;
    }
    openDraft("fullpage", null, null);
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
    try {
      const result = await core.captureIssue({
        comment,
        screenshots: current.shots,
        selector: current.selector,
        mode: current.mode,
        ...(current.category ? { category: current.category } : {}),
        consoleErrors: errors.snapshot(),
      });
      closePanel();
      refreshBadge();
      if (result) {
        trackDelivery(result).catch(() => undefined);
      }
    } catch (error) {
      sendBtn.disabled = false;
      console.error("[feedback-widget] capture failed:", error);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (isPanelOpen()) {
        closePanel();
      } else {
        captureCancelled = true;
        hideCaptureOverlay();
        resetModes();
        closeMenu();
        if (addingToDraft && draft) {
          addShot(null);
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
    if (isMenuOpen() && !isEditableTarget(event)) {
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < menuItems.length) {
        event.preventDefault();
        menuItems[index].run();
        return;
      }
    }
    if (
      hotkey &&
      matchesHotkey(event, hotkey) &&
      !isEditableTarget(event) &&
      !isPanelOpen()
    ) {
      event.preventDefault();
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  }

  captureCancelBtn.addEventListener("click", () => {
    captureCancelled = true;
    hideCaptureOverlay();
    if (addingToDraft && draft) {
      addShot(null);
    }
  });

  fab.addEventListener("click", () => {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });
  menuItem(strings.menuElement, "1", startElementMode);
  menuItem(strings.menuFullpage, "2", () => {
    startFullpageMode().catch((error) => {
      console.error("[feedback-widget] fullpage mode failed:", error);
    });
  });
  menuItem(strings.menuArea, "3", startAreaMode);
  menuItem(strings.menuNoScreenshot, "4", startNoScreenshot);
  cancelBtn.addEventListener("click", closePanel);
  sendBtn.addEventListener("click", () => {
    sendDraft().catch(() => undefined);
  });
  document.addEventListener("keydown", onKeyDown, true);

  refreshBadge();

  return {
    unmount: () => {
      document.removeEventListener("keydown", onKeyDown, true);
      resetModes();
      closePanel();
      errors.uninstall();
      host.remove();
    },
  };
}
