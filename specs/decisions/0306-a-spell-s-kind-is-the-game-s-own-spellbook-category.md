# 0306: A spell's kind is the game's own spellbook category

## Status

Accepted

## Context

The Spells tab's text box matched names only, so "which spells charm?" had no answer short of
knowing every charm's name. The wiki's card text is no better as a classifier: Solon's Song of the
Sirens says "charms the target", Cajoling Whispers says "allowing you to control them", and a
search for either word misses the other. Grouping by hand-written keyword rules ("Crowd Control"
= mez + charm + root…) would be a taxonomy we invented and would have to keep right.

The game has already filed every spell. Each row of `spells_us.txt` carries a spellbook
**category** and **subcategory** at columns 87 and 88, ids into the client's string table
`dbstr_us.txt` (type 5). They are the headings the in-game spellbook groups by:
`Direct Damage › Fire`, `Heals › Quick Heal`, `Utility Detrimental › Charm`,
`Utility Detrimental › Enthrall` (mez). Checked against a live install: every bard, enchanter, druid
and necromancer charm is `› Charm`, every mez `› Enthrall`.

[ADR 0080](./0080-the-game-s-own-spell-file.md) reads columns ≤ 51 only. Its reason is that EQL
inserts columns by patch, at index 103 and later, and **columns 0–102 have never moved**. Columns
87 and 88 sit inside that stable range.

## Decision

ADR 0080's column bound widens from ≤ 51 to **below 103**, on 0080's own grounds. Everything else
it rules (scalars only, no formulas applied) stands.

A spell's kind is its spellbook category, read from the player's install
(`spell-categories.ts`, `electron/spells.ts`) and joined onto each Spells-tab row in main. The tab
filters by it (a bare category takes everything under it, a `Category › Subcategory` only that),
sorts by it to group the list, and shows it as a column.

A separate "search all text" toggle matches the typed words against the whole card (description and
effect lines) and the category label, not only the name.

A wiki title that misses the file as written is matched again with apostrophes and backticks folded
and the wiki's `(Spell)` disambiguation dropped, since the file writes `Al`Kabor's` where the wiki
writes `Al'Kabor's`.

This does not revisit [ADR 0195](./0195-a-spell-catalog-trusts-the-wikis-own-numbers.md): that
refused the file's *formulas* for damage. A category is a filing, not a formula, and needs no
server-side arithmetic to read.

## Consequences

- "Show me every charm" is one tick, across classes, whatever the spell is called.
- With no game install there are no categories. The picker and column are simply empty, and the
  text search still works over the card.
- Some cached player spells (EQL-only ports, gates, renamed songs) have no row in the file under the
  wiki's name and stay uncategorised: 74 of 1,462 on the install it was checked against.
- There is no "Crowd Control" heading, because the game has none. Mez, charm, root, fear and calm all
  sit under `Utility Detrimental`, which is the closest published grouping.
