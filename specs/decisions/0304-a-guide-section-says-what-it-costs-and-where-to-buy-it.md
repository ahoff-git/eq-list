# 0304: A guide section says what it costs to finish and where to buy it, starting where you stand

## Status

Accepted

## Context

With the guide following your skill ([ADR 0303](./0303-a-tradeskill-guide-follows-your-skill.md)),
each step had its own estimate. The user asked for two more things: an estimated cost in platinum to
finish each section, and the merchants selling its materials, based on the zone you're in, with
clickable locations that open the map.

Two facts settled the shape:

- **Sections list alternatives**, so adding steps double-counts. Brewing's "1 to 31: Short Beer"
  sits beside "1 to 151: Skull Ale"; Baking's Wedding Cake and Birthday Cake cover the same span.
- **Merchant locations are on the wiki already**, and uniform: every item page's merchant table is
  `{{ItemWhereRow | [[Zone]] | [[Merchant]] | Area | (y, x) }}`, sometimes
  `[[Cabilis|East Cabilis]]` (the page and the zone you actually stand in). The generator was already
  reading these pages for price notes. 115 of the guides' 152 materials have merchants, 2,878 rows.
  Water Flask alone has 168. A few locations are mistyped (`(417, -427` with no bracket).

## Decision

**A section's cost is priced point by point** (`section-cost.ts`). Each skill point still ahead of you
is bought with the cheapest step covering it, at that point's combines (one at least; the ceiling
rate at your pace at most). A chosen step adds its one-off purchases once. Overlapping alternatives
therefore cost what the cheaper one costs. Points only an unpriced step covers are counted and named,
never priced at zero. A section with nothing priced says "cost unknown", so a blank never reads as
free. The same calculation over the whole guide gives the guide's total, shown in its heading.

**Merchants are generated data** (`VENDORS`, read by `tradeskills-parse.mjs`'s `vendorRows` from the
pages already fetched): zone as shown, the zone page when it differs, merchant, area note, location.
No extra requests.

**Where to buy reads your zone** (`where-to-buy.ts`):
1. Merchants **here**, in the zone the log last put you in, matched by `samePlace` under both
   names. Grouped by merchant, each with a map link on their location.
2. For the rest, the **stops** that sell the most of it, chosen greedily, up to three. Ranked by
   coverage, not distance: the guide can't know how you travel, and "Ak'Anon sells 4 of the 5" is
   the useful half of the question.
3. What **no open merchant sells**.

A merchant in a shut zone is no merchant (`zoneShut`). It sits under each section's cost as a folding
box, open on the section you're in.

**Map links reuse `MapLink`**: zone, location and the merchant's name as the label, the same target
every other coordinate in the app opens.

## Consequences

- From Blacksmithing 61 in East Freeport, the guide reads "≈ 1,975pp–4,938pp+ to finish". Every
  material for its next steps is sold in town, and Tislan's "134, -298" opens the map on East
  Freeport with his marker.
- The generated file grows to about 430 KB, nearly all of it merchant rows, bundled with the
  renderer. If that ever weighs on start-up, the rows can move to a lazily loaded chunk.
- Prices and merchants are the wiki's, so they're as current as its last edit and the last
  `npm run tradeskills:fetch`.
- "Here" is the zone the log last named, so it's empty until you zone (or the history scan finds a
  zone line), and the box says so.
