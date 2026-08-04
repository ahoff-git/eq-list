"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { usePersistentState } from "@/lib/usePersistentState";
import { baseZones, sortZones } from "@/shared/map/zones";
import { IMAGE_SOURCE, zonesFromFiles, type MapSource } from "@/shared/map/map-sources";
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
  const [sources, setSources] = useState<MapSource[]>([{ id: IMAGE_SOURCE, label: "Bundled images", files: [] }]);
  const [mapsDir, setMapsDir] = useState<string | undefined>();
  const [chosen, setChosen] = usePersistentState<string>(STORAGE_KEYS.mapSource, IMAGE_SOURCE);

  useEffect(() => {
    void api()
      ?.map.sources()
      .then((report) => {
        setSources(report.sources);
        setMapsDir(report.mapsDir);
      });
  }, []);

  // A remembered source that isn't there any more resolves to the images rather than an
  // empty map window.
  const sourceId = sources.some((s) => s.id === chosen) ? chosen : IMAGE_SOURCE;
  const source = sources.find((s) => s.id === sourceId);

  const zones = useMemo(() => {
    if (!source || source.id === IMAGE_SOURCE) return sortZones(baseZones.filter((z) => z.mapImg));
    return sortZones(zonesFromFiles(source.id, source.files, baseZones));
  }, [source]);

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
