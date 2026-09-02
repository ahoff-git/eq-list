# 0177: The item list is a walk, not a listing

## Status

Accepted

Corrects the roster [ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md) introduced and
[ADR 0163](./0163-an-item-wears-the-level-of-what-drops-it.md) extended. Adds a third thing to the
`items` share of [ADR 0160](./0160-a-room-fills-the-catalogue-once.md), which moves
[ADR 0172](./0172-a-room-says-when-you-are-the-old-one.md)'s `SHARE_PROTOCOL` to 3.

## Context

The catalogue's roster was one question — *list `Category:Items`* — and that question has two wrong
answers in it.

**It is asked once and then believed for ever.** `harvest.start()` took the saved roster whenever
there was one and only fetched a new one when there was none, or when passed `restart` — which no
button passes. So an install that filled its catalogue in March was still working from March's item
list in September. A page the wiki gained since could not be fetched, could not be asked for, and
could not be counted missing. `Mistmoore Heirloom Ring` (pageid 60010) is one of them. Nothing was
broken and nothing reported anything; the roster was simply a photograph.

**And `Category:Items` is not the item list.** It has thirty subcategories, they have subcategories of
their own, and `fetchCategoryTitles` asks for `cmnamespace=0`, which is precisely the parameter that
drops them. Measured against the live wiki: the category lists **11,167** pages directly and its
transitive closure — 76 categories — holds **11,847**. **680 item pages** were unreachable by
construction.

Both failures are silent, and that is what makes them worth a record. A missing title is not an
error: it is a page that is never fetched, never shared, never counted as absent, and never
suspected. The Items tab said "11,167 of 11,167" and meant it.

The obvious remedy is to keep going — hop *sideways* from an item into the other categories it sits
in (`Category:Fingers`, `Category:Mistmoore Castle`) and follow those too. Measured, that reaches
**10,947 further pages**, overwhelmingly **mobs**, because the zone and era categories it lands in
hold everything in the zone. They cannot be told apart before fetching: `Template:Itempage` looks
like the discriminator and is not — it appears on **47 of 60 mob pages**, because a mob page
transcludes an item tooltip for every line of its loot. So the sideways hop is a few hundred items
hidden inside eleven thousand page fetches ADR 0163 has already decided not to make.

## Decision

**The roster is a walk over the category graph, it expires, and its titles travel between peers.**

- **Down, not sideways.** The walk descends from `Category:Items` through every subcategory it names,
  transitively, and stops at the closure edge — 76 categories, 11,847 pages, measured end to end
  through the shipped code. That edge is where the wiki stops *asserting* that something is an item,
  and it is the right place for a crawl to stop. The seeds are a constant, so a second one is one
  line when something wants it; zones and quests deliberately are not seeds, since they already reach
  the roster by being named as an item's source (ADR 0163) and seeding them would add 862 quest pages
  nothing reads.
- **The walk is cycle-safe, because the graph has cycles.** `Category:Weapons` and
  `Category:Equipment` each reach the other's children. A walk that assumed a tree would revisit for
  as long as its budget allowed. There is a category ceiling too, not as a tuning knob but as the
  guard that keeps a re-parented tree from turning a bounded walk unbounded — reaching it sets
  `truncated`, so a short answer never looks like a complete one.
- **The gap goes around every request, not every category.** `Category:Items` is twenty-three
  continuations by itself, so gating per category would fire twenty-three requests back to back
  inside what ADR 0153 promised was a page a second. `fetchCategorySlice` hands back the cursor
  rather than following it, which is the whole reason the walk can be trickled at all: **194 requests
  in 68 seconds** at 250 ms, about three minutes at the default pace.
- **A roster older than a week is walked again**, and that is the whole of "periodically explore the
  wiki". It needs no timer of its own — a run already starts on the button and on the room-fill tick
  (ADR 0176), so the check happens whenever one begins. A week rather than the page TTL's fortnight
  because the two answer different questions: a page expiring means *this copy may be out of date*, a
  roster expiring means *we may not know an item exists at all*, and only the second failure hides
  itself.
- **A walk that comes back short is not believed.** Fewer titles than we already hold is far likelier
  to be a truncated or half-failed crawl than eleven thousand deletions, and shrinking the roster on
  one would quietly un-share shards the room depends on — so that case keeps both. A walk that
  returns *nothing* leaves the old roster alone entirely, because a moment offline must not turn into
  an install that stops filling.
- **Roster titles ride the shard `give`.** A peer answering an `items` ask now names the titles its
  own walk found in that shard, alongside the pages. It is a few hundred bytes on a message that is
  already ~15 KB, and it is what stops every install repeating the same 194 requests to rediscover
  the same 680 items. Deliberately **the whole shard, not only what we hold**: a title we know about
  and have *failed* to fetch is the one a peer most needs, since they may succeed where we didn't.
- **A title is a claim about the wiki, not about the peer, and completeness stays self-assessed.** A
  learned title is only ever *added*, never used to remove one, and is never taken as evidence that
  the page exists. It simply makes its shard incomplete — which is exactly how it becomes work the
  planner picks up. The worst a bad title can do is cost one 404 and land in `failed`. That is why
  this is applied silently like the pages themselves: ADR 0161's argument for a public page applies
  at least as strongly to a name.
- **An install with no roster learns nothing.** A roster invented out of a peer's message would make
  `hasRoster` true on an install that has never listed anything, and ADR 0176 depends on being able
  to tell that ignorance apart from emptiness.
- **What the walk found is said out loud.** "680 items we had no record of" is the entire answer to
  *was exploring worth doing*, and it is only knowable at the moment the new roster meets the old one.
  Shown only when it is non-zero: the walk re-runs weekly and most weeks will find nothing, and "0 new
  items" every time would train people to stop reading the line.

## Consequences

**680 item pages become reachable, and stay reachable.** The catalogue's denominator moves from
11,167 to 11,847 and will move again on its own as the wiki grows, which is the part that matters —
the previous number was not merely wrong, it was frozen.

**A full run is about 5% longer**, plus roughly three minutes of category listing at the default pace.
The listing is paid at most once a week per install, and once per *room* in practice, since the
titles travel.

**`SHARE_PROTOCOL` moves to 3.** A peer speaking 2 sends pages without titles: everything still works
and they simply teach us nothing about items they know of and we don't. That is a real degradation
and therefore a number, which is what ADR 0172 exists to say out loud. As ever, it does nothing for
the builds already out there.

**The roster now grows from two directions**, and only one of them is the wiki. A title can arrive
from a peer between walks, which means the roster is no longer a pure function of what this install
has asked eqlwiki. That is the point, but it does mean "why is this in my roster?" has two possible
answers where it previously had one.

**The sideways hop stays refused, and it is the thing somebody may reasonably want to revisit.** A few
hundred items really are out there, in pages the wiki never filed as items. Reaching them needs a
classifier that works *before* the fetch, and the two cheap candidates — category membership and
template transclusion — have both now been measured and both fail. A third idea would be a new
decision, not an extension of this one.
