"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { usePersistentState } from "@/lib/usePersistentState";
import { sortZones } from "@/shared/map/zones";
import { zonesFromFiles, type MapSource } from "@/shared/map/map-sources";
import type { LoadedMap } from "@/shared/types";
import type { Zone } from "@/shared/map/types";

/**
 * Which set of maps we're drawing, and the zones it offers.
 *
 * A source is the bundled images or a folder of the game's own map files (see
 * `electron/eq-maps.ts`). Either way it yields a `Zone[]`, so the rest of the map window —
 * the picker, `findZone`, pins, kills, layers — carries on working against one shape.
 * The choice persists, and falls back to the images when a remembered source is gone (a pack
 * uninstalled, or the app opened without the game around).
 */
export function useMapSource(): {
  sources: MapSource[];
  sourceId: string;
  setSourceId: (id: string) => void;
  /** `<EverQuest>/maps`, when we found it — for explaining a short source list. */
  mapsDir?: string;
  /** The zones this source can show. */
  zones: Zone[];
} {
  const [sources, setSources] = useState<MapSource[]>([]);
  const [mapsDir, setMapsDir] = useState<string | undefined>();
  /**
   * Zone names read out of the maps' own exit labels. Asked for separately because it reads every
   * file in the folder (~1s for 568 of them), so the picker is usable by file name straight away
   * and relabels itself when the real names land.
   */
  const [solved, setSolved] = useState<Record<string, string>>({});
  const [chosen, setChosen] = usePersistentState<string>(STORAGE_KEYS.mapSource, "");

  useEffect(() => {
    void api()
      ?.map.sources()
      .then((report) => {
        setSources(report.sources);
        setMapsDir(report.mapsDir);
      });
    void api()?.map.names().then(setSolved);
  }, []);

  // A remembered source that isn't there any more (a pack uninstalled) falls back to whichever
  // folder we did find, rather than an empty window.
  const sourceId = sources.some((s) => s.id === chosen) ? chosen : (sources[0]?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);

  const zones = useMemo(
    () => (source ? sortZones(zonesFromFiles(source.id, source.files, solved)) : []),
    [source, solved],
  );

  return { sources, sourceId, setSourceId: setChosen, mapsDir, zones };
}

/**
 * The geometry for a file-backed zone, loaded through the main process. Null while loading,
 * and for image zones (which have nothing to load).
 */
export function useVectorMap(sourceId: string, zone: Zone | undefined): LoadedMap | null {
  const [map, setMap] = useState<LoadedMap | null>(null);
  const file = zone?.file;

  useEffect(() => {
    setMap(null);
    if (!file) return;
    let cancelled = false;
    void api()
      ?.map.load(sourceId, file)
      .then((loaded) => {
        if (!cancelled) setMap(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, file]);

  return map;
}
