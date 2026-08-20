/**
 * index.ts — the Lucy data source the rest of the app talks to.
 *
 * Lucy (lucy.allakhazam.com) is **Live EverQuest's** item database: a different, much later game
 * than this one, but one that knows about roughly every item EverQuest ever shipped — including a
 * great many this build's own wiki has never written a page for. It is the app's **third and least
 * trusted** source, below eqlwiki and far below your own kills, and it is asked only where eqlwiki
 * is silent ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
 *
 * Three things follow from being a guest on someone else's twenty-year-old server, and they are what
 * this module is mostly made of:
 *
 * **Cache hard.** Lucy's data for a Classic item has not changed in a decade and will not change
 * next week, so a fetched page is good for a month — far longer than the wiki's week
 * ([ADR 0003](../../specs/decisions/0003-eqlwiki-runtime-data-source.md)), because the wiki is the
 * live one and this is a historical record. Search results are cached too, and so are **misses**:
 * unlike the wiki client, this one remembers "Lucy has no such item", because it is only ever asked
 * about names that already failed once and a player who searches an unknown name twice must not cost
 * two requests.
 *
 * **Never fetch without being asked.** A name search costs exactly one request. Opening an item
 * costs exactly one. Nothing here warms an index, crawls a list, or resolves the era of results
 * nobody clicked — which is why `LucySearchResult.era` is filled from the cache and left `unknown`
 * otherwise.
 *
 * **Go through the queue.** Every request is serialized and spaced by `api.ts`'s single
 * `PoliteQueue`, so even a caller that asks for twenty things at once produces a trickle.
 */
import fs from "node:fs";
import path from "node:path";
import { itemList, itemPage, itemUrlFor } from "./api";
import { parseLucyItem, parseLucyItemList } from "./parse";
import { itemBaseName } from "../../src/shared/names";
import { normalizeItemName } from "../../src/shared/grouping";
import { createLogger } from "../../src/shared/logging";
import type { LucyItem, LucySearchResult } from "../../src/shared/types";

const log = createLogger("lucy");

/**
 * A month. Lucy is a record of a game whose Classic items were finalised long ago; the wiki's week
 * is right for a wiki being edited and wrong for an archive.
 */
const ITEM_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * A week for a search. Shorter than an item's, because a search's answer can change without any
 * item changing (Lucy adds items), and because a *negative* answer is the one most worth revisiting.
 */
const SEARCH_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Bump when `parse.ts` changes what a page becomes. Same rule and the same reason as the wiki
 * client's `CACHE_VERSION`: without it, a parser fix is invisible on every item already visited.
 */
const CACHE_VERSION = 1;

/** As many hits as are worth offering under a heading that is already the third answer on screen. */
const SEARCH_LIMIT = 8;

/** Windows caps a path at 260 characters, and a search term is user input. Matches the wiki client's. */
const MAX_CACHE_KEY = 120;

export interface LucyClient {
  /**
   * Items whose name contains `term`, newest cache first. Lucy's search is a literal substring match
   * — no fuzz, no stemming — so a misspelling finds nothing, which is the honest behaviour for a
   * source we can't mirror an index of.
   *
   * `era` is filled in for hits we have already fetched and `unknown` for the rest.
   */
  search(term: string): Promise<LucySearchResult[]>;
  /** One item, cached for a month. `null` when Lucy has no such id or couldn't be reached. */
  getItem(id: number): Promise<LucyItem | null>;
  /**
   * What we already know about an item **by name**, from cache alone — no request, ever.
   *
   * This is how an item's page can show Lucy's card the instant it opens, and how the search list
   * can badge an era. Anything that would need the network belongs in `search`/`getItem`.
   */
  cachedByName(name: string): LucyItem | null;
  /**
   * External link for an item, for the "↗ Lucy" button — **by id when we have one, by name when we
   * don't**, so any item in the app can carry one.
   *
   * A name is folded first (`itemBaseName`), because Lucy's search is literal: `Dragoon Dirk +2` finds
   * nothing there and `Dragoon Dirk` finds the page.
   */
  itemUrl(target: number | string): string;
}

interface Envelope<T> {
  version: number;
  fetchedAt: string;
  value: T;
}

function cacheKey(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").slice(0, MAX_CACHE_KEY);
}

