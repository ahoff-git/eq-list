/**
 * Where maps come from, and what a zone in one is called.
 *
 * A **source** is a folder of EverQuest map files — the game's own `<EverQuest>/maps/`, or a pack
 * unzipped into a subfolder of it (Brewall's, Goodurden's, …). Folders are discovered, never
 * hardcoded, so a pack the user installs later just shows up. There is no bundled alternative any
 * more: the app draws the maps the game draws (ADR 0042).
 *
 * Naming is the part the files can't do for themselves. They're named for a zone's **short** name
 * (`gfaydark`, `qey2hh1`) and the log only ever says the long one, so names come from three places
 * in this order: the **curated** list (few, and right), what `solveZoneNames` reads off the maps'
 * own exit labels (most of them), and failing both, the **file's own name** — which is honest and
 * still selectable. Guessing is worse than not knowing: a confidently mislabelled map is how you
 * end up plotting kills in the wrong place.
 */

import { CURATED_ZONES } from "./zones";
import type { Zone } from "./types";

/** A place maps can be loaded from. */
export interface MapSource {
  /** Stable id, persisted as the user's choice: `stock`, or a pack's folder name. */
  id: string;
  label: string;
  /** The folder itself. */
  dir: string;
  /** Zone short names available here (base files, layer suffixes stripped). */
  files: string[];
}

/** What the main process reports about the maps it can see. */
export interface MapSourceReport {
  /** `<EverQuest>/maps`, when we could find it — shown in the UI so a miss is diagnosable. */
  mapsDir?: string;
  sources: MapSource[];
}

/** A short name as a display name, for zones we can't name properly (`gukbottom`). */
export function prettyZoneName(short: string): string {
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * The zones a source offers: one per map file, named as well as we can manage.
 *
 * Names are kept unique. Two files answering to one zone name would be two entries for one place —
 * `tox` and `toxxulia` are the same zone twice — and only one of them would ever be reachable, so
 * the loser keeps its file name and stays in the list.
 */
export function zonesFromFiles(
  sourceId: string,
  files: string[],
  /** Names read off the maps' own exit labels (`solveZoneNames`); the curated list outranks them. */
  solved: Record<string, string> = {},
): Zone[] {
  const available = new Set(files);
  const curated = new Map<string, { name: string; sortingStr?: string }>();
  const taken = new Set<string>();
  for (const zone of CURATED_ZONES) {
    if (!available.has(zone.file) || curated.has(zone.file) || taken.has(zone.name)) continue;
    curated.set(zone.file, zone);
    taken.add(zone.name);
  }

  return files.map((short) => {
    const own = curated.get(short);
    // A curated name was reserved for *this* file above, so it isn't "taken" from itself.
    if (own) return { name: own.name, sortingStr: own.sortingStr, key: `${sourceId}:${short}`, file: short };
    const name = [solved[short], prettyZoneName(short)].find((c) => c && !taken.has(c)) ?? short;
    taken.add(name);
    return { name, key: `${sourceId}:${short}`, file: short };
  });
}
