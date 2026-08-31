/**
 * index.ts — the wiki data source the rest of the app talks to. Combines the
 * MediaWiki API (api.ts) with the HTML parsers (parse.ts) and a simple on-disk
 * JSON cache so repeated lookups are instant and the app degrades gracefully to
 * stale data when offline.
 *
 * Search is fuzzy and local: we mirror page-title lists into cached indexes and
 * match against them with fuzzy.ts, so misspellings still find the right page
 * (EQ names are unspellable). The server's exact-match search is only a fallback
 * while an index is warming up (or for a page too new to be mirrored).
 */
import fs from "node:fs";
import path from "node:path";
import v8 from "node:v8";
import {
  opensearch,
  fullTextSearch,
  fetchPageHtml,
  fetchAllTitles,
  fetchCategoryTitles,
  fetchRedirectAliases,
  fetchQuestBacklinks,
  fetchOutEraCategorySet,
  fetchCategoriesFor,
} from "./api";
import { parseWikiPage } from "./parse";
import { createHarvester, type HarvestProgress, type SavedHarvest } from "./harvest";
import {
  emptyCoverage,
  encodeCoverage,
  setShard,
  shardOf,
  type PeerCoverage,
} from "../../src/shared/item-shards";
import type { SharedItemPage } from "../../src/shared/peer-share";
import { itemLevel, mobCardLevel, npcKey, parseLevelRange, questCardLevel, type LevelSources } from "../../src/shared/item-levels";
import { fuzzyRank } from "../../src/shared/fuzzy";
import { bestReading } from "../../src/shared/ocr-variants";
import { itemBaseName, zoneBaseName } from "../../src/shared/names";
import { createLogger } from "../../src/shared/logging";
import type { CachedItem, SearchResult, WikiPage, WikiPageKind } from "../../src/shared/types";
import { forTransfer, itemRows, type ItemRow } from "../../src/shared/item-search";

const log = createLogger("wiki");
/**
 * How long a cached page stays good, when nobody has said otherwise.
 *
 * Two weeks, and a **setting** rather than a constant since item pages began circulating between
 * peers ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)) — a catalogue a
 * room fills in an afternoon could otherwise sit unchecked for a very long time.
 */
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const INDEX_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// Bump whenever parse.ts changes how a page becomes a WikiPage (new page kinds,
// different sources/components). Cached pages carry the version they were parsed
// under; a mismatch forces a re-parse, so a parser fix reaches every page instead
// of being masked by week-old cache entries. (v2: mob/zone classification + loot;
// v3: spell classification + item cards + structured rewards; v4: reward items with
// embedded stat tooltips parsed as clean links; v5: spell cards (description/details);
// v6: mob cards (location/stats) + loot rarity; v7: loot drop % across all loot
// sections (Common/Unique); v8: dropRate is percentages only (rarity words dropped);
// v9: also read the drop % from the `.ddb` drop-data box; v10: use the lowest % in
// the drop-data box (the real drop chance, not the per-slot figure); v11: quest info
// card (Minimum Level / Classes / Related NPCs & Zones) from questTopTable; v12: mob
// faction impact (Factions / Opposing Factions) appended to the mob card.)
// v13: zone pages carry their NPC roster (name + level), which is where an item's level comes from
// (ADR 0163) — 177 zone pages instead of 4,214 mob pages for the same answer.
const CACHE_VERSION = 13;

/**
 * The version a page of each kind has to have been parsed at to still be current.
 *
 * **A parser change invalidates the kinds it changed, and nothing else.** `CACHE_VERSION` is one
 * number for the whole cache, so bumping it for v13 — which only taught the parser to read a *zone*
 * page's NPC table — threw away 11,482 perfectly good item pages and would have made every user
 * re-fetch the entire catalogue over three hours. Item pages are byte-identical under v12 and v13,
 * and saying so here is the difference between a free upgrade and a very expensive one.
 *
 * A kind not listed keeps the floor. Raise a kind's entry when *its* parse changes; raise the floor
 * only when something changes for everything.
 */
const MIN_PARSE_VERSION: Partial<Record<WikiPageKind, number>> = {
  // v13 added `npcs`. A zone page parsed before that has no roster, so it has to be read again.
  zone: 13,
};

/** Below this, a page predates parts of the parse every kind depends on. */
const MIN_PARSE_FLOOR = 12;

/** Was this page parsed by a parser current enough for what we now read off it? */
function parsedCurrently(kind: WikiPageKind, version: number): boolean {
  return version >= (MIN_PARSE_VERSION[kind] ?? MIN_PARSE_FLOOR);
}

// Wiki taxonomy (confirmed against the live wiki). Kept as named constants so a
// category rename only needs editing here.
const ZONES_CATEGORY = "Zones";
const QUESTS_CATEGORY = "Quests";
/** 11,136 pages on the live wiki — the roster the item catalogue is filled from (ADR 0153). */
const ITEMS_CATEGORY = "Items";

