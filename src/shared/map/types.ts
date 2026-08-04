/**
 * Map subsystem types. Ported from the eq-map project's dependency-free map core
 * (see specs/map/ and ADR 0010). Kept self-contained so the folder stays portable and
 * the pure geometry can be unit-tested without a DOM.
 */

export type MapDimensions = { width: number; height: number };

/** An EverQuest world coordinate. EQ orders these y-first; we keep that. */
export type Loc = { y: number; x: number };

/** A canvas pixel coordinate (origin top-left). */
export type Point = { x: number; y: number };

/** Width/height in pixels of the surface we're drawing onto. */
export type CanvasSize = { width: number; height: number };

/**
 * Where a map lands on the canvas: fitted to it, aspect preserved and centred, so a map that
 * isn't square is letterboxed. Both the drawing and the coordinate math work from this same
 * rectangle (`fitRect`) — otherwise the dot and the picture disagree.
 */
export type MapRect = { x: number; y: number; width: number; height: number };

/** A map of a known pixel size, drawn onto a canvas of a known pixel size. */
export type MapView = { image: MapDimensions; canvas: MapDimensions };

/**
 * What it takes to turn a world coordinate into a pixel: how big the map is in EQ units, and
 * where it sits in the world.
 *
 * Never authored. A map file's geometry is already in world coordinates, so it states its own
 * projection (`vectorProjection` reads it off the geometry's bounds) — which is the whole reason
 * the bundled scans and their hand-tuned calibration are gone (ADR 0042).
 */
export type MapProjection = {
  /** EQ world units per map pixel. */
  scale: number;
  /** The EQ coordinate at the centre of the map. */
  center: Loc;
};

/** A zone the map window can show: a name, and the map file it's drawn from. */
export type Zone = {
  name: string;
  /** Unique per source + file, e.g. `brewall:gfaydark`. */
  key: string;
  /** Groups related zones in a sorted list ("Neriak", "Faydark"). */
  sortingStr?: string;
  /** The zone short name of the map file behind it (`gfaydark`). */
  file?: string;
};
