# 0147: An overlay control takes its own clicks

## Status

Accepted

Narrows the resting arrangement set by
[ADR 0035](./0035-cast-alert-overlay-window.md) and guarded by
[ADR 0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md). It does not
change what the overlay *is*: glass over the game, until a control says otherwise.

## Context

The standing "you are missing this" reminder ([ADR 0140](./0140-a-buff-is-watched-until-it-lapses.md))
draws a ✕ on every row so a stale one can be stood down without leaving the game. The overlay it is
drawn on is `setIgnoreMouseEvents(true, { forward: true })`, so **the ✕ was a picture of a button**.
Clicking it hit the game behind it. Nothing said so, and the row went on showing a control that did
nothing — the exact shape of a bug report, and worse than having drawn no ✕ at all, because the
player who clicks it is mid-fight and has just swung at something.

The escape that existed was 👻 on another window's titlebar
([ADR 0073](./0073-a-click-through-window-keeps-its-chrome.md)), which the alert overlay has never
had: it is frameless, `focusable: false`, and covers a whole display. So the honest options were to
delete the ✕ or to make it real.

Making the *window* solid is not an option. ADR 0131 catalogued what a solid, transparent,
always-on-top sheet over an entire display costs when anything goes wrong, and the answer was that
the state must have a guaranteed end.

## Decision

**The overlay is glass, and a marked control is an island of solid in it.**

- `SOLID` (`src/lib/clickThrough.ts`) is spread onto anything on the overlay that must take a click.
  The renderer tracks the cursor — mouse **moves** are forwarded even while clicks are not — and asks
  main for the window back only while the cursor is on an island, handing it straight back on the way
  out. Only the crossings are sent, not the moves.
- **It is the mirror of `PASS_THROUGH`, not a second mechanism.** The app already had cursor tracking
  for the opposite arrangement — a solid window with one region that passes through — and both now
  run through one tracker parameterised by *what the cursor being somewhere means*. The two differ in
  exactly two places, and both differences are stated where they are made: what an unplaceable target
  reads as, and what the window is when nobody is tracking it.
- **Glass is the resting state at every level.** Unmounting restores it; leaving the window restores
  it; an unplaceable target reads as glass. The failure that must not happen is a wrongly-solid
  overlay, because this window has no titlebar to escape through.
- **A reminder row is not an island — its ✕ is.** The row stays `pointer-events: none` in the DOM as
  well, so the sentence you are reading never comes between you and the mob behind it.
- **The placement layer is an island too.** Main makes the whole window solid to have a spot placed
  on it, and an unmarked full-screen catcher is precisely what the tracker would turn back into
  glass under the pointer.
- **Focus is not taken.** The window stays `focusable: false`; a click on an island lands without
  pulling focus off the game, which is the only reason a control on this window is affordable.

## Consequences

The ✕ works, and everything else on the overlay goes on being ignorable. A player mid-fight can
stand a stale reminder down without alt-tabbing, and can also swing through the row it sits on.

**The dangerous state is now bounded by the cursor rather than by a timeout.** The overlay is solid
only while the pointer is on a control, and moving the mouse ends it. A renderer that dies or hangs
mid-island is the one case that cannot end it itself, and it is already covered: ADR 0131's guard
treats a hung overlay as fatal and rebuilds it, and a fresh overlay is created click-through.

**A control on the overlay is now a thing that can be afforded, so it can also be over-used.** The
overlay's value is that it is ignorable; every island is a hole in that. The rule is the one the
buff HUD follows — the island is the control, never the row it sits on.

**Only moves are forwarded, not the wheel**, so nothing on the overlay can be scrolled. A control
there has to be a single click.
