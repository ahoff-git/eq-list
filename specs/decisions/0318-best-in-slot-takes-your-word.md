# 0318: Best in slot takes your word — locks, wanted effects, benches, skips and presets

## Status
Accepted

## Context
[ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md) made best in slot an exact
assignment by the player's weights. It left two gaps. The player had no say over the answer: a quest
piece they must keep wearing, a set kept for another role, a raid drop they will never see. And
effects carried no number, so the solver would happily trade a haste or a focus for a few stats.
The ask (2026-10-20) was to let the player lock slots, ask for specific exaltations and focus
effects, add items to the hunt list from the page, and save search presets.

Pricing an effect (a weight per effect, like the stat sheet) would let the assignment trade effects
exactly. But effects of one name don't stack, so their worth is not additive over items, and an
assignment can't say "count this once". It would also ask the player for a number they don't have.
Most players think of effects as yes or no: "I want haste", not "haste is worth 40 INT".

## Decision
- **Everything the player says is by item title, never by dump row** (`bis-options.ts`). A lock on
  "Moonstone Ring" survives the next `/outputfile inventory`, which renumbers every row. A lock takes
  the best copy of that title that fits the slot. A lock with no such copy is reported as stale and
  the slot is solved freely, rather than the lock being dropped silently.
- **Locks are inside the exact solve** (`bestLoadout`'s `locks`). A locked slot is fixed and the
  remaining slots are still solved exactly. A slot can also be held empty. A two-hander locked into
  the main hand takes the off-hand. A locked off-hand stops a two-hander being swung, and an off-hand
  held empty lets one be swung. A locked LORE item keeps its other copies out. Hunts are never
  suggested for a locked slot.
- **Wanted effects are constraints met the cheapest way first, not prices**:
  1. something the loadout already wears carries it;
  2. a stone you hold (loose, or removable from gear you don't wear) goes into an open socket of
     worn gear, which costs no stats; an empty socket is preferred to a filled one, and a loose
     stone to one that has to be taken out;
  3. wear something you hold that carries it. Every copy is tried in every open slot it fits, the
     whole loadout is re-solved each time, and the best total wins. Its cost is reported.
  4. otherwise, name catalogue items that carry it, losses included, since the stats aren't the
     point. If nothing under the criteria does, look outside them and say so.

  Each effect that is met **pins** the slot that meets it, and a stone's source copy is reserved, so
  a later effect can't undo an earlier one. The effects are handled in the order the player asked for
  them, which makes this greedy across effects but exact for each one.
- **Benched items are never worn; skipped hunts are never suggested.** Both persist, and both are
  shown with a way back.
- **"Your choices cost N"** compares against the loadout with no locks, benches or wanted effects,
  so every constraint has a visible price.
- **Hunts go straight to the shopping list** through the app's one add path (`addByTitle`). Rows
  already on the list say so. One button adds the best hunt per slot: two hunts for the same slot
  each assume the other wasn't got.
- **Presets are whole snapshots** of the Items tab: criteria, weights and these options
  (`item-presets.ts`). Applying a preset replaces everything, so nothing leaks in from what was
  showing before. The picker names the preset that is exactly live and stops naming it once
  anything changes.

## Consequences
- Several wanted effects are met greedily, in the order asked, so a different order can find a
  cheaper overall answer. The cost of each one is shown, so the player can see when reordering would
  help.
- Effects are still not weighed against stats. A wanted effect is held at any cost in stats, and an
  effect nobody asked for is still worth nothing to the solver. The todo's per-effect weight stays
  open for anyone who wants trading rather than constraints.
- A pinned slot gets no hunt suggestions, even one that would carry the same effect and better
  stats. Unasking for the effect frees the slot again.
- Each forced effect costs one solve per copy and slot it fits. On a real 339-row dump with 37
  effects wanted, the whole plan took about 40 ms.
