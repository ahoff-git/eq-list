# 0163: An item wears the level of what drops it

## Status

Accepted

Adds a level to the Items tab
([ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md)), and widens the catalogue
harvest ([ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md)) and the pages that may
cross between peers ([ADR 0160](./0160-a-room-fills-the-catalogue-once.md)) to reach it.

## Context

The Items tab can say what a thing **is** and what it is **worth to you**, and neither answers the
question that decides whether a row is any use. A Cloak of Wisdom off a level 45 named is not a level
12 character's cloak, however well it scores. Sorting eleven thousand items by value and reading down
is only useful if you can first cut it to what you can actually go and get.

**The wiki never states an item's level.** There is no such field on an item page, and there is no
reason there should be — a level is a property of the *thing that has it*, not of the item. So it has
to be derived, and the evidence for it lives on other pages:

- **The mob's page** carries `Level: 35`, or `Level: 21 - 23` for one that varies by spawn. This is
  the precise answer and the one a player means.
- **The quest's page** carries `Minimum Level: 8` — the wiki stating a requirement outright.
- **The zone** has a level range, and unlike the other two it *ships with the app*
  ([ADR 0122](./0122-a-zone-wears-its-levels.md)), so it is available for every item with a placeable
  zone and costs nothing.

The three are not equally good, and the gap is wide: "a festering hag is level 28–30" and "it's
somewhere in Butcherblock" are not the same claim.

There was also a coverage problem, and the obvious fix to it was wrong. The catalogue harvest fetched
`Category:Items` and nothing else, so the mob and quest pages were only present if somebody happened
to have opened them: **211 of 4,214 mobs and 64 of 1,547 quests**. A level column built on that would
have been a column of zone estimates.

The obvious answer — fetch the 4,214 mob pages — was written first, and it was a 52% increase in the
crawl for a column. Looking harder at what the wiki already gives found something much better: a
**zone page carries a table of every NPC in the zone, with its level** (`NPC Name | Race | Class |
Level | Location | Known Loot`). Measured: 4,194 of the 4,214 drop rows (99.5%) name their zone, so
**177 zone pages answer for all of them** — and one fetch of Blackburrow places 30-odd mobs at once.
Against the real catalogue, 15 zone pages produced 1,288 mobs with levels and took the mob-precise
item count from 572 to 1,901; 226 individual mob pages had produced 572.

## Decision

**An item's level is derived from the best available evidence, and always says which.**

- **A hierarchy, mob → quest → zone**, each answer carrying `from` and a sentence naming the evidence
  (`a festering hag is level 28–30`). The same shape [drop-truth](../../src/shared/drop-truth.ts)
  uses, and for the same reason: a number whose quality varies must not be shown as if it didn't.
- **The *lowest* mob wins** where several drop it. The question is "can I get this yet", and the
  easiest source is what answers it.
- **A zone-derived level is visibly weaker** — set in dim italics, with a hover that says "only its
  zone's range — no page for the mob yet". A row that showed a fact and an estimate identically would
  be inviting a bad trip.
- **An item nothing can place has no level at all.** Absent, never 1 — the same rule a silent stat
  card gets, so a level filter cuts it rather than pretending it is a starter item.
- **The band filter overlaps rather than contains.** An item off a mob spanning 21–23 is a level-22
  character's item; asking for exactly-within would cut it.
- **The mob's level is read off the *zone* page, not the mob's.** This is the decision that makes the
  feature affordable: 177 zone pages instead of 4,214 mob pages, for the same answer. The roster
  grows to items + the zones their drops name + the quests their rewards name — **1,724 pages, not
  5,761** — taking a full run from 11,136 to about 12,900 rather than 16,900.
- **Nothing fetches an individual mob page for this.** The ones already on disk are read (the Hunt tab
  fetches them as you use it) and preferred where present, since a mob page describes that spawn
  specifically. But a missing one is a rung to fall through, never a page to go and get.
- **The roster's second half is discoverable only from items already held**, so a first run on an
  empty cache is items-only and the **second** fills in the levels. That is why "Check for new items"
  is not a no-op and is worth pressing.
- **Those pages share between peers like any other.** They are in the roster, so they are in the
  sharing; the reader's allow-list widens from `item | recipe` to `item | recipe | mob | quest | zone`,
  and no further. Spells stay refused: nothing in the Items tab reads one.
- **The zone roster's names are folded to meet the drop row's** (`npcKey`). A zone page writes
  `A Burly Gnoll`, and `A Giant Snake (Blackburrow)` where the bare name would be ambiguous; the drop
  row writes what the game prints. Without the fold the level is simply never found.
- **The pace picker computes its hours from the roster it actually has**, rather than the
  hard-coded "~3h" that would have quietly become wrong the day the roster grew.

## Consequences

**The Items tab can be cut to what a character can use**, which is the filter that makes sorting
eleven thousand items by value worth doing at all.

**Coverage is honest and improves with use.** Measured on a filled catalogue with only 226 mob pages
held, 56% of items already get a level: 572 from a mob, 190 from a quest, 5,467 from a zone, and 4,942
unplaced. After a second harvest most of those zone estimates become mob facts and much of the
unplaced tail gains an answer. The column shows what it knows and marks what it is guessing.

**A full run grows by 16% rather than by 52%** — about 12,900 pages instead of 11,136, or roughly
half an hour more at the default pace. Reading the zone table rather than the mob page is what bought
that, and it is the general lesson: before adding to a crawl, look at whether a page you were going to
fetch anyway already carries the answer in bulk. The pace labels are computed from the real roster
rather than written down, so the number in front of the reader is the number they will spend.

**Zone, mob and quest pages now cross between peers.** The same argument as ADR 0160's applies
unchanged — they are copies of public wiki pages with nothing personal in them — but the surface is
wider than "item pages", and the allow-list is the thing to look at if that ever needs narrowing. A
zone page is also the largest thing that travels: Kael Drakkel lists 508 NPCs, which is why the
roster is capped.

**A zone page that isn't one costs a little coverage.** Three of the fifteen zones sampled parsed as
something else — the drop row's zone name doesn't always match a wiki page title (`Commonlands`
against `East Commonlands`, and an out-of-era `Chardok`). Those mobs keep a zone-range level, which
is exactly what the bottom rung is for.

**A level can be wrong in a way a stat cannot.** A stat is copied off a card; a level is inferred
through a mob's name matching a page title, which is looser (case differs, and the wiki's article
usage is inconsistent). The failure mode is a *missing* level rather than a wrong one — an unmatched
name simply drops to the next rung — but a mob page that describes a different spawn of the same name
would mislead. Showing the evidence in the hover is what makes that checkable rather than invisible.

**The zone rung will always carry the long tail.** Some items are dropped by mobs the wiki has no
page for at all, and no amount of fetching fixes that; those keep a zone range for ever, which is
better than nothing and is labelled as such.
