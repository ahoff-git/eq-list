# 0178: A mob page is worth its own fetch

## Status

Accepted

Narrows [ADR 0163](./0163-an-item-wears-the-level-of-what-drops-it.md)'s "individual mob pages are
never fetched", which was a rule about **levels** that had quietly become a rule about mob pages.
Adds a seed to [ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md)'s walk.

## Context

ADR 0163 asked *where does an item's level come from?* and answered it well. A mob's level is on the
mob's page and there are thousands of them; a **zone** page carries a table of every NPC in the zone
with its level, so 177 zone pages answer for 4,214 mobs. It concluded: "Individual mob pages are
**never fetched for this**."

*For this.* The qualifier was load-bearing and it stopped being read. By the time
[ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md) came to decide how wide the category walk
should go, "mobs are what we've decided not to fetch" had hardened into a premise, and the walk was
argued down to items alone partly on the grounds that following categories sideways would *reach
mobs* — treating that as the cost rather than half the point.

That was wrong, and it is wrong in a way the rest of this codebase already knew:

- **The wiki's drop rates are on the mob page and nowhere else.** `specs/wiki-data/README.md` says so
  outright: an item's "Drops From" gives the mob and the zone but **no rate**. `parse.ts` reads a
  `dropRate` percentage off every loot line of every "Loot" section, and it "Powers the Hunt tab". A
  catalogue with no mob pages is a Hunt tab that can only rank what you happened to browse.
- **So are the spawn zone and location**, the level/race/class/HP line, the portrait, and the faction
  impact — the whole mob card, which `ItemLink`/`useItemCard` already render on hover.
- **And a mob page is already preferred over the zone table** where one is on disk, because it
  describes *that spawn* specifically. The zone roster was always the fallback rung, not the answer.

The cost argument was also mismeasured, because it was made against the wrong mechanism. Reaching
mobs by hopping sideways out of the item categories is indeed indiscriminate — 10,947 pages of
everything a zone contains. But **mobs have their own category**. `Category:NPCs` is 7,944 pages over
four categories, found in **34 requests**, and it is disjoint from the item closure (overlap: one
page). None of the sideways mess is needed to get them.

## Decision

**`Category:NPCs` is a second seed of the walk, and mob pages are fetched like any other page.**

- **The seeds are the things this app reads pages *for*.** Items and NPCs. That is the whole rule, and
  it is why quests and zones are *not* seeded: their only job here is giving an item a level, so the
  ones no item names are pages nothing would ever read. They keep arriving by being named as a
  source.
- **ADR 0163 is narrowed, not undone.** A zone page is still where levels are read in bulk, and still
  the rung a missing or unparseable mob page falls through to. What changes is only that "never
  fetched" becomes "not fetched *for a level*" — which is what it said.
- **It removes a two-pass awkwardness rather than adding one.** Mobs used to enter the roster only by
  being named as a source by an item **already held**, so a first run on an empty cache was
  items-only and you had to press the button again to pick up the thousands of mobs it had just
  learned about. Seeded directly, they are simply in the roster from the first walk.
- **One roster, not two tiers.** Items are not fetched before mobs, and that is forced rather than
  chosen: a shard is a hash of the title, so every shard holds a mix of both and there is no way to
  prefer one without abandoning the shard as the unit peers coordinate on
  ([ADR 0160](./0160-a-room-fills-the-catalogue-once.md)). Splitting them would mean a second shard
  space, a second coverage bitmap and a second planner, to buy an ordering that a room fills past in
  an afternoon anyway.
- **The share cap holds and needs no change.** Measured over the real rosters, a shard goes from 11.6
  titles on average (max 24) to 19.3 (max 34), against `MAX_ROWS.items` of 64. Mob pages are small —
  a card and a loot list — and the largest thing that travels is still a zone page.

## Consequences

**The Hunt tab gets the wiki's drop rates for the whole game rather than for pages you happened to
open**, and every mob gets its spawn location and stat card. This is the point, and it is a bigger
change to what the app *knows* than anything in ADR 0177.

**A full run roughly doubles: ~21,500 pages, about six hours at the default pace** (twelve at the
gentlest, three at the briskest). The pace labels are computed from the real roster, so they moved on
their own. It is still one request at a time with a gap, still resumable, still stoppable, and still
paid **once per room** rather than once per person — which is the thing that makes the number
tolerable.

**Shards get harder to complete.** A shard is held only when *every* title in it is, so 19 titles
instead of 12 means one unfetchable page spoils a larger unit and `mine` coverage grows more slowly.
The existing guards already cover it — `exhausted` abandons a shard that cannot be finished, and
ADR 0176's backoff handles a room that looks permanently ahead — but the room will spend longer in
the state where those matter.

**3,744 ns-0 pages remain outside every seed's closure**, and that is now the honest statement of what
this app does not crawl: spells, factions, maintenance pages, and the items the wiki never filed as
items. The last of those is still the open question ADR 0177 left, and it is unaffected by this.

**The roster is no longer "the item list".** It is the page list, and the progress note says so. The
Items tab's own denominator is still items, because that is what that tab counts.
