# 0350: An item page says how many you have, per area

## Status
Accepted

## Context
An item's hover card already says where you hold it ([ADR 0320](./0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)):
"You have 80: General 3 ×40, …", at most three slot-level places. The item's **page** said nothing,
so "do I have enough Malachite, and is it in my bags or at the depot?" meant Character → Exports.
The inventory dump already counts each item per area (`inventoryTotals`: worn, bags, bank, shared
bank, Tradeskill depot, Dragon's hoard, Storage).

## Decision
**An item page (or a recipe's crafted item) shows one line under its card** (`HeldOnPage`):
`In your inventory: 80 — Bags 78 · Tradeskill depot 2 (export 3h ago)`.

- A count per **area**, in the dump's area order, rather than per slot: the question on a page is
  how many and which window to open. Slots stay in the Exports view.
- The best grade held is said beside the total (`16 (best +2)`).
- With a dump that doesn't hold it, it says **none**; with no dump at all, nothing.
- The export's age is part of the line and opens Exports, because the game writes the dump only when
  asked, so the count is as old as the dump.

`OwnershipProvider` now reads the dump once and derives the owned places, best grades and these
totals from it (it read it twice before). The line's text is `heldOnPageText` in
`shared/items/ownership-notes.ts`.

## Consequences
- An item's count is one glance from its page, from Search, a link, or the search bar.
- Exaltations of the item are not in the count; the hover card still lists them.
- A section carried from an older dump (bank, depot, hoard when their windows were shut) counts as
  held, as it does everywhere else; its own age is shown only in Exports.
