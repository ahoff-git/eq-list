/**
 * spell-era.ts — is this spell past the level cap of the era open now?
 *
 * The one level rule every era flag in the app applies to a spell on top of the wiki's page
 * categories ([ADR 0288](../../../specs/decisions/0288-a-spell-past-the-live-level-cap-is-out-of-era.md)).
 * Most level 51-60 spell pages carry no era category at all, so the category flag alone lets them
 * through — Tashanian (Enchanter 57) beside Tashania (Enchanter 41) in a search for either. The
 * Spells tab, the search box and the page view all ask this same question, so they can't disagree.
 *
 * Pure and DOM-free: handed a card and a cap, says whether the card's lowest level is past it.
 */
import { parseSpellStats } from "./spell-stats";
import type { ItemCard, WikiPageKind } from "../types";

/** The lowest level any class can cast it at, or undefined if the card named no class at all. */
export function minLevel(levels: Partial<Record<string, number>>): number | undefined {
  const values = Object.values(levels).filter((n): n is number => n !== undefined);
  return values.length ? Math.min(...values) : undefined;
}

/**
 * Can no class cast it at or under `levelCap`? A card naming no class is never judged by level —
 * there's nothing to judge it on.
 */
export function pastLevelCap(levels: Partial<Record<string, number>>, levelCap: number): boolean {
  const lowest = minLevel(levels);
  return lowest !== undefined && lowest > levelCap;
}

/** What a spell page has to offer the rule: its kind (only a spell is judged) and its card. */
export interface SpellEraEvidence {
  kind: WikiPageKind;
  card?: ItemCard;
}

/**
 * A page or search result with its era flag widened by the level rule — returned as-is when nothing
 * changes, the same shape as `withGmEventEra`.
 *
 * `evidence` is the page the flag is about: the page itself when `x` is one, or the cached copy of a
 * search result's page. A result we hold no page for is left as the categories said.
 */
export function withSpellLevelEra<T extends { outOfEra?: boolean }>(
  x: T,
  evidence: SpellEraEvidence | null | undefined,
  levelCap: number,
): T;
export function withSpellLevelEra<T extends { outOfEra?: boolean }>(
  x: T | null,
  evidence: SpellEraEvidence | null | undefined,
  levelCap: number,
): T | null;
export function withSpellLevelEra<T extends { outOfEra?: boolean }>(
  x: T | null,
  evidence: SpellEraEvidence | null | undefined,
  levelCap: number,
): T | null {
  if (!x || x.outOfEra || evidence?.kind !== "spell") return x;
  if (!pastLevelCap(parseSpellStats(evidence.card?.lines).levels, levelCap)) return x;
  return { ...x, outOfEra: true };
}
