# Wiki data

## Standing caveat
The wiki describes an **older, heavily modified** version of the game. It's the right starting
point — it knows what exists, what a quest needs, which zones matter — but its **drop rates and
loot lists are not to be trusted as current**. Where the app has killed something itself, its
own observations take over and the disagreement is shown rather than hidden; see
[ADR 0025](../decisions/0025-observation-over-the-wiki.md) and `src/shared/drop-truth.ts`.
Measured example: of two items a `minotaur slaver` actually dropped, the wiki lists **one** — and
only once the item's grade is folded away, since what dropped was a `Minotaur Battle Axe +1` and
what the wiki lists is the axe ([ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md)).

## Purpose
Use [eqlwiki.com](https://eqlwiki.com) as the source of truth for items, quests,
and recipes, so a user can search for a goal and add everything it needs to the
shopping list.

## Responsibilities
- `electron/wiki/api.ts` — thin MediaWiki API client (one place for base URL,
  User-Agent, timeout): `opensearch` / `fullTextSearch` (server fallback),
  `fetchAllTitles` / `fetchCategoryTitles` (for the search indexes),
  `fetchRedirectAliases` + `fetchQuestBacklinks` (quests-by-zone), and
  `fetchPageHtml` (`action=parse&prop=text`).
- **Fuzzy search** — `search()` / `searchZones()` match the query against cached
  title mirrors using `src/shared/fuzzy.ts`, so misspellings still find the page (EQ
  names are unspellable). Two indexes under `userData/wiki-cache` (7-day TTL, refreshed
  in the background): `title-index.json` (all pages, from `list=allpages`) and
  `zone-index.json` (from `Category:Zones`). The server search is only a fallback while
  an index warms up. See [ADR 0006](../decisions/0006-fuzzy-search-with-title-index.md).
  Since search matches the *cached* mirror (and returns local hits without hitting the server),
  a page added after the last mirror won't appear until the TTL — so `refresh()` (the Search
  tab's **↻ Refresh list** button) force-re-fetches both indexes on demand and drops the
  session's derived caches.
- **A search the index can't answer falls back on your own log.** eqlwiki has no page for a good
  deal of what this build drops, and "no results" for an item in your bags is the one answer that's
  certainly wrong — so the Search tab ranks the same query against what you have actually *held*
  (`src/shared/known-items.ts`, fed by the loot ledger and the pooled kill tally) and offers what the
  wiki didn't, under its own heading. Opening one gets a page built from your evidence rather than a
  "couldn't load". The wiki client itself stays ignorant of the log: the merge is the panel's
  ([ADR 0103](../decisions/0103-search-can-answer-from-your-own-log.md)).
- **A name is folded before it's looked up** — an item's grade and a zone's difficulty are numbers
  the wiki has never heard of (it has `Dragoon Dirk`, not `Dragoon Dirk +2`; one Blackburrow page
  serves every difficulty), so `search` / `searchZones` / `questsByZone` fold the query with
  `src/shared/names.ts`, and `getPage` retries the base name when the asked-for title has no page —
  the exact title first, so a graded page still wins if one exists.
  See [ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md).
- **Quests by zone** — `questsByZone(zone)` returns the quests in a zone. This wiki
  runs stock MediaWiki (no CirrusSearch), so `incategory:` search doesn't work and
  category membership doesn't tag quests to zones. Instead we take the zone page's
  **backlinks ∩ `Category:Quests`**, unioned over the zone's **redirect aliases**
  (quests link a zone as `[[Befallen]]`, `[[Highpass]]`, `[[Highpass_Hold|…]]`, etc.).
  See [ADR 0007](../decisions/0007-quests-by-zone-via-backlinks.md).
- `electron/wiki/parse.ts` — a **pure** black box: page HTML → normalized `WikiPage`
  (`kind`, `sources`, `components`, `rewards`). Encodes the real wiki DOM:
  - **Page kind** is decided by a signature container class so NPCs/zones/spells
    aren't mistaken for items: `.mobStatsBox`/`.eql-mobpage-stats` → `mob`,
    `table.questTopTable` → `quest`, `table.zoneTopTable` → `zone`,
    `.eql-spellpage`/`.spellStatsBox` → `spell`, else `item`. (`recipe` is an item
    page whose sources include a `recipe` kind.)
  - Item pages: fixed `<h2 id="…">` sections; `span.esec` = empty section.
    `Drops_From` (zone `<p>` + `<ul>` of mobs), `Sold_by` (`table.eoTable3`),
    `Related_quests`/`Tradeskill_recipes` (`<ul>` of links), `Player_crafted`
    (`<dl><dd>` "N x item").
  - Quests: `table.questTopTable` parsed in one walk into giver/zone **sources** plus an
    info **card** (`Minimum Level` / `Classes` / `Related NPCs` / `Related Zones` — the
    rows that aren't giver/zone); `Reward` `<ul>` (each line kept as `{text, item?}` —
    `item` set only when the whole line is one linked item, so a reward weapon is
    hover/openable but faction/coin lines stay plain); and turn-ins mined heuristically
    from `Walkthrough` (a link counts only when a quantity precedes it).
  - Mob/NPC pages: loot is gathered from **every** section whose heading contains
    "Loot" (Known / Common / Unique …) — walk each heading (through its `.mw-heading`
    wrapper and whatever div the `<ul>` is nested in) to its `<ul>`s, dedupe by name.
    Each `<li>`'s `.hbdiv > a` is the item; its **drop rate** (`WikiComponent.dropRate`)
    is the **percentage** chance — from `.drare` ("(17.3%)") or the `.ddb` drop-data box
    ("[1] 1x 25% (50%)"), taking the **lowest** % (the real chance, not the per-slot
    figure) — else a trailing "(X%) (low% - high%)". Rarity *words* ("Rare"/"Always")
    carry no number and are ignored. Powers the Hunt tab.
  - Stat card (`WikiPage.card`), reused across kinds — the block shown inline on the
    page and on hover (`ItemLink` / `useItemCard`):
    - **items**: the page's own `.itemtopbg`(title) + `.itemdata` (icon + stat lines),
      ignoring blocks nested in a `.hb` tooltip (those are embedded, not the page's own).
    - **spells**: `.eql-spellpage` description + classes + effect/casting tables.
    - **mobs/NPCs**: the `.mobStatsBox`/`.eql-mobpage-stats` table → **location**
      (Spawn Zone / Location) + Level/Race/Class/HP/Special, plus the mob portrait, then
      **faction impact** (the "Factions" / "Opposing Factions" lists — "None" is dropped).
    - **quests**: the `questTopTable` info rows (Minimum Level / Classes / Related
      NPCs & Zones) — the giver/start-zone rows stay as sources, not card lines.
  - Tables use `eoTable2/eoTable3`, never `.wikitable`.
- **The cache, read as a corpus** — `cachedItems()` walks the page cache and returns every `item` /
  `recipe` page as a `CachedItem` (name, card, sources, era flag). It makes **no request**: no index
  warm, no crawl, no TTL refresh. It exists because the Items tab searches items *by stat*, and this
  wiki has no structured item data and no way to be asked for "every item with its stats" — so the
  honest corpus is what has already been fetched, and it grows as you browse
  ([ADR 0152](../decisions/0152-an-item-search-is-a-filter-with-your-own-yardstick.md)). Entries
  parsed under an older `CACHE_VERSION` are skipped rather than included card-less, since a
  catalogue quietly missing stats is worse than one missing rows.
- **Filling that corpus — `harvest`** (`electron/wiki/harvest.ts`). `cachedItems` reads what we hold;
  this is how we come to hold it. A resumable, rate-limited trickle over `Category:Items` (**11,136
  pages**), one `action=parse` at a time with a gap — one second by default, which measured against
  the live wiki (~90 ms and ~3 KB a page) is about a 10% duty cycle for roughly three hours
  ([ADR 0153](../decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md)). It **never starts
  on its own**: the Items tab's button is the only way in. It checkpoints after every fetched page so
  stopping costs the page in flight and nothing else; it skips a page already cached at the current
  version with no request *and no gap*, so a second run over a filled catalogue takes seconds; and a
  page that 404s is recorded by name rather than ending the run. Fetching is `getPage`, so a
  harvested page gets the same caching, version check and era flag as one you opened by hand. The
  schedule is a tested black box — roster, cache test, fetch, clock and sleep are all injected.
- **The roster is items *plus the zones and quests they name*** — and **zones, not mobs**, which is
  what makes an item's level affordable ([ADR 0163](../decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
  A mob's level is on the mob's page and there are 4,214 of them, but a **zone page carries a table of
  every NPC in the zone with its level** (`parseZoneNpcs`, found by reading the header row for
  `NPC Name` and `Level`), and 99.5% of drop rows name their zone. So 177 zone pages answer for all
  4,214 mobs: measured, 15 zone pages yielded 1,288 mobs with levels where 226 mob pages had yielded
  226. The roster grows by 1,724 rather than 5,761, and a run by 16% rather than 52%.
  - Individual mob pages are **never fetched for this**. The ones already on disk are read and
    preferred (a mob page describes that spawn specifically); a missing one is a rung to fall
    through, not a page to go and get.
  - `cachedItems()` gathers zone rosters, mob cards and quest cards on the same walk that reads the
    items, then attaches a `level` to each. Names are folded by `npcKey`, since a zone page writes
    `A Giant Snake (Blackburrow)` and the drop row writes what the game prints.
- **…and filled *once per room*, not once per person** — `harvest` plans against what the
  [room](../peers/README.md) holds, not only against this cache
  ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)). The roster is cut into 1024
  **shards** by a hash of the title (`src/shared/item-shards.ts`), so two installs agree about which
  shard anything is in with nothing synchronised. Each pass takes the most useful next step: **ask** a
  peer for a shard they already hold (one message, no wiki request), else **fetch** a shard nobody has
  — in an order derived from our own peer id, so peers spread out unprompted — else **wait**, when
  every gap left is somebody's live claim. Coverage is a 256-character hex bitmap riding in the
  catalogue that was already being broadcast; `items.status()` / `items.shard()` / `items.accept()`
  are the cache's side of it, and `joinRoom` late-binds the two halves (the hub needs the cache to
  answer an ask, and the cache needs the hub to send one).
