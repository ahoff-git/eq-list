"use client";
import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { detectFloors, floorAt, followHeightWindow, mapZRange, type EqMap, type MapFloor, type ZBand } from "@/shared/map/eqmap";
import type { HeightPick } from "@/app/components/MapFilters";
import type { LocEvent } from "@/shared/types";

/**
 * The follow window's default half-width, in raw `/loc` z — a guess at "one storey", good enough
 * to start from and always adjustable. There's no zone-wide figure to derive it from: `zRange` is
 * the whole span, not a floor's share of it, and a map with no labelled storeys is exactly the case
 * this feature is for.
 */
const DEFAULT_HEIGHT_FOLLOW_RANGE = 30;

/** Everything about "which storeys am I looking at" — asked in six places by the map window. */
export interface Floors {
  /** Storeys the map's author labelled. Empty for a map that names none. */
  floors: MapFloor[];
  /** The layers actually drawn — the valid picks, or all of them. */
  shownLayers: number[];
  /** Replace the picks (the filter panel's own toggling decides the next set). */
  setLayers: (layers: number[]) => void;
  /** The floor you're standing on, from your `/loc` height — marked in the picker. */
  yourFloor: MapFloor | undefined;
  /** The height span this map covers, which is the scale a hand-set window is chosen within. */
  zRange: ZBand | undefined;
  /** The hand-set window, if one was set for the zone in view. */
  height: HeightPick | null;
  /** Set or clear it. The zone it belongs to is remembered here, not by the caller. */
  setHeight: (pick: HeightPick | null) => void;
  /** Whether the window instead follows your own `/loc` height as you move. Off by default. */
  heightFollow: boolean;
  setHeightFollow: (on: boolean) => void;
  /** The ± half-width of the followed window, in raw `/loc` z. */
  heightFollowRange: number;
  setHeightFollowRange: (range: number) => void;
  /** The heights to draw, and the heights a label must sit in to be drawn. Undefined is all of them. */
  bands: ZBand[] | undefined;
  /** The floor a pin or ping made now belongs to — only when exactly one is in view. */
  viewLayer: number | undefined;
  /** The floors markers are filtered to. Undefined filters nothing out. */
  viewLayers: Set<number> | undefined;
}

/**
 * The map window's floor logic, in one place.
 *
 * A map file holds every storey at once — that's what the game draws — so isolating one is a filter
 * over **height**, and there are two ways to express it: the floors an author *labelled*, or a
 * hand-set window for a map that labels none. A dozen values fall out of that choice (what's drawn,
 * what markers are filtered to, which floor a new pin belongs to, what the picker highlights), and
 * they all have to agree — a pin dropped while two floors are visible must claim neither.
 *
 * Lifted out of `MapWindow` because it was sixty lines of interdependent `useMemo`s in a page that also
 * owns pins, peers, kills and a canvas, and because these values only mean anything together. The
 * hand-set window itself is deliberately **not** persisted and is dropped when you leave the zone: a z
 * of 40 is a treetop in one zone and a sewer in the next. Whether it *follows* your own height, and by
 * how much, is a standing preference instead — a habit of how you read maps, not a fact about one zone
 * — so those two live in `usePersistentState` rather than beside it.
 *
 * `zoneName` is the **resolved** name of the zone in view (`mapZoneName`), not the log's wording. A
 * height window belongs to the *map*, and one map draws the zone at every difficulty — keyed on the
 * raw name, walking back into the same camp at difficulty 3 threw the window away and re-fitted the
 * view ([ADR 0134](../../../specs/decisions/0134-a-map-reference-resolves-to-a-place.md)).
 */
