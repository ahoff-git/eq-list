# 0360: Endurance follows stamina, at one measured rate

## Status

Accepted

## Context

HP, mana and AC are partly made of attributes, so weighting or asking for them counts those attributes too
([ADR 0317](./0317-hp-mana-and-ac-are-weighted-through-the-stats-that-make-them.md),
[0331](./0331-a-stat-s-worth-depends-on-where-your-totals-sit.md)). Endurance wasn't: only the END printed on
an item counted, and [ADR 0359](./0359-a-floor-can-be-enough-and-the-rest-is-maximised.md) left it out of
*Everything else*. The player (2026-11-06) asked for it to be handled like mana and HP, and recalled that
stamina gives some.

What the sources say:

- eqlwiki's [Statistics](https://eqlwiki.com/Statistics) lists **STA** and **STR** as feeding endurance, with no
  rate, cap, band, or class or level term (the page also carries a notice calling itself "exceptionally
  unreliable"). Game Mechanics does not mention endurance.
- eqltools.com's Attributes and Combat pages give no endurance number; the Attributes page says the pool
  formula is unpublished.
- eqltools-companion's `gear-score.js` comments say the client's own inventory tooltip credits STA to endurance,
  that "no pool formula for endurance has been published or measured", and quote one player measurement:
  **16 STA bought 38 endurance on a level-50 melee trio** (theory-crafting, 2026-08-26). It leaves the
  conversion unmodelled and values endurance at a flat guess.

So there is exactly one number, 2.375 endurance per STA.

## Decision

**STA buys endurance at 38/16 a point**, as one more derived rate (`derivedRates`), through the same fold and the
same effective totals as HP and mana: weighting or setting a goal on endurance now weights STA, and the Stats
section, goal floors and the planner count the endurance STA gives.

- It is **flat**: no class term, no level term, no bands, linear to the 510 attribute cap. One measurement
  cannot say otherwise, and nothing says it should vary. It is offered with no class ticked, like AGI → AC.
- **STR is not modelled.** eqlwiki lists it; nobody has put a number on it.
- **Endurance joins *Everything else*** (`SURVIVAL`), for every class: it is what melee classes run out of, and
  a share spent on it by a caster is small.
- The rate lives in one constant (`END_PER_STA`) with its source beside it, so a better measurement is one edit.

## Consequences

- On the real catalogue a Warrior's HP-first loadout now reports 852 endurance from 358 STA and no printed END,
  and an endurance goal reaches 1,109 (300 printed + 340 STA × 2.38). Printed END is now the smaller part of
  most endurance totals, which is why the single measurement matters: a wrong rate moves endurance goals and
  the value of STA on any sheet that weights endurance. It moves nothing for a sheet or goals that never mention
  endurance, except through *Everything else*.
- Items that print END are unaffected; their number is read as before.
- The measurement is another player's, at level 50 on a melee trio, taken from a code comment rather than a
  page. It is recorded as open evidence in `specs/todo.md` rather than treated as settled.
