/**
 * spell-strings.ts — reading the game's own `spells_us_str.txt`, the file that names a nameless fade.
 *
 * [ADR 0080](../../specs/decisions/0080-the-game-s-own-spell-file.md) reads `spells_us.txt` for the
 * scalars the log can't state. This is its sibling, and it answers a different question:
 * **which spell was that sentence about?**
 *
 * The log names a spell when one of *yours* wears off something else (`Your Thorns spell has worn
 * off of Bloop.`) and when it wears off your pet — but never when a buff leaves **you**. That case
 * is always EQ's per-spell flavour text, which names nothing:
 *
 *     The spirit of wolf leaves you.
 *     Your skin returns to normal.
 *     The thorns fall away.
 *
 * [cast-alerts.ts](./cast-alerts.ts) records this as an honest limit, and the limit was a **missing
 * input** rather than a property of the log. Every one of those sentences is sitting in the
 * player's own install, keyed by the spell id [spell-file.ts](./spell-file.ts) already parses.
 *
 * ## The format
 *
 * Caret-delimited, one spell per line, and — unlike its sibling — it *names its own columns* in a
 * header row:
 *
 *     #SPELLINDEX^CASTERMETXT^CASTEROTHERTXT^CASTEDMETXT^CASTEDOTHERTXT^SPELLGONE^
 *     278^^^You feel the spirit of wolf enter you.^ is surrounded by a brief lupine aura.^The spirit of wolf leaves you.^
 *
 * Six columns, a trailing caret, and every row the same width — so there is no stability rule to
 * write here of the kind ADR 0080 needed. A header that names the fields is the whole reason this
 * parse is trivial next to that one.
 *
 * **Three of the six are worth having**, and they are the three that describe an effect *being* on
 * something rather than the act of casting:
 *
 *   - `CASTEDMETXT` — it landed **on you**. The only evidence the log offers that somebody *else*
 *     buffed you, since their cast line names them and not you.
 *   - `CASTEDOTHERTXT` — it landed **on somebody else**, written as a suffix with the target's name
 *     missing from the front (`' is surrounded by…'`, `"'s fist bursts into flame."`). That leading
 *     space or possessive is load-bearing: it is what lets a name be read back off the line.
 *   - `SPELLGONE` — it **wore off you**. The sentence this file exists for.
 *
 * `CASTERMETXT` / `CASTEROTHERTXT` are skipped: they describe the casting, which the log already
 * states outright (`You begin casting Spirit of Wolf.`) and the parser already models as a
 * `CastEvent`. Reading them would be a second, worse answer to a question already settled.
 *
 * ## Why a lookup returns a list
 *
 * **A sentence is not a spell.** Measured on a real install: 73,963 rows, 28,333 carrying a fade
 * sentence, 5,010 of those on a spell a character here can actually hold — across 4,357 *distinct*
 * sentences. So 358 sentences belong to more than one obtainable spell, and they are not exotic:
 * `Shield of Thistles` (Druid 7) and `Shield of Thorns` (Druid 47) share both their landing line
 * and `The brambles fall away.`, and every haste in the game reuses one sentence.
 *
 * EQBuddy hit this hand-maintaining the same mapping (`FadeMessageCatalog.cs`) and drew the same
 * conclusion: a lookup must return **candidates**, never an answer. So `fadedBy` returns a list, and
 * whoever reads it is responsible for saying "one of these" rather than picking. Where a rank can be
 * narrowed it is narrowed by *other* evidence — a cast you were seen to make — and never by this
 * file, which cannot tell two spells with one sentence apart even in principle.
 *
 * **And plenty of spells say nothing at all.** Burnout's `SPELLGONE` is empty; it fades in silence.
 * A lookup finding nothing is therefore the ordinary case and not a fault, which is why nothing here
 * treats an empty column as a parse failure.
 *
 * ## What is indexed, and why so little of it
 *
 * The index is gated to spells that are **obtainable** on this server and **beneficial** — ~5k rows
 * out of ~74k. Both halves of that gate pay for themselves. Ungated, the file's NPC and
 * out-of-era tiers would hand a player's own sentence to a spell nobody can cast (the collision
 * problem ADR 0080 already solved for mana costs, in the same file, for the same reason); and a
 * detrimental spell's landing is a *debuff* on somebody, which is not what any of this is for.
 *
 * Pure: text in, facts out. No I/O, no clock. [electron/spells.ts](../../electron/spells.ts) finds
 * the file and holds the result.
 */
