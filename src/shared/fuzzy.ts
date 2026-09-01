/**
 * fuzzy.ts — dependency-free fuzzy matching for the search box. EQ item names are
 * long and easy to misspell, so exact/prefix search isn't enough; this scores a
 * query against candidate names tolerating typos, transposed letters, partial
 * words, and word-order differences. Pure functions → a tested black box.
 */

/**
 * The scoring dial, in one place.
 *
 * These are tuned by feel against real EQ item names, and that's exactly why they need names: a bare
 * `0.34` in the middle of the scorer says nothing about which way to move it, and the six of them were
 * scattered across two functions. Each is documented by what it's *for*, so a search that ranks badly
 * can be argued about in terms of the behaviour rather than the arithmetic.
 *
 * All scores are in [0, 1].
 */
const SCORE = {
  /** A prefix hit is the strongest autocomplete signal; the rest rewards matching more of the word. */
  prefixFloor: 0.9,
  prefixLengthBonus: 0.1,
  /** A substring hit, once the query is long enough that it isn't matching by accident. */
  substring: 0.8,
  substringMinChars: 3,
  /** A query word matching almost nothing means this probably isn't the item at all. */
  weakTokenBelow: 0.34,
  weakTokenPenalty: 0.5,
  /** Whole-query hits, which "feel right" and should outrank a good per-word average. */
  wholePrefix: 0.95,
  wholeSubstring: 0.85,
  /** Extra words in the candidate cost a little, so the tighter of two names sorts first. */
  perExtraWord: 0.02,
  maxExtraWordPenalty: 0.06,
} as const;

/** Lowercase → alphanumeric word tokens ("Nillipus' March" → ["nillipus","march"]). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * The same split, **remembered** — and the joined form beside it, since every scoring call wants both.
 *
 * A score is always asked in a *sweep*: one query against a whole list of candidates, and then the next
 * query against the same list. Splitting is therefore done over and over on the same strings — resolving
 * a map pack's 600 zone names against the 352-zone expansion table is ~120k calls, and the candidate
 * halves of those are 352 strings split 350 times each.
 *
 * Private, and the arrays never leave this module: `tokenize` still hands every caller its own array,
 * because a shared one is only safe where nothing can write to it.
 */
const MAX_SPLITS = 20_000;
const SPLITS = new Map<string, { tokens: string[]; joined: string }>();

function split(s: string): { tokens: string[]; joined: string } {
  const seen = SPLITS.get(s);
  if (seen) return seen;
  const tokens = tokenize(s);
  const made = { tokens, joined: tokens.join(" ") };
  // Queries are typed, so this one *can* be fed unbounded input — hence a cap, and dropping the lot
  // rather than evicting cleverly: every entry is a few microseconds to make again.
  if (SPLITS.size >= MAX_SPLITS) SPLITS.clear();
  SPLITS.set(s, made);
  return made;
}

/**
 * The one row the DP below keeps, reused between calls.
 *
 * The rolling two-row form allocated a fresh row per character of `a` — for a sweep that scores one
 * query against hundreds of candidates that is tens of thousands of short-lived arrays, and the garbage
 * cost more than the arithmetic. One buffer, grown to fit the longest `b` seen and never shrunk, since
 * the next sweep wants it just as big. Single-threaded and never held across an `await`, so there is no
 * one to share it with.
 */
let dpRow = new Uint16Array(64);

/**
 * Levenshtein edit distance (rolling one-row DP, the two-row form with the previous row's diagonal
 * carried in a variable). Distances are bounded by the longer string, so 16 bits is a name length no
 * caller has.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const width = b.length + 1;
  if (dpRow.length < width) dpRow = new Uint16Array(width);
  const row = dpRow;
  for (let j = 0; j < width; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    // `row[j - 1]` as it stood *before* this pass overwrote it — the two-row form's `prev[j - 1]`.
    let diagonal = row[0];
    row[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < width; j++) {
      const above = row[j];
      const substitute = diagonal + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const insert = row[j - 1] + 1;
      const remove = above + 1;
      row[j] = Math.min(substitute, insert, remove);
      diagonal = above;
    }
  }
  return row[b.length];
}

/** Similarity of two tokens in [0,1]: exact > prefix > substring > edit-distance. */
export function tokenSimilarity(q: string, c: string): number {
  if (q === c) return 1;
  // Prefix is the strongest autocomplete signal (typing the start of a word).
  if (c.startsWith(q)) return SCORE.prefixFloor + SCORE.prefixLengthBonus * (q.length / c.length);
  if (q.length >= SCORE.substringMinChars && c.includes(q)) return SCORE.substring;
  const dist = levenshtein(q, c);
  return 1 - dist / Math.max(q.length, c.length);
}

/**
 * Score how well `query` matches `text` in [0,1]. Each query token takes the best
 * of any candidate token; a barely-matching token drags the score down so garbage
 * is filtered. Whole-string prefix/substring hits and tighter matches rank higher.
 */
export function fuzzyScore(query: string, text: string): number {
  const { tokens: qs, joined: nq } = split(query);
  const { tokens: cs, joined: nc } = split(text);
  if (!qs.length || !cs.length) return 0;

  let total = 0;
  let worst = 1;
  for (const q of qs) {
    let best = 0;
    for (const c of cs) {
      const s = tokenSimilarity(q, c);
      if (s > best) best = s;
      if (best === 1) break;
    }
    total += best;
    if (best < worst) worst = best;
  }
  let score = total / qs.length;

  // If some query word matches almost nothing, this probably isn't the item.
  if (worst < SCORE.weakTokenBelow) score *= SCORE.weakTokenPenalty;

  // Whole-query contiguous matches feel the most "right" for autocomplete.
  if (nc === nq) return 1;
  if (nc.startsWith(nq)) score = Math.max(score, SCORE.wholePrefix);
  else if (nc.includes(nq)) score = Math.max(score, SCORE.wholeSubstring);

  // Mild penalty for lots of extra words, so tighter names sort first.
  if (cs.length > qs.length) {
    score -= Math.min(SCORE.maxExtraWordPenalty, (cs.length - qs.length) * SCORE.perExtraWord);
  }

  return Math.max(0, Math.min(1, score));
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/** Rank `items` by fuzzy score against `query`; filtered and sorted, best first. */
export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
  opts: { limit?: number; minScore?: number } = {},
): FuzzyMatch<T>[] {
  const { limit = 12, minScore = 0.45 } = opts;
  const scored: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getText(item));
    if (score >= minScore) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      getText(a.item).length - getText(b.item).length ||
      getText(a.item).localeCompare(getText(b.item)),
  );
  return scored.slice(0, limit);
}
