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
