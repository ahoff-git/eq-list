/**
 * snapshot.ts — reads the static data glob `scripts/build-web-snapshot.mjs` writes to `public/data/`.
 *
 * Everything here is a `fetch` of a plain file, because that's what the snapshot is: a copy of
 * whatever wiki/lucy/travel/map data the machine that ran the snapshot script already had, taken at
 * build time and shipped as static assets (see `next.config.ts`'s `output: "export"` — there is
 * still no server). Nothing here writes anything back; a page this install doesn't hold is simply a
 * miss, exactly as an empty wiki cache is in Electron.
 */
import { createLogger } from "@/shared/logging";
import { shardOf } from "@/shared/item-shards";
import { fuzzyRank } from "@/shared/fuzzy";
import { parseEqMap, mergeEqMaps, type EqMap } from "@/shared/map/eqmap";
import { spellRows } from "@/shared/spell-search";
import type { CachedSpell, MapSourceReport, SearchResult, WikiPage } from "@/shared/types";
import type { TravelGraph } from "@/shared/travel/types";

const log = createLogger("web-snapshot");

/** Root the snapshot is served from. A future hosted basePath changes this one constant. */
const DATA_BASE = "/data";

async function getText(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${DATA_BASE}/${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    log.debug("fetch failed:", path, (e as Error).message);
    return null;
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const text = await getText(path);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    log.warn("bad JSON in snapshot file:", path);
    return null;
  }
}

// ─── Manifest ────────────────────────────────────────────────────────────────

export interface SnapshotMapSource {
  id: string;
  label: string;
  dir: string;
  zones: number;
  files: number;
  bytes: number;
}

interface Manifest {
  generatedAt: string;
  sections: {
    wikiCache?: { bytes: number; files: number };
    lucyCache?: { bytes: number; files: number };
    travel?: { bytes: number; files: number };
    maps?: { sources: SnapshotMapSource[] };
  };
}

let manifestPromise: Promise<Manifest | null> | null = null;

/**
 * Whether this machine has ever taken a snapshot at all, checked **once** and shared by every
 * reader below — the same `manifest()` fetch, not a new request each time.
 *
 * `public/data/` is gitignored, exactly like the existing `/data/` travel-graph output (per-install,
 * not shared): a fresh checkout or a different machine simply never ran `npm run web:snapshot`, and
 * has none of it. Without this gate, every reader below discovered that the same way — by trying its
 * own fetches and taking a 404 each: 256 of them for a bucket walk (`allPages`), one each for the
 * index files, one for the item pack. A visitor with no snapshot got a wall of console errors on
 * page load rather than a quiet, honest "nothing to search yet".
 */
async function hasSection(key: keyof Manifest["sections"]): Promise<boolean> {
  const m = await manifest();
  return !!m?.sections[key];
}

/** The same gate, for `lucy-snapshot.ts` — a separate module, reusing this one's memoized manifest. */
export const manifestHasLucyCache = (): Promise<boolean> => hasSection("lucyCache");

/** The snapshot's own manifest — what it holds and when it was taken. Fetched once, cached. */
export function manifest(): Promise<Manifest | null> {
  manifestPromise ??= getJson<Manifest>("manifest.json");
  return manifestPromise;
}

// ─── Wiki page cache (the 256-bucket page-store, read the same shape Electron writes it in) ────

const PAGE_BUCKETS = 256;

interface StoredPage {
  version: number;
  page: WikiPage;
}

/** Decode one bucket line: `title \t parse-version \t page-json`. See `electron/wiki/page-store.ts`. */
function decodeLine(line: string): [string, StoredPage] | null {
  const first = line.indexOf("\t");
  const second = line.indexOf("\t", first + 1);
  if (first < 0 || second < 0) return null;
  const title = line.slice(0, first);
  const version = Number(line.slice(first + 1, second));
  try {
    const page = JSON.parse(line.slice(second + 1)) as WikiPage;
    if (!title || !Number.isFinite(version) || !page?.title) return null;
    return [title, { version, page }];
  } catch {
    return null;
  }
}

const bucketCache = new Map<number, Promise<Map<string, StoredPage>>>();

function loadBucket(n: number): Promise<Map<string, StoredPage>> {
  let loading = bucketCache.get(n);
  if (loading) return loading;
  loading = (async () => {
    const out = new Map<string, StoredPage>();
    if (!(await hasSection("wikiCache"))) return out;
    const hex = n.toString(16).padStart(2, "0");
    const text = await getText(`wiki-cache/pages/${hex}.jsonl`);
    if (!text) return out;
    // Last line for a title wins — an append-only bucket, same as the store that wrote it.
    for (const line of text.split("\n")) {
      if (!line) continue;
      const decoded = decodeLine(line);
      if (decoded) out.set(decoded[0], decoded[1]);
    }
    return out;
  })();
  bucketCache.set(n, loading);
  return loading;
}

/**
 * Pages learned this session from an awari peer (`src/lib/web/awari-web.ts`'s `acceptItems`/
 * `acceptSpells`) — never written to the snapshot, but good for the rest of this tab's life, exactly
 * the improvement joining the room is supposed to buy a visitor whose own snapshot is thin or stale.
 */
