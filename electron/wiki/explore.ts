/**
 * explore.ts — finding the items the wiki has and we have never heard of.
 *
 * The item roster used to be one question: *list `Category:Items`*. That is 11,167 pages, and it is
 * not the item list. `Category:Items` has **thirty subcategories**, they have subcategories of their
 * own — 76 categories in all — and an item filed only in one of them was never in our roster, was
 * therefore never in a shard, and could not be fetched, asked for, or noticed missing. Measured
 * against the live wiki: **680 item pages**, `Mistmoore Heirloom Ring` among them
 * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 *
 * So the roster is a **walk**, not a listing: start at the seeds, and every category a category names
 * is another place to look. That is the "explore the wiki and follow the categories around" this
 * exists for, and it is bounded — the whole wiki has 715 categories, and the seeds reach 80 of them.
 *
 * ## Why it stops at the closure edge
 *
 * The obvious next step is to hop *sideways* — an item is also in `Category:Fingers` and
 * `Category:Mistmoore Castle`, so follow those too. Measured, that reaches **10,947 further pages**
 * through the zone and era categories, which hold everything in the zone indiscriminately: items,
 * mobs, quests, spells, factions and maintenance pages together. They cannot be told apart before
 * fetching — `Template:Itempage` looked like the discriminator and isn't, since it appears on 47 of
 * 60 mob pages because a mob transcludes an item tooltip for every line of its loot.
 *
 * That is an argument against the *sideways hop*, and it is worth being clear that it was never an
 * argument against mobs: `Category:NPCs` names them directly, so the useful half of what the
 * sideways hop would have swept up is reached cleanly by a seed
 * ([ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)). What is left
 * outside the seeds' closures is 3,744 pages the app has no reader for.
 *
 * The closure edge is where the wiki stops *asserting* what a page is, and that is the right place
 * for a crawl to stop.
 *
 * ## The trickle
 *
 * The gap goes around **every request**, not every category. `Category:Items` is twenty-three
 * continuations on its own, so gating per category would fire twenty-three requests back to back
 * inside what [ADR 0153](../../specs/decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md)
 * promised would be a page a second. `fetchCategorySlice` hands back the cursor rather than
 * following it, so this loop can pause between slices exactly as the page crawl pauses between pages.
 *
 * Every dependency is injected — the listing, the clock, the sleep, the stop signal — so the walk is
 * testable in milliseconds with no network ([testing](../../specs/testing/README.md)).
 */
import { createLogger } from "../../src/shared/logging";

const log = createLogger("wiki-explore");

/**
 * Where the walk starts.
 *
 * **Items and NPCs**, because those are the two things this app reads pages *for*
 * ([ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)).
 *
 * `Category:NPCs` is a late addition and it corrects a mistake. Mob pages were treated as a cost to
 * be avoided, on the strength of [ADR 0163](../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)
 * — which only ever said they were the expensive way to learn a **level**, and was right about that.
 * It said nothing about the rest of a mob page, and the rest is the only copy the wiki has: the
 * **drop rates** that power the Hunt tab live on the mob, not the item; so do the spawn zone and
 * location, the level/race/class/HP line, and the faction impact.
 *
 * It is also 7,944 pages found in **34 requests** over four categories, disjoint from the items
 * (overlap: one page). And it removes a two-pass awkwardness rather than adding one: mobs used to
 * reach the roster only by being *named as a source* by an item already held, so a first run on an
 * empty cache was items-only and you had to press the button again to pick up the mobs the first run
 * had just learned about. Seeded directly, they are simply there.
 *
 * Quests still arrive the old way — named by an item — because `Category:Quests` holds 862 pages
 * whose only use here is giving a reward item its level, and the ones no item names are pages nothing
 * would ever read.
 */
export const EXPLORE_SEEDS = ["Category:Items", "Category:NPCs"];

/**
 * A ceiling on how far the walk may wander, in categories.
 *
 * The whole wiki has 715 categories and the seeds reach 76, so this is not a tuning knob — it is the
 * guard against a category cycle or a re-parented tree turning a bounded walk into an unbounded one.
 * Generous enough that reaching it means something is wrong, and low enough that being wrong is cheap.
 */
export const MAX_CATEGORIES = 400;

