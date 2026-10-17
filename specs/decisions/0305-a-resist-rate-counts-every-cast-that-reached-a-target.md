# 0305: A resist rate is resists out of every time the spell reached its target

## Status

Accepted

## Context

[ADR 0016](./0016-combat-history-and-spell-analytics.md) defined a spell's resist rate as resists
over *completed* casts, and counted a land only off a damage or heal line. A mez, a root, a slow, a
stun, or a DoT (whose damage is all ticks) never writes one — so every resist of theirs read as 100%.
On the author's log Mesmerization showed 100% resisted: 68 resists, 0 lands, out of 791 casts.

## Decision

**A land is a cast that finished and hit its target without being resisted.** Two counts see it,
and the spell's `lands` is whichever sees more:

- the landing lines — the only count that sees an area spell's several targets per cast
  (Firestorm: 248 casts, 827 landings);
- the casts that finished and were neither resisted nor blocked (`casts − fizzles − interrupts −
  resists − blocked`) — the only count that sees a spell that writes no landing line.

**Resist % = resists ÷ (lands + resists)** — of every time the spell reached its target, the share
shrugged off. A blocked spell (it "did not take hold" on a buffed player) is neither. Damage per
second of casting divides by the same `lands`, so a DoT now earns a figure for what one cast does.

## Consequences

Mesmerization reads 9%, Walking Sleep 14% instead of 100%; direct-damage nukes are unchanged. The
Spells table's "landed" now counts a mez or DoT cast that went in. A cast still in flight when the
window is read counts as landed — at most one cast's error. A spell resisted with no cast line in
the log (a bard song, which is sung, not cast) has no lands to count and still reads 100%.
