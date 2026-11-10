# 0387: Rows that want the same item share what you hold

## Status

Accepted

## Context

The same item can sit under several headings of the shopping list: 3 Bone Chips for one quest, 5 for a recipe,
2 for another quest. Together they ask for **10**. Two things counted the same chips more than once:

- **What you hold.** [ADR 0382](./0382-the-shopping-list-counts-what-you-hold.md) gave each row "the larger of its own
  tally and the inventory's" — per row, against the whole pile. Holding 5 chips was 5 for every row, and all three
  ticked.
- **What you loot.** `applyLoot` added a looted stack's full quantity to **every** matching row, so 5 chips looted
  with those three rows on the list made each of them 5.

Either way the list said it was done with 10 chips' worth of work when 5 chips existed.

## Decision

- **What you hold is one pile.** `countedEntries` groups item rows by `normalizeItemName` (so a grade and a case
  meet) and, for a group of two or more with a counted pile, hands the pile out with `shareHeld`:
  1. each row keeps what it already counts — its own tally, or the typed figure — and that comes **out of the pile
     first**, since those are chips it has;
  2. what is left goes to the rows in list order, each up to what it still lacks (its need with the group's runs
     applied, `effectiveNeeded`);
  3. a pile bigger than every need goes to the first row, so a row still shows what you hold, as one row always has.
  A typed figure takes from the pile and is never topped up from it — it is the player's word for that row.
- **A looted stack is split the same way.** `creditLoot` splits a stack across the matching rows with
  `splitAcross`: in list order, each up to what it lacks, any surplus to the first row. `applyLoot` stays, returning
  the rows credited; a row that got nothing is not among them.
- **Alerts speak for the part a row got.** Each loot banner is raised with the row's credit as its quantity, so the
  banner and the row cannot disagree; the peers' celebration is announced **once per drop**, not once per row.
- **A row says it shares.** The 🎒 note reads `3 of 5 held · need 0 more` (its part of the pile), and its hover
  says how many other rows want the item and how the pile was handed out.
- **One row is unchanged.** With a single row both rules reduce to what they were: the larger of tally and pile,
  and the whole stack.

## Consequences

- Holding 5 against 3 + 5 + 2 fills the first row and half the second; the third shows 0 of 2. The Hunt tab, the map
  and a group's tally read the same figures, so they agree.
- **Priority is list order.** The first row gets chips first. A player who wants a different row filled types its
  figure.
- **It errs low where it must guess.** A row's tally counts against the pile even if the chips were later handed in
  (the log can't say), so a row after a completed quest can be shown short while you hold enough. A wrong tick is
  worse than a missing one ([ADR 0382](./0382-the-shopping-list-counts-what-you-hold.md)); typing the figure on the row
  fixes it, and the note says how the pile was divided.
- A list already saved keeps what it has: rows that were each credited a whole stack stay as they are. Only new loot
  is split.
- A loot line that fills several rows raises one banner per row that got a share, as it did one per row before.
