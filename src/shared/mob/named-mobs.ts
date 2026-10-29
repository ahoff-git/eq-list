/**
 * named-mobs.ts — is a mob one of eqlwiki's own "Named Mobs"?
 *
 * `named-mobs.generated.ts` is a plain transcription of eqlwiki's `Category:Named Mobs`; this is
 * the hand-written lookup over it, the same division of labor `buff-lines.ts` keeps beside its own
 * generated file.
 *
 * A wiki title ("Lord Nagafen"), a zone page's own NPC roster ("Lord Nagafen"), and a kill log's
 * name ("a bandit") each spell a mob slightly differently, so matching folds **both** of the app's
 * existing name normalizations rather than inventing a third: `npcKey` (`item-levels.ts`) drops a
 * trailing disambiguating parenthetical the way the category list itself carries one
 * ("A bandit (Eastern Karana)"), and `stripArticle` (`log-parser.ts`) drops the leading article a
 * kill log or roster row carries and a wiki title never does.
 */
import { npcKey } from "../items/item-levels";
import { stripArticle } from "../log-parser";
import { NAMED_MOBS } from "./named-mobs.generated";

/**
 * One mob's name folded so a wiki title, a zone roster row and a kill log's name meet: no leading
 * article, no trailing disambiguating parenthetical, case and spacing folded.
 */
export const npcNameKey = (name: string): string => npcKey(stripArticle(name));
const namedKey = npcNameKey;

let names: Set<string> | undefined;

function index(): Set<string> {
  if (!names) names = new Set(NAMED_MOBS.map(namedKey));
  return names;
}

/** Is this mob a member of eqlwiki's `Category:Named Mobs`? */
export function isNamedMob(name: string): boolean {
  return index().has(namedKey(name));
}
