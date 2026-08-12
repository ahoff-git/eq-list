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
import { resolveZone } from "../zones/resolve";

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
 *
 * That check is the price of an entry, and it has two halves worth running: **the exits** (a file's
 * neighbours identify it) and **your own positions** (you cannot stand outside the zone you are in).
 * Where the log and the maps disagree about the *name* rather than the file, the entry goes in
 * `ZONE_ALIASES` (`src/shared/names.ts`) instead — the two tables are one mapping list.
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
  // The log's own wording. It used to read "EQL Tutorial", which is nobody's name for it — the
  // zone line says "You have entered EverQuest Legends Tutorial." and that is what has to resolve.
  { name: "EverQuest Legends Tutorial", file: "tutoriala" },
  /*
   * More zones a real log caught us visiting, none of which any pack's labels name — every one
   * identified by its own exits (the neighbours a zone links to are the zone's fingerprint):
   *
   *   kerraridge  to Toxxulia Forest — Kerra Isle's only neighbour, and 454 of 463 positions
   *               recorded there sit inside its lines. Named "Kerra Ridge" by both packs, which is
   *               why the log's "Kerra Isle" is an alias rather than an entry here.
   *   qeynos2     to Qeynos Hills, South Qeynos, the Catacombs, the Aqueducts
   *   qeynos      to North Qeynos, the Aqueducts, and the Erud's Crossing translocator
   *   qrg         to Qeynos Hills and Jaggedpine Forest
   *   freporte    to West Freeport, the Northern Desert of Ro, and a boat to Butcherblock/Ocean of
   *               Tears/Qeynos
   *   erudsxing   to Erudin and South Qeynos
   *   erudnext    to Erud's Crossing by boat, ferry and translocator, plus "Erudin City" — the
   *               outer city, where `erudnint` (exits: "Erudin") is the palace inside it
   *   butcher     to the Greater Faydark, South Kaladim, Dagnor's Cauldron and the Ocean of Tears.
   *               The game's own maps name it "The Butcherblock Mountains" unaided; Brewall's say
   *               "Butcherblock", which folds to neither the log's name nor that one — so it is
   *               stated here and both packs agree.
   */
  { name: "Kerra Ridge", file: "kerraridge" },
  { name: "North Qeynos", file: "qeynos2", sortingStr: "Qeynos" },
  { name: "South Qeynos", file: "qeynos", sortingStr: "Qeynos" },
  { name: "Surefall Glade", file: "qrg" },
  { name: "East Freeport", file: "freporte", sortingStr: "Freeport" },
  { name: "Erud's Crossing", file: "erudsxing" },
  { name: "Erudin", file: "erudnext" },
  { name: "Butcherblock Mountains", file: "butcher" },
  /*
   * `oot` is the weaker one, stated because the alternative is silence: it carries no exit labels of
   * its own, so the neighbour test can't confirm it — but two files that *do* label their boats name
   * "The Ocean of Tears" (`butcher`, `freporte`), no other file claims that name, and `oot` is the
   * standard short name. Brewall ships `oceanoftears`, which its own labels name, so this only
   * matters for the game's own maps.
   */
  { name: "The Ocean of Tears", file: "oot" },
];

/**
 * Find a zone by name. Prefers an exact key match, then resolves against the list itself, so a log's
 * "The Feerrott" lands regardless of case or article — which is how the map follows you — and a
 * harder zone ("The Feerrott 3") lands on the ordinary zone's map.
 *
 * **Only the two strict tiers.** `resolveZone`'s looser ones are refused here on the rule this file
 * already runs on: a wrong file is the one naming mistake that doesn't fail closed, because it draws
 * a different zone under the right name and puts every position you plot somewhere else entirely. So
 * the map takes `exact` and `order` — the latter being pure rephrasing, which cannot pick a
 * different zone — and would rather show no map than the wrong one
 * ([ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)).
 */
export function findZone(name: string, zones: Zone[]): Zone | undefined {
  const exact = zones.find((z) => z.key === name);
  if (exact) return exact;
  return resolveZone(name, zones, (z) => z.name)?.item;
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
