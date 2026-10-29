# 0348: A mob card is scaled by difficulty, on the wiki's tiers and an unmeasured multiplier

## Status
Accepted

## Context
A mob page's card states `HP:` and `Damage per hit:` from the wiki. Those are one reading, but EQL
scales enemy health by difficulty (D0–D4) and by the kind of instance (public, personal, raid; solo
or group), on two tables, one for single-class mobs and one for multi-class ones
([Difficulty Level](https://eqlwiki.com/Difficulty_Level)). So the card is only right where it was
read, and a D3 player reading it is reading someone else's fight.

The wiki's tables are **relative only**: `Reduced --` … `Increased +++++`, with the explicit warning
that they don't translate to percentages and that the developers keep adjusting them. A rough
"Adaptive Scaling Matrix" (100/130/170/220/300% for D0–D4) was noted alongside the request, with no
source. Nothing in the app measures a mob's health.

## Decision
**A mob page gets a difficulty slider** (`mob/DifficultySlider.tsx`): D0–D4, instance type, and a
multi-class checkbox, since the card never says whether a mob is multi-class. The setting persists
across pages (`eqlist.main.mobDifficulty`). The card's `HP:` and every `Damage per …` figure are
scaled by `mobLinesAtDifficulty` (`src/shared/mob/difficulty-scaling.ts`). The scaled numbers are
picked out the way the item grade slider picks them out, with the wiki's figure on hover.

The scaling is two tables, kept apart because they are different kinds of claim:

- **`HEALTH_STEPS`** transcribes the wiki's table as steps from baseline (−2 … +5), `null` where it
  says N/A.
- **`STEP_MULTIPLIER`** turns a step into a number. Steps 0–4 are the matrix above; the reduced
  steps are its inverses; +5 continues its last ratio. **Nothing measured these.**

A figure is **generalised, then scaled**: divided by the multiplier where it was read, multiplied by
the one asked for. The wiki's figure is taken to have been read in a public zone at D0
(`WIKI_STATED`). Damage is scaled like health, as the matrix does, though the wiki's tables speak
only of health. A combination the wiki calls N/A shows the card as read, and says so.

## Consequences
- A player can see roughly what a mob will take at their difficulty, and the note under the slider
  says the multiplier is an estimate every time it isn't 1.
- The multipliers can be replaced by a derived or measured formula in one place. The obvious
  measurement is the app's own: damage dealt to kill a mob at a known difficulty is a lower bound on
  its health there, the same shape as `hp-estimate.ts`'s bounds on yours.
- Not modelled: health scaling with party size in a multiplayer raid instance, and where the wiki's
  own figure was actually read. Both are in `decisions/README.md` `## Open Questions`.
