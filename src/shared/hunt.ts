/**
 * hunt.ts — invert "where does each item drop" into "what should I go kill".
 *
 * Given the still-needed shopping-list items and each one's drop sources (from its
 * wiki page's "Drops From"), build a hunt list grouped by zone → mob → the needed
 * items that mob drops. Pure + testable; the Hunt tab renders the result and the
 * overlay's current zone can float to the top.
 */
import type { ItemSource, ShoppingListEntry } from "./types";
import { effectiveNeeded, originKey } from "./grouping";

export interface HuntItemRef {
  item: string;
  needed: number;
  obtained: number;
}
export interface HuntMob {
  mob: string;
  items: HuntItemRef[];
}
export interface HuntZone {
  zone: string;
  mobs: HuntMob[];
}

export interface HuntInput {
  name: string;
  needed: number;
  obtained: number;
  sources: ItemSource[];
}

function itemCount(zone: HuntZone): number {
  return zone.mobs.reduce((n, m) => n + m.items.length, 0);
}

/** Runs configured for an entry's group (1 for standalone "Other" items). */
function runsForEntry(entry: ShoppingListEntry, questRuns: Record<string, number>): number {
  return entry.origin ? Math.max(1, questRuns[originKey(entry.origin)] ?? 1) : 1;
}

/** The list entries you don't yet have enough of (runs-aware). */
export function neededEntries(
  entries: ShoppingListEntry[],
  questRuns: Record<string, number>,
): ShoppingListEntry[] {
  return entries.filter((e) => e.obtained < effectiveNeeded(e, runsForEntry(e, questRuns)));
}

/** Build `buildHunt` inputs from list entries + their fetched sources (runs-aware). */
export function huntInputsFor(
  entries: ShoppingListEntry[],
  sources: Record<string, ItemSource[]>,
  questRuns: Record<string, number>,
): HuntInput[] {
  return entries.map((e) => ({
    name: e.name,
    needed: effectiveNeeded(e, runsForEntry(e, questRuns)),
    obtained: e.obtained,
    sources: sources[e.name] ?? [],
  }));
}

/** Group needed items by the zone + mob that drop them. */
export function buildHunt(items: HuntInput[]): HuntZone[] {
  const byZone = new Map<string, Map<string, HuntMob>>();
  for (const it of items) {
    for (const s of it.sources) {
      if (s.kind !== "drop") continue;
      const zone = s.detail?.trim() || "Unknown zone";
      const mob = s.where?.trim();
      if (!mob) continue;
      let mobs = byZone.get(zone);
      if (!mobs) byZone.set(zone, (mobs = new Map()));
      let hm = mobs.get(mob);
      if (!hm) mobs.set(mob, (hm = { mob, items: [] }));
      if (!hm.items.some((r) => r.item === it.name)) {
        hm.items.push({ item: it.name, needed: it.needed, obtained: it.obtained });
      }
    }
  }

  const zones: HuntZone[] = [...byZone.entries()].map(([zone, mobs]) => ({
    zone,
    // Mobs that drop the most of what you need come first.
    mobs: [...mobs.values()].sort((a, b) => b.items.length - a.items.length || a.mob.localeCompare(b.mob)),
  }));
  // Zones with the most useful drops first.
  zones.sort((a, b) => itemCount(b) - itemCount(a) || a.zone.localeCompare(b.zone));
  return zones;
}
