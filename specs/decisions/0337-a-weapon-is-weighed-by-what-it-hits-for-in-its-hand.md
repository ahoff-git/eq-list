# 0337: A weapon is weighed by what it hits for, in its hand

## Status

Accepted

## Context

The loadout builder weighed a weapon by its card: DMG, delay and ratio, each times a weight, the same
in either hand. That isn't how a weapon does damage. The main hand gets a damage bonus and double and
triple attack. The off hand swings only when dual wield succeeds, gets no bonus, and never triple
attacks. A two-hander gets a bigger bonus but gives up the off hand. Players had no way to ask "what
does the most damage" or "which weapons and stats should I chase".

eqlwiki has working models, fitted to Legends parses but not confirmed by the developers:

- [Skill Dual Wield](https://eqlwiki.com/Skill_Dual_Wield#Working_Legends_Damage_Bonus_Model):
  - damage bonus = hand (0.8 one-handed, 1.1 two-handed) × max(level, DMG) × min(delay, 50)/40 × level/100
  - dual wield chance = skill/400, ×1.32 with Ambidexterity
  - double attack chance = (level + skill)/500
  - triple attack chance = skill/(skill + 800), checked only after a double attack, in the main hand only
  - Burst of Power flurry: 7/11/15% chance of one or two more attacks
  - modelled skill caps by class and level
  - main-hand score = (2×DMG + bonus)/delay × rounds; off-hand score = dual wield × 2×DMG/delay × (1 + double attack)
- [Weapon Procs](https://eqlwiki.com/Weapon_Procs): DEX/170 + 0.5 procs a minute in the main hand,
  half in the off hand, DEX counting to 255. Delay doesn't change it. The page sources this from
  Live, not from an EQL measurement.
- [Spellblade](https://eqlwiki.com/Spellblade): procs a spell gem more often with more max mana and a
  cheaper spell. It gives no figures.

The model leaves out STR, ATK, Offense, hit rate, crits and mitigation. It leaves out haste because
haste scales every weapon alike.

## Decision

**With a Swing or Procs weight set, a weapon's value in a hand is its worn stats plus what the model
says it does there.** The model is in `melee.ts`. `damage-plan.ts` connects it to the planner.

- **The model replaces the card's swing weights in the hands; it doesn't add to them.** A candidate
  carries a value per hand (`handValue`), and `valueIn` reads it for PRIMARY and SECONDARY. The
  solver is already exact per slot, so dual wield against a two-hander is settled by the assignment.
- **Skills are taken at the wiki calculator's defaults.** That means trained to the modelled cap for
  the ticked classes at the level cap. A trio uses the best cap among its classes, never a sum. The
  player sets the two AAs the dump can't show: Ambidexterity and Burst of Power's rank.
- **The Procs weight values a weapon that procs** at its hand's procs a minute, at the character's
  DEX: race and classes (one ticked race, else 75) plus what's worn. Below 255 it also adds
  weight ÷ 170 to DEX, the main hand's rate. That assumes the main hand procs, which is what asking for
  procs means.
- **The weights are builder settings in `BisOptions.melee`,** so presets carry them and Reset leaves
  them alone. With only melee weights set, the builder still plans.
- **The Damage section explains the result.** It shows the chances, the weapons worn now and in the
  loadout, the most damage the pool could swing as a one-handed pair and as a two-hander, the DEX
  still to gain before 255, and what haste does. Spellblade is named for its classes but not counted.

## Consequences

- With no melee weight set, nothing changes. Weapons are still weighed by the sheet.
- The figures compare weapons. They aren't a parse, and each one is only as good as the wiki's model.
  When the wiki revises a constant, change it in `melee.ts`. Each constant there is named.
- Combat skills aren't read from the log yet. `skill-progress.ts` drops `You have become better at
  Dual Wield! (N)` because it keeps tradeskills only. Reading combat skills there would replace the
  assumed caps for a character still levelling.
- STR and ATK still count only through whatever weights the sheet gives them.
