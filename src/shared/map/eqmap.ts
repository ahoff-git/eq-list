/**
 * The EverQuest map file format — the text maps the game itself draws, shipped in
 * `<EverQuest>/maps/` and by packs like Brewall's. Pure and DOM-free, so it's unit-tested
 * and usable from both the main process (reading files) and the renderer (drawing).
 *
 * Two line kinds, comma-separated:
 *
 *     L x1, y1, z1, x2, y2, z2, R, G, B          a line segment
 *     P x, y, z, R, G, B, size, label            a labelled point of interest
 *
 * **The coordinates are world coordinates with x and y negated** relative to what `/loc`
 * reports — the same negation the canvas maths already applies (see coords.ts). That is the
 * whole reason these maps need no calibration: unlike a scanned image, the file already knows where
 * it is in the world. Verified against every zone we once had hand-tuned calibration for — see
 * [ADR 0039](../../../specs/decisions/0039-render-the-game-s-own-maps.md), and
 * [ADR 0042](../../../specs/decisions/0042-only-the-game-s-own-maps.md) for the scans' removal.
 */

import type { Loc, MapDimensions } from "./types";

/**
 * The two line kinds' field counts, from the format above.
 *
 * `fields` is how many comma-separated numbers a line carries before anything else (a `P`'s label
 * follows, and may itself contain commas); `coords` is how many of those *must* parse for the line to
 * mean anything — the colour channels can be junk and the line is still a line where it says it is,
 * but a NaN coordinate would place it nowhere. Written out as bare 9/6/7/3 they were four numbers in
 * two conditions with nothing saying which was which.
 */
const SEGMENT = { fields: 9, coords: 6 } as const;
const POINT = { fields: 7, coords: 3 } as const;

/** A line of map geometry, in EQ `/loc` space. */
export interface MapSegment {
  y1: number;
  x1: number;
  z1: number;
  y2: number;
  x2: number;
  z2: number;
  /** `rgb(...)`, or absent for the map's default line color (the file said pure black). */
  color?: string;
}

/** A labelled point of interest — a zone exit, a camp, an NPC, a quest marker. */
export interface MapPoi {
  y: number;
  x: number;
  z: number;
  label: string;
  color?: string;
  /** The file's marker size (1–3 in practice); drawing may or may not honour it. */
  size: number;
}

export interface EqMap {
  segments: MapSegment[];
  pois: MapPoi[];
}

