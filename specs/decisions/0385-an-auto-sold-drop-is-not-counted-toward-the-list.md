# 0385: An auto-sold drop is not counted toward the shopping list — it is warned about

## Status

Accepted

## Context

`store.applyLoot` matched every loot line against the shopping list and added its quantity to `obtained`, whatever
happened to the item as it dropped. The log distinguishes four fates (`kept`, `sold`, `stored`, `combined`), and an
**auto-sell** is the one where the item never reaches you: the game vendors it in the same line it is looted
(`You looted 3 Bone Chips from a gnoll and sold it for 4 copper.`). Counting it ticked a row for an item you hold
none of, and the loot alert that followed quoted the new count — so the banner could say the list was done for an
item you had just sold.

[ADR 0382](./0382-the-shopping-list-counts-what-you-hold.md) had already settled the same question for the
inventory count: an auto-sell adds and takes nothing, because in the real ledger it sells the looted stack as it
drops, never one already held. The row's own tally still disagreed with it.

Not counting it is only half an answer. A player who is tracking an item and has the game selling it has a
**setting working against them**, and the sale is the only moment the game tells them so: after that the item is
gone for good, and the next drop goes the same way. Saying nothing would turn a wrong tick into a silent loss.

## Decision

- **A `sold` loot line credits nothing.** `applyLoot` returns no entries for it, so the row is not ticked, no loot
  banner is raised and no celebration is announced to the room. A `kept`, `stored` or `combined` drop counts as it
  always did (a combine's input is still "obtained", as the parser documents).
- **It raises a warning instead.** `store.soldOnList` finds the rows the sale was for (the same match a drop uses,
  mobs excluded) without crediting them, and the alert router's `autoSold` raises one banner: the item, how many,
  and what the vendor paid (`0c` for a free sale). The overlay draws it **larger than any other banner**
  (`ca-big`) with the siren, because it has to be seen mid-fight rather than read.
- **It wears the alert defaults, not the Loot look.** The Loot style exists so that good news does not arrive in the
  red of "dispel now"; this is the drop that should. The defaults are the player's to change in the Alerts tab, so
  its sound, flash, colour and position follow what they chose for their loud alerts.
- **It ignores the row's bell (`notify`).** That bell asks for good news about a row; this is bad news about a row
  the player is relying on, and it should not depend on having remembered to arm it. The master switch and the
  replayed-gap rule still apply — a silenced overlay stays silent, and last night's sale is not announced at launch.
- **One banner per sale**, however many rows match it (two quests wanting the same item are one sale). The overlay's
  own cap of four banners bounds a farm where every drop is sold.
- **The ledger is unchanged, and a goal still counts it.** The Loot tab still lists the drop with what it fetched
  and the sells-for prices still learn from it; `goal-tracker`'s `noteLoot` asks a different question (how many
  dropped while a timeboxed farm ran), and an auto-sell does not stop an item from having dropped.

## Consequences

- A player who auto-sells an item that is also on their list is told, loudly, on the first sale — while the setting
  can still be changed — rather than finding the row ticked or the item gone.
- A farm where the item is sold on every drop warns on every drop (at most four stacked). That is deliberate: the
  alternative is a throttle, and a warning the player missed once is the one they need again.
- There is no per-row or per-item opt-out: a player who wants an item sold *and* on the list cannot silence this
  with the row's bell. Taking the row off the list, or switching alerts off, are the ways to stop it.
- Counts already saved are not rewritten: a row ticked by an auto-sold drop before this stays ticked until its
  figure is edited, since the list cannot tell which part of `obtained` came from which line.
