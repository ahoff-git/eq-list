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
import { mobKey, type MobKnowledge } from "./mob-stats";
import { distinct } from "./sorting";
import { normalizeZone, sourceZones } from "./sources";

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

/**
 * The mobs on your list, paired with the places **you** have killed them.
 *
 * `known` is the pooled tally — yours plus peers' — so `myKills` is what enforces the "your own
 * kills" rule `HuntTarget` states. Pooling is right for a *rate*, where many samples of the same
 * question are simply a better sample; it is wrong for a *direction*, because "go to Lower Guk" on
 * somebody else's word reads identically to a camp you have stood in and there is nothing you can
 * check it against. A blank is the honest answer, and `buildHunt` shows it as one.
 */
export function huntTargetsFor(entries: ShoppingListEntry[], known: MobKnowledge[]): HuntTarget[] {
  const targets = mobEntries(entries);
  if (!targets.length) return [];
  const seenMyself = known.filter((m) => m.myKills > 0);
  return targets.map((e) => ({
    mob: e.name,
    zones: distinct(seenMyself.filter((m) => mobKey(m.mob) === mobKey(e.name)).map((m) => m.zone)),
  }));
}

/**
 * Has the hunt got anything to show?
 *
 * A **target** is work with no count to complete, so it is deliberately absent from `neededEntries`
 * — which made "is there anything to do" measured by outstanding items alone tell a list holding
 * nothing but named mobs that there was nothing left to hunt. Asked here rather than in the panel
 * because it is the same rule `buildHunt` applies when it decides a zone is worth listing.
 */
export function huntHasWork(needed: ShoppingListEntry[], targets: HuntTarget[]): boolean {
  return needed.length > 0 || targets.length > 0;
}

/**
 * The zones the hunt's picker can narrow to: everywhere a needed item comes from, plus everywhere a
 * target has been seen.
 *
 * The second half is not optional. A target's zones come from your kill log rather than from any
 * item's sources, so a picker built from the sources alone left out the one camp you had asked for
 * by name. First spelling seen wins, as everywhere a zone is offered rather than keyed.
 */
export function huntZoneOptions(
  needed: ShoppingListEntry[],
  sources: Record<string, ItemSource[]>,
  targets: HuntTarget[],
): string[] {
  const byKey = new Map<string, string>();
  const offer = (zone: string) => {
    const key = normalizeZone(zone) || zone.toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, zone);
  };
  for (const e of needed) for (const zone of sourceZones(sources[e.name] ?? [])) offer(zone);
  for (const t of targets) for (const zone of t.zones) offer(zone);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** Somewhere an item comes from: one mob, in one zone. */
export interface HuntPlace {
  mob: string;
  zone: string;
  /** True when the mob is on your list in its own right (`HuntMob.target`). */
  target?: boolean;
}

export interface HuntItemGroup {
  item: string;
  needed: number;
  obtained: number;
  /** Everywhere it drops. Ordering is the caller's, because it turns on rates the panel holds. */
  places: HuntPlace[];
}

/**
 * **The same hunt read the other way round: item → every mob-in-a-zone that drops it.**
 *
 * The zone grouping answers *I am going to Lower Guk — what does that get me?* This answers the
 * question a shopping list asks first — *I need this thing; where is it likeliest to drop?* — which
 * the zone view can only answer by being read four times and compared by eye, one item's mobs being
 * scattered across four separate zone blocks.
 *
 * It inverts the **built** hunt rather than making a second pass over the sources, so whatever
 * narrowed the zones narrows this too: the zone filter, the era rules, every decision `buildHunt`
 * makes. Two views of one structure can't disagree about what is on your list.
 *
 * Items come out **in name order**, deliberately not in "best rate" order: a rate moves every time
 * you kill something, and a list that reshuffles itself while you farm is one you have to re-read
 * from the top each time. The ordering that answers *where do I farm this* belongs **inside** an
 * item, among its places — which is exactly where the panel puts it.
 */
export function huntByItem(zones: HuntZone[]): HuntItemGroup[] {
  const byItem = new Map<string, HuntItemGroup>();
  for (const zone of zones) {
    for (const mob of zone.mobs) {
      for (const it of mob.items) {
        let group = byItem.get(it.item);
        if (!group) byItem.set(it.item, (group = { item: it.item, needed: it.needed, obtained: it.obtained, places: [] }));
        // One mob can't drop the same item twice, but two zones can hold the same mob name — and
        // those are two camps, so both are worth listing.
        group.places.push({ mob: mob.mob, zone: zone.zone, ...(mob.target ? { target: true } : {}) });
      }
    }
  }
  return [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item));
}

/**
 * The mobs on your list in their own right, with where you've seen them.
 *
 * Read off the same zones for the same reason as `huntByItem`: a target has no item to be grouped
 * under, and dropping it from the item view would lose the one row you asked for by name
 * ([ADR 0098](../../specs/decisions/0098-a-mob-is-a-thing-you-hunt.md)). So it keeps a section of
 * its own instead of being quietly filtered out.
 */
export function huntTargetPlaces(zones: HuntZone[]): HuntPlace[] {
  const places: HuntPlace[] = [];
  for (const zone of zones) {
    for (const mob of zone.mobs) {
      if (mob.target) places.push({ mob: mob.mob, zone: zone.zone, target: true });
    }
  }
  return places.sort((a, b) => a.mob.localeCompare(b.mob) || a.zone.localeCompare(b.zone));
}

/**
 * Where to farm it: **best rate first, then zone**.
 *
 * A place with no rate at all goes last rather than being treated as a zero — "nobody has measured
 * this" and "this never drops" are different claims, and sorting them together would bury a mob
 * whose rate is merely unknown beneath one the wiki says is 1%.
 *
 * Zone breaks the tie rather than mob name, because two mobs in one zone is one trip: reading down
 * the list, everything you can farm without moving stays together.
 */
export function bestPlacesFirst<T extends HuntPlace & { rate?: number }>(places: T[]): T[] {
  return [...places].sort(
    (a, b) =>
      (b.rate ?? -1) - (a.rate ?? -1) || a.zone.localeCompare(b.zone) || a.mob.localeCompare(b.mob),
  );
}
