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
import { fuzzyRank } from "../../src/shared/fuzzy";
import { bestReading } from "../../src/shared/ocr-variants";
import { itemBaseName, zoneBaseName } from "../../src/shared/names";
import { createLogger } from "../../src/shared/logging";
import type { CachedItem, SearchResult, WikiPage } from "../../src/shared/types";

const log = createLogger("wiki");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // a week; wiki data changes slowly
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
const CACHE_VERSION = 12;

// Wiki taxonomy (confirmed against the live wiki). Kept as named constants so a
// category rename only needs editing here.
const ZONES_CATEGORY = "Zones";
const QUESTS_CATEGORY = "Quests";
/** 11,136 pages on the live wiki — the roster the item catalogue is filled from (ADR 0153). */
const ITEMS_CATEGORY = "Items";

export interface WikiClient {
  search(term: string): Promise<SearchResult[]>;
  getPage(title: string): Promise<WikiPage | null>;
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
   * Read fresh from disk on each call rather than held in memory: a page opened a minute ago belongs
   * in the next search, and a cache of a cache is one more thing that can go stale.
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
export function createWikiClient(cacheDir: string): WikiClient {
  fs.mkdirSync(cacheDir, { recursive: true });
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


  async function getPageInternal(title: string): Promise<WikiPage | null> {
    const cached = readCache(title);
    // Only a current-version, unexpired entry is a hit; a stale-version entry is
    // re-parsed (but still kept below as an offline fallback).
    if (cached && cached.version === CACHE_VERSION && cached.ageMs < CACHE_TTL_MS) {
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
    return !!hit && hit.version === CACHE_VERSION && hit.ageMs < CACHE_TTL_MS;
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
        heldTitles = new Set();
        mine = emptyCoverage();
        for (const shard of byShard.keys()) recheckShard(shard);
        log.debug("shard index:", heldTitles.size, "of", roster.length, "held");
      }
      indexed = true;
      indexing = null;
    })();
    return indexing;
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
      if (!hit || hit.version !== CACHE_VERSION || hit.ageMs >= CACHE_TTL_MS) continue;
      const { kind, title: name, wikiPath, sources, components, rewards, card, outOfEra } = hit.page;
      // Only items travel under this kind, and `fetchedAt` never does — the receiver stamps its own,
      // so a peer cannot reach into somebody else's cache expiry.
      if (kind !== "item" && kind !== "recipe") continue;
      out.push({ kind, title: name, wikiPath, sources, components, rewards, card, outOfEra });
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
    for (const page of pages) {
      if (holds(page.title)) continue;
      const full: WikiPage = { ...page, fetchedAt: new Date().toISOString() };
      try {
        fs.writeFileSync(fileFor(page.title), JSON.stringify({ version: CACHE_VERSION, page: full }, null, 2), "utf8");
        taken++;
      } catch (e) {
        log.warn("could not keep a shared page:", (e as Error).message);
      }
    }
    if (taken) recheckShard(shard ?? (pages[0] ? shardOf(pages[0].title) : -1));
    return taken;
  }

  /** How the harvester reaches the room. Late-bound: main wires it once both halves exist. */
  let room: PeerLink = { peers: () => [], myId: () => "solo", askPeer: () => {}, claim: () => {} };

  const harvester = createHarvester({
    roster: () => fetchCategoryTitles(ITEMS_CATEGORY),
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
    async cachedItems() {
      // The cache directory also holds the mirrored title/zone indexes, which have no `kind` and so
      // fall out of the filter below on their own — there is no name list to keep in step with.
      let files: string[];
      try {
        files = await fs.promises.readdir(cacheDir);
      } catch (e) {
        log.warn("couldn't read the page cache:", (e as Error).message);
        return [];
      }
      const items: CachedItem[] = [];
      for (const entry of files) {
        if (!entry.endsWith(".json")) continue;
        const hit = readCacheFile(path.join(cacheDir, entry));
        // Age is deliberately ignored — a week-old card is still a card, and the fetch that would
        // refresh it belongs to `getPage`, which the user has to ask for. The parser **version** is
        // not ignored: a page parsed before item cards existed has no card where it should have one,
        // and a catalogue built on those would silently be missing stats rather than items.
        if (!hit || hit.version !== CACHE_VERSION) continue;
        const { page } = hit;
        // A recipe is an item page that happens to be craftable, so it carries a card and belongs
        // here. Quests, mobs, zones and spells are not items and have nothing to search by stat.
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
      log.debug("catalogue:", items.length, "cached item pages");
      return items;
    },

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

    getPage: getPageInternal,

    harvest: harvester,
    onHarvest(listener) {
      harvestListeners.push(listener);
    },

    items: { status: itemStatus, shard: itemShard, accept: acceptItems },
    joinRoom(link) {
      room = link;
    },
  };
}
