/**
 * sources.ts — shape a wiki page's `sources` for display. Currently: group the
 * "drop" sources by zone so the overlay can answer "who drops this, and where?".
 * Pure + testable.
 */
import type { ItemSource } from "./types";

export interface ZoneDrops {
  zone: string;
  mobs: string[];
}

/** Drop sources grouped by zone (mobs deduped, zone order preserved). */
export function groupDropsByZone(sources: ItemSource[]): ZoneDrops[] {
  const byZone = new Map<string, string[]>();
  for (const s of sources) {
    if (s.kind !== "drop") continue;
    const zone = s.detail?.trim() || "Unknown zone";
    const mobs = byZone.get(zone) ?? [];
    if (s.where && !mobs.includes(s.where)) mobs.push(s.where);
    byZone.set(zone, mobs);
  }
  return [...byZone.entries()].map(([zone, mobs]) => ({ zone, mobs }));
}

/** Distinct non-drop source kinds present (e.g. ["vendor","quest"]), for a hint. */
export function otherSourceKinds(sources: ItemSource[]): string[] {
  const kinds: string[] = [];
  for (const s of sources) {
    if (s.kind !== "drop" && !kinds.includes(s.kind)) kinds.push(s.kind);
  }
  return kinds;
}

function normalizeZone(z: string): string {
  return z.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Whether a drop's zone is the zone the player is in. Log zone names and wiki
 * zone titles vary ("Everfrost Peaks" vs "Everfrost"), so match loosely: equal,
 * or one contained in the other after normalizing.
 */
export function zoneMatches(current: string, dropZone: string): boolean {
  const a = normalizeZone(current);
  const b = normalizeZone(dropZone);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Split zone-grouped drops into the current zone ("here") and the rest
 * ("elsewhere"), so the overlay can highlight where you are and collapse the
 * others. With no current zone, everything is "elsewhere" (shown normally).
 */
export function splitDropsByCurrentZone(
  drops: ZoneDrops[],
  current: string | null,
): { here: ZoneDrops[]; elsewhere: ZoneDrops[] } {
  if (!current) return { here: [], elsewhere: drops };
  const here: ZoneDrops[] = [];
  const elsewhere: ZoneDrops[] = [];
  for (const d of drops) (zoneMatches(current, d.zone) ? here : elsewhere).push(d);
  return { here, elsewhere };
}
