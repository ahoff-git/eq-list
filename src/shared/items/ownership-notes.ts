import type { InventoryTotal, OwnedPlace } from "../game-export-dumps";
import type { InventoryShareRow } from "../peers/peer-share";
import { normalizeItemName } from "./grouping";

/** How many places one line names before it says how many more — a hover card, not the Exports view. */
const PLACES = 3;

/**
 * The hover card's "who has this" lines: where you hold it (and your best grade), and which peers who
 * share their inventory hold it — so checking whether you already own something doesn't take a trip to
 * Character → Exports or Settings → Peers
 * ([ADR 0320](../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 * No lines when nobody holds it.
 */
export function ownershipNotes(
  places: readonly OwnedPlace[] | undefined,
  bestGrade: number | undefined,
  peers: readonly { by: string; count: number }[] | undefined,
): string[] {
  const notes: string[] = [];
  if (places?.length) {
    const total = places.reduce((n, p) => n + p.count, 0);
    const where = places.slice(0, PLACES).map(placeText);
    if (places.length > PLACES) where.push(`${places.length - PLACES} more`);
    notes.push(`You have ${total}${bestGrade ? ` (best +${bestGrade})` : ""}: ${where.join(", ")}`);
  }
  if (peers?.length) notes.push(`Peers: ${peers.map((p) => `${p.by} ${p.count}`).join(", ")}`);
  return notes;
}

function placeText(p: OwnedPlace): string {
  const what = p.exaltation ? `${p.text} (exaltation)` : p.text;
  return p.count > 1 ? `${what} ×${p.count}` : what;
}

/**
 * An item page's "in your inventory" line: the total, then each area with its count — `Bags 600 ·
 * Bank 30 · Tradeskill depot 10` — in the dump's own area order. Unlike the hover card, a page has
 * room for every area, and a count per area is the question it answers ("do I need to fetch some
 * from the bank?"). Slots are left to the Exports view.
 */
export function heldOnPageText(total: Pick<InventoryTotal, "count" | "bestGrade" | "places">): string {
  const where = total.places.map((p) => `${p.label} ${p.count}`).join(" · ");
  return `${total.count}${total.bestGrade ? ` (best +${total.bestGrade})` : ""} — ${where}`;
}


/** One sharing peer's holding of an item, for its page: their total, best grade, and dump date. */
export interface PeerHolder {
  by: string;
  count: number;
  grade: number;
  /** Where, as `Bags 6 · Bank 2` — for a hover, since the line itself names only who and how many. */
  where: string;
  asOf: string;
}

/**
 * Which sharing peers hold an item, from the inventory rows they've handed over: one entry per peer
 * (a peer's rows for the item's grades folded together), most first, so the page reads "who has the
 * most" at a glance. `name` is matched as every other ownership view matches it, by
 * `normalizeItemName`.
 */
export function peerHoldersOf(
  rows: readonly { by: string; row: Pick<InventoryShareRow, "item" | "count" | "grade" | "places" | "asOf"> }[],
  name: string,
): PeerHolder[] {
  const key = normalizeItemName(name);
  // Per peer: their totals, and each area's count summed across the item's grades.
  const byPeer = new Map<string, Omit<PeerHolder, "where"> & { areas: Map<string, number> }>();
  for (const { by, row } of rows) {
    if (normalizeItemName(row.item) !== key) continue;
    const h = byPeer.get(by) ?? { by, count: 0, grade: 0, asOf: row.asOf, areas: new Map<string, number>() };
    h.count += row.count;
    h.grade = Math.max(h.grade, row.grade ?? 0);
    if (row.asOf > h.asOf) h.asOf = row.asOf;
    for (const p of row.places) h.areas.set(p.label, (h.areas.get(p.label) ?? 0) + p.count);
    byPeer.set(by, h);
  }
  return [...byPeer.values()]
    .map(({ areas, ...h }) => ({ ...h, where: [...areas].map(([label, n]) => `${label} ${n}`).join(" · ") }))
    .sort((a, b) => b.count - a.count || a.by.localeCompare(b.by));
}

/** One peer's part of the page's peer line: `BunnySlayer 8`, or `Ann 2 (best +3)`. */
export function peerHolderText(h: Pick<PeerHolder, "by" | "count" | "grade">): string {
  return `${h.by} ${h.count}${h.grade ? ` (best +${h.grade})` : ""}`;
}
