/**
 * How to look a zone up, and — via the gazetteer next door — what one is called.
 *
 * This used to be a catalogue of bundled map images with hand-tuned calibration beside each one.
 * The images are gone (ADR 0042) — the maps are the game's own text files now, and they know where
 * they are — so all that's left is the part those files can't supply: **what a zone is called**.
 *
 * That part now lives in [`zones/gazetteer.ts`](../zones/gazetteer.ts), which owns both halves of the
 * mapping (which *file* a zone is, and which *names* mean it) from one supplied table
 * ([ADR 0076](../../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
 * `CURATED_ZONES` is re-exported here because this is where its readers have always found it, and
 * because a name is only ever *used* by the naming rules in `map-sources.ts`.
 */

import type { Zone } from "./types";
import { resolveZone } from "../zones/resolve";
import { CURATED_ZONES } from "../zones/gazetteer";

export { CURATED_ZONES };
export type { CuratedZone } from "../zones/gazetteer";

/**
 * Find a zone by name. Prefers an exact key match, then resolves against the list itself, so a log's
 * "The Feerrott" lands regardless of case or article — which is how the map follows you — and a
 * harder zone ("The Feerrott 3") lands on the ordinary zone's map.
 *
 * **Only the tiers that cannot pick a different zone.** `resolveZone`'s looser ones are refused here
 * on the rule this file already runs on: a wrong file is the one naming mistake that doesn't fail
 * closed, because it draws a different zone under the right name and puts every position you plot
 * somewhere else entirely. So the map takes `exact`, `order` — pure rephrasing — and `typo`, whose
 * one-edit rule is measured against every zone name the app ships
 * ([ADR 0075](../../../specs/decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)); it would
 * rather show no map than the wrong one
 * ([ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)).
 *
 * `typo` is what stops a pack whose label reads `Toxulia Forest` from leaving the log's `Toxxulia
 * Forest` with no map at all.
 */
export function findZone(name: string, zones: Zone[]): Zone | undefined {
  const exact = zones.find((z) => z.key === name);
  if (exact) return exact;
  return resolveZone(name, zones, (z) => z.name, { typo: true })?.item;
}

/**
 * Sort for the zone picker: by `sortingStr` (falling back to `name`) then `name`, so related zones
 * (all "Neriak", both "Faydark") group together.
 */
export function sortZones(zones: Zone[]): Zone[] {
  return [...zones].sort((a, b) => {
    const term1 = (a.sortingStr || "") + a.name;
    const term2 = (b.sortingStr || "") + b.name;
    // localeCompare returns 0 on a tie — a bare `>` ternary would report -1 both ways,
    // giving an inconsistent (engine-dependent) order the moment two keys are equal.
    return term1.localeCompare(term2);
  });
}

/**
 * Is a marker visible on the floors in view?
 *
 * A **marker** without a layer belongs to the zone rather than a storey — anything inferred from the
 * log, which never reports a floor — so it shows on every one. An empty or absent **set of floors**
 * is no filter at all: every floor on screen, and a zone with no floors, are the same picture.
 *
 * A marker stamped with a floor the current map doesn't have still shows, which matters when the
 * same zone is drawn from a different pack: a pin you placed is yours, and it shouldn't vanish
 * because this author didn't label their storeys.
 */
export function onLayer(marker: { layer?: number }, layers?: ReadonlySet<number> | null): boolean {
  if (!layers?.size) return true;
  return marker.layer === undefined || layers.has(marker.layer);
}
