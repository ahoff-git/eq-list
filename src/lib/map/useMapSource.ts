"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { usePersistentState } from "@/lib/usePersistentState";
import { sortZones } from "@/shared/map/zones";
import { STOCK_SOURCE_ID, zonesFromSources, type MapSource } from "@/shared/map/map-sources";
import type { LoadedMap } from "@/shared/types";
import type { Zone } from "@/shared/map/types";

/**
 * Which set of maps we're drawing, and the zones it offers.
 *
 * A source is a folder of the game's own map files (see `electron/eq-maps.ts`), and it yields a
 * `Zone[]`, so the rest of the map window — the picker, `findZone`, pins, kills, layers — carries on
 * working against one shape. The choice persists, and falls back to whichever folder we did find
 * when a remembered one is gone (a pack uninstalled, or the app opened without the game around).
 *
 * A zone the chosen pack has no file for is **borrowed from the game's own maps**, which every
 * install has ([ADR 0063](../../../specs/decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)). That
 * needs both folders' names, since a pack names only its own zones
 * ([ADR 0061](../../../specs/decisions/0061-a-map-pack-names-its-own-zones.md)).
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
   * Zone names read out of **this source's** own exit labels. Asked for separately because it reads
   * every file in the folder (~1s for 568 of them), so the picker is usable by file name straight
   * away and relabels itself when the real names land.
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
  }, []);

  // A remembered source that isn't there any more (a pack uninstalled) falls back to whichever
  // folder we did find, rather than an empty window.
  const sourceId = sources.some((s) => s.id === chosen) ? chosen : (sources[0]?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);

  /** The game's own maps, the folder every install has — what a zone the pack lacks is borrowed from. */
  const backstop = sources.find((s) => s.id === STOCK_SOURCE_ID);
  const [borrowedNames, setBorrowedNames] = useState<Record<string, string>>({});

  // Names belong to the pack, so they're re-read when you switch packs — and cleared first, because
  // the last pack's names on this pack's files is exactly the mixing this avoids (ADR 0061). The
  // backstop's are fetched under its own id for the same reason: a borrowed zone is named by the
  // folder it came from, not by the pack that couldn't draw it.
  useEffect(() => {
    setSolved({});
    if (!sourceId) return;
    let cancelled = false;
    void api()
      ?.map.names(sourceId)
      .then((names) => {
        if (!cancelled) setSolved(names);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  useEffect(() => {
    setBorrowedNames({});
    if (!backstop || backstop.id === sourceId) return;
    let cancelled = false;
    void api()
      ?.map.names(backstop.id)
      .then((names) => {
        if (!cancelled) setBorrowedNames(names);
      });
    return () => {
      cancelled = true;
    };
  }, [backstop, sourceId]);

  const zones = useMemo(
    () =>
      source
        ? sortZones(
            zonesFromSources(
              { id: source.id, files: source.files, solved },
              backstop && { id: backstop.id, files: backstop.files, solved: borrowedNames },
            ),
          )
        : [],
    [source, solved, backstop, borrowedNames],
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
  // **The zone's own source**, not the chosen one: a borrowed zone lives in the game's maps folder,
  // and asking the pack for a file it hasn't got is how it would come back empty (ADR 0063).
  const from = zone?.source ?? sourceId;

  useEffect(() => {
    setMap(null);
    if (!file) return;
    let cancelled = false;
    void api()
      ?.map.load(from, file)
      .then((loaded) => {
        if (!cancelled) setMap(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [from, file]);

  return map;
}
