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
import { createLogger } from "../../src/shared/logging";
import type { SearchResult, WikiPage } from "../../src/shared/types";

const log = createLogger("wiki");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // a week; wiki data changes slowly
const INDEX_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// Bump whenever parse.ts changes how a page becomes a WikiPage (new page kinds,
// different sources/components). Cached pages carry the version they were parsed
// under; a mismatch forces a re-parse, so a parser fix reaches every page instead
// of being masked by week-old cache entries. (v2: mob/zone classification + loot.)
const CACHE_VERSION = 2;

// Wiki taxonomy (confirmed against the live wiki). Kept as named constants so a
// category rename only needs editing here.
const ZONES_CATEGORY = "Zones";
const QUESTS_CATEGORY = "Quests";

export interface WikiClient {
  search(term: string): Promise<SearchResult[]>;
  getPage(title: string): Promise<WikiPage | null>;
  searchZones(term: string): Promise<SearchResult[]>;
  questsByZone(zone: string): Promise<SearchResult[]>;
}

function cacheKey(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, "_").slice(0, 120);
}

function toResult(title: string): SearchResult {
  return { title, wikiPath: `/${title.replace(/ /g, "_")}` };
}

/** A title list mirrored to disk, refreshed in the background when stale. */
interface CachedIndex {
  get(): string[] | null;
  ensureFresh(): void;
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
  };
}

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

  const isOutEraCategory = (set: Set<string>, cat: string) =>
    set.has(cat.replace(/^Category:\s*/i, "").replace(/_/g, " ").toLowerCase().trim());

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

  // Warm both shortly after startup so the first searches are already fuzzy.
  titleIndex.ensureFresh();
  zoneIndex.ensureFresh();

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
    async search(term) {
      const q = term.trim();
      if (q.length < 2) return [];
      const local = fuzzyOver(titleIndex, q);
      if (local.length) return flagOutOfEra(local);
      const hits = await opensearch(q);
      return flagOutOfEra(hits.length ? hits : await fullTextSearch(q));
    },

    async searchZones(term) {
      const q = term.trim();
      if (q.length < 2) return [];
      // Zones aren't era-flagged — the picker runs per keystroke and you may want to
      // browse any zone regardless of era.
      const zones = fuzzyOver(zoneIndex, q);
      if (zones.length) return zones;
      return this.search(q); // fallback (already era-flagged)
    },

    async questsByZone(zone) {
      const z = zone.trim();
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
        const fetched = await fetchPageHtml(title);
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