import { isObtainable, type SpellFacts } from "./spell-file";
import { spellName } from "./combat-parser";

/**
 * Column indices, named after the header row's own words so the two can be read side by side.
 * There is no stability rule to state: the file is six columns wide throughout and says so at the
 * top, unlike `spells_us.txt` where a patch has moved a column mid-life.
 */
const IDX = {
  id: 0,
  /** Skipped — see the header. The log states a cast outright. */
  casterMe: 1,
  casterOther: 2,
  /** It landed on you. */
  castedMe: 3,
  /** It landed on somebody else, minus their name. */
  castedOther: 4,
  /** It wore off you. */
  gone: 5,
} as const;

/** A row shorter than this can't be one of ours. */
const MIN_FIELDS = IDX.gone + 1;

/** The sentences one spell can put on your screen about being under its effect. */
export interface SpellStrings {
  id: number;
  /** `CASTEDMETXT` — "You feel the spirit of wolf enter you." Empty when the spell lands quietly. */
  onYou: string;
  /**
   * `CASTEDOTHERTXT` — the same thing about somebody else, **with their name missing from the
   * front**: " is surrounded by a brief lupine aura.", "'s fist bursts into flame.". Kept exactly as
   * the file writes it, leading space and all, because that boundary is what makes the name
   * readable back off a real line.
   */
  onOther: string;
  /** `SPELLGONE` — "The spirit of wolf leaves you." Empty for a spell that fades in silence. */
  gone: string;
}

/**
 * One line → its sentences, or null if the line isn't one (the header, a blank, a truncated row).
 * Never throws: a malformed row in a 74k-line file must cost that row and nothing else, which is
 * the rule `spell-file.ts` already follows.
 */
export function parseSpellStringLine(line: string): SpellStrings | null {
  if (!line || line.startsWith("#")) return null;
  const fields = line.split("^");
  if (fields.length < MIN_FIELDS) return null;
  const id = Number(fields[IDX.id]);
  if (!Number.isFinite(id)) return null;
  const onYou = fields[IDX.castedMe] ?? "";
  const onOther = fields[IDX.castedOther] ?? "";
  const gone = fields[IDX.gone] ?? "";
  // A row with nothing to say is not worth a map entry. Silent spells are common (Burnout is one),
  // and keeping them would double the map to hold three empty strings apiece.
  if (!onYou && !onOther && !gone) return null;
  return { id, onYou, onOther, gone };
}

/** Every spell that has something to say, by id. */
export function parseSpellStringFile(text: string): Map<number, SpellStrings> {
  const byId = new Map<number, SpellStrings>();
  for (const line of text.split(/\r?\n/)) {
    const strings = parseSpellStringLine(line);
    if (strings) byId.set(strings.id, strings);
  }
  return byId;
}

/**
 * How a sentence is compared: trimmed, its trailing period dropped, folded to lower case.
 *
 * Deliberately *not* stemmed or fuzzy-matched. These are two copies of one authored string; the only
 * honest comparison is equality, and anything looser would start handing one spell's sentence to
 * another's.
 *
 * And deliberately **not whitespace-collapsed**, which is the one fold that looks free and isn't. A
 * landing on somebody else is matched as a *suffix*, and the name in front of it is then read off by
 * length — so every step here has to preserve position, or the name comes back cut. The file and the
 * log are two copies of the same authored string; betting on them agreeing about spacing is a bet we
 * are already making by comparing them at all.
 */
export function normalizeSentence(sentence: string): string {
  return bareSentence(sentence).toLowerCase();
}

/**
 * The fold's first half: trimmed, trailing period gone, **case intact**.
 *
 * Split out because the name in front of a landing suffix has to be read off a string that still
 * spells the character's name the way the log did — so the match runs on the lower-cased copy and the
 * name is sliced from this one, which is the same length by construction.
 */
