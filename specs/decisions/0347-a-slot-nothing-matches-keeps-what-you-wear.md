# 0347: A slot nothing matches keeps what you wear

## Status
Accepted

## Context
The loadout builder solves an exact assignment over the slots
([ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md)), and an item worth
nothing by your weights is never worn just to fill a slot. So a slot that nothing under your weights
and criteria matched came out **blank**. Narrowing the weights to a few stats, or the criteria to a
few items, blanked most of the layout. Read as a plan, a blank slot says "take that off", which is
not what narrowing the search meant.

## Decision
**After the solve, an open slot is filled with what the inventory dump says you wear there**
(`keepWorn` in `bis.ts`, called by `bisPlan`), marked `kept` and shown as "Worn … · kept".

- The worn piece is kept even when the criteria would hide it: you are already wearing it.
- It is not kept when you've excluded it, or when it's promised as a stone for a wanted effect.
- Slots you've locked stay as locked, including ones held empty. The off-hand a swung two-hander
  took stays empty, and nothing already in the loadout, or a LORE twin of it, is worn twice.
- A kept piece counts in the loadout's total at its value by your weights, which may be zero.

The solver itself is unchanged: it still won't pick a worthless item over an empty slot. The fill
is a separate step over its answer.

## Consequences
- A narrow search changes only the slots it has an answer for; the rest read as "keep wearing it".
- The dump's slot names now map onto the layout in one place (`layoutSlot`: `Fingers` → `FINGER`,
  `Any Slot` → `ANY`), which also fixes the "wearing now" value for rings.
- Hunt suggestions now weigh a target against the kept piece rather than an empty slot, so a gain
  over a worn-but-worthless piece is the same number it was against nothing.
