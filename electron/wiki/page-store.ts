/**
 * page-store.ts — where parsed wiki pages live: one row per page in the shared `eqlist.db`
 * ([ADR 0256](../../specs/decisions/0256-the-wiki-page-cache-moves-onto-sqlite.md), superseding
 * [ADR 0165](../../specs/decisions/0165-the-page-cache-is-a-few-files-not-eleven-thousand.md)'s 256
 * append-only bucket files — see that ADR for why the native-dependency objection to SQLite it
 * raised no longer holds, now that `better-sqlite3` is already in this Electron build for the
 * ledgers, ADR 0232).
 *
 * ## What this is
 *
 * One table, `wiki_pages`, keyed by the page's own title. `kind` and `fetched_at` are promoted to
 * real columns because they're what callers actually filter on outside a full parse (`each` walks
 * every kind and the caller sorts by kind; `factionRows()` wants only `kind = 'faction'`; TTL/age
 * checks read `fetched_at` directly) — the rest of the page is one opaque `page_json` blob, the
 * same "promote what's queried, blob the rest" shape `faction_hits` already uses for its own
 * JSON-ish columns.
 *
 * `put` is `INSERT OR REPLACE` — "the last write for a title wins" is now the database's own job
 * rather than something this file has to implement by hand: no bucket hash, no append-then-
 * compact, no torn-line recovery. A write is one row, durably, or it didn't happen.
 *
 * ## Upgrading an existing install
 *
 * Two older generations of this cache can still be sitting in `userData/wiki-cache`:
 * - **256 `.jsonl` bucket files** (`pages/*.jsonl`, ADR 0165) — the immediately-prior format.
 * - **One loose file per page** (pre-ADR-0165) — shouldn't exist on any install that has launched
 *   since 0165 shipped, kept only because reading through to it costs nothing extra.
 *
 * Both fold into the table on first launch, in the background, keyed by the page's **own title**
 * (so the graded-alias fold — `Cloth Cape +2` landing under `Cloth Cape` — survives exactly as it
 * did before). `get()` reads through to whichever legacy file still holds an unfolded title while
 * this runs, exactly as the bucket store used to read through to loose files.
 *
 * ## Exporting for the web snapshot
 *
 * `scripts/build-web-snapshot.mjs` publishes a static mirror of the wiki cache for the hosted site
 * (`src/lib/web/snapshot.ts` reads it with a plain `fetch()`), and that published format is still
 * the 256-bucket `.jsonl` layout — a public wire format with a browser-side reader on the other
 * end, not something to break just because the *live app's* internal storage changed underneath
 * it. `exportAsBuckets` writes the table back out in that exact shape on demand.
 */
import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { shardOf } from "../../src/shared/item-shards";
import { createLogger } from "../../src/shared/logging";
import type { Migration } from "../sqlite-store";
import type { WikiPage } from "../../src/shared/types";

const log = createLogger("page-store");

/**
 * How many buckets the *legacy import* and *web-snapshot export* wire formats are spread across.
 * No longer a storage concern of the live table — only the shape two things outside this app's own
 * runtime still expect: an old bucket-format install being folded in, and the export new installs'
 * data is published as. `shardOf(title) % BUCKETS` is the same hash the peer-sharding and the old
 * bucket store both already used, reused rather than reinvented a third time.
 */
export const BUCKETS = 256;

export const WIKI_PAGE_MIGRATIONS: readonly Migration[] = [
  {
    version: 9,
    label: "wiki_pages",
    up(db) {
      db.exec(`
        CREATE TABLE wiki_pages (
          title TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL,
          page_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL
        );
        CREATE INDEX wiki_pages_kind_idx ON wiki_pages(kind);
      `);
    },
  },
];

/** How many legacy files (or export rows) are handled before letting the event loop breathe. */
const FOLD_CHUNK = 200;
/** Same idea for `each()`'s row-at-a-time walk — smaller, since a row is parsed here, not just read. */
const EACH_CHUNK = 100;

const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export interface StoredPage {
  version: number;
  page: WikiPage;
}

