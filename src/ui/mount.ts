import { captureArea, captureElement, captureFullPage } from "../screenshot";
import type { CaptureMode, CaptureResult } from "../types";
import type { FeedbackWidgetCore } from "../widget";
import { annotateBlob } from "./annotate";
import {
  type ConsoleErrorBuffer,
  installConsoleErrorBuffer,
} from "./console-buffer";
import {
  collectElementMetadata,
  type ElementMetadata,
} from "../selector";
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
   * Default "alt+shift+f". Pass null to disable.
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
  const categories = uiConfig.categories ?? defaultCategories(strings);
  const container = uiConfig.container ?? document.body;
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
    panel,
    toast
  );
  container.appendChild(host);

  const errors: ConsoleErrorBuffer = installConsoleErrorBuffer();

  let draft: Draft | null = null;
  let addingToDraft = false;
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
    if (draft.urls.length === 0 && draft.pending === 0) {
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
    draft = {
      mode,
      meta,
      selector: meta?.selector ?? null,
      shots: [],
      urls: [],
      comment: "",
      category: null,
      pending: 0,
      captures: [],
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
        const shot = await work();
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
    try {
      const meta = current.meta;
      const result = await core.captureIssue({
        comment,
        screenshots: current.shots,
        selector: current.selector,
        mode: current.mode,
        ...(current.category ? { category: current.category } : {}),
        // Present for every mode (null when not element) so the artifact fields
        // are always there.
        selectorStrategy: meta?.selectorStrategy ?? null,
        selectorUnique: meta?.selectorUnique ?? null,
        elementText: meta?.elementText ?? null,
        domPath: meta?.domPath ?? null,
        screen: meta?.screen ?? null,
        consoleErrors: errors.snapshot(),
      });
      closePanel();
      refreshBadge();
      if (result) {
        uiConfig.onIssueCaptured?.(result);
        trackDelivery(result).catch(() => undefined);
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
      if (isPanelOpen()) {
        closePanel();
      } else {
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

  fab.addEventListener("click", () => {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });
  menuItem(strings.menuElement, "1", startElementMode);
  menuItem(strings.menuFullpage, "2", startFullpageMode);
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
