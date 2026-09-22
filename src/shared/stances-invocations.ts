/**
 * Which classes can use which stance or invocation — from eqlwiki's "Stances & Invocations"
 * ([ADR 0262](../../specs/decisions/0262-stances-and-invocations-are-generated-static-data.md)).
 *
 * A thin, hand-written lookup over the generated table, the same split `race-unlocks.ts` makes over
 * `race-unlocks.generated.ts`: the data is regenerated wholesale from the wiki, the lookups over it
 * are not. The one thing it adds that the generator couldn't: `classes` arrives as the wiki's own
 * three-letter codes (a plain script has no reason to import the app's class vocabulary), so this is
 * where each ability's codes become the `ClassName`s every other filter/column in the app already
 * uses (`class-names.ts`) — done once, at module load, over eighteen rows.
 *
 * Pure and DOM-free, like `spell-search.ts`/`item-search.ts` — the panel renders these decisions,
 * this module makes them. Text matching is literal, not fuzzy (`word-match.ts`, shared with
 * `aa-list.ts`) — see either module's header for why.
 */
import { classFullName, type ClassName } from "./class-names";
import { INVOCATIONS, STANCES, STANCES_INVOCATIONS_SOURCE } from "./stances-invocations.generated";
import { matchesWords } from "./word-match";

export { STANCES_INVOCATIONS_SOURCE };

/** One stance or invocation, classes translated to the app's own names. */
export interface Ability {
  name: string;
  description: string;
  classes: ClassName[];
}

const toAbility = (a: { name: string; description: string; classes: string[] }): Ability => ({
  name: a.name,
  description: a.description,
  // The cast is safe because the generator validates every code against the same sixteen before it
  // ever writes the file (`stances-invocations-parse.mjs`'s `KNOWN_CODES`) — `classFullName` itself
  // stays looser (returns an unrecognized code as-is) because a *card's* `Class:` line has no such
  // guarantee.
  classes: a.classes.map((code) => classFullName(code) as ClassName),
});

export const ABILITY_STANCES: readonly Ability[] = STANCES.map(toAbility);
export const ABILITY_INVOCATIONS: readonly Ability[] = INVOCATIONS.map(toAbility);

/** Everything one search is narrowed by — the same shape `SpellCriteria` uses, over a much smaller
 *  catalogue (eighteen rows, not eleven thousand), so there's no sort key and no era flag to carry. */
export interface AbilityCriteria {
  /** Matches a word anywhere in the name *or* the description — the reverse lookup this chart exists
   *  for ("what gives me double attack") needs the effect text searched, not just the ability's name. */
  text: string;
  /** Ticked classes. An empty list is "don't narrow by class". Several ticked are an *or* — the same
   *  "which of these classes could bring it" question `SpellCriteria.classes` answers for spells. */
  classes: readonly ClassName[];
}

export const NO_ABILITY_CRITERIA: AbilityCriteria = { text: "", classes: [] };

/** Does this ability survive every criterion? Text is literal, not fuzzy (`word-match.ts`) — with
 *  eighteen rows visible at once a filter only ever needs to cut, never to rank. */
export function matchesAbility(ability: Ability, c: AbilityCriteria): boolean {
  if (c.classes.length && !c.classes.some((cls) => ability.classes.includes(cls))) return false;
  return matchesWords(`${ability.name} ${ability.description}`, c.text);
}

/** The whole question, answered: cut the list down, in the order the wiki already states it. */
export function filterAbilities(abilities: readonly Ability[], criteria: AbilityCriteria): Ability[] {
  return abilities.filter((a) => matchesAbility(a, criteria));
}