- **How long a page keeps** — `settings.wikiPageTtlDays`, **14 days** by default, read per freshness
  check rather than captured so a change takes effect at once (a running harvest included). One TTL
  for every kind of page: two answers to "how old may a wiki page be" would be two things to keep in
  step for no gain. It became a setting when pages started circulating between peers — a catalogue a
  room fills in an afternoon could otherwise sit unchecked for a very long time
  ([ADR 0161](../decisions/0161-a-public-page-is-shared-by-default.md)). `refreshPage(title)` is the
  escape hatch: one page, re-fetched now, whatever its age, through the same parser and cache write
  as any other fetch — it is the ↻ in a page's header, which also says how old the current copy is.
  A page from a peer keeps **its** pull date, and a copy newer than ours replaces ours
  ([ADR 0164](../decisions/0164-the-newest-copy-in-the-room-wins.md)), so a room re-pulls each page
  about once between everyone per TTL rather than once each.
- **A launch opens ~20 files, not 11,519.** The peer room's coverage is built on the share hub's
  first catalogue tick, so it runs on *every launch* whether or not anybody opens the Items tab — and
  it used to get the titles it needs by walking every page in the cache. That burst of file opens is
  also a burst of **real-time antimalware scans**, which is enough to make a whole machine crawl for
  the first seconds of every run; it is the sort of cost that never shows up in a timing measurement
  because the time is spent in somebody else's process. The pack carries the titles list beside the
  rows, so coverage costs one read. Pinned by a test that counts `readFileSync` calls.
