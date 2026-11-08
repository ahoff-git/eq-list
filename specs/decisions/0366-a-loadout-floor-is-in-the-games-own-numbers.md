# 0366: A loadout floor is in the game's own numbers

## Status

Accepted

## Context

[ADR 0353](./0353-a-loadout-goal-is-a-slider-the-planner-turns-into-weights.md) measured a floor on what the gear
gives: printed numbers plus what the gear's attributes buy. A player reads their targets off the game's Inventory
window, which shows the whole character. On the real level-46 trio the gear gives about 300 effective HP while the
game shows 1,100–1,300 (the log's own bound is 1,103–1,306, `hp-estimate.ts`), so "at least 1,500 HP" could only ever
read as unreachable — and "% of max" was a share of a figure nobody sees. The player asked (2026-11-08) to see their
real stats as the floors.

What the character has beyond gear splits into what can be worked out and what can't:

- **Can:** the race's base attributes plus the classes' modifiers ([ADR 0331](./0331-a-stat-s-worth-depends-on-where-your-totals-sit.md)),
  and the HP, mana, endurance and AC those attributes buy, read off each rate's own curve at the character's base.
  On the real trio that is 497 HP and about 880 mana before any gear.
- **Can't:** a class's level-based HP table, AAs, a standing buff. No formula for these is published in anything the
  app reads, and inventing one would put a made-up number under every floor.

## Decision

- **A floor, a "% of max" and every figure reported against them are the game's.** The search is unchanged in kind: it
  still works in gear's terms, but each floor asks the gear for `target − base`, and the goal row reports gear plus base
  (`GoalRow.base` says how much of it is the character's own). A floor the base already covers asks nothing of the gear.
  `bis-goals.ts` takes the base as an input; it knows nothing about races.
- **The base is the modelled base plus a calibration** (`stat-base.ts`). The modelled base needs a race (one ticked in
  the Race picker); without one only gear can be counted, and the page says so for any floor on an attribute or on a
  pool with no calibration.
- **Calibration is typed from the game, once, per pooled stat** — HP, mana, AC and endurance, the stats attributes
  feed. The player types what the game shows *wearing what they wear now*; what is kept is the difference from what the
  model counts (modelled base plus the worn gear's effective totals), as an **offset**, not the typed number. So it
  stays right when the worn gear changes, the way a typed faction total does ([ADR 0308](./0308-the-game-s-faction-dump-is-a-stated-total.md)).
  Clearing the box clears it. It is part of `BisOptions` as a setting: Reset leaves it, and a peer's plan never starts
  with it, because it is about the player's own character. The boxes are hidden while planning for a peer and while
  there is no dump to measure against.

## Consequences

- A floor typed from the game now means what the player expects. Replayed on the real inventory, the best owned-gear HP
  is 450 from gear and 1,436 as the game would show it, with 1,250 typed against a Human guess.
- With no race ticked and nothing typed, nothing changes: the base is empty and floors are gear's share only, exactly as
  before. A saved percent floor gets easier once a base exists, because it is now a share of a bigger, real maximum.
- The calibration absorbs every error in the model *at the gear worn when it was typed*. The model's per-point rates
  (STA→HP, INT→mana) are taken at the planner's level — the Items tab's level cap, 60 by default, not the character's
  level — so a level-46 character should set that level for the gear's share to scale properly; the offset only fixes
  the total at the moment of typing. It goes stale on a level-up and on a changed buff, and is typed again.
- AC's base can be negative: AGI below 75 costs five AC a point ([ADR 0331](./0331-a-stat-s-worth-depends-on-where-your-totals-sit.md)).
  That is the game's behaviour, but the class and level part of AC is as unknown as HP's and wants the same calibration.
- Resists are still gear-only: the repo has no race base for them, and they are not pooled from attributes.
