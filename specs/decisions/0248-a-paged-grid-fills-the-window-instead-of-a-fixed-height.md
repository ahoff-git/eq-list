# 0248: A paged grid fills the window instead of a fixed height

## Status

Accepted

## Context

[ADR 0234](./0234-a-paged-grid-gets-a-fixed-height-and-a-real-filter.md) gave `HitTable`'s grid
(`FactionPanel.tsx`, the Faction tab's Hits view) a fixed `height: 560` in `dataGridDefaults.ts`'s
`GRID_SX_PAGED`, so its footer would sit right under the visible rows instead of wherever the current
page's last row happened to end. That solved the footer problem, but the fixed number cuts the other
way on a window taller than titlebar + tabs + the row of view buttons + 560px, which is most windows
past a fairly small size: the grid simply stops, leaving a dead strip of blank space below it and above
whatever the rest of the panel would otherwise show. Reported directly: "the grid should use the
available space in the window, not stop half way down the page."

A fixed pixel height can't track a window that resizes, or this app's own per-window interface-scale
`zoom` (ADR 0041) — 560px of *zoomed* space is a different amount of real screen depending on the
setting, so no single constant is right for every window this grid renders in.

## Decision

`GRID_SX_PAGED` drops the fixed `height: 560` for `flex: 1; minHeight: 0` — the grid now fills
whatever height its container hands it, the same `flex: 1; min-height: 0` relay this app already uses
to make `.map-body` and `.panel-resize`'s contents fill their window rather than stop at a guessed
size. `GRID_DEFAULTS_PAGED` itself is untouched: still no `autoHeight`, still a real footer: only the
number moves from an absolute pixel figure to a relative fill.

Filling a flex parent only works if something up the chain actually has a definite height to hand
down, so `FactionPanel.tsx` and `globals.css` grow that chain for `HitTable`'s call site: the panel's
root (`.faction-panel`) takes `height: 100%` of the tab content area (`.panel`, already a flex item
with a real height), the region holding whichever view is open (`.faction-body`) takes `flex: 1;
min-height: 0`, and `HitTable`'s own wrapper (`.faction-hits-scroll`, alongside the existing
`.table-scroll`) does the same. The three other views sharing `.faction-body` — Standings, Race
Unlocks, the empty state — aren't `flex` children themselves, so they keep sizing to their own content
exactly as before, and `.panel`'s page-level scroll (ADR 0230) still applies to them if that content
runs long.

`hitsPage`'s server-side filter, and everything else ADR 0234 decided about reaching the whole ledger
rather than just the fetched page, is unchanged — only that record's fixed-height sentence is
superseded here.

## Consequences

- The Hits grid now shows however many rows fit the window's actual remaining height — fewer on a
  small or heavily zoomed-out window, more on a maximized one — instead of a constant 560px guessed
  once and left. A very short window can still show only a handful of rows before the grid's own
  internal scrollbar takes over, same as any `flex: 1; min-height: 0` region in this app.
- Any future caller of `GRID_DEFAULTS_PAGED`/`GRID_SX_PAGED` inherits the same contract and has to
  supply its own definite-height ancestor chain (a `flex` parent with a real height, not a plain
  block) or the grid collapses toward zero height — the same requirement `.map-body`'s callers
  already meet. `HitTable` is still the only caller today.
- `dataGridDefaults.ts`'s `GRID_DEFAULTS`/`GRID_SX` (the six `autoHeight` tables) are untouched; this
  only ever affected the paged variant.
