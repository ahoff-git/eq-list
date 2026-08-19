# 0112: A panel's height belongs to its reader

## Status

Accepted

## Context

The map window is a column: a title bar, a toolbar, then up to five panels a toolbar button opens
(👁 what's drawn, 🧭 travel, 📖 mob knowledge, ☠ kills, 👥 who's connected), then the map itself. Each
panel was a **fixed share of the window** set in the stylesheet — 45% for the floors and the route, 40%
for the two kill panels, and no bound at all on the roster — with a comment beside each explaining that
the map is the point and the panel therefore gets a minority of the window.

That is the right *default* and the wrong *rule*. Which of the two is the point depends entirely on what
the reader is doing at that moment, and the panel is opened *because* they want to read it:

- A forty-step cross-zone route, with a *Not using* strip above it
  ([ADR 0109](./0109-a-route-can-be-denied-one-place.md)), is unreadable through a 45% slot — the half
  that scrolls is the answer, and the answer is what you opened the panel for.
- A dungeon offers a dozen-odd label kinds in five sections plus a floor list; 45% shows two sections.
- The roster, on the other hand, is usually three rows, and it was allowed to grow without limit —
  a full raid could push the map off the bottom of the window.
- Two panels at once (the ☠ list beside 📖, an explicitly supported pairing) already spent 80% of the
  window before either was asked to be bigger.

The window itself is resizable and can be maximized, but that doesn't help: making the window taller
scales every panel with it, because a share is a share. The proportion was the thing that needed
changing, and nothing in the app could change it. Sizing is also **not a setting** — there is no
question here for a settings page to ask, and a number nobody can see the effect of while they set it
is not an answer either.

Two constraints shape any fix. A window's interface scale is a CSS `zoom` on the root
([ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md)), so a pixel height means a different
fraction of the window at every scale, and a `vh` unit is scaled by the zoom as well — the existing
comments record both traps, having been bitten by them. And these panels are toggled open and shut all
session, so a size that reset on every close is a size nobody would bother to set.

## Decision

**A panel that opens over another view is bounded by default, and the reader may redraw the boundary.**

One component owns the box — `src/app/components/ResizablePanel.tsx`, wrapping *any* panel in either
window, because nothing in it knows what it contains:

- **The seam is the handle.** A 6px grip sits *on* the panel's bottom border, inside its own bottom
  padding, so what you grab is the line you can already see and it covers no content. Transparent until
  hovered or focused, because five stacked handles read as chrome. Dragging it moves the boundary;
  **double-clicking it restores the default**, which is the only way back to a number the app chose.
  It carries `role="separator"` and answers the arrow keys, so a 2% correction doesn't need a drag.
- **The default is a ceiling, not a size.** Undragged, a panel is as tall as its content and no taller
  than the share it was designed for — exactly the old behaviour, so nothing moves for anyone who never
  drags. Dragged, it is *exactly* the height asked for and **scrolls whatever doesn't fit**, which is
  what makes shrinking one safe: the content is the panel's business, the box is the reader's.
- **A height is a share of the window, not a pixel count** (`src/shared/panel-size.ts`, pure and
  tested). A ratio is the one form the CSS `zoom` leaves alone, and it also survives the window being
  resized — 40% of the map window means 40% at 60% scale, at 100%, and after a maximize. It is why the
  drag arithmetic may divide two lengths read straight off the screen: the scale cancels out.
- **Bounds, not freedom.** 6% at the smallest, 85% at the largest, so the view underneath always keeps a
  strip of itself and a panel can never be dragged down to just its own handle. Panels **shrink** when
  several open at once would otherwise push the map off the bottom, rather than overflowing the window.
- **The height is remembered per panel**, keyed by an id (`STORAGE_KEYS.panelHeight`), in the same
  `localStorage` that already remembers which panels are open. One key per panel, not one record of
  them all: two open panels are two components, and two writers of one key would each save its own
  stale copy of the other's height. An absent value means "as designed" — a default is a real answer,
  so it is stored as nothing rather than as a number.

Each panel keeps its own padding, colours and inner scrolling; the wrapper contributes only the box and
one rule (`.panel-resize > :not(.panel-grip)`) that hands the box to whatever is inside. So the four
`max-height` declarations in the stylesheet became four numbers at the map window's call sites, where
which panel gets what share is visible in one place, and the roster gained the bound it never had.

## Consequences

- Every panel the map's toolbar opens can be sized by dragging its bottom edge, and comes back that
  size next time it's opened. Nothing about the app's defaults changed for anyone who never drags one.
- Any panel that opens over another view — in either window, now or later — becomes resizable by being
  wrapped, and cannot end up behaving differently from the others while it is.
- The stylesheet no longer decides how much of the window a panel takes; the window's own markup does.
  A panel added without a share stated is a compile error rather than an unbounded panel.
- A height is stored per window per panel and is not a setting: it does not sync, does not appear in
  Settings, and is not in the settings file. It follows the same reasoning as *how a window was left*
  ([ADR 0074](./0074-how-a-window-was-left-is-window-state.md)) — the difference being that this state
  never leaves the renderer, so `localStorage` beside the open/closed toggles is its right home.
- The arithmetic is a tested black box; the gesture is not, because a pointer drag over a CSS `zoom`
  can only be confirmed on a real window. It is on the [manual QA list](../testing/manual-qa.md).
- Rejected: **`resize: vertical`**, the CSS one-liner — it gives a corner grip rather than the seam
  between two panels, sets a pixel height (which the interface scale then misreads), and remembers
  nothing. **A setting per panel**, for the reason above: sizing is a gesture, not a preference to be
  typed. **Pixel heights**, by ADR 0041. **A draggable seam between *every* pair of panels**, splitter
  style, which sounds tidier and is worse: the panels are independently opened and closed, so a seam
  belongs to the panel above it, not to a pair that may not both be there. And **letting a drag take the
  whole window** — a panel covering the map is a map window showing no map, and the ✕ that closes the
  panel is the thing that would then have gone missing.
