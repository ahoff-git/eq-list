# 0321: Find answers from one box

## Status
Accepted

## Context
[ADR 0320](./0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md) grouped Search, Items, Spells,
Stances and AAs into the Find area, but each section kept its own search box. A lookup still meant
choosing a section first. Asking "do I have one of these?" meant Character → Inventory & exports, and
asking what an AA or a stance does meant its own section.

Search's name box already found wiki pages (items, spells, NPCs, quests, zones), items seen only in
your log, and Lucy's. That left three things with no page to find:

- what you hold, from your inventory export;
- stances and invocations;
- AAs.

## Decision
**Search's name box also answers from those three**, as groups under the wiki's results
(`findAcross` in `src/shared/find/find-across.ts`, drawn by `FindAcross`):

- **In your inventory**: each held item that matches, linked at your best grade (`gradedTitle`), with
  its count and where it is.
- **Stances & invocations** and **AAs**: each match with its effect inline. They have no page, so the
  row is the answer and needs no further click.

- Each group matches **the way its own section does** (`filterAbilities`, `filterAA`: literal words,
  in the name or the description), so the box and the section can't disagree. A name match sorts ahead
  of a description-only one.
- At most five per group are shown. The group's heading opens the section that has the whole list,
  and says how many more are there.
- The groups follow the wiki search's debounced query, so they appear as the wiki's results do.

**The sections stay.** Items keeps its slot, class and stat filters and Best in slot. Spells keeps
class and level browsing, and Stances and AAs keep browsing by class. These are ways of *narrowing*,
not of *naming*, and the box is for naming.

## Consequences
- A name typed once finds the page, your copy, the stance or the AA. A lookup no longer starts by
  picking a section, and Ctrl+K's "look up" (ADR 0320) reaches all of it.
- Finding by shape ("a FINGER item with STR") is still a section of its own. Whether those filters
  could appear under the box when you pick "items" is left open.
- The inventory group reads the same dump the exports view does (`useInventory`), so with no export
  it is simply absent.
