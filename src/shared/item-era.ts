/**
 * item-era.ts — **of the places an item comes from, which can you actually go to today?**
 *
 * eqlwiki's drop table for an item is a table about *EverQuest*: `McVaxius\` Horn of War` lists
 * Gorenaire, Severilous, Lady Vox, Talendor and Faydedar, and on a server running Classic only one of
 * those five is a mob you could go and kill. Printing all five under "How to get it" is not a list of
 * five ways to get it — it is one way and four dead ends, told apart by knowing your expansions.
 *
 * Every part of the judgement already exists: [expansions](./zones/expansions.ts) knows which zones
 * this server has (a permanent fact) and which of them the wiki says are still shut (a live one), and
 * [item-search](./item-search.ts) knows which drop-table cells name a place at all. This is the join
 * — the one place that turns "here is an item's sources" into "here is what you can reach", so the
 * item page and the Items tab cannot come to different answers about the same zone.
 *
 * Two things it deliberately does **not** do:
 *
 * - **It never guesses from silence.** A source whose zone cell says nothing, or says `Various Zones`,
 *   is unjudged rather than unreachable — quest rewards and crafted goods live there, and cutting them
 *   would be an invention. Same rule as [lucy-era](./lucy-era.ts)'s `unknown`.
 * - **It carries no era list of its own.** The closed set is passed in, because it is eqlwiki's and it
 *   changes as the server progresses ([ADR 0065](../../specs/decisions/0065-a-zone-belongs-to-an-expansion.md)).
 *   Given none, everything permanent still applies and nothing temporary does — the same fail-open
 *   the underlying table has.
 *
 * Pure, so the whole judgement is testable against real wiki source rows.
 */
import { namesAPlace, type ItemRow } from "./item-search";
import type { ItemSource } from "./types";
import { unavailableReason, zoneExpansion, zoneUnavailable, type ZoneUnavailable } from "./zones/expansions";

/**
 * Why an item's source can't be reached this era, or `undefined` when it can.
 *
 * A cell that names no place answers `undefined` too, and on purpose: the caller's question is "should
 * I mark this one", and "we can't tell" and "you can go there" both answer no. What we can't judge, we
 * don't badge.
 */
export function zoneShut(zone: string | undefined, closed?: ReadonlySet<string>): ZoneUnavailable | undefined {
  const named = zone?.trim();
  if (!named || !namesAPlace(named)) return undefined;
  return zoneUnavailable(named, closed);
}

/** One of an item's sources, judged against the era the server is actually running. */
export interface SourceReach {
  source: ItemSource;
  /** Why its zone can't be gone to. Unset when it can, or when the cell names no place to judge. */
  shut?: ZoneUnavailable;
  /** The reason in words, for the badge's hover. Set exactly when `shut` is. */
  why?: string;
}

/**
 * An item's sources with the reachable ones first, each carrying why it isn't if it isn't.
 *
 * Ordered rather than split into two lists because the reader's question is "so where do I go" and the
 * answer is the top of one list — a second heading for the dead ends would give them equal billing.
 * Stable within each half, so the wiki's own ordering survives.
 */
export function sourcesByEra(sources: readonly ItemSource[], closed?: ReadonlySet<string>): SourceReach[] {
  const judged = sources.map((source): SourceReach => {
    const shut = zoneShut(source.detail, closed);
    if (!shut) return { source };
    // `zoneExpansion` names the expansion for a "future" zone, which is the more useful half of that
    // sentence: "Veil of Alaris — not on this server" says an era opening won't help.
    return { source, shut, why: unavailableReason(shut, zoneExpansion(source.detail?.trim() ?? "")) };
  });
  return [...judged.filter((r) => !r.shut), ...judged.filter((r) => r.shut)];
}

/** The zones of these you could set off for now. Order preserved — this only ever removes. */
export function openZones(zones: readonly string[], closed?: ReadonlySet<string>): string[] {
  return zones.filter((zone) => !zoneShut(zone, closed));
}

/**
 * The item catalogue **as the game the server is running** — the Items tab's corpus.
 *
 * Two things, because they are the same fact seen from either end:
 *
 * - An item every one of whose zones is shut is out of era, whatever its page is tagged. The wiki's
 *   own flag is a *page category*, so it catches an item on a Velious page and misses one that merely
 *   drops in five Kunark zones — which is most of them.
 * - With the era toggle on, a row's out-of-era zones come **off the row**, so they leave the Zone
 *   column and the zone picker rather than sitting in them as places you can't go. That is the toggle's
 *   stated bargain (see `useItemQuery`): it says which game you are playing, so its values leave the
 *   menus entirely.
 *
 * Rows are returned untouched unless something about them changed, so a catalogue with nothing shut
 * costs no allocation at all.
 */
export function eraCorpus(rows: readonly ItemRow[], closed: ReadonlySet<string> | undefined, hide: boolean): ItemRow[] {
  const out: ItemRow[] = [];
  for (const row of rows) {
    const open = openZones(row.zones, closed);
    // No zones at all is unjudgeable, not unreachable — see the note on silence above.
    const flagged = !!row.item.outOfEra;
    const outOfEra = flagged || (row.zones.length > 0 && open.length === 0);
    if (hide && outOfEra) continue;
    const zones = hide ? open : row.zones;
    if (zones.length === row.zones.length && outOfEra === flagged) {
      out.push(row);
      continue;
    }
    out.push({ ...row, zones, item: outOfEra === flagged ? row.item : { ...row.item, outOfEra } });
  }
  return out;
}
