/**
 * sources.ts — shape a wiki page's `sources` for display. Currently: group the
 * "drop" sources by zone so the overlay can answer "who drops this, and where?".
 * Pure + testable.
 */
import type { ItemSource, SourceKind } from "./types";
import { zoneKey } from "./names";

export interface ZoneDrops {
  zone: string;
  mobs: string[];
}

/**
 * Drop sources grouped by zone (mobs deduped, zone order preserved). Zones are keyed by
 * their normalized form (`normalizeZone`, same as the "you are here" match), so the wiki
 * spelling one mob's zone "The Feerrott" and another's "Feerrott" collapse into one header
 * rather than two — the first spelling seen is the one shown.
 */
export function groupDropsByZone(sources: ItemSource[]): ZoneDrops[] {
  const byZone = new Map<string, ZoneDrops>();
  for (const s of sources) {
    if (s.kind !== "drop") continue;
    const display = s.detail?.trim() || "Unknown zone";
    const key = normalizeZone(display) || "unknown zone";
    let group = byZone.get(key);
    if (!group) {
      group = { zone: display, mobs: [] };
      byZone.set(key, group);
    }
    if (s.where && !group.mobs.includes(s.where)) group.mobs.push(s.where);
  }
  return [...byZone.values()];
}

/**
 * What a source kind is called where a player reads it: a verb, not a noun.
 *
 * "vendor" is a category and "buy" is an instruction, and these labels sit beside a shopping list —
 * the reader's question is always "so what do I do about it". Shared rather than each panel's own,
 * because the shopping list and the item search colour these with the same `.src-kind k-*` rules and
 * two spellings of one kind would read as two kinds.
 */
export function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case "drop":
      return "kill";
    case "vendor":
      return "buy";
    case "recipe":
      return "craft";
    default:
      return kind;
  }
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

/** Distinct zones an item is obtainable in (from any source's `detail`), folded the same
 *  way as `groupDropsByZone` so "The Feerrott" and "Feerrott" are one option, not two. */
export function sourceZones(sources: ItemSource[]): string[] {
  const zones: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const z = s.detail?.trim();
    if (!z) continue;
    const key = normalizeZone(z);
    if (key && !seen.has(key)) {
      seen.add(key);
      zones.push(z);
    }
  }
  return zones;
}

/** Whether any of an item's sources place it in `zone` (loose zone match). */
export function isObtainableIn(sources: ItemSource[], zone: string): boolean {
  return sources.some((s) => !!s.detail && zoneMatches(zone, s.detail));
}

/**
 * Fold a zone name for matching/grouping: drop a difficulty number and ruleset tag, lowercase, drop
 * a leading "the", collapse spaces, and apply any alias.
 *
 * The decoration goes because a harder Blackburrow is still Blackburrow to a map and to a wiki page
 * — it changes what the mobs hit for, not where they live. The unfolded name is what gets
 * *recorded*, so how hard the camp was is never lost.
 *
 * The rule itself is `zoneKey` in `names.ts`, which also owns the alias list for the zones the log
 * and the maps name differently. This is its name at the call sites, kept because half the app asks
 * for it by this one.
 */
export const normalizeZone = zoneKey;

/**
 * Are these two names the same zone? **Exactly** the same, after folding — the one rule for
 * keying anything by zone (kill records, mob observations), and deliberately not `zoneMatches`.
 *
 * The loose containment below is right for meeting the wiki halfway on a name it spells
 * differently, and quite wrong here: "commonlands" sits inside "east commonlands", so a query for
 * one would answer with the other's kills. See
 * [ADR 0059](../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md).
 */
export function sameZone(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeZone(a) === normalizeZone(b);
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
