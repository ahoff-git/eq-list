/**
 * page-store.ts — where parsed wiki pages live on disk.
 *
 * ## Why not a file per page
 *
 * One file per page is the obvious store, and it is what this was until the catalogue grew: **11,523
 * files** holding 19.4 MB of data and occupying 53.5 MB, since every one of them is rounded up to a
 * 4 KB cluster. The size is not really the problem. Reading them all is **11,523 separate opens**,
 * and on Windows every open is a real-time antimalware scan — which is why a catalogue build
 * presented as the whole machine seizing rather than as a slow read.
 *
 * The catalogue pack hides that on a warm launch, but the pack is dropped whenever a page changes,
 * and pages change constantly: a peer hands you a shard, you open an item, the harvest ticks. So the
 * full walk was never as rare as the pack made it look, and every one of them cost the burst again.
 *
 * ## What this is instead
 *
 * **256 append-only files, about forty-five pages each.**
 *
 * - A page is one line: `title \t parse-version \t page-json`. A wiki title contains no tab and no
 *   newline, so the split is exact and needs no escaping — and the JSON is parsed only when somebody
 *   asks for *that* page, so loading a bucket to answer one lookup does not parse the other forty.
 * - A write **appends a line** rather than rewriting the bucket. A write therefore costs what it
 *   cost before: the harvest writes a page a second for three hours without ever rewriting 75 KB to
 *   do it. The last line for a title wins, and the file is rewritten only once the dead weight is
 *   worth more than the rewrite (`COMPACT_RATIO`).
 * - Reading everything is **256 opens instead of 11,523**.
 *
 * The bucket is `shardOf(title) % BUCKETS`, reusing the peer-sharding hash
 * ([item-shards](../../src/shared/item-shards.ts)) rather than inventing a second one. Because 1024
 * shards divide evenly by 256 buckets, every page of a given peer shard lands in the same file.
 *
 * ## Crash safety
 *
 * A torn append leaves half a line. A line that does not split into three parts, or whose JSON does
 * not parse, is skipped when the bucket loads — costing a re-fetch of that one page, which is
 * exactly what a truncated file cost before. Nothing else in the bucket is affected, because a line
 * is self-contained.
 */
import fs from "node:fs";
import path from "node:path";
import { shardOf } from "../../src/shared/item-shards";
import { createLogger } from "../../src/shared/logging";
import type { WikiPage } from "../../src/shared/types";

const log = createLogger("page-store");

/**
 * How many files the page cache is spread across.
 *
 * The two costs pull opposite ways: reading everything is one open per bucket, and reading a single
 * page loads the whole bucket it is in. 256 puts a full read at 256 opens (45× cheaper than a file
 * each) while keeping a bucket around 75 KB, which is a few milliseconds to load and parse.
 */
export const BUCKETS = 256;

/** Rewrite a bucket once superseded lines are worth more than the live ones. */
const COMPACT_RATIO = 2;
/** …but never for a file small enough that the rewrite costs more than the waste. */
const COMPACT_MIN_BYTES = 64 * 1024;

/** How many legacy files are folded in before letting the event loop breathe. */
const MIGRATE_CHUNK = 200;

const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export interface StoredPage {
  version: number;
  page: WikiPage;
}

export interface PageStore {
  /** The page held under `title`, or null. */
  get(title: string): StoredPage | null;
  /** Keep a page. Appends; the caller's copy is authoritative from here. */
  put(title: string, version: number, page: WikiPage): void;
  /**
   * Visit every page held, letting the event loop breathe between buckets — main is the process
   * every window's IPC goes through, so a walk that blocks it freezes the app.
   */
  each(visit: (entry: StoredPage) => void): Promise<void>;
  /** Resolves once any legacy one-file-per-page cache has been folded in. */
  ready(): Promise<void>;
}

/**
 * Longest legacy cache file name we ever wrote — see `legacyKey`. Only migration needs it now.
 */
const MAX_CACHE_KEY = 120;