function bareSentence(sentence: string): string {
  return sentence.trim().replace(/\.$/, "");
}

/** A landing on somebody else: who, and which spell(s) it could have been. */
export interface OtherLanding {
  /** The name the line began with, exactly as the log wrote it. */
  target: string;
  /** Every obtainable beneficial spell that writes this sentence. Never empty. */
  spells: SpellFacts[];
}

/**
 * The sentences a player can actually see, indexed the way a log line arrives.
 *
 * Three questions, three shapes, because the lines differ in kind rather than in degree: a fade and
 * a landing-on-you are whole sentences and match by equality, while a landing-on-other is a
 * *suffix* with a name in front of it.
 */
export interface BuffLexicon {
  /** Spells whose fade sentence this line is. Empty for a line no spell claims. */
  fadedBy(line: string): SpellFacts[];
  /** Spells whose landing-on-you sentence this line is. */
  landedOnYou(line: string): SpellFacts[];
  /** A landing on somebody else — the name off the front and the spells it could be — or null. */
  landedOnOther(line: string): OtherLanding | null;
  /**
   * Does this spell write **nothing** when it lands?
   *
   * The one question asked spell-first rather than sentence-first, and it exists because a caller
   * watching a cast has to decide whether to wait. A spell that announces itself is worth waiting a
   * second for — the landing line names the *target*, which the cast line never does — while one that
   * lands in silence will never produce a better line, so the cast is the best evidence there will
   * ever be. Burnout is the standing example: it has a landing sentence for a pet and no fade
   * sentence at all.
   *
   * Asked of the rank-stripped name, because the answer is a property of the spell rather than of the
   * tier: if any rank of it announces itself, they all do.
   */
  landsQuietly(spell: string): boolean;
  /** How many spells are indexed, for the debug log and for a panel that wants to say so. */
  size: number;
}

/**
 * An empty lexicon: what every question gets answered with when there is no game install.
 *
 * `landsQuietly` is `true` here, and that is the right default rather than a placeholder: with no
 * string file there are no landing lines to wait for, so a caller should treat every cast as the only
 * evidence it will get. Answering `false` would make it wait for a line that can never arrive.
 */
export const NO_LEXICON: BuffLexicon = {
  fadedBy: () => [],
  landedOnYou: () => [],
  landedOnOther: () => null,
  landsQuietly: () => true,
  size: 0,
};

/**
 * Add to a sentence → spells index, keeping the insertion order of the spells behind one sentence.
 * Shared by the two exact-match indexes so they can't drift in how they fold a sentence.
 */
function add(index: Map<string, SpellFacts[]>, sentence: string, spell: SpellFacts): void {
  const key = normalizeSentence(sentence);
  if (!key) return;
  const have = index.get(key);
  if (have) have.push(spell);
  else index.set(key, [spell]);
}

/**
 * The bucket a suffix is filed under: its **last word**, folded.
 *
 * A landing-on-other has to be matched by `endsWith`, and there are a few thousand of them — so
 * testing every one against every log line would be a few million string comparisons per poll,
 * which is the kind of cost that turns a 20ms parse into a stutter. Bucketing by the final word
 * turns it into a map lookup plus a handful of comparisons, and the final word is a good bucket
 * precisely because these sentences were authored to end on the thing that happened ("aura.",
 * "flame.", "thorns.").
 */
function lastWord(sentence: string): string {
  const words = normalizeSentence(sentence).split(/\s+/);
  return words[words.length - 1] ?? "";
}

/**
 * Build the lexicon from the two files' worth of facts.
 *
 * `spellsById` is the same parse ADR 0080 already pays for — this joins to it rather than reading
 * the big file a second time, and it is what supplies the gate: a spell nobody here can cast, or one
 * that isn't a buff at all, is not indexed. `NO_LEXICON` is what an absent install yields, so every
 * caller has one shape to handle.
 */
