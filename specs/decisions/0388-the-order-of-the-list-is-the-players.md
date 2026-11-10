# 0388: The order of the shopping list is the player's, and so is which groups are folded

## Status

Accepted

## Context

The List tab drew its groups unfinished-first then A–Z, and the rows in a group still-needed-first then A–Z; nothing
the player did could change either, and every folded group opened again on the next launch. Two things made that
matter more than it looks:

- **A list is arranged to be worked through.** A player putting the quest they are on first, or tucking a finished
  tradeskill out of the way, had no way to say so — and a long list folded down to the three groups that matter
  was undone by every restart.
- **The order is not only cosmetic.** [ADR 0387](./0387-rows-wanting-the-same-item-share-what-you-hold.md) hands a pile
  of held or looted items out in the stored order of `list.entries` — but the list was *drawn* A–Z, so "the rows
  above first" was not what the player saw. The stored order and the drawn order were two different things.

## Decision

- **The stored order of `entries` is the order, for display and for sharing alike.** A group appears where its first
  row does, and a row where it sits in the array. `groupByOrigin` no longer compares names: it floats finished groups
  and rows below unfinished ones and keeps "Other items" last, and inside each of those buckets leaves the order alone
  (a sort is stable). There is one order, so what is drawn first is what is handed items first.
- **An old list is sorted once and marked.** A list with no `arranged` mark is sorted to the order it was always drawn
  in — groups A–Z, "Other items" last, rows A–Z — and marked (`arrangeOnce`, on load, in the desktop store and in
  the web build's), so nothing looks different on the day this ships. From then on a row added later **joins the end**
  of its group instead of being sorted among the rest.
- **A move is the whole new order.** The panel builds it with pure functions (`moveRow`, `moveGroup`) and sends one
  array of ids (`list.reorder`); the store applies it with `applyOrder`, which ignores an id that names nothing and keeps
  an unnamed entry after the named ones, so an order a little behind the list drops no row. The main process checks
  only that it received strings.
- **What may move.** A row moves within its own group (a quest's items stay its items); a group moves among the
  groups; "Other items" is the catch-all and moves neither way. Finished and unfinished are separate runs — a drag
  across that line could only snap back, so it is not offered.
- **Drag or keyboard.** Each group and row has a **⠿** grip: native drag-and-drop, or focus it and press Alt with ↑ or ↓
  (`useReorder`, one hook for rows and for groups).
- **Folded groups are kept.** The set of shut groups is stored under `STORAGE_KEYS.listCollapsed` with the panel's other
  state (`usePersistentState`) — shut ones only, so a group nobody folded needs no entry and a new one opens; a key
  for a group that has gone is dropped the next time any group is folded. A row's own "where to get it" panel is not
  stored: opening it fetches a page, and reopening every one of them at launch is not what folding is for.

## Consequences

- Arranging the list is how a player says which quest a shared pile is for, and the explanation on the row says so.
- A list saved by an older build is rewritten into the new order the first time it is saved; an older build opening a
  list saved by this one ignores `arranged` and draws it A–Z as it always did, so rolling back loses nothing.
- Rows added to an existing group land at its end, not alphabetically; a player who liked A–Z can drag.
- Group order is by a group's first row, and a move makes the groups contiguous in storage.
- The web build keeps the same order and the same sort-once rule in its own store.
