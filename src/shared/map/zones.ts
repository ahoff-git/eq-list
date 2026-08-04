/**
 * The default zone catalogue plus pure lookup/sort helpers. Ported from eq-map
 * (see ADR 0010). Image paths are retargeted to this app's public root
 * (`/maps/…`, served from `public/maps/` including under static export).
 *
 * Calibration is two numbers per map: `scale` (EQ world units per image pixel) and
 * `center` (the EQ coordinate at the image's centre). Both were derived from the P99
 * classic maps' hand-tuning — the best available starting set. They may not perfectly fit
 * every EQL zone; the in-app calibration tool (see specs/map and ADR 0038) re-tunes them
 * by clicking two known spots.
 */

import type { Zone } from "./types";

export const baseZones: Zone[] = [
  { name: "Choose a zone", key: "choose-a-zone", sortingStr: "AAA" },
  { name: "Greater Faydark", key: "greater-faydark", sortingStr: "Faydark", mapImg: "/maps/Greaterfaydark.jpg", mapKeyImg: "/maps/Greaterfaydark_key.jpg", scale: 11.227, center: { y: 0, x: 0 } },
  { name: "Toxxulia Forest", key: "toxxulia-forest", mapImg: "/maps/Toxxulia.jpg", mapKeyImg: "/maps/Toxxulia_key.jpg", scale: 10.964, center: { y: 50, x: 530 } },
  { name: "Qeynos Hills", key: "qeynos-hills", mapImg: "/maps/Qeynoshills.jpg", mapKeyImg: "/maps/Qeynoshills_key.jpg", scale: 10.599, center: { y: 2547, x: -198 } },
  { name: "Crushbone", key: "crushbone", mapImg: "/maps/Crushbone.jpg", mapKeyImg: "/maps/Crushbone_key.jpg", scale: 3.031, center: { y: -122, x: 259 } },
  { name: "Northern Felwithe", key: "northern-felwithe", sortingStr: "Felwithe", mapImg: "/maps/Nfelwithe.jpg", mapKeyImg: "/maps/Nfelwithe_key.jpg", scale: 1.838, center: { y: 62, x: -326 } },
  { name: "Southern Felwithe", key: "southern-felwithe", sortingStr: "Felwithe", mapImg: "/maps/Sfelwithe.jpg", mapKeyImg: "/maps/Sfelwithe_key.jpg", scale: 1.739, center: { y: 505, x: -604 } },
  { name: "Neriak Foreign Quarter", key: "neriak-foreign-quarter", sortingStr: "Neriak", mapImg: "/maps/Neriakforeign.jpg", mapKeyImg: "/maps/Neriakforeign_key.jpg", scale: 1.311, center: { y: 0, x: 0 } },
  { name: "Neriak Commons", key: "neriak-commons", sortingStr: "Neriak", mapImg: "/maps/Neriakcommons_true_north.png", mapKeyImg: "/maps/Neriakcommons_true_north_key.jpg", scale: 1.406, center: { y: 0, x: 0 } },
  { name: "Neriak Third Gate", key: "neriak-third-gate", sortingStr: "Neriak", mapImg: "/maps/Neriakthirdgate.jpg", mapKeyImg: "/maps/Neriakthirdgate_key.jpg", scale: 1.264, center: { y: 0, x: 0 } },
  { name: "Nektulos Forest", key: "nektulos-forest", mapImg: "/maps/Nektulos.jpg", mapKeyImg: "/maps/Nektulos_key.jpg", scale: 11.561, center: { y: 0, x: 0 } },
  { name: "Oggok", key: "oggok", mapImg: "/maps/Oggok.jpg", mapKeyImg: "/maps/Oggok_key.jpg", scale: 3.172, center: { y: 299, x: 318 } },
  { name: "The Feerrott", key: "the-feerrott", sortingStr: "Feerrott", mapImg: "/maps/Feerrott.jpg", mapKeyImg: "/maps/Feerrott_key.jpg", scale: 12.727, center: { y: -140, x: 45 } },
  { name: "Steamfont Mountains", key: "steamfont-mountains", mapImg: "/maps/Steamfont.jpg", mapKeyImg: "/maps/Steamfont_key.png", scale: 9.406, center: { y: -24, x: 37 } },
  { name: "Ak'Anon", key: "ak-anon", mapImg: "/maps/Akanon.jpg", mapKeyImg: "/maps/Akanon_key.png", scale: 4.776, center: { y: 1287, x: -597 } },
  { name: "Lesser Faydark", key: "lesser-faydark", sortingStr: "Faydark", mapImg: "/maps/Lesserfaydark.jpg", mapKeyImg: "/maps/Lesserfaydark_key.png", scale: 11.519, center: { y: 515, x: 874 } },
  // ── Awaiting calibration ──────────────────────────────────────────────────────
  // These five carried a `size` that was, to the pixel, their image's dimensions — a
  // placeholder, never a measurement, which plotted your dot at a fictitious spot. They
  // keep their maps and no calibration until someone runs 📐 on them (two clicks each).
  // RunnyEye is one place with four maps: same `name` (what the log says when you zone
  // in), distinguished by `layer`. See `zoneLayers`.
  { name: "RunnyEye Citadel", key: "runnyeye-citadel-1", sortingStr: "Runnyeye", layer: 1, mapImg: "/maps/Runnyeye1.jpg", mapKeyImg: "/maps/Runnyeye1_key.jpg" },
  { name: "RunnyEye Citadel", key: "runnyeye-citadel-2", sortingStr: "Runnyeye", layer: 2, mapImg: "/maps/Runnyeye2.jpg", mapKeyImg: "/maps/Runnyeye2_key.jpg" },
  { name: "RunnyEye Citadel", key: "runnyeye-citadel-3", sortingStr: "Runnyeye", layer: 3, mapImg: "/maps/Runnyeye3.jpg", mapKeyImg: "/maps/Runnyeye3_key.jpg" },
  { name: "RunnyEye Citadel", key: "runnyeye-citadel-4", sortingStr: "Runnyeye", layer: 4, mapImg: "/maps/Runnyeye4.jpg", mapKeyImg: "/maps/Runnyeye4_key.jpg" },
  { name: "Northern Desert of Ro", key: "northern-desert-of-ro", sortingStr: "Ro", mapImg: "/maps/NorthernDesertOfRo.jpg", mapKeyImg: "/maps/NorthernDesertOfRo_key.jpg" },
];

