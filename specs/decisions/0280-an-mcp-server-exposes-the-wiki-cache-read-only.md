# 0280: An MCP server exposes the wiki cache, read-only

## Status

Accepted

## Context

An MCP (Model Context Protocol) client — Claude Desktop, Claude Code, any other — can only answer
EverQuest Legends questions from what it already knows, which is nothing specific to this game and
nothing at all about what a given install has already browsed. `electron/wiki/index.ts`'s
`createWikiClient` already holds exactly that: a cache-first, parsed, structured mirror of
eqlwiki.com, read the same way the app's own Search tab does. Nothing new had to be built to answer
the wiki half of an MCP client's questions — only a way to reach the existing client from outside
the Electron process.

`createWikiClient` has no Electron dependency at all (plain Node + `better-sqlite3`), which several
scripts already lean on: `scripts/build-travel-graph.mjs` and `scripts/build-web-snapshot.mjs` both
construct a standalone wiki client from a CLI script, the latter opening the app's real shared
`eqlist.db` (ADR 0232) via `openAppDatabase(dir, WIKI_PAGE_MIGRATIONS)` rather than a second,
independent one. An MCP server is the same shape of script, with stdin/stdout speaking JSON-RPC
instead of writing files.

## Decision

**`scripts/mcp-server.mjs` runs an MCP server (`@modelcontextprotocol/sdk`, stdio transport) over
`createWikiClient`, read-only in effect and in scope — every tool it registers answers a wiki
question; none can reach a window, a setting, the shopping list, or anything else the app's UI
owns.**

- Opens the same shared `eqlist.db` `build-web-snapshot.mjs` does
  (`openAppDatabase(userDataDir, WIKI_PAGE_MIGRATIONS)`, passed as `createWikiClient`'s `opts.db`) —
  an MCP client sees this install's actual cache, not an empty one, and safely alongside the running
  app under WAL mode, the same already-accepted pattern ADR 0278's snapshot worker uses.
- `userDataDir` is resolved with `appDataDirs()` (`scripts/lib/cli.mjs`), the same helper every other
  standalone script uses — scripts can't ask Electron for `app.getPath('userData')`; they aren't
  Electron. The server refuses to start (clear stderr message, exit 1) if the app has never been run
  on this machine, rather than silently serving an empty cache.
- Seven tools, one call each into the existing client: `search_wiki` → `search`, `get_wiki_page` →
  `getPage`, `search_zones` → `searchZones`, `quests_by_zone` → `questsByZone`, `search_factions` →
  `searchFactions`, `list_item_catalogue` → `catalogueJson`, `list_spell_catalogue` →
  `spellCatalogueJson`. Deliberately excluded: `harvest`/`spellHarvest` (would start a background
  crawl from an MCP call), `items`/`spells`/`factions.accept`/`learnTitles`/`joinRoom` (peer-room
  wiring, not a question), `refresh()` (forces a full re-fetch of the search indexes). All of those
  are either a mutation or a long-running background action — a different layer, if ever wanted, not
  this one.
- `console.log`/`console.info` are redirected to stderr **before anything else loads**. MCP's stdio
  transport reserves stdout entirely for JSON-RPC frames; `src/shared/logging.ts`'s `debug`/`info`
  levels write through `console.log` whenever `EQL_DEBUG` is set (any non-empty value, in either
  process, per that file's own usage note) — a single stray line there would corrupt every message
  after it. Redirecting once at the top of this one entrypoint is cheaper and safer than special-casing
  a shared, dependency-free logging module three other consumers also rely on.
- Needs `npm run build:electron` first (`scripts/lib/cli.mjs`'s `load()` says so plainly if it's
  missing) and `better-sqlite3` built for plain Node, not Electron's ABI — the same requirement
  `npm test`'s `pretest` already has, since both run under a bare `node` process rather than inside
  Electron. Unlike `web:snapshot`, this script never chains those build steps into its own `npm run`
  line: their stdout chatter (tsc, `prebuild-install`) would land before the server's first protocol
  byte and corrupt the handshake the same way a stray debug log would.

## Consequences

- An MCP client gains item/quest/zone/faction lookups and the full item/spell catalogues, scoped to
  whatever this install has actually cached — the same honesty `cachedItems()`'s own doc comment
  already states (not the whole wiki, what's been browsed) carries through unchanged.
- No new data path: a bug in the MCP tools is a bug in reading `createWikiClient`'s existing,
  already-tested surface, not a second implementation to keep in sync.
- `list_item_catalogue` can return several megabytes of text (the whole Items tab's corpus,
  unpaginated) — acceptable today since nothing asked for less, worth revisiting if a client's own
  context limit makes that the wrong default.
- A second process now opens `eqlist.db` whenever the MCP server runs — already a supported,
  WAL-mode-safe shape (ADR 0278), not a new risk class.
