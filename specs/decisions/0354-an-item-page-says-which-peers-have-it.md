# 0354: An item page says which peers have it

## Status
Accepted

## Context
An item page says how many you hold ([ADR 0350](./0350-an-item-page-says-how-many-you-have.md)). What
peers who share their inventory hold was only in two places: the Peers tab's "Who has it" search
([ADR 0309](./0309-an-inventory-is-shared-live-and-judged-by-the-receiver.md)), and an item's hover
card, which only knows rows some other view already asked for. The ask (2026-11-03): searching for an
item should show each sharing peer's count beside your own, as in "BunnySlayer has 8 Rubies and I
have 6".

## Decision
**An item page (or a recipe's crafted item) shows a peers line under your own count**
(`PeersHoldOnPage`): `Peers: BunnySlayer 8 · Ann 3 (best +3)`.

- One entry per peer, a peer's grades folded together, most first. Hovering a name gives that
  peer's count per area and how old their export is.
- **Opening the page asks** every peer offering an inventory, as the tradeskill and loadout views
  do. Viewing an item is the person asking who has it, unlike a hover.
- With sharers who don't hold it, the line says none of them do. With nobody sharing, nothing.
- The text and grouping are `peerHoldersOf` and `peerHolderText` in
  `shared/items/ownership-notes.ts`.

## Consequences
- Your count and your group's sit together on any item page, from Search, a link, or the search bar.
- A page opens a round of asks when peers are sharing. They are once per peer revision
  (`inventoryAsksDue`), so paging through items costs nothing after the first answer.
- Tradeability is not judged on this line; the Peers tab's search still flags `NO DROP` / `NO TRADE`.