/** Normalize a zone name for tolerant matching: trim, lowercase, drop a leading "the ". */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/^the /, "");
}

/**
 * Every map we have for one place, lowest layer first. A multi-layer zone (RunnyEye's
 * four floors) is several `Zone`s sharing a `name`; `name` here may also be any of their
 * `key`s, so a saved pick of one layer still resolves to the whole set. Empty when the
 * place isn't in the catalogue at all.
 */
export function zoneLayers(name: string, zones: Zone[]): Zone[] {
  const target = normalize(name);
  const seed = zones.find((z) => z.key === name) ?? zones.find((z) => normalize(z.name) === target);
  if (!seed) return [];
  return zones.filter((z) => z.name === seed.name).sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
}

/**
 * Find a zone by name. Prefers an exact match, then falls back to a normalized
 * match so a log's "The Feerrott" resolves regardless of case or article. For a
 * multi-layer zone, `layer` picks which map; without one you get the lowest, because
 * the log says where you are but never which floor.
 */
export function findZone(name: string, zones: Zone[], layer?: number): Zone | undefined {
  const exact = zones.find((z) => z.key === name);
  if (exact && layer === undefined) return exact;
  const layers = zoneLayers(name, zones);
  return layers.find((z) => z.layer === layer) ?? layers[0];
}

/**
 * One entry per place: a multi-layer zone collapses to its lowest layer, so the zone
 * picker lists it once and the layer becomes a separate choice. Compose with
 * `sortZones` for display order.
 */
export function collapseLayers(zones: Zone[]): Zone[] {
  const lowest = new Map<string, Zone>();
  for (const z of zones) {
    const seen = lowest.get(z.name);
    if (!seen || (z.layer ?? 0) < (seen.layer ?? 0)) lowest.set(z.name, z);
  }
  return [...lowest.values()];
}

/**
 * Is a marker visible on the layer in view?
 *
 * Two kinds of "no layer", and they mean opposite things. A **marker** without one belongs to
 * the zone rather than a floor — an unlayered zone's pins, and anything inferred from the log,
 * which doesn't report floors — so it shows on every layer. A **view** of `null` is showing
 * every floor at once, so everything shows; `undefined` is a zone with no layers at all.
 */
export function onLayer(marker: { layer?: number }, layer?: number | null): boolean {
  if (layer === null) return true;
  return marker.layer === undefined || marker.layer === layer;
}

/** The layer picker's label for one map of a multi-layer zone. */
export function layerLabel(zone: Zone): string {
  return `Layer ${zone.layer ?? 1}`;
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
