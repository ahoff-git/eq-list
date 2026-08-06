/**
 * Zone names we can state outright, and how to look a zone up.
 *
 * This used to be a catalogue of bundled map images with hand-tuned calibration beside each one.
 * The images are gone (ADR 0042) — the maps are the game's own text files now, and they know where
 * they are — so all that's left is the part those files can't supply: **what a zone is called**.
 *
 * The list is small on purpose. `solveZoneNames` reads names off the maps' own exit labels and gets
 * most of them; these are the ones it gets *wrong* or can't reach, so they're stated here and take
 * priority (see `zonesFromFiles`).
 */

import type { Zone } from "./types";
import { normalizeZone } from "../sources";

/**
 * Zone names worth stating by hand, with the file each belongs to. Every one is a standard
 * EverQuest short name, and a name is only ever used if that file exists — so a *missing* file here
 * fails closed (the zone keeps its file name). A **wrong** one does not: it draws a different
 * zone's map under the right name, and every position plotted on it is somewhere else entirely.
 *
 * So the solver's rule applies to hand-written entries too, and it is the check to run before
 * adding one: **a map that links "to X" is a neighbour of X, not X**. `qey2hh1` was curated as
 * Qeynos Hills on that mistake — its own exit label says `to Qeynos Hills`, because it is West
 * Karana next door, and Qeynos Hills is `qeytoqrg` ("Qeynos to Surefall Glade", whose exits are
 * Blackburrow, Northern Qeynos, Surefall Glade and West Karana). Confirmed against a real log's
 * `/loc` fixes: all 20 recorded positions in Qeynos Hills sit inside `qeytoqrg`'s geometry and
 * outside `qey2hh1`'s.
 */
export const CURATED_ZONES: { name: string; file: string; sortingStr?: string }[] = [
  { name: "Greater Faydark", file: "gfaydark", sortingStr: "Faydark" },
  { name: "Lesser Faydark", file: "lfaydark", sortingStr: "Faydark" },
  { name: "Toxxulia Forest", file: "toxxulia" },
  { name: "Qeynos Hills", file: "qeytoqrg" },
  // The neighbour that was standing in for it. EQ named West Karana for the road it carries
  // ("Qeynos to HighHold, part 1"), which no spelling rule can reach — the other three Karanas
  // are `eastkarana` / `northkarana` / `southkarana`, so this is the fourth by elimination and by
  // its exits (Qeynos Hills, the Northern Plains of Karana).
  { name: "West Karana", file: "qey2hh1", sortingStr: "Karana" },
  { name: "Clan Crushbone", file: "crushbone" },
  { name: "Northern Felwithe", file: "felwithea", sortingStr: "Felwithe" },
  { name: "Southern Felwithe", file: "felwitheb", sortingStr: "Felwithe" },
  // The solver offers `neriaka` the *Fourth* Gate, which is a different zone's file.
  { name: "Neriak Foreign Quarter", file: "neriaka", sortingStr: "Neriak" },
  { name: "Neriak Commons", file: "neriakb", sortingStr: "Neriak" },
  { name: "Neriak Third Gate", file: "neriakc", sortingStr: "Neriak" },
  { name: "Nektulos Forest", file: "nektulos" },
  { name: "Oggok", file: "oggok" },
  { name: "The Feerrott", file: "feerrott" },
  { name: "Steamfont Mountains", file: "steamfontmts" },
  { name: "Ak'Anon", file: "akanon" },
  { name: "RunnyEye Citadel", file: "runnyeye" },
  { name: "Northern Desert of Ro", file: "northro", sortingStr: "Ro" },
  // The zones a real log caught us visiting.
  { name: "East Commonlands", file: "ecommons" },
  { name: "The Estate of Unrest", file: "unrest" },
  { name: "New Sebilis Expedition", file: "newsebexp" },
  { name: "EQL Tutorial", file: "tutoriala" },
];

/**
 * Find a zone by name. Prefers an exact key match, then falls back to `normalizeZone` so a log's
 * "The Feerrott" resolves regardless of case or article — which is how the map follows you. That
 * fold is shared with the wiki-side zone matching rather than repeated here, which is also what
 * makes a harder zone ("The Feerrott 3") land on the ordinary zone's map.
 */
export function findZone(name: string, zones: Zone[]): Zone | undefined {
  const exact = zones.find((z) => z.key === name);
  if (exact) return exact;
  const target = normalizeZone(name);
  return zones.find((z) => normalizeZone(z.name) === target);
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
