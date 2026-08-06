/**
 * names.ts — the numbers EQL decorates a name with, and which name is the thing's identity.
 *
 * There are two, and they work the same way: an item can be **graded** ("Dragoon Dirk +2") and a
 * zone can be made **harder** ("Blackburrow 3"). Either number describes *this* copy of the thing
 * rather than which thing it is — the wiki has a page for "Dragoon Dirk" and none for "Dragoon
 * Dirk +2", and one map draws Blackburrow however hard its gnolls hit. A harder zone also names the
 * ruleset it scales by — "The Steamfont Mountains 2 (Adaptive)" — which is the same kind of fact
 * about this copy, so it folds away with the number.
 *
 * So a name is folded to its base wherever names are *matched* — the wiki, the map, the shopping
 * list, a drop rate — and kept verbatim wherever the log is *shown*, because the grade is the
 * point of the loot line and the difficulty is the point of comparing two camps.
 *
 * Pure and dependency-free. Both readers live here so the shapes the number comes in are stated
 * once; see [ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md).
 */

/** An item's grade is written as a plus and a number, always last: "Crushbone Belt +5". */
const ITEM_GRADE_RE = /\s*\+\s*(\d+)\s*$/;

/**
 * A harder zone's number follows its name. The plain form is what the game writes; the `+N` and
 * parenthesised forms are accepted too rather than betting on one spelling of it. A separator is
 * required, so a name that merely *ends* in a digit keeps it.
 */
const ZONE_DIFFICULTY_RE = /\s+\+?\(?(\d+)\)?\s*$/;

/**
 * The ruleset the zone was opened under, tagged on after the difficulty: the log's own
 * "The Steamfont Mountains 2 (Adaptive)". It says how the zone scales, not which zone it is, so it
 * folds away with the number. The tag has to start with a letter, because "Blackburrow (3)" is a
 * difficulty written the other way round and belongs to the rule above.
 */
const ZONE_MODE_RE = /\s*\(\s*([A-Za-z][^()]*?)\s*\)\s*$/;

const numberIn = (name: string, re: RegExp): number | undefined => {
  const m = re.exec(name.trim());
  return m ? Number(m[1]) : undefined;
};

const nameWithout = (name: string, re: RegExp): string => name.trim().replace(re, "").trim();

/** The `+N` an item name carries ("Dragoon Dirk +2" → 2), or undefined when it carries none. */
export function itemGrade(name: string): number | undefined {
  return numberIn(name, ITEM_GRADE_RE);
}

/** An item name without its grade — what the wiki, the shopping list and a drop rate key on. */
export function itemBaseName(name: string): string {
  return nameWithout(name, ITEM_GRADE_RE);
}

/** The ruleset tag a zone carries ("Blackburrow 2 (Adaptive)" → "Adaptive"), or undefined. */
export function zoneMode(name: string): string | undefined {
  const m = ZONE_MODE_RE.exec(name.trim());
  return m ? m[1] : undefined;
}

/** How much harder a zone was made ("Blackburrow 3" → 3), or undefined for the ordinary zone. */
export function zoneDifficulty(name: string): number | undefined {
  return numberIn(nameWithout(name, ZONE_MODE_RE), ZONE_DIFFICULTY_RE);
}

/** A zone name without its difficulty or ruleset — the zone one map and one wiki page describe. */
export function zoneBaseName(name: string): string {
  return nameWithout(nameWithout(name, ZONE_MODE_RE), ZONE_DIFFICULTY_RE);
}
