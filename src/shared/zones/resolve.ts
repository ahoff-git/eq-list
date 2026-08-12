/**
 * resolve.ts — matching a zone name against the zones we actually know about.
 *
 * Four sources name EverQuest's zones and no two agree: the log ("The Castle of Mistmoore"), the
 * map packs' exit labels ("Mistmoore Castle"), the fandom wiki's expansion tables ("Castle
 * Mistmoore") and whatever a player types. `zoneKey` (`../names.ts`) folds away the differences a
 * *rule* can reach — case, a leading "the", spacing, EverQuest's backtick apostrophe, a difficulty
 * suffix — and a curated alias table handles the pairs no rule can. Neither can reach word order,
 * and hand-listing every rephrasing doesn't scale.
 *
 * The move that makes the rest possible: **matching needs the vocabulary.** A fold is a string in,
 * a string out, so it must be right about a name it has never seen. A resolver is handed the
 * candidates, so it can be loose *and* fail closed — it only answers when exactly one candidate
 * wins, and says nothing when two do. That's why the looseness lives here and not in `zoneKey`,
 * which stays the strict identity fold that kill records and drop rates key on
 * ([ADR 0059](../../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md)).
 *
 * Four tiers, tried in order, each only reached when the one above found nothing:
 *
 *   `exact`     — `zoneKey` equality, curated aliases included. What every call site did before.
 *   `order`     — the same words in any order, ignoring "the"/"of". "The Castle of Mistmoore".
 *   `narrower`  — the name says everything a candidate says and more: "North Qeynos" → "Qeynos".
 *   `fuzzy`     — spelling alone, and only when it wins by a clear margin.
 *
 * `narrower` and `fuzzy` are opt-in, because how wrong a wrong answer is depends on who's asking —
 * see [ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md).
 *
 * Pure and dependency-free apart from the fold and the scorer it reuses → a tested black box.
 */

import { fuzzyScore } from "../fuzzy";
import { zoneKey } from "../names";

/** Which tier answered — how much of a stretch the match was, for a caller that cares. */
export type ZoneMatchHow = "exact" | "order" | "narrower" | "fuzzy";

export interface ZoneMatch<T> {
  /** The candidate that won. */
  item: T;
  /** Its own spelling — the name to show, since the candidate list is the thing on screen. */
  name: string;
  how: ZoneMatchHow;
  /** The fuzzy score, present only for `how === "fuzzy"`. */
  score?: number;
}

export interface ZoneResolveOptions {
  /** Allow a name to resolve to a broader zone it contains ("Neriak Commons" → "Neriak"). */
  narrow?: boolean;
  /** Allow a spelling-only match, gated on `MIN_FUZZY_SCORE` and `MIN_FUZZY_MARGIN`. */
  fuzzy?: boolean;
}

/**
 * Words that carry no zone identity. EverQuest phrases a place three ways ("Castle Mistmoore",
 * "Mistmoore Castle", "The Castle of Mistmoore") and only these differ between them. Kept short on
 * purpose: every word dropped here is a distinction the `order` tier can no longer see.
 */
const STOP_WORDS = new Set(["the", "of", "a", "an"]);

/**
 * How sure the `fuzzy` tier has to be. Both dials matter and the second matters more: a high score
 * says "this looks right", a clear margin says "and nothing else looks as right". Measured against
 * the shipped 344-zone table, this pair fires on *nothing* — every name it can't place is refused,
 * including "Butcherblock Mountains", which the table simply lacks and whose best offer is
 * "Tenebrous Mountains" at 0.33. That silence is the tier working, not the tier being useless: it
 * is the last resort for a name the other three can't reach, and it stays quiet unless it is sure.
 */
const MIN_FUZZY_SCORE = 0.7;
const MIN_FUZZY_MARGIN = 0.08;

/**
 * A zone name's identifying words: folded, apostrophes closed up (so "Erud's" is one word rather
 * than "erud" and a stray "s"), punctuation split on, filler dropped.
 */
export function zoneWords(name: string): string[] {
  return zoneKey(name)
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !STOP_WORDS.has(word));
}

/** The `order` tier's key: the identifying words, sorted, so phrasing stops mattering. */
export function zoneOrderKey(name: string): string {
  return zoneWords(name).slice().sort().join(" ");
}

/** A candidate with its keys worked out once, so a resolver built over a fixed list isn't quadratic. */
interface Entry<T> {
  item: T;
  name: string;
  key: string;
  order: string;
  words: string[];
}

export interface ZoneResolver<T> {
  resolve(name: string): ZoneMatch<T> | undefined;
}