const overlay = new Map<string, WikiPage>();

export function rememberPage(page: WikiPage): void {
  overlay.set(page.title, page);
}

/** A page held in the snapshot (or learned from a peer this session), or null. */
export async function getPage(title: string): Promise<WikiPage | null> {
  const learned = overlay.get(title);
  if (learned) return learned;
  const bucket = await loadBucket(shardOf(title) % PAGE_BUCKETS);
  return bucket.get(title)?.page ?? null;
}

let allPagesPromise: Promise<Map<string, StoredPage>> | null = null;

/**
 * Every page the snapshot holds, **keyed by the page's own `title`** — all 256 buckets, loaded once.
 *
 * Paid only by a tab that actually joins the awari room and needs to answer `items`/`spells` shard
 * asks (`src/lib/web/item-shard-source.ts`): a plain reader never calls this, and pays only for the
 * one bucket each lookup touches.
 *
 * **Deliberately not keyed by the bucket line's own key.** A page is occasionally cached under an
 * alternate spelling of its title (a legacy fetch, a redirect) whose *bucket key* differs from the
 * `title` field inside the page it decodes to — "Captain Nalots Quickening" (no apostrophe) holding
 * a page whose own `.title` reads "Captain Nalot's Quickening". Both bucket keys survive bucket
 * loading (they hash to different shards), and keying this map by the bucket line would keep both —
 * which the Items/Spells tabs then render as two rows sharing one React key. Keying by `page.title`
 * instead collapses them into the one page an install actually means, keeping whichever was fetched
 * more recently — the same "newest copy wins" rule the room's own mirror family uses (ADR 0164).
 */
export function allPages(): Promise<Map<string, StoredPage>> {
  allPagesPromise ??= (async () => {
    const buckets = await Promise.all(Array.from({ length: PAGE_BUCKETS }, (_, n) => loadBucket(n)));
    const out = new Map<string, StoredPage>();
    for (const bucket of buckets) {
      for (const stored of bucket.values()) {
        const title = stored.page.title;
        const held = out.get(title);
        if (!held || Date.parse(stored.page.fetchedAt) >= Date.parse(held.page.fetchedAt)) out.set(title, stored);
      }
    }
    return out;
  })();
  return allPagesPromise;
}

interface SavedHarvest {
  roster: string[];
}

/** The item-catalogue roster this machine last walked — what `harvest.json` remembers. */
export async function itemRoster(): Promise<string[]> {
  if (!(await hasSection("wikiCache"))) return [];
  const saved = await getJson<SavedHarvest>("wiki-cache/harvest.json");
  return saved?.roster ?? [];
}

// ─── Title indexes (mirrored search corpora — same files Electron's `createCachedIndex` writes) ──

interface CachedIndexFile {
  fetchedAt: string;
  titles: string[];
}

const indexCache = new Map<string, Promise<string[]>>();

function loadIndex(file: string): Promise<string[]> {
  let loading = indexCache.get(file);
  if (loading) return loading;
  loading = hasSection("wikiCache").then((has) =>
    has ? getJson<CachedIndexFile>(`wiki-cache/${file}`).then((j) => j?.titles ?? []) : [],
  );
  indexCache.set(file, loading);
  return loading;
}

function toResult(title: string): SearchResult {
  return { title, wikiPath: `/${title.replace(/ /g, "_")}` };
}

async function fuzzyOver(file: string, term: string): Promise<SearchResult[]> {
  const titles = await loadIndex(file);
  if (!titles.length) return [];
  return fuzzyRank(term, titles, (t) => t, { limit: 12, minScore: 0.45 }).map((r) => toResult(r.item));
}

export const search = (term: string): Promise<SearchResult[]> => fuzzyOver("title-index.json", term);
export const searchZones = (term: string): Promise<SearchResult[]> => fuzzyOver("zone-index.json", term);
export const searchFactions = (term: string): Promise<SearchResult[]> => fuzzyOver("faction-index.json", term);

/**
 * Quests located in / related to `zone` — a real answer over the cached quest pages, not the
 * live category-backlink query Electron's `fetchQuestBacklinks` makes (no wiki API on the web).
 *
 * A quest page's `sources` names the zone it starts in (`{kind:"quest", where:<zone>, detail:"Start
 * zone"}` — see a cached quest page's own shape), which is the same fact the wiki's "Related Zones"
 * card line states in prose. Matching on it is real data, not a guess — the alternative (always
 * answering `[]`) would read as "this zone has no quests", which is worse than an incomplete answer:
 * it's a wrong one.
 */
export async function questsByZone(zone: string): Promise<SearchResult[]> {
  const needle = zone.trim().toLowerCase();
  if (!needle) return [];
  const pages = await allPages();
  const out: SearchResult[] = [];
  for (const { page } of pages.values()) {
    if (page.kind !== "quest") continue;
    const here = page.sources?.some((s) => s.where?.trim().toLowerCase() === needle);
    if (here) out.push({ title: page.title, wikiPath: page.wikiPath, outOfEra: page.outOfEra });
  }
  return out;
}

