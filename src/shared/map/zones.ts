/**
 * The default zone catalogue plus pure lookup/sort helpers. Ported from eq-map
 * (see ADR 0010). Image paths are retargeted to this app's public root
 * (`/maps/…`, served from `public/maps/` including under static export).
 *
 * Calibration (`size`, `centerOffset`) is from Project 1999 classic maps — the best
 * available starting set. It may not perfectly fit every EQL zone; the calibration
 * tool (see specs/map) is how it gets re-tuned.
 */

import type { Zone } from "./types";

export const baseZones: Zone[] = [
  { name: "Choose a zone", key: "choose-a-zone", sortingStr: "AAA" },
  { name: "Greater Faydark", key: "greater-faydark", sortingStr: "Faydark", mapImg: "/maps/Greaterfaydark.jpg", mapKeyImg: "/maps/Greaterfaydark_key.jpg", size: { width: 6175, height: 6175 }, centerOffset: { y: 0, x: 0 } },
  { name: "Toxxulia Forest", key: "toxxulia-forest", mapImg: "/maps/Toxxulia.jpg", mapKeyImg: "/maps/Toxxulia_key.jpg", size: { width: 5825, height: 5950 }, centerOffset: { y: -50, x: -530 } },
  { name: "Qeynos Hills", key: "qeynos-hills", mapImg: "/maps/Qeynoshills.jpg", mapKeyImg: "/maps/Qeynoshills_key.jpg", size: { width: 6062, height: 6127 }, centerOffset: { y: -2547, x: 198 } },
  { name: "Crushbone", key: "crushbone", mapImg: "/maps/Crushbone.jpg", mapKeyImg: "/maps/Crushbone_key.jpg", size: { width: 1365, height: 1363 }, centerOffset: { y: 122, x: -259 } },
  { name: "Northern Felwithe", key: "northern-felwithe", sortingStr: "Felwithe", mapImg: "/maps/Nfelwithe.jpg", mapKeyImg: "/maps/Nfelwithe_key.jpg", size: { width: 1082, height: 1083 }, centerOffset: { y: -62, x: 326 } },
  { name: "Southern Felwithe", key: "southern-felwithe", sortingStr: "Felwithe", mapImg: "/maps/Sfelwithe.jpg", mapKeyImg: "/maps/Sfelwithe_key.jpg", size: { width: 700, height: 691 }, centerOffset: { y: -505, x: 604 } },
  { name: "Neriak Foreign Quarter", key: "neriak-foreign-quarter", sortingStr: "Neriak", mapImg: "/maps/Neriakforeign.jpg", mapKeyImg: "/maps/Neriakforeign_key.jpg", size: { width: 700, height: 700 }, centerOffset: { y: 0, x: 0 } },
  { name: "Neriak Commons", key: "neriak-commons", sortingStr: "Neriak", mapImg: "/maps/Neriakcommons_true_north.png", mapKeyImg: "/maps/Neriakcommons_true_north_key.jpg", size: { width: 700, height: 700 }, centerOffset: { y: 0, x: 0 } },
  { name: "Neriak Third Gate", key: "neriak-third-gate", sortingStr: "Neriak", mapImg: "/maps/Neriakthirdgate.jpg", mapKeyImg: "/maps/Neriakthirdgate_key.jpg", size: { width: 700, height: 700 }, centerOffset: { y: 0, x: 0 } },
  { name: "Nektulos Forest", key: "nektulos-forest", mapImg: "/maps/Nektulos.jpg", mapKeyImg: "/maps/Nektulos_key.jpg", size: { width: 6000, height: 6000 }, centerOffset: { y: 0, x: 0 } },
  { name: "Oggok", key: "oggok", mapImg: "/maps/Oggok.jpg", mapKeyImg: "/maps/Oggok_key.jpg", size: { width: 1690, height: 1710 }, centerOffset: { y: -299, x: -318 } },
  { name: "The Feerrott", key: "the-feerrott", sortingStr: "Feerrott", mapImg: "/maps/Feerrott.jpg", mapKeyImg: "/maps/Feerrott_key.jpg", size: { width: 7000, height: 7000 }, centerOffset: { y: 140, x: -45 } },
  { name: "Steamfont Mountains", key: "steamfont-mountains", mapImg: "/maps/Steamfont.jpg", mapKeyImg: "/maps/Steamfont_key.png", size: { width: 4643, height: 4669 }, centerOffset: { y: 24, x: -37 } },
  { name: "Ak'Anon", key: "ak-anon", mapImg: "/maps/Akanon.jpg", mapKeyImg: "/maps/Akanon_key.png", size: { width: 2930, height: 2935 }, centerOffset: { y: -1287, x: 597 } },
  { name: "Lesser Faydark", key: "lesser-faydark", sortingStr: "Faydark", mapImg: "/maps/Lesserfaydark.jpg", mapKeyImg: "/maps/Lesserfaydark_key.png", size: { width: 6642, height: 6674 }, centerOffset: { y: -515, x: -874 } },
  { name: "RunnyEye Citadel1", key: "runnyeye-citadel-1", sortingStr: "Runnyeye", layer:1, mapImg: "/maps/Runnyeye1.jpg", mapKeyImg: "/maps/Runnyeye1_key.jpg", size: { width: 431, height: 488 }, centerOffset: { y: -112, x: 5 } },
  { name: "RunnyEye Citadel2", key: "runnyeye-citadel-2", sortingStr: "Runnyeye", layer:2, mapImg: "/maps/Runnyeye2.jpg", mapKeyImg: "/maps/Runnyeye2_key.jpg", size: { width: 493, height: 594 }, centerOffset: { y: -53, x: 34 } },
  { name: "RunnyEye Citadel3", key: "runnyeye-citadel-3", sortingStr: "Runnyeye", layer:3, mapImg: "/maps/Runnyeye3.jpg", mapKeyImg: "/maps/Runnyeye3_key.jpg", size: { width: 415, height: 609 }, centerOffset: { y: -64, x: -3 } },
  { name: "RunnyEye Citadel4", key: "runnyeye-citadel-4", sortingStr: "Runnyeye", layer:4, mapImg: "/maps/Runnyeye4.jpg", mapKeyImg: "/maps/Runnyeye4_key.jpg", size: { width: 462, height: 569 }, centerOffset: { y: -13, x: 31 } },
  { name: "Northern Desert of Ro", key: "northern-desert-of-ro", sortingStr: "Ro", mapImg: "/maps/NorthernDesertOfRo.jpg", mapKeyImg: "/maps/NorthernDesertOfRo_key.jpg", size: { width: 296, height: 569 }, centerOffset: { y: -105, x: -14 } },
];

/** Normalize a zone name for tolerant matching: trim, lowercase, drop a leading "the ". */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^the /, "");
}

/**
 * Find a zone by name. Prefers an exact match, then falls back to a normalized
 * match so a log's "The Feerrott" resolves regardless of case or article.
 */
export function findZone(name: string, zones: Zone[]): Zone | undefined {
  const exact = zones.find((z) => z.key === name);
  if (exact) return exact;
  const target = normalize(name);
  return zones.find((z) => normalize(z.name) === target);
}

/**
 * Sort for the zone picker: by `sortingStr` (falling back to `name`) then `name`,
 * so related zones (all "Neriak", both "Faydark") group together.
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
