/**
 * wiki-shape.ts — reading the wiki's *shape* off the pages we already hold.
 *
 * The catalogue's roster is a walk down `Category:Items` and `Category:NPCs`
 * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md),
 * [ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)), and a walk can only
 * ever find what the wiki has **filed**. Measured, 3,744 ns-0 pages sit outside every closure and a
 * few hundred of them are genuinely items nobody categorised. A walk will never reach them, because
 * from the category graph they do not exist.
 *
 * They are not invisible, though — they are *linked*. A zone page names what is in the zone and a
 * quest page names what the quest involves, and we already fetch both kinds to read levels off them
 * ([ADR 0163](../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)). So their
 * outbound links are a curated guess at "what exists" that costs no request of its own, and this
 * module is the arithmetic on top: **link set minus what we already know minus what we have already
 * checked = what is worth a look**
 * ([ADR 0180](../../specs/decisions/0180-the-wiki-has-a-shape-and-it-moves.md)).
 *
 * ## A link is a candidate, never a claim
 *
 * Nothing here decides anything is an item. A link says a page exists; only fetching and parsing it
 * says what it is. That is why the output is called a candidate and why the verdict that comes back
 * is worth writing down — the expensive knowledge is not "this is an item" but "this is *not*", since
 * that is the answer for the overwhelming majority and the one that stops us asking again.
 *
 * Pure and DOM-free: no sockets, no storage, no clock.
 */
import { shardOf } from "./item-shards";

/**
 * The most candidates a run will hold at once.
 *
 * A guard against a parse going wrong rather than a tuning knob: the honest figure is a few thousand,
 * so a set an order larger than this means something upstream is handing us junk, and probing it a
 * page at a time would be a very slow way to find that out.
 */
export const MAX_CANDIDATES = 20_000;

/**
 * The fold used to compare a link with a roster title.
 *
 * Deliberately **not** `item-shards`'s fold, which decides shard membership and therefore must never
 * change: this one is free to improve as we learn how eqlwiki writes titles, and a change here costs
 * at worst a duplicate probe. Same rule as `harvestRoster` already applies when it folds an item's
 * sources, and it is written the same way so the two agree.
 */
const fold = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, " ");

/** A title we have checked, and what it turned out to be. */
export type Verdict = "item" | "other" | "missing";

/**
 * What is worth fetching to find out what it is.
 *
 * Three subtractions, and the order does not matter because they are all set membership:
 *
 *  - **the roster** — a title the walk already found needs no discovering, whatever it is;
 *  - **the verdicts** — anything we have already looked at, including the ones that turned out not to
 *    be items, which is the whole point of writing them down;
 *  - **itself** — a popular mob is linked from thirty zone pages and is one candidate.
 */
export function candidatesFrom(opts: {
  /** Every link from every shape page we hold, in any order and with any repeats. */
  links: Iterable<string>;
  /** Titles the roster already names. */
  roster: Iterable<string>;
  /** Titles already checked — the verdicts, whatever they were. */
  checked: Iterable<string>;
  cap?: number;
}): string[] {
  const known = new Set<string>();
  for (const title of opts.roster) known.add(fold(title));
  for (const title of opts.checked) known.add(fold(title));

  const cap = opts.cap ?? MAX_CANDIDATES;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const link of opts.links) {
    const title = link.trim();
    if (!title) continue;
    const key = fold(title);
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * The order this install checks candidates in, so two peers do not spend the evening probing the
 * same titles in the same order.
 *
 * The same argument as `item-shards`'s per-peer shard ordering, and the cheapest form of it: the list
 * is sorted so everybody agrees what it *is*, and each peer starts at its own offset and wraps. That
 * needs no negotiation, no message and no second hash — `shardOf` is already a well-mixed function of
 * a string, and here it is being used for nothing protocol-shaped, just to pick a starting point.
 *
 * Verdicts travel between peers, so a collision costs one duplicated fetch and is corrected on the
 * next catalogue tick. This makes collisions rare; it does not need to make them impossible.
 */
export function probeOrder(candidates: readonly string[], myId: string): string[] {
  if (candidates.length < 2) return [...candidates];
  const sorted = [...candidates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const start = shardOf(myId) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}
