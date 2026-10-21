# 0322: A race-unlock step knows what you hold, and the list takes a typed count

## Status
Accepted

## Context
The Race Unlocks guide ([ADR 0222](./0222-a-race-unlock-guide-is-generated-static-data.md)) is prose
steps: "Give 800 [[Phosphorous Powder]] to [[Zok Zribb]]", "Do [[Tumpy Tonics]] 400 times". The
tradeskill guides already cross their materials with your inventory dump and your sharing peers'
([ADR 0314](./0314-a-guide-counts-what-your-peers-share.md)). The race guide didn't, so a player with
746 powder in the Tradeskill Depot read "800" and had to work out the gap. The ask (2026-10-21): show
what you hold against each turn-in, make the rest one press onto the shopping list, and let the list
take a typed quantity instead of a thousand presses of +.

## Decision
- **Two step shapes name a count**, and only those get a holdings line (`step-needs.ts`): a number
  directly before a link is that many of the item, and "N times" after a step's first link repeats it
  as a quest. A quest's materials are its page's own turn-ins times N, so the page decides whether the
  link was a quest. "Kill 400 Kobolds" or "trade … until amiable" names nothing you could hold, and
  gets no line. A step that means only part of a quest ("the first step of …") says its totals are the
  whole quest's.
- **Each material reads "have 746 of 800"**, green when covered and amber when only partly covered,
  with sharing peers named after it. With no dump taken it reads "×800", never "have 0". Opening a race
  asks sharing peers for their inventories, as an open tradeskill guide does. Quest pages are read
  only for an expanded race.
- **"+ List" puts the step on the shopping list at the step's quantities, starting at what you
  hold.** An item step is a standalone entry; a quest step is the quest's own group, set to run N times,
  the same group the quest page's "+ Add" makes. It raises the quantity rather than adding to it, so a
  second press can't ask for 1,600. Each entry's `obtained` is raised to your holdings and never
  lowered, since loot counted since the dump is newer (`held-seed.ts`). A step you already cover shows
  "✓ in hand" instead.
- **On the shopping list, the have count, the need count and a group's runs can be typed in.** Click
  the figure and type it (`AskValue`). The +/− buttons stay for one at a time. With runs set, the need
  box asks for one run's figure, since that's what's stored and scaled.

## Consequences
- The Froglok step reads "Phosphorous Powder have 746 of 800 · + List", and the press leaves
  "746 of 800" on the List tab.
- The figures are as fresh as the dump, the same limit as everywhere else the dump is used. After
  seeding, `obtained` counts loot on top of what was held at the dump.
- A quest's turn-ins are the wiki's. Where its components table lists intermediate items as well
  (Tumpy Tonics lists the tonics and what they're made from), the totals carry both, as the quest
  page's own "+ Add" already does.
- Peers' holdings are shown but not seeded into `obtained`: they're theirs to hand over, and the list
  counts what you have.
