# 0309: An inventory is shared live, and its tradeability is judged by the receiver

## Status
Accepted

## Context
The player's `/outputfile inventory` dump now reads into a full picture of what a character holds:
bags, bank, shared bank, Tradeskill Depot, Dragon's Hoard and the Storage tabs
(`game-export-dumps.ts`). The ask (2026-10-20) is to let peers search each other's, so a group can
find who already has a material before anyone farms it. Two things it must do: be **off unless the
player turns it on**, and **flag what can't be traded**, since a material nobody can hand over is no
help to the group.

The peer protocol already has four families ([peers](../peers/README.md)). An inventory is not
authored, not an observation of the world, and not a public page: it is a fact about one person's
character, true now and stale once they log off or move things.

The no-trade question has two possible sources. The sender could mark rows from its own catalogue.
Or the receiver could look each name up in its own catalogue, where wiki item cards already parse
`NO DROP` / `NO TRADE` into `ItemStats.flags`.

## Decision
- Inventory is a **`live`** share kind (`inventory`), the same family as timers, buffs and scores:
  asked for by a person, held in memory, dropped when the peer leaves, never written to disk and
  never relayed. Like every kind except the wiki mirror it is **off by default** (`defaultOn` unset).
- A row is one item's **total** across every place it is, with those places (`inventoryTotals`) and
  the dump's date (`asOf`). Grades fold into the base name; socketed exaltations are not offered,
  since an augment in your gear isn't a spare.
- **The receiver judges tradeability**, from its own catalogue's `NO DROP` / `NO TRADE` flags. Rows
  carry no trade flag at all, so no peer's build, old or modified, can claim an item is tradeable. An
  item with no page in the receiver's catalogue gets no verdict either way.
- The search lives on the Peers tab (`PeerInventories`), not the tray: like scores, rows from several
  peers are compared, not taken home one at a time.

## Consequences
- A group can answer "who has 20 Phosphorous Powder?" in one search, with counts, places and how
  old each person's dump is.
- Sharing exposes item names, counts and storage places (bag, bank and hoard slot numbers), and
  nothing else from the dump. The kind's blurb says so.
- What's offered is only as fresh as the sender's last dump. Rows carry `asOf`, and the panel shows
  the age on hover.
- Tradeability is only as good as the receiver's catalogue. The wiki is the source, and an
  uncatalogued item stays unflagged rather than guessed.
- Whether Storage's Equipment and Exaltation entries can be traded out at all is not known. They are
  offered like everything else, and their place label says where they are.
