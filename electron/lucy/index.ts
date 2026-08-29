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
import { fetchItemNameList, itemList, itemPage, itemUrlFor } from "./api";
import { parseItemNameList, parseLucyItem, parseLucyItemList } from "./parse";
import { fuzzyRank } from "../../src/shared/fuzzy";
import { itemBaseName } from "../../src/shared/names";
import { normalizeItemName } from "../../src/shared/grouping";
import { createLogger } from "../../src/shared/logging";
import type { CachedItem, LucyItem, LucySearchResult } from "../../src/shared/types";

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

/**
 * A month for the mirrored name list — the same clock as an item, and for the same reason.
 *
 * Lucy regenerates the file daily, but what it holds is a record of a finished game: the ids that
 * matter here were fixed twenty years ago. Measured on the live file, the "daily" claim had in any
 * case lapsed by about eight months, which is another way of saying a month's TTL is not the binding
 * constraint on how current this is.
 */
const NAME_LIST_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * How well a name has to match to be offered from the mirror. The same bar the wiki's own index and
 * your loot ledger are searched at (`known-items.ts`) — one query, one standard.
 */
const MIN_NAME_SCORE = 0.45;

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
  /**
   * How many names the mirror holds and when it was taken — what the Items tab reports, and what
   * tells a caller whether `search` is answering locally or over the wire.
   */
  nameIndex(): { items: number; fetchedAt: string | null };
  /**
   * Every item the cache holds, in the shape the item search's catalogue wants.
   *
   * `cachedByName` asked of the whole directory, and it keeps that method's one promise: **no request,
   * ever**. Lucy's cards are the same `ItemCard` the wiki's are, so an item only Lucy has ever heard of
   * can be searched by stat alongside the rest — as the third opinion it is, which is what `origin`
   * carries ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
   */
  cachedItems(): CachedItem[];
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
  function byNameIndex(): Map<string, LucyItem> {
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

  /**
   * Lucy's own published name list, mirrored to disk.
   *
   * Held as `{id,name}` rather than the raw CSV: the file is 10.9 MB of text and 134,080 rows, and
   * re-parsing that on every process start to answer one search would be silly. Kept in memory once
   * loaded, because that is what makes a search cost **nothing at all**.
   */
  const listFile = path.join(cacheDir, "itemlist.json");
  let names: { id: number; name: string }[] | null = null;
  let namesAt: string | null = null;
  let namesLoaded = false;
  let refreshing: Promise<void> | null = null;

  /** Read the mirror off disk, once per process. `null` when we have never taken one. */
  function loadNames(): { id: number; name: string }[] | null {
    if (namesLoaded) return names;
    namesLoaded = true;
    const hit = read<{ id: number; name: string }[]>(listFile, Infinity);
    if (hit) {
      names = hit.value;
      // `read` gives staleness against a TTL, not the stamp itself; re-read it for the status line.
      try {
        namesAt = (JSON.parse(fs.readFileSync(listFile, "utf8")) as Envelope<unknown>).fetchedAt;
      } catch {
        namesAt = null;
      }
      log.debug("name mirror loaded:", names.length, "items");
    }
    return names;
  }

  /**
   * Take (or retake) the mirror. One download, in the background, never awaited by a search.
   *
   * A search that had to wait two minutes for a 10 MB file the first time would be a worse answer
   * than the one request it replaces, so the first search still goes over the wire and every one
   * after it is free.
   */
  function refreshNames(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const parsed = parseItemNameList(await fetchItemNameList());
        // Refuse to overwrite a good mirror with an empty one — the same rule the wiki's indexes
        // follow, and for the same reason: a silently emptied index answers nothing, forever.
        if (!parsed.length) throw new Error("name list parsed to nothing");
        names = parsed;
        namesLoaded = true;
        namesAt = new Date().toISOString();
        write(listFile, parsed);
        log.debug("name mirror refreshed:", parsed.length, "items");
      } catch (e) {
        log.warn("name list refresh failed:", (e as Error).message);
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /** Is the mirror worth searching, and is it current enough to leave alone? */
  function mirrorFresh(): boolean {
    const held = loadNames();
    if (!held?.length || !namesAt) return false;
    return Date.now() - new Date(namesAt).getTime() < NAME_LIST_TTL_MS;
  }

  /**
   * Rank a query against the mirror — **the substring hits first, and only then the fuzzy ones**.
   *
   * Two passes because they answer different questions and cost different amounts. A substring scan
   * of 134,080 names is a few milliseconds and is what Lucy's own search would have said; the fuzzy
   * pass is the part that earns the mirror its place, since it is the only way a misspelling finds
   * anything here at all. Running fuzzy over the whole list only when the cheap pass came up short
   * keeps the common case cheap.
   */
  function searchMirror(term: string, limit: number): LucySearchResult[] {
    const held = loadNames();
    if (!held?.length) return [];
    const needle = term.toLowerCase();
    const substring = held.filter((n) => n.name.toLowerCase().includes(needle));
    if (substring.length >= limit) {
      // Best-scoring of the literal hits, so `Dirk` leads with `Dragoon Dirk` rather than with
      // `Dirk of the Dead Guy of Somewhere Long`.
      const ranked = fuzzyRank(term, substring, (n) => n.name, { limit, minScore: 0 }).map((m) => m.item);
      return ranked.map((n) => ({ id: n.id, name: n.name, era: "unknown" as const }));
    }

    /**
     * The typo pass, over a **narrowed** field.
     *
     * Fuzzy-ranking all 134,079 names costs about a second of the main process, measured — and main
     * is the process every other window's IPC goes through, so a second of it is a second of the app
     * not answering. Narrowing to names that share the query's first letter cuts that to tens of
     * milliseconds, and costs only the correction nobody needs: people mistype the middle of a word
     * (`Dragon Dirk` → `Dragoon Dirk`), not its first letter.
     */
    const initial = needle[0];
    const plausible = held.filter((n) => n.name[0]?.toLowerCase() === initial);
    const chosen = [
      ...substring,
      ...fuzzyRank(term, plausible, (n) => n.name, { limit: limit * 2, minScore: MIN_NAME_SCORE })
        .map((m) => m.item)
        .filter((n) => !substring.includes(n)),
    ].slice(0, limit);
    return chosen.map((n) => ({ id: n.id, name: n.name, era: "unknown" as const }));
  }

  /** Put an item in both caches, so the next render sees it without touching the disk. */
  function remember(item: LucyItem): LucyItem {
    write(itemFile(item.id), item);
    byNameIndex().set(normalizeItemName(item.name), item);
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
      return byNameIndex().get(normalizeItemName(name)) ?? null;
    },

    nameIndex() {
      return { items: loadNames()?.length ?? 0, fetchedAt: namesAt };
    },

    cachedItems() {
      // The index is already every cached item keyed by name, built for `cachedByName` — so the
      // catalogue is a projection of it rather than a second walk of the same directory.
      return [...byNameIndex().values()].map((item) => ({
        title: item.name,
        origin: "lucy" as const,
        lucyId: item.id,
        card: item.card,
        sources: item.sources,
        // Lucy's era is *derived* and `unknown` is a common, honest answer — so only a verdict of
        // "this server hasn't opened that" is passed on as the flag the UI hides by. Hiding what we
        // couldn't judge is how a filter starts lying (`lucy-era.ts`).
        outOfEra: item.era === "out-of-era",
        fetchedAt: item.fetchedAt,
      }));
    },

    async search(term) {
      // Fold the grade off the query, exactly as the wiki client does: Lucy has "Dragoon Dirk", and
      // a literal substring search for "Dragoon Dirk +2" matches nothing at all.
      const q = itemBaseName(term.trim());
      if (q.length < 2) return [];

      /**
       * **The mirror answers first, and for free.**
       *
       * Lucy publishes its whole name list, so once we hold it a name search is a local ranking and
       * costs that site nothing at all — which is strictly better than the one request ADR 0124
       * budgeted for, and is the only way a *misspelling* finds anything here (Lucy's own search is a
       * literal substring match, so `Dragon Dirk` finds nothing on the site itself).
       */
      if (mirrorFresh()) {
        const local = searchMirror(q, SEARCH_LIMIT).map(knownEra);
        log.debug(`search "${q}" answered from the mirror → ${local.length} hits`);
        return local;
      }
      // Cold or stale mirror: take one in the background, and answer this search the old way.
      void refreshNames();

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
