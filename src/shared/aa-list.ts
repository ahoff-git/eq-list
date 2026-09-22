/**
 * Filtering over the generated Alternate Advancement list — the same split `stances-invocations.ts`
 * draws over its own generated table: the data is regenerated wholesale from the wiki, the lookup
 * over it is not.
 *
 * **Literal word match, not fuzzy** (`word-match.ts`, shared with `stances-invocations.ts`) — the
 * question this exists to answer ("which AAs help direct damage") is "does the effect text contain
 * these words", not a ranked autocomplete guess. With a category/class filter already narrowing
 * what's shown, cutting the list is what's needed, not scoring it.
 */
import { AA_LIST, AA_LIST_SOURCE, type AACategory, type AlternateAdvancement } from "./aa-list.generated";
import type { SPELL_CLASSES } from "./spell-file";
import { matchesWords } from "./word-match";

export { AA_LIST, AA_LIST_SOURCE };
export type { AACategory, AlternateAdvancement };

export interface AACriteria {
  /** Matches a word anywhere in the name *or* the description. */
  text: string;
  /** "" is "don't narrow by class". General/Archetype/Special AAs have no class and always pass —
   *  they apply broadly, so a class filter must never hide them. */
  class: (typeof SPELL_CLASSES)[number] | "";
}

export const NO_AA_CRITERIA: AACriteria = { text: "", class: "" };

function matchesClass(aa: AlternateAdvancement, cls: string): boolean {
  return !cls || aa.category !== "class" || aa.class === cls;
}

/** Does this AA survive every criterion? Text is literal, not fuzzy (`word-match.ts`). */
export function matchesAA(aa: AlternateAdvancement, c: AACriteria): boolean {
  return matchesClass(aa, c.class) && matchesWords(`${aa.name} ${aa.description}`, c.text);
}

/** The whole question, answered: cut the list down, in the wiki's own order. */
export function filterAA(list: readonly AlternateAdvancement[], c: AACriteria): AlternateAdvancement[] {
  return list.filter((aa) => matchesAA(aa, c));
}
