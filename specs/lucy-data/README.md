# Lucy data

## Standing caveat
[Lucy](https://lucy.allakhazam.com) is **Live EverQuest's** item database, not this game's. It is the
app's third and least trusted source — below [eqlwiki](../wiki-data/README.md), which at least
describes an ancestor of this build, and far below your own kills
([ADR 0025](../decisions/0025-observation-over-the-wiki.md)). Nothing it says is a fact about EQ
Legends; everything it says is a quotation from a sibling game that kept growing for twenty-five
years. It is here because it covers a gap nothing else does — **an item name no local reference has
ever heard of** — and because it can say what an item *is*, which a loot ledger never can.

Read [ADR 0124](../decisions/0124-lucy-is-a-second-opinion.md) first; it is the argument, and this
page is the map.

## Purpose
Answer about items eqlwiki has no page for and your log has never named, and fill in the stat card on
a page that hasn't got one — while making the source of every claim unmistakable and never putting
avoidable traffic on someone else's server.

## Responsibilities
- `electron/lucy/api.ts` — the HTTP client. One place for the base URL, the User-Agent, the deadline
  and the three things about the real site that shape everything:
  - **A session cookie is required, and refused with a `200`** whose whole body is a meta-refresh to
    `…&setcookie=1`. Any cookie value satisfies the check; being *issued* one is the ritual.
  - **CloudFront caches on the URL and ignores the cookie**, so the cookie is fetched **up front**
    from `/?setcookie=1` before any content request. The obvious ask-then-handshake design was written
    first and does not work: the cookieless first request caches *the refusal* under the URL you
    wanted, and the retry is served your own poison. The retry that remains is for the case someone
    else poisoned it, or a cookie expiring mid-session.
  - **A one-hit search `302`s to the item's page**, which `fetch` follows — so `itemList` reads
    `res.url`, and when it happens it hands back the page rather than paying for it twice.
- `electron/lucy/parse.ts` — a **pure** black box: HTML → `LucyItem`. Pinned against real captured
  pages under `fixtures/lucy/`. Lucy's markup is hand-written HTML from about 2004 (nested tables,
  unclosed tags, layout in `style`), so it hooks onto the little that is stable:
  - `.shottitle` + `.shotdata` → the in-game tooltip, whose only structure is `<br>` (hence
    `electron/html-text.ts`, now shared with the wiki parser).
  - `table.spellview` is the class on *every* data table on the page, so the two that matter are found
    by **reading their header row** — `Drops from | Zone` and `Sold by | Zone`. Counting tables would
    break the first time Lucy added a row above.
  - Rows become `ItemSource` (`kind: "drop"` / `"vendor"`), the same shape the wiki's use, so
    `sources.ts` groups and colours them with no new code.
  - A dash-tail naming the row's own zone is dropped (`a gnoll pup - Blackburrow` → `a gnoll pup`,
    which is what the log actually prints); a tail naming something else is kept, because
    `a skeleton - Captain Bones` says which spawn.
  - No tooltip block → `null`, not a nameless item. Lucy's cookie-refusal page must never be cached
    as an item.
- `src/shared/lucy-era.ts` — the **derived** era verdict, pure and testable. Lucy has no era or
  expansion field anywhere, including in the 300-column raw dump, so the only signal is the zones on
  its source rows, matched against the gazetteer of zones this server runs
  ([ADR 0076](../decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)) via
  `isKnownPlace`. A zone we can place → in era; zones but none placeable → out of era; no zones →
  **unknown**, which is a real answer and a common one. Reading one of Lucy's zone strings needs its
  own small vocabulary, since that site decorates a name three ways we don't — `[RoS]`,
  `West Freeport 2.0`, `Ruins of Old Paineel 2.0 (The Hole)` — and in the third case the gloss is the
  only placeable half. Every reading is tried; `placeableReading` returns the one that worked, which is
  what a map link needs.
