# 0157: An instant spell is not a buff

## Status

Accepted

## Context

The board enrolled any **beneficial** spell that announced itself. A direct heal is beneficial and
announces itself, so `Light Healing` on a group-mate went "up" — and then never came down, because a
heal has no duration and there is no fade line to end it.

On a real month-long log that put 39 things in the catalogue that are not buffs and can never be:
every heal (`Light Healing`, `Healing`, `Minor Healing`, `Mend Bones`), every gate and port
(`Gate`, `North Ro Gate`, `Lesser Succor`, `Lesser Evacuate`, `Origin`), plus `Bind Affinity`,
`Cancel Magic`, `Feign Death`, `Convoke Shadow`. *Up now* held `Light Healing on Bunnyslayer` from
28 July onwards — a standing claim that somebody was still being healed.

The panel is meant to answer *what am I keeping up*. Half of it was a log of everything the player
had ever cast at anybody.

[ADR 0080](./0080-the-game-s-own-spell-file.md) declined to compute buff durations, correctly: the
file states a *formula*, applying it is server-side logic, and the caster level it needs is a level
the log will not state. But `PERMANENT_FORMULAS` had already established the narrow move — reading
the formula **id** and asking one yes/no question of it needs no arithmetic and no level.

The same trick answers the other end. Duration formula `0` means the spell has no duration at all.
Checked against a live install: 2,051 of the 7,076 obtainable beneficial spells are formula 0, and
**not one obtainable beneficial spell has formula 0 with a non-zero tick count** — so the formula
alone settles it, with no second field to keep in step.

## Decision

**A spell whose duration formula is `0` is instant, and an instant spell never gets a row.**

- `SpellFacts.instant` joins `permanent` as the second yes/no question asked of the formula id, and
  `INSTANT_FORMULA` sits beside `PERMANENT_FORMULAS` so the two ends of one idea are read together.
- The gate lives in `worthWatching` with the debuff rule
  ([ADR 0149](./0149-a-debuff-is-only-tracked-if-it-is-yours.md)) — one answer to "should this spell
  have a row", not two.
- It is asked on the **cast** path as well as the fade path, because that is the one place a row can
  be created with no fade to gate it, and it is where the heals were getting in.
- **No file, no gate.** Absent facts leave `instant` undefined and the spell is enrolled as before:
  an install we cannot read must not silently empty the panel.

## Consequences

The catalogue dropped from 139 rows to 100 on the measured log, and *Up now* from 79 to 50 — every
one of them something that had no way of ever ending.

**Some of the casualties look like buffs and are not.** `Feign Death` and `Shrink` are formula 0 and
carry a fade sentence; neither is a thing you keep up, and neither wants reminding about. The formula
is a better judge of "does this lapse" than the presence of flavour text is.

**A heal-over-time is untouched.** `Flowering Heal` is formula 7, `Snails Healing` formula 10,
`Echoing Light` formula 1 — all real durations, all still tracked. The line drawn is *has a
duration*, not *is a heal*.
