# 0319: A linked name has its level decided, by type

## Status
Accepted

## Context
[ADR 0316](./0316-a-held-thing-is-named-at-its-level-everywhere.md) gave levels one reader and one
writer each, and a test listed every `ItemLink` call site with how its level was handled. A list can
say a view is fine; it can't make it so. The ask was for the rank to be accounted for *everywhere* an
item or spell is shown, reusably. A list re-checked by hand drifts, and a new view could still hand
`ItemLink` a stripped name.

## Decision
`ItemLink`'s `title` (and `NameList`'s `names`) take a **`ShownName`** (`src/shared/shown-name.ts`), a
branded string. A name becomes one only through:

- the level **writers**: `gradedTitle` (an item at its grade) and `rankedSpellTitle` (a spell at the
  rank you cast); or
- a **marker** stating why it needs no level of its own: `heldAsNamed` (passed exactly as the game
  wrote it, so any level in it is kept), `wikiName` (the `+0` page itself), `dropTableName` (folded by
  grade on purpose, ADR 0057) or `notAnItem` (a mob, zone, NPC, faction or quest).

Markers are the identity at runtime. What they carry is the decision, and the compiler requires one
at every call site. `item-link-levels.test.ts` pins that a bare string can't pass for a `ShownName`,
and that no title is cast around the six. `level-paths.test.ts` checks against real data what each
marker promises: loot, prices, dump rows, list entries, crafting results, the Hunt and Tradeskills
views, every wiki page's linked names, and every spell page.

## Consequences
- A new view that links an item or a spell doesn't compile until it says how the level is handled.
- Converting the existing 68 call sites made the five `NameList` callers decide too. Kill-list drops
  are stored as looted (`Copper Amulet +2`), so they're `heldAsNamed`; mobs and causes are
  `notAnItem`.
- The classification moved from a test's table into the code, next to each call site.
