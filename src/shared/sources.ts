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

/**
 * Non-drop sources (vendor / quest / recipe / forage / ground), deduped by
 * kind+where, order preserved. Drops are shown zone-grouped separately; these are
 * the "also available from" lines the list expansion colors by kind (so a vendor
 * reads clearly as "don't kill this").
 */
export function otherSources(sources: ItemSource[]): ItemSource[] {
  const seen = new Set<string>();
  const out: ItemSource[] = [];
  for (const s of sources) {
    if (s.kind === "drop") continue;
    const key = `${s.kind}|${s.where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Distinct zones an item is obtainable in (from any source's `detail`). */
export function sourceZones(sources: ItemSource[]): string[] {
  const zones: string[] = [];
  for (const s of sources) {
    const z = s.detail?.trim();
    if (z && !zones.some((existing) => existing.toLowerCase() === z.toLowerCase())) zones.push(z);
  }
  return zones;
}

/** Whether any of an item's sources place it in `zone` (loose zone match). */
export function isObtainableIn(sources: ItemSource[], zone: string): boolean {
  return sources.some((s) => !!s.detail && zoneMatches(zone, s.detail));
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
