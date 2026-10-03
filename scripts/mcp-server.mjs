/**
 * mcp-server.mjs — a read-only Model Context Protocol server over this install's own wiki cache.
 *
 * Exposes eqlwiki.com lookups (search, pages, zones, quests, factions, the item/spell catalogues) as
 * MCP tools, through the exact same `createWikiClient` the app itself uses
 * (`electron/wiki/index.ts`) reading the same shared `eqlist.db` (ADR 0232) — so an MCP client sees
 * whatever this install has already browsed/harvested, not a second copy of it. The catalogue tools
 * filter with the *exact* predicates the Items/Spells tabs use (`src/shared/item-search.ts`,
 * `src/shared/spell-search.ts`) rather than a second, looser copy of "what matches" — every field
 * those panels filter by is a parameter here too. See
 * [ADR 0280](../specs/decisions/0280-an-mcp-server-exposes-the-wiki-cache-read-only.md).
 *
 * Deliberately **data only**: every tool here reads or fetches wiki data, the same thing the Search
 * tab already does. None can touch a window, a setting, the shopping list, or anything else the app's
 * own UI owns — that's a different layer, not this one.
 *
 * Needs `npm run build:electron` first (same convention as every other script in here), and
 * better-sqlite3 built for plain Node — `npm run rebuild:node` if it was last built for Electron
 * (`npm run rebuild:electron`); `npm test` already does the Node rebuild as its own `pretest`.
 *
 * Usage:
 *   npm run mcp
 *   npm run mcp -- --data-dir "<path>"   # a specific install's profile folder instead of this machine's own
 *
 * Point an MCP client (Claude Desktop, Claude Code, etc.) at it with a stdio transport, e.g.:
 *   { "command": "npm", "args": ["run", "mcp"], "cwd": "<this repo's path>" }
 */
import path from "node:path";

// MCP's stdio transport reserves stdout for JSON-RPC frames, and this app's own debug logging
// (`EQL_DEBUG=1`, src/shared/logging.ts) writes `debug`/`info` lines through `console.log` — straight
// to stdout — when enabled. Redirected here, once, before anything else loads, so turning on app
// debug logging (a very reachable env var) can never corrupt the protocol stream.
console.log = console.error;
console.info = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appDataDirs, dirOpt, helpIfAsked, load, opt } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

const { createWikiClient } = load("electron/wiki/index.js");
const { openAppDatabase } = load("electron/sqlite-store.js");
const { WIKI_PAGE_MIGRATIONS } = load("electron/wiki/page-store.js");
const { STATS } = load("src/shared/item-stats.js");
const { FACETS, NO_FACET_VALUE, facetOptions, searchItems } = load("src/shared/item-search.js");
const { classOptions, searchSpells } = load("src/shared/spell-search.js");
const { eraFiltered, page, toItemCriteria } = load("src/shared/mcp-catalogue.js");

// `--data-dir` is mainly for tests (a hermetic temp profile rather than this machine's real one) —
// operationally useful too, for pointing at a specific install's folder rather than whichever one
// `appDataDirs()` finds first.
const userDataDir = typeof opt("data-dir") === "string" ? dirOpt("data-dir") : appDataDirs()[0];
if (!userDataDir) {
  console.error("No EQ List data folder found under %APPDATA% — run the app at least once first, or pass --data-dir.");
  process.exit(1);
}

// The shared db, not a standalone one: without `opts.db`, `createWikiClient` opens its own empty
// database inside `wiki-cache/` instead of the app's real `eqlist.db` — safe alongside the running
// app's own connection under WAL mode, the same pattern `build-web-snapshot.mjs` already uses.
const db = openAppDatabase(userDataDir, WIKI_PAGE_MIGRATIONS);
const wiki = createWikiClient(path.join(userDataDir, "wiki-cache"), { db });

const server = new McpServer({ name: "eq-list-wiki", version: "1.0.0" });

const textOf = (value) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
/** Every tool here answers with one JSON (or pre-serialized JSON) text block — nothing fancier yet. */
const result = (value) => ({ content: [{ type: "text", text: textOf(value) }] });

const STAT_KEYS = STATS.map((s) => s.key);
const FACET_KEYS = FACETS.map((f) => f.key);
// `SourceKind` (src/shared/types.ts) — a closed set, so validated as an enum rather than a free string.
const SOURCE_KINDS = ["drop", "quest", "recipe", "vendor", "forage", "ground", "unknown"];
// `ItemSortKey`/`SpellSortKey` (item-search.ts/spell-search.ts) are TS-only types with no runtime
// export; mirrored here rather than imported since there's nothing to import. A key that drifts out
// of sync just sorts nothing (both sort functions fall back to `row.stats[key]` → `undefined` → last),
// never throws, so the failure mode of this one being stale is quiet, not broken.
const ITEM_SORT_KEYS = ["name", "value", "slot", "source", "zone", "level", ...STAT_KEYS];
const SPELL_SORT_KEYS = ["name", "level", "mana", "castSec", "recastSec", "range", "damage", "manaPerDamage"];