export interface PageStore {
  /** The page held under `title`, or null. */
  get(title: string): StoredPage | null;
  /** Keep a page. Replaces whatever was held under this title before. */
  put(title: string, version: number, page: WikiPage): void;
  /**
   * Visit every page held, letting the event loop breathe periodically — main is the process every
   * window's IPC goes through, so a walk that blocks it freezes the app.
   */
  each(visit: (entry: StoredPage) => void): Promise<void>;
  /** Resolves once any legacy on-disk cache has been folded in. */
  ready(): Promise<void>;
}

/** Longest legacy cache file name ever written — see `legacyKey`. Only migration needs it now. */
const MAX_CACHE_KEY = 120;
/** How a title became a file name, back when a page was a loose file (pre-ADR-0165). */
const legacyKey = (title: string): string => title.replace(/[^a-z0-9]+/gi, "_").slice(0, MAX_CACHE_KEY);

/**
 * Decode what a legacy cache file, or a bucket line's own payload, holds.
 *
 * v2+ wrote an envelope `{version, page}`; entries from before that were the bare `WikiPage`, and
 * some of those can still be on disk in a cache that's been carried a long way forward.
 */
function decodePage(json: string): StoredPage | null {
  try {
    const parsed = JSON.parse(json) as { version?: number; page?: WikiPage } & Partial<WikiPage>;
    const enveloped = typeof parsed.version === "number" && !!parsed.page;
    const page = (enveloped ? parsed.page : (parsed as WikiPage)) as WikiPage;
    if (!page || typeof page.title !== "string") return null;
    return { page, version: enveloped ? (parsed.version as number) : 1 };
  } catch {
    return null;
  }
}

const bucketOf = (title: string) => shardOf(title) % BUCKETS;
/** `pagesDir` is the bucket folder itself (a legacy install's `wiki-cache/pages`, or an export target). */
const fileFor = (pagesDir: string, n: number) => path.join(pagesDir, `${n.toString(16).padStart(2, "0")}.jsonl`);

/** Split one bucket-file line back into its parts, without parsing the page unless it's wanted. */
function readBucketLine(line: string): StoredPage | null {
  const tab = line.indexOf("\t");
  const second = line.indexOf("\t", tab + 1);
  if (tab < 1 || second < 0) return null;
  const version = Number(line.slice(tab + 1, second));
  const entry = decodePage(line.slice(second + 1));
  if (!entry) return null;
  return Number.isFinite(version) ? { page: entry.page, version } : entry;
}

