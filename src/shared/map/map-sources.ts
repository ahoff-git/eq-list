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
 *
 * Coverage differs between packs as well, so `zonesFromSources` borrows a zone the chosen pack
 * doesn't have from the game's own maps — one file at a time, never blended
 * ([ADR 0063](../../../specs/decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)).
 *
 * A pack also draws **far more of EverQuest than this server runs** — Brewall's covers all 26
 * expansions — so `zonesFromSources` drops the zones that don't exist here, by the one test the whole
 * app shares (`zoneAvailable`, see [ADR 0065](../../../specs/decisions/0065-a-zone-belongs-to-an-expansion.md)).
 * It fails open: a zone the expansion table has never heard of is kept, because losing a real zone is
 * much worse than offering an unreachable one. `zonesFromFiles` does **not** filter — it answers "what
 * is this folder's zone called", which is a different question, and the naming tests lean on it.
 */

import { CURATED_ZONES } from "./zones";
import type { Zone } from "./types";
import { zoneAvailable } from "../zones/expansions";
import { firstUnclaimed, sameZoneOrMisspelling } from "../zones/spelling";

/**
 * The game's own `maps/` folder — the one source every install has, which is what makes it the
 * backstop a pack's missing zone is borrowed from (`zonesFromSources`).
 */
export const STOCK_SOURCE_ID = "stock";

/**
 * Zones always drawn from the **game's own maps**, whatever pack you've chosen.
 *
 * A pack's map can be worse than the game's for a particular zone — drawn for a different era, or laid
 * out in a way that doesn't match what EQ Legends ships — and no amount of preferring your pack in
 * general fixes one bad file. So this is the exception list, keyed by **map file / zone short name**
 * (`lavastorm`), which is the one name a source is guaranteed to know a zone by.
 *
 * It's a coverage decision like the borrowing below, not a naming one: a zone here is still drawn from
 * exactly one file, and still named by the folder that draws it (ADR 0061). Add a line when a pack's map
 * for a zone turns out to be the wrong one to use.
 */
export const STOCK_ONLY_ZONES: readonly string[] = ["lavastorm"];

/** Is this zone one we always draw from the game's own maps? Matched on the file / short name. */
export function stockOnly(file: string | undefined): boolean {
  return !!file && STOCK_ONLY_ZONES.includes(file.trim().toLowerCase());
}

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
 * Names are kept unique, and **a misspelling doesn't count as a different name**
 * ([ADR 0075](../../../specs/decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)). Two files
 * answering to one zone name would be two entries for one place — `tox` and `toxxulia` are the same
 * zone twice — and only one of them would ever be reachable, so the loser keeps its file name and
 * stays in the list. Uniqueness by exact string alone let that duplicate straight back in whenever a
 * pack's label was a letter out: a curated "Toxxulia Forest" and a solved "Toxulia Forest" are two
 * rows in the picker, one of which draws nothing you were looking for.
 */
export function zonesFromFiles(
  sourceId: string,
  files: string[],
  /** Names read off the maps' own exit labels (`solveZoneNames`); the curated list outranks them. */
  solved: Record<string, string> = {},
): Zone[] {
  const available = new Set(files);
  const curated = new Map<string, { name: string; sortingStr?: string }>();
  /** Names spoken for. An array rather than a Set: claiming is a scan, not a lookup (`firstUnclaimed`). */
  const taken: string[] = [];
  for (const zone of CURATED_ZONES) {
    if (!available.has(zone.file) || curated.has(zone.file)) continue;
    if (taken.some((t) => sameZoneOrMisspelling(t, zone.name))) continue;
    curated.set(zone.file, zone);
    taken.push(zone.name);
  }

  return files.map((short) => {
    const own = curated.get(short);
    // A curated name was reserved for *this* file above, so it isn't "taken" from itself.
    if (own) {
      return { name: own.name, sortingStr: own.sortingStr, key: `${sourceId}:${short}`, file: short, source: sourceId };
    }
    // The file's own name is the backstop, and it can be claimed too — a zone with nothing left to
    // be called keeps its short name, which is honest and still selectable.
    const name = firstUnclaimed([solved[short], prettyZoneName(short)], taken) ?? short;
    taken.push(name);
    return { name, key: `${sourceId}:${short}`, file: short, source: sourceId };
  });
}

/** A source as the zone list needs it: which folder, what's in it, and what that folder calls them. */
export interface NamedSource {
  id: string;
  files: string[];
  /** That pack's own solved names — never another's ([ADR 0061](../../../specs/decisions/0061-a-map-pack-names-its-own-zones.md)). */
  solved?: Record<string, string>;
}

/**
 * The zones on offer: **everything the chosen pack has, plus whatever the backstop can draw of the
 * zones it doesn't.**
 *
 * Packs differ in coverage, not just in detail — the game's own maps ship no Blackburrow or Unrest,
 * and Brewall's pack has no New Sebilis Expedition, which is one of EQ Legends' own zones. On a real
 * install that was 233 kills with no map on one side and 286 on the other, for zones the other folder
 * had all along. So a zone the chosen pack lacks is **borrowed**, one file at a time, and tagged with
 * the source that will draw it.
 *
 * This is coverage, not blending: a zone is still drawn from exactly one file, and a pack still names
 * only its own zones ([ADR 0061](../../../specs/decisions/0061-a-map-pack-names-its-own-zones.md)) —
 * a borrowed zone is named by the folder it came from. The chosen pack always wins where both have
 * something, including on a **name** collision, since two entries for one place would leave one of
 * them unreachable.
 */
export function zonesFromSources(chosen: NamedSource, backstop?: NamedSource): Zone[] {
  const offered = (zones: Zone[]) => zones.filter((z) => zoneAvailable(z.name));
  // With no backstop there's nothing to take from, so even a `STOCK_ONLY_ZONES` entry keeps the pack's
  // map: a zone drawn imperfectly beats a zone not drawn at all.
  if (!backstop || backstop.id === chosen.id) return offered(zonesFromFiles(chosen.id, chosen.files, chosen.solved));

  // The exception list is applied by *withholding* the pack's file, so from here on "this zone comes
  // from the backstop" has one cause and one code path — whether the pack lacked it or was overruled.
  const stockHas = new Set(backstop.files);
  const mine = zonesFromFiles(
    chosen.id,
    chosen.files.filter((short) => !(stockOnly(short) && stockHas.has(short))),
    chosen.solved,
  );

  const have = new Set(mine.map((z) => z.file));
  const fromStock = backstop.files.filter((short) => !have.has(short));
  if (!fromStock.length) return offered(mine);

  // Borrowing is where the duplicate name most often comes from: the two folders label the same
  // place, one of them a letter out, so the pack's zone and the borrowed one both make the list. A
  // misspelling is the same claim as the name itself (ADR 0075), so the borrowed row loses.
  const names = mine.map((z) => z.name);
  return offered([
    ...mine,
    ...zonesFromFiles(backstop.id, fromStock, backstop.solved).filter(
      (z) => !names.some((n) => sameZoneOrMisspelling(n, z.name)),
    ),
  ]);
}
