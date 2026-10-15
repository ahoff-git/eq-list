/**
 * quest-steps.ts — what a quest step's links are, once their own pages have been asked.
 *
 * The parser keeps a walkthrough's bullets as written, links in place (`electron/wiki/quest-steps.ts`).
 * A link to Kizzie Mintopp and a link to Rivervale look the same in a bullet. Each link's own page
 * says which it is, and for an NPC, where to find them. This module is that reading, so the page view
 * only has to draw it ([ADR 0295](../../../specs/decisions/0295-a-quest-is-a-tree-of-steps.md)).
 *
 * Pure and DOM-free.
 */
import { wikiPlace, type WikiPlace } from "../map/mob-place";
import type { ItemCard, QuestStep, WikiPageKind } from "../types";

/** What a step's link turned out to be. */
export interface StepLinkInfo {
  kind: WikiPageKind;
  /**
   * For an NPC or mob: the zones its page names. A roaming mob's page lists several in one line
   * ("Kithicor Forest, Misty Thicket, West Commonlands"), and each is its own place on the map.
   */
  zones?: string[];
  /** Its stated spot — kept only when it stands in one zone, since a spot means nothing across several. */
  loc?: WikiPlace["loc"];
}

/** Every page a step tree links, once each, in the order they first appear. */
export function stepLinkTitles(steps: readonly QuestStep[]): string[] {
  const seen = new Set<string>();
  const walk = (list: readonly QuestStep[]) => {
    for (const step of list) {
      for (const part of step.parts) if (typeof part !== "string") seen.add(part.title);
      walk(step.steps);
    }
  };
  walk(steps);
  return [...seen];
}

/**
 * A linked page, read for what a step needs from it: its kind, and an NPC's stated zone and spot.
 * `null` (no such page, or not fetched) reads as nothing known, which the view draws as a plain link.
 */
export function describeStepLink(page: { kind: WikiPageKind; card?: ItemCard } | null | undefined): StepLinkInfo | undefined {
  if (!page) return undefined;
  if (page.kind !== "mob") return { kind: page.kind };
  const place = wikiPlace(page.card);
  const zones = place?.zone?.split(/\s*,\s*/).filter(Boolean) ?? [];
  if (!zones.length) return { kind: page.kind };
  return zones.length === 1 && place?.loc ? { kind: page.kind, zones, loc: place.loc } : { kind: page.kind, zones };
}
