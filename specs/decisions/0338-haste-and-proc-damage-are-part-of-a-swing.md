# 0338: Haste and proc damage are part of a swing

## Status

Accepted

## Context

[ADR 0337](./0337-a-weapon-is-weighed-by-what-it-hits-for-in-its-hand.md) weighs weapons by
eqlwiki's melee model. It left out two things. Haste was out because it scales every weapon alike.
Procs counted only as a rate. Players asked for both: what haste is worth, and which proc hits
hardest, so the solver can chase it.

- [Haste Guide](https://eqlwiki.com/Haste_Guide):
  - hasted delay = delay ÷ (1 + haste), unrounded, never under 5 (marked unconfirmed)
  - only the best worn haste item counts; buff haste adds to it
  - the total is capped at 55% to level 30, then +1% a level to 75% at 50, then 100% from 51
    (the last is untested)
- [Weapon Procs](https://eqlwiki.com/Weapon_Procs): a few procs fire faster than the DEX rate
  (Spirit Strike ×1.5, Winter's Roar ×1.64, Chaotic Feedback ×1.75, Banish Undead ×1.54, Ward
  Summoned ×3.89).
- The spell catalogue already reads a best-effort damage off each spell's page
  ([ADR 0195](./0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)). On the real cache, 205 of
  217 weapon procs have a spell page, and 122 of those give a damage figure.

## Decision

**Haste scales the swing, and a proc's damage can count toward the swing.**

- **Swings are scored at your haste now.** That is your best worn item's haste plus a "Buff haste"
  you enter, up to your level's cap. The damage bonus stays at the weapon's own delay.
- **A haste item is worth the swings it adds.** That is the Swing weight × its haste × the unhasted
  swing of your current weapons. If you wield nothing, it uses the hardest-hitting in-era main-hand
  weapon you could wear. It counts only up to the cap your buffs leave room for. Each haste item is
  weighed as if it were your only one; two in one loadout overstate it, and the Damage section shows
  the haste that actually applies.
- **"Count proc damage" is a switch.** When it's on, a weapon's proc adds procs per minute in that
  hand × the proc's rate bonus × its spell's damage ÷ 60 to its swing. A proc only counts if it
  lands at once and its Target Type can hit anything. A damage-over-time page gives a per-tick
  figure, and a Banish Undead isn't damage against most mobs. These procs show as uncounted, not as
  zero.
- **The meanest procs are suggested.** The Damage section lists the hardest-hitting procs on gear you
  could wear, by what each would add in your main hand. Any of them can be socketed into a weapon's
  proc socket as a stone, so "+ want" adds it to Wanted effects, which already plans stones and
  carriers (ADR 0318).

## Consequences

- The Swing figure includes haste now, so it's bigger than under ADR 0337 by your haste. Rankings
  within a plan don't change.
- Proc damage is only as good as the spell page's figure, and the swing score's units are only
  roughly damage. Adding one to the other is a comparison, not a parse.
- Damage-over-time procs are uncounted. Totalling one needs its tick count, which the spell card
  gives as a duration and isn't read.
