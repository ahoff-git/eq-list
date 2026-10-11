# 0289: A debuff counts down from the file's ceiling

## Status

Accepted

## Context

The crowd-control HUD (`DebuffOverlay`, [ADR 0202](./0202-two-mobs-sharing-a-name-get-two-debuff-rows.md))
showed a countdown only from a duration *learned* from your own fades. For mez that almost never
happened: [ADR 0206](./0206-a-duration-that-disagrees-with-itself-says-so.md) measured its confirmed
gaps at 1s–167s, which is correctly too erratic to trust, so a mezzed row read only "up 0:12". That
is the one spell where "how long have I got" matters most. Players asked for time remaining and for
colouring that says when to recast.

[ADR 0080](./0080-the-game-s-own-spell-file.md) declined to compute durations from `spells_us.txt`
because a duration is a *formula* of the caster's level, and the log never states that level. That
holds for the formula. It does not hold for the formula's **tick cap** (column 12). Every timed
formula is "some function of level, capped at the ticks column", so the cap is an upper bound
whatever level cast the spell. It needs no level and no arithmetic beyond `ticks × 6`, the same
restraint `permanent` and `instant` already use when they read the formula *id*.

For crowd control the cap is also the real figure. Checked against a live install: Mesmerize
(formula 7, 4 ticks), Mesmerization (1, 4), Entrance (9, 12) and Dazzle (10, 16) all reach their cap
at a lower level than the first level that can cast them.

## Decision

**`SpellFacts.maxDurationSeconds` reads the tick cap as a ceiling.** It is `ticks × 6` for a timed
formula, and absent for an instant spell, a permanent one, or a formula with no cap stated. It is
re-asserted onto `KnownBuff` on every sighting, like `permanent` and `classes`.

**`debuffCountdown` picks what an up row counts from.** A learned figure wins when it is trustworthy
(not `durationErratic`) *and* shorter than the ceiling. Otherwise the ceiling is used. A learned figure
longer than the cap means a fade line lagged; the spell did not run long. The HUD marks each basis
with its own symbol: `~` for a learned prediction, `≤` for a ceiling. A mez still breaks early on
damage, so the ceiling is presented as an upper bound, not a guarantee.

**The row is coloured by urgency** (`countdownUrgency`) and drains a bar along its bottom edge. It
stays green above half-way, turns amber at half-way, and turns red in the last fifth or the last tick
(6s), whichever comes first. The scale is proportional, so a 24s mez and a 96s Dazzle both warn at
the same point in their run. The one-tick floor keeps a short spell from turning red too late to
recast.

## Consequences

A mez, root or charm row now shows how long it can have left and when to recast, without anything
learned first. The learned path from ADR 0202/0206 is unchanged and still wins when it has something
better to say.

The ceiling can be slightly early. EQ's tick boundaries can stretch a buff by part of a tick past
`ticks × 6`. That error is in the safe direction for a reminder, the same reasoning
`tightenDuration` gives.

`BuffPanel` still shows no countdown for ordinary self-buffs. Their formulas scale with level, and
many never reach the cap at real levels, so a ceiling there would read long rather than safe.

Rows saved before this change have no ceiling until the spell is next seen. Like `classes`, the
next sighting fills it in with no migration.
