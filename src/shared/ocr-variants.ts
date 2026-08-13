/**
 * ocr-variants.ts — the same grab, read the way OCR actually gets it wrong.
 *
 * `cleanText` (in `electron/lookup.ts`) strips junk characters and stops, so whatever survives goes
 * straight to the Search box for [fuzzy.ts](./fuzzy.ts) to absorb as if it were a typo. But an OCR
 * slip is not a typo: it is a **specific, repeatable misreading** of EQ's small font, and the damage
 * it does is not one letter off — `rn` read as `m` turns "Morning Star" into "Moming Star", which is
 * one *deletion* spread across a token boundary. Fuzzy ranking alone can't get that name back;
 * correcting it before the search can.
 *
 * So: the raw text plus its plausible corrections, in order, deduped (`ocrReadings`), and the one
 * that actually matches a name we know wins (`bestReading`). The corrections are the *only*
 * candidates — nothing here invents a spelling — so the worst a bad variant costs is the scoring.
 *
 * The confusion table is empirical, borrowed rather than rediscovered: `OcrVariants()` in
 * eql-tooltip's `EqWikiOverlay/Wiki/EqlWikiProvider.cs` has the tally
 * ([neighbours.md](../../specs/neighbours.md)). When a new misreading shows up in the field, the
 * list grows and nothing else moves — which is the point of it being a pure, tested black box.
 * See [ADR 0081](../../specs/decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md).
 */

import { fuzzyScore } from "./fuzzy";
import { itemBaseName } from "./names";

/** One misreading: what OCR *wrote*, and what may really have been on screen. */
interface Confusion {
  /** What OCR wrote. Lowercase — matching is case-insensitive. */
  reads: string;
  /** What that text may really have been. */
  was: string;
}

/**
 * The table, most common first — order decides which corrections survive the cap below.
 */
const CONFUSIONS: readonly Confusion[] = [
  // Two narrow letters touching, read as one wide one: "Morning Star" → "Moming Star". By far the
  // most common, and the only one whose damage crosses a letter boundary.
  { reads: "m", was: "rn" },
  // A descender the small font barely draws.
  { reads: "g", was: "q" },
  // A digit in an item name is rare, which is why this one is last past the cap most of the time.
  { reads: "o", was: "0" },
];

/**
 * Most readings we'll offer. A short name never comes near it; a long one with many `m`s would
 * enumerate more corrections than are worth scoring, and the ones dropped are the later, rarer
 * confusions rather than the likely ones.
 */
const MAX_READINGS = 12;

/** How sure a reading has to be before it's the one we search. */
const BELIEF = {
  /** Raw text this close to a page we know needs no correcting, and nothing may outrank it. */
  certain: 0.95,
  /** A correction has to actually find something; below this it's noise outscoring noise. */
  floor: 0.6,
} as const;

/** Where a confusion could have struck: the slice at `at` may really have been `was`. */
interface Suspect {
  at: number;
  reads: string;
  was: string;
}

/** Every place in `text` this confusion could have struck, left to right. */
function suspectsOf(text: string, confusion: Confusion): Suspect[] {
  const found: Suspect[] = [];
  const lower = text.toLowerCase();
  for (let at = lower.indexOf(confusion.reads); at >= 0; at = lower.indexOf(confusion.reads, at + 1)) {
    found.push({ at, reads: confusion.reads, was: confusion.was });
  }
  return found;
}

/**
 * `was`, cased like the text it replaces. Cosmetic only — scoring lowercases both sides — but the
 * chosen reading is what lands in the Search box, and "MOrning Star" would read as a bug.
 */
function likeCase(sample: string, was: string): string {
  if (sample === sample.toLowerCase()) return was;
  return was.charAt(0).toUpperCase() + was.slice(1);
}

/**
 * `text` with each suspect replaced by what it may really have been. Applied right to left so the
 * offsets stay valid as lengths change, skipping any suspect overlapping one already applied — the
 * table holds only single characters today, but nothing here assumes that.
 */
function correct(text: string, suspects: readonly Suspect[]): string {
  let out = text;
  let untouched = text.length;
  for (const s of [...suspects].sort((a, b) => b.at - a.at)) {
    const end = s.at + s.reads.length;
    if (end > untouched) continue;
    out = out.slice(0, s.at) + likeCase(text.slice(s.at, end), s.was) + out.slice(end);
    untouched = s.at;
  }
  return out;
}

/**
 * The raw text first, then every correction worth trying, deduped and capped. Raw leads because it
 * is the reading with evidence behind it; the rest are hypotheses, ordered by how likely the
 * confusion is and then by where in the text it sits.
 *
 * One letter at a time comes before the whole-text corrections, because a grab is usually wrong in
 * exactly one place — "Moming Star" needs the `m` at index 3 fixed and the one at index 0 left alone.
 */
export function ocrReadings(text: string, max: number = MAX_READINGS): string[] {
  const raw = text.trim();
  if (!raw) return [];

  const readings = [raw];
  const add = (reading: string) => {
    if (!readings.includes(reading)) readings.push(reading);
  };

  const everywhere: Suspect[] = [];
  for (const confusion of CONFUSIONS) {
    const found = suspectsOf(raw, confusion);
    everywhere.push(...found);
    for (const suspect of found) add(correct(raw, [suspect]));
    // The same confusion everywhere at once: one word set in the font that causes it.
    if (found.length > 1) add(correct(raw, found));
  }
  if (everywhere.length > 1) add(correct(raw, everywhere));

  return readings.slice(0, max);
}

/**
 * The best score any known name gives this reading.
 *
 * `fuzzyScore` rather than `fuzzyRank`: only the winner matters, and `known` is a whole wiki index —
 * there's no list worth building or sorting. A grade is dropped first, exactly as the search box
 * does with what it's handed ("Dragoon Dirk +2" has no page of its own).
 */
function topScore(reading: string, known: readonly string[]): number {
  const q = itemBaseName(reading.trim());
  if (q.length < 2) return 0;
  let best = 0;
  for (const name of known) {
    const score = fuzzyScore(q, name);
    if (score > best) {
      best = score;
      if (best === 1) break;
    }
  }
  return best;
}

/**
 * Which of `ocrReadings`' candidates to actually search for, judged against the names we know.
 *
 * Raw wins ties and wins outright when it already matches something nearly exactly — a clean grab
 * must not be "corrected" into a different real item, and the early exit also means the common case
 * scores the index once rather than a dozen times. A correction has to both beat raw *and* clear a
 * floor, so when nothing matches (an unknown item, a bad grab, a cold index) the player still gets
 * what OCR actually read, to edit for themselves.
 */
export function bestReading(readings: readonly string[], known: readonly string[]): string {
  const raw = readings[0] ?? "";
  if (readings.length < 2 || !known.length) return raw;

  const rawScore = topScore(raw, known);
  if (rawScore >= BELIEF.certain) return raw;

  let best = raw;
  let bestScore = rawScore;
  for (const reading of readings.slice(1)) {
    const score = topScore(reading, known);
    if (score > bestScore) {
      best = reading;
      bestScore = score;
    }
  }
  return bestScore >= BELIEF.floor ? best : raw;
}
