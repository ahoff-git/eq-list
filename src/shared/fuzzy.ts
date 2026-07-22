/**
 * fuzzy.ts — dependency-free fuzzy matching for the search box. EQ item names are
 * long and easy to misspell, so exact/prefix search isn't enough; this scores a
 * query against candidate names tolerating typos, transposed letters, partial
 * words, and word-order differences. Pure functions → a tested black box.
 */

/** Lowercase → alphanumeric word tokens ("Nillipus' March" → ["nillipus","march"]). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Levenshtein edit distance (rolling two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity of two tokens in [0,1]: exact > prefix > substring > edit-distance. */
export function tokenSimilarity(q: string, c: string): number {
  if (q === c) return 1;
  // Prefix is the strongest autocomplete signal (typing the start of a word).
  if (c.startsWith(q)) return 0.9 + 0.1 * (q.length / c.length);
  if (q.length >= 3 && c.includes(q)) return 0.8;
  const dist = levenshtein(q, c);
  return 1 - dist / Math.max(q.length, c.length);
}

/**
 * Score how well `query` matches `text` in [0,1]. Each query token takes the best
 * of any candidate token; a barely-matching token drags the score down so garbage
 * is filtered. Whole-string prefix/substring hits and tighter matches rank higher.
 */
export function fuzzyScore(query: string, text: string): number {
  const qs = tokenize(query);
  const cs = tokenize(text);
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
  if (worst < 0.34) score *= 0.5;

  // Whole-query contiguous matches feel the most "right" for autocomplete.
  const nq = qs.join(" ");
  const nc = cs.join(" ");
  if (nc === nq) return 1;
  if (nc.startsWith(nq)) score = Math.max(score, 0.95);
  else if (nc.includes(nq)) score = Math.max(score, 0.85);

  // Mild penalty for lots of extra words, so tighter names sort first.
  if (cs.length > qs.length) score -= Math.min(0.06, (cs.length - qs.length) * 0.02);

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
