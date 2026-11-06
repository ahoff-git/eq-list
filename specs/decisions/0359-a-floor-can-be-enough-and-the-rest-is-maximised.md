# 0359: A floor can be enough, and the rest is maximised

## Status

Accepted

## Context

[ADR 0353](./0353-a-loadout-goal-is-a-slider-the-planner-turns-into-weights.md) made a floor a boost found by
search: the stat is pulled up until the plan reaches it, then no further than that takes. But a floor only
*adds* to what the stat already has, so anything else that pulled it kept pulling after the floor was met:
its own priority, and its weight on the player's sheet. A Wizard asking for 6k mana who also weights INT and
mana got 8k, paid for in health and AC.

Replaying the real catalogue for a Wizard (mana floor 4,000, nothing else weighted by a sheet) showed it twice:

- a mana priority beside the floor ended at 5,040 mana and 1,973 HP, against 4,231 mana and 2,246 HP when the
  floor was the only ask;
- a Wizard's sheet (mana, INT, HP, AC) with the same floor ended at 5,538 mana and 1,580 HP.

And a floor with **nothing else steering the plan** ran to the stat's maximum (5,573 mana, 1,491 HP): the only
weight in the plan was the floor's boost, so any boost made mana the whole objective and the bisection back
down could not lower what the plan did with it. The player asked for a requirement and got an objective.

What the player asked for (2026-11-06): demand an amount of a stat, then **deprioritise it for everything
else** — "maximise everything else that would help while keeping the requirements."

## Decision

**A floor can be *enough*.** A goal with a floor has a `Stop at floor` toggle (`StatGoal.enough`). While it is
on, the stat counts for nothing past the floor: its priority is ignored, and its weight on the player's sheet
is taken out — including what the weight put on the attributes that make it (`withoutDerivedWeight`, the
inverse of the fold, so mana's INT weight goes but an INT weight set by hand stays). Only the floor's boost
holds the stat, and the bisection finds the least boost that does. The toggle is per stat: "at least 4k mana,
and stop" beside "at least 2k HP, and more is welcome" is a sensible ask.

**"Everything else" is a goal** (`rest`, a priority only). It spreads one stat's worth of priority equally over
the **survival stats** nobody has set a goal on: HP, AC, HP regen, the six resists, and mana and mana regen if
a ticked class has a mana pool. Each is measured against the most a loadout could reach, like every goal, so
HP in the thousands and a resist in the hundreds compare. The set is deliberately narrow: attributes count
through the HP, mana and AC they buy, endurance and weapon numbers are choices only the player can make, and a
stat that already has a goal (even an *enough* floor) is the player's word and is left out.

**The page says when nothing but floors steers the plan** (`GoalOutcome.driven`), with a button that adds
*Everything else*, since that state's result is arbitrary past the floors.

## Consequences

- On the real catalogue the Wizard's floor of 4,000 with *Everything else* ends at 4,041 mana, 1,589 HP and
  494 AC (a balanced survival build) instead of 5,573 mana, 1,491 HP, 438 AC; with the Wizard's sheet and
  *Stop at floor*, 4,225 mana and 2,220 HP instead of 5,538 and 1,580.
- It changes nothing by default: `enough` is off and `rest` absent for every existing goal and preset.
- The app now supplies a stat judgment of its own, but only where the player opts in with *Everything else*,
  and only for stats they have not spoken for; the sheet and explicit priorities always win. The set lives in
  one constant (`SURVIVAL`) and is easy to change.
- *Everything else* is up to a dozen more plans to measure, so the search is slower with it on (about a second
  on the full catalogue, off the render like the rest).
- Still true from ADR 0353: weights find hull points, so the stat can land a little past its floor when the
  catalogue has no loadout exactly at it (4,231 against 4,000 above). A swap search from the result is the next
  step if that shows in use.
