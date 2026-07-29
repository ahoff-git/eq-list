# 0016: Combat history on disk, and spell efficiency derived from the log

## Status
Accepted

## Context
[ADR 0014](./0014-damage-meter-from-the-log.md) built a live meter that keeps "current
fight" and "session" and nothing else. That answers "how is this pull going" but not the
questions you actually ask afterwards: where was my damage coming from last night, which
spells earn their cast time, which ones get resisted.

None of that is in the log as a number. EQ states no cast times, no resist rates, and no
per-spell totals. But it does log the *events* around them, and two shapes make the rest
derivable:

- `You begin casting Blast of Cold.` — the start. The gap to the effect landing **is**
  the cast time.
- `A coyote resisted your Blast of Cold!`, `… fizzles!`, `… is interrupted.`, `… did not
  take hold on X.` — the ways a cast ends without landing, which is what a resist *rate*
  needs as a denominator.

Reading a real log turned up two traps that quietly break naive versions of this. EQL
writes the **rank** in the cast line (`Shock of Lightning VI`) but the base name wherever
the spell does something (`…by Shock of Lightning`) — so keying on the log's own wording
files one spell as two: a cast row with no damage and a damage row with no cast time,
and the biggest nuke in the log reporting zero casts. And a buff's **proc** has a
different name from the buff (`Spirit of Lightning` grants `Spirit of Lightning Strike`),
which is genuinely a separate thing and must *not* be merged.

## Decision
**Spell stats are derived per window** (fight and session), alongside the combatant rows:
casts, landings, DoT ticks, fizzles, interrupts, resists, blocks, damage, healing, max
hit, average measured cast time, resist rate, and damage-per-second-of-casting.

- **Cast timing** pairs `cast` → the damage/heal that follows, one cast in flight per
  caster (EQ allows no more). A cast is discarded rather than mis-measured if nothing
  lands within 20s; an outcome (fizzle/interrupt/resist) resolves the pending cast so it
  can't be credited to the next spell's landing. DoT **ticks** never consume a pending
  cast — only a first landing does.
- **Spell names are canonicalized** by stripping a trailing roman numeral
  (`spellName()`), which is what makes the cast and the damage line agree. The untouched
  line stays in `raw`.
- **`dpc` is per-landing damage over the average cast time**, not total damage over the
  measured seconds. The latter inflates any spell whose casts were mostly untimed — all
  of the damage, a fraction of the time (measured on a real log: 34.8 vs a true 11.6).
- **Only your own casts** are tracked. The table exists to answer "do my spells earn
  their cast time"; other people's spell damage is already in their combatant row.
- **Melee is shown as a synthetic row** in the spell view (your damage minus all spell
  damage), because "where did my damage come from" is a question about the whole pie.

**History is a flat, bounded list of finished fights** (`combat-history.ts`, JSON under
userData), each tagged with the session that recorded it; sessions are *derived* by
grouping. One list means one size bound (1000 fights, ~2 weeks of play) and nothing to
keep consistent — if a fight is on disk, its session exists by definition. Fights are
filed **as they end**, so a crash loses at most the fight in progress, and writes are
debounced because fights end in clusters. The tracker itself stays memoryless: it emits
`fightEnd`, and main files it.

Rejected alternatives:
- **Storing session records with nested fights** — two shapes to keep in sync, two
  bounds, and a half-written session after a crash.
- **Persisting the live snapshot continuously** — the live meter is derived state; the
  fights are the facts. Replaying facts can rebuild any view, the reverse isn't true.
- **Deriving cast time from a spell database** — needs a data source we don't have, would
  be wrong for the server's own tuning, and misses the point: the measured time includes
  what actually happened to you.

## Consequences
- The Damage tab's third scope, **History**, drills sessions → fights → the same
  meter/spell views a live fight uses. "Dig into last night" and "how's this pull going"
  are one screen.
- Cast times inherit the log's **one-second resolution**, so a single measurement is
  ±0.5s; averages over many casts are what to trust. A 1.0s reading may mean "fast",
  not "exactly one second".
- Spells whose casts are never logged (procs, damage shields, DoTs applied by mobs) show
  damage with no cast time and `dpc` 0 — correct, but it means the column is only
  comparable between things you actually cast.
- The rank-stripping heuristic assumes a trailing roman numeral is a rank. A spell whose
  real name ends in one (none seen) would be folded into a sibling.
- History is per-machine, unencrypted, and never uploaded; "Clear history" empties it.