export function createLucyClient(cacheDir: string): LucyClient {
  const itemsDir = path.join(cacheDir, "items");
  const searchesDir = path.join(cacheDir, "searches");
  for (const dir of [itemsDir, searchesDir]) fs.mkdirSync(dir, { recursive: true });

  /**
   * Item name → cached item, built lazily from the cache directory on first use.
   *
   * `cachedByName` has to answer synchronously (a React render asks it), and the cache is keyed by
   * Lucy's numeric id, so the alternative would be reading every file on every render. Names are
   * folded like everywhere else, so a grade can't hide a hit
   * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)).
   */
  let byName: Map<string, LucyItem> | null = null;

  function read<T>(file: string, ttlMs: number): { value: T; stale: boolean } | null {
    try {
      const env = JSON.parse(fs.readFileSync(file, "utf8")) as Envelope<T>;
      if (env.version !== CACHE_VERSION) return null;
      return { value: env.value, stale: Date.now() - new Date(env.fetchedAt).getTime() >= ttlMs };
    } catch {
      return null;
    }
  }

  function write<T>(file: string, value: T): void {
    try {
      const env: Envelope<T> = { version: CACHE_VERSION, fetchedAt: new Date().toISOString(), value };
      fs.writeFileSync(file, JSON.stringify(env, null, 2), "utf8");
    } catch (e) {
      log.warn("cache write failed:", (e as Error).message);
    }
  }

  const itemFile = (id: number) => path.join(itemsDir, `${id}.json`);
  const searchFile = (term: string) => path.join(searchesDir, `${cacheKey(term)}.json`);

  /** Every cached item, keyed by folded name. Read once; kept current by `remember` below. */
  function nameIndex(): Map<string, LucyItem> {
    if (byName) return byName;
    const index = new Map<string, LucyItem>();
    try {
      for (const entry of fs.readdirSync(itemsDir)) {
        if (!entry.endsWith(".json")) continue;
        const hit = read<LucyItem>(path.join(itemsDir, entry), Infinity);
        // Deliberately no TTL here: a month-old card is still a far better answer than none, and
        // the fetch that would refresh it belongs to `getItem`, which the user has to ask for.
        if (hit?.value?.name) index.set(normalizeItemName(hit.value.name), hit.value);
      }
    } catch (e) {
      log.warn("couldn't index the Lucy cache:", (e as Error).message);
    }
    byName = index;
    return index;
  }

  /** Put an item in both caches, so the next render sees it without touching the disk. */
  function remember(item: LucyItem): LucyItem {
    write(itemFile(item.id), item);
    nameIndex().set(normalizeItemName(item.name), item);
    return item;
  }

  /** The era we can state for a hit without asking Lucy anything. */
  function knownEra(hit: LucySearchResult): LucySearchResult {
    const cached = read<LucyItem>(itemFile(hit.id), Infinity);
    return cached ? { ...hit, era: cached.value.era } : hit;
  }

  return {
    itemUrl: (target) => itemUrlFor(typeof target === "number" ? target : itemBaseName(target.trim())),

    cachedByName(name) {
      return nameIndex().get(normalizeItemName(name)) ?? null;
    },

    async search(term) {
      // Fold the grade off the query, exactly as the wiki client does: Lucy has "Dragoon Dirk", and
      // a literal substring search for "Dragoon Dirk +2" matches nothing at all.
      const q = itemBaseName(term.trim());
      if (q.length < 2) return [];

      const file = searchFile(q);
      const cached = read<LucySearchResult[]>(file, SEARCH_TTL_MS);
      // A fresh answer is used as-is — including a fresh *empty* one, which is the whole point of
      // caching misses.
      if (cached && !cached.stale) return cached.value.map(knownEra);

      try {
        const reply = await itemList(q);
        // A single match redirects to the item itself, and we already have that page — so parse it
        // rather than paying for it again, and cache it as the item too.
        const results =
          reply.kind === "item"
            ? (() => {
                const item = parseLucyItem(reply.id, reply.html);
                if (!item) return [];
                remember(item);
                return [{ id: item.id, name: item.name, era: item.era }];
              })()
            : parseLucyItemList(reply.html).slice(0, SEARCH_LIMIT);
        write(file, results);
        log.debug(`search "${q}" → ${results.length} hits`);
        return results.map(knownEra);
      } catch (e) {
        log.warn(`search "${q}" failed:`, (e as Error).message);
        // A stale answer beats none, and a failure is not cached — the next attempt should try again.
        return cached ? cached.value.map(knownEra) : [];
      }
    },

    async getItem(id) {
      const cached = read<LucyItem>(itemFile(id), ITEM_TTL_MS);
      if (cached && !cached.stale) return cached.value;
      try {
        const item = parseLucyItem(id, await itemPage(id));
        // A page that didn't parse as an item is not cached: it's a bad answer, not a fact about the
        // item, and the cache would keep it for a month.
        return item ? remember(item) : (cached?.value ?? null);
      } catch (e) {
        log.warn(`item ${id} failed:`, (e as Error).message);
        return cached?.value ?? null;
      }
    },
  };
}
