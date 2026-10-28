# 0343: Resists and avoidance live in the damage cells

## Status
Accepted

## Context
A fight's "why didn't that land" was only half answered. The Spells view gave each of *your* spells
a resist rate for the window ([ADR 0016](./0016-combat-history-and-spell-analytics.md)), but the
meter's drill-downs — the views a fight is actually read through — had nothing on resists, so "which
mob keeps resisting Blast of Cold" meant reading a hover's top-four list. And melee had a hit rate
with no reason behind it: the parser already told a plain whiff from a dodge, parry, block or
riposte (`MissEvent.avoidance`), and the cells
([ADR 0053](./0053-damage-is-cells-rolled-up.md)) threw that away by counting both as `misses`.

## Decision
**Both are facts about a (victim, attacker, kind, source) cell, and are filed there.**

- A miss still counts in `misses`; when the log names how it was avoided, the cell's `avoided`
  counts it by kind too. Whatever is left is a plain whiff.
- A resist that names its victim is filed in the **Spell** cell for that caster, spell and victim,
  as `resists`. A resist is not damage, so it never moves a total. The incoming form ("You resist a
  rat's Plague Rat Disease!") now carries you as its target so it is filed too. That needed the
  parser to state what the sentence already says.
- Every roll-up sums both, so any drill order gives a node's resist rate and avoidance split:
  per spell, per victim, per fight. A resist rate is `resists / (landings + resists)`. Landings are
  the node's non-tick hits.

## Consequences
- Resist rate per spell per mob, and "parried 6, dodged 4" per skill per mob, appear in every view
  of a live fight, a session and a stored one.
- The cells see only *damaging* landings, so a spell that never damages (a mez, a root) has no
  denominator there. It shows its resists as a count rather than a fake 100%. `SpellStat.resistRate`
  remains the per-spell figure that sees every cast (ADR 0305).
- Fights stored before this carry neither field and read as none. Digesting their log again
  re-derives them ([ADR 0128](./0128-a-fight-is-re-derived-not-refused.md)).
- Other people's resists are still invisible: the log reports only resists of your spells and
  spells cast at you.