// The picker's own "(none)" label — accepted literally in a facet array, translated by `toItemCriteria`
// (`src/shared/mcp-catalogue.ts`) to the real `NO_FACET_VALUE` sentinel `matchesFacet` expects.
const NONE = "(none)";

const PAGE_SCHEMA = {
  limit: z.number().int().min(1).max(1000).default(50).describe("Max rows to return (default 50, max 1000)"),
  offset: z.number().int().min(0).default(0).describe("Rows to skip, for paging through a filtered result"),
};

const facetArray = (label, extra = "") =>
  z
    .array(z.string())
    .optional()
    .describe(`${label} Any one matches (OR). Use "${NONE}" to match items with nothing for this facet.${extra ? " " + extra : ""}`);

const ITEM_CATALOGUE_SCHEMA = {
  text: z.string().optional().describe("Only items whose name contains every one of these words, any order, case-insensitive (not fuzzy)"),
  slot: facetArray("Equip slot(s), e.g. PRIMARY, CHEST, FINGER.", 'See item_facet_options({facet:"slot"}) for real values.'),
  weapon: facetArray('Weapon hand/skill — "1H"/"2H" (any handed skill collapses to its hand), or an exact skill name (Archery, Hand to Hand, Throwing, …).'),
  class: facetArray("Class name(s) that can use it (full names, e.g. Warrior)."),
  race: facetArray("Race name(s) that can use it."),
  flag: facetArray("Card flag(s), e.g. MAGIC, LORE, NO DROP."),
  source: z.array(z.enum(SOURCE_KINDS)).optional().describe(`How it's obtained — any of: ${SOURCE_KINDS.join(", ")}.`),
  zone: facetArray("Zone(s) it's sourced from, exact spelling.", 'See item_facet_options({facet:"zone"}) for real values.'),
  worn: facetArray("Worn-effect name(s)."),
  click: facetArray("Click-effect name(s)."),
  proc: facetArray("Proc-effect name(s)."),
  focus: facetArray("Focus-effect name(s)."),
  levelMin: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Keep only items whose level range overlaps at least this (an item with no known level always passes — see levelMax)"),
  levelMax: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Keep only items whose level range overlaps at most this. An item nothing could place a level on (~44% of the catalogue) " +
        "always passes both bounds rather than being silently hidden — the band cuts only what it's known to cut.",
    ),
  mins: z
    .partialRecord(z.enum(STAT_KEYS), z.number())
    .optional()
    .describe(
      "Stat floors: the item must state at least this much of each listed stat. A card silent about a stat fails its floor " +
        `(absence ≠ zero). Keys: ${STAT_KEYS.join(", ")}.`,
    ),
  weights: z
    .partialRecord(z.enum(STAT_KEYS), z.number())
    .optional()
    .describe(
      "Per-stat weights for the computed `value` field (and the \"value\" sort key) — not a filter. Points per unit of that " +
        "stat; negative for lower-is-better stats like delay or weight. A stat the card never gave contributes 0.",
    ),
  hideOutOfEra: z.boolean().default(true).describe("Drop items flagged out of this server's current era — matches the Items tab's default view (on)."),
  sortBy: z.enum(ITEM_SORT_KEYS).default("name").describe(`Sort column: ${ITEM_SORT_KEYS.join(", ")}.`),
  sortDesc: z.boolean().default(false).describe("Sort descending instead of ascending."),
  ...PAGE_SCHEMA,
};

const SPELL_CATALOGUE_SCHEMA = {
  text: z.string().optional().describe("Only spells whose name contains every one of these words, any order, case-insensitive (not fuzzy)"),
  class: z
    .array(z.string())
    .optional()
    .describe('Class name(s) that can cast it — any one matches (OR). See list_spell_classes for real values.'),
  hideOutOfEra: z.boolean().default(true).describe("Drop spells flagged out of this server's current era — matches the Spells tab's default view (on)."),
  sortBy: z.enum(SPELL_SORT_KEYS).default("name").describe(`Sort column: ${SPELL_SORT_KEYS.join(", ")}.`),
  sortDesc: z.boolean().default(false).describe("Sort descending instead of ascending."),
  ...PAGE_SCHEMA,
};

