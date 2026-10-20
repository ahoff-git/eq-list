# 0312: An upgrade level is shown and counted at its level

## Status

Accepted

## Context

Items merge `+0`…`+10` and spells (songs included) level 0…X, and the name you hold says which:
`Dragoon Dirk +2` in a loot line or an inventory dump, `You begin casting Shock of Lightning VI` in
a cast. Everything the app showed or counted for those was the level-0 version: every hover card,
every page, the damage meter's mana price, and the ceiling a buff or debuff timer counts down
([ADR 0290](./0290-a-debuff-s-duration-can-be-typed.md) noted that ceiling "reads short for every rank
above I").

[ADR 0307](./0307-an-item-s-grade-is-the-wiki-slider-s-arithmetic.md) ported eqlwiki's item slider.
The wiki has a second one, `ext.spellLevelSlider` (kept at `fixtures/wiki/ext.spellLevelSlider.js`):
per spell category, a straight percentage per level on cast time, mana and duration (config
`wgSpellLevelSliderRules`), +1 per level on "up to level N" caps, +1 pet level, and **no change to
damage or heal amounts**. It labels itself experimental. The game's `spells_us.txt` has no row for a
spell at a level — the server applies it — so nothing on disk contradicts or confirms it, and the
log can't either (spell haste swamps a 2–4% step; the one twisting bard measured, weakly, against it).

Two things the earlier lookup got wrong surfaced on the way. `spells.find(spell, rank)` took a row
named `<spell> <rank>` as the answer, but for **56 castable families** that row is a stranger sharing
the name (`Guard VI` is a 0-mana NPC spell). And AA ranks (`Harm Touch III`) *are* real rows.

The wiki picks a spell's category by regexes over page prose, which misfiles a fair share of bard
songs (a resist psalm as a DoT, a damage-shield rondo as a nuke). The game files every spell in its own
spellbook ([ADR 0306](./0306-a-spell-s-kind-is-the-game-s-own-spellbook-category.md)).

## Decision

Show and count everything at the level its name states, by the wiki's arithmetic:

- **Items** — `gradedCardLines` rewrites a card's lines the way the item slider does, including the
  labels `item-stats.ts` doesn't read (Endurance, regen, Range) and the slider's invented
  `SV VOID: +grade` line. Checked against the slider itself on 89 live pages × 10 grade points.
- **Spells and songs** — `spell-upgrade.ts` ports the spell slider's rules and arithmetic. The rule is
  chosen by the **game's spellbook category** when we have it (served on a spell page as
  `spellCategory`), and by the wiki's own classifier, ported, when we don't (the web build). Checked
  against the slider on 169 live spell pages: every category and every Mana / Casting Time / Duration
  agreed. One deliberate fix: a summon line's pet level rises once, as it does on the wiki's real
  pages, not twice as its two patterns would over a whole line.
- **A ranked row is the answer only when it is the spell** — the base isn't a castable spell (an
  AA), or the ranked row is castable in the same spellbook category (a classic sequel such as
  `Burnout II`). Otherwise `find` returns the base row levelled, so the damage meter's price and the
  buff tracker's ceiling are both the level's.
- **The buff tracker remembers the rank you last cast** each spell at, because landings and fades
  name it bare; otherwise the next fade would re-assert the level-0 ceiling.
- **What is searched and weighed is what is shown.** The Items tab scores a thing you hold at your
  best held grade (its name shows the `+N`); best-in-slot weighs every copy at its grade and a
  merge at its grade *and* its leftover exp, which already lifts the bigger stats — so a merge that
  stays at the same grade can still pay. Both go through `gradedItemStats`; pages and hovers go through
  `gradedCardLines`; a test pins the two to the same numbers, and across all 9,358 cached cards at seven
  grade points they agree everywhere but one vendor-price line `item-stats.ts` misreads (todo). The one
  place we part from the wiki's slider to get there: a weapon that writes `Base Dmg:` grows like `DMG:`.
  Lucy's card for an item the wiki lacks is shown at the opened copy's grade too.
- **Every page that levels gets a slider** (`UpgradeSlider`), starting at the level of the copy you
  opened. Hovering a name that states a level shows the card at that level; the inventory dump and
  the damage meter's spell names now link by the held name.

## Consequences

- A `+4` drop, a rank-VI nuke's cost and a rank-V mez's countdown are the level's, not level 0's. A
  typed duration still outranks the ceiling, and a learned one still outranks both.
- The spell numbers are only as right as an experimental wiki feature. If it changes, re-fetch
  `load.php?modules=ext.spellLevelSlider` and the page config and diff against the fixture.
- Song durations scale into fractional ticks (`3.3 ticks`), as the wiki prints them; the game
  surely rounds, and how is unknown. A countdown ceiling is rounded to the second.
- Peer inventory shares still fold grades away (ADR 0309); only your own dump keeps them.
- Closes the open question on spell levels and the rank-lookup bug in `todo.md`.
