/**
 * changes.ts — reading the wiki's own account of what it did, instead of asking again on a clock.
 *
 * Every other refresh in this app is a **poll**. A cached page expires after so many days and is
 * fetched again whether or not a soul has touched it; the roster is re-walked weekly whether or not
 * a page has been created. Both are guesses standing in for a fact the wiki will simply tell us
 * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)).
 *
 * Measured against eqlwiki, over a fortnight:
 *
 * |                                   | polling            | asking            |
 * |-----------------------------------|--------------------|-------------------|
 * | keeping 19,790 pages fresh        | 19,790 re-fetches  | **1,362**         |
 * | finding pages that did not exist  | 228 listing calls  | **9**, same calls |
 *
 * And the pages are *fresher*, not merely cheaper: an edit made today is picked up tomorrow rather
 * than whenever the fortnight happens to run out.
 *
 * ## What this module is, and is not
 *
 * It is the **pure half** — given a batch of changes and two questions it can ask about what we
 * already hold, it says which pages are now out of date and which titles are worth investigating.
 * It performs no requests, reads no cache and keeps no state, so the whole policy is testable in
 * milliseconds ([testing](../../specs/testing/README.md)).
 *
 * It deliberately does **not** decide whether an unfamiliar title belongs in the roster. That needs
 * the page's categories, which is a request, and one this module has no business making. It hands
 * back the candidates instead; the client asks about them in a single batched lookup and applies the
 * same category test the walk uses.
 */
import { createLogger } from "../../src/shared/logging";
import type { WikiChange } from "./api";

const log = createLogger("wiki-changes");

/** What a batch of changes means for what we hold. */
export interface ChangePlan {
  /**
   * Pages we hold whose copy is **older than the change** — to be fetched again.
   *
   * The comparison is against our copy's own pull date rather than against the cursor, because a
   * page may have been fetched *after* it was edited (somebody opened it by hand, or a peer sent a
   * newer copy) and re-fetching that is pure waste.
   */
  stale: string[];
  /** Titles the roster has never heard of. Candidates only — a category test decides. */
  unknown: string[];
  /**
   * The newest change seen, to persist as the next cursor.
   *
   * Absent when the batch was empty, which must leave the cursor **where it was**: moving it to
   * "now" on an empty answer would skip whatever was edited between the last change and the poll.
   */
  cursor?: string;
}

export interface ChangeContext {
  /** When our copy of this title was fetched, in ms. `undefined` when we don't hold one. */
  heldAt(title: string): number | undefined;
  /** Is this title already in the roster? A title can be in the roster and not held. */
  inRoster(title: string): boolean;
}

/**
 * Sort a batch of recent changes into "re-fetch this" and "find out about this".
 *
 * Three kinds of change arrive and only two matter here. An **edit** to something we hold makes our
 * copy wrong. A **new** page may be something we want. A **log** event — a delete, a move — is left
 * to resolve itself: it is rare (12 in a month, measured), and treating it as an ordinary change
 * means the page is re-fetched, 404s, and is recorded as failed, which is the correct outcome
 * reached without a second code path that would almost never run.
 */
export function planChanges(changes: readonly WikiChange[], ctx: ChangeContext): ChangePlan {
  const stale = new Set<string>();
  const unknown = new Set<string>();
  let newest = 0;
  let cursor: string | undefined;

  for (const change of changes) {
    const at = Date.parse(change.timestamp);
    // A timestamp we cannot read must not become the cursor — that would move the window past
    // changes we never saw. The change itself is still worth acting on.
    if (Number.isFinite(at) && at > newest) {
      newest = at;
      cursor = change.timestamp;
    }

    const held = ctx.heldAt(change.title);
    if (held === undefined) {
      // Not held. Either it is in the roster and simply not fetched yet — in which case the planner
      // already has it as work and this changes nothing — or it is a title we have never seen.
      if (!ctx.inRoster(change.title)) unknown.add(change.title);
      continue;
    }
    // Held, and our copy predates the edit. Anything else is a copy already newer than the news.
    if (!Number.isFinite(at) || at > held) stale.add(change.title);
  }

  log.debug(`${changes.length} changes → ${stale.size} stale, ${unknown.size} unknown titles`);
  return { stale: [...stale], unknown: [...unknown], cursor };
}

/**
 * Which of `titles` belong in the roster, judged by the categories the walk reached.
 *
 * The walk is what defines *what counts as ours* — it descended from the seeds and recorded every
 * category it passed through — so applying that same set to a newly created page is the incremental
 * form of the same decision, with no second rule to keep in step. A page created directly in
 * `Category:Fingers` is an item for exactly the reason the walk would have found it there.
 */
export function belongsToRoster(
  titles: readonly string[],
  categoriesOf: ReadonlyMap<string, readonly string[]>,
  walked: ReadonlySet<string>,
): string[] {
  return titles.filter((title) => (categoriesOf.get(title) ?? []).some((c) => walked.has(c)));
}

/**
 * Has change-tracking actually been running?
 *
 * The question the page TTL now hangs on. Within retention, "the wiki has not mentioned this page"
 * is real evidence of freshness and a page may be kept much longer. Outside it — a cursor that is
 * missing, or older than the wiki remembers — the honest answer is *we do not know what happened*,
 * and the TTL has to go back to doing the work on its own.
 */
export function trackingCurrent(cursor: string | undefined, now: number, retentionMs: number): boolean {
  if (!cursor) return false;
  const at = Date.parse(cursor);
  return Number.isFinite(at) && now - at < retentionMs;
}
