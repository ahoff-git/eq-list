# 0363: Running dry and dying suggest mana and health

## Status

Accepted

## Context

[ADR 0361](./0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md) and
[0362](./0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md) read what lands on you and suggest a
resist or AC. The player's next thought (2026-11-06) was that when all else fails, more health always helps, and
that running out of mana mid-fight should suggest more mana.

What the log can say about each, measured on the real history (3,301 fights, one character):

- **Mana.** The game writes `Insufficient Mana to cast this spell!` once per key press and names no spell, so a
  mashed button is a burst: 869 lines made 171 runs at an 8-second gap, five of them in one second. The parser
  ignored the line. Joined to fights by time, you cast in 3,043 of them and ran dry in 94 (3.1%), and in all but
  one you had cast first, so it really is *running out*, not arriving empty. It is rare but lumpy: 7 of 93 long
  visits had it in 10% or more of their fights, the worst 30%.
- **Health.** The log never states your hit points — the app only infers a bound on them
  ([ADR 0018](./0018-inferred-max-hit-points.md)) — so how close a fight came is not read off it. A **death** is:
  103 of them across 101 fights, 7 of 114 zone visits with at least two and a tenth of the fights.
  "When all else fails" is read as: you keep dying, whatever did it.

## Decision

**When you run out of mana in a real share of the fights you cast in, or die in a real share of fights, and the
builder's loadout reaches meaningfully more of that pool than you wear, that is a suggestion — shown the same ways
as a resist's or AC's.**

- **The tracker counts running dry.** The parser reads the line as an `out-of-mana` event (and `parse-line.ts`'s
  total map of combat kinds lists it, so the live watcher passes it on). A window counts a run of lines within
  8 seconds once (`OUT_OF_MANA_RUN_GAP_MS`). Only a fight's own lines reach its window, which is what makes a
  fight's `outOfMana` "mid-fight" rather than pre-pull key mashing; the session counts every one. `outOfMana` is
  absent on fights stored before it existed and **`0` is a measurement**; the combat-history revision is bumped
  to 6 so the next start re-reads the logs unattended ([ADR 0129](./0129-a-release-can-ask-for-a-re-read.md)) —
  3,294 fights in 20 seconds on the real history.
- **Mana** (`strain.ts`) is suggested at 15% or more of the fights you cast in (`DRY_FLAG_SHARE`), needing 5 such
  fights. A fight with no recorded count, or none of your casts, is not evidence either way.
- **Health** is suggested at two or more deaths (`MIN_DEATHS`) that are 10% or more of the window's fights
  (`DEATH_FLAG_SHARE`), needing 5 fights. One death is bad luck.
- **One question, asked once.** AC's "does the builder's loadout reach meaningfully more than you wear" is
  generalised into `headroom.ts` (`worthSaying`): the gain is the difference of the rounded totals, at least the
  stat's own minimum (5 AC, 20 health, 50 mana) and 10% of what is worn (`MIN_GAIN_RATIO`, shared). The builder
  publishes AC, health and mana together under one key (`itemHeadroom`) and the pill reads them.
- **Said in this order**: armour, resists, mana, and health last — the answer that helps whatever did it. The pill
  shows the first and `· N more`; the section lists them all and always prints the figures
  (`Died in 3 of 14 fights; ran out of mana in 4 of the 11 you cast in.`), flagged or not.

## Consequences

- **The thresholds are judgements from one player's history**, set so the pill is the exception: over the real
  zone visits mana would flag 6 of 114 and health 7, one of them both. Your current zone flags neither. They are
  constants in `strain.ts`.
- **Health is about deaths, not near-deaths**, so it says nothing to a careful player who never dies and a lot to
  one who does, and it does not weigh health against armour or a resist — it suggests alongside.
- **Mana is the pool only.** Mana regeneration, a cheaper spell, meditating and food are not considered; the
  figure is the effective total (printed mana plus what attributes give).
- **A pure melee character never casts**, so nothing is read for mana; a character with no goals that reach
  more health or mana than they wear hears nothing, exactly as AC does (0362).
- The section is still titled *Damage taken*, though mana isn't damage; renaming it would touch every spec that
  names it, and the line of figures above the table says what else it reads.
- The builder's stored figures changed shape and key, so an old AC-only value is ignored and the pill is quiet
  until the builder has planned once.
- Not built: regeneration, naming the slots that change, and an estimate of how much more health would have
  avoided a death.
