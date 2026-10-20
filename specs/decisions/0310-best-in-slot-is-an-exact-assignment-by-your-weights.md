# 0310: Best in slot is an exact assignment, by your weights, at your grades

## Status
Accepted

## Context
With the inventory dump read (bags, bank, depot, hoard, Storage) and item grades computable
([ADR 0307](./0307-an-item-s-grade-is-the-wiki-slider-s-arithmetic.md)), the ask (2026-10-20) is a
best-in-slot advisor. It should say what to wear from what you hold, which exaltations to add, and
what to hunt for the biggest gain, paying attention to `+N` grades held and achievable.

The EQL rules it rests on, from eqlwiki (Exaltations, Item Upgrade System) and eqltools-companion's
code comments citing the developers:

- Two **Any Slots** take anything your classes can wear, at full value, but a weapon there isn't
  swung.
- A character has **three classes**. An item is wearable if any of them is on its class list, which
  is exactly the Items tab's class picker.
- Grades come from **merging**: a `+g` copy adds `2^g` exp, and `+N` totals `2^N − 1`, capped at `+10`.
- An **exaltation moves one effect** (focus, click, worn, proc) and no stats. Sockets open at `+1`
  focus, `+2` click, `+3` worn and `+4` proc, and the same grades make an item's own effect removable.
  A stone fits when class and slot lists overlap. In a dump, socket numbers 7–10 are those types.

## Decision
- **Value is the player's own weight sheet** (the Items tab's), applied to each item at its grade.
  The app supplies no stat weighting of its own.
- **The loadout is solved exactly**, as a maximum-weight assignment of items to slots (the Hungarian
  method), not greedily. Value depends on the slot (a weapon in an Any Slot loses its damage and
  delay), so no greedy rule is guaranteed optimal. Two-handers are weighed both ways (swung with the
  off-hand given up, or not swung), and LORE keeps one best copy.
- **Merges are suggested for spare copies only**: copies the loadout doesn't wear, fed into the one it
  does. The gain is the whole loadout re-solved with the merged copy in place of them all. Merging
  worn copies would often trade two good items for one slightly better one.
- **Exaltations are not valued by stats.** Each socket the loadout's grades open is listed with the
  stones that fit, from loose Storage stones or effects removable from items you hold but don't wear.
  Effects the player picked in the Items tab's effect filters rank first: what an effect is worth is
  the player's call.
- **Hunt targets** are the Items tab's query results that you don't hold and can wear. Each is ranked
  by marginal gain over what it would replace at its best slot, and shown at `+1/+2/+3` with the
  copies each takes (2, 4, 8).
- The worn slot layout is read from a real EQL dump: two Any, two each of ear, wrist and finger, then
  the single slots.

## Consequences
- "Wearing now → best from what you hold" is one number pair the player can trust to be optimal by
  their own weights. On a real dump, gear sitting in Storage made most of the difference.
- Without weights there is nothing to rank by, and the view says so rather than inventing a ranking.
- Effects carry no number, so a loadout that trades an effect for stats will look better than it is
  to a player who values the effect. The socket list is where effects are weighed, and only by them.
- Rules taken secondhand (Any Slot not swinging, class overlap for stones) are encoded where they're
  used, with their source. If the game disagrees, observation outranks them
  ([ADR 0025](./0025-observation-over-the-wiki.md)).
- Hunting is judged one target at a time: two suggestions for the same slot each assume the other
  wasn't got.