export interface WikiClient {
  search(term: string): Promise<SearchResult[]>;
  getPage(title: string): Promise<WikiPage | null>;
  /**
   * Re-fetch one page now, whatever its age.
   *
   * The escape hatch from the TTL, for the reader who is looking at a card they believe is wrong —
   * a page edited on the wiki this morning, or one that reached them through a peer. Everything else
   * about it is an ordinary fetch: same parser, same cache write, same era flag, so the refreshed
   * page is indistinguishable from any other.
   */
  refreshPage(title: string): Promise<WikiPage | null>;
  searchZones(term: string): Promise<SearchResult[]>;
  questsByZone(zone: string): Promise<SearchResult[]>;
  /**
   * Zone page titles the server currently has **out of era**, derived rather than listed: every page
   * in `Category:Zones` whose categories include one of the eras `Template:PageEra` says isn't live.
   *
   * So it follows the server. When Legends opens Kunark the wiki's template changes and these stop
   * being excluded, with nothing to edit here. Cached on disk, because the answer has to survive being
   * offline — see `outOfEraZones` for what happens when the lookup fails.
   */
  outOfEraZones(): Promise<string[]>;
  /**
   * Of several readings of one OCR grab — the raw text and its corrections, in order
   * (`ocr-variants.ts`) — the one that best matches a page title we mirror.
   *
   * Local and synchronous, because it runs between the grab and the Search box: the mirrored index
   * or nothing. A cold index answers with the raw reading rather than waiting on the network, which
   * is only the behaviour that existed before.
   */
  bestKnownReading(readings: readonly string[]): string;
  /**
   * Force a re-fetch of the mirrored search indexes now, instead of waiting out the weekly TTL —
   * so a page added to the wiki shows up in search straight away. Also drops the session's
   * derived caches (era flags, zone quests) so they rebuild against the fresh data.
   */
  refresh(): Promise<void>;
  /**
   * Every **item** page already on disk, as the item search's corpus.
   *
   * Cache-only, and that is the whole contract: no request, no index warm, no crawl. The wiki has
   * tens of thousands of pages and no way at all to ask it for "every item, with its stats", so the
   * honest corpus is what this app has already been asked to fetch — it grows as you browse, and the
   * panel says how big it is rather than implying it is complete
   * ([ADR 0003](../../specs/decisions/0003-eqlwiki-runtime-data-source.md)).
   *
   * **Held in memory between calls**, and dropped the moment we write a page. Walking the cache is
   * ~350ms of synchronous reads, and main serves every window's IPC — paying that on each Items tab
   * mount froze the whole app for a third of a second each time.
   */
  cachedItems(): Promise<CachedItem[]>;
  /**
   * Fill the item catalogue from `Category:Items`, one page at a time with a gap between them.
   *
   * The counterpart to `cachedItems`: that reads what we hold, this is how we come to hold it. Only
   * ever runs because someone asked, resumes where it stopped, and skips what is already cached
   * ([ADR 0153](../../specs/decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md)).
   */
  harvest: {
    start(opts?: { gapMs?: number; restart?: boolean }): HarvestProgress;
    stop(): HarvestProgress;
    status(): HarvestProgress;
  };
  /** Called with each step of a running harvest, so a window can draw the progress. */
  onHarvest(listener: (progress: HarvestProgress) => void): void;
  /**
   * The item catalogue as the room sees it: what we hold, what one shard contains, and what to do
   * with pages a peer sends back
   * ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
   */
  /**
   * The mob and quest levels the cache walk gathered, for `itemRows` to place items with.
   *
   * Exposed because the walk is what knows them: rows built without it get the zone estimate for
   * everything, which looks like working and is not.
   */
  levelSources(): LevelSources;
  /**
   * The item catalogue as **rows a window can search**, which is the shape the Items tab wants and
   * the only shape it wants.
   *
   * Backed by a packed file, so the ordinary case is one read rather than 11,519 of them plus eleven
   * thousand cards parsed — about 700ms of main process on every launch, since the Items tab is
   * usually the tab you left open.
   */
  catalogueJson(): Promise<string>;
  items: {
    status(): { pages: number; cover: string; doing?: number };
    shard(shard: number): SharedItemPage[];
    accept(pages: SharedItemPage[], shard?: number): number;
  };
  /**
   * Hand the client its half of the room, once main has built both.
   *
   * Late-bound because the share hub needs the wiki client (to answer an ask) and the wiki client
   * needs the hub (to send one) — a genuine cycle, broken here rather than by making one of them
   * construct the other.
   */
  joinRoom(link: PeerLink): void;
}

/** What the harvester needs from the room. Supplied by main; a no-op link means "working alone". */
export interface PeerLink {
  peers: () => PeerCoverage[];
  myId: () => string;
  askPeer: (peerId: string, shard: number) => void;
  claim: (shard: number | undefined) => void;
}

/**
 * Longest cache file name we'll write. A wiki title becomes a file name, and some are very long
 * ("Spell: …" plus a rank); Windows caps a path at 260 characters, so a title is truncated well short
 * of it to leave room for the cache directory. Collisions between two titles that agree for this many
 * characters would only cost a re-fetch.
 */
const MAX_CACHE_KEY = 120;

function cacheKey(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, "_").slice(0, MAX_CACHE_KEY);
}

function toResult(title: string): SearchResult {
  return { title, wikiPath: `/${title.replace(/ /g, "_")}` };
}

/** A title list mirrored to disk, refreshed in the background when stale. */
interface CachedIndex {
  get(): string[] | null;
  ensureFresh(): void;
  /** Re-fetch now, ignoring the TTL (for an explicit "refresh" from the user). */
  refresh(): Promise<void>;
}

function createCachedIndex(file: string, fetcher: () => Promise<string[]>, label: string): CachedIndex {
  let titles: string[] | null = null;
  let fetchedAt = 0;
  let loading: Promise<void> | null = null;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { fetchedAt: string; titles: string[] };
    titles = parsed.titles;
    fetchedAt = new Date(parsed.fetchedAt).getTime();
  } catch {
    /* built on first use */
  }

  const fresh = () => !!titles && Date.now() - fetchedAt < INDEX_TTL_MS;

  function refresh(): Promise<void> {
    if (loading) return loading;
    loading = (async () => {
      try {
        const fetched = await fetcher();
        if (fetched.length) {
          titles = fetched;
          fetchedAt = Date.now();
          fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), titles }, null, 2), "utf8");
          log.debug(`${label} index refreshed:`, fetched.length, "pages");
        }
      } catch (e) {
        log.warn(`${label} index refresh failed:`, (e as Error).message);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  return {
    get: () => titles,
    ensureFresh: () => {
      if (!fresh()) void refresh();
    },
    refresh,
  };
}