/** How a title became a file name, back when a page was a file. */
const legacyKey = (title: string): string => title.replace(/[^a-z0-9]+/gi, "_").slice(0, MAX_CACHE_KEY);

/**
 * Decode what a cache file or a bucket line holds.
 *
 * v2+ writes an envelope `{version, page}`; entries older than that were the bare `WikiPage`, and
 * some of those are still on disk in caches that have been carried forward.
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

/** One bucket file, and what we know about it without re-reading it. */
interface Bucket {
  /** title → the whole line, newline included. The last write for a title wins. */
  lines: Map<string, string>;
  /** Bytes the file holds, live and superseded together. */
  bytes: number;
  /** Bytes the live lines are worth — what a rewrite would leave. */
  live: number;
  loaded: boolean;
}

export function createPageStore(dir: string): PageStore {
  const pagesDir = path.join(dir, "pages");
  fs.mkdirSync(pagesDir, { recursive: true });

  const buckets: (Bucket | undefined)[] = new Array(BUCKETS);
  const fileFor = (n: number) => path.join(pagesDir, `${n.toString(16).padStart(2, "0")}.jsonl`);
  const bucketOf = (title: string) => shardOf(title) % BUCKETS;

  /**
   * True until the legacy files are folded in and gone.
   *
   * While it is set, a lookup that misses the buckets falls back to reading the old single file —
   * so an upgrade keeps working from the first millisecond rather than waiting on a migration of
   * eleven thousand files. Buckets are checked *first*, so a page written during the migration is
   * never shadowed by the older copy the migration is still holding.
   */
  let migrating = true;

  function load(n: number): Bucket {
    const held = buckets[n];
    if (held?.loaded) return held;
    const bucket: Bucket = held ?? { lines: new Map(), bytes: 0, live: 0, loaded: false };
    buckets[n] = bucket;
    bucket.loaded = true;
    let text: string;
    try {
      text = fs.readFileSync(fileFor(n), "utf8");
    } catch {
      return bucket; // no file yet, which is simply an empty bucket
    }
    bucket.bytes = text.length;
    let live = 0;
    // A line ends in "\n", so the split's last element is the empty tail — or a torn write, which
    // fails to split into three and is dropped below either way.
    for (const raw of text.split("\n")) {
      if (!raw) continue;
      const tab = raw.indexOf("\t");
      if (tab < 1) continue;
      const line = `${raw}\n`;
      const prev = bucket.lines.get(raw.slice(0, tab));
      if (prev) live -= prev.length;
      bucket.lines.set(raw.slice(0, tab), line);
      live += line.length;
    }
    bucket.live = live;
    return bucket;
  }

  /** Split a stored line back into its parts, without parsing the page unless it is wanted. */
  function readLine(line: string): StoredPage | null {
    const tab = line.indexOf("\t");
    const second = line.indexOf("\t", tab + 1);
    if (tab < 1 || second < 0) return null;
    const version = Number(line.slice(tab + 1, second));
    const entry = decodePage(line.slice(second + 1));
    if (!entry) return null;
    // The line's version is the authority: `decodePage` only sees the page, which no longer carries
    // the envelope it was written with.
    return Number.isFinite(version) ? { page: entry.page, version } : entry;
  }

  function compact(n: number, bucket: Bucket): void {
    const file = fileFor(n);
    const temp = `${file}.tmp`;
    try {
      fs.writeFileSync(temp, [...bucket.lines.values()].join(""), "utf8");
      fs.renameSync(temp, file);
      bucket.bytes = bucket.live;
      log.debug("compacted bucket", n.toString(16), "to", bucket.live, "bytes");
    } catch (e) {
      log.warn("couldn't compact a page bucket:", (e as Error).message);
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* a leftover .tmp is harmless: the next compaction overwrites it */
      }
    }
  }

  function put(title: string, version: number, page: WikiPage): void {
    const n = bucketOf(title);
    const bucket = load(n);
    const line = `${title}\t${version}\t${JSON.stringify(page)}\n`;
    const prev = bucket.lines.get(title);
    bucket.lines.set(title, line);
    bucket.live += line.length - (prev?.length ?? 0);
    try {
      fs.appendFileSync(fileFor(n), line, "utf8");
      bucket.bytes += line.length;
    } catch (e) {
      log.warn("cache write failed:", (e as Error).message);
      return;
    }
    if (bucket.bytes > COMPACT_MIN_BYTES && bucket.bytes > COMPACT_RATIO * bucket.live) {
      compact(n, bucket);
    }
  }

  function get(title: string): StoredPage | null {
    const line = load(bucketOf(title)).lines.get(title);
    if (line) return readLine(line);
    if (!migrating) return null;
    // Not folded in yet. One open, which is what this lookup cost before the store existed.
    try {
      return decodePage(fs.readFileSync(path.join(dir, `${legacyKey(title)}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * Fold a one-file-per-page cache into buckets, then delete it.
   *
   * Keyed by the page's **own title** rather than the file name, which quietly drops the graded
   * aliases: asking for `Cloth Cape +2` cached the base page under the asked-for name
   * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)), so 36 pages were on disk
   * twice. There is no way to recover `+2` from `Cloth_Cape_2`, and no reason to want to — the copies
   * are identical, and the next graded lookup re-caches one for the cost of a single fetch.
   *
   * Files that do not decode to a page are left alone: the title/zone indexes, the harvest state and
   * the catalogue pack all live in the same directory and none of them is a page.
   */
  async function migrate(): Promise<void> {
    let names: string[] = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      /* no directory yet, which is the same as nothing to fold */
    }
    const legacy = names.filter((n) => n.endsWith(".json"));
    if (!legacy.length) {
      // Nothing to fold — but this **must** still clear the flag. Left set, every lookup that missed
      // the buckets would go on trying to open a file that has never existed: one wasted open per
      // cache miss, for ever, on every install that never had the old layout.
      migrating = false;
      return;
    }
    const startedAt = Date.now();
    const done: string[] = [];
    let n = 0;
    for (const name of legacy) {
      if (++n % MIGRATE_CHUNK === 0) await breathe();
      let entry: StoredPage | null;
      try {
        entry = decodePage(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        continue;
      }
      if (!entry || !entry.page.kind) continue; // an index or the pack, not a page
      done.push(name);
      // Anything already in the bucket was written since this process started, so it is newer than
      // whatever the old file holds. Leave it.
      if (load(bucketOf(entry.page.title)).lines.has(entry.page.title)) continue;
      put(entry.page.title, entry.version, entry.page);
    }
    // Only now, with every page safely in a bucket, does the old cache go. A crash before this point
    // simply leaves files for the next launch to fold in again — `put` is idempotent and the bucket
    // check above stops a second copy landing.
    migrating = false;
    for (const [i, name] of done.entries()) {
      if (i % MIGRATE_CHUNK === 0) await breathe();
      try {
        await fs.promises.rm(path.join(dir, name), { force: true });
      } catch {
        /* a file we couldn't delete is re-folded next launch and skipped as already held */
      }
    }
    log.debug("folded", done.length, "page files into", BUCKETS, "buckets in", `${Date.now() - startedAt}ms`);
  }

  const migration = migrate().catch((e: unknown) => {
    log.warn("page cache migration failed:", (e as Error).message);
    migrating = false;
  });

  async function each(visit: (entry: StoredPage) => void): Promise<void> {
    await migration;
    for (let n = 0; n < BUCKETS; n++) {
      const bucket = load(n);
      for (const line of bucket.lines.values()) {
        const entry = readLine(line);
        if (entry) visit(entry);
      }
      // Between buckets rather than every hundred pages: a bucket is one read and forty-odd small
      // parses, so the longest uninterrupted block is a couple of milliseconds.
      await breathe();
    }
  }

  return { get, put, each, ready: () => migration };
}
