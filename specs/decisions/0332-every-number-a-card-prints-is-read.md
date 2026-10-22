# 0332: Every number a card prints is read

## Status

Accepted

## Context

[ADR 0307](./0307-an-item-s-grade-is-the-wiki-slider-s-arithmetic.md) ported the item slider over the
stats the reader knew. It left out regen, Endurance, a bow's Range and SV Void, because "there is
nothing upstream to feed them". Players do want them: a Talisman of Kejaar Kerrath is nothing but
HP, Mana and End Regen, so it couldn't be searched for, weighed or totalled. An audit of all 9,308
cached item cards found what else the reader skipped:

| Missing | Cards |
|---|---|
| Ranged Range | 104 |
| Damage bonus (`DMG Bonus:`, `Dmg Bon:`) | 56 |
| Endurance | 50 |
| Instrument modifiers (Wind/String/Percussion/Brass) | 28 |
| Resist spellings (`SV.Fire`, `SV. Void`, bare `MR:`) | 6 |
| Elemental damage (`Cold DMG: 3`, `Poison DMG: 1`) | 5 |
| Effect with no label (`Grim Aura (Worn)`, in no picker) | 1 |

## Decision

**The reader reads all of them, and grades each as the slider does.**

- **New stats:** HP/Mana/End Regen (their own Regeneration group), Endurance, SV Void, DMG Bonus,
  Range, the four instrument modifiers (an Instruments group), and a stat per element of damage
  (Cold, Fire, Poison, Disease, Magic DMG).
- **Labels match leniently.** A two-word label matches across any spaces or dots, in both the reader
  and the card grader, and bare `MR/FR/CR/DR/PR` are the saves.
- **An effect line without a label** is recognised by its parenthetical (`(Worn)`, `(Combat …)`,
  `(Must Equip …)`, `(Click …)`).
- **Grading follows the slider.**
  - Regen grows +1 per grade (a +9 Talisman is 11/11/11).
  - Endurance grows like the attributes.
  - Range grows +10 per grade.
  - DMG Bonus, elemental damage and instrument modifiers don't grow.
  - SV Void follows the slider's own invention: two or more attribute or save stats earn
    `SV VOID: +grade`, and a printed SV Void stays as printed.
- **Loadout totals** include the new pools, regen and saves, but not instrument modifiers or a
  weapon's bonus or elemental damage. The instrument or weapon in hand is the one that counts.

## Consequences

- Searched and weighed numbers still equal the graded card's, now with every new stat: 65,156 grade
  points across the catalogue, no disagreement.
- The packed catalogue's signature moves to `rows12`, so every install rebuilds its pack. The shipped
  snapshot's pack picks the stats up at its next refresh.
- `Cold DMG: 3` no longer passes for the weapon's own DMG. Blessed Guardian Arrows used to read as
  DMG 4 arrows.
