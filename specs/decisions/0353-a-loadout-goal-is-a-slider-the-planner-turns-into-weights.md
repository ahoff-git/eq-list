# 0353: A loadout goal is a slider the planner turns into weights

## Status
Accepted

## Context
The loadout builder ranks by the player's weight sheet ([ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md)).
Weights are the wrong language for a quick ask. "2k HP and 100 AC, then the most melee damage" or "as
tanky as I can be while keeping near max mana" don't say what a point of HP is worth; they say what to
reach, and what to give up last. VLHM_Stats' food planner already answers this for foods: a 0–100%
slider per stat, presets, and a "min" under each.

## Decision
- **A goal is per stat, with two sliders:** a **priority** (0–100%) and an **at least** floor, in
  points or as a percent of the most any loadout from the pool could reach. Melee swing damage is a
  goal too (priority only). Presets (Tank, Melee damage, Caster, Tank with full mana) replace the goals;
  the sliders refine them. Goals live in `BisOptions.goals`, so a preset carries them.
- **Goals become ordinary weights** (`bis-goals.ts`); the solver is untouched. Each thing asked for is
  first planned alone, which gives its maximum and the value of that loadout, and is then scaled so that
  maximum is worth 10,000. A priority of 100% is the whole of that, so HP in the thousands and AC in the
  hundreds compare without arithmetic. The player's own sheet counts on the same scale.
- **A floor is a boost found by search.** A stat still short of its floor has its boost doubled until
  the plan reaches it, then bisected back down so no more is given up than needed.
- **Totals are effective ones** (`effectiveStats`): STA's HP and INT's mana count toward a floor, as the
  Stats section shows them.
- A floor above what any loadout can give is held to the maximum and says so. A floor the other goals
  leave no room for is reported unmet, never hidden.

## Consequences
- The planner does the work of a whole search on each change: about a dozen plans per goal. Sliders
  therefore commit on release, not on every move.
- Weights can only find loadouts on the convex hull of what's reachable, so a floor may be met by a
  point past a better, off-hull loadout. The result always holds the floor but can give up a little more
  than an exact constrained solve would. If that shows in use, the next step is a swap search from the
  result, not a different model.
- Scores on the page (Loadout, per-row value) are in goal units whenever goals are set: 10,000 is the
  best any loadout could do for one thing.
- Floors on stats not in `LOADOUT_STATS` (a weapon's own delay, DMG) don't exist; "max melee damage" is
  the swing priority, which uses the melee model ([ADR 0337](./0337-a-weapon-is-weighed-by-what-it-hits-for-in-its-hand.md)).
