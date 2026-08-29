# 0150: A zone line ends a debuff

## Status

Accepted

Completes the lifetime rules in
[ADR 0141](./0141-a-debuff-is-the-mirror-image-of-a-buff.md), which said what a fight ending does to
a row and nothing about what a zone line does. Which rows exist at all is
[ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md).

## Context

`noteZone` cleared the pending-cast memory and deliberately left the board alone, on the sound
observation that **buffs cross a zone line in EQ**. Thistlecoat is still up when you land, so
dropping the board would have thrown away the reminders the feature exists for.

That is true of buffs and false of everything else on the board. Zoning **strips every detrimental
effect on you outright** — it is one of the two reliable ways to shed a debuff — and the debuffs you
cast are on mobs standing in a zone you have just left. Either way the row is about something that is
no longer happening, and the board went on showing it: a standing "Snare has worn off a wild tiger"
followed the player into the next zone and sat there until something else cleared it.

The fight-end sweep did not cover this. A zone change is not a fight ending — you can zone mid-fight,
and you routinely zone long after one — so the rows survived precisely the transition that makes them
most obviously stale.

## Decision

**A zone line ends every row about something that stayed behind, and keeps your own buffs.**

- **Every debuff goes**, up or lapsed, whatever its target. Both directions justify it and neither
  needs the other: the ones on you were stripped at the line, and the ones you cast are on mobs in the
  old zone.
- **So does anything else aimed at what you were fighting** (`onEnemy`) — a buff on a charmed pet is a
  row about a pet that did not follow you.
- **Your buffs are untouched.** This is a sweep, not a reset, and the difference is the whole reason
  the call exists rather than being folded into "clear the board".
- **The spell's row is untouched too.** The catalogue holds the player's decisions, and a zone line is
  not one of them.
- **Held banners go with their rows.** A banner waiting for a fight to end must not arrive in the
  next zone to talk about the last one.

## Consequences

The standing list no longer carries a debuff across a zone, which is where a stale row was most
visible and least defensible.

**It is a stronger sweep than a fight ending's, for a stronger reason**: that one drops rows about a
corpse, this one drops rows about a whole zone. Both are the same idea — a reminder is only worth
having while the thing it is about is still there.

**A debuff genuinely re-applied after zoning starts clean**, which is right: the instance in the old
zone taught nothing about the new one, and the `since` a kept row would have carried would have been
a duration measured somewhere you no longer are.
