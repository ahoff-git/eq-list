/**
 * log-vocabulary.ts — the words your log actually uses, arranged so a prefix finds them instantly.
 *
 * A rule is a guess about a sentence you cannot quote from memory. This is the other half of the
 * answer to that (the first being the replay in `watch-check.ts`): while you type "Mesm", the words
 * the game really printed are right there, so the trigger is *recalled* rather than remembered.
 * Everything it knows was read out of the log — nothing is a list we maintain, so it is exactly as
 * current as the server is, including a spell renamed in a patch or a mob only this camp has.
 *
 * **The structure is a trie**, and it is the reason this is worth doing at all. A completion has to
 * be produced on every keystroke, from a vocabulary of a few thousand terms; scanning that list per
 * letter is the obvious way and it makes typing feel heavy. A trie answers in the length of what
 * you've typed — four letters is four map lookups — no matter how much log it was built from.
 *
 * Each node carries **the best term beneath it**, decided when the trie is built rather than when
 * it's read. "Best" is what you'd want offered: the term seen most, ties going to the shorter one
 * (a completion you have to delete back out of is worse than one you have to extend), and then
 * alphabetically so the same log always gives the same answer.
 *
 * Terms are keyed lowercase and stored in the casing the log used, because "Mesmerization" is what
 * belongs in the box even when you typed "mesm".
 */
import { parseSplitLine } from "./parse-line";
import { fuzzyRank } from "./fuzzy";
import { SELF } from "./combat-parser";
import type { LogLine } from "./types";

/** Which vocabulary a completion should come from — the field the text is going into. */
export type VocabularyKind = "spell" | "caster" | "target" | "zone";

/** Every kind, plus `any` for a box that could hold any of them (a watch's trigger). */
const KINDS: VocabularyKind[] = ["spell", "caster", "target", "zone"];

interface Entry {
  /** As the log wrote it. */
  term: string;
  count: number;
}

interface Node {
  children: Map<string, Node>;
  /** The best term anywhere below this point, so a completion is a walk and never a search. */
  best?: Entry;
}

const node = (): Node => ({ children: new Map() });

/**
 * Is `a` a better offer than `b`? Seen more often wins; then shorter; then alphabetical, so the
 * answer never depends on the order the log happened to be read in.
 */
function better(a: Entry, b: Entry | undefined): boolean {
  if (!b) return true;
  if (a.count !== b.count) return a.count > b.count;
  if (a.term.length !== b.term.length) return a.term.length < b.term.length;
  return a.term < b.term;
}

/** One trie: insert while building, then walk to complete. */
class Terms {
  private root = node();
  private counts = new Map<string, Entry>();

  add(term: string): void {
    const clean = term.trim();
    // One character can't usefully complete anything, and a whole sentence isn't a term.
    if (clean.length < 2 || clean.length > 60) return;
    const key = clean.toLowerCase();
    const seen = this.counts.get(key);
    if (seen) seen.count += 1;
    else this.counts.set(key, { term: clean, count: 1 });
  }

  /** Build the trie once every term's count is final — `best` can't be decided before that. */
  seal(): this {
    for (const [key, entry] of this.counts) {
      let at = this.root;
      if (better(entry, at.best)) at.best = entry;
      for (const ch of key) {
        let next = at.children.get(ch);
        if (!next) {
          next = node();
          at.children.set(ch, next);
        }
        at = next;
        if (better(entry, at.best)) at.best = entry;
      }
    }
    return this;
  }

  /** The term to offer for what's been typed, or nothing. `""` offers the commonest term of all. */
  complete(prefix: string): string | undefined {
    let at = this.root;
    for (const ch of prefix.toLowerCase()) {
      const next = at.children.get(ch);
      if (!next) return undefined;
      at = next;
    }
    return at.best?.term;
  }

