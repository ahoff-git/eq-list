/**
 * How tall an openable panel is, as a **share of the window** it sits in.
 *
 * A panel that opens over another view is bounded by default — the view underneath is usually the
 * point — but only the person reading it knows whether this route, these fourteen floors or those
 * forty kill rows are worth more of the window than the default allows. So the seam under a panel is
 * a drag handle (`ResizablePanel`), and this is the arithmetic behind the drag: pure, so it can be
 * tested without a pointer.
 *
 * **A share, not a pixel height.** Each window's interface scale is a CSS `zoom` on the root
 * ([ADR 0041](../../specs/decisions/0041-interface-scale-is-a-css-zoom-per-window.md)), which
 * multiplies a px length and leaves a ratio alone — so a percentage is the one form that means the
 * same thing at 60% as at 100%, and it survives the window itself being resized. It's also why the
 * two lengths a drag divides may both be read off the screen: the scale cancels out.
 */

/** The bounds a panel is held inside, as a % of its window. */
export const PANEL_PCT = {
  /** Enough for a heading and a row. Below this a panel is a scrollbar with a hint of content. */
  min: 6,
  /** The view underneath keeps a strip of itself, whatever the drag asks for. */
  max: 85,
  /** What one arrow key on the handle is worth — small enough to aim, big enough to feel. */
  step: 2,
} as const;

/** A share, held inside the bounds above. */
export function clampPanelPct(pct: number): number {
  return Math.min(PANEL_PCT.max, Math.max(PANEL_PCT.min, pct));
}

/**
 * `height` as a share of `windowHeight` — the answer a drag or a nudge lands on.
 *
 * `null` where there is no window to be a share *of*: a height of zero is what an unmounted or
 * display:none ancestor measures as, and dividing by it would report a panel as its own minimum
 * rather than admitting the question can't be answered yet.
 */
export function panelPct(height: number, windowHeight: number): number | null {
  if (!Number.isFinite(height) || !(windowHeight > 0)) return null;
  return clampPanelPct((height / windowHeight) * 100);
}

/** A share moved by whole `step`s — one arrow key press per step, up (negative) or down. */
export function nudgePanelPct(pct: number, steps: number): number {
  return clampPanelPct(pct + steps * PANEL_PCT.step);
}

/**
 * What a remembered height means: a share to restore, or `null` for "as the panel was designed".
 *
 * Guards two things that are the same thing — a hand-edited `localStorage` value, and a share stored
 * by a build whose bounds were wider than this one's.
 */
export function storedPanelPct(stored: unknown): number | null {
  return typeof stored === "number" && Number.isFinite(stored) ? clampPanelPct(stored) : null;
}
