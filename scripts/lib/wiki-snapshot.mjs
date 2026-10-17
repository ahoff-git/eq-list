/**
 * wiki-snapshot.mjs — the committed mirror of the app's wiki page cache, read as a map.
 *
 * `public/data/wiki-cache/pages/*.jsonl` is the web snapshot (ADR 0278): the live app's parsed pages,
 * written out in the 256-bucket wire format `electron/wiki/page-store.ts` exports. A generator that
 * needs a fact the cache already holds should read it here before asking the wiki — it is plain files,
 * so no native module and no running app are needed.
 *
 * Each line is `key \t shard \t page-json`; a later line for a title replaces an earlier one, the
 * bucket format's own "last write wins". A line that won't parse is skipped, as the app's reader does.
 * `build-mob-races.mjs` reads the same files with its own copy of this loop and is left as it is.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./cli.mjs";

export const SNAPSHOT_PAGES_DIR = path.join(ROOT, "public/data/wiki-cache/pages");

/** Every cached page by its title. Empty when there is no snapshot. */
export function snapshotPages(dir = SNAPSHOT_PAGES_DIR) {
  const pages = new Map();
  if (!fs.existsSync(dir)) return pages;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".jsonl")) continue;
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const second = line.indexOf("\t", line.indexOf("\t") + 1);
      if (second < 0) continue;
      try {
        const page = JSON.parse(line.slice(second + 1));
        if (page?.title) pages.set(page.title, page);
      } catch {
        // a torn line — skipped, as the app's own reader does
      }
    }
  }
  return pages;
}
