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
 * Where a map image actually lands on the canvas: fitted to it, aspect preserved and
 * centred, so a non-square map is letterboxed. Both the drawing and the coordinate math
 * work from this same rectangle (`fitRect`) — otherwise the dot and the picture disagree.
 */
export type MapRect = { x: number; y: number; width: number; height: number };

/** A map image of a known pixel size, drawn onto a canvas of a known pixel size. */
export type MapView = { image: MapDimensions; canvas: CanvasSize };

/**
 * A zone: its map/legend images plus the two numbers that align EQ world coordinates to
 * the image. Nothing here describes the image's pixel dimensions — those are read off the
 * image itself at draw time, so they can't be authored wrongly (see ADR 0038).
 */
export type Zone = {
  name: string;
  key: string;
  sortingStr?: string;
  /**
   * Which map of a multi-map zone this is (RunnyEye's four floors). Zones that are the
   * same place share a `name` and differ by `layer` + `key`; a zone with a single map
   * leaves it unset. The log never says which floor you're on, so the layer is a
   * user choice — see `zoneLayers`/`findZone` in `zones.ts`.
   */
  layer?: number;
  mapImg?: string;
  mapKeyImg?: string;
  /**
   * Zone short name of the map *file* backing this zone, for a folder source (`gfaydark`).
   * A file-backed zone needs no `scale`/`center`: the geometry is already in world
   * coordinates, so it calibrates itself (see `vectorProjection`).
   */
  file?: string;
  /**
   * The map's scale: **EQ world units per image pixel**. Independent of the window size
   * and of how the image is fitted, so it's a property of the map rather than of the view.
   */
  scale?: number;
  /** The EQ coordinate at the **centre of the image** — where the map is, in world terms. */
  center?: Loc;
};
