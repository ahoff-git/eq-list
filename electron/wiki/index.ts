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
  fetchCategorySlice,
  fetchRecentChanges,
  CHANGES_RETENTION_MS,
} from "./api";
import { exploreCategories, EXPLORE_SEEDS } from "./explore";
import { belongsToRoster, planChanges, trackingCurrent } from "./changes";
import { parseWikiPage } from "./parse";
import { createPageStore } from "./page-store";
import { createHarvester, type HarvestProgress, type SavedHarvest } from "./harvest";
import {
  countShards,
  emptyCoverage,
  encodeCoverage,
  roomOffersMore,
  setShard,
  shardOf,
  type PeerCoverage,
} from "../../src/shared/item-shards";
import { candidatesFrom, probeOrder, type Verdict } from "../../src/shared/wiki-shape";
import type { SharedItemPage } from "../../src/shared/peer-share";
import { itemLevel, mobCardLevel, npcKey, parseLevelRange, questCardLevel, type LevelSources } from "../../src/shared/item-levels";
import { fuzzyRank } from "../../src/shared/fuzzy";
import { normalizeItemName } from "../../src/shared/grouping";
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
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 90;

/**
 * The ceiling when we have **not** been tracking changes — the old default, and the old behaviour.
 *
 * A page kept for ninety days is only defensible while the wiki is telling us what it edits
 * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)). An install that has never
 * polled, or has been away longer than the wiki remembers, has no such evidence, so it falls back to
 * a fortnight and re-fetches on the clock as it always did.
 */
