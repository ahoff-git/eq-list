# 0329: The loadout is one plan, of what you hold and what to hunt

## Status

Accepted

## Context

Best in slot was built to answer "what should I wear from my bags", with a separate Hunt list for
"what next". [ADR 0328](./0328-a-theoretical-best-is-planned-from-the-catalogue.md) added a second
loadout planned from the whole catalogue, with its own locks. In use, that was two lists where the
player wanted one. Their purpose is to plan gear: find what they hold (bank, Storage, wherever) and
branch out to what they should go and hunt. The player's direction, point by point:

1. **The loadout is the loadout.** No second list. A lock stays locked until it's unlocked.
2. **An exclusion is moved to an Exclusions list and ignored for every search on the page.**
3. **The Search box's name text is respected,** but the page must say why it returned nothing. (An
   earlier fix had made the hunt ignore it, after a leftover name emptied the Hunt.)
4. **Wanted effects go on items planned to be worn.** An item can be needed for an effect (a shield
   for its focus), and that changes what "best" is.

The page also had too many separate sections: summary, choices, wear, stats, effects, merge,
exaltations, hunt.

## Decision

**The loadout builder (formerly Best in slot) plans one loadout, drawn from what you hold and, with
"Include gear to hunt" on, from the catalogue. Each pick says where you hold it or where to go and
get it.**

- **The pool.** Your wearables at their grades, plus every catalogue row the Items tab's whole query
  allows (the name box included), weighed at a chosen hunt grade (+0, +2, +5 or +10). Catalogue
  copies are added only beyond the copies you hold, so the solver never weighs your bank's Moonstone
  against a hypothetical twin.
- **One set of locks**, by title. A lock takes your copy first, else one to hunt. It holds whether
  hunting is on or the criteria now hide the item. Only unlocking or excluding the item releases it.
- **One exclusions list** (`excluded`), replacing `benched` and `skipHunt`, which are migrated in on
  read. An excluded item is never worn, hunted, an effect's carrier or a stone's source. Excluding a
  locked item unlocks it.
- **Wanted effects are solved in.** The cheapest way is taken: already worn, then a stone into any
  pick's open socket (held or to hunt), then wearing whatever carries it. With hunting on, that
  includes the best few catalogue carriers, each tried in every free slot it fits and the best loadout
  kept. An effect can take a slot from what would win it on stats, and the cost is shown.
- **An empty result explains itself.** When the name box narrows what can be hunted, the page says so
  with the count left. When it leaves nothing, it says that and offers to clear the box.
- **Exact at catalogue size.** Each slot's ranking is computed once per plan, and every solve uses
  only each slot's top *n* still available, plus each hand's top *n* one-handers. A test checks this
  against the unpruned solve. The full plan with four wanted effects takes about 100 ms on the real
  11,268-item catalogue.
- **One page, folded.** The loadout grid and what steers it are on top. Wanted effects, "improve
  what you own" (merges and sockets together), stats, upgrades to hunt (shown only with hunting off)
  and exclusions are folded underneath.

## Consequences

- `bis-theory.ts` and the `theoryLocks`/`theoryGrade` options are gone. ADR 0328 is superseded.
- With hunting on, the loadout is mostly gear to hunt for a player who holds little, which is the
  point. Switching it off plans from what you hold, with the old Hunt list as "Upgrades to hunt".
- A hunted pick at +0 opens no sockets. Weighing hunts at a grade lets the plan put stones in them.
