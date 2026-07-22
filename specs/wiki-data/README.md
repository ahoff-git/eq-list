# Wiki data

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
- **Quests by zone** — `questsByZone(zone)` returns the quests in a zone. This wiki
  runs stock MediaWiki (no CirrusSearch), so `incategory:` search doesn't work and
  category membership doesn't tag quests to zones. Instead we take the zone page's
  **backlinks ∩ `Category:Quests`**, unioned over the zone's **redirect aliases**
  (quests link a zone as `[[Befallen]]`, `[[Highpass]]`, `[[Highpass_Hold|…]]`, etc.).
  See [ADR 0007](../decisions/0007-quests-by-zone-via-backlinks.md).
- `electron/wiki/parse.ts` — a **pure** black box: page HTML → normalized `WikiPage`
  (`sources`, `components`, `rewards`). Encodes the real wiki DOM:
  - Item pages: fixed `<h2 id="…">` sections; `span.esec` = empty section.
    `Drops_From` (zone `<p>` + `<ul>` of mobs), `Sold_by` (`table.eoTable3`),
    `Related_quests`/`Tradeskill_recipes` (`<ul>` of links), `Player_crafted`
    (`<dl><dd>` "N x item").
  - Quests: `table.questTopTable` (giver/zone), `Reward` `<ul>`, and turn-ins mined
    heuristically from `Walkthrough` (a link counts only when a quantity precedes it).
  - Tables use `eoTable2/eoTable3`, never `.wikitable`.
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

## Non-responsibilities
- No build-time data generation — data is fetched at runtime and cached
  (see [ADR 0003](../decisions/0003-eqlwiki-runtime-data-source.md)); contrast the
  `eql-buff-calc` sample which bakes JSON at build.
- Out-of-era flagging covers the opened page and the shown search/quest results
  (not the whole title index) — the "hide" toggle filters the shown results.
- Drop *rates* are not available on the wiki, so they aren't modeled.

## See also
[architecture](../architecture/README.md) · [ADR 0003](../decisions/0003-eqlwiki-runtime-data-source.md)