- **The catalogue crosses to a window as *text*, and is stored as text** (`catalogue.json`,
  `catalogueJson()`). This is the single biggest thing about the Items tab's speed, and it is not
  about the data at all: `contextIsolation` is on, so everything a window receives is deep-copied by
  `contextBridge` **property by property**, and 11,125 rows is well over a hundred thousand objects.
  That copy runs on the *renderer's own thread* — which is why it presented as the whole app locking
  up for ten seconds rather than as a slow load, and why every measurement taken in main said the
  load was fast. A **string crosses as one value**; `JSON.parse` on the far side is native (24ms).
  Measured end to end: 10ms in main + 24ms in the window, against about ten seconds.
- **The built catalogue is written down** (`catalogue.json`, `catalogueJson()`). Walking the cache is
  ~500ms of synchronous reads and building rows from it parses eleven thousand stat cards (~200ms) —
  **~700ms of main before a window sees anything, on every launch**, because the Items tab is usually
  the tab you left open. None of it changes until a page does, so the *answer* is packed to one file:
  measured, **10ms instead of 706ms** — and since the pack holds the JSON that goes on the wire, main
  never parses it either. The pack's first line is a signature naming the parse version *and* the row
  shape, so a build that adds a field to a row can never read yesterday's rows and serve them without
  it; anything unreadable or half-written simply rebuilds.
  `dropDerived()` clears the item list, the rows and the pack **together** — they were separate once,
  and the one caller that forgot left a page a peer sent you invisible until the next restart.