server.registerTool(
  "search_wiki",
  {
    title: "Search the wiki",
    description: "Fuzzy-search eqlwiki.com page titles (items, NPCs, quests, zones, recipes, …) this install mirrors.",
    inputSchema: {
      term: z.string().describe("Search text"),
      hideOutOfEra: z
        .boolean()
        .default(false)
        .describe("Drop results flagged out of this server's current era — matches the Search tab's 'Hide out of era' toggle (off by default there too)."),
    },
  },
  async ({ term, hideOutOfEra }) => result(eraFiltered(await wiki.search(term), hideOutOfEra)),
);

server.registerTool(
  "get_wiki_page",
  {
    title: "Get a wiki page",
    description: "Fetch one wiki page by its exact title (cache-first, fetching and parsing it live if not cached or stale).",
    inputSchema: { title: z.string().describe("Exact page title") },
  },
  async ({ title }) => result(await wiki.getPage(title)),
);

server.registerTool(
  "search_zones",
  {
    title: "Search zones",
    description: "Fuzzy-search zone page titles.",
    inputSchema: {
      term: z.string().describe("Search text"),
      hideOutOfEra: z.boolean().default(false).describe("Drop results flagged out of this server's current era, same toggle as search_wiki."),
    },
  },
  async ({ term, hideOutOfEra }) => result(eraFiltered(await wiki.searchZones(term), hideOutOfEra)),
);

server.registerTool(
  "quests_by_zone",
  {
    title: "Quests in a zone",
    description: "Every quest whose page names this as its zone.",
    inputSchema: {
      zone: z.string().describe("Exact zone title"),
      hideOutOfEra: z.boolean().default(false).describe("Drop results flagged out of this server's current era, same toggle as search_wiki."),
    },
  },
  async ({ zone, hideOutOfEra }) => result(eraFiltered(await wiki.questsByZone(zone), hideOutOfEra)),
);

server.registerTool(
  "search_factions",
  {
    title: "Search factions",
    description:
      "Fuzzy-search faction page titles (the complete Category:Factions roster). No era filter — the Search tab doesn't " +
      "offer one here either; a faction isn't gated by an expansion the way a zone or an item's source is.",
    inputSchema: { term: z.string().describe("Search text") },
  },
  async ({ term }) => result(await wiki.searchFactions(term)),
);

server.registerTool(
  "item_facet_options",
  {
    title: "List valid values for an item facet",
    description:
      "Every real value this install's cache currently has for one item facet — the exact strings list_item_catalogue's " +
      "matching facet parameter will match against (facet matching is exact, not fuzzy, so guessing a value blind usually " +
      'misses; "(none)" is always valid and means "items with nothing for this facet", even when not listed here).',
    inputSchema: { facet: z.enum(FACET_KEYS).describe(`Which facet to list values for: ${FACET_KEYS.join(", ")}`) },
  },
  async ({ facet }) => result(facetOptions(JSON.parse(await wiki.catalogueJson()), facet)),
);

server.registerTool(
  "list_spell_classes",
  {
    title: "List spell classes",
    description: "Every class name any cached spell names — the exact strings list_spell_catalogue's `class` parameter will match against.",
    inputSchema: {},
  },
  async () => result(classOptions(JSON.parse(await wiki.spellCatalogueJson()))),
);

server.registerTool(
  "list_item_catalogue",
  {
    title: "List cached items",
    description:
      "Item pages already in this install's cache, as search-ready rows (name, level, zones, sources, stats, effects, …), " +
      "filtered and sorted with the exact same rules the Items tab uses, then paged. Cache-only — reflects what this " +
      "install has browsed/harvested, not the whole wiki. Defaults to the first 50 rows, in era, sorted by name; `total` " +
      "says how many matched so you know whether to page further.",
    inputSchema: ITEM_CATALOGUE_SCHEMA,
  },
  async (args) => {
    const rows = JSON.parse(await wiki.catalogueJson());
    const criteria = toItemCriteria(args, FACET_KEYS, NO_FACET_VALUE);
    const results = searchItems(rows, criteria, args.weights ?? {}, { key: args.sortBy, desc: args.sortDesc });
    return result(page(results, args));
  },
);

server.registerTool(
  "list_spell_catalogue",
  {
    title: "List cached spells",
    description:
      "Spell pages already in this install's cache, as search-ready rows, filtered and sorted with the exact same rules the " +
      "Spells tab uses, then paged the same way as list_item_catalogue. No facet/stat-floor/level filter — a spell carries " +
      "none of those (see list_spell_classes for the one filterable dimension spells do have).",
    inputSchema: SPELL_CATALOGUE_SCHEMA,
  },
  async (args) => {
    const rows = JSON.parse(await wiki.spellCatalogueJson());
    const criteria = { text: args.text ?? "", classes: args.class ?? [], hideOutOfEra: args.hideOutOfEra };
    const results = searchSpells(rows, criteria, { key: args.sortBy, desc: args.sortDesc });
    return result(page(results, args));
  },
);

await server.connect(new StdioServerTransport());
