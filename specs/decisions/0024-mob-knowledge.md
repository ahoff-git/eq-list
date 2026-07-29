# 0024: Mob knowledge — observed drop rates and roam areas, pooled with peers

## Status
Accepted

## Context
The kill log ([ADR 0022](./0022-invocation-effects-and-kill-locations.md),
[ADR 0023](./0023-kill-heatmap.md)) records every kill with what it dropped and roughly where
it happened. Rolled up per mob, that answers three questions the wiki only partly can:

- **How often does it drop that?** The wiki has rates for some things, from someone else's
  sample, of a different era. Your kills are your server, your patch, right now.
- **Where does it live?** Not "which zone" — the wiki has that — but *where in the zone*, and
  how far it wanders.
- **How much should I believe either?** A rate from 3 kills and a rate from 300 are not the
  same claim, and most displays quietly present them identically.

Derived from a real log: 39 mobs from 132 kills, including `rambunctious pet` dropping its
skull 12/12 (a guaranteed quest drop, correctly reading 100%) and `gnome skeleton` giving Bone
Chips 3/5 — a number that would be reckless to present as 60% without saying "of five".

## Decision
**Your knowledge is derived, never stored.** `observeMobs()` rolls the kill log up on demand,
so there is exactly one record of what you killed and no second copy to drift — the same
reasoning that makes sessions derived from stored fights in
[ADR 0016](./0016-combat-history-and-spell-analytics.md).

**The shared unit is an observation, not a kill.** `MobObservation` is `{mob, zone, kills,
drops: {item: count}, area, lastAt}` — counts, which merge by *addition*. That's what makes
pooling meaningful: six players' kills of the same mob are one much better sample. It's also a
fraction of the size of the kills behind it and carries none of the observer's movements.

**Peers' observations are stored, and kept apart from yours.** Pooling makes a rate more useful
and simultaneously less verifiable, so provenance is preserved rather than blended away: every
merged figure reports `myKills` alongside `kills`, and names its contributors. Nothing a peer
says can alter what your own log recorded, and "Forget peers'" drops theirs without touching
yours. A peer's report *replaces* their previous one, because they send their whole tally —
adding would double-count everything they'd already said.

**Sample size is part of the display.** Rates are dimmed below 15 kills and only shown solid
past 50, and every row leads with `count/kills` and how much of it you saw yourself. The
tooltip says outright when a figure is a hint rather than a rate.

**Roam areas are weighted by samples.** Pooling two observers' areas widens the spread to cover
both centres — a naïve average would *shrink* the area as more observers reported, which is
exactly backwards. Only positions above the plotting confidence threshold shape an area, so a
wild guess can't drag a mob's home across the zone.

Rejected alternatives:
- **Storing your own aggregates too.** Faster to read and a second source of truth to keep in
  step; the kill log is small enough to roll up on demand.
- **Sharing raw kill records.** Bigger, leaks the sharer's movements, and gains nothing —
  counts are all a pooled rate needs.
- **Merging peers' counts into your own totals.** Loses the ability to say "1 of these 10 kills
  was mine", which is the difference between data and hearsay.
- **Trusting peer data unconditionally.** It's stored but always attributed, so a poisoned
  contribution is visible and removable. Weighting or vetoing individual peers is a later
  problem, noted in the todo.

## Consequences
- Drop rates improve as you play and jump when a group shares, which is the point: a camp of
  six generates a usable rate in an evening where one player needs a week.
- The map can pin where a mob lives (`±spread` button), reusing the pin machinery rather than a
  bespoke "centre the view" path.
- A rate can still mislead if the sample is thin — mitigated by display, not by hiding data.
- Pooled knowledge is only as honest as the peers in the room. It's attributed, capped per
  peer, and forgettable; there is no reputation system.
- Two mobs sharing a name in one zone are one row. That's usually right (they're the same
  spawn) and occasionally wrong (a named rare sharing a base name), and the log gives nothing
  finer to split on.
