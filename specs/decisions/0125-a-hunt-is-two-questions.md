# 0125: A hunt is two questions, so the page turns round

## Status
Accepted

## Context
The Hunt tab groups zone → mob → the needed items that mob drops, sorted by how much of your list a
zone covers. That answers **"I'm going to Lower Guk — what does that get me?"**, and it is the right
answer when the destination is already decided.

It is the wrong shape for the question a shopping list actually asks first: **"I need a Fire Emerald
— where is it likeliest to drop?"** An item that drops off four mobs in four zones appears in four
separate blocks, each with its own rate badge, and comparing them means scrolling, remembering
percentages and doing the sort by eye. The rates are already on screen; only the arrangement stops
them being usable.

Both orderings are built from the same structure, so nothing about the data forced the choice — the
page simply only ever offered one of them.

## Decision
**The tab carries a `By zone` / `By item` toggle, and by item sorts each item's places by drop rate,
then zone.**

- **By item inverts the built hunt** (`huntByItem`), not the sources. Every decision `buildHunt`
  makes holds in both views by construction, so the two can never disagree about what is on your
  list.
- **The filter follows the grouping, in one control.** By zone it is the zone picker plus *follow*,
  as before. By item the same picker becomes a **search over the things on your list**, and the view
  looks **everywhere** rather than in the narrowed zone. Narrowing to a zone is meaningless in a view
  whose entire answer is *which zone*, and an item filter is meaningless in one that lists a zone's
  mobs — so the pick that would contradict the answer is the pick that isn't offered. It is a swap
  rather than a second box because the row has only so much room, and a filter that doesn't apply to
  what you are reading is worse than no filter at all.
- **That filter is not remembered.** The zone pick persists because you stay in a zone for an hour;
  "where does this one thing drop" is asked, read and done with. It also can't strand you — an item
  you finish leaves the list, and a filter that outlived it would open on an empty page.
- **Places sort by rate, then zone.** Rate first because that is the question; **zone** breaks the
  tie rather than mob name, because two mobs in one zone is one trip, and a reader going down the
  list should find everything they can farm without moving grouped together.
- **An unmeasured place sorts last, not as zero.** "Nobody has measured this" and "this never drops"
  are different claims, and a mob whose rate is merely unknown must not be buried beneath one the
  wiki says is 1%. It shows a dimmed `—` rather than nothing at all: in this view the rate is the
  column everything is ordered by, so an omitted one would read as *no chance* and sit at a position
  it never explains.
- **The rate that sorts is the rate that shows.** `bestRate` now returns its own numeric `value`
  alongside the text, so the ordering and the badge come from one decision about which source leads
  ([ADR 0025](./0025-observation-over-the-wiki.md)). Deriving the number beside the caller would let
  a list sorted by the wiki's figure sit under badges showing yours.
- **Items are listed by name, not by their best rate.** A rate moves every time you kill something,
  and a list that reshuffles itself while you farm has to be re-read from the top after every drop.
  The ordering that answers *where do I farm this* belongs inside an item, among its places.
- **A named mob keeps a section of its own.** A target has no item to be grouped under, so a by-item
  page built only from items would silently drop the one row you asked for by name
  ([ADR 0098](./0098-a-mob-is-a-thing-you-hunt.md)).
- The choice is **remembered per window** (`eqlist.main.huntGrouping`), like the tab's zone filter,
  and defaults to `zone` — the view the tab has always opened on.

## Consequences
The two views now share their rate reconciliation (`truthFor`), their zone label (name + wiki level
range + "you are here") and their rate badge, because a drop that read one way in one view and
another in the other would be two claims about one mob's loot.

The by-item view is the one that makes a **thin sample visible**: four places for one item, three of
them wiki figures and one of them yours out of nine kills, is a comparison the zone view never put
side by side. The badges already said which source was speaking ([ADR 0025](./0025-observation-over-the-wiki.md));
now they can be read against each other.

Rejected:

- **Replacing the zone view.** "What does this trip get me" is a real question, and it is the one
  you ask while standing in the zone — which is exactly when the tab is open.
- **Sorting items by their best rate** — see above; a self-reshuffling list.
- **Showing only the best place per item.** The best rate is not always the best trip: a 2% drop in
  the zone you are standing in beats a 6% one across the world, and the app cannot weigh that for
  you. Every place is listed, best first, and the zone (with its level range,
  [ADR 0122](./0122-a-zone-wears-its-levels.md)) is right there to judge against.
- **Treating a missing rate as 0%.** It is the one figure that would be invented rather than
  reported.
- **Keeping the zone filter alive in the by-item view** (as a second control, or silently). Silently
  is the worst of the two: a page filtered by a control that isn't on screen looks like a page
  missing half its answer, and "where is this likeliest to drop" narrowed to one zone isn't the
  question that was asked.
- **A free-text filter box instead of a picker.** The picker is the interaction the row already had,
  it only ever offers names that are actually on the page, and a chosen name stays visible in the
  box — a typed fragment that quietly matches nothing looks the same as a list with nothing in it.
