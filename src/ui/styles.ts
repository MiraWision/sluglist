export interface UiTheme {
  accentColor: string;
  position: "bottom-left" | "bottom-right";
}

export function widgetStyles(theme: UiTheme): string {
  const side = theme.position === "bottom-left" ? "left" : "right";
  return `
:host {
  all: initial;
}
* {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.fab {
  position: fixed;
  bottom: 24px;
  ${side}: 24px;
  /* One below the menus/panels/toast (…646) so those always paint over the
     floating circles instead of the circles covering them. */
  z-index: 2147483645;
  height: 44px;
  min-width: 44px;
  max-width: 44px;
  padding: 0 11px;
  border-radius: 22px;
  border: 1px solid rgba(17, 17, 17, 0.1);
  background: #fff;
  color: #18181b;
  font-size: 17px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  /* visible (not hidden) so the count badge in the corner is not clipped; the
     collapsing labels clip themselves via their own overflow:hidden. */
  overflow: visible;
  white-space: nowrap;
  transition: max-width 0.25s ease;
}
.fab:hover {
  max-width: 280px;
  background: #f9fafb;
}
.fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
}
/* Optically nudge the slug mark up a couple pixels so it sits centered. */
.fab-icon svg {
  transform: translateY(-2px);
}
/*
 * Collapsed labels must take zero width (not just opacity 0), otherwise the
 * flex row is wider than the collapsed button and overflow:hidden clips the
 * icon out of view. They expand on hover.
 */
.fab-label {
  font-size: 13px;
  font-weight: 500;
  max-width: 0;
  min-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.25s ease, margin-left 0.25s ease, opacity 0.2s ease;
}
.fab-hotkey {
  font-size: 11px;
  color: rgba(17, 17, 17, 0.5);
  border: 0 solid rgba(17, 17, 17, 0.2);
  border-radius: 4px;
  padding: 1px 0;
  max-width: 0;
  min-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.25s ease, margin-left 0.25s ease, opacity 0.2s ease;
}
.fab:hover .fab-label {
  max-width: 140px;
  margin-left: 8px;
  opacity: 1;
}
.fab:hover .fab-hotkey {
  max-width: 70px;
  margin-left: 8px;
  padding: 1px 5px;
  border-width: 1px;
  opacity: 1;
}
/* Neutral (brand) badge for the issue count — red is reserved for delivery
   problems, surfaced by the toast, not by this counter. */
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: ${theme.accentColor};
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  display: none;
}
/* Second circle: the optional checklist button, stacked directly above the
   main FAB. Only present when a valid checklist is configured. */
.checklist-fab {
  position: fixed;
  bottom: 78px;
  ${side}: 24px;
  z-index: 2147483645;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: 1px solid rgba(17, 17, 17, 0.1);
  background: #fff;
  color: #18181b;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.checklist-fab:hover {
  background: #f9fafb;
}
.checklist-fab svg {
  width: 20px;
  height: 20px;
}
.checklist-fab .cl-badge {
  position: absolute;
  top: -6px;
  /* Same corner as the main FAB's count badge (top-right), not mirrored. */
  right: -6px;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: ${theme.accentColor};
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.checklist-fab .cl-badge.complete {
  background: #16a34a;
}
.menu {
  position: fixed;
  bottom: 80px;
  ${side}: 24px;
  z-index: 2147483646;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 6px;
  display: none;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
  min-width: 190px;
}
.menu button {
  border: none;
  background: none;
  text-align: left;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #111;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.menu button:hover {
  background: #f3f4f6;
}
.menu kbd {
  font-family: inherit;
  font-size: 11px;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 5px;
  min-width: 18px;
  text-align: center;
}
.hint {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483646;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 8px;
  display: none;
  pointer-events: none;
}
.highlight {
  position: fixed;
  z-index: 2147483645;
  border: 2px solid rgba(255, 255, 255, 0.95);
  outline: 1px solid rgba(0, 0, 0, 0.65);
  outline-offset: 1px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  pointer-events: none;
  display: none;
}
.area-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  cursor: crosshair;
  background: rgba(17, 17, 17, 0.08);
  display: none;
  pointer-events: auto;
}
.area-rect {
  position: fixed;
  z-index: 2147483646;
  border: 2px dashed rgba(255, 255, 255, 0.95);
  outline: 1px solid rgba(0, 0, 0, 0.65);
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
  display: none;
}
.panel {
  position: fixed;
  bottom: 24px;
  ${side}: 24px;
  z-index: 2147483646;
  width: 340px;
  max-width: calc(100vw - 48px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  display: none;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}
.panel h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111;
}
.panel .panel-context {
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.no-shot {
  font-size: 12px;
  color: #9ca3af;
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.thumb {
  position: relative;
  width: 76px;
  height: 56px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  cursor: zoom-in;
  padding: 0;
  background: #f9fafb;
}
.thumb:hover {
  border-color: #9ca3af;
}
.thumb-pending {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}
.thumb-pending:hover {
  border-color: #e5e7eb;
}
.frame-thumb {
  cursor: default;
}
.frame-thumb:hover {
  border-color: #e5e7eb;
}
.frame-num {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(17, 17, 17, 0.72);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
}
/* Recording deck: one tile for the whole frame sequence, drawn as a small
   stack (two tilted cards behind the front frame). Click expands the ribbon. */
.frame-deck {
  overflow: visible;
  background: none;
  border: none;
  margin: 0 3px;
  cursor: pointer;
}
.frame-deck::before,
.frame-deck::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
}
.frame-deck::before {
  transform: rotate(-4deg) translate(-3px, 1px);
}
.frame-deck::after {
  transform: rotate(3deg) translate(3px, -1px);
}
.frame-deck img {
  position: relative;
  z-index: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.frame-deck:hover img,
.frame-deck.open img {
  border-color: #9ca3af;
}
.deck-count {
  position: absolute;
  z-index: 2;
  bottom: 2px;
  left: 2px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(17, 17, 17, 0.72);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  pointer-events: none;
}
.deck-count::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #dc2626;
}
.rec-dot {
  position: absolute;
  top: -4px;
  left: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #dc2626;
  box-shadow: 0 0 0 2px #fff;
  animation: fbw-pulse 1.2s ease-in-out infinite;
}
@keyframes fbw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.rec-bar {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  font-size: 13px;
  padding: 7px 8px 7px 14px;
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
}
.rec-bar-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #dc2626;
  animation: fbw-pulse 1.2s ease-in-out infinite;
}
.rec-bar-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rec-bar-text {
  white-space: nowrap;
}
.rec-bar-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}
.rec-bar button {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.rec-stop {
  background: #fff;
  color: #111;
  font-weight: 600;
}
.rec-cancel {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
.rec-snap {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rec-snap kbd {
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 3px;
  padding: 2px 4px;
}
.rec-snap:disabled {
  opacity: 0.45;
  cursor: default;
}
.chips {
  display: flex;
  gap: 6px;
}
.consent {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}
.consent input {
  width: 15px;
  height: 15px;
  margin: 0;
  cursor: pointer;
  accent-color: ${theme.accentColor};
}
.chip {
  border: 1px solid #d1d5db;
  background: none;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
.chip:hover {
  border-color: #9ca3af;
}
.chip.active {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
}
.annotate-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(17, 17, 17, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  pointer-events: auto;
}
.annotate-stage {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  width: 100%;
}
.annotate-canvas {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  cursor: crosshair;
  touch-action: none;
}
.annotate-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.at-tool,
.at-btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: #111;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.at-tool {
  padding: 6px 8px;
}
.at-tool kbd,
.at-btn kbd {
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  padding: 2px 4px;
}
.at-tool.active {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
}
.at-tool.active kbd {
  color: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.35);
}
.at-btn.primary {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
}
.at-text-input {
  position: fixed;
  z-index: 2147483647;
  min-width: 60px;
  background: transparent;
  border: none;
  border-bottom: 2px dashed rgba(255, 255, 255, 0.7);
  outline: none;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 0;
  transform: translateY(-2px);
}
.at-swatches {
  display: flex;
  gap: 5px;
  padding: 0 4px;
}
.at-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.at-swatch.active {
  border-color: #111;
  box-shadow: 0 0 0 1px #fff inset;
}
.at-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}
.zoom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(17, 17, 17, 0.75);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  pointer-events: auto;
}
.zoom-backdrop img {
  max-width: calc(100vw - 64px);
  max-height: calc(100vh - 64px);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb .thumb-remove {
  position: absolute;
  z-index: 2;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(17, 17, 17, 0.7);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  padding: 0;
}
.add-shot {
  height: 56px;
  padding: 0 12px;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  background: none;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.add-shot:hover {
  border-color: ${theme.accentColor};
  color: ${theme.accentColor};
}
/* Kbd chip: shows the live toggle shortcut wherever we invite a screenshot. */
.kbd-hint {
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 2px 5px;
  white-space: nowrap;
}
.add-shot:hover .kbd-hint {
  border-color: ${theme.accentColor};
  color: ${theme.accentColor};
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #e5e7eb;
  border-top-color: ${theme.accentColor};
  border-radius: 50%;
  animation: fbw-spin 0.8s linear infinite;
}
@keyframes fbw-spin {
  to { transform: rotate(360deg); }
}
textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  color: #111;
}
textarea:focus {
  outline: 2px solid ${theme.accentColor};
  border-color: transparent;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dialog-actions button {
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111;
}
.dialog-actions .send {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
}
.dialog-actions .send:disabled {
  opacity: 0.5;
  cursor: default;
}
.toast {
  position: fixed;
  bottom: 84px;
  ${side}: 24px;
  z-index: 2147483646;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  font-size: 13px;
  padding: 9px 14px;
  border-radius: 8px;
  display: none;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}
.toast.error {
  background: rgba(153, 27, 27, 0.95);
}
.toast .toast-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: fbw-spin 0.8s linear infinite;
  display: none;
}
.toast .toast-retry {
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: none;
  color: #fff;
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 12px;
  cursor: pointer;
  display: none;
}
/* Checklist panel: same corner as the capture panel (only one is open at a
   time), taller with its own scroll for long lists. */
.checklist-panel {
  position: fixed;
  /* Sits in the corner with matching right/bottom margins — the floating circle
     is hidden while the panel is open, so no gap is needed for it. */
  bottom: 24px;
  ${side}: 24px;
  z-index: 2147483646;
  width: 360px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: none;
  flex-direction: column;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}
.checklist-head {
  padding: 14px 16px 12px;
  border-bottom: 1px solid #f1f1f3;
}
.cl-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
/* The title reads like a document heading, not a UI label. */
.checklist-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
  color: #111;
  letter-spacing: -0.01em;
}
.cl-close {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin: -3px -4px 0 0;
  border: none;
  background: none;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cl-close:hover {
  background: #f3f4f6;
  color: #111;
}
.cl-description {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #6b7280;
}
.cl-summary {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 10px;
}
.cl-summary-line {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.cl-summary.complete .cl-summary-line {
  color: #16a34a;
  font-weight: 600;
}
.cl-summary-note {
  font-size: 11px;
  color: #9ca3af;
}
.checklist-body {
  overflow-y: auto;
  padding: 6px 8px 12px;
}
.cl-section {
  margin-top: 2px;
}
.cl-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: none;
  padding: 8px 6px;
  cursor: pointer;
  text-align: left;
}
.cl-section-head .cl-chevron {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  transition: transform 0.15s ease;
  color: #9ca3af;
}
.cl-section-head .cl-chevron svg {
  width: 12px;
  height: 12px;
}
.cl-section-name {
  flex: 1 1 auto;
  font-size: 13px;
  font-weight: 600;
  color: #111;
}
.cl-section-meta {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.cl-section.done .cl-section-name {
  color: #9ca3af;
}
.cl-section.collapsed .cl-chevron {
  transform: rotate(-90deg);
}
/* Smooth collapse: animate the grid track from 1fr → 0fr (auto-height that CSS
   can transition), with the inner wrapper clipped as it shrinks. */
.cl-items {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.22s ease;
}
.cl-section.collapsed .cl-items {
  grid-template-rows: 0fr;
}
.cl-items-inner {
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cl-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  position: relative;
}
.cl-item:hover {
  background: #fafafa;
}
.cl-item:focus-visible {
  outline: 2px solid ${theme.accentColor};
  outline-offset: -1px;
}
/* Left check indicator: an empty circle → ✓ (clean) → ! (issue). */
.cl-check {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: 50%;
  border: 1.5px solid #d1d5db;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cl-item.pass .cl-check,
.cl-item.skip .cl-check {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
}
.cl-item.fail .cl-check {
  background: #dc2626;
  border-color: #dc2626;
}
.cl-item.here {
  background: rgba(59, 130, 246, 0.07);
  border-color: rgba(59, 130, 246, 0.28);
}
.cl-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cl-item-titlerow {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}
.cl-item-title {
  font-size: 13px;
  color: #111;
  line-height: 1.35;
}
/* Checked-clean: greyed + struck through. A flagged item keeps its text but
   gets the issue accent instead. */
.cl-item.pass .cl-item-title,
.cl-item.skip .cl-item-title {
  color: #9ca3af;
  text-decoration: line-through;
}
.cl-item-here {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
  padding: 1px 6px;
  border-radius: 999px;
}
.cl-item-hint {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.3;
}
.cl-item-links {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 1px;
}
.cl-item-link {
  font-size: 11px;
  color: ${theme.accentColor};
  text-decoration: none;
}
.cl-item-link:hover {
  text-decoration: underline;
}
.cl-item-issue {
  font-size: 11px;
  color: #dc2626;
  font-variant-numeric: tabular-nums;
}
/* The slug (issue) button: hidden until row hover on pointer devices, always
   visible but muted on touch. */
.cl-issue-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  margin: -2px -2px 0 0;
  border: none;
  background: none;
  border-radius: 7px;
  color: #9ca3af;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease, background 0.12s ease;
}
.cl-issue-btn svg {
  width: 17px;
  height: 17px;
}
.cl-item:hover .cl-issue-btn,
.cl-issue-btn:focus-visible,
.cl-issue-btn.touch {
  opacity: 1;
}
.cl-issue-btn.touch {
  opacity: 0.5;
}
.cl-issue-btn:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  opacity: 1;
}
@media (max-width: 480px) {
  .panel {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    max-width: none;
  }
  .checklist-panel {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    max-width: none;
    max-height: calc(100vh - 90px);
  }
  .menu {
    left: 12px;
    right: 12px;
    bottom: 76px;
    min-width: 0;
  }
  .fab {
    bottom: 16px;
    ${side}: 16px;
  }
  .annotate-toolbar {
    width: 100%;
    justify-content: center;
  }
}
`;
}
