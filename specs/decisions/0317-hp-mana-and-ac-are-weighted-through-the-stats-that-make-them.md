# 0317: HP, mana and AC are weighted through the stats that make them

## Status
Accepted

## Context
The weight sheet ([ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md)) scored
each printed stat on its own. But HP, mana and AC are secondary: STA raises HP, INT or WIS raises
mana (depending on class), and AGI raises AC. A player who weights Mana to find their best mana gear
was shown only items that print `MANA:`, and a +10 INT ring (over a hundred mana for a level-50
wizard) scored nothing. The ask (2026-10-20) was to fold the formulas into the weights, for the
character's three classes, in both item search and best in slot
([ADR 0310](./0310-best-in-slot-is-an-exact-assignment-by-your-weights.md)).

EQL publishes no formulas. What can be checked:

- **STA → HP:** EQEmu's `level × GetClassLevelFactor / 3000` reproduces every row of eqlwiki's
  level-50 and level-60 per-class charts (Game Mechanics, "Hitpoint Calculation").
- **INT/WIS → mana:** EQEmu's `CalcBaseMana` (the SoF-era version) gives 11.25 mana per point at
  level 50 in the 101–200 band, which EQL players measured, and 22.5 with two pools on one stat
  (eqltools.com, `gear-score.js` comments). eqlwiki's "11.27 at level 60" fits the older formula
  and is inherited text, so it was not used.
- **Three classes:** a trio's HP and mana are the sum of its **best two** class pools (eqltools.com
  "The trio system"). This is player consensus, not a developer statement.
- **AGI → AC:** eqlwiki's only figure is 9 AGI above 75 giving 3 AC. eqltools models it differently.
  Nothing settles it.

## Decision
- `src/shared/items/derived-stats.ts` computes, for the ticked classes at a level, what one point of
  STA, INT, WIS and AGI is worth in HP, mana and AC. It then **folds** those into the sheet:
  `weight[INT] += weight[Mana] × mana per INT`. Nothing derived is added unless its secondary stat
  is weighted.
- The Items tab folds the sheet **once** and gives the same folded sheet to Search and Best in slot.
  The scorer itself is unchanged.
- **Classes** are the Class picker (already "who you are" for best in slot). **Level** is the level
  cap slider, defaulting to 60.
- The character's own stat totals are unknown, so the rates are the 101–200 band's. The 255 STA
  halving and the 200 INT/WIS knee are not applied.
- The weight sheet says what was folded ("1 INT = 11.25 Mana (Wizard)"), so an INT-only ring
  scoring under a Mana-only sheet explains itself.

## Consequences
- "Max my mana" works by weighting Mana alone. For a melee trio, INT and WIS correctly stay at zero.
- Rates follow the level cap. A player who leaves it uncapped is scored at 60.
- AGI → AC (⅓ per point) is the weakest rate. If EQL measurements disagree, it is one constant to
  change.
- With a character's stat totals (race + classes + worn gear, which the inventory dump nearly
  gives), the past-255 and past-200 bands could be applied per character. Not done yet.