export function buildBuffLexicon(
  strings: Map<number, SpellStrings>,
  spellsById: Map<number, SpellFacts>,
): BuffLexicon {
  const fades = new Map<string, SpellFacts[]>();
  const onYou = new Map<string, SpellFacts[]>();
  /** Final word → the suffixes ending in it, longest first. */
  const onOther = new Map<string, { suffix: string; spells: SpellFacts[] }[]>();
  /** Rank-stripped names that announce themselves on landing — the `landsQuietly` answer, inverted. */
  const announces = new Set<string>();

  for (const [id, sentences] of strings) {
    const spell = spellsById.get(id);
    // The gate, and both halves of it earn their place — see the header. An id the spell file didn't
    // yield at all (a row too short to parse) is simply unknown, and unknown is not indexable.
    if (!spell || !spell.beneficial || !isObtainable(spell)) continue;
    if (sentences.onYou || sentences.onOther) announces.add(baseName(spell.name));
    if (sentences.gone) add(fades, sentences.gone, spell);
    if (sentences.onYou) add(onYou, sentences.onYou, spell);
    if (sentences.onOther) {
      const bucket = lastWord(sentences.onOther);
      if (!bucket) continue;
      const suffix = normalizeSentence(sentences.onOther);
      const rows = onOther.get(bucket) ?? [];
      const have = rows.find((r) => r.suffix === suffix);
      if (have) have.spells.push(spell);
      else rows.push({ suffix, spells: [spell] });
      onOther.set(bucket, rows);
    }
  }

  // Longest suffix first, so a sentence that is another's tail can never shadow the more specific
  // one. Sorted once here rather than compared at match time, which is the hot path.
  for (const rows of onOther.values()) rows.sort((a, b) => b.suffix.length - a.suffix.length);

  const indexed = new Set<number>();
  for (const list of [...fades.values(), ...onYou.values()]) for (const s of list) indexed.add(s.id);
  for (const rows of onOther.values()) for (const r of rows) for (const s of r.spells) indexed.add(s.id);

  return {
    fadedBy: (line) => fades.get(normalizeSentence(line)) ?? [],
    landedOnYou: (line) => onYou.get(normalizeSentence(line)) ?? [],
    landedOnOther: (line) => {
      // Two copies of the same string, the same length: one to match on, one to read the name off.
      const bare = bareSentence(line);
      const folded = bare.toLowerCase();
      const rows = onOther.get(lastWord(folded));
      if (!rows) return null;
      for (const row of rows) {
        if (!folded.endsWith(row.suffix)) continue;
        const target = nameInFront(bare, folded, row.suffix.length);
        // A line that is *only* the suffix named nobody, so it is not a landing on somebody else —
        // most likely the same sentence said about you. Keep looking: a shorter suffix in the same
        // bucket may still match with a name in front of it.
        if (!target) continue;
        return { target, spells: row.spells };
      }
      return null;
    },
    landsQuietly: (spell) => !announces.has(baseName(spell)),
    size: indexed.size,
  };
}

/**
 * A spell name as `landsQuietly` keys it: rank off, folded.
 *
 * `spellName` is borrowed rather than re-implemented because the rank regex existing twice is how the
 * cast line and the damage line end up disagreeing about what a spell is called — the very drift it
 * was written to stop.
 */
function baseName(spell: string): string {
  return spellName(spell).trim().toLowerCase();
}

/**
 * The name in front of a matched suffix, as the **log** spelled it.
 *
 * The match runs on the folded copy, so the prefix length is an index into *that* — usable against
 * `bare` only because the two differ by case alone. Case folding preserves length for every name EQ
 * can produce, but not for every string Unicode can, so the invariant is **checked rather than
 * trusted**: a disagreement yields no name at all. Better a landing we can't place than one placed on
 * the wrong character.
 */
function nameInFront(bare: string, folded: string, suffixLength: number): string {
  if (bare.length !== folded.length) return "";
  const head = bare.slice(0, bare.length - suffixLength).trim();
  if (!head) return "";
  // A possessive landing ("'s fist bursts into flame.") keeps the apostrophe with the suffix, so the
  // name comes back clean; a spaced one leaves nothing behind. Either way, a "name" carrying sentence
  // punctuation means the suffix matched the middle of something rather than the end of a name.
  if (/[.^]/.test(head)) return "";
  return head;
}