- **The catalogue is built once and held.** Walking 11,519 cache files is ~400ms of *synchronous*
  reads, and main serves every window's IPC — paying it per Items tab mount froze the whole app for a
  third of a second each time. `cachedItems()` keeps its answer and drops it only when *we* write a
  page (`pageWritten`), which is sound because nothing else writes this directory. The walk **yields
  every 100 files**, so the longest stall it causes is ~12ms rather than one 400ms block, and two
  callers arriving together share one walk. The shard index rides the same walk instead of doing a
  second one, and is patched per written page rather than torn down — a harvest writes a page a
  second, and rebuilding on each would be a full walk every tick for three hours. Main warms it a few
  seconds after the window paints, so even the first open is instant.
- **A parser bump invalidates the kinds it changed, and nothing else.** `CACHE_VERSION` is one number
  for the whole cache, so bumping it to teach the parser about *zone* pages once threw away 11,482
  untouched item pages — an empty Items tab and a three-hour re-fetch for every user, for a change
  item pages were not affected by. `MIN_PARSE_VERSION` states the version each **kind** has to have
  been parsed at (`zone: 13`, everything else the floor), and `parsedCurrently(kind, version)` is the
  one test every cache read uses. Raise a kind's entry when *its* parse changes; raise the floor only
  when something changes for everything.
- **Cache versioning** — `getPage` caches the *parsed* `WikiPage` to disk, so a
  `parse.ts` change (new page kinds, new fields) would otherwise be masked by
  week-old entries. Cached pages are stored as `{ version, page }`; `getPage` treats
  a `CACHE_VERSION` mismatch as a miss and re-parses (a stale entry is still kept as
  an offline fallback). Bump `CACHE_VERSION` in `index.ts` whenever parser output
  changes — this is how a classification/parse fix reaches already-visited pages
  without hard-coding per-page exceptions.
- `electron/wiki/index.ts` — combines these behind `search()` / `searchZones()` /
  `questsByZone()` / `getPage()`, with a 7-day on-disk JSON cache under
  `userData/wiki-cache` and stale-on-error fallback.
- **Out-of-era flagging** — `fetchOutEraCategorySet` reads `Template:PageEra` (with a
  fallback era list) to learn which era categories aren't live. `getPage` flags the
  opened page (`WikiPage.outOfEra`), and search/quest results are flagged too:
  `flagOutOfEra` batches a `prop=categories` lookup for the shown titles (cached per
  title) and marks each `SearchResult.outOfEra`. The UI badges them and offers a
  "hide out of era" toggle (`settings.hideOutOfEra`). Zone-name suggestions are not
  flagged (the picker runs per keystroke). Category keys are underscore-normalized.