/** Does a page's category name match one of the eras the server has switched off? */
const isOutEraCategory = (set: Set<string>, cat: string) =>
  set.has(cat.replace(/^Category:\s*/i, "").replace(/_/g, " ").toLowerCase().trim());

/** Create a wiki client that caches parsed pages + search indexes under `cacheDir`. */
export function createWikiClient(cacheDir: string, opts: { ttlMs?: () => number } = {}): WikiClient {
  fs.mkdirSync(cacheDir, { recursive: true });
  /**
   * Read on every freshness test rather than captured, so changing the setting takes effect at once
   * — including for a harvest that is already running.
   */
  const ttlMs = opts.ttlMs ?? (() => DEFAULT_TTL_MS);
  const fileFor = (title: string) => path.join(cacheDir, `${cacheKey(title)}.json`);

  const titleIndex = createCachedIndex(path.join(cacheDir, "title-index.json"), fetchAllTitles, "title");
  const zoneIndex = createCachedIndex(
    path.join(cacheDir, "zone-index.json"),
    // Drop the handful of maintenance pages that sit in Category:Zones.
    () => fetchCategoryTitles(ZONES_CATEGORY).then((ts) => ts.filter((t) => !/cleanupproject/i.test(t))),
    "zone",
  );
  const zoneQuestsCache = new Map<string, SearchResult[]>();
  /**
   * The derived out-of-era zone list, mirrored to disk like the other indexes.
   *
   * On disk because it has to be **available offline and early**: the travel graph asks for it before
   * it can build, and a missed lookup would mean a graph confidently routing you through Kunark. A
   * stale list is much better than none — an era opens once, and the worst a day-old answer does is
   * leave a zone excluded slightly too long.
   */
  const outEraZoneIndex = createCachedIndex(
    path.join(cacheDir, "out-of-era-zones.json"),
    async () => {
      const outEra = await fetchOutEraCategorySet();
      // No era data means no exclusions, and silently excluding nothing is the failure that matters —
      // so refuse to overwrite a good list with an empty one (`createCachedIndex` keeps the old one
      // when a fetch yields nothing).
      if (!outEra.size) return [];
      if (!zoneIndex.get()?.length) await zoneIndex.refresh();
      const zones = zoneIndex.get() ?? [];
      if (!zones.length) return [];
      const cats = await fetchCategoriesFor(zones);
      return zones.filter((title) => (cats.get(title) ?? []).some((c) => isOutEraCategory(outEra, c)));
    },
    "out-of-era zone",
  );

  // Out-of-era category set, fetched once and refreshed on the index TTL.
  let outEraSet: Set<string> | null = null;
  let outEraAt = 0;
  async function ensureOutEraSet(): Promise<Set<string>> {
    if (outEraSet && Date.now() - outEraAt < INDEX_TTL_MS) return outEraSet;
    try {
      outEraSet = await fetchOutEraCategorySet();
      outEraAt = Date.now();
    } catch {
      outEraSet = outEraSet ?? new Set();
    }
    return outEraSet;
  }

  // Per-title out-of-era flag, cached for the session (search hits repeat a lot).
  const eraFlagCache = new Map<string, boolean>();

  /** Tag each result with `outOfEra` by looking up (and caching) its categories. */
  async function flagOutOfEra(results: SearchResult[]): Promise<SearchResult[]> {
    if (!results.length) return results;
    const outEra = await ensureOutEraSet();
    if (!outEra.size) return results;
    const need = results.map((r) => r.title).filter((t) => !eraFlagCache.has(t));
    if (need.length) {
      try {
        const cats = await fetchCategoriesFor(need);
        for (const t of need) {
          const list = cats.get(t) ?? [];
          eraFlagCache.set(t, list.some((c) => isOutEraCategory(outEra, c)));
        }
      } catch (e) {
        log.warn("era flag lookup failed:", (e as Error).message);
        for (const t of need) if (!eraFlagCache.has(t)) eraFlagCache.set(t, false);
      }
    }
    return results.map((r) => ({ ...r, outOfEra: eraFlagCache.get(r.title) ?? false }));
  }

  // Warm these shortly after startup so the first searches are already fuzzy — and so the travel
  // graph, which is built on first use, has the era list to hand rather than waiting on the network.
  titleIndex.ensureFresh();
  zoneIndex.ensureFresh();
  outEraZoneIndex.ensureFresh();

  function readCacheFile(file: string): { page: WikiPage; ageMs: number; version: number } | null {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw) as { version?: number; page?: WikiPage } & Partial<WikiPage>;
      // v2+ writes an envelope {version, page}; legacy entries were the bare WikiPage.
      const enveloped = typeof parsed.version === "number" && !!parsed.page;
      const page = (enveloped ? parsed.page : (parsed as WikiPage)) as WikiPage;
      const version = enveloped ? (parsed.version as number) : 1;
      return { page, ageMs: Date.now() - new Date(page.fetchedAt).getTime(), version };
    } catch {
      return null;
    }
  }

  /** The same read, by title — which is how everything but the catalogue walk asks for a page. */
  const readCache = (title: string) => readCacheFile(fileFor(title));

  /** Fuzzy-match `q` against a cached index; empty array if the index isn't ready. */
  function fuzzyOver(index: CachedIndex, q: string): SearchResult[] {
    index.ensureFresh();
    const titles = index.get();
    if (!titles || !titles.length) return [];
    return fuzzyRank(q, titles, (t) => t, { limit: 12, minScore: 0.45 }).map((r) => toResult(r.item));
  }


  async function getPageInternal(title: string, force = false): Promise<WikiPage | null> {
    const cached = readCache(title);
    // Only a current-version, unexpired entry is a hit; a stale-version entry is
    // re-parsed (but still kept below as an offline fallback).
    if (!force && cached && parsedCurrently(cached.page.kind, cached.version) && cached.ageMs < ttlMs()) {
      log.debug("cache hit", title);
      return cached.page;
    }
    try {
      // A graded item has no page of its own — the wiki knows "Dragoon Dirk", not "Dragoon Dirk
      // +2" — so a miss retries the base name (`names.ts`). The asked-for title is tried first,
      // so a build where the wiki *does* carry a grade still gets its own page, and the result
      // caches under the name we were asked about rather than paying for two fetches each time.
      const base = itemBaseName(title);
      const fetched = (await fetchPageHtml(title)) ?? (base !== title ? await fetchPageHtml(base) : null);
      if (!fetched) return cached?.page ?? null;
      const wikiPath = `/${fetched.title.replace(/ /g, "_")}`;
      const page = parseWikiPage(fetched.title, wikiPath, fetched.html);
      const outEra = await ensureOutEraSet();
      page.outOfEra = fetched.categories.some((c) => isOutEraCategory(outEra, c));
      try {
        fs.writeFileSync(fileFor(title), JSON.stringify({ version: CACHE_VERSION, page }, null, 2), "utf8");
        pageWritten(title);
      } catch (e) {
        log.warn("cache write failed", (e as Error).message);
      }
      return page;
    } catch (e) {
      log.warn("fetch failed, using cache if any:", (e as Error).message);
      return cached?.page ?? null;
    }
  }

  /**
   * The item-catalogue harvest (ADR 0153). Built here rather than in `main` because everything it
   * needs is this closure's: the roster comes from the same API client, "do we hold it?" is this
   * cache's own question, and fetching one page *is* `getPage` — so the trickle reuses the caching,
   * the version check and the era flagging rather than growing a second copy of any of them.
   */
  const harvestFile = path.join(cacheDir, "harvest.json");
  const harvestListeners: ((progress: HarvestProgress) => void)[] = [];

  /** No network, by contract: cached, parsed by the current parser, and still inside its TTL. */
  const holds = (title: string): boolean => {
    const hit = readCache(title);
    return !!hit && parsedCurrently(hit.page.kind, hit.version) && hit.ageMs < ttlMs();
  };

  function loadHarvest(): SavedHarvest | null {
    try {
      return JSON.parse(fs.readFileSync(harvestFile, "utf8")) as SavedHarvest;
    } catch {
      return null;
    }
  }

  /**
   * The shard index: which shards our roster touches, and which of them we hold outright.
   *
   * Owned by the client rather than by the harvester, because the *share hub* asks for it every
   * minute whether or not a run is going — the coverage bitmap is what the room coordinates on
   * ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)), so it has to exist
   * between runs and survive one being stopped.
   */
  let shardRoster: string[] = [];
  let byShard = new Map<number, string[]>();
  let present = emptyCoverage();
  let mine = emptyCoverage();
  let heldTitles = new Set<string>();
  let indexing: Promise<void> | null = null;
  let indexed = false;
  /** The shard we are fetching right now, published so nobody else spends eleven requests on it. */
  let claimed: number | undefined;

  function indexRoster(roster: string[]): void {
    shardRoster = roster;
    byShard = new Map();
    present = emptyCoverage();
    for (const title of roster) {
      const shard = shardOf(title);
      setShard(present, shard);
      const bucket = byShard.get(shard);
      if (bucket) bucket.push(title);
      else byShard.set(shard, [title]);
    }
  }

  /** Re-decide whether we hold a shard, by asking the cache about each of its titles. */
  function recheckShard(shard: number): void {
    const titles = byShard.get(shard) ?? [];
    let complete = titles.length > 0;
    for (const title of titles) {
      if (holds(title)) heldTitles.add(title);
      else {
        heldTitles.delete(title);
        complete = false;
      }
    }
    setShard(mine, shard, complete);
  }

  /**
   * Build the index once, from the roster the last run saved.
   *
   * Deliberately does **not** fetch a roster: this runs off the share hub's minute tick, and a tick
   * that quietly listed a wiki category would be exactly the "nothing fetches unasked" rule broken by
   * a background timer. Until somebody has run a harvest we simply advertise nothing, which is true.
   */
  function ensureShardIndex(): Promise<void> {
    if (indexed) return Promise.resolve();
    indexing ??= (async () => {
      const roster = loadHarvest()?.roster ?? [];
      if (roster.length) {
        indexRoster(roster);
        /**
         * **The titles come out of the pack, not out of a walk.**
         *
         * This is coverage for the peer room, and it is built on the share hub's first catalogue tick
         * — so it runs on *every launch*, whether or not anybody opens the Items tab. Asking
         * `cachedItemPages()` for the titles meant 11,519 synchronous file opens every time the app
         * started, which is also 11,519 real-time antimalware scans; on a machine with Defender
         * watching that folder it is enough to make the whole system crawl for the first few seconds.
         *
         * The pack already knows which titles we hold, so this costs one file read.
         */
        await catalogueTitles();
        const held = new Set(heldTitleList ?? []);
        heldTitles = new Set();
        mine = emptyCoverage();
        for (const [shard, titles] of byShard) {
          let complete = titles.length > 0;
          for (const title of titles) {
            // The catalogue only holds items; anything else in the roster (a zone, a quest) still has
            // to be asked about directly, and there are far fewer of those.
            if (held.has(title) || holds(title)) heldTitles.add(title);
            else complete = false;
          }
          setShard(mine, shard, complete);
        }
        log.debug("shard index:", heldTitles.size, "of", roster.length, "held");
      }
      indexed = true;
      indexing = null;
    })();
    return indexing;
  }

  /**
   * The titles we hold, from the pack when there is one.
   *
   * Falls through to the walk only when the pack is missing or stale — which is a rebuild we were
   * going to have to do anyway.
   */
  async function catalogueTitles(): Promise<void> {
    if (heldTitleList) return;
    await catalogueJson();
    if (heldTitleList) return;
    // The pack had no usable titles line (an older pack, or a malformed one). One walk, then it is
    // written into the pack for next time.
    heldTitleList = (await cachedItemPages()).map((i) => i.title);
  }

  /** How the room is told what we hold, and what we're working on. Cheap: no page is read. */
  function itemStatus(): { pages: number; cover: string; doing?: number } {
    void ensureShardIndex();
    return { pages: heldTitles.size, cover: encodeCoverage(mine), doing: claimed };
  }

  /** The pages of one shard, stripped to what crosses the wire. */
  function itemShard(shard: number): SharedItemPage[] {
    const out: SharedItemPage[] = [];
    for (const title of byShard.get(shard) ?? []) {
      const hit = readCache(title);
      if (!hit || !parsedCurrently(hit.page.kind, hit.version) || hit.ageMs >= ttlMs()) continue;
      const { kind, title: name, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs } = hit.page;
      // The same kinds the reader accepts: items and recipes are the catalogue; zones and quests are
      // what give them a level, and a mob page is read when we have one (ADR 0163).
      if (kind !== "item" && kind !== "recipe" && kind !== "mob" && kind !== "quest" && kind !== "zone") continue;
      // The age goes with it, so the page keeps expiring on schedule however many peers it passes
      // through. The receiver clamps it to no later than their own now, so it can only be honest.
      out.push({ kind, title: name, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs });
    }
    return out;
  }

  /**
   * Take item pages a peer handed us into the cache.
   *
   * Written exactly as a fetched page is, under the current `CACHE_VERSION` and stamped **now** — a
   * peer's copy of a public wiki page is as good as ours, and both expire on our own TTL, so a page
   * somebody got wrong is corrected by the source without anybody intervening. A page we already
   * hold is left alone: our own fetch outranks a copy of one.
   */
  function acceptItems(pages: SharedItemPage[], shard?: number): number {
    let taken = 0;
    const now = Date.now();
    for (const page of pages) {
      // **The page's age travels with it.** Stamping "now" on receipt would be the bug that makes a
      // room's cache immortal: A shares to B on day 13, B to C on day 26, and a page nobody has
      // re-checked since it was first fetched stays permanently "fresh". `readSharedPage` has
      // already clamped the sender's stamp to no later than now, so the worst it can be is honest.
      const stamped = page.fetchedAt ? Date.parse(page.fetchedAt) : NaN;
      const fetchedAt = Number.isFinite(stamped) ? Math.min(stamped, now) : now;
      // Already expired by our own clock: taking it would mean writing a page that is immediately
      // due for re-fetch, which is worse than not having it — `holds` would say no and the harvest
      // would go and get it anyway, having paid for the message.
      if (now - fetchedAt >= ttlMs()) continue;

      /**
       * **The newest copy in the room wins.**
       *
       * Skipping anything we already hold was the obvious rule and the wrong one: it meant a peer who
       * had re-pulled a page this morning could not give it to somebody holding a copy from a
       * fortnight ago, and every install expired and re-fetched the same page independently. Comparing
       * the *pull date* instead means one re-pull serves the room, and everyone's expiry clock is set
       * by the freshest fetch anybody actually made
       * ([ADR 0164](../../specs/decisions/0164-the-newest-copy-in-the-room-wins.md)).
       *
       * Strictly newer, so an equal stamp is left alone — the common case is a page we both hold at
       * the same age, and rewriting it would be a disk write per shard for no change.
       */
      const held = readCache(page.title);
      if (held && parsedCurrently(held.page.kind, held.version)) {
        const ours = Date.parse(held.page.fetchedAt);
        if (Number.isFinite(ours) && ours >= fetchedAt) continue;
      }
      const full: WikiPage = { ...page, fetchedAt: new Date(fetchedAt).toISOString() };
      try {
        fs.writeFileSync(fileFor(page.title), JSON.stringify({ version: CACHE_VERSION, page: full }, null, 2), "utf8");
        taken++;
        // The shard is re-checked once for the whole batch below, so only the derived data goes here.
        dropDerived();
      } catch (e) {
        log.warn("could not keep a shared page:", (e as Error).message);
      }
    }
    if (taken) recheckShard(shard ?? (pages[0] ? shardOf(pages[0].title) : -1));
    return taken;
  }

  /** How the harvester reaches the room. Late-bound: main wires it once both halves exist. */
  let room: PeerLink = { peers: () => [], myId: () => "solo", askPeer: () => {}, claim: () => {} };

  /**
   * Every item page on disk, with a **level** worked out for each — **held in memory between calls.**
   *
   * Walking 11,519 cache files costs ~350ms of *synchronous* file reads, and main is the process every
   * window's IPC goes through: doing it on each Items tab mount froze the whole app for a third of a
   * second, every time. The answer is the same until we write a page, so it is computed once and kept.
   *
   * A named function rather than only a method, because the harvest roster needs it too: the zones and
   * quests worth fetching are exactly the ones these items name (see `harvestRoster`).
   */
  /**
   * The built rows, packed into **one file**.
   *
   * The walk is 11,519 individual reads (~500ms) and building rows from them parses as many stat
   * cards (~200ms) — seven hundred milliseconds before a window sees anything, paid on every launch
   * because the Items tab is usually the tab you left open. None of that work changes until a page
   * does, so the *answer* is written down: one file, one read, one deserialize.
   *
   * `v8.serialize` rather than JSON because it is markedly quicker on a structure this shape and
   * keeps the shared arrays shared. It is version-specific, which is fine for a cache: a Node upgrade
   * makes the pack unreadable, `readPack` says so by returning nothing, and the walk rebuilds it.
   */
  const packFile = path.join(cacheDir, "catalogue.json");
  /**
   * What the pack has to agree with to be usable.
   *
   * The parse version because a re-parse changes what a page becomes, and the *row* shape because
   * this file is `ItemRow[]` — a build that adds a field to a row must not read yesterday's rows and
   * quietly serve them without it.
   */
  const PACK_SIGNATURE = `v${CACHE_VERSION}/rows6`;
  /** Set once when a write invalidates the pack, so a harvest doesn't unlink a file per page. */
  let packDropped = false;

  /**
   * The pack holds **JSON text**, and is handed to a window as text.
   *
   * This is the difference between the Items tab taking 100ms to populate and taking ten seconds.
   * `contextIsolation` is on, so everything a window receives crosses `contextBridge`, which deep-
   * copies an object graph **property by property** — and 11,125 rows is well over a hundred thousand
   * objects. That copy runs on the renderer's own thread, which is why it presented as the whole app
   * freezing rather than as a slow load. A **string is one value**: it crosses in a single copy, and
   * `JSON.parse` on the far side is native and fast.
   *
   * So the built answer is stored as text and passed through as text, and main never parses it at
   * all — a warm launch is one file read.
   */
  /**
   * Three lines: the signature, the titles we hold, then the rows.
   *
   * The titles are in here because the **shard index** wants them and nothing else about the pages,
   * and asking the walk for them was costing a full 11,519-file read on **every launch** — the share
   * hub builds coverage on its first catalogue tick, so it happened whether or not anybody opened the
   * Items tab. Eleven and a half thousand file opens in a burst is also eleven and a half thousand
   * real-time antimalware scans, which is enough to make a machine feel ill.
   *
   * Split by line rather than parsed as one object, so the *rows* line can be handed to a window as
   * text without main ever parsing it (see the `contextBridge` note above).
   */
  function readPack(): { titles: string; rows: string } | null {
    try {
      const held = fs.readFileSync(packFile, "utf8");
      // A mismatched pack is never parsed: a build that changed the row shape must not read
      // yesterday's rows and serve them as this shape.
      const first = held.indexOf("\n");
      if (first < 0 || held.slice(0, first) !== PACK_SIGNATURE) return null;
      const second = held.indexOf("\n", first + 1);
      if (second < 0) return null;
      return { titles: held.slice(first + 1, second), rows: held.slice(second + 1) };
    } catch {
      // Missing or half-written. Same answer either way: build it again.
      return null;
    }
  }

  function writePack(titles: string, rows: string): void {
    // Fire and forget: the catalogue is already in hand, and a pack that failed to write costs the
    // next launch a rebuild rather than anything worse.
    void fs.promises
      .writeFile(packFile, `${PACK_SIGNATURE}\n${titles}\n${rows}`, "utf8")
      .then(() => {
        packDropped = false;
      })
      .catch((e: unknown) => log.warn("couldn't write the catalogue pack:", (e as Error).message));
  }

  async function cachedItemPages(): Promise<CachedItem[]> {
    if (catalogue) return catalogue;
    // One walk, however many callers arrive at once: the Items tab mounting while the share hub's
    // tick asks for coverage is the ordinary case, not a rare one.
    building ??= buildCatalogue().finally(() => {
      building = null;
    });
    return building;
  }

  /** The catalogue, and the build in flight. `null` means "not built, or a page has since changed". */
  let catalogue: CachedItem[] | null = null;
  /**
   * The level evidence gathered on the same walk: mob and quest names to their level ranges.
   *
   * Kept beside the catalogue because `itemRows` needs it to place an item, and the *walk* is what
   * knows it — rows built without it silently get a zone estimate for everything.
   */
  let levelEvidence: LevelSources = { mob: () => undefined, quest: () => undefined };
  /** The built catalogue **as JSON text** — see `readPack` for why text rather than objects. */
  let rowCache: string | null = null;
  let rowBuilding: Promise<string> | null = null;
  /**
   * The titles the catalogue holds, for the shard index.
   *
   * Kept apart from the rows because it is the *only* thing coverage needs, and reading it out of the
   * pack is what stops every launch walking the whole cache to answer one question.
   */
  let heldTitleList: string[] | null = null;
  let building: Promise<CachedItem[]> | null = null;

  /**
   * How often the walk lets the event loop breathe.
   *
   * Thousands of synchronous reads in one go is one unbroken block on the process that serves every
   * window. Chunked, the longest stall is a few milliseconds and the app stays usable while the
   * catalogue builds behind it.
   */
  const YIELD_EVERY = 100;
  const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  /**
   * A page was written, so what we hold has moved.
   *
   * The catalogue is dropped and rebuilt lazily — it is a list of eleven thousand things and nobody is
   * looking at it this instant. The **shard index is patched in place**, because something *is*: the
   * share hub reads it on every catalogue tick, and a harvest writes a page a second. Tearing it down
   * per write would mean a full walk on the next tick, once every eleven seconds, for three hours.
   * Re-checking the one shard the page belongs to is about eleven reads.
   */
  /**
   * Everything derived from the pages, dropped together.
   *
   * One function because they have to go together and one caller already forgot: `acceptItems` used
   * to clear the item list alone, which left the *rows* — and the pack on disk — describing a
   * catalogue that no longer existed, so a page a peer sent you never appeared until you restarted.
   */
  function dropDerived(): void {
    catalogue = null;
    rowCache = null;
    heldTitleList = null;
    if (packDropped) return;
    packDropped = true;
    void fs.promises.rm(packFile, { force: true }).catch(() => {
      /* a pack we couldn't delete is caught by its signature, or simply rebuilt over */
    });
  }

  async function catalogueJson(): Promise<string> {
    if (rowCache) return rowCache;
    rowBuilding ??= (async () => {
      const startedAt = Date.now();
      const packed = readPack();
      if (packed) {
        log.debug("catalogue: read from the pack in", `${Date.now() - startedAt}ms`);
        rowCache = packed.rows;
        heldTitleList = readTitles(packed.titles);
        return packed.rows;
      }
      const items = await cachedItemPages();
      const rows = forTransfer(itemRows(items, levelEvidence));
      const json = JSON.stringify(rows);
      const titles = items.map((i) => i.title);
      log.debug("catalogue:", rows.length, "rows built in", `${Date.now() - startedAt}ms`);
      rowCache = json;
      heldTitleList = titles;
      writePack(JSON.stringify(titles), json);
      return json;
    })().finally(() => {
      rowBuilding = null;
    });
    return rowBuilding;
  }
  function readTitles(json: string): string[] | null {
    try {
      const held = JSON.parse(json) as unknown;
      return Array.isArray(held) && held.every((t) => typeof t === "string") ? (held as string[]) : null;
    } catch {
      return null;
    }
  }

  function pageWritten(title: string): void {
    dropDerived();
    if (!indexed) return; // nothing built yet to keep current
    const shard = shardOf(title);
    if (byShard.has(shard)) recheckShard(shard);
  }

  async function buildCatalogue(): Promise<CachedItem[]> {
    // The cache directory also holds the mirrored title/zone indexes, which have no `kind` and so
    // fall out of the filter below on their own — there is no name list to keep in step with.
    const startedAt = Date.now();
    let files: string[];
    try {
      files = await fs.promises.readdir(cacheDir);
    } catch (e) {
      log.warn("couldn't read the page cache:", (e as Error).message);
      return [];
    }
    const items: CachedItem[] = [];
    /** Level evidence gathered on the same walk — see below. Keyed folded, since an item's sources
     *  write a mob's name in the log's case ("an aviak quetzel") and its page is titled in the
     *  wiki's ("An aviak quetzel"). */
    const mobLevels = new Map<string, { min: number; max: number }>();
    const questLevels = new Map<string, { min: number; max: number }>();
    let read = 0;
    for (const entry of files) {
      if (!entry.endsWith(".json")) continue;
      // Thousands of synchronous reads, chunked so the process that serves every window is never
      // blocked for more than a few milliseconds at a time.
      if (++read % YIELD_EVERY === 0) await breathe();
      const hit = readCacheFile(path.join(cacheDir, entry));
      // Age is deliberately ignored — a week-old card is still a card, and the fetch that would
      // refresh it belongs to `getPage`, which the user has to ask for. The parser **version** is
      // not ignored: a page parsed before item cards existed has no card where it should have one,
      // and a catalogue built on those would silently be missing stats rather than items.
      if (!hit || !parsedCurrently(hit.page.kind, hit.version)) continue;
      const { page } = hit;
      // Mobs and quests are not items, but they are what says how hard an item is to get — so the
      // one pass that reads the cache collects their levels while it is here rather than walking
      // eleven thousand files a second time (ADR 0163).
      if (page.kind === "mob") {
        // A mob page we happen to hold — the Hunt tab fetches these as you use it — is as good an
        // answer as the zone's table, and is preferred because it describes that spawn specifically.
        // Nothing goes and *gets* one: that is the 4,214-page crawl this design avoids.
        const level = mobCardLevel(page.card?.lines);
        if (level) mobLevels.set(npcKey(page.title), level);
        continue;
      }
      if (page.kind === "zone") {
        // **The cheap rung, and where nearly every level actually comes from.** One zone page states
        // the level of every mob in the zone (ADR 0163). A mob page already read wins; otherwise this
        // is the answer.
        for (const npc of page.npcs ?? []) {
          const key = npcKey(npc.name);
          if (mobLevels.has(key)) continue;
          const level = parseLevelRange(npc.level);
          if (level) mobLevels.set(key, level);
        }
        continue;
      }
      if (page.kind === "quest") {
        const level = questCardLevel(page.card?.lines);
        if (level) questLevels.set(page.title.trim().toLowerCase(), level);
        continue;
      }
      // A recipe is an item page that happens to be craftable, so it carries a card and belongs
      // here. Zones and spells are neither items nor evidence about one.
      if (page.kind !== "item" && page.kind !== "recipe") continue;
      items.push({
        title: page.title,
        origin: "wiki",
        wikiPath: page.wikiPath,
        card: page.card,
        sources: page.sources,
        outOfEra: page.outOfEra,
        fetchedAt: page.fetchedAt,
      });
    }

    // Levels last, because an item's evidence may live in a file the walk had not reached yet when
    // the item itself was read. `itemLevel` falls through mob → quest → zone, so every item that
    // names a placeable zone gets *something* even with no mob page held.
    const lookup: LevelSources = {
      mob: (name: string) => mobLevels.get(npcKey(name)),
      quest: (name: string) => questLevels.get(name.trim().toLowerCase()),
    };
    levelEvidence = lookup;
    let placed = 0;
    for (const item of items) {
      // Levels are worked out by `itemRows`, where the card is already parsed — see `ItemRow.level`.
      // Here we only keep the evidence they are read from.
      if (itemLevel(item.sources ?? [], lookup)) placed++;
    }
    log.debug(
      "catalogue:", items.length, "items;",
      mobLevels.size, "mob levels,", questLevels.size, "quest levels;",
      placed, "items placed", `in ${Date.now() - startedAt}ms`,
    );
    catalogue = items;
    return items;
  }

  /**
   * What a run covers: every item page, **plus the mobs and quests those items name**.
   *
   * The second half is what makes an item's *level* a fact rather than a guess — the wiki never
   * states an item's level, so it is read off the mob that drops it or the quest that gives it
   * ([ADR 0163](../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)). Measured on
   * a filled catalogue: 4,214 distinct mobs and 1,547 quests, so a run grows from 11,136 pages to
   * about 16,900.
   *
   * The sources can only be *discovered from items already held*, so a first run on an empty cache is
   * items-only and the second picks up the thousands of mobs the first just learned about. That is
   * why the button says "Check for new items" afterwards and why pressing it again is worth doing —
   * it is not a no-op, it is the half that fills in the levels.
   */
  async function harvestRoster(): Promise<string[]> {
    const items = await fetchCategoryTitles(ITEMS_CATEGORY);
    const roster = new Set(items);
    // Folded, so "an aviak quetzel" and "An aviak quetzel" are not fetched as two pages.
    const seen = new Set(items.map((t) => t.trim().toLowerCase()));
    for (const item of await cachedItemPages()) {
      for (const source of item.sources ?? []) {
        if (source.kind !== "drop" && source.kind !== "quest") continue;
        const name = source.where?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        roster.add(name);
      }
    }
    log.debug("harvest roster:", items.length, "items +", roster.size - items.length, "sources");
    return [...roster];
  }

  const harvester = createHarvester({
    roster: harvestRoster,
    // (see `cachedItemPages` below for the catalogue this fills)
    held: holds,
    heldTitles: async () => {
      await ensureShardIndex();
      return heldTitles;
    },
    fetch: async (title) => !!(await getPageInternal(title)),
    peers: () => room.peers(),
    myId: () => room.myId(),
    askPeer: (peerId, shard) => room.askPeer(peerId, shard),
    claim: (shard) => {
      claimed = shard;
      room.claim(shard);
    },
    load: loadHarvest,
    save: (state) => {
      try {
        fs.writeFileSync(harvestFile, JSON.stringify(state), "utf8");
      } catch (e) {
        log.warn("harvest checkpoint failed:", (e as Error).message);
      }
      // A run that has just learned a roster is the moment the index becomes buildable.
      if (!indexed && state.roster.length) {
        indexRoster(state.roster);
        indexed = true;
      }
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    onProgress: (progress) => {
      for (const listener of harvestListeners) listener(progress);
    },
  });

  return {
    cachedItems: cachedItemPages,

    async refresh() {
      // Drop the session's derived caches, then force both mirrored indexes to re-fetch — so a
      // page just added to the wiki is searchable now, not at the weekly TTL.
      eraFlagCache.clear();
      zoneQuestsCache.clear();
      outEraSet = null;
      outEraAt = 0;
      await Promise.all([titleIndex.refresh(), zoneIndex.refresh()]);
      // After the zone index, since it's derived from it.
      await outEraZoneIndex.refresh();
      log.debug("wiki indexes refreshed on demand");
    },

    bestKnownReading(readings) {
      titleIndex.ensureFresh();
      const chosen = bestReading(readings, titleIndex.get() ?? []);
      if (chosen !== readings[0]) log.debug(`OCR reading corrected: ${JSON.stringify(readings[0])} → ${JSON.stringify(chosen)}`);
      return chosen;
    },

    async search(term) {
      // A grade is dropped from the query as well as from the index side of a match: a name read
      // off a tooltip ("Dragoon Dirk +2") has to find the page the wiki actually has, and the
      // stray "+2" token was enough to drag a good fuzzy match under the threshold (`names.ts`).
      const q = itemBaseName(term.trim());
      if (q.length < 2) return [];
      const local = fuzzyOver(titleIndex, q);
      if (local.length) return flagOutOfEra(local);
      const hits = await opensearch(q);
      return flagOutOfEra(hits.length ? hits : await fullTextSearch(q));
    },

    async outOfEraZones() {
      // A cached list is used as-is (`ensureFresh` re-reads in the background on the TTL); only an
      // empty one waits on the network, since "no exclusions" is the answer that would do harm.
      if (!outEraZoneIndex.get()?.length) await outEraZoneIndex.refresh();
      return outEraZoneIndex.get() ?? [];
    },

    async searchZones(term) {
      // Same for a zone's difficulty: one wiki page describes Blackburrow at every difficulty.
      const q = zoneBaseName(term.trim());
      if (q.length < 2) return [];
      // Zones aren't era-flagged — the picker runs per keystroke and you may want to
      // browse any zone regardless of era.
      const zones = fuzzyOver(zoneIndex, q);
      if (zones.length) return zones;
      return this.search(q); // fallback (already era-flagged)
    },

    async questsByZone(zone) {
      const z = zoneBaseName(zone.trim());
      if (!z) return [];
      const cached = zoneQuestsCache.get(z);
      if (cached) return cached;
      try {
        // Quests link the zone under any of its aliases; union backlinks∩Quests
        // over all of them (see api.fetchQuestBacklinks for why search can't do this).
        const aliases = await fetchRedirectAliases(z);
        const quests = new Map<string, SearchResult>();
        for (const alias of aliases) {
          for (const q of await fetchQuestBacklinks(alias, QUESTS_CATEGORY)) {
            if (!quests.has(q.title)) quests.set(q.title, q);
          }
        }
        const sorted = [...quests.values()].sort((a, b) => a.title.localeCompare(b.title));
        const result = await flagOutOfEra(sorted);
        zoneQuestsCache.set(z, result);
        return result;
      } catch (e) {
        log.warn("questsByZone failed:", (e as Error).message);
        return [];
      }
    },

    getPage: (title) => getPageInternal(title),
    refreshPage: (title) => getPageInternal(title, true),

    harvest: harvester,
    onHarvest(listener) {
      harvestListeners.push(listener);
    },

    items: { status: itemStatus, shard: itemShard, accept: acceptItems },
    levelSources: () => levelEvidence,

    catalogueJson,

  /** The titles line, read defensively: a malformed pack is a rebuild, never a throw. */
    joinRoom(link) {
      room = link;
    },
  };
}
