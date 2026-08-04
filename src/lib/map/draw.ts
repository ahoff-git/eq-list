/**
 * Low-level canvas drawing for the map subsystem. Ported from eq-map (see ADR 0010).
 * DOM-dependent (uses HTMLCanvasElement / CanvasRenderingContext2D), so it lives on
 * the renderer side, apart from the pure geometry in `src/shared/map/`.
 */

import { fitRect } from "@/shared/map/coords";
import type { MapRect } from "@/shared/map/types";

export type CircleOptions = {
  color?: string;
  size?: number;
  globalAlpha?: number;
};

/** A pseudo-random, readable color string (used by the "random" dot option). */
export function getRndColor(): string {
  const red = Math.round(Math.random() * 234 + 10);
  const green = Math.round(Math.random() * 234 + 20);
  const blue = Math.round(Math.random() * 234 + 20);
  return "#" + red.toString(16) + green.toString(16) + blue.toString(16);
}

export function drawCircle(
  x: number,
  y: number,
  canvasContext: CanvasRenderingContext2D | null,
  options: CircleOptions = {},
) {
  // No context means the canvas isn't ready yet — a caller bug, but the map core
  // stays dependency-free (no logger), so guard silently rather than throw.
  if (!canvasContext) return;

  const oldAlpha = canvasContext.globalAlpha;
  const { size = 2, globalAlpha = 1 } = options;
  let color = options.color ?? "blue";

  if (options.color === "random") {
    color = getRndColor();
  }
  canvasContext.globalAlpha = globalAlpha;
  canvasContext.beginPath();
  canvasContext.arc(x, y, size, 0, 2 * Math.PI, false);
  canvasContext.fillStyle = color;
  canvasContext.fill();
  canvasContext.globalAlpha = oldAlpha;
}

export function drawLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  width: number,
  canvasContext: CanvasRenderingContext2D,
) {
  if (typeof width === "undefined") {
    width = 1;
  }
  canvasContext.lineWidth = width;
  canvasContext.strokeStyle = color;
  canvasContext.beginPath();
  canvasContext.moveTo(startX, startY);
  canvasContext.lineTo(endX, endY);
  canvasContext.stroke();
}

/** Mouse/page point → canvas-local point. `restrict` returns false when outside. */
export function getLocOnCanvas(
  mouseLoc: { x: number; y: number },
  canvas: HTMLCanvasElement,
  restrict = false,
) {
  const rect = canvas.getBoundingClientRect();
  const x = mouseLoc.x - rect.left;
  const y = mouseLoc.y - rect.top;
  if (restrict && (x < 0 || y < 0 || x > rect.width || y > rect.height)) {
    return false;
  }
  return { x: x, y: y };
}

/** Clear an entire canvas. No-op if the 2D context is unavailable. */
export function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw an image fitted into `canvas` (aspect preserved, centred) and return the rectangle
 * it went into. The fit itself comes from the pure `fitRect`, which the coordinate maths
 * also uses — the picture and the plotted dot have to measure from the same rectangle.
 */
export function drawImageScaled(canvas: HTMLCanvasElement, img: HTMLImageElement): MapRect {
  const rect = fitRect({ width: img.naturalWidth, height: img.naturalHeight }, canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
  return rect;
}
