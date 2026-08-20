/**
 * screen.ts — measurements, in the units a style is written in.
 *
 * The interface scale is a CSS `zoom` on the document root
 * ([ADR 0041](../../specs/decisions/0041-interface-scale-is-a-css-zoom-per-window.md)), and that
 * leaves every window with two pixel spaces. What you **measure** — `getBoundingClientRect`,
 * `clientX`, `innerWidth` — comes back in real screen pixels; what you **write** — `left`, `top`,
 * `max-width` — is multiplied by the zoom before it lands. Measured in this app's own shell: a
 * `position: fixed` element given `left: 200px; top: 100px` at zoom 0.6 reports its corner at
 * (120, 60).
 *
 * So a popover placed from its own measurements appears at *scale* of where it was aimed — up and to
 * the left, over the very name it was explaining
 * ([ADR 0123](../../specs/decisions/0123-a-popover-is-placed-in-the-units-it-is-written-in.md)).
 *
 * Divide once, here at the boundary, and everything downstream — the placement rules, the gaps, the
 * minimum widths — is already in the units of the CSS it becomes. Nothing after this has to know
 * the scale exists.
 */
import type { AnchorBox, Size } from "@/shared/tooltip";

/** A point in either space — a mouse event's `clientX/clientY`, or that same point converted. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * The `zoom` this window's interface scale has set on the root (`useUiScale`).
 *
 * Read from the computed style rather than from settings: it's the number actually in force, so a
 * window that never applied a scale (the alert overlay, a test page) reads 1 without needing to
 * know that about itself.
 */
export function rootZoom(): number {
  const z = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** A measured screen length, in the units a style writes. */
export function localLength(px: number): number {
  return px / rootZoom();
}

/** A measured point — a mouse event's `clientX/clientY` — in the units a style writes. */
export function localPoint(p: ScreenPoint): ScreenPoint {
  const k = 1 / rootZoom();
  return { x: p.x * k, y: p.y * k };
}

/** The window a popover has to stay inside, in the units a style writes. */
export function localView(): Size {
  const k = 1 / rootZoom();
  return { width: window.innerWidth * k, height: window.innerHeight * k };
}

/** How big an element measured, in the units a style writes. */
export function localSize(el: Element): Size {
  const r = el.getBoundingClientRect();
  const k = 1 / rootZoom();
  return { width: r.width * k, height: r.height * k };
}

/**
 * The box the **words** of an element occupy, in the units a style writes.
 *
 * Not the box CSS gave the element: a name in a list row is usually a stretched flex item
 * (`.result .name { flex: 1 }`), so its own rect is as wide as the whole row — measured, 393px of
 * box around 122px of text. A card told to sit *beside* that has nowhere to go, and falls back to
 * covering the rows above and below. A range over the element's contents measures the text itself,
 * which is the thing the card explains and the thing it must not cover.
 *
 * Clamped to the element, so an element with nothing to measure (an icon-only label) still yields
 * the box it does have.
 */
export function localTextBox(el: Element): AnchorBox {
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  const k = 1 / rootZoom();
  const words = text.width > 0 && text.height > 0;
  return {
    left: (words ? Math.max(box.left, text.left) : box.left) * k,
    right: (words ? Math.min(box.right, text.right) : box.right) * k,
    top: (words ? Math.max(box.top, text.top) : box.top) * k,
    bottom: (words ? Math.min(box.bottom, text.bottom) : box.bottom) * k,
  };
}
