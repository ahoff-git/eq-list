# 0167: A picker says what a tick is worth

## Status

Accepted

Refines the Items tab's criteria row ([ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md)).

## Context

The Items tab's pickers offered every value the catalogue had ever mentioned, in one flat alphabet,
with nothing to say about any of them. For the Zone picker that is **146 zones**, and the useful
observation is how few of them are ever worth reading: with a level cap of 20, a WIS floor of 5 and
two slots ticked, **144 of the 154 zones then on offer led to nothing at all**. The only way to find
that out was to tick one and watch the result count stay where it was, then untick it and try the
next.

That is the ordinary failure of a facet menu built from the data rather than from the query, and it
gets worse exactly as the filter gets more useful — the more you have narrowed, the more of the menu
is dead, and the menu says nothing either way.

The stated workflow makes it sharper still. "Tick everything, then un-tick what you can't do yet"
([ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md)) means the reader is meant
to *read down the list and make decisions*, which is precisely the task a flat alphabet of 146
indistinguishable rows defeats.

## Decision

**Every option carries the number of items it would leave, and an option worth nothing is dimmed and
sinks to the bottom.**

- **The count is judged against every *other* criterion** (`facetCounts`). So zero means the honest
  thing: nothing in that zone survives your level cap, your floors, your slots and the rest. Not
  "nothing in that zone".
- **It ignores what is ticked beside it in its own facet.** Ticking within one picker *widens* that
  picker, so a value's worth cannot depend on its neighbours — otherwise every number in the menu
  would shift as you ticked the first box, which is unreadable.
- **A row two facets from the results counts for nothing.** No single tick can reach it, so counting
  it under both would promise something no click delivers.
- **Dimmed, not hidden, and still clickable.** The count describes your current criteria, not the
  catalogue; a row that vanished as you narrowed would be one you could no longer reason about, and a
  ticked value that disappeared would be a filter you could not get out of. The same reasoning already
  keeps a stale tick on the list.
- **The sort is a stable partition**, live half then dead half. The alphabet survives inside each
  half — and so does the fuzzy ranking when a filter is typed, which a real sort would have thrown
  away.
- **One pass for all ten facets, not one each.** A row failing two or more facets is skipped; one
  failing exactly one is counted only there; one failing none is counted everywhere. Measured on the
  real catalogue: **13 ms** across 11,126 rows with nothing set, 4 ms once narrowed — less than
  `searchItems` beside it, and memoized on the criteria so it is one pass per change rather than per
  render.
- **`(none)` is counted the same way** and is now criteria-aware, which retires `facetlessCount` — two
  ways to count "how many have nothing" is one too many.
- **The era filter is the one exception, and it removes rather than dims.** *In era only* is not a
  narrowing of a query — it says which game you are playing, and the items it cuts cannot be got on
  this server at all. So its values leave the menus outright. Measured: it retires 5 zones, and takes
  the Click picker from **491 options to 296**, Proc from 275 to 140, Worn from 21 to 6. The effect is
  that at defaults **nothing is dimmed**, so a dimmed row always means "your query did this" rather
  than "this game hasn't got that".
- **`All` still means all.** It ties the dead options too. They contribute nothing by definition, so
  the alternative — an *All* that quietly skipped some — would reintroduce the surprise ADR 0152
  removed.

## Consequences

**The menu is readable at the moment it matters.** Narrowed to a level-20 character in two slots, the
Zone picker leads with the ten zones that have something and buries the rest — the same list, ordered
by whether it can help you. And because the era filter has already taken its own values out, the
dimming that remains is entirely about the query in front of you.

**A count is a second opinion on the filter.** A zone reading `· 0` when you expected items is a
question worth asking, and it is answerable without touching the tick box — which is how the
`Various Zones` and `Pre-Revamp` cells got noticed
([ADR 0168](./0168-a-zone-cell-that-names-no-place-is-not-a-zone.md)).

**The numbers are per-facet, not a result count**, and they do not sum to one. A value's count is what
*it* would leave; two values ticked together leave the union. Anybody reading them as a breakdown of
the current results will be wrong, which is why they sit beside the value rather than under a heading.

**Every criteria change now costs a pass over the catalogue for the counts** on top of the search
itself. Both are memoized and neither is close to a frame, but they are now two things to keep an eye
on rather than one — and the counts pass is the one that grows if a facet is added.

**A dimmed row is still a live control**, so nothing here can strand a selection. It also means the
dimming is advice, not enforcement: a reader who ticks a dead value gets exactly what the count
promised, which is nothing, and the result count says so.
