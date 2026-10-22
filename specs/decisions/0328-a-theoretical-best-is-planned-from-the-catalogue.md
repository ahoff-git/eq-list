# 0328: A theoretical best is planned from the catalogue

## Status

Superseded by 0329

## Context

Best in slot ([ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md)) answers "what
should I wear from my bags". The question before it went unanswered: what loadout am I working toward?
The workflow is iterative. Weigh mana and see the catalogue's best mana pieces. Rule out the ones you
can't get. Lock the ones you'll keep. Weigh HP for the slots left, and repeat until the loadout is
settled.

The owned plan can't serve this. Its candidates are your inventory dump, and most of it (sockets,
stones, merges) is about held copies. Its locks name things you hold: a lock on a catalogue item you
don't own would read as stale there.

## Decision

**A second, separate planner, `theoryPlan` (`bis-theory.ts`), picks the best loadout from the whole
catalogue, and the Wear table shows either loadout.**

- **Candidates:** every catalogue item your criteria allow — class and race, era, level band, zones,
  stat floors, but not the Search box's name text (the rule the Hunt follows, ADR 0310's sibling fix).
  LORE items get one copy; anything else gets as many as its slot pairs take. All are weighed at one
  grade, +0, +2, +5 or +10 (`theoryGrade`).
- **Its own locks** (`theoryLocks`), so the two loadouts never disturb each other.
- **One "can't get it" list for both.** ⊘ on a theoretical pick adds it to the existing "not hunting"
  list (`skipHunt`). Something you can't obtain is never suggested as a hunt and never put in the
  theoretical loadout; the reason is the same in both.
- **Exact at catalogue size.** In an optimal assignment, each slot's item is among that slot's top *n*
  by value (*n* = the layout's slots); otherwise one of those *n* would be free to swap in. So only
  each slot's top *n* reach the solver, plus each hand's top *n* one-handers, because the both-hands
  loadout can't swing a two-hander. A test checks this against the unpruned solve on a 600-item
  catalogue. It takes about 21 ms on the real one (11,268 items).
- **A pick you already hold says so, and where.** No dump is needed. With one, the Stats section
  compares what you're wearing against the theoretical best.

## Consequences

- The ultimate loadout is something you can build, lock and keep (presets carry it), next to the
  owned one.
- Wanted effects, sockets and merges stay with the owned plan. Pinning an effect in the theoretical
  loadout is a lock on the item that carries it.
- A theoretical pick says where it comes from (its zones, or how it's got), as the Hunt does.
