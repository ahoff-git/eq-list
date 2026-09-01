# 0170: An item's sources are read against the era

## Status

Accepted

## Context

McVaxius\` Horn of War's "How to get it" listed five dragons:

| mob | zone | expansion |
|---|---|---|
| Gorenaire | Dreadlands | Kunark |
| Severilous | Emerald Jungle | Kunark |
| **Lady Vox** | **Permafrost** | **Original release** |
| Talendor | Skyfire Mountains | Kunark |
| Faydedar | Timorous Deep | Kunark |

On a server that has not opened Kunark, that is **one** way to get it and four dead ends, told apart
only by a reader who knows their expansions. The wiki's drop table is a table about *EverQuest*, and
the app was printing it as if it were a table about this server.

The era machinery to judge it already existed and nothing on either surface was calling it.
[ADR 0065](./0065-a-zone-belongs-to-an-expansion.md) settled the two-source rule — a shipped table for
which expansion a zone came with, eqlwiki's live flags for which of the server's eras are open today —
and `zoneUnavailable` had exactly one kind of caller: the map, the travel graph and the route panel.
The item surfaces used a **different** era signal, the wiki's `outOfEra` page flag, which is a *page
category*: it catches an item written up on a Velious page and misses one that merely drops in five
Kunark zones. Measured on the real 11,126-row catalogue, that miss is **191 items** — items the Items
tab was offering as gettable with nowhere on this server to get them.

The zone list had the same hole from the other side. The Items tab's "in era only" toggle already
promised that out-of-era values *leave the pickers* rather than sitting in them at zero, and the Zone
picker was offering **42 zones nobody could go to** — Chardok, Thurgadin, Veeshan's Peak — because the
items that drop in them also drop somewhere open.

## Decision

**A source is judged by its zone, wherever a source is shown** (`src/shared/item-era.ts`), against the
same `zoneUnavailable` the map and the router use.

- **The item page marks; it never hides.** The reachable sources lead — the reader's question is "so
  where do I go" — and the rest carry a badge saying why. An unreachable source is still the truth
  about the item and still the thing to plan around when the era opens, and a second heading for the
  dead ends would give them equal billing. Where *nothing* is reachable, the list says so outright.
- **The Items tab hides, and takes the zones with it.** That is what its toggle already said it did.
  So the corpus drops an item no open zone has, and strips a row's shut zones — which is the only
  reading that can retire a **zone** from the picker while keeping the items that also drop somewhere
  open.
- **Silence is unjudged, not unreachable.** A source with no zone, or a zone cell that names no place
  ([ADR 0168](./0168-a-zone-cell-that-names-no-place-is-not-a-zone.md)), is never marked and never
  cut. Quest rewards, crafted goods and the wiki's `Various Zones` all live there, and cutting them
  would be an invention — the same answer [lucy-era](../lucy-data/README.md) gives as `unknown`.
- **One flag, widened — not a second one.** `CachedItem.outOfEra` goes on meaning "you can't get this
  yet", and now knows the zone evidence as well as the page category. Three call sites already read
  it; a parallel flag would have been the same fact in two places, disagreeing within a release.
- **Judged at read time in the window, off a live list, not baked into the catalogue.** The rows are
  built once in main and cached in a pack ([ADR 0165](./0165-the-page-cache-is-a-few-files-not-eleven-thousand.md));
  the era is *not* in them. So **the pack signature does not move** — an era opening changes what the
  app shows with no rebuild, no cache invalidation and no code change, which was the whole point of
  keeping the live half out of the shipped table in ADR 0065. The window gets the list over a new
  `wiki:outOfEraZones` channel, which is main's existing cached answer.

## Consequences

**The Horn of War reads as one dragon and four you can't reach yet**, which is what the page always
meant and never said.

**The Items tab is 6,687 items and 99 zones**, against 6,878 and 141. The 191 items are ones only
Kunark and Velious hold; the 42 zones are exactly the live era list, and none of them was retired by
the *permanent* table — measured over the whole catalogue, every zone eqlwiki's drop tables name is
one this server actually has, so the "not on this server" branch cuts nothing today. It is kept
because it says something different (an era opening won't help) and because a shipped table that
never fires is a table nobody notices has rotted.

**It fails open, twice over.** The era list is a live read that may not have arrived; until it does,
nothing temporary is marked and everything permanent still is. A page shown for one frame with nothing
marked is much better than one marking the wrong rows.

**The corpus pass costs 21ms** on 11,126 rows, memoized on the rows and the era, so it runs when the
catalogue or the era changes and never on a keystroke. Rows that need no change are handed back by
identity rather than copied, or every memo downstream would be invalidated for nothing.

**Two surfaces still judge era their own way, and should not be left there.** The shopping list's
row expansion groups drops by zone with no era test at all, and Lucy's verdict
([ADR 0124](./0124-lucy-is-a-second-opinion.md)) asks only whether the *gazetteer* knows the zone —
so it calls a Kunark-only item in era. Lucy's is the harder of the two: its verdict is derived in main
at fetch time and cached with the item, so making it live means deciding what a cached verdict is
worth when the era moves under it.
