import { filterAbilities, ABILITY_INVOCATIONS, ABILITY_STANCES, NO_ABILITY_CRITERIA, type Ability } from "../spells/stances-invocations";
import { AA_LIST, filterAA, NO_AA_CRITERIA, type AlternateAdvancement } from "../aa/aa-list";
import { matchesWords } from "../word-match";
import type { InventoryTotal } from "../game-export-dumps";

/** One group's matches: the first few, best first, and how many there were in all. */
export interface Matches<T> {
  shown: T[];
  total: number;
}

export interface AcrossMatches {
  held: Matches<InventoryTotal>;
  abilities: Matches<Ability & { kind: "stance" | "invocation" }>;
  aas: Matches<AlternateAdvancement>;
}

/** How many of each group the Search box shows before pointing at the section that has them all. */
export const ACROSS_LIMIT = 5;

/**
 * What Search's one box finds **beyond the wiki** — the three lookups that otherwise each needed their
 * own section: what you hold (your inventory export), stances and invocations, and AAs
 * ([ADR 0321](../../../specs/decisions/0321-find-answers-from-one-box.md)).
 *
 * Each group matches the way its own section does (literal words, name or description), so the box
 * and the section can't disagree about what matches; a match **by name** sorts ahead of one found
 * only in a description, since a typed name is usually the thing wanted.
 */
export function findAcross(term: string, held: readonly InventoryTotal[] | null, limit = ACROSS_LIMIT): AcrossMatches {
  const text = term.trim();
  const byName = <T extends { name: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => Number(!matchesWords(a.name, text)) - Number(!matchesWords(b.name, text)));
  const cap = <T>(rows: T[]): Matches<T> => ({ shown: rows.slice(0, limit), total: rows.length });
  if (!text) return { held: cap([]), abilities: cap([]), aas: cap([]) };

  const abilities = [
    ...filterAbilities(ABILITY_STANCES, { ...NO_ABILITY_CRITERIA, text }).map((a) => ({ ...a, kind: "stance" as const })),
    ...filterAbilities(ABILITY_INVOCATIONS, { ...NO_ABILITY_CRITERIA, text }).map((a) => ({ ...a, kind: "invocation" as const })),
  ];
  return {
    held: cap((held ?? []).filter((t) => matchesWords(t.baseName, text))),
    abilities: cap(byName(abilities)),
    aas: cap(byName(filterAA(AA_LIST, { ...NO_AA_CRITERIA, text }))),
  };
}
