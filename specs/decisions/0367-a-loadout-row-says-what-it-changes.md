# 0367: A loadout row says what it changes

## Status

Accepted

## Context

The loadout grid showed, for each stat the player cares about, what the pick gives as printed — and the Stats section
below it totals everything. Neither says what *this swap* does. The player asked (2026-11-08) for +/− numbers: replacing
5 INT with 7 INT should say +2 INT and the mana that is worth. The mana was already in the plan's value (the `GainNote`
under the name says "+203 mana from 9 INT"), but not in the column a player reads down.

## Decision

- **A stat column shows the pick's figure as the game counts it, and the change from what you wear in that slot.**
  HP, mana, AC and endurance include what the pick's attributes buy, at the same per-point rates the plan weighs them by
  (`slot-change.ts`, whole points per attribute, as a pool is shown); the hover splits the figure into printed and
  attribute parts and names what it replaces. The change is green when better and amber when worse, by the stat's own
  direction (less weight is better).
- **A pick replaces what is worn in its own slot**, paired by slot name. The very piece worn there replaces nothing, so
  a pair of rings that merely swapped hands shows no change; a piece moved to another slot is a change in both rows
  (what takes its place replaces it, and in its new slot it fills what was empty). The plan carries this as
  `BisPlan.replaces`, read off the dump's worn rows.
- **No dump, no change.** With nothing worn at all there is no comparison, so no row says "+" against an empty body.
  That includes "include what I own" turned off ([ADR 0355](./0355-the-loadout-can-leave-your-own-gear-out.md)), which
  plans as if there were no dump.

## Consequences

- The HP, mana, AC and endurance columns now show effective figures where they showed printed ones; a card's printed
  number is one hover away.
- Per-row changes use the rate where the character stands (linear), while the Stats section's totals use the exact curve
  across bands, so rows and totals can differ by a few points where a swap crosses a soft cap.
- A worn piece in a slot the loadout leaves bare has no row to say it is lost, so the rows are each slot's own change,
  not a ledger of the whole.