/** The world box a map covers. */
export interface MapBounds {
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Pure black means "no color given" in practice — most geometry is authored as `0,0,0` and
 * the game draws it in its own default. Left undefined so the renderer picks something
 * visible against *its* background rather than a black line on a black panel.
 */
function color(r: number, g: number, b: number): string | undefined {
  if (r === 0 && g === 0 && b === 0) return undefined;
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** Negate, keeping zero positive — `-0` is a real number in JS and reads badly everywhere. */
function neg(n: number): number {
  return n === 0 ? 0 : -n;
}

/** File coordinate → EQ `/loc` coordinate: x and y are negated, z is as-is. */
function toLoc(x: number, y: number): { y: number; x: number } {
  return { y: neg(y), x: neg(x) };
}

/**
 * Parse one map file. Unparseable lines are skipped rather than thrown on: these are
 * hand-authored community files and a stray line shouldn't cost you the whole zone.
 */
export function parseEqMap(text: string): EqMap {
  const segments: MapSegment[] = [];
  const pois: MapPoi[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 2) continue;
    const kind = line[0];
    if (kind !== "L" && kind !== "P") continue;
    const fields = line.slice(1).split(",");

    if (kind === "L") {
      const n = fields.slice(0, SEGMENT.fields).map(Number);
      if (n.length < SEGMENT.fields || n.slice(0, SEGMENT.coords).some((v) => !Number.isFinite(v))) continue;
      const a = toLoc(n[0], n[1]);
      const b = toLoc(n[3], n[4]);
      segments.push({ y1: a.y, x1: a.x, z1: n[2], y2: b.y, x2: b.x, z2: n[5], color: color(n[6], n[7], n[8]) });
    } else {
      const n = fields.slice(0, POINT.fields).map(Number);
      if (n.length < POINT.fields || n.slice(0, POINT.coords).some((v) => !Number.isFinite(v))) continue;
      const at = toLoc(n[0], n[1]);
      // Labels use underscores for spaces, and a label may itself contain commas.
      const label = fields.slice(POINT.fields).join(",").trim().replace(/_/g, " ");
      if (!label) continue;
      pois.push({ y: at.y, x: at.x, z: n[2], label, color: color(n[3], n[4], n[5]), size: n[6] || 1 });
    }
  }

  return { segments, pois };
}

/** Merge parsed layers into one map (base geometry + the POI layer). */
export function mergeEqMaps(maps: EqMap[]): EqMap {
  return { segments: maps.flatMap((m) => m.segments), pois: maps.flatMap((m) => m.pois) };
}

/**
 * The world box the map covers. Taken from geometry where there is any — a POI can sit
 * outside the drawn lines, and letting one drag the view out serves nobody. `undefined`
 * for an empty map.
 */
export function mapBounds(map: EqMap): MapBounds | undefined {
  const ys: number[] = [];
  const xs: number[] = [];
  const zs: number[] = [];
  if (map.segments.length) {
    for (const s of map.segments) {
      ys.push(s.y1, s.y2);
      xs.push(s.x1, s.x2);
      zs.push(s.z1, s.z2);
    }
  } else {
    for (const p of map.pois) {
      ys.push(p.y);
      xs.push(p.x);
      zs.push(p.z);
    }
  }
  if (!ys.length) return undefined;
  return {
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** One level of a multi-storey zone, as the map's own author labelled it. */
export interface MapFloor {
  /** 1-based, highest first — the order the picker lists them in. */
  layer: number;
  /** The mapmaker's words ("Level 3", "2nd Floor"), not ours. */
  label: string;
  /** Where the label sits, and the band of heights this floor owns. */
  z: number;
  minZ: number;
  maxZ: number;
}

/**
 * A label that is *only* a floor designation. Anchored on purpose: "Level 2" and "1st Floor"
 * name a storey, while "Water - LVL 3", "Bridge - LVL 2" and "TRAP: Fake Floor" merely mention
 * one — they're features standing on it, and treating them as storeys would invent floors.
 */
const FLOOR_LABEL = [/^(?:level|lvl)\s*(\d+)\s*(?:\(.*\))?$/i, /^(\d+)(?:st|nd|rd|th)\s+floor\s*(?:\(.*\))?$/i];

/** Is this label purely a floor designation ("Level 2", "3rd Floor")? */
export function isFloorLabel(label: string): boolean {
  return FLOOR_LABEL.some((re) => re.test(label.trim()));
}

/**
 * How far apart two floor labels must sit in height to be describing separate storeys.
 * Some maps draw a tower's floors *side by side* at one height instead of stacking them —
 * Kurn's Tower labels all eight at z=1 — and there height tells you nothing, so those maps
 * are better drawn whole.
 */
const MIN_FLOOR_GAP = 5;

/**
 * The floors a map declares, highest first — read from the mapmaker's own labels rather than
 * guessed from the geometry. Clustering heights was the obvious approach and it's a trap:
 * Greater Faydark's terrain and Kelethin's platforms make a convincingly multi-modal
 * histogram, so a zone with one floor would sprout several. A map that doesn't name its
 * levels gets no floors, which is the honest answer.
 *
 * Each floor owns the heights nearer its label than its neighbour's; the outermost reach out
 * to infinity, so no geometry belongs to nothing.
 */
export function detectFloors(map: EqMap): MapFloor[] {
  const byLevel = new Map<string, { zs: number[]; label: string }>();
  for (const poi of map.pois) {
    for (const pattern of FLOOR_LABEL) {
      const m = pattern.exec(poi.label);
      if (!m) continue;
      // Several markers can name one level ("LVL 2" dotted around it); average their heights.
      const key = m[1];
      const seen = byLevel.get(key);
      if (seen) seen.zs.push(poi.z);
      else byLevel.set(key, { zs: [poi.z], label: poi.label });
      break;
    }
  }
  if (byLevel.size < 2) return [];

  const anchors = [...byLevel.values()]
    .map(({ zs, label }) => ({ label, z: zs.reduce((a, b) => a + b, 0) / zs.length }))
    // By height, not by the number in the label: a dungeon counts "Level 1" downward from the
    // top while a keep counts "1st Floor" up from the bottom, and both must read top-down.
    .sort((a, b) => b.z - a.z);

  // If the labels aren't separated in height they aren't stacked storeys, whatever they say.
  if (anchors.some((a, i) => i > 0 && anchors[i - 1].z - a.z < MIN_FLOOR_GAP)) return [];

  return anchors.map((a, i) => {
    const above = anchors[i - 1];
    const below = anchors[i + 1];
    return {
      layer: i + 1,
      label: a.label,
      z: a.z,
      minZ: below ? (a.z + below.z) / 2 : -Infinity,
      maxZ: above ? (a.z + above.z) / 2 : Infinity,
    };
  });
}

/** The floor a height belongs to (your `/loc` z, say). */
export function floorAt(floors: MapFloor[], z: number): MapFloor | undefined {
  return floors.find((f) => z >= f.minZ && z < f.maxZ);
}

/**
 * A band of heights to draw. A `MapFloor` is one (it carries the same two fields), and so is a
 * height window set by hand on a map whose author never labelled a storey — which is the whole
 * reason this is its own shape rather than "a floor": the filter cares about heights, and only
 * *some* of the heights it's given have a name.
 */
export interface ZBand {
  minZ: number;
  maxZ: number;
}

/**
 * Is this height inside any of the bands? **No bands means no filter** — every band being on and
 * there being nothing to filter by are the same picture (the whole map, as the game draws it), so
 * they're the same answer rather than two states to keep straight.
 *
 * The lower edge is inclusive and the upper exclusive, so adjacent bands tile without overlapping;
 * `detectFloors` reaches the outermost two out to infinity for the same reason.
 */
export function inBands(z: number, bands?: ZBand[]): boolean {
  if (!bands?.length) return true;
  return bands.some((b) => z >= b.minZ && z < b.maxZ);
}

/** Is any part of this segment in the bands? A stair spans two floors, and shows on both. */
export function segmentInBands(seg: MapSegment, bands?: ZBand[]): boolean {
  if (!bands?.length) return true;
  return inBands(seg.z1, bands) || inBands(seg.z2, bands);
}

/**
 * The height span a map's geometry covers — what a hand-set height window is chosen *within*, so
 * the control offers the heights this zone actually has rather than an arbitrary scale.
 */
export function mapZRange(map: EqMap): ZBand | undefined {
  const bounds = mapBounds(map);
  return bounds ? { minZ: bounds.minZ, maxZ: bounds.maxZ } : undefined;
}

/** How much empty world to leave around the geometry, as a fraction of its span. */
const VIEW_PAD = 0.03;

/**
 * A vector map's own calibration. It has no image, so it stands in as one: a synthetic
 * "image" the size of the world box (1 pixel per EQ unit, hence `scale: 1`) centred on that
 * box. Feed those to `fitRect`/`eqToCanvasCoords` and every existing marker, zoom and pan
 * path works unchanged — a vector map is just a zone that calibrates itself.
 */
export function vectorProjection(bounds: MapBounds): { scale: number; center: Loc; image: MapDimensions } {
  const spanX = Math.max(1, bounds.maxX - bounds.minX) * (1 + VIEW_PAD);
  const spanY = Math.max(1, bounds.maxY - bounds.minY) * (1 + VIEW_PAD);
  return {
    scale: 1,
    center: { y: (bounds.minY + bounds.maxY) / 2, x: (bounds.minX + bounds.maxX) / 2 },
    image: { width: spanX, height: spanY },
  };
}
