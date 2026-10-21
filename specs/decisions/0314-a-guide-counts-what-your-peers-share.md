# 0314: A guide counts what your peers share

## Status
Accepted

## Context
[ADR 0313](./0313-a-guide-step-knows-what-you-already-hold.md) crossed the tradeskill guides with
what you hold. It showed peers' shared holdings beside each material but deliberately never counted
them, reasoning that another person's bank is a favour to ask. The player's answer (2026-10-20): it
should use the data of peers who are sharing their bags and vault with you. Sharing is opt-in
([ADR 0309](./0309-an-inventory-is-shared-live-and-judged-by-the-receiver.md)), so a peer offering
an inventory has already said "these are on the table".

There was a second gap: inventory is a `live` share kind, and nothing fetches a live kind unprompted,
so peers' inventories only arrived after a click on the Peers tab. The guide usually had nothing to
count.

## Decision
Everything in ADR 0313 stands, except:

- **Peers' shared holdings count toward a suggested step.** Each alternative carries two figures:
  combines your own materials cover, and combines with sharing peers' added. They are ranked by the
  second, then the first, then how much of the list is in hand. A step only a peer can supply still
  qualifies. The panel always says whose materials a figure needs ("~8 combines (~40 with peers')",
  "Bone Chips ×643 + Bob 20").
- **A section's summary names what sharing peers hold** of its materials, beside what's in your own
  bags or bank.
- **A view that uses holdings asks for them.** While a guide is open, each peer offering an inventory
  is asked once per revision of theirs. Opening the guide is the person asking that ADR 0309 meant;
  the kind is still live, held in memory and dropped when they leave, and still only offered by peers
  who switched it on.

## Consequences
- A materials list split between your bank and a friend's reads as one plan, with the friend named, so
  asking them is the obvious next step.
- "Combines with peers" assumes they'll hand the materials over. The figure says it's theirs and
  never folds it into yours silently.
- Opening a guide costs one ask per sharing peer, and another only when their inventory changes.
- ADR 0313 is superseded by this record.