  /** Every term, commonest first — what the slower passes (substring, fuzzy) search through. */
  all(): Entry[] {
    return [...this.counts.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  }

  get size(): number {
    return this.counts.size;
  }
}

/**
 * How many terms to offer, and how much typing to want before the slower passes run.
 *
 * Substring and fuzzy matching both scan the whole vocabulary, which is cheap at a few thousand
 * terms and pointless on one or two letters: "me" is inside half of everything, and a fuzzy score
 * over two characters is noise. Three is where a fragment starts being a fragment *of* something.
 */
const MAX_SUGGESTIONS = 8;
const SCAN_FROM_CHARS = 3;

/** What a log's words came to: one trie per kind, plus one holding all of them. */
export interface Vocabulary {
  /** How many distinct terms were learned — what makes "no suggestion" mean something. */
  size: number;
  /**
   * The **inline** completion for what's been typed: a term that *starts with* it, so the rest can
   * be shown greyed after the caret. Undefined when nothing extends it — including when the typed
   * text is already the whole term, since there'd be nothing to grey.
   */
  complete(typed: string, kind?: VocabularyKind): string | undefined;
  /**
   * Every term worth offering for what's been typed, best first — the list behind the box.
   *
   * Three passes, in the order a person would want them: terms that **start with** it, terms that
   * **contain** it ("sme" finding Mesmerization, which the ghost can't show and a list can), then
   * **fuzzy** ones for a spelling this game makes hard to get right ("mesmerisation"). Each pass
   * only fills what the one before it left, so an exact prefix is never pushed down the list by a
   * cleverer match.
   */
  suggest(typed: string, kind?: VocabularyKind, limit?: number): string[];
}

const NOTHING: Vocabulary = { size: 0, complete: () => undefined, suggest: () => [] };

/**
 * Read a log's terms: every spell named, everyone who cast one, everyone a fade wore off, and every
 * zone entered.
 *
 * Deliberately not *words* — a vocabulary of every word in the log would complete "you" into
 * something useless a hundred times over. These four are the things a rule is actually written
 * about, and each arrives already isolated by the parsers rather than by a guess at where a name
 * ends.
 */
export function buildVocabulary(lines: LogLine[]): Vocabulary {
  if (!lines.length) return NOTHING;
  const tries: Record<VocabularyKind, Terms> = {
    spell: new Terms(),
    caster: new Terms(),
    target: new Terms(),
    zone: new Terms(),
  };
  const all = new Terms();
  const add = (kind: VocabularyKind, term: string | undefined) => {
    if (!term) return;
    tries[kind].add(term);
    all.add(term);
  };

  for (const line of lines) {
    const event = parseSplitLine(line);
    if (!event) continue;
    switch (event.kind) {
      case "cast":
        add("spell", event.spell);
        // Yourself is not a name anyone types into a rule — `includeSelf` is the way to say "me".
        if (event.caster !== SELF) add("caster", event.caster);
        break;
      case "buff-faded":
        add("spell", event.spell);
        add("target", event.pet ? "your pet" : event.target);
        break;
      case "zone":
        add("zone", event.zone);
        break;
      case "kill":
        // What a kill names is a mob, which is the same vocabulary a fade's target is drawn from —
        // and mob names are most of what a raw-text rule about a camp is written around.
        add("target", event.target);
        break;
    }
  }

  for (const kind of KINDS) tries[kind].seal();
  all.seal();
  const pick = (kind?: VocabularyKind) => (kind ? tries[kind] : all);

  return {
    size: all.size,
    complete(typed, kind) {
      const prefix = typed.trim();
      if (!prefix) return undefined;
      const found = pick(kind).complete(prefix);
      // Offering back exactly what's there is noise; so is a "completion" that is shorter.
      return found && found.length > prefix.length ? found : undefined;
    },
    suggest(typed, kind, limit = MAX_SUGGESTIONS) {
      const query = typed.trim();
      if (!query) return [];
      const terms = pick(kind);
      const needle = query.toLowerCase();
      const found: string[] = [];
      const take = (term: string) => {
        if (term.toLowerCase() !== needle && !found.includes(term)) found.push(term);
      };

      // 1. Starts with it. The trie gives the best one instantly; the rest come from the scan below,
      //    which is already sorted by how often the log used them.
      const best = terms.complete(query);
      if (best) take(best);
      const entries = terms.all();
      for (const entry of entries) {
        if (found.length >= limit) break;
        if (entry.term.toLowerCase().startsWith(needle)) take(entry.term);
      }
      if (query.length < SCAN_FROM_CHARS) return found.slice(0, limit);

      // 2. Contains it — "sme" finding Mesmerization, which no prefix ever will.
      for (const entry of entries) {
        if (found.length >= limit) break;
        if (entry.term.toLowerCase().includes(needle)) take(entry.term);
      }
      if (found.length >= limit) return found.slice(0, limit);

      // 3. Near enough — the app's own scorer, the one the search box uses, because EQ spelling is
      //    hard and a rule that misses over one letter is the whole problem this feature exists for.
      for (const match of fuzzyRank(query, entries, (e) => e.term, { limit, minScore: FUZZY_FLOOR })) {
        if (found.length >= limit) break;
        take(match.item.term);
      }
      return found.slice(0, limit);
    },
  };
}

/**
 * How close a fuzzy match has to be. Higher than `fuzzyRank`'s own default: the search box can
 * afford a wrong guess in a list of results, while a rule is a thing you commit to — an offer that
 * isn't nearly right is worse than no offer.
 */
const FUZZY_FLOOR = 0.6;

/** A vocabulary that knows nothing — for before the log has been read, and for tests. */
export const NO_VOCABULARY = NOTHING;
