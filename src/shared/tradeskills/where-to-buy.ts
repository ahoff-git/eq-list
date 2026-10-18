/**
 * Where to buy a section's materials, starting from where you're standing (ADR 0304).
 *
 * Three answers, in the order a player wants them:
 *
 * - **Here** — merchants in your zone selling something on the list, with where they stand, so the
 *   map can be opened on them;
 * - **Stops** — for what isn't sold here, the zones selling the most of it, so the trip is as few stops
 *   as the wiki allows. Ranked by how much of the list a zone covers, not by distance: the guide has no
 *   way to know how you'd travel, and "Ak'Anon sells 4 of the 5" is the useful half of that question;
 * - **Not sold** — what no open merchant sells (a drop, a forage, something to make first).
 *
 * A merchant in a zone the server hasn't opened is no merchant (`zoneShut`), the same rule every
 * source in the app follows. A zone is matched to yours by `samePlace`, under both the name the wiki
 * shows ("East Cabilis") and the page it links to ("Cabilis").
 */
import { zoneShut } from "../items/item-era";
import { samePlace } from "../zones/place";
import type { VendorSpot } from "./tradeskill-types";

export interface MerchantHere {
  item: string;
  merchant: string;
  zone: string;
  area?: string;
  loc?: { y: number; x: number };
}

export interface Stop {
  zone: string;
  /** What this zone sells off the list, each with one of its merchants. */
  items: { item: string; merchant: string; area?: string; loc?: { y: number; x: number } }[];
}

export interface ShoppingPlan {
  here: MerchantHere[];
  stops: Stop[];
  notSold: string[];
}

/** How many other zones to suggest — enough to finish most lists, few enough to read. */
const STOPS = 3;
/** How many merchants to name per item here — a city often has four selling Water Flask. */
const PER_ITEM_HERE = 2;

const locOf = (v: VendorSpot) => (v.y !== undefined && v.x !== undefined ? { loc: { y: v.y, x: v.x } } : {});
const areaOf = (v: VendorSpot) => (v.area ? { area: v.area } : {});

export function whereToBuy(
  items: readonly string[],
  vendors: Readonly<Record<string, readonly VendorSpot[]>>,
  currentZone: string | null | undefined,
  closed: ReadonlySet<string>,
): ShoppingPlan {
  const here: MerchantHere[] = [];
  const notSold: string[] = [];
  const left = new Map<string, VendorSpot[]>();
  for (const item of [...new Set(items)]) {
    const open = (vendors[item] ?? []).filter((v) => !zoneShut(v.zone, closed) && !zoneShut(v.zonePage, closed));
    if (!open.length) {
      notSold.push(item);
      continue;
    }
    const local = currentZone ? open.filter((v) => samePlace(v.zone, currentZone) || samePlace(v.zonePage, currentZone)) : [];
    if (local.length) {
      for (const v of local.slice(0, PER_ITEM_HERE)) here.push({ item, merchant: v.merchant, zone: v.zone, ...areaOf(v), ...locOf(v) });
    } else left.set(item, open);
  }

  // Greedy cover: the zone selling most of what's left, then the next for what that didn't, and so on.
  const stops: Stop[] = [];
  while (left.size && stops.length < STOPS) {
    const byZone = new Map<string, Stop>();
    for (const [item, spots] of left) {
      for (const v of spots) {
        const stop = byZone.get(v.zone) ?? { zone: v.zone, items: [] };
        if (!stop.items.some((i) => i.item === item)) stop.items.push({ item, merchant: v.merchant, ...areaOf(v), ...locOf(v) });
        byZone.set(v.zone, stop);
      }
    }
    const best = [...byZone.values()].sort((a, b) => b.items.length - a.items.length || a.zone.localeCompare(b.zone))[0];
    if (!best) break;
    stops.push(best);
    for (const i of best.items) left.delete(i.item);
  }
  return { here, stops, notSold };
}
