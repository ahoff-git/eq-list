# 0335: Owned gear only means only owned gear

## Status

Accepted

## Context

[ADR 0329](./0329-the-loadout-is-one-plan-of-what-you-hold-and-what-to-hunt.md) made the loadout builder plan from your
gear, with a switch to also plan catalogue items to hunt. It also made a lock hold until unlocked,
including a lock on something to hunt while hunting was off. So with hunting off, a locked item you
don't own was still planned in to hunt.

That left no way to ask "what's my best from what I own?". With a lock on a Talisman of Kejaar
Kerrath you hadn't got, switching hunting off still put the talisman in the loadout. The switch
itself was a checkbox, "Include gear to hunt", that was easy to miss.

## Decision

- **The switch is a two-way choice:** *Owned gear only* or *Owned + hunt*.
- **Owned gear only puts nothing in the loadout you don't hold.** That includes locked items.
- **A lock on an item you don't hold is set aside, not removed.** Its row says so: "locked to X,
  which you don't hold — set aside while planning owned gear only". Choosing *Owned + hunt* puts it
  back in force, so a lock still holds until you unlock it.
- **Wanted effects are met from what you hold** in this mode, as before.
- **Upgrades to hunt** still lists what would beat each slot, as it already did with hunting off.

This changes ADR 0329's one rule about locks with hunting off. The rest of 0329 stands.

## Consequences

- *Owned gear only* answers "what can I wear tonight": every pick is held, and the to-hunt count is 0.
- A lock on something you don't hold costs nothing in that mode. It shows as set aside instead of
  quietly planning a hunt.
