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
import { createZoneResolver, resolveZone } from "../zones/resolve";
import { CURATED_ZONES } from "../zones/gazetteer";
import { placeName } from "../zones/place";

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
  const byName = resolveZone(name, zones, (z) => z.name, { typo: true })?.item;
  if (byName) return byName;
  return byGazetteerFile(name, zones);
}

/**
 * The gazetteer as **name → map file**, built once over ~83 entries because it memoises.
 *
 * `typo` for the same reason every other reader has it (ADR 0075); `narrow` and `fuzzy` stay off,
 * because this answers with a *file* and a wrong file is the one naming mistake that doesn't fail
 * closed.
 */
const gazetteerFiles = createZoneResolver(CURATED_ZONES, (z) => z.name, { typo: true });

/**
 * **The last resort: the gazetteer knows which *file* this name is, whatever the pack called it.**
 *
 * Every tier above matches the name against the pack's own labels, which is right and is usually
 * enough — `zonesFromFiles` gives a file its curated name whenever the gazetteer has one. But a file
 * can end up labelled something else entirely: two files claiming one zone name means the loser keeps
 * its short name (`tox` becomes "Tox", ADR 0075), and a file the solver couldn't name wears its own.
 * A pack whose labelling we can't match then hides a map we are holding — measured, that is 36 of the
 * 83 gazetteer zones for a folder whose labels name nothing.
 *
 * So after asking what this pack calls its zones, ask the **supplied table** what file the name is and
 * take that file if the pack has it
 * ([ADR 0139](../../../specs/decisions/0139-a-difficulty-can-never-cost-a-map.md)). It cannot guess:
 * the mapping is stated in `eql-classic-zone-maps.json`
 * ([ADR 0076](../../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)) and is
 * checked by `zone-gazetteer.test.ts` rather than trusted. And it can only ever *add* a match, because
 * it runs only once the pack's own labels have found nothing.
 *
 * **The pack still wins where it answered.** This is a fallback, not an override — a zone whose label
 * this pack does match is drawn from the file that pack meant, which is ADR 0061 untouched.
 */
function byGazetteerFile(name: string, zones: Zone[]): Zone | undefined {
  const file = gazetteerFiles.resolve(name)?.item.file;
  return file ? zones.find((z) => z.file === file) : undefined;
}

/**
 * **The name a map reference means** — the one translation every "which map is this?" goes through.
 *
 * `findZone` answers with a *file*, and a map reference needs a **name**: the thing to scope pins and
 * kills to, put in the title, remember as the picker's choice, hand to the wiki. Every caller used to
 * write that itself as `findZone(n, zones)?.name ?? n`, and it is the `?? n` that was the bug —
 * unmapped zones fell back to **the log's wording, difficulty and all**, so "Blackburrow 3" became a
 * second Blackburrow with its own pins, its own scope and its own (broken) wiki link
 * ([ADR 0134](../../../specs/decisions/0134-a-map-reference-resolves-to-a-place.md)).
 *
 * So the floor is the **place**, never the raw name: a zone with no map file still resolves to one
 * name for one place, folded by the app's one fold (`placeName`, ADR 0083 — which itself strips the
 * difficulty and the ruleset per [ADR 0057](../../../specs/decisions/0057-a-grade-is-not-an-identity.md)).
 * An empty name stays empty, because "no zone yet" is not a place.
 *
 * The difficulty this discards is not lost: it is read back off the log's wording with
 * `zoneDifficultyLabel` (`shared/names.ts`), which is what the map's title shows beside the name.
 */
export function mapZoneName(name: string, zones: Zone[]): string {
  return findZone(name, zones)?.name ?? placeName(name);
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
