# 0123: A popover is placed in the units it is written in

## Status

Accepted

## Context

Hovering an item name anywhere in the app pops the wiki's stat card, and
[`tooltip.ts`](../../src/shared/tooltip.ts) has said since it was written that the card goes
**beside** the name and never over it — right of it, left of it near the right edge, below/above only
when the window is too narrow for either side. That rule is pure, tested, and correct.

It was still landing on top of the link. Reported from the search list, and true app-wide.

Two things were wrong with what the rule was being *given*, and both were measured in the app's own
shell rather than reasoned about:

**The card was placed in a different pixel space than it was measured in.** The interface scale is a
CSS `zoom` on the document root ([ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md)),
which leaves every window with two: what you *measure* — `getBoundingClientRect`, `clientX`,
`innerWidth` — comes back in real screen pixels, while what you *write* — `left`, `top`, `max-width`
— is multiplied by the zoom before it lands. Measured: a `position: fixed` element given
`left: 200px; top: 100px` at zoom 0.6 reports its corner at (120, 60). So a card placed from its own
measurements appears at *scale* of where it was aimed — up and to the left, over the very name it was
explaining. The overlay's scale ceiling is 100% ([ADR 0026](./0026-interface-scale-only-shrinks.md)),
so for this window the error is always toward the name, and the more a player shrinks the interface
the further onto the word the card slides.

**The anchor was the box, not the words.** A name in a list row is a stretched flex item
(`.result .name { flex: 1 }`): measured, 393px of box around 122px of text. "Beside" a box that wide
is nowhere, so every hover in every list fell through to the last resort — below the name, then above
it. That is the one fallback a *list* cannot afford, because it covers the rows either side of the one
you pointed at, which is the rest of what you were reading.

The second fault also hid a third: the card was measured where it was guessed to go, and a card aimed
past the right edge of the window has no width left to shrink into, so it measured as a one-word
column and placed as if it were taller than the window.

## Decision

**Measurements are converted once, at the boundary, into the units a style is written in.**
[`lib/screen.ts`](../../src/lib/screen.ts) is that boundary — `localView`, `localSize`,
`localTextBox`, `localPoint` — and everything downstream of it (the placement rules, their gaps,
their minimum widths, the CSS they become) is in one space. Nothing after the conversion has to know
the interface scale exists, which is the property that was missing: the old code had the scale
implicitly in two of its numbers and not the third.

**A popover is anchored to the words, not to the element.** `localTextBox` measures a range over the
element's contents, clamped to the element, so a name that CSS stretched across a row still yields
the text a reader was looking at.

**In a narrow window the card gets narrow rather than moving.** `besideWidth` says how much room
there is beside the name, and a card capped to the roomier side is then placed there by the existing
rules unchanged. A slimmer card says the same thing while covering nothing; below/above is kept only
for when neither side has room for a legible one at all (`MIN_BESIDE`), where a two-word column
beside the name really would be worse than a card below it.

The cap reaches the card as `--tip-avail` against the stylesheet's own `--tip-want`, so how wide the
card *wants* to be stays in the CSS with the rest of its look, and the placement only ever says how
much room there is.

## Consequences

Verified in Electron against the real compiled `tooltip.js`, in a 460px window, over a real
search-results list, at 100% / 80% / 60% — the same twelve hovers before and after. **Before:** the
card fell *below* the name in all twelve, and at 80% and 60% it covered the hovered name itself in
all eight. **After:** it lands beside the name in eleven (the twelfth is a 44-character item name at
100%, where nothing legible fits either side and it drops below, as designed), covers the hovered
name in none, and goes off-screen in none.

The map's own hover tip was misplaced the same way — it is written straight from `clientX/clientY`,
and the map window's scale may go up to 2× ([ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md)),
where the tip appeared at twice the cursor's distance from the corner. It converts through
`localPoint` now.

**Still unconverted, deliberately:** the pin editor and pin-placement popups
(`onPinClick`/`onPlace` → `PinEditor`) write a click's raw `clientX/clientY` as a `fixed` position
and are misplaced under any map scale other than 1. Same defect, same one-line conversion, but a
click-positioned editor is not a hover popover and was left for its own change.

A card beside a name still overlaps the *right-hand end* of the rows above and below it — their era
badges and Add buttons, and the tail of a neighbour's name long enough to reach under it (measured: at
most two neighbours, down from three, and none at all beside a long name). A 300px card in a 444px
page has to overlap something; what it must never overlap is the word you pointed at, and it doesn't.
The remaining slack could be spent pushing the card to the window's right edge — least overlap, but
the card stops sitting *beside* the word it explains, so the tie between them is only the shared top
edge. Left snug deliberately.

The trap this leaves is the same shape as ADR 0041's `vh` trap, and worth stating in the same terms:
**anything that positions itself from its own measurements must convert them first.** A `left` that
came from a `getBoundingClientRect` is wrong by the interface scale unless it went through
`lib/screen.ts`.