- `electron/lucy/index.ts` — the client the app talks to: `search` / `getItem` / `cachedByName` /
  `itemUrl`, over a disk cache under `userData/lucy-cache`.
  - **A month for an item, a week for a search — including an empty one.** Unlike the wiki client this
    caches misses, because it is only ever asked about names that already failed once.
  - **`CACHE_VERSION`**, same rule as the wiki's: bump it when `parse.ts` changes what a page becomes,
    or a fix stays invisible on every item already visited. It is also what re-runs the era verdict
    when the gazetteer gains a newly-opened era.
  - **Nothing fetches unasked.** A search is one request; opening an item is one. `cachedByName` never
    touches the network at all, which is what lets an item page show Lucy's card for free.
- `src/shared/polite-queue.ts` — one at a time, a second apart, and the same question asked once.
  Shared rather than Lucy's own, because it is the shape any borrowed source wants. Not a cache: it
  forgets a key the moment it settles, and the clock is injected so the gap is testable without
  waiting for it.

## Where it shows up
- **The search panel's third heading**, below the wiki's results and your own log's, and only when
  both returned nothing. Rows **open**; they have no `+ Add` button, because adding on the strength of
  a source that hasn't been asked about the era yet is exactly the mistake the era badge exists to
  prevent. Opening is the one moment a request is paid for.
- **`LucySays`**, on an item page — under `ObservedItemView` (no wiki page at all) and under a
  card-less `WikiPageView` (a stub). Set apart by a rule down the left and headed by what it is. Cards
  render through the same `.page-card` as the wiki's; drop zones link to the map **only when placeable**,
  under our name for the zone.
- **`LucyLink` — a ↗ Lucy button on every item, beside its ↗ eqlwiki one.** Both item page headers and
  every shopping-list row. It needs no id and costs no request: `itemUrlFor` links by **id** when a page
  has been fetched and by **name** otherwise, and the name form goes to Lucy's own search, which
  redirects to the item when the name matches one (`Rusty Short Sword` → `item.html?id=5013`, confirmed
  live) and lists them when it matches several. The browser does the looking up. Names are folded first,
  since Lucy's search is literal — `Dragoon Dirk +2` finds nothing there. A name Lucy hasn't got lands
  on `Search Results (0 found)`, which the button's hover warns about rather than pretending otherwise.
  **Items only** — no mobs, zones, spells or quest groups, because Lucy is an item database and those
  reliably find nothing. Hidden when `askLucy` is off, and the flag is a **prop, not a hook**: it renders
  once per list row, and `useSettings` costs an IPC read and a listener per instance.
- **The era badge**, three states: `in era?` (a question, because it is derived), `out of era`, and a
  dashed `era ?`. The hover always names the evidence. `hideOutOfEra` hides only the known-out ones.
- **`settings.askLucy`** — a checkbox in the search panel, default **on**. Gated at the IPC boundary,
  so off means *no request is made*, which is a promise a boundary can keep and a data module can only
  try to.

## Non-responsibilities
- **No rate ever reaches `drop-truth.ts`.** That module reconciles the wiki with your own kills and
  produces a number the app can honestly call its own; a third game's drop table has no business in
  it. Lucy's rows are quotes, rendered as quotes.
- **No competing with a wiki page that has a card.** Lucy fills gaps, not columns.
- **No era resolution for results nobody opened.** The list carries no zones, so judging twelve hits
  would be twelve fetches on the one query shape that is by definition a miss.
- **No index, no crawl, no mirror.** Lucy is far too large to mirror and the useful thing about it is
  arbitrary lookup, not coverage. There is therefore no fuzzy search against it either: Lucy's own
  search is a literal substring match, so a misspelling finds nothing — honest, for a source we can't
  hold a title list for.
- **No spells, quests or NPC pages**, though Lucy has all three. Items are the gap; the rest is not.
- **No setup-check step yet** — see [todo.md](../todo.md).

## See also
[wiki-data](../wiki-data/README.md) · [ADR 0124](../decisions/0124-lucy-is-a-second-opinion.md) ·
[ADR 0103](../decisions/0103-search-can-answer-from-your-own-log.md) ·
[ADR 0025](../decisions/0025-observation-over-the-wiki.md) · [testing](../testing/README.md) ·
[neighbours](../neighbours.md)