export interface ExploreDeps {
  /** One request's worth of one category. The cursor is followed by this module, not by the client. */
  listCategory(category: string, cursor?: string): Promise<{ pages: string[]; subcats: string[]; cursor?: string }>;
  wait(ms: number): Promise<void>;
  /** Checked before every request, so stopping a harvest stops the walk inside it. */
  stopped?(): boolean;
  onProgress?(seen: { categories: number; titles: number; at: string }): void;
}

export interface ExploreResult {
  /** Every ns-0 page in every category reached — the roster. Sorted, so two walks compare equal. */
  titles: string[];
  /** The categories we actually walked, for the log line that says how wide it went. */
  categories: string[];
  /** Categories the wiki wouldn't list. A walk survives one; it doesn't pretend it didn't happen. */
  failed: string[];
  /** We hit `MAX_CATEGORIES` and stopped early, so `titles` is a floor rather than the answer. */
  truncated: boolean;
  /**
   * Did the walk reach the end of the graph?
   *
   * False when it was stopped, capped, **or any category failed**. It matters because the caller
   * writes down *when* the roster was last walked, and stamping a short walk as this week's answer
   * would freeze an incomplete list for a week — turning one press of Stop, or one bad minute at the
   * wiki, into a silently short catalogue.
   *
   * A failure is counted because it is now known to be *transient*. A category that simply does not
   * exist answers with an empty member list, not an error (measured); only a refused request reaches
   * `failed`, and those are network blips and API errors. So re-walking on the next run is both
   * cheap and terminating — there is no permanently-failing category to loop on.
   */
  complete: boolean;
}

/**
 * Walk the category graph from `seeds` and return every page it reaches.
 *
 * Breadth-first and cycle-safe: this wiki's categories are a graph, not a tree — `Category:Weapons`
 * and `Category:Equipment` each reach the other's children — so a walk that trusted it to be acyclic
 * would revisit categories for as long as the budget allowed and return the same pages many times.
 * The `visited` set is what makes the walk terminate at all, and it is keyed on the category title
 * exactly as MediaWiki returns it.
 */
export async function exploreCategories(
  seeds: readonly string[],
  deps: ExploreDeps,
  gapMs: number,
): Promise<ExploreResult> {
  const titles = new Set<string>();
  const visited = new Set<string>();
  const failed: string[] = [];
  const queue = [...seeds];
  let truncated = false;
  let stopped = false;
  // Whether a request has been made yet — the gap belongs *between* requests, so the first is free
  // and a walk of one small category costs one request and no waiting.
  let asked = false;

  while (queue.length) {
    if (deps.stopped?.()) {
      stopped = true;
      break;
    }
    const category = queue.shift()!;
    if (visited.has(category)) continue;
    if (visited.size >= MAX_CATEGORIES) {
      truncated = true;
      log.warn("category walk hit its ceiling at", MAX_CATEGORIES, "- roster may be short");
      break;
    }
    visited.add(category);

    let cursor: string | undefined;
    do {
      if (deps.stopped?.()) {
        stopped = true;
        return done();
      }
      if (asked) await deps.wait(gapMs);
      asked = true;
      try {
        const slice = await deps.listCategory(category, cursor);
        for (const page of slice.pages) titles.add(page);
        // A subcategory already walked is dropped here rather than on the way out, so the queue
        // cannot grow unboundedly on a densely cross-linked graph.
        for (const sub of slice.subcats) if (!visited.has(sub)) queue.push(sub);
        cursor = slice.cursor;
      } catch (e) {
        log.warn("could not list", category, "-", (e as Error).message);
        if (!failed.includes(category)) failed.push(category);
        cursor = undefined;
      }
    } while (cursor);

    deps.onProgress?.({ categories: visited.size, titles: titles.size, at: category });
  }

  return done();

  function done(): ExploreResult {
    const why = truncated ? " (truncated)" : stopped ? " (stopped)" : failed.length ? ` (${failed.length} refused)` : "";
    log.debug(`walked ${visited.size} categories, found ${titles.size} pages${why}`);
    return {
      titles: [...titles].sort(),
      categories: [...visited],
      failed,
      truncated,
      complete: !truncated && !stopped && failed.length === 0,
    };
  }
}
