# 0336: Peer data is evidence — use it wherever it answers a question

## Status
Accepted

## Context
Pooling has always been treated warily. [ADR 0024](./0024-mob-knowledge.md) kept peers' observations
apart from yours, which is still right: you need to see whose a figure is. Over time, though, "kept
apart" turned into "not used". The Hunt tab is the clearest case. [ADR 0098](./0098-a-mob-is-a-thing-you-hunt.md)
placed a hunted mob by your own kills only, and `huntTargetsFor` later justified it in a comment: a
direction ("go to Lower Guk") taken from someone else can't be checked. So a mob a peer had killed
thirty times in one zone showed as "home unknown".

[ADR 0142](./0142-a-hunted-mob-marks-itself.md) had already rejected that rule for the map. It drew
peers' positions and said whose they were. The two views disagreed about the same data.

The player's own setup shows the cost: one character, played from two machines. The second machine's
kills are the player's own, and the Hunt tab hid them.

The player's ranking of the sources is: **your own log, then the wiki, then peers just behind it,
then Lucy**. Peer data is first-hand observation of this game. That makes it more trustworthy than a
borrowed guess and close to the wiki.

## Decision
**Peer data is evidence, and the app uses it wherever it answers a question.** Where pooled data can
fill a gap, the app fills it and says whose it is. It does not leave the answer blank.

- **Credit, don't hide.** The rule from 0024 and 0142 stays: a pooled figure names its contributors,
  and your own share stays visible (`myKills`, `placedBy`). What goes is the habit of throwing
  pooled data away because it isn't yours.
- **Hunt targets are placed by anyone's kills.** `huntTargetsFor` offers every zone the pooled tally
  knows. Zones you have killed the mob in yourself come first. A zone only peers have seen carries
  `placedBy`, and the tab flags it "via Bob". This supersedes 0098's "placed by your own kills" clause
  and nothing else in 0098.
- **Readers follow pooled data as it arrives.** A view showing pooled figures re-reads when a peer's
  report lands (`peers.onChanged`), not only when your own kills change.
- **Observations are shared by default.** `mobs`, `kills`, `respawns`, `crafting` and
  `factionObservations` default to on (`ShareKindSpec.defaultOn`), alongside the public mirrors from
  [ADR 0161](./0161-a-public-page-is-shared-by-default.md). Data that is never sent can't be pooled,
  and an install nobody has opened the Peers tab on is exactly the one whose data gets lost. They are
  counts, rates and positions: nothing you authored, and nothing live about you. Authored and live
  kinds stay off. An explicit choice still wins in both directions, so a player who switched one off
  keeps it off.
- **Your own data never counts as a peer's.** A relayed row whose origin is your own contributor id is
  dropped on arrival (`groupByOrigin`'s `self`). Without that, pooling one install's data back into
  itself would double every count.

## Consequences
- A hunted mob you've never seen can now show a zone, and the flag says whose kills put it there.
  A wrong zone from a hostile peer is possible. It is credited, though, so the player can forget that
  contributor (`forgetPeers`).
- Where an existing view already ranks pooled data above the wiki (the map's measured position over a
  wiki coordinate, [ADR 0025](./0025-observation-over-the-wiki.md)), it keeps doing so. A measured
  position is still better than a stated one.
- Every install that has never touched these toggles starts sending its observations on update, kill
  positions included. That shows where a player hunts. This is the price of the data not getting lost,
  and the Peers tab still turns any of them off.
- What arrives is already written to disk as it lands (`contributions.ts`) and re-offered to the next
  peer (ADR 0242). So once one install in a room has learned something, it outlives the install that
  taught it.
