import type { FeedbackWidgetStrings } from "./strings";

/**
 * Minimal annotation editor: draw arrows and boxes over a screenshot, then
 * flatten them onto the image at full resolution. Opens as an overlay inside
 * the widget's shadow root and resolves with a new Blob, or null if cancelled
 * or closed without changes. Uses pointer events so it works with touch.
 */

type Tool = "arrow" | "box";

interface Shape {
  color: string;
  tool: Tool;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];
const LINE_WIDTH = 4;
const ARROW_HEAD = 16;

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

function drawArrow(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  scale: number
): void {
  const head = ARROW_HEAD * scale;
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x2, s.y2);
  ctx.lineTo(
    s.x2 - head * Math.cos(angle - Math.PI / 6),
    s.y2 - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    s.x2 - head * Math.cos(angle + Math.PI / 6),
    s.y2 - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = s.color;
  ctx.fill();
}

export function annotateBlob(
  shadow: ShadowRoot,
  blob: Blob,
  strings: FeedbackWidgetStrings
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const overlay = el("div", "annotate-overlay");
    const stage = el("div", "annotate-stage");
    const canvas = el("canvas", "annotate-canvas");
    const toolbar = el("div", "annotate-toolbar");
    stage.appendChild(canvas);
    overlay.append(stage, toolbar);
    shadow.appendChild(overlay);

    const ctx = canvas.getContext("2d");
    const img = new Image();
    const shapes: Shape[] = [];
    let tool: Tool = "arrow";
    let color = COLORS[0];
    let drawing: Shape | null = null;
    let dirty = false;

    function redraw(): void {
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const scale = canvas.width / img.naturalWidth || 1;
      ctx.lineWidth = LINE_WIDTH * scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const all = drawing ? [...shapes, drawing] : shapes;
      for (const s of all) {
        ctx.strokeStyle = s.color;
        if (s.tool === "box") {
          ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
        } else {
          drawArrow(ctx, s, scale);
        }
      }
    }

    function finish(result: Blob | null): void {
      overlay.remove();
      resolve(result);
    }

    function commit(): void {
      if (!(dirty && ctx)) {
        finish(null);
        return;
      }
      drawing = null;
      redraw();
      canvas.toBlob((out) => finish(out ?? null), "image/png");
    }

    function toCanvasPoint(event: PointerEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * sx,
        y: (event.clientY - rect.top) * sy,
      };
    }

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const p = toCanvasPoint(event);
      drawing = { tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) {
        return;
      }
      const p = toCanvasPoint(event);
      drawing.x2 = p.x;
      drawing.y2 = p.y;
      redraw();
    });
    canvas.addEventListener("pointerup", () => {
      if (!drawing) {
        return;
      }
      const moved =
        Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 4;
      if (moved) {
        shapes.push(drawing);
        dirty = true;
      }
      drawing = null;
      redraw();
    });

    // Toolbar: tools, colors, undo, done, cancel.
    function toolButton(label: string, value: Tool): HTMLButtonElement {
      const button = el(
        "button",
        value === tool ? "at-tool active" : "at-tool"
      );
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        tool = value;
        for (const b of toolbar.querySelectorAll(".at-tool")) {
          b.classList.remove("active");
        }
        button.classList.add("active");
      });
      return button;
    }
    toolbar.append(
      toolButton(strings.annotateArrow, "arrow"),
      toolButton(strings.annotateBox, "box")
    );

    const swatches = el("div", "at-swatches");
    for (const c of COLORS) {
      const dot = el("button", c === color ? "at-swatch active" : "at-swatch");
      dot.type = "button";
      dot.style.background = c;
      dot.addEventListener("click", () => {
        color = c;
        for (const s of swatches.querySelectorAll(".at-swatch")) {
          s.classList.remove("active");
        }
        dot.classList.add("active");
      });
      swatches.appendChild(dot);
    }
    toolbar.appendChild(swatches);

    const undoBtn = el("button", "at-btn");
    undoBtn.type = "button";
    undoBtn.textContent = strings.annotateUndo;
    undoBtn.addEventListener("click", () => {
      shapes.pop();
      dirty = shapes.length > 0 || dirty;
      redraw();
    });

    const spacer = el("div", "at-spacer");
    const cancelBtn = el("button", "at-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = strings.cancel;
    cancelBtn.addEventListener("click", () => finish(null));
    const doneBtn = el("button", "at-btn primary");
    doneBtn.type = "button";
    doneBtn.textContent = strings.annotateDone;
    doneBtn.addEventListener("click", commit);
    toolbar.append(undoBtn, spacer, cancelBtn, doneBtn);

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        finish(null);
      }
    });

    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Cap the working canvas so huge full-page shots stay responsive; the
      // output keeps this resolution.
      const maxDim = 2000;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, 1));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      redraw();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      finish(null);
    };
    img.src = url;
  });
}
