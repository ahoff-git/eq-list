/**
 * item-shard-source.ts — the browser's `ItemShardSource`s, what the peer-share hub reads to answer
 * an `items`/`spells` shard ask, backed entirely by the static snapshot (no live wiki fetch, no
 * harvest).
 *
 * A web visitor never crawls eqlwiki — that stays an Electron-only feature (a browser tab has no
 * `userData` to cache the result in between visits, and no reason to spend the wiki's goodwill on a
 * page it will forget the moment the tab closes). What it *can* do honestly is hand out pages the
 * snapshot already holds, which is real, useful capacity: a room full of desktop clients still mid-
 * harvest can pull whole shards from a web visitor's snapshot instead of fetching them fresh. See
 * `electron/wiki/index.ts`'s `items`/`spells` for the Electron counterpart this mirrors.
 *
 * `ItemShardSource` (`src/shared/peer-share-hub.ts`) is synchronous by contract — the hub calls
 * `status()` on every catalogue tick — so the one async step (fetching the snapshot's roster and
 * page buckets) happens **once**, up front, via `loadWebItemSources`; everything built from it is a
 * plain in-memory lookup from there on.
 *
 * **Known simplification**: coverage is computed from presence alone, not the page-age TTL Electron
 * checks (`holds()`). A page in the snapshot may be older than the room would like; the room's own
 * `mirror`-family rule (ADR 0164, "the newest copy wins") still protects everyone else's cache from a
 * stale one, so the worst this costs is a page nobody needed re-fetched sooner than strictly required.
 */
import { emptyCoverage, encodeCoverage, setShard, shardOf } from "@/shared/item-shards";
import { allPages, itemRoster } from "./snapshot";
import type { SharedItemPage, SharedSpellPage } from "@/shared/peer-share";
import type { WikiPage, WikiPageKind } from "@/shared/types";

export interface ItemShardSource {
  status(): { pages: number; cover: string; doing?: number };
  shard(shard: number): unknown[];
  shardTitles(shard: number): string[];
  shardNotItems(shard: number): string[];
  learnTitles(titles: readonly string[]): number;
  learnNotItems(titles: readonly string[]): number;
  fill(): void;
}

const CATALOGUE_KINDS = new Set<WikiPageKind>(["item", "recipe", "mob", "quest", "zone"]);

function toSharedItemPage(page: WikiPage): SharedItemPage {
  const { kind, title, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs, links } = page;
  return { kind, title, wikiPath, sources, components, rewards, card, outOfEra, fetchedAt, npcs, links };
}

function toSharedSpellPage(page: WikiPage): SharedSpellPage {
  return { title: page.title, wikiPath: page.wikiPath, card: page.card, fetchedAt: page.fetchedAt };
}

/** Every title in `roster`, grouped by its shard — the one index both sources are read off. */
function indexRoster(roster: string[]): Map<number, string[]> {
  const byShard = new Map<number, string[]>();
  for (const title of roster) {
    const shard = shardOf(title);
    const bucket = byShard.get(shard);
    if (bucket) bucket.push(title);
    else byShard.set(shard, [title]);
  }
  return byShard;
}

/** Build one synchronous source over already-loaded data — shared shape, different page projection. */
function buildSource<T>(
  byShard: Map<number, string[]>,
  pages: Map<string, { version: number; page: WikiPage }>,
  project: (page: WikiPage) => T,
  filterKind: boolean,
): ItemShardSource {
  const cover = emptyCoverage();
  let held = 0;
  for (const [shard, titles] of byShard) {
    if (titles.length > 0 && titles.every((t) => pages.has(t))) {
      setShard(cover, shard);
      held += titles.length;
    }
  }
  const status = { pages: held, cover: encodeCoverage(cover) };

  return {
    status: () => status,
    shard: (shard) => {
      const out: T[] = [];
      for (const title of byShard.get(shard) ?? []) {
        const stored = pages.get(title);
        if (!stored) continue;
        if (filterKind && !CATALOGUE_KINDS.has(stored.page.kind)) continue;
        out.push(project(stored.page));
      }
      return out;
    },
    shardTitles: (shard) => [...(byShard.get(shard) ?? [])],
    // No shape-discovery on the web (no live wiki walk), so nothing is ever known to be "not an item".
    shardNotItems: () => [],
    // A peer's roster titles teach us nothing here: without a harvester there's nothing to do about a
    // gap, and the next `npm run web:snapshot` picks up whatever this machine's own Electron app learns.
    learnTitles: () => 0,
    learnNotItems: () => 0,
    // No fill: a web tab never goes and asks eqlwiki for what it lacks.
    fill: () => {},
  };
}

/** Load the snapshot's roster + pages once, and build both the `items` and `spells` sources from it. */
export async function loadWebItemSources(): Promise<{ items: ItemShardSource; spells: ItemShardSource }> {
  const [roster, pages] = await Promise.all([itemRoster(), allPages()]);
  const itemShard = indexRoster(roster);
  // Spells have no persisted roster on the web (no `harvest.json` counterpart — Electron's own
  // `spellCatalogueJson` has none either, see `snapshot.ts`'s `cachedSpellsJson`). The snapshot's own
  // spell-kind pages stand in for the roster: using the *item* roster here (as this used to) would
  // measure spell coverage against item titles and could hand a peer an item page mislabeled as a
  // spell.
  const spellTitles: string[] = [];
  for (const { page } of pages.values()) if (page.kind === "spell") spellTitles.push(page.title);
  const spellShard = indexRoster(spellTitles);
  return {
    items: buildSource(itemShard, pages, toSharedItemPage, true),
    spells: buildSource(spellShard, pages, toSharedSpellPage, false),
  };
}
