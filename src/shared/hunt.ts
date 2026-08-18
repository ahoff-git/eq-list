/**
 * hunt.ts — invert "where does each item drop" into "what should I go kill".
 *
 * Given the still-needed shopping-list items and each one's drop sources (from its
 * wiki page's "Drops From"), build a hunt list grouped by zone → mob → the needed
 * items that mob drops. Pure + testable; the Hunt tab renders the result and the
 * overlay's current zone can float to the top.
 */
import type { ItemSource, ShoppingListEntry } from "./types";
import { effectiveNeeded, isMobEntry, originKey } from "./grouping";
import { normalizeZone } from "./sources";

export interface HuntItemRef {
  item: string;
  needed: number;
  obtained: number;
}
export interface HuntMob {
  mob: string;
  items: HuntItemRef[];
  /**
   * True when the mob is on your list **in its own right** — you want to kill *it*, not something
   * it drops. Such a row can have no items at all, which is why `items.length` stopped being a
   * sufficient reason for a mob to appear.
   */
  target?: boolean;
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

/**
 * A mob you've put on the list to hunt for its own sake.
 *
 * `zones` comes from **your own kills**, not the wiki: a mob page carries no `sources` at all
 * (`parseWikiPage` builds one with `sources: []`), so where a named lives is something only
 * observation can answer here — which is
 * [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md) arriving at the same place
 * from the other direction. A mob you've never killed has no zone, and says so rather than guessing.
 */
export interface HuntTarget {
  mob: string;
  zones: string[];
}

/**
 * How much a zone is worth going to. A **target** counts as one reason on its own — it has no items
 * to count, and a zone whose only draw is the named you asked for must not sort below one that
 * happens to drop two things you need.
 */
function itemCount(zone: HuntZone): number {
  return zone.mobs.reduce((n, m) => n + m.items.length + (m.target ? 1 : 0), 0);
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
  // Mobs are not "needed" in this sense at all — they carry no obtained count and nothing can
  // satisfy them, so they'd sit here for ever pretending to be an outstanding item. They reach the
  // hunt list as targets instead (`HuntTarget`).
  return entries.filter((e) => !isMobEntry(e) && e.obtained < effectiveNeeded(e, runsForEntry(e, questRuns)));
}

/** The mob entries on the list — the things you want to kill rather than obtain. */
export function mobEntries(entries: ShoppingListEntry[]): ShoppingListEntry[] {
  return entries.filter(isMobEntry);
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

/**
 * Group what you need by the zone and mob it comes from — items by what drops them, and mob
 * targets by where you've seen them.
 *
 * The two arrive separately because they are answers to different questions ("what drops this" is
 * the wiki's, "where does this live" is your kill log's) and they meet here, in the one structure
 * the Hunt tab draws. A mob can be both: on your list *and* the source of something else on it.
 */
export function buildHunt(items: HuntInput[], targets: HuntTarget[] = []): HuntZone[] {
  // Keyed by normalized zone (so "The Feerrott"/"Feerrott" are one zone, matching the drops
  // panel), keeping the first spelling seen for the header.
  const byZone = new Map<string, { zone: string; mobs: Map<string, HuntMob> }>();

  /** Find or make the row for one mob in one zone, so both passes below land on the same object. */
  const rowFor = (display: string, mob: string): HuntMob => {
    const key = normalizeZone(display) || "unknown zone";
    let group = byZone.get(key);
    if (!group) byZone.set(key, (group = { zone: display, mobs: new Map() }));
    let hm = group.mobs.get(mob);
    if (!hm) group.mobs.set(mob, (hm = { mob, items: [] }));
    return hm;
  };

  for (const target of targets) {
    const mob = target.mob.trim();
    if (!mob) continue;
    // No known zone is still worth listing: it's on your list, and "we don't know where" is a more
    // useful answer than leaving it off the page entirely.
    const zones = target.zones.length ? target.zones : ["Unknown zone"];
    for (const zone of zones) rowFor(zone, mob).target = true;
  }

  for (const it of items) {
    for (const s of it.sources) {
      if (s.kind !== "drop") continue;
      const display = s.detail?.trim() || "Unknown zone";
      const mob = s.where?.trim();
      if (!mob) continue;
      const hm = rowFor(display, mob);
      if (!hm.items.some((r) => r.item === it.name)) {
        hm.items.push({ item: it.name, needed: it.needed, obtained: it.obtained });
      }
    }
  }

  const zones: HuntZone[] = [...byZone.values()].map(({ zone, mobs }) => ({
    zone,
    // A mob you asked for by name leads its zone — you said so explicitly, which outranks any
    // number of things that merely drop from something else. Then by how much they cover.
    mobs: [...mobs.values()].sort(
      (a, b) =>
        Number(!!b.target) - Number(!!a.target) ||
        b.items.length - a.items.length ||
        a.mob.localeCompare(b.mob),
    ),
  }));
  // Zones with the most useful drops first.
  zones.sort((a, b) => itemCount(b) - itemCount(a) || a.zone.localeCompare(b.zone));
  return zones;
}