export function useFloors(vector: EqMap | null, loc: LocEvent | null, zoneName: string): Floors {
  // Persisted like the zone override, and validated below rather than reset by an effect.
  const [layerPicks, setLayerPicks] = usePersistentState<number[]>(STORAGE_KEYS.mapLayers, []);
  const [heightPick, setHeightPick] = useState<{ zone: string; lo: number; hi: number } | null>(null);
  const [heightFollow, setHeightFollow] = usePersistentState<boolean>(STORAGE_KEYS.mapHeightFollow, false);
  const [heightFollowRange, setHeightFollowRange] = usePersistentState<number>(
    STORAGE_KEYS.mapHeightFollowRange,
    DEFAULT_HEIGHT_FOLLOW_RANGE,
  );

  const floors = useMemo(() => (vector ? detectFloors(vector) : []), [vector]);

  // A floor pick belongs to the map it was made on, so travelling somewhere without those storeys
  // falls back to showing all of them — which is also what an empty pick means, since hiding every
  // floor would just blank the map.
  const shownLayers = useMemo(() => {
    const valid = layerPicks.filter((l) => floors.some((f) => f.layer === l));
    return valid.length ? valid : floors.map((f) => f.layer);
  }, [layerPicks, floors]);

  const zRange = useMemo(() => (vector ? mapZRange(vector) : undefined), [vector]);
  const height: HeightPick | null = heightPick && heightPick.zone === zoneName ? heightPick : null;

  // Re-centres the hand-set window on your own height as you move, in place of dragging it
  // yourself. Only offered where the window itself is (no labelled floors, ADR 0040 leaves those
  // to the mapmaker) — this never invents a floor, it just keeps the same manual span following you,
  // widened by `followHeightWindow` when the ground nearby needs more room than the guess allows
  // (a slope's far edge, say). Keyed on `loc.x`/`loc.y`/`loc.z` rather than `loc`: a fresh `/loc` at
  // the same position is not a reason to write a new window, and the object arrives with a new
  // identity on every line parsed.
  useEffect(() => {
    if (!heightFollow || loc == null || !zoneName || floors.length > 1 || !vector) return;
    const { minZ, maxZ } = followHeightWindow(vector, loc, heightFollowRange);
    setHeightPick({ zone: zoneName, lo: minZ, hi: maxZ });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above the effect
  }, [heightFollow, loc?.x, loc?.y, loc?.z, heightFollowRange, zoneName, floors.length, vector]);

  const bands = useMemo<ZBand[] | undefined>(() => {
    if (floors.length > 1) {
      if (shownLayers.length === floors.length) return undefined;
      return floors.filter((f) => shownLayers.includes(f.layer)).map(({ minZ, maxZ }) => ({ minZ, maxZ }));
    }
    if (!height || !zRange) return undefined;
    // The outermost edges open out to infinity, so a handle at the end of its scale can't clip the top
    // or bottom of the map by a rounding unit — the same reason `detectFloors` does it.
    return [
      {
        minZ: height.lo <= zRange.minZ ? -Infinity : height.lo,
        maxZ: height.hi >= zRange.maxZ ? Infinity : height.hi,
      },
    ];
  }, [floors, shownLayers, height, zRange]);

  const viewLayers = useMemo(
    () => (floors.length > 1 && shownLayers.length < floors.length ? new Set(shownLayers) : undefined),
    [floors.length, shownLayers],
  );

  return {
    floors,
    shownLayers,
    setLayers: setLayerPicks,
    yourFloor: loc ? floorAt(floors, loc.z) : undefined,
    zRange,
    height,
    // A hand-set window is a decision to stop following: without this, the next `/loc` line would
    // silently overwrite whatever the drag or the "all" button just chose.
    setHeight: (pick) => {
      setHeightFollow(false);
      setHeightPick(pick && zoneName ? { zone: zoneName, ...pick } : null);
    },
    heightFollow,
    setHeightFollow,
    heightFollowRange,
    setHeightFollowRange,
    bands,
    // With more than one storey on screen there's no single one to claim, so a pin made now belongs to
    // the zone rather than to a floor.
    viewLayer: floors.length > 1 && shownLayers.length === 1 ? shownLayers[0] : undefined,
    viewLayers,
  };
}
