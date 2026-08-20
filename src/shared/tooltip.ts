/**
 * tooltip.ts — where a hover card goes.
 *
 * A card that explains a word must not sit on top of the word: the pointer is already there, the
 * name is what you were reading, and covering it hides the one thing you pointed at.
 *
 * **Beside it, to the right first.** A card to the right of the words leaves the whole line
 * readable and sits where the eye already is. Left is the mirror of that, for a name near the right
 * edge. Only when the window is too narrow for either side does it fall back to below/above — and
 * that flip is measured from the anchor's **top** edge, which is what an earlier version got wrong
 * (it flipped relative to the bottom, landing the card on the name).
 *
 * **In a narrow window it gets narrow rather than moving.** Below/above is the one fallback that,
 * inside a *list*, still covers what you were reading — the rows either side of the one you pointed
 * at. `besideWidth` says how much room there is beside the name, and a card capped to that says the
 * same thing in a slimmer shape while covering nothing.
 *
 * Pure: rectangles in, a position out. No DOM — every length here is in the units a style is
 * written in (`lib/screen.ts` converts the measurements), so the rule is a tested black box rather
 * than something to re-reason about in a layout effect.
 */

/** The on-screen box of the thing being explained — the hovered text. */
export interface AnchorBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How big the card measured, and how big the window is. */
export interface Size {
  width: number;
  height: number;
}

/**
 * A `position: fixed` placement. At most one of `top` / `bottom` is set: a card **above** the
 * anchor is pinned by its bottom edge so that if it grows after being measured — a late-loading
 * item icon — it grows *away* from the name rather than back over it.
 */
export interface Placement {
  left: number;
  top?: number;
  bottom?: number;
}

/** Breathing room from the anchor, and from the viewport's edges. */
const GAP = 6;
const EDGE = 6;

/**
 * Beside the name, the card's top lines up with the name's top — clamped so a card beside a word
 * near the foot of the window doesn't hang out of it. Clamping vertically is safe here in a way it
 * never was below the name: the card is off to one side, so sharing rows with the text costs
 * nothing.
 */
function besideTop(anchor: AnchorBox, card: Size, view: Size): number {
  return Math.max(EDGE, Math.min(anchor.top, view.height - card.height - EDGE));
}

/**
 * The narrowest a card may be squeezed and still read as a stat card. Below this its lines wrap to a
 * word each, and it stops being wider than the gap and starts being taller than the window.
 */
const MIN_BESIDE = 170;

/**
 * How wide a card may be if it's to sit **beside** the name, or `null` for "don't cap it".
 *
 * The overlay is a narrow window — 460px by default, and it can be dragged narrower — so a card at
 * its full width fits beside almost nothing, and the rule above fell through to below/above for
 * nearly every name in a list. That is the one placement a list can't afford: it covers the rows
 * around the one you pointed at. Room beside the name is therefore worth taking at *less* than full
 * width, and a card capped to the roomier side is then placed there by the rules above unchanged.
 *
 * Apply the result as the card's `max-width` **before** measuring it, so the size `placeTooltip` is
 * given is the size the card will keep.
 */
export function besideWidth(anchor: AnchorBox, view: Size): number | null {
  const room = Math.max(view.width - anchor.right - GAP - EDGE, anchor.left - GAP - EDGE);
  // Under the floor neither side has a legible card in it, so leave the width alone and let the
  // fallbacks have it: a two-word column beside the name is worse than a card below it.
  return room >= MIN_BESIDE ? room : null;
}

/** Place `card` beside `anchor` without ever covering it, keeping it inside `view`. */
export function placeTooltip(anchor: AnchorBox, card: Size, view: Size): Placement {
  const top = besideTop(anchor, card, view);

  // Right of the words, then left of them.
  if (anchor.right + GAP + card.width + EDGE <= view.width) return { left: anchor.right + GAP, top };
  const onLeft = anchor.left - GAP - card.width;
  if (onLeft >= EDGE) return { left: onLeft, top };

  // Too narrow for either side — a wide card in a narrow overlay window. Below or above still
  // can't cover the name, and beats hanging the card off the edge of the screen.
  const left =
    anchor.left + card.width + EDGE > view.width
      ? Math.max(EDGE, view.width - card.width - EDGE)
      : anchor.left;

  const below = anchor.bottom + GAP;
  if (below + card.height + EDGE <= view.height) return { left, top: below };

  // Above, pinned by its bottom edge to the top of the name.
  const above = { left, bottom: view.height - anchor.top + GAP };
  if (anchor.top - GAP - card.height >= EDGE) return above;

  // Room nowhere. Take the roomier of below/above and let the card run off the far edge: clipped is
  // recoverable — the page is a click away — whereas a card over the name hides what you were
  // reading, which is never what you asked for.
  return view.height - anchor.bottom >= anchor.top ? { left, top: below } : above;
}