const UNTRACKED_TTL_MS = 1000 * 60 * 60 * 24 * 14;
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
// v14: zone and quest pages carry their outbound content links — the wiki's *shape*, which is how a
// page the category walk never files as an item is found at all (ADR 0180).
// v15: quest turn-ins also match a quantity-less "loot a/the <item>" mention, not only a stated
// quantity — most multi-step quests never say "1 Gnoll's Eye", they just say "loot a Gnoll's Eye".
// v16: a quest whose walkthrough is split across two headings (e.g. "TLDR; Walkthrough" and "Full
// Walkthrough") now reads all of them — a page with only the first parsed missed every turn-in the
// rest of the prose named.
// v17: turn-ins also match a quantity-less "get <item>" mention (a checklist-style "**Get** Koalindl
// Fish" bullet, not only "loot"), and anything that also names the quest's own reward is dropped from
// the turn-in list — you receive that, you don't shop for it.
// v18: a quantity/verb cue is read from the mention's own <li>/<p>/<dd>/<td>, not the whole flattened
// section — a coordinate ending one <li> ("Barbarian Jaw: +1465, -4500, -230") was bleeding into the
// *next* <li>'s link as its quantity ("230 Barbarian Skull"), fabricating triple-digit shopping-list
// counts on any quest with a ground-spawn coordinate list.
// v19: turn-ins also match a link immediately followed by "is/are dropped" — a page that names the
// item only in its own drop-source sentence ("The Shining Metallic Robes is dropped rarely off the
// ghoul arch magi") had no quantity, "loot", or "get" cue for v18 to find at all.
// v20: that drop-source cue now also reads a bare active "drop(s) from" (no "is/are") and a
// passive "purchas…" under any modal auxiliary ("may be purchased", "can be purchased") — v19 only
// caught the "is/are dropped" phrasing, and most drop-source sentences on the wiki use the plainer
// "X drops from Y" or "X may be purchased from Y" instead.
// v21: a "Checklist" heading is now merged in alongside "Walkthrough" (some quests split their
// turn-in list into one of these plus a narrative "Walkthrough", and a merge keyed only on
// /walkthrough/i read nothing at all off the "Checklist" half), and the forward "loot"/"get" cue
// also matches "buy" — deliberately not "find", which on inspection tags NPCs ("find Toxdil") as
// readily as items ("find The Oblong Bottle").
const CACHE_VERSION = 21;

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
  // v14 added `links` to zones as well as v13's `npcs`. Zones are untouched by v15, so they stay here
  // rather than following the floor up — a zone page parsed at v14 is still exactly what v15 would make.
  zone: 14,
  // v16: also merges every heading matching "walkthrough" instead of reading only the first — a quest
  // cached at v14 or v15 may be missing turn-ins that only appeared past a second such heading.
  // v17: also catches "get <item>" turn-ins and excludes anything that's also the quest's reward.
  // v18: a cached quest may hold a fabricated triple-digit quantity from the cross-<li> bleed; it has
  // to be re-parsed to drop that, not merely to gain something new.
  // v19: also catches an item named only in its own "is/are dropped" sentence.
  // v20: that cue also covers bare "drop(s) from" and modal-passive "purchas…".
  // v21: also merges a "Checklist" heading in, and the forward cue also matches "buy".
  // Item, mob, spell and zone pages are unaffected by v15 through v21.
  quest: 21,
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
    /**
     * The roster titles we believe are in this shard — what we'd *like* to hold, not what we hold.
     *
     * Sent alongside the pages of a `give`, so one install's category walk reaches the room without
     * anybody repeating it ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
     * It is deliberately the whole shard rather than only the titles we hold: a title we know about
     * and have *failed* to fetch is exactly the one a peer most needs to hear, since they may well
     * succeed where we didn't.
     */
    shardTitles(shard: number): string[];
    /**
     * The titles in this shard we have checked and found **not** to be items (ADR 0180).
     *
     * The counterpart to `shardTitles` and the larger half by volume: a zone page links to thousands
     * of pages the category walk never files, and the answer for nearly all of them is no. Sharing
     * the refusals is what stops every install in a room paying for the same dead ends.
     */
    shardNotItems(shard: number): string[];
    /** Take a peer's refusals, and say how many were new. Only ever skips work; never removes any. */
    learnNotItems(titles: readonly string[]): number;
    accept(pages: SharedItemPage[], shard?: number): number;
    /**
     * Take roster titles a peer named, and say how many were new to us.
     *
     * A title is a claim about the *wiki*, not about the peer, and it is the cheapest possible thing
     * to be wrong about: an invented title costs one 404 and lands in `failed`. So this is applied
     * silently, like the pages themselves — the `mirror` family's argument
     * ([ADR 0161](../../specs/decisions/0161-a-public-page-is-shared-by-default.md)) applies at
     * least as strongly to a name as to a page.
     */
    learnTitles(titles: readonly string[]): number;
    /** The room may have pages we lack — start a fill if so. Cheap, and safe to call on a tick. */
    fill(): void;
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
  /**
   * Where pages live. 256 append-only bucket files rather than one file per page — see
   * [page-store](./page-store.ts) for why, and for the migration off the old layout.
   */
  const store = createPageStore(cacheDir);

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

  /** A page we hold, with the one thing the store doesn't know: how old it is by our clock. */
  function readCache(title: string): { page: WikiPage; ageMs: number; version: number } | null {
    const held = store.get(title);
    if (!held) return null;
    return { ...held, ageMs: Date.now() - new Date(held.page.fetchedAt).getTime() };
  }

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
        store.put(title, CACHE_VERSION, page);
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

  /**
   * What the wiki has told us it changed, and how far we have read
   * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)).
   *
   * `changedAt` holds only pages whose edit is **newer than our copy** — it is an invalidation list,
   * not a log, so it drains as pages are re-fetched and is empty on a caught-up install.
   */
  const changesFile = path.join(cacheDir, "changes.json");
  let changeCursor: string | undefined;
  let changedAt = new Map<string, number>();

  function loadChanges(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(changesFile, "utf8")) as {
        cursor?: string;
        changed?: Record<string, number>;
      };
      changeCursor = typeof saved.cursor === "string" ? saved.cursor : undefined;
      changedAt = new Map(Object.entries(saved.changed ?? {}));
    } catch {
      // No file yet, or an unreadable one. Either way we have tracked nothing, which `trackingCurrent`
      // reads as "fall back to the TTL" — the safe direction.
    }
  }

  function saveChanges(): void {
    try {
      fs.writeFileSync(
        changesFile,
        JSON.stringify({ cursor: changeCursor, changed: Object.fromEntries(changedAt) }),
        "utf8",
      );
    } catch (e) {
      log.warn("could not save the change cursor:", (e as Error).message);
    }
  }
  loadChanges();

  /**
   * How old a page may be, which now depends on whether we know what has been happening.
   *
   * With change-tracking current, "the wiki has not mentioned this page" is real evidence that the
   * page has not moved, and a copy may be kept for the full setting. Without it — never polled, or a
   * cursor older than the wiki itself remembers — that silence means nothing, so the ceiling drops
   * back to `UNTRACKED_TTL_MS` and the clock does the work alone, exactly as it did before.
   */
  function pageMaxAgeMs(): number {
    const ttl = ttlMs();
    return trackingCurrent(changeCursor, Date.now(), CHANGES_RETENTION_MS)
      ? ttl
      : Math.min(ttl, UNTRACKED_TTL_MS);
  }

  /** Has the wiki reported an edit to this page since the copy we hold was pulled? */
  function supersededByEdit(title: string, fetchedAt: string): boolean {
    const at = changedAt.get(title);
    if (at === undefined) return false;
    const ours = Date.parse(fetchedAt);
    // Compared against the copy's own pull date, so a page fetched *after* the edit — by hand, or
    // from a peer who was ahead of us — is not fetched a second time for news it already contains.
    return !Number.isFinite(ours) || at > ours;
  }

  /**
   * The wiki's shape, and what we have made of it (ADR 0180).
   *
   * `shapeLinks` is every link the zone and quest pages we hold point at, gathered on the catalogue
   * walk that was happening anyway. `checked` is the verdicts — titles we have fetched to find out
   * what they were — and it is the half worth keeping on disk, because "not an item" is the answer
   * for the overwhelming majority and re-learning it costs a request every time.
   */
  const shapeFile = path.join(cacheDir, "shape.json");
  let shapeLinks = new Set<string>();
  /** Title → what it turned out to be. */
  let checked = new Map<string, Verdict>();
  /** The probe queue, in this install's own order, rebuilt when the candidate set is recomputed. */
  let probeQueue: string[] = [];
  let shapeLoaded = false;

  function loadShape(): void {
    if (shapeLoaded) return;
    shapeLoaded = true;
    try {
      const held = JSON.parse(fs.readFileSync(shapeFile, "utf8")) as {
        version?: number;
        checked?: Record<string, Verdict>;
      };
      // A verdict is a statement about what `parse.ts` made of a page, so a parser that classifies
      // differently invalidates it — the same rule as a cached page, for the same reason.
      if (held.version === CACHE_VERSION && held.checked) {
        checked = new Map(Object.entries(held.checked));
      }
    } catch {
      /* missing or malformed: an empty verdict book is a correct, if expensive, starting point */
    }
    log.debug("shape: loaded", checked.size, "verdicts");
  }

  function saveShape(): void {
    void fs.promises
      .writeFile(
        shapeFile,
        JSON.stringify({ version: CACHE_VERSION, checked: Object.fromEntries(checked) }),
        "utf8",
      )
      .catch((e: unknown) => log.warn("couldn't write the shape verdicts:", (e as Error).message));
  }

  /**
   * Rebuild the probe queue: what the shape links point at that no roster names and nothing has
   * checked, in an order this install does not share with its peers.
   *
   * Needs the catalogue walk to have happened, since that is what fills `shapeLinks` — so it asks for
   * it rather than assuming, and the ordinary case is that it is already in hand.
   */
  async function refreshCandidates(): Promise<void> {
    loadShape();
    await cachedItemPages();
    const candidates = candidatesFrom({
      links: shapeLinks,
      roster: shardRoster,
      checked: checked.keys(),
    });
    probeQueue = probeOrder(candidates, room.myId());
    log.debug("shape:", shapeLinks.size, "links →", probeQueue.length, "candidates");
  }

  /**
   * Fetch one candidate and say what it turned out to be.
   *
   * The verdict is written down whatever it is. `missing` is recorded as firmly as `other`: a title
   * linked from a zone page that 404s is a red link on the wiki, and it will still be one next week.
   */
  async function probeCandidate(title: string): Promise<Verdict> {
    const page = await getPageInternal(title);
    const verdict: Verdict = !page ? "missing" : page.kind === "item" || page.kind === "recipe" ? "item" : "other";
    checked.set(title, verdict);
    saveShape();
    return verdict;
  }

  /** No network, by contract: cached, parsed currently, not superseded, and inside its ceiling. */
  const holds = (title: string): boolean => {
    const hit = readCache(title);
    if (!hit || !parsedCurrently(hit.page.kind, hit.version)) return false;
    if (supersededByEdit(title, hit.page.fetchedAt)) return false;
    return hit.ageMs < pageMaxAgeMs();
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
   * Deliberately does **not** fetch a roster. This runs off the share hub's minute tick, and it runs
   * on *every* launch — so listing a wiki category here would mean every install asking eqlwiki a
   * question at startup, for ever, whether or not anything would come of it. Until somebody has run a
   * harvest we simply advertise nothing, which is true.
   *
   * A roster *is* now fetched off that same tick, but only through `fillFromRoom` → `harvest.start`,
   * and only when a peer is actually there holding pages we lack (ADR 0176). The distinction is the
   * whole point: reading what we have is unconditional and must stay free, while going and asking the
   * wiki for something is gated on there being a reason.
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

  /**
   * How long to leave it before a room may wake a fill again, and how far that stretches when waking
   * up keeps achieving nothing.
   *
   * The tick that calls this is a minute, and starting a run costs a pass over everything we hold —
   * cheap once, wasteful sixty times an hour. But the floor alone is not enough, because **a room
   * can look permanently ahead of us**: eqlwiki lists pages in `Category:Items` that 404, a shard
   * holding one can never be completed, and a peer who also lacks it still offers coverage we cannot
   * match. `exhausted` is per-run, so every fresh run retries that shard — which, once runs start
   * themselves, is a fruitless eleven requests every ten minutes for ever.
   *
   * So a wake-up that gains no shard doubles the wait, up to a few hours. A wake-up that gains one
   * resets it. The signal is `mine` moving, which is the same self-assessment everything else here
   * is built on, and it needs no bookkeeping of its own.
   */
  const ROOM_FILL_COOLDOWN_MS = 10 * 60 * 1000;
  const ROOM_FILL_MAX_MS = 6 * 60 * 60 * 1000;
  let roomFillAt = 0;
  let roomFillWait: number = ROOM_FILL_COOLDOWN_MS;
  /** Shards held when we last started a run ourselves; `-1` when there is no run left to judge. */
  let roomFillHeld = -1;
  /** How many peers were offering last time we looked — a newcomer is worth being eager again for. */
  let roomFillPeers = 0;

  /**
   * Start a fill because the room has pages we don't — the thing that makes two connected peers
   * share a catalogue without anybody pressing anything
   * ([ADR 0176](../../specs/decisions/0176-a-room-fills-itself.md)).
   *
   * Called on the share hub's minute tick, which is deliberate: the alternative is reacting to an
   * offer arriving, and that only ever fires for the peer who joins *second*. A comparison of what
   * *is* — do they hold something we lack? — is true for both sides of a connection and needs no
   * event to have been seen ([ADR 0145](../../specs/decisions/0145-a-room-checks-itself-and-needs-no-game.md)).
   *
   * It starts the ordinary harvester rather than a peer-only mode of its own, so a run begun this
   * way asks peers first and falls through to the wiki exactly as a clicked one does. The gate is
   * the room, not the wiki: nothing starts unless somebody is there with something to give.
   */
  function fillFromRoom(): void {
    // `start` no-ops while running, but "done" would re-enter and pay for the index again.
    const { status } = harvester.status();
    if (status === "running" || status === "stopping") return;
    const at = Date.now();
    if (at - roomFillAt < roomFillWait) return;
    // The index is built off the tick anyway; this only ever reads what that left behind.
    void ensureShardIndex().then(() => {
      const peers = room.peers();
      const heldNow = countShards(mine);
      // Judge the last run we started before deciding on another, and judge it exactly once — the
      // flag is cleared here so a tick that decides *not* to start can't double the wait a second
      // time. A room that has since gained a peer starts eager again regardless: somebody new is
      // the case where a long backoff, earned against an unfillable shard, would be plainly wrong.
      if (peers.length > roomFillPeers) roomFillWait = ROOM_FILL_COOLDOWN_MS;
      else if (roomFillHeld >= 0) {
        roomFillWait =
          heldNow > roomFillHeld ? ROOM_FILL_COOLDOWN_MS : Math.min(roomFillWait * 2, ROOM_FILL_MAX_MS);
      }
      roomFillHeld = -1;
      roomFillPeers = peers.length;
      // Nobody to ask, nothing to start — the room is the gate on starting, always, and that holds
      // for a stale roster too: walking the category graph unprompted is exactly the traffic this
      // gate exists to prevent. A solo install refreshes its roster from the button, which now
      // genuinely does what it says (ADR 0177).
      if (!peers.length) return;
      // **A stale roster is a reason of its own, and no coverage test can see it.** An install that
      // holds every page its roster names has no gaps, so the room comparison says "nothing to do"
      // for ever — and the weekly walk ADR 0177 depends on happening "whenever a run begins" would
      // never begin. Left out, the catalogue silently freezes on the roster it first walked while
      // the wiki keeps gaining items.
      if (
        !harvester.rosterExpired() &&
        !roomOffersMore({ mine, present, peers, hasRoster: shardRoster.length > 0 })
      ) {
        return;
      }
      roomFillAt = at;
      roomFillHeld = heldNow;
      log.debug("room fill: starting;", peers.length, "peer(s) hold pages we don't; next wait", roomFillWait, "ms");
      harvester.start();
    });
  }

  /** The pages of one shard, stripped to what crosses the wire. */
  function itemShard(shard: number): SharedItemPage[] {
    const out: SharedItemPage[] = [];
    for (const title of byShard.get(shard) ?? []) {
      const hit = readCache(title);
      if (!hit || !parsedCurrently(hit.page.kind, hit.version) || hit.ageMs >= ttlMs()) continue;
      const { kind, title: name, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs, links } = hit.page;
      // The same kinds the reader accepts: items and recipes are the catalogue; zones and quests are
      // what give them a level, and a mob page is read when we have one (ADR 0163).
      if (kind !== "item" && kind !== "recipe" && kind !== "mob" && kind !== "quest" && kind !== "zone") continue;
      // The age goes with it, so the page keeps expiring on schedule however many peers it passes
      // through. The receiver clamps it to no later than their own now, so it can only be honest.
      // `links` travels with the page it belongs to: a zone page a peer takes from us must arrive
      // carrying its shape, or their install can never explore what it points at (ADR 0180).
      out.push({ kind, title: name, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs, links });
    }
    return out;
  }

  /** The roster titles of one shard — see `WikiClient.items.shardTitles` for why it isn't "held". */
  function itemShardTitles(shard: number): string[] {
    void ensureShardIndex();
    return [...(byShard.get(shard) ?? [])];
  }

  /**
   * The titles in this shard we have checked and found not to be items (ADR 0180).
   *
   * Sharded by the same `shardOf` as everything else, so a refusal travels with the shard it belongs
   * to and one `give` stays one message. This is the expensive knowledge: the answer is *no* for the
   * overwhelming majority of candidates, and re-learning it costs a fetch each time.
   */
  function itemShardNotItems(shard: number): string[] {
    loadShape();
    const out: string[] = [];
    for (const [title, verdict] of checked) {
      if (verdict !== "item" && shardOf(title) === shard) out.push(title);
    }
    return out;
  }

  /**
   * Take a peer's refusals into our own book, and say how many were new.
   *
   * Recorded as `other` whatever the sender's own verdict was: the distinction between "not an item"
   * and "no such page" only matters to whoever fetched it, and both mean the same thing here — do
   * not spend a request on this. A refusal can only ever *skip* work, so a wrong one costs us a
   * discovery we would not otherwise have made, never a page we hold.
   */
  function learnNotItems(titles: readonly string[]): number {
    loadShape();
    let fresh = 0;
    for (const title of titles) {
      const name = title.trim();
      // Never over-write our own first-hand verdict, and never contradict the roster: a title the
      // walk found is not a candidate at all, so a peer calling it a dead end must not remove it.
      if (!name || checked.has(name)) continue;
      checked.set(name, "other");
      fresh += 1;
    }
    if (fresh) {
      // The queue was computed against the old book, so it now names work we know is pointless.
      probeQueue = probeQueue.filter((t) => !checked.has(t));
      saveShape();
      log.debug("shape: took", fresh, "refusals from a peer");
    }
    return fresh;
  }

  /**
   * Fold roster titles a peer named into our own roster.
   *
   * The harvester owns the roster, so it does the merging and says what was new; this side only has
   * to mirror those titles into the *client's* shard index, which is the one the room's coverage is
   * measured from. Both indexes exist because they answer at different times — the harvester's
   * during a run, the client's on every minute tick whether or not a run is going.
   */
  function learnItemTitles(titles: readonly string[]): number {
    const fresh = harvester.learn(titles);
    if (!fresh.length) return 0;
    // Same guard as the harvester's: an index that hasn't been built yet must not be patched into
    // looking built, or `present` would claim the roster touches only the shards a peer mentioned.
    if (indexed) {
      const touched = new Set<number>();
      for (const title of fresh) {
        shardRoster.push(title);
        const shard = shardOf(title);
        const bucket = byShard.get(shard);
        if (bucket) bucket.push(title);
        else byShard.set(shard, [title]);
        setShard(present, shard);
        touched.add(shard);
      }
      for (const shard of touched) recheckShard(shard);
    }
    log.debug("learned", fresh.length, "new roster titles from a peer");
    return fresh.length;
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
        store.put(page.title, CACHE_VERSION, full);
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
   *
   * "Shape" includes **how a field is computed**, which is the easier half to forget. `rows7` is a
   * change of content, not of structure: the zone list stopped carrying the wiki's non-place cells
   * (`Various Zones`, `Pre-Revamp` — see `namesAPlace`), and a pack written before that would have
   * gone on offering them in the Zone picker with nothing in the code to say why.
   */
  const PACK_SIGNATURE = `v${CACHE_VERSION}/rows7`;
  /**
   * Set when a write invalidates the pack — so a harvest doesn't unlink a file per page, and so
   * `readPack` stops trusting it **at once**.
   *
   * The unlink is fire-and-forget, which left a window: a peer's page arriving and the Items tab
   * asking for the catalogue in the same tick would find the file still on disk and be served the
   * rows from before the page landed. The flag closes it without making the caller wait on a delete.
   */
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
    if (packDropped) return null;
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
    // The copy on disk is now at least as new as the edit we were told about, so the invalidation is
    // spent. Checked rather than assumed: `acceptItems` also lands here, and a peer's copy can be
    // older than the change — clearing on that would leave us holding a page we know is out of date.
    const at = changedAt.get(title);
    if (at !== undefined) {
      const held = store.get(title);
      const ours = held ? Date.parse(held.page.fetchedAt) : NaN;
      if (Number.isFinite(ours) && ours >= at) {
        changedAt.delete(title);
        saveChanges();
      }
    }
    if (!indexed) return; // nothing built yet to keep current
    const shard = shardOf(title);
    if (byShard.has(shard)) recheckShard(shard);
  }

  async function buildCatalogue(): Promise<CachedItem[]> {
    const startedAt = Date.now();
    const items: CachedItem[] = [];
    /** Rebuilt by this walk, so it describes exactly the pages the cache holds right now. */
    shapeLinks = new Set<string>();
    /** Level evidence gathered on the same walk — see below. Keyed folded, since an item's sources
     *  write a mob's name in the log's case ("an aviak quetzel") and its page is titled in the
     *  wiki's ("An aviak quetzel"). */
    const mobLevels = new Map<string, { min: number; max: number }>();
    const questLevels = new Map<string, { min: number; max: number }>();
    // 256 bucket reads rather than 11,523, and the store breathes between them so main is never
    // blocked for more than a couple of milliseconds at a time (see `page-store.ts`).
    await store.each((hit) => {
      // Age is deliberately ignored — a week-old card is still a card, and the fetch that would
      // refresh it belongs to `getPage`, which the user has to ask for. The parser **version** is
      // not ignored: a page parsed before item cards existed has no card where it should have one,
      // and a catalogue built on those would silently be missing stats rather than items.
      if (!parsedCurrently(hit.page.kind, hit.version)) return;
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
        return;
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
        for (const link of page.links ?? []) shapeLinks.add(link);
        return;
      }
      if (page.kind === "quest") {
        const level = questCardLevel(page.card?.lines);
        if (level) questLevels.set(page.title.trim().toLowerCase(), level);
        // The shape, gathered on the walk that was happening anyway — the links of a zone or quest
        // page are how a title no category files as an item is found at all (ADR 0180).
        for (const link of page.links ?? []) shapeLinks.add(link);
        return;
      }
      // A recipe is an item page that happens to be craftable, so it carries a card and belongs
      // here. Zones and spells are neither items nor evidence about one.
      if (page.kind !== "item" && page.kind !== "recipe") return;
      items.push({
        title: page.title,
        origin: "wiki",
        wikiPath: page.wikiPath,
        card: page.card,
        sources: page.sources,
        outOfEra: page.outOfEra,
        fetchedAt: page.fetchedAt,
      });
    });

    /**
     * **One row per item, however many files hold it.**
     *
     * A page can be cached under more than one name. Asking for a *graded* item — `Cloth Cape +2`,
     * off the log or the shopping list — finds no page of that name, so `getPage` retries the base
     * name and caches what comes back under the name it was asked about, which is what stops the next
     * `+2` paying for the fetch again ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)).
     * The cost is a second file holding the same page, and the walk reads files.
     *
     * Measured on a real cache: 36 such aliases, showing as 37 extra rows — the same item listed
     * twice in the Items tab. `itemCatalog` used to fold them when the renderer built the rows; it
     * still does that job for Lucy, and this is the same fold applied where the walk now ends.
     *
     * The **newest** copy wins, which is arbitrary between identical twins and right if a re-fetch
     * ever updated one of them.
     */
    const byName = new Map<string, CachedItem>();
    for (const item of items) {
      const key = normalizeItemName(item.title);
      if (!key) continue;
      const held = byName.get(key);
      if (!held || item.fetchedAt > held.fetchedAt) byName.set(key, item);
    }
    if (byName.size !== items.length) {
      log.debug("catalogue: folded", items.length - byName.size, "duplicate pages (graded aliases)");
      items.length = 0;
      items.push(...byName.values());
    }
    // Sorted always, not only when something was folded: the store visits pages in bucket order,
    // which is a hash, so an unsorted catalogue would come out shuffled — and the pack, the coverage
    // titles and anything reading `cachedItems` would each be looking at a different arrangement
    // from one build to the next.
    items.sort((a, b) => a.title.localeCompare(b.title));

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
   * Ask the wiki what it has changed since we last looked, and act on the answer.
   *
   * Runs at the start of every harvest — not on a timer of its own, which keeps ADR 0153's rule
   * intact: this fetches because a run is starting, and a run starts because somebody asked or
   * because the room has something (ADR 0176). Nine requests buys a fortnight
   * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)).
   *
   * Two outcomes, and the second is why the weekly walk can stop being the only way to learn of a
   * page: an **edit** to something we hold marks it superseded, so `holds` says no, its shard goes
   * incomplete, and the planner fetches it like any other gap — no new mechanism at all. A **new**
   * title is checked against the categories the walk reached, and joins the roster if it belongs.
   */
  async function catchUpOnChanges(note: (what: string) => void): Promise<number> {
    const saved = loadHarvest();
    // Nothing to bring up to date, and no category set to judge a new page against. The walk runs
    // first on a fresh install and this becomes useful from the second run on.
    if (!saved?.roster.length) return 0;

    const since = new Date(
      trackingCurrent(changeCursor, Date.now(), CHANGES_RETENTION_MS)
        ? Date.parse(changeCursor!)
        : // Never tracked, or away longer than the wiki remembers. Ask for everything it still has:
          // more than we need, but the alternative is a silent hole exactly where we stopped looking.
          Date.now() - CHANGES_RETENTION_MS,
    );
    note(`what changed since ${since.toISOString().slice(0, 10)}`);

    const changes = await fetchRecentChanges(since);
    const roster = new Set(saved.roster);
    const plan = planChanges(changes, {
      heldAt: (title) => {
        const hit = store.get(title);
        if (!hit || !parsedCurrently(hit.page.kind, hit.version)) return undefined;
        const at = Date.parse(hit.page.fetchedAt);
        return Number.isFinite(at) ? at : 0;
      },
      inRoster: (title) => roster.has(title),
    });

    for (const title of plan.stale) {
      const hit = store.get(title);
      const ours = hit ? Date.parse(hit.page.fetchedAt) : NaN;
      // Stamp the moment we know the page moved past our copy. `Date.now()` is close enough and
      // always later than our copy, which is the only property `supersededByEdit` needs.
      changedAt.set(title, Number.isFinite(ours) ? Date.now() : Date.now());
    }

    // A title nobody has heard of is only worth a roster place if it is the *kind* of page the walk
    // would have found. One batched lookup answers for all of them.
    let added: string[] = [];
    if (plan.unknown.length) {
      note(`checking ${plan.unknown.length} new pages`);
      const walked = new Set(saved.categories ?? []);
      if (walked.size) {
        const cats = await fetchCategoriesFor(plan.unknown);
        added = belongsToRoster(plan.unknown, cats, walked);
        if (added.length) learnItemTitles(added);
      }
    }

    if (plan.cursor) changeCursor = plan.cursor;
    saveChanges();
    // The shards holding a superseded page have to be re-judged, or the planner will not see the
    // work: `mine` was decided before any of this was known.
    for (const title of plan.stale) {
      const shard = shardOf(title);
      if (byShard.has(shard)) recheckShard(shard);
    }
    log.debug(
      `changes: ${changes.length} since ${since.toISOString()} → ${plan.stale.length} superseded, ` +
        `${added.length} of ${plan.unknown.length} new titles taken`,
    );
    return plan.stale.length + added.length;
  }

  /**
   * What a run covers: every **item** and every **NPC** the category walk reaches, plus the quests
   * and zones those items name.
   *
   * The walk is the roster ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)),
   * and it is seeded with both things this app reads pages for
   * ([ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)): 11,847 items and
   * 7,944 NPCs, disjoint but for a single page. Mobs are here for what only a mob page carries — the
   * **drop rates** behind the Hunt tab, the spawn zone and location, the level/race/class/HP line and
   * the faction impact. None of that is on an item page, and the zone-roster shortcut ADR 0163 built
   * answers for exactly one of them.
   *
   * **Quests and zones still arrive by being named**, because their only job here is giving an item a
   * level and the ones no item names are pages nothing would read. That step needs items already
   * held, so it still fills in over two runs — but the mobs no longer do, which is what that
   * awkwardness mostly cost.
   *
   * ADR 0163 is narrowed, not undone: a **zone** page is still where a level is read from in bulk
   * (177 pages answering for thousands of mobs), and it is still the rung a missing or unparseable
   * mob page falls through to.
   */
  async function harvestRoster(
    gapMs: number,
    note: (what: string) => void,
  ): Promise<{ titles: string[]; complete: boolean; categories: string[] }> {
    const walk = await exploreCategories(
      EXPLORE_SEEDS,
      {
        listCategory: fetchCategorySlice,
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
        // The walk is inside a run, so stopping the run stops the walk — otherwise pressing Stop
        // during the roster phase would appear to do nothing for a minute and a half.
        stopped: () => harvester.status().status !== "running",
        // Worded to read after the panel's "Fetching": *Fetching the page list — 80 categories,
        // 19,790 pages so far*. The category it is on is deliberately not named — it changes every
        // second and means nothing to a reader, while the two counts visibly move.
        onProgress: ({ categories, titles }) =>
          note(`the page list — ${categories} categories, ${titles} pages so far`),
      },
      gapMs,
    );
    const walked = walk.titles;
    const roster = new Set(walked);
    // Folded, so "an aviak quetzel" and "An aviak quetzel" are not fetched as two pages.
    const seen = new Set(walked.map((t) => t.trim().toLowerCase()));
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
    log.debug(
      `harvest roster: ${walked.length} pages across ${walk.categories.length} categories` +
        ` + ${roster.size - walked.length} named as sources` +
        (walk.truncated ? " (walk truncated)" : ""),
    );
    return { titles: [...roster], complete: walk.complete, categories: walk.categories };
  }

  const harvester = createHarvester({
    roster: harvestRoster,
    catchUp: catchUpOnChanges,
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
    candidates: async () => {
      await refreshCandidates();
      return probeQueue;
    },
    probe: probeCandidate,
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

    items: {
      status: itemStatus,
      shard: itemShard,
      shardTitles: itemShardTitles,
      shardNotItems: itemShardNotItems,
      learnNotItems,
      accept: acceptItems,
      learnTitles: learnItemTitles,
      fill: fillFromRoom,
    },
    levelSources: () => levelEvidence,

    catalogueJson,

  /** The titles line, read defensively: a malformed pack is a rebuild, never a throw. */
    joinRoom(link) {
      room = link;
    },
  };
}