/** The one candidate all of `entries` name, or undefined if they name more than one zone. */
function sole<T>(entries: Entry<T>[]): Entry<T> | undefined {
  if (!entries.length) return undefined;
  const first = entries[0];
  return entries.every((e) => e.key === first.key) ? first : undefined;
}

/**
 * A resolver over a fixed list of zones. Build one when the candidates don't change (the expansion
 * table) — it indexes them once and remembers what it has answered; use `resolveZone` for a list
 * that arrives per call.
 */
export function createZoneResolver<T>(
  items: readonly T[],
  getName: (item: T) => string,
  opts: ZoneResolveOptions = {},
): ZoneResolver<T> {
  const entries: Entry<T>[] = [];
  for (const item of items) {
    const name = getName(item);
    const key = zoneKey(name);
    // A candidate with no name can never be matched, and would swallow an empty query.
    if (!key) continue;
    entries.push({ item, name, key, order: zoneOrderKey(name), words: zoneWords(name) });
  }

  const byKey = new Map<string, Entry<T>>();
  const byOrder = new Map<string, Entry<T>[]>();
  for (const entry of entries) {
    // First wins, matching the caller's own list order — the same rule `groupDropsByZone` uses.
    if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    const sharing = byOrder.get(entry.order);
    if (sharing) sharing.push(entry);
    else byOrder.set(entry.order, [entry]);
  }

  /** Answers so far, keyed by the folded query — including the misses, which cost the most to find. */
  const memo = new Map<string, ZoneMatch<T> | undefined>();

  const found = (entry: Entry<T>, how: ZoneMatchHow, score?: number): ZoneMatch<T> => ({
    item: entry.item,
    name: entry.name,
    how,
    ...(score === undefined ? {} : { score }),
  });

  /** The name says everything a candidate says and more — the candidate is the broader zone. */
  const narrower = (words: string[]): ZoneMatch<T> | undefined => {
    const mine = new Set(words);
    const contained = entries.filter(
      (e) => e.words.length && e.words.length < words.length && e.words.every((w) => mine.has(w)),
    );
    if (!contained.length) return undefined;
    // The most specific candidate that still fits: "Neriak Fourth Gate" over "Neriak", when both do.
    const most = Math.max(...contained.map((e) => e.words.length));
    const best = sole(contained.filter((e) => e.words.length === most));
    return best && found(best, "narrower");
  };

  /** Spelling alone, and only when one candidate is both good enough and clearly ahead. */
  const spelled = (name: string): ZoneMatch<T> | undefined => {
    let best: { entry: Entry<T>; score: number } | undefined;
    for (const entry of entries) {
      const score = fuzzyScore(name, entry.name);
      if (!best || score > best.score) best = { entry, score };
    }
    if (!best || best.score < MIN_FUZZY_SCORE) return undefined;

    // The margin is measured against the best *rival*: a second spelling of the zone already
    // winning is the same answer, so it can't block the match.
    let runnerUp = 0;
    for (const entry of entries) {
      if (entry.key === best.entry.key) continue;
      const score = fuzzyScore(name, entry.name);
      if (score > runnerUp) runnerUp = score;
    }
    if (best.score - runnerUp < MIN_FUZZY_MARGIN) return undefined;
    return found(best.entry, "fuzzy", best.score);
  };

  const lookUp = (name: string): ZoneMatch<T> | undefined => {
    const key = zoneKey(name);
    if (!key) return undefined;

    const exact = byKey.get(key);
    if (exact) return found(exact, "exact");

    const sharingOrder = byOrder.get(zoneOrderKey(name));
    if (sharingOrder) {
      const order = sole(sharingOrder);
      // Two different zones sharing a word order is the ambiguity this tier exists to refuse;
      // falling through to a looser tier would only guess between the same two.
      return order && found(order, "order");
    }

    if (opts.narrow) {
      const broader = narrower(zoneWords(name));
      if (broader) return broader;
    }
    return opts.fuzzy ? spelled(name) : undefined;
  };

  return {
    resolve(name) {
      const key = zoneKey(name);
      if (!key) return undefined;
      if (memo.has(key)) return memo.get(key);
      const match = lookUp(name);
      memo.set(key, match);
      return match;
    },
  };
}

/**
 * Resolve one name against a list that arrives per call — the map's zone list, a graph's zones.
 * Same tiers as `createZoneResolver`, no index kept.
 */
export function resolveZone<T>(
  name: string,
  items: readonly T[],
  getName: (item: T) => string,
  opts: ZoneResolveOptions = {},
): ZoneMatch<T> | undefined {
  return createZoneResolver(items, getName, opts).resolve(name);
}
