# 0342: A loadout can be planned for anyone sharing their inventory

## Status

Accepted

## Context

The player asked (2026-10-27) for the loadout planner to list everyone sharing their inventory, and
for picking one to show what that person would see: their loadout, played with, and suggestions from
their bank. The inventory share ([ADR 0309](./0309-an-inventory-is-shared-live-and-judged-by-the-receiver.md))
was built for "who has this material", so a row is one item's total with its best grade and places.
That loses what a loadout needs: which worn slot each copy is in (two rings both say `Fingers`), each
copy's own grade (merges and "wearing now" read them), and what's in each copy's sockets.

The planner ([ADR 0329](./0329-the-loadout-is-one-plan-of-what-you-hold-and-what-to-hunt.md)) takes
the parsed dump's items. A peer's weights and Class picks are not shared anywhere.

## Decision

**The loadout builder has a "Loadout for" picker: you, or anyone offering their inventory. Picking a
person plans from what they hold, with the same page.**

- **A row tells gear apart.** The `inventory` row gains an optional `gear`: one entry per copy that
  is worn (with its slot), graded, or socketed (with its stones). Plain +0 stock stays a total, so a
  stack of materials costs nothing more. The field is optional both ways: an older peer's rows still
  read, and an older receiver ignores it.
- **The receiver rebuilds the dump** (`peerInventoryItems`): one item per told-apart copy, and the rest
  of each place's count as +0 stock. Rows from an older peer are guessed: a copy in each worn slot the
  row names, and the best grade on the first copy.
- **Their plan is theirs.** Locks, wanted effects and exclusions are kept per person by name, apart
  from yours. A person's plan starts from your settings (hunting, hunt grade, melee weights) with none
  of your changes.
- **Only what they hold.** Their plan never draws on your inventory or anyone else's: gear binds to
  whoever holds it, so it can't be handed over. The feature is for looking at a friend's gear and
  suggesting what to wear, merge or hunt, not for pooling.
- **Weighed by your sheet.** The page says so, and asks for their classes to be ticked. Sharing a
  person's weights is not part of this.
- The peers are asked for their inventories only while the builder is open, the same way an open
  guide asks ([ADR 0314](./0314-a-guide-counts-what-your-peers-share.md)).

## Consequences

- Sharing an inventory now also tells peers what you wear, the grade of each graded copy, and the
  stones in socketed gear. Socketed stones were left out of 0309's rows as spares. They still are:
  they appear only as part of their host's `gear`.
- A plan for someone is only as fresh as their last dump, and as faithful as their app's version.
- What their plan suggests (merges, sockets, upgrades to hunt) is the same advice they would see,
  under your weights. "Copy loadout" is how it gets back to them.
