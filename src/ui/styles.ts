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
  z-index: 2147483646;
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
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: #dc2626;
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  display: none;
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
  bottom: 80px;
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
.chips {
  display: flex;
  gap: 6px;
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
  padding: 6px 12px;
  font-size: 13px;
  color: #111;
  cursor: pointer;
}
.at-tool.active {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
}
.at-btn.primary {
  background: ${theme.accentColor};
  border-color: ${theme.accentColor};
  color: #fff;
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
}
.add-shot:hover {
  border-color: ${theme.accentColor};
  color: ${theme.accentColor};
}
.capture-overlay {
  position: fixed;
  bottom: 24px;
  ${side}: 24px;
  z-index: 2147483646;
  display: none;
  pointer-events: auto;
}
.capture-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  font-size: 13px;
  color: #111;
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
.capture-card button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: #111;
  cursor: pointer;
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
@media (max-width: 480px) {
  .panel {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    max-width: none;
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