// Same shape as the other mirrored indexes, and now shares `loadIndex`'s memoizing + `hasSection`
// gate — this used to fetch fresh (and unconditionally) on every call, which is where 3 of the
// duplicate `out-of-era-zones.json` 404s in a snapshot-less environment came from.
export const outOfEraZones = (): Promise<string[]> => loadIndex("out-of-era-zones.json");

// ─── The packed item catalogue (`electron/wiki/index.ts`'s `writePack`/`readPack`) ───────────────

let itemsPromise: Promise<string> | null = null;

/**
 * The item catalogue, as the same packed **rows JSON text** `EqlApi.wiki.cachedItems` returns in
 * Electron — `useItemCatalog` on the far side doesn't care which host produced it.
 */
export function cachedItemsJson(): Promise<string> {
  itemsPromise ??= (async () => {
    if (!(await hasSection("wikiCache"))) return "[]";
    const text = await getText("wiki-cache/catalogue.json");
    if (!text) return "[]";
    // `${signature}\n${titles}\n${rows}` — see `writePack`. The signature is read but not enforced
    // here: a mismatched pack is simply the shape it always was to a reader that never wrote it.
    const first = text.indexOf("\n");
    const second = first < 0 ? -1 : text.indexOf("\n", first + 1);
    if (second < 0) return "[]";
    return text.slice(second + 1);
  })();
  return itemsPromise;
}

let spellsPromise: Promise<string> | null = null;

/**
 * The spell catalogue, as the same **rows JSON text** `EqlApi.wiki.cachedSpells` returns in
 * Electron. There's no persisted spell pack there either (`electron/wiki/index.ts`'s
 * `spellCatalogueJson`) — it's built from the same page-cache walk on every call and cached in
 * memory, which is exactly what this does over the snapshot's own pages instead of `userData`'s.
 */
export function cachedSpellsJson(): Promise<string> {
  spellsPromise ??= allPages().then((pages) => {
    const spells: CachedSpell[] = [];
    for (const { page } of pages.values()) {
      if (page.kind === "spell") spells.push({ title: page.title, wikiPath: page.wikiPath, card: page.card, fetchedAt: page.fetchedAt });
    }
    return JSON.stringify(spellRows(spells));
  });
  return spellsPromise;
}

// ─── Map sources + zone geometry (raw .txt, parsed by the same shared `parseEqMap` Electron uses) ─

export async function mapSources(): Promise<MapSourceReport> {
  if (!(await hasSection("maps"))) return { sources: [] };
  const [m, listing] = await Promise.all([manifest(), getJson<Record<string, string[]>>("maps/zone-files.json")]);
  const sources = m?.sections.maps?.sources ?? [];
  return { sources: sources.map((s) => ({ id: s.id, label: s.label, dir: s.dir, files: listing?.[s.id] ?? [] })) };
}

const GEOMETRY_SUFFIXES = ["", "_1"] as const;
const CREDITS_SUFFIX = "_2";

/** One zone's merged geometry + POIs + credits — the web counterpart to `createMapReader().load`. */
export async function loadMap(sourceId: string, zoneFile: string): Promise<(EqMap & { credits: string[] }) | undefined> {
  if (!(await hasSection("maps"))) return undefined;
  const layers: EqMap[] = [];
  for (const suffix of GEOMETRY_SUFFIXES) {
    const text = await getText(`maps/${sourceId}/${zoneFile}${suffix}.txt`);
    if (text) layers.push(parseEqMap(text));
  }
  if (!layers.length) return undefined;
  const creditsText = await getText(`maps/${sourceId}/${zoneFile}${CREDITS_SUFFIX}.txt`);
  const credits = creditsText ? parseEqMap(creditsText).pois.map((p) => p.label) : [];
  return { ...mergeEqMaps(layers), credits };
}

// ─── Travel graph (built by Electron, cached under userData, glob'd verbatim) ────────────────────

interface StoredGraphs {
  version: number;
  folders: Record<string, { key: string; graph: TravelGraph }>;
}

let graphsPromise: Promise<StoredGraphs | null> | null = null;

function loadGraphs(): Promise<StoredGraphs | null> {
  graphsPromise ??= hasSection("travel").then((has) => (has ? getJson<StoredGraphs>("travel/travel-graphs.json") : null));
  return graphsPromise;
}

/**
 * The graph this machine already built for `sourceId`, if the snapshot's manifest still names a
 * folder path the graph cache recognises — both were taken from the same machine, so this is
 * ordinarily a hit. A route asked for a source with no matching graph is an honest miss, not a crash.
 */
export async function graphFor(sourceId: string): Promise<TravelGraph | undefined> {
  const [stored, m] = await Promise.all([loadGraphs(), manifest()]);
  const source = m?.sections.maps?.sources.find((s) => s.id === sourceId);
  if (!stored || !source) return undefined;
  return stored.folders[source.dir]?.graph;
}
