# 0316: A held thing is named at its level, everywhere, through one path

## Status
Accepted

## Context
[ADR 0312](./0312-an-upgrade-level-is-shown-and-counted-at-its-level.md) made items and spells show
and count at the level their name states: `ItemLink` shows the card at a name's level,
`gradedItemStats` weighs it, and `gradedTitle` writes `Name +N`. A review on 2026-10-20 ("everywhere
an item is shown, its rank should be accounted for; this should be reusable; same for spells") found
the views built since then reading levels in several different ways:

- `(Exaltation)` was matched by two private regexes, `itemGrade(name) ?? 0` was repeated, and the
  two-hander test and `Name +N` builder were copied rather than shared.
- Some views dropped the level they had. The Exports tab's by-item totals linked the bare name, peer
  inventory rows carried no grade at all (0312's "peer shares still fold grades away"), and the Buffs
  tab showed a buff you cast at rank VI as plain, unranked text, though the tracker knew the rank.

## Decision
One reader and one writer each, used by every view:

- **Items.** `heldName(name)` (`items/held-name.ts`) reads a held name into its page title, its
  grade, and whether it's an exaltation stone. Inventory rows carry `grade` from it, and totals carry
  `bestGrade`. `gradedTitle(title, grade)` writes the name back. A view shows a held thing by passing
  that name to `ItemLink`, so the card is the copy's own.
- **Spells.** `rankedSpellTitle(spell, rank)` (beside `spellName`/`spellRank`) writes a spell at a
  rank. The damage meter and the Buffs tab both use it, and a buff row you cast carries the `rank` the
  cast named.
- **Peer inventory rows may carry the sender's best `grade`.** It's optional and clamped to 1…10, so
  an older peer's rows still read. "Who has it" links each item at the best grade anyone holds and
  names each holder's.
- **Weighing stays on `gradedItemStats`** (Items tab, best in slot), as 0312 set out.

A wiki name with no level (a drop table, a recipe ingredient, a quest reward) is shown as written:
it *is* the `+0` thing.

## Consequences
- A new view that shows a held item or a ranked spell gets the level right by using these four
  functions; nothing else in the code reads or writes a level.
- "Peer inventory shares still fold grades away" in ADR 0312 no longer holds; this record replaces
  that consequence.
- A buff someone else cast on you shows no rank, since only your own casts name one.
