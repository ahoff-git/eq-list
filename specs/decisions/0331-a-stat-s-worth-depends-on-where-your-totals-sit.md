# 0331: A stat's worth depends on where your totals sit

## Status

Accepted

## Context

[ADR 0317](./0317-hp-mana-and-ac-are-weighted-through-the-stats-that-make-them.md) folds HP, mana and
AC weights into STA, INT/WIS and AGI at one rate per stat. It noted that the character's own totals
weren't known, so it used the rates of a character between 100 and 200. eqlwiki's
[Statistics](https://eqlwiki.com/Statistics) page supplies what was missing:

- **Base attributes by race**, and **modifiers by class**.
- **AGI around 75.** Above it AC per point is minor. Below it the loss is large: 66→75 AGI gave
  45 AC, so 5 a point against ⅓.
- **A soft cap of 200 on INT and WIS, and a hard cap of 510 on every attribute.**
- **About 11.27 mana per INT/WIS at level 60, under 200.**

The last point contradicts the EQEmu formula ADR 0317 took the level term from: that gives 15 at 60,
where EQL players also measured about 11.25 at 50 (eqltools).

## Decision

**The rates are taken where the character's totals actually sit.**

- **The character's totals:** race base plus every ticked class's modifiers (a trio carries all
  three; the page says "your chosen class(es)"), plus what the newest dump says is worn. The race is
  the one ticked in the Race picker, as the Class picker already says who you are. With no single
  race ticked, the mid-band rates stand as before.
- **Each conversion is a curve:**
  - STA → HP is linear to 510.
  - INT/WIS → mana: 1:1 to 100, 2.5× to 200, half that past it, nothing past 510.
  - AGI → AC: 5 a point below 75, ⅓ above, nothing past 510.

  Scoring folds weights at the curve's slope where you stand now. The Stats totals convert exactly
  across bands: what gear adds is the curve with it minus the curve without.
- **Mana per point stops growing at level 50.** That holds both measurements (≈11.25 at 50 and 60).

## Consequences

- On a real dump (Wizard/Shaman/Enchanter wearing +157 INT), every race lands past the INT soft cap,
  so an INT point is worth 11.25 mana, not the 22.5 assumed before. Ticking a race halves what the
  planner pays for INT, and the loadout shifts accordingly.
- A low-AGI race (Dwarf, Erudite, Ogre start at 70) sees the first few AGI points valued at 5 AC
  each.
- Still unmodelled: the 255 STA knee (not on the page), AC soft caps ("caps are changed in EQL"),
  resists' 6 points per 1%, and the extended weapon ratio. Each is its own change if wanted.
