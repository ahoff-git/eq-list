/**
 * missing-pages.ts — titles eqlwiki has told us it doesn't have, and when it last said so.
 *
 * A title with no page is still asked about: a hover card, a list row, a quest pickup's own name
 * ("Rod (Ena)", which is ours rather than the wiki's — ADR 0291). Without a memory each of those was
 * one more `parse` request and one more "page doesn't exist" warning, every time, for an answer
 * that hadn't changed. So a **missing** answer is kept for a day, on disk so a restart doesn't throw
 * it away, and the title is asked again once that day is up, in case someone has since written the
 * page.
 *
 * Only `missingtitle` is recorded. A timeout or a 500 says nothing about the page, and must not hide
 * one that exists for a day.
 *
 * Pure apart from the file it's handed; `now` is injectable so the day can be tested without waiting
 * one. Tested in `electron/tests/missing-pages.test.ts`.
 */
import { readJson, writeJson } from "../json-store";

/** How long a "doesn't exist" stands before the wiki is asked again. */
export const MISSING_RECHECK_MS = 24 * 60 * 60 * 1000;

export interface MissingPages {
  /** Whether the wiki said this title doesn't exist, recently enough to take its word again. */
  isMissing(title: string): boolean;
  /** The wiki just said this title doesn't exist. */
  markMissing(title: string): void;
  /** The wiki just served this title, so any earlier "doesn't exist" is out of date. */
  markFound(title: string): void;
}

/** Folded so "Rod (Ena)" and "rod (ena)" are one title, as the wiki itself treats a first letter. */
const key = (title: string) => title.trim().toLowerCase();

export function createMissingPages(
  file: string,
  { now = Date.now, recheckMs = MISSING_RECHECK_MS }: { now?: () => number; recheckMs?: number } = {},
): MissingPages {
  /** Title (folded) → when the wiki last said it doesn't exist. Read on first use. */
  let seen: Map<string, number> | null = null;

  function load(): Map<string, number> {
    seen ??= new Map(Object.entries(readJson<Record<string, number>>(file, {})));
    return seen;
  }

  /** Expired entries are dropped on the way out, so the file only ever holds live answers. */
  function save(): void {
    const live = [...load()].filter(([, at]) => now() - at < recheckMs);
    seen = new Map(live);
    writeJson(file, Object.fromEntries(live), { what: "missing wiki pages" });
  }

  return {
    isMissing(title) {
      const at = load().get(key(title));
      return at !== undefined && now() - at < recheckMs;
    },
    markMissing(title) {
      load().set(key(title), now());
      save();
    },
    markFound(title) {
      if (load().delete(key(title))) save();
    },
  };
}
