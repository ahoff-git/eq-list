/**
 * lucy-snapshot.ts — the browser's read of the Lucy cache (`lucy-cache/`), mirroring
 * `electron/lucy/index.ts`'s `LucyClient` over static files instead of `userData`.
 *
 * Lucy is the app's third and least-trusted source even in Electron (ADR 0124), asked only where
 * eqlwiki is silent and never fetched unasked — on the web there's no fetching at all, only what the
 * snapshot already holds: the published **name mirror** (`itemlist.json`, ~134k `{id,name}` rows,
 * which is what makes search free and instant) plus whichever individual item pages this machine had
 * actually opened when the snapshot was taken (`items/<id>.json` — usually a handful, indexed at
 * snapshot time into `items-index.json` since a static file server has no directory listing).
 */
import { fuzzyRank } from "@/shared/fuzzy";
import { itemBaseName } from "@/shared/names";
import { normalizeItemName } from "@/shared/grouping";
import type { CachedItem, LucyItem, LucySearchResult } from "@/shared/types";

const DATA_BASE = "/data/lucy-cache";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${DATA_BASE}/${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface Envelope<T> {
  version: number;
  fetchedAt: string;
  value: T;
}

/** As many hits as are worth offering under a heading that's already the third answer on screen. */
const SEARCH_LIMIT = 8;
const MIN_NAME_SCORE = 0.45;

let namesPromise: Promise<{ id: number; name: string }[]> | null = null;
let namesAt: string | null = null;

function loadNames(): Promise<{ id: number; name: string }[]> {
  namesPromise ??= getJson<Envelope<{ id: number; name: string }[]>>("itemlist.json").then((env) => {
    namesAt = env?.fetchedAt ?? null;
    return env?.value ?? [];
  });
  return namesPromise;
}

export async function nameIndex(): Promise<{ items: number; fetchedAt: string | null }> {
  const names = await loadNames();
  return { items: names.length, fetchedAt: namesAt };
}

let cachedItemsPromise: Promise<Map<number, LucyItem>> | null = null;

/** The handful of item pages this machine actually opened, keyed by Lucy's id. Loaded once. */
function loadCachedItems(): Promise<Map<number, LucyItem>> {
  cachedItemsPromise ??= (async () => {
    const ids = (await getJson<number[]>("items-index.json")) ?? [];
    const items = await Promise.all(ids.map((id) => getJson<Envelope<LucyItem>>(`items/${id}.json`)));
    const out = new Map<number, LucyItem>();
    for (const env of items) if (env?.value) out.set(env.value.id, env.value);
    return out;
  })();
  return cachedItemsPromise;
}

async function byName(): Promise<Map<string, LucyItem>> {
  const items = await loadCachedItems();
  const out = new Map<string, LucyItem>();
  for (const item of items.values()) out.set(normalizeItemName(item.name), item);
  return out;
}

export async function cachedByName(name: string): Promise<LucyItem | null> {
  return (await byName()).get(normalizeItemName(name)) ?? null;
}

export async function getItem(id: number): Promise<LucyItem | null> {
  return (await loadCachedItems()).get(id) ?? null;
}

export async function cachedItems(): Promise<CachedItem[]> {
  const items = await loadCachedItems();
  return [...items.values()].map((item) => ({
    title: item.name,
    origin: "lucy" as const,
    lucyId: item.id,
    card: item.card,
    sources: item.sources,
    outOfEra: item.era === "out-of-era",
    fetchedAt: item.fetchedAt,
  }));
}

/**
 * The substring-first, fuzzy-second mirror search Electron's `searchMirror` runs — the mirror is the
 * whole point of holding the name list, since it's the only way a misspelling finds anything on a
 * site whose own search is a literal substring match.
 */
async function searchMirror(term: string, limit: number): Promise<LucySearchResult[]> {
  const held = await loadNames();
  if (!held.length) return [];
  const needle = term.toLowerCase();
  const substring = held.filter((n) => n.name.toLowerCase().includes(needle));
  if (substring.length >= limit) {
    const ranked = fuzzyRank(term, substring, (n) => n.name, { limit, minScore: 0 }).map((m) => m.item);
    return ranked.map((n) => ({ id: n.id, name: n.name, era: "unknown" as const }));
  }
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

export async function search(term: string): Promise<LucySearchResult[]> {
  const q = itemBaseName(term.trim());
  if (q.length < 2) return [];
  const hits = await searchMirror(q, SEARCH_LIMIT);
  const known = await loadCachedItems();
  return hits.map((hit) => {
    const cached = known.get(hit.id);
    return cached ? { ...hit, era: cached.era } : hit;
  });
}
