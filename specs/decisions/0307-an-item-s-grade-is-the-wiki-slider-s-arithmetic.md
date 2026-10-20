# 0307: An item's grade is the wiki slider's arithmetic, ported

## Status

Accepted

## Context

EQL items merge from `+0` to `+10`, and a grade changes the numbers: a `+4` breastplate is not the
card the wiki prints. [ADR 0057](./0057-a-grade-is-not-an-identity.md) folded the grade away so a
`+2` drop finds its page — which leaves every graded item showing its `+0` stats.

eqlwiki knows the answer, two ways that don't quite agree:

- The [Item Upgrade System](https://eqlwiki.com/Item_Upgrade_System) guide describes it in prose:
  10% a tier, rounded down, a minimum +1 per tier, partial exp counting toward the next.
- Every item page carries a slider (the server extension `ext.itemLevelSlider`) that rescales the
  card live. Its rules are more specific — a stat of 10 or less gains a flat +1 per whole grade, a
  larger one 10% per *effective* grade rounded half-up; DMG +10% rounded down; Haste +1 a grade;
  weight shrinks logarithmically; Delay and Backstab never move.

They part on the guide's own example: AC 30, `+1` and halfway to `+2` — the prose says 34, the
slider says 35.

"Just ask the wiki" isn't available: the slider is client-side JavaScript with nothing behind it,
so there is no endpoint that returns a graded card. The page HTML always holds the `+0` numbers.

## Decision

Port the slider's arithmetic verbatim into `src/shared/items/item-upgrade.ts` — `gradedStats(stats,
grade, exp?)` over the sparse record `item-stats.ts` already reads — including its spreadsheet-style
rounding, so our `+N` matches what the item page shows at `+N`.

Where the slider and the guide prose disagree, **the slider wins**: it is what every player sees
on every item page, and it is the more specific of the two. Neither is the game itself; if a
measured in-game card ever disagrees, that measurement outranks both
([ADR 0025](./0025-observation-over-the-wiki.md)).

## Consequences

- A graded drop can be shown, compared and searched at its real numbers instead of `+0` ones.
- The port is a copy. If the wiki changes its slider, ours drifts silently until someone compares.
  The script as ported is kept verbatim at `fixtures/wiki/ext.itemLevelSlider.js` (fetched 2026-10-20
  from `load.php?modules=ext.itemLevelSlider`), so re-checking is a diff against a fresh fetch; the
  tests pin values computed by its functions. Run in jsdom against 89 live item pages chosen to cover
  every kind of card (armour, weapons, bows, ammo, instruments, containers, scrolls, potions, worn /
  click / proc / focus effects, penalties, unprefixed resists), the port agreed on every stat both
  read at ten points from +0 to +10.
- **What the slider deliberately leaves alone:** Delay; Backstab, Bane and elemental DMG; DMG Bonus;
  every effect (worn, click, proc, focus); instrument modifiers; container capacity and weight
  reduction; charges; a spell scroll's Mana Cost. A card's printed `SV. Void` does not grow either —
  instead the slider *adds* `SV VOID: +grade` to any item with two or more of STR/STA/AGI/DEX/WIS/INT/
  CHA and the five saves (HP, Mana and AC don't count). Slot plays no part anywhere.
- Stats the slider scales but `item-stats.ts` doesn't read (regen, endurance, ranged Range, SV Void)
  are not ported — there is nothing upstream to feed them. Adding one is a row in each module.