export function createPageStore(db: Database, legacyDir: string): PageStore {
  const getStmt = db.prepare(`SELECT version, page_json FROM wiki_pages WHERE title = ?`);
  const putStmt = db.prepare(`
    INSERT OR REPLACE INTO wiki_pages (title, kind, version, page_json, fetched_at)
    VALUES (@title, @kind, @version, @page_json, @fetched_at)
  `);
  const eachStmt = db.prepare(`SELECT version, page_json FROM wiki_pages`);
  const hasStmt = db.prepare(`SELECT 1 FROM wiki_pages WHERE title = ?`);
  /**
   * One transaction per bucket file folded, rather than one per row — the fsync cost of a page-a-
   * second harvest replayed as a fold would otherwise be paid a second time.
   *
   * Keyed by `title` (the bucket line's own leading field), **not** `page.title` — a bucket line can
   * be an alias (`Cloth Cape +2`, page title `Cloth Cape`, ADR 0057), and folding by the embedded
   * title instead would silently drop every alias the running store had been correctly keeping apart.
   */
  const putMany = db.transaction((entries: { title: string; version: number; page: WikiPage }[]) => {
    for (const e of entries) putRow(e.title, e.version, e.page);
  });

  function putRow(title: string, version: number, page: WikiPage): void {
    putStmt.run({ title, kind: page.kind, version, page_json: JSON.stringify(page), fetched_at: page.fetchedAt });
  }

  function put(title: string, version: number, page: WikiPage): void {
    try {
      putRow(title, version, page);
    } catch (e) {
      log.warn("cache write failed:", (e as Error).message);
    }
  }

  function decodeRow(row: { version: number; page_json: string } | undefined): StoredPage | null {
    if (!row) return null;
    try {
      return { version: row.version, page: JSON.parse(row.page_json) as WikiPage };
    } catch {
      return null;
    }
  }

  /**
   * True until the legacy caches on disk are folded in.
   *
   * While set, a lookup that misses the table falls back to reading whichever legacy file still
   * holds it — so an upgrade keeps working from the first millisecond rather than waiting on a fold
   * of a whole cache. The table is checked *first*, so a page written during the fold is never
   * shadowed by an older legacy copy.
   */
  let migrating = true;

  /** Has a page under this title already landed in the table — a live write that beat the fold to it? */
  const alreadyHeld = (title: string): boolean => !!hasStmt.get(title);

  /** Read through to whichever legacy file still holds `title`, while the fold hasn't reached it. */
  function readLegacy(title: string): StoredPage | null {
    // The bucket a pre-migration install would have kept this title's page in (ADR 0165).
    try {
      const text = fs.readFileSync(fileFor(path.join(legacyDir, "pages"), bucketOf(title)), "utf8");
      let found: StoredPage | null = null;
      for (const raw of text.split("\n")) {
        if (!raw.startsWith(`${title}\t`)) continue;
        const entry = readBucketLine(`${raw}\n`);
        if (entry) found = entry; // the last matching line in the file wins, same as it always did
      }
      if (found) return found;
    } catch {
      /* no bucket file for this shard */
    }
    // Older still: one loose file per page, named by a sanitized title (pre-ADR-0165).
    try {
      return decodePage(fs.readFileSync(path.join(legacyDir, `${legacyKey(title)}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  function get(title: string): StoredPage | null {
    const found = decodeRow(getStmt.get(title) as { version: number; page_json: string } | undefined);
    if (found) return found;
    return migrating ? readLegacy(title) : null;
  }

  async function each(visit: (entry: StoredPage) => void): Promise<void> {
    await migration;
    let n = 0;
    for (const row of eachStmt.iterate() as IterableIterator<{ version: number; page_json: string }>) {
      const entry = decodeRow(row);
      if (entry) visit(entry);
      if (++n % EACH_CHUNK === 0) await breathe();
    }
  }

  /**
   * Fold a one-file-per-page cache into the table, then delete it (pre-ADR-0165).
   *
   * Keyed by the page's **own title** rather than the file name, which quietly drops the graded
   * aliases the same way the bucket-store migration did: asking for `Cloth Cape +2` cached the base
   * page under the asked-for name (ADR 0057), so some pages were on disk twice. There is no way to
   * recover `+2` from `Cloth_Cape_2`, and no reason to want to.
   *
   * Files that don't decode to a page are left alone: the title/zone indexes, the harvest state and
   * the catalogue pack all live in the same directory and none of them is a page.
   */
  async function foldLooseFiles(): Promise<void> {
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(legacyDir);
    } catch {
      return; // no directory at all yet
    }
    const legacy = names.filter((n) => n.endsWith(".json"));
    const done: string[] = [];
    let n = 0;
    for (const name of legacy) {
      if (++n % FOLD_CHUNK === 0) await breathe();
      let entry: StoredPage | null;
      try {
        entry = decodePage(await fs.promises.readFile(path.join(legacyDir, name), "utf8"));
      } catch {
        continue;
      }
      if (!entry || !entry.page.kind) continue; // an index or the pack, not a page
      done.push(name);
      // Anything already in the table was written since this process started, so it is newer than
      // whatever the old file holds. Leave it.
      if (alreadyHeld(entry.page.title)) continue;
      put(entry.page.title, entry.version, entry.page);
    }
    // Only now, with every page safely in the table, does the old cache go. A crash before this
    // point simply leaves files for the next launch to fold in again — `put` is idempotent and the
    // `alreadyHeld` check above stops a second copy landing.
    for (const [i, name] of done.entries()) {
      if (i % FOLD_CHUNK === 0) await breathe();
      try {
        await fs.promises.rm(path.join(legacyDir, name), { force: true });
      } catch {
        /* a file we couldn't delete is re-folded next launch and skipped as already held */
      }
    }
  }

  /**
   * Fold the 256 append-only bucket files into the table, then delete them (ADR 0165, superseded by
   * this file). One transaction per bucket, so a harvest's worth of individually-appended lines
   * doesn't cost a fsync each on the way in.
   */
  async function foldBuckets(): Promise<void> {
    const pagesDir = path.join(legacyDir, "pages");
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(pagesDir);
    } catch {
      return; // no bucket cache at all
    }
    for (const name of names.filter((n) => n.endsWith(".jsonl"))) {
      let text: string;
      try {
        text = await fs.promises.readFile(path.join(pagesDir, name), "utf8");
      } catch {
        continue;
      }
      const rows: { title: string; version: number; page: WikiPage }[] = [];
      for (const raw of text.split("\n")) {
        if (!raw) continue;
        // The line's own leading field is the key it was `put` under, which is what a lookup by
        // title matches against — and is not always `page.title` (an alias, ADR 0057). A torn
        // trailing line (no tab at all) has no key to recover and is dropped here, same as before.
        const tab = raw.indexOf("\t");
        if (tab < 1) continue;
        const key = raw.slice(0, tab);
        const entry = readBucketLine(`${raw}\n`);
        // Same "a live write already beat the fold to it" guard as the loose-file fold. Duplicate
        // keys within one bucket (an append log can hold several lines for the same key) are
        // harmless here: they land in file order and the last one, as always, wins.
        if (!entry || alreadyHeld(key)) continue;
        rows.push({ title: key, version: entry.version, page: entry.page });
      }
      if (rows.length) putMany(rows);
      await breathe();
    }
    try {
      await fs.promises.rm(pagesDir, { recursive: true, force: true });
    } catch {
      /* re-folded next launch; put/INSERT OR REPLACE is idempotent either way */
    }
  }

  const migration = (async () => {
    const startedAt = Date.now();
    // Buckets before loose files — the same priority `readLegacy` already reads through in (bucket
    // checked first, loose file only as the older fallback). Both folds skip a title `alreadyHeld`
    // rather than compare freshness, so whichever runs first permanently wins a title held by both
    // generations; folding loose files first would let a stale pre-ADR-0165 copy shadow a newer
    // ADR-0165 bucket copy of the same page for good, the instant migration settles.
    await foldBuckets();
    await foldLooseFiles();
    migrating = false;
    log.debug("page cache: legacy fold settled in", `${Date.now() - startedAt}ms`);
  })().catch((e: unknown) => {
    log.warn("page cache legacy fold failed:", (e as Error).message);
    migrating = false;
  });

  return { get, put, each, ready: () => migration };
}

/**
 * Export every page as the 256-bucket `.jsonl` wire format `scripts/build-web-snapshot.mjs`
 * publishes for the hosted site's static reader (`src/lib/web/snapshot.ts`) — see the module
 * header. `pagesDestDir` is the bucket folder itself (e.g. `.../public/data/wiki-cache/pages`).
 *
 * Synchronous and stand-alone (no `PageStore` needed): a script calling this wants a finished
 * directory, not a running client, and it always runs against a database nothing else is writing
 * to at the same time.
 */
export function exportAsBuckets(db: Database, pagesDestDir: string): void {
  fs.mkdirSync(pagesDestDir, { recursive: true });
  const byBucket = new Map<number, string[]>();
  const rows = db.prepare(`SELECT title, version, page_json FROM wiki_pages`).iterate() as IterableIterator<{
    title: string;
    version: number;
    page_json: string;
  }>;
  for (const row of rows) {
    const n = bucketOf(row.title);
    const lines = byBucket.get(n);
    const line = `${row.title}\t${row.version}\t${row.page_json}\n`;
    if (lines) lines.push(line);
    else byBucket.set(n, [line]);
  }
  for (let n = 0; n < BUCKETS; n++) {
    const lines = byBucket.get(n);
    if (lines?.length) fs.writeFileSync(fileFor(pagesDestDir, n), lines.join(""), "utf8");
  }
}
