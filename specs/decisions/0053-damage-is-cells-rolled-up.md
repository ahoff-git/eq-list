# 0052: Damage is stored as cells and rolled up, not as a breakdown per combatant

## Status
Accepted

## Context
The Damage tab's per-combatant breakdown didn't add up, in three separate ways.

- It showed **Melee**, **Spells** and **Special hits** as three peer groups, each with its own
  total. The first two partition the row's damage; the third *overlaps* them — a critical slash
  is already in Melee → Slash — so the three totals could never sum to the row's damage, and a
  reader who tried got a number 20–30% too big.
- In the **taken** view the bar showed damage *taken*, and the breakdown under it showed the
  same combatant's damage *dealt*. Two unrelated numbers, one row, no label saying so.
- Nothing recorded **who hit whom**. `taken` was a bare scalar per combatant, so the obvious
  question — "what killed my pet, and what was it doing to me?" — had no answer anywhere except
  the death recap's 15-second window.

The tallies behind it were also duplicated knowledge: `byVerb` and `bySpell` were accumulated
per combatant beside the same events the meter already had, which is how the taken view came to
disagree with its own bars in the first place.

## Decision
Record damage as **cells** and compute every view from them.

- **`src/shared/damage-tree.ts`** — a pure black box beside `combat-parser.ts`. It folds each
  hit or miss into one cell keyed by **(victim, attacker, kind, source)**: `kind` is
  `Melee | Spell | Other`, `source` is the melee skill (`Slash`), the spell (its DoT ticks
  folded in), or a damage shield's own word (`flames`). `rollUpDamage(cells, axes)` groups them
  into a tree, one level per axis, and `drillDown` names the axes for the two views.
- **Flat cells, not a stored tree.** A tree can only be read one way round, and every way is
  wanted. The panel's `LAYOUTS` names three roll-ups of the one set of cells — **Targets**
  (victim → attacker → kind → source), **Dealers** (attacker → victim → kind → source) and
  **Abilities** (attacker → kind → source → victim) — so a new question is an axis order rather
  than a new component, and no two of them can disagree about a total. Every level sums *exactly*
  to the one above it, by construction.
- **An area spell only adds up ability-first.** EQ writes Firestorm as one damage line per target,
  so every victim-before-ability order splits one cast four ways before you can see what the cast
  was worth. That's what the Abilities layout is for: the ability above the target sums the cast,
  and the level below it still says which mobs it landed on.
- **Targets is the view the tab opens on.** A fight's first question is what we damaged; the
  dealer list answers "which of us was in the room", which in a group is a screen of party
  members standing where the enemy should be. The old default (dealers) also made "how much did
  we do to *that* mob" a number the reader had to assemble across rows.
- **A cell partitions; a qualifier doesn't.** "Critical", "Riposte" and "Flurry" stay a separate
  per-combatant tally (`bySpecial`) and are rendered as an explicit "of these hits" footnote,
  because a hit can carry one *and* belong to a source. Nothing that overlaps its siblings is
  allowed to be a level.
- **The per-combatant splits are derived from the cells**, not tallied again: `CombatantStat`
  keeps `byType`/`bySpell` (the API is unchanged, and every existing test still passes) but they
  are now a roll-up of that combatant's cells. One source of truth, so the row and the
  drill-down under it can't drift.
- **Misses are cells too**, with damage 0. That's what makes a hit rate available at every
  level, including "which skill do I whiff with, against what". DoT ticks are excluded from both
  sides of that rate — they aren't swings, and counting them reads as perfect accuracy.
- **Metrics at every level**: total, share of the level above, hits, ticks, misses, crit rate,
  hit rate, biggest hit. The share is the point: it is always a share of something stated.
- **And four shares against fixed denominators** (`DamageShares`), because "of the level above"
  can't answer "how much of that mob did I do" — it moves with the depth, so the same 50% means
  something different at every level and comparing two nodes means multiplying shares back up
  their branches. The fixed ones are every combination of *whose damage* × *on what*: `ofFight`,
  `ofTarget`, `ofAttacker`, `ofAttackerOnTarget`. Each is **absent rather than approximated** when
  the node spans several victims or several attackers — a spell's row above its per-target split
  has no "that victim" to be a share of.
- **"The fight" is what your side fought, not everything the log printed.** Damage *on* you, your
  pet or your group is the fight happening to you, not a slice of "how much of this fight was
  mine", so it stays out of that denominator — and a node made of it carries no `ofFight` at all
  rather than a share of a total it isn't in. Sides come from the swings themselves: the log never
  says who is a player or who is grouped, and no name-shaped guess survives real data (`Bonefire`
  and `Marrowbane` are mobs we killed), but a swing is a statement of opposition. Anything you or
  your pet traded blows with is an enemy, anything an enemy fought is on your side, outwards from
  there. Players hitting each other falls out for free: hit them and they're something you fought.
  - The two directions are not equal evidence. **"An ally hit it" is near-certain** (EQ has no
    friendly fire) and wins; **"an enemy hit it" only leans**, because mobs do hit each other.
    Leaning first is how, on a real 25-combatant raid, an enemy's pet ended up counted as one of
    ours. Measured on that raid the rule now puts all six group-mates and you outside the fight
    total and every mob inside it, including the named ones a name heuristic would have mistaken.

Rejected alternatives:
- **Keeping the three peer groups and just labelling the overlap.** Cheaper, and it leaves the
  taken view with no attribution at all — the missing data was the real complaint.
- **Storing both trees in `FightStats`.** Twice the size and two things to keep consistent, for
  a roll-up that costs microseconds in the renderer.
- **A cell per log line.** Complete, and it is the raw log with extra steps; ADR 0021 already
  rejected storing lines. Cells grow with *distinct combinations*, not with events — measured
  against a real history file, the busiest session had 179 distinct attacker×source pairs.

## Consequences
- The Damage tab answers the whole question in one place: who took damage → from whom → how →
  with what, with metrics at each level and shares that add up.
- A charmed mob fighting for you counts as one of yours, so damage on it is outside the fight
  total. That's the honest reading of "your side" rather than a bug — but it does mean the rule is
  about sides, not about players, and a pet charmed off an enemy changes which side it's on
  mid-fight without the log ever saying so.
- `FightStats.damageCells` is optional. Fights stored before it existed have none, so their
  dealt view falls back to the kind/source split they did keep, and their taken view says so
  rather than inventing attribution. No replay exists to backfill them (ADR 0021).
- The history file grows by roughly a third (measured: 668 stored fights, 2.4KB each, ~4.4
  source rows per fight). Snapshots broadcast to the windows grow by about as much; they were
  already coalesced at 250ms for exactly this reason.
- The damage shield needed a discriminator to be classifiable, so `DamageEvent.shield` now
  marks one. It comes free — the shield grammar is the only one that captures a source word.
- A bare DoT tick ("A coyote has taken 3 damage by Plague Rat Disease.") names no caster, so the
  DoT appears as its own attacker in the tree. That's the log's limit, not an attribution
  choice, and the longer "…by a large plague rat" form does credit the caster.
