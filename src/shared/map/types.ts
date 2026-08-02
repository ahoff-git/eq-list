/**
 * Map subsystem types. Ported verbatim from the eq-map project's dependency-free
 * map core (see specs/map/ and ADR 0010). Kept self-contained so the folder stays
 * portable and the pure geometry can be unit-tested without a DOM.
 */

export type MapDimensions = { width: number; height: number };

/** An EverQuest world coordinate. EQ orders these y-first; we keep that. */
export type Loc = { y: number; x: number };

/** A canvas pixel coordinate (origin top-left). */
export type Point = { x: number; y: number };

/** Width/height in pixels of the surface we're drawing onto. */
export type CanvasSize = { width: number; height: number };

/**
 * A zone: its map/legend images plus the calibration (`size`, `centerOffset`)
 * that aligns EQ world coordinates to the image. `mapDims` is filled in at draw
 * time with the scaled on-screen image size; it is not authored by hand.
 */
export type Zone = {
  name: string;
  key: string;
  sortingStr?: string;
  layer?: number;
  mapImg?: string;
  mapKeyImg?: string;
  size?: { width: number; height: number };
  centerOffset?: Loc;
  mapDims?: MapDimensions;
};
