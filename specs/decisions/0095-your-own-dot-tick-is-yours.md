# 0095: Your own DoT tick is yours, because the log says so

## Status

Accepted

## Context

[ADR 0071](./0071-a-dot-tick-belongs-to-whoever-cast-it.md) settled that a damage-over-time tick
belongs to whoever cast it, and built `dot-attribution.ts` to put a caster back onto a tick the log
names nobody for. It described two wordings:

```
You have taken 1 damage from Plague Rat Disease by a large plague rat.   ← names the caster
A coyote has taken 5 damage by Engulfing Darkness.                      ← names nobody
```

There is a **third**, and it is the one that says *your*:

```
A minotaur slaver has taken 29 damage from your Heat Blood.
```

Neither pattern could ever match it. `DOT_FROM_RE` needs a trailing ` by <caster>` to bind and this
line has none; `DOT_BY_RE` needs `damage by` where this says `damage from`. So it fell through to the
unparsed pile — silently, because an unread line is only ever a tally in a debug section.

A sweep of a real 230,000-line log measured the cost: **1,737 lines carrying 27,775 points of
damage — 3.3% of that character's entire output**, across nine spells (Stinging Swarm 11,452, Heat
Blood 7,413, Leech 4,448, Poison Bolt 2,386, Infectious Cloud 1,457, and four more). None of those
lines is duplicated anywhere else in the log; checked line by line around several of them. For a
character led by DoTs it is not 3% but most of what they do.

Two further things the same sweep established, both of which change the shape of the fix:

- **A tick can crit**, and the log tags it after the full stop exactly as it tags a swing:
  `An iksar ghost has taken 84 damage from your Stinging Swarm. (Critical)`. All three DoT patterns
  were anchored at `\.$`, so they missed these — and critical ticks are the *biggest* ticks in the
  log by a factor of two (84 against a plain 42). A pattern anchored at the full stop therefore
  doesn't merely lose a few lines; it loses precisely the ticks worth recording.
- **The nameless form still happens for your own spells too.** `Infectious Cloud` appears 248 times
  as `from your Infectious Cloud` and 12 times as a nameless `has taken N damage by Infectious
  Cloud` on a mob, in a log where you cast it 21 times. So both halves are needed: the wording that
  states the caster, and ADR 0071's correlation with your earlier cast for the wording that doesn't.

## Decision

**A tick that says "your" is yours, stated rather than inferred.** `DOT_MINE_RE` reads the third
wording, and it captures `your` as the **attacker group** rather than special-casing it — `combatant()`
already folds `you`/`your` to `SELF`, so the existing branch handles it with no new code path and,
importantly, leaves `casterUnknown` unset by the same rule the `by <caster>` form uses.

That last point is the load-bearing one. `dot-attribution.ts` must **not** re-guess a caster the game
named. Its own documented limit is that it keeps one caster per spell name, last seen — so a
group-mate casting Heat Blood after you would otherwise take your ticks off you. A stated caster
outranks a correlated one, always, which is the same precedence
[ADR 0025](./0025-observation-over-the-wiki.md) applies to a claim against an observation.

**All three DoT patterns take the `QUALIFIER` suffix**, the one melee and spells already use, and the
tick event carries the tag through. A critical tick is a critical hit.

**Forward only.** Fights already on disk keep the figures they were written with — the same rule
[ADR 0021](./0021-stored-fights-keep-their-source.md) and
[ADR 0093](./0093-a-high-score-is-a-personal-best-with-a-floor.md) apply to every field added after
the fact. Stored fights do keep `logIds` and their own timestamps precisely so they *can* be
re-derived, and that remains the right eventual answer, but re-derivation is machinery this app does
not have yet and inventing it to backfill one field would be a much larger change than the bug.
Recorded in [todo.md](../todo.md) rather than done here.

## Consequences

Every damage figure that includes your DoTs rises: the meter, a fight's `yourDealt` and DPS, spell
efficiency, the per-spell table, and the damage cells every drill-down is rolled up from. On the log
measured, your damage reads 838,608 where it read 810,833 — and the gap is larger for a DoT class and
zero for one that casts none.

`hp-estimate.ts` is unaffected in the direction that matters: it infers bounds from damage taken, and
this is damage dealt.

The scoreboard's **`biggest-tick` becomes reachable, and stops being live-only.** ADR 0093 shipped it
as a category only a live line could set; the truth was that nothing could set it at all, because the
line was unread. Now a stored fight can seed it too: a damage cell whose hits are *all* ticks is a
DoT, so the cell's own maximum **is** its biggest tick. A cell with a landing among its hits stays a
`biggest-nuke` candidate, since its maximum might be that landing. Ticks also now reach the `qual:`
family, so a critical tick can hold `Biggest Critical`.

A comparison of two log readings must now say which build read it. Nothing records that today, which
is the same gap the generated-dataset manifest item in [todo.md](../todo.md) describes; worth folding
into it rather than solving twice.

**Still unread, and deliberately out of scope here**: your own damage shield, which has the identical
first-person problem one wording along — `A wild tiger is pierced by YOUR thorns for 1 point of
non-melee damage.` has no `'s` for `SHIELD_RE` to bind, while the pet's `Kainos`s warder's thorns`
form parses. That is 907 lines and 1,576 damage on the same log — real, but a different line shape
deserving its own decision, and left in [todo.md](../todo.md).