- **Out-of-era *zones*, as a list** — `outOfEraZones()` runs the same test over every page in
  `Category:Zones` and mirrors the answer to disk beside the other indexes (45 zones today: Kunark and
  Velious). It exists because [travel](../travel/README.md) has to **leave those zones out of its
  graph** — a map pack draws them, so without this a route goes confidently through a continent the
  server hasn't opened. Derived rather than listed, so it corrects itself when an era opens; on disk
  because a *stale* answer only over-excludes for a while, while a *missing* one produces a wrong route.
  It's the one index whose consumer isn't the search UI.

- **The zone gazetteer** — the one thing from this wiki that **ships as data** rather than being
  fetched: `src/shared/zones/eql-classic-zone-maps.json`, the EQL wiki's own in-era Zones page (Classic,
  Odus, the Planes, Antonica, Faydwer — Kunark and Velious excluded as out of era) mapped to EverQuest
  short names, with a display name and the aliases for each. `zones/gazetteer.ts` derives from it both
  "which map **file** a zone is" and "which **names** mean it"
  ([ADR 0076](../decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
  It's shipped rather than fetched because the map window needs a name *before* anything is on screen
  and because these facts about EverQuest don't change — unlike the era flags above, which do.
  It is data supplied from outside, so it is **checked rather than trusted**:
  `electron/tests/zone-gazetteer.test.ts` is the review a re-supplied file has to pass.

## Non-responsibilities
- No build-time generation of **item, quest or recipe** data — that is fetched at runtime and cached
  (see [ADR 0003](../decisions/0003-eqlwiki-runtime-data-source.md)); contrast the
  `eql-buff-calc` sample which bakes JSON at build. The exceptions are all *facts about zones*, which
  change about never and are wanted before anything is on screen: the supplied gazetteer above, plus
  the generated tables under `src/shared/zones/` — which expansion a zone came with
  ([ADR 0065](../decisions/0065-a-zone-belongs-to-an-expansion.md)), which zones it touches
  ([ADR 0117](../decisions/0117-the-wiki-says-which-zones-touch.md)) and what level its monsters are
  ([ADR 0122](../decisions/0122-a-zone-wears-its-levels.md)). The last two are read off the same zone
  infobox by the same crawl (`scripts/lib/eqlwiki.mjs`), so a fourth row is a parser and a banner.
- Out-of-era flagging covers the opened page and the shown search/quest results
  (not the whole title index) — the "hide" toggle filters the shown results.
- The **wiki's** drop rates live on the mob page (per loot line — a `(X%)` chance or a rarity
  word), not the item page: item "Drops From" gives the mob + zone but no rate. So a *wiki* rate
  shows when you view the dropping mob, not the item itself — while an **observed** rate now shows
  on both, since an item page carries what your own kills say about it
  ([ADR 0101](../decisions/0101-an-item-page-says-who-dropped-it.md)), including mobs this wiki
  never linked to the item at all.

- **A name this wiki hasn't got at all** is not this area's problem. Two other sources answer that,
  and both sit below it: your own log ([ADR 0103](../decisions/0103-search-can-answer-from-your-own-log.md))
  and [Lucy](../lucy-data/README.md), Live EverQuest's item database
  ([ADR 0124](../decisions/0124-lucy-is-a-second-opinion.md)). The wiki client stays ignorant of both —
  its job is to be a good client of a MediaWiki, and a search that quietly returned rows from elsewhere
  would make its cache, its era flags and its title index answer for things none of them had seen.

## See also
[architecture](../architecture/README.md) · [lucy-data](../lucy-data/README.md) ·
[ADR 0003](../decisions/0003-eqlwiki-runtime-data-source.md) ·
[ADR 0124](../decisions/0124-lucy-is-a-second-opinion.md)
