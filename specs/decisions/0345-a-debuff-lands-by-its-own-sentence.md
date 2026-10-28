# 0345: A debuff lands by its own sentence, and your spells always say their resist rate

## Status
Accepted

## Context
[ADR 0343](./0343-resists-and-avoidance-live-in-the-damage-cells.md) put resists in the damage cells.
Two things kept the drill-down from answering "what's my resist rate on Nagafen".

- **A resist rate needs landings, and a debuff has none in the cells.** A slow, a tash or a snare
  never writes a damage line. It writes the spell's own flavour sentence with the target in front
  ("Lord Nagafen glances nervously about."), which no parser models. So Tashani on Nagafen had no
  node at all, and Malaisement had only its resists.
- **"None resisted" and "not recorded" looked the same.** A cell carried `resists` only once one
  happened, so a spell nobody resisted showed nothing. That was also all an older fight showed, and
  every fight on disk was older: the history had been filed by a build without resists in its cells.

## Decision
- **`own-landings.ts` reads your detrimental spell's landing sentence** through the game string
  file's `landedOnOther` (the lexicon `buff-tracker.ts` already uses). It pairs the sentence with
  the cast you have in flight: first landing only, or the same second's for an area spell. It
  emits a `spell-landed` combat event, which the tracker files in the spell's cell as `landed`.
  Beneficial spells are refused, because a buff on a group-mate filed as a cell would make them an
  enemy (`enemiesIn`).
- **A spell's landings are the larger of its damaging landings and its announced ones**
  (`cellLandings`), so a nuke that writes both counts once. The resist rate is
  `resists / (landings + resists)`.
- **A cell of your own spell always carries `resists`**, from 0, so "0% resisted" is said when it
  is true. A spell that was resisted but never seen landing shows a count, not "100%".
- The live watcher and log replay (digest, re-read) both feed the reader. The combat-history
  revision goes to 5, so fights already on disk are re-derived unattended (ADR 0129).

## Consequences
- Targets → a mob → You → Spell shows every spell you cast at it, debuffs included, with a resist
  rate per target. Fight trends' resist tips cover debuffs too.
- With no game install there is no lexicon, so debuffs get no landing count (resists still show).
- Mezzes and other spells that land in silence still have no denominator here. `SpellStat.resistRate`
  remains the per-spell figure that sees every cast.
- A debuff's cast time is still unmeasured: the landing isn't paired into `pairCast`.
