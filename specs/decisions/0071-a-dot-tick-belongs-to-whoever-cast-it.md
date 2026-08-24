# 0071: A DoT tick belongs to whoever cast it

## Status

Accepted

## Context

EQ Legends words a damage-over-time tick two ways, and only one of them names anybody:

    You have taken 1 damage from Plague Rat Disease by a large plague rat.   ← names the caster
    A coyote has taken 5 damage by Engulfing Darkness.                       ← names nobody

The short form is the one *your own* DoTs use. `parseCombat` is pure and sees one line at a time,
so with no caster to read it put the DoT's own name in `attacker` and
[ADR 0053](./0053-damage-is-cells-rolled-up.md) recorded that as the log's limit: "a bare DoT tick
names no caster, so the DoT appears as its own attacker in the tree."

Taken at face value downstream, that limit is a hole in the meter. Everything that attributes
damage keys off `attacker`, and `isMine("Engulfing Darkness")` is false, so for every tick of
every DoT the player casts:

- the damage lands in a **phantom combatant row** named after the spell, not the player's;
- it is missing from `yourDealt`, from the row's DPS and from the per-second sparkline;
- the **spell's own row shows the first landing and nothing after it** — `sp.damage` is only
  reached inside `isMine(attacker)`, so `ticks` never incremented either;
- `fight-scope.ts` can't engage on the line at all (neither side is ours), so a tick arriving
  before your side had traded blows with that mob was dropped outright.

On a DoT the ticks *are* the spell — a nuke's worth of damage arriving in a tail — so the effect
is that the meter reported a fraction of what the log actually contained. This is the
"DoT damage is not being counted correctly; it hits way more than is being parsed" report.

The log does say who cast it. It says so one line earlier, in a sentence we already parse:
`You begin casting Engulfing Darkness.` Nothing needs inferring — the caster only has to be
remembered until the ticks arrive. The parser can't do that (it is stateless on purpose), but the
tracker already keeps exactly this kind of knowledge about the character (`castRepertoire`).

## Decision

**A caster-less DoT tick is credited to the combatant last seen starting to cast that spell.**

- `parseCombat` keeps writing the DoT's name into `attacker` and now says so explicitly, with
  `DamageEvent.casterUnknown`. A stand-in name that can't be told from a real one is what made
  this invisible; the flag is the discriminator.
- A new black box, `src/shared/dot-attribution.ts`, is a spell → caster memory: `note()` learns
  from every `cast` event, `resolve()` returns the event with `attacker` replaced and
  `casterUnknown` cleared. It never mutates what it's given and never guesses — a spell nobody
  was seen casting comes back untouched, phantom attacker and all.
- `combat-stats.ts` resolves **first**, at the top of `record()`, before the fight scope, the
  rows, the damage cells or the spell table read the attacker. One rewrite, one place, so no two
  consumers can disagree about whose tick it was.
- Casts are learned from **anyone**, not just the player: a group-mate's DoT is their damage, and
  filing it under the spell name would plant a phantom row just the same.
- The attribution survives `reset()`, on the same reasoning as the cast repertoire — it is
  knowledge about who casts what, not a tally, and a DoT in flight when the meter is cleared
  should go on being attributed.
- `SpellStat` gains `tickDamage` and `maxTick` (both optional, for fights stored before them), so
  a DoT's total can be read as "the landing plus what it ticked for" rather than one opaque
  number. `maxHit` keeps its meaning: the biggest *landing*.
- The Spells table's figures move out of the row's hover tooltip into a **click-to-expand
  breakdown**. The hover had grown to eleven `·`-separated clauses; the ticks split alone adds
  five more.

## Consequences

- Your DoT damage now appears where it happened: your row, your DPS, your sparkline, and the
  spell's own `damage`. Numbers on existing screens go **up** — for a DoT-heavy character,
  substantially — because damage that was in the log was previously filed to a phantom.
- The phantom rows are gone for any spell whose cast we saw, which also fixes the drill-down:
  the cast landing and its ticks are now one cell (one attacker, one source) instead of two.
  This revises ADR 0053's last consequence bullet — the tree's shape was correct given what the
  event carried; the event now carries more.
- **One caster per spell name, last one seen.** Two people DoTing with the same spell at once
  can't be told apart: the tick lines are byte-identical and the cast lines are the only evidence
  there is, so the later caster gets the ticks. Rarer than the phantom row it replaces, and it
  errs towards a real combatant rather than a fictional one.
- A tick now engages the fight scope, so a mob you only ever DoTed counts as one your side
  fought — it can therefore be credited with a kill. That is the honest reading of "your side,
  and whatever your side is fighting" ([ADR 0067](./0067-the-meter-counts-your-party-s-fights.md)).
- A mob's DoT on you is unchanged when the log wrote the short form and logged no cast for it:
  it still shows as its own attacker. EQ does not announce mob casts by name, so there is nothing
  to attribute, and inventing an attacker would be worse than the log's limit.
- `lands` still counts first landings only, so a DoT whose *every* damage line is a tick has
  `lands: 0` and therefore no `Dmg/s cast` and no `Per mana` figure, despite showing damage. The
  alternative — letting the first tick pair with the cast — would report a DoT's ~6s server tick
  as its cast time and corrupt the column that matters most. Left as is, deliberately.
