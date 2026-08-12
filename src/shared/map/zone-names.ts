/**
 * Working out what a map file's zone is *called*, from the maps themselves.
 *
 * Files are named for a zone's short name (`gfaydark`, `qey2hh1`) and nothing in them says the
 * long one — but the packs label their exits, so every `to The Lesser Faydark` marker names a real
 * zone. The corpus is its own gazetteer, and it's the *server's* wording rather than a table
 * someone typed from memory.
 *
 * Matching a harvested name to a file uses two independent signals, and needs both:
 *
 *  1. **The file name reads like a contraction** — `gfaydark` sits inside `greaterfaydark`.
 *     On its own this is confidently wrong a lot: it happily makes `sebilis` "Western Cabilis"
 *     and `grobb` "The Gorge of King Xorbb".
 *  2. **Adjacency.** If this file is zone X, then the maps that link *to* X should be zones this
 *     file links back to. A wrong guess has no neighbours in common, and a right guess with a poor
 *     name score has many — which is what rescues `gfaydark` (score 51) and `commons`
 *     ("West Commonlands", which loses on spelling to "The Commonlands").
 *
 * Pure and dependency-free; the file reading lives in `electron/eq-maps.ts`.
 */

/** A zone link harvested from a map: the long name of somewhere you can walk to. */
export type ZoneLinks = Map<string, Set<string>>;

/**
 * Junk the packs append to an exit label: which translocator, what to click, and the "&" form that
 * names two destinations at once. Left in, these become "zone names" and poison the gazetteer.
 */
const LABEL_NOISE = /\s*[([](?:click|in zone|boat|ferry|translocator|must have|from)[^)\]]*[)\]]\s*$/i;

/** The long zone name in an exit label, or null if the label isn't one. */
export function zoneLinkName(label: string): string | null {
  const m = /^to\s+(.+)$/i.exec(label.trim());
  if (!m) return null;
  let name = m[1];
  // "East Freeport & The Butcherblock Mountains (Translocator Narrik)" names two zones and belongs
  // to neither; a label that can't pick one destination can't name one either.
  if (/\s+(&|and|or)\s+/i.test(name)) return null;
  name = name.replace(LABEL_NOISE, "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || /^\d/.test(name)) return null;
  return name;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const bare = (s: string): string => norm(s.replace(/^the\s+/i, ""));

/** Is `short` a subsequence of `long`? A zone's short name is usually a contraction of it. */
function subsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

/**
 * The score an outright spelling match earns — the ceiling of `nameScore`, and the one score high
 * enough to stand with no neighbour confirming it. Named because that second role is a separate
 * decision from the number: see the `!hits` guard below.
 */
const EXACT_SCORE = 100;

/** How much the file name looks like a contraction of this zone name (0 = not at all). */
export function nameScore(short: string, zoneName: string): number {
  const stripped = bare(zoneName);
  const full = norm(zoneName);
  if (short === stripped || short === full) return EXACT_SCORE;
  let score = 0;
  if (stripped.startsWith(short) || full.startsWith(short)) score += 40;
  if (subsequence(short, stripped) || subsequence(short, full)) score += 30;
  if (!score) return 0;
  // Prefer the fuller contraction ("mistythicket" over "misty"), and reward a shared first letter,
  // which is what directional short names hang on ("nro" for "Northern Desert of Ro").
  return score + Math.round((short.length / Math.max(stripped.length, 1)) * 20) + (short[0] === stripped[0] ? 10 : 0);
}

/** How much adjacency weighs against spelling — one confirmed neighbour beats a big name score. */
const MUTUAL_WEIGHT = 25;
/** Below this, a name is a guess rather than a finding, and the file keeps its own name. */
const MIN_CONFIDENCE = 60;

/**
 * Name every file we can, from the links the maps carry. Only assignments both signals support are
 * returned: a file we can't name confidently is left out, so the caller shows its file name rather
 * than something invented.
 */
export function solveZoneNames(links: ZoneLinks): Record<string, string> {
  const files = [...links.keys()];
  const names = new Set<string>();
  for (const set of links.values()) for (const n of set) names.add(n);

  // Who links to each zone — its neighbours, whatever they turn out to be called.
  const linkersTo = new Map<string, Set<string>>();
  for (const [file, out] of links) {
    for (const name of out) {
      if (!linkersTo.has(name)) linkersTo.set(name, new Set());
      linkersTo.get(name)!.add(file);
    }
  }

  // Pass one: the best name for each file by spelling alone. Wrong often, but it gives adjacency
  // something to check against — a neighbour has to be *called* something to be recognised.
  const provisional = new Map<string, string>();
  for (const file of files) {
    let best: { name: string; score: number } | undefined;
    for (const name of names) {
      const score = nameScore(file, name);
      if (score > (best?.score ?? 0)) best = { name, score };
    }
    if (best) provisional.set(file, best.name);
  }

  /** Of the maps that link to `name`, how many are zones `file` links back to? */
  const mutual = (file: string, name: string): number => {
    const linkers = linkersTo.get(name);
    if (!linkers) return 0;
    const mine = links.get(file);
    if (!mine) return 0;
    let hits = 0;
    for (const other of linkers) {
      if (other === file) continue; // a zone never links to itself
      const otherName = provisional.get(other);
      if (otherName && mine.has(otherName)) hits++;
    }
    return hits;
  };

  // Every plausible pairing, best first.
  const claims: { file: string; name: string; total: number; score: number; hits: number }[] = [];
  for (const file of files) {
    for (const name of names) {
      const score = nameScore(file, name);
      if (!score) continue;
      const hits = mutual(file, name);
      // Adjacency is what separates a finding from a guess. A name nothing confirms is only taken
      // when the spelling is an outright match — that's `sebilis` being offered "Western Cabilis".
      if (!hits && score < EXACT_SCORE) continue;
      claims.push({ file, name, total: score + hits * MUTUAL_WEIGHT, score, hits });
    }
  }
  claims.sort((a, b) => b.total - a.total || b.hits - a.hits);

  /**
   * Assign greedily, **one name to one file**. That uniqueness is what lets the bar sit as low as
   * a single confirmed neighbour: a wrong claim is nearly always outbid for the same name by the
   * file that really is that zone (`cabwest` takes "Cabilis West" out from under `sebilis`), so a
   * weak-but-correct pairing like `crushbone` → "Clan Crushbone" survives on its own merits.
   */
  const solved: Record<string, string> = {};
  const takenNames = new Set<string>();
  for (const claim of claims) {
    if (claim.total < MIN_CONFIDENCE) continue;
    if (solved[claim.file] || takenNames.has(claim.name)) continue;
    solved[claim.file] = claim.name;
    takenNames.add(claim.name);
  }
  return solved;
}
