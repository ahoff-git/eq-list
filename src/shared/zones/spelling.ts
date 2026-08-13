/**
 * spelling.ts — the same zone, spelled wrong.
 *
 * `zoneKey` folds away every difference a *rule* can reach (case, a leading "the", spacing, EQ's
 * backtick apostrophe, a difficulty suffix) and a curated alias table handles the pairs no rule can
 * ([ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)). Neither
 * reaches a **typo**, and the corpus is full of them: a map pack's exit label says `Toxulia Forest`
 * where the game's own maps and the log say `Toxxulia Forest`. One letter, and the two names are
 * strangers — so the zone appears twice in the picker, and the kills recorded under one spelling are
 * invisible while you're looking at the other.
 *
 * The rule here is deliberately the narrowest thing that catches that: **one edit, same last
 * character, and long enough that one letter isn't most of the name.** It is not a similarity score
 * — `fuzzyScore` is that, and it's the wrong shape, because "East Commonlands" and "West
 * Commonlands" score 0.75 while being two of EverQuest's most distinct places.
 *
 * **Measured, not guessed.** Across all 361 zone names the app ships (the fandom expansion table
 * plus the curated list), exactly one pair sits within one edit: `Plane of Time A` / `Plane of Time
 * B`. That pair is what the last-character clause is for — a name distinguished by a trailing letter
 * is a numbered sibling, not a misspelling. At **two** edits the same corpus offers twelve pairs, all
 * of them real distinctions (East/West Karana, North/South Qeynos, Ashengate East/West), which is why
 * one edit is the ceiling rather than a starting point.
 *
 * Pure and dependency-free apart from the fold and the shared edit-distance → a tested black box.
 * See [ADR 0075](../../../specs/decisions/0075-a-zone-s-misspelling-is-the-same-zone.md).
 */

import { levenshtein } from "../fuzzy";
import { zoneBaseName, zoneKey } from "../names";

/** How far apart two spellings of one zone may be. One. See the module note for why. */
const MAX_EDITS = 1;

/**
 * Below this, a single edit is too much of the name to be a slip. Nothing this short shares a
 * spelling with anything else in the shipped table — the floor is here so a future three-letter
 * zone can't be merged into a neighbour by one keystroke.
 */
const MIN_LENGTH = 5;

/**
 * A zone name reduced to its letters and digits: the fold, with the punctuation and spacing closed
 * up too. That much alone earns its keep — `Erud's Crossing` and `Eruds Crossing` are one spelling
 * here and two `zoneKey`s — and it's the string the edit distance is measured over, so a stray
 * space can't read as an edit.
 */
export function zoneSpelling(name: string): string {
  return zoneKey(name).replace(/[^a-z0-9]+/g, "");
}

/**
 * The same zone, allowing for one misspelling of it — a **superset** of `sameZone`, which stays the
 * strict identity test that keys a kill record
 * ([ADR 0059](../../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md)). Use this to *ask*
 * ("what died here?", "is this name already taken?"), never to key.
 */
export function sameZoneOrMisspelling(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (zoneKey(a) === zoneKey(b)) return true;
  return isMisspelling(zoneSpelling(a), zoneSpelling(b));
}

/**
 * The rule itself, over two already-reduced spellings. The three cheap tests come first on purpose:
 * callers scan a whole folder's worth of names against each other, and length, then last character,
 * reject all but a handful before anything has to count edits.
 */
function isMisspelling(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length < MIN_LENGTH || b.length < MIN_LENGTH) return false;
  if (Math.abs(a.length - b.length) > MAX_EDITS) return false;
  // A trailing letter or digit is how EverQuest numbers siblings (`Plane of Time A` and `B`), so a
  // difference that lands there is a different zone however small it looks.
  if (a[a.length - 1] !== b[b.length - 1]) return false;
  return levenshtein(a, b) <= MAX_EDITS;
}

/** The first name that isn't already claimed by one of `taken` — the same name, or a misspelling. */
export function firstUnclaimed(candidates: (string | undefined)[], taken: readonly string[]): string | undefined {
  return candidates.find((c) => !!c && !taken.some((t) => sameZoneOrMisspelling(t, c)));
}

/**
 * One spelling per zone, chosen from the names in front of you.
 *
 * A fold can't do this: it takes one string and must be right about a name it has never seen, so it
 * has no way to know which of two spellings is the real one. Handed the whole batch, the answer is
 * available — **the spelling that turns up most often wins**, ties going to the one seen first. For a
 * kill log that means the log's own wording beats a peer's pack's label, which is the right way round:
 * you have thousands of the former and one of the latter.
 *
 * Returned as a function so a caller can key every row through it. Names are answered as **base**
 * names (no difficulty, no ruleset — see `zoneBaseName`), since a tally is about the place. A name the
 * batch never contained is answered with its own base name rather than a guess.
 */
export function createZoneCanon(names: Iterable<string | undefined>): (name: string | undefined) => string {
  /** Per fold key: how often it was seen, its own spelling, and where in the batch it first appeared. */
  const seen = new Map<string, { base: string; count: number; at: number }>();
  let at = 0;
  for (const name of names) {
    if (!name) continue;
    const key = zoneKey(name);
    if (!key) continue;
    const already = seen.get(key);
    if (already) already.count += 1;
    else seen.set(key, { base: zoneBaseName(name), count: 1, at: at++ });
  }

  /** Fold key → the spelling every variant of it answers to. */
  const canon = new Map<string, string>();
  /** One representative per cluster, in first-seen order, so the clustering itself is stable. */
  const clusters: { keys: string[]; spelling: string }[] = [];
  const inOrder = [...seen.keys()].sort((a, b) => seen.get(a)!.at - seen.get(b)!.at);
  for (const key of inOrder) {
    const spelling = zoneSpelling(key);
    const mine = clusters.find((c) => isMisspelling(c.spelling, spelling));
    if (mine) mine.keys.push(key);
    else clusters.push({ keys: [key], spelling });
  }
  for (const cluster of clusters) {
    // Most seen wins; the sort above already put the earliest first, and `reduce` keeps it on a tie.
    const best = cluster.keys.reduce((won, key) =>
      (seen.get(key)!.count > seen.get(won)!.count ? key : won),
    );
    for (const key of cluster.keys) canon.set(key, seen.get(best)!.base);
  }

  return (name) => (name && canon.get(zoneKey(name))) || zoneBaseName(name ?? "");
}
