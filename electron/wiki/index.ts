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
import { fuzzyRank } from "../../src/shared/fuzzy";
import { itemBaseName, zoneBaseName } from "../../src/shared/names";
import { createLogger } from "../../src/shared/logging";
import type { SearchResult, WikiPage } from "../../src/shared/types";

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
   * Force a re-fetch of the mirrored search indexes now, instead of waiting out the weekly TTL —
   * so a page added to the wiki shows up in search straight away. Also drops the session's
   * derived caches (era flags, zone quests) so they rebuild against the fresh data.
   */
  refresh(): Promise<void>;
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

  function readCache(title: string): { page: WikiPage; ageMs: number; version: number } | null {
    try {
      const raw = fs.readFileSync(fileFor(title), "utf8");
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

  /** Fuzzy-match `q` against a cached index; empty array if the index isn't ready. */
  function fuzzyOver(index: CachedIndex, q: string): SearchResult[] {
    index.ensureFresh();
    const titles = index.get();
    if (!titles || !titles.length) return [];
    return fuzzyRank(q, titles, (t) => t, { limit: 12, minScore: 0.45 }).map((r) => toResult(r.item));
  }

  return {
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

    async getPage(title) {
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
    },
  };
}
