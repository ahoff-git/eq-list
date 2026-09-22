/**
 * named-pins.ts — every mob eqlwiki calls "named" here, marked wherever anything can place it.
 *
 * Sibling to [hunt-pins.ts](./hunt-pins.ts), and built the same way, but unscoped from the hunt
 * list: this is *every* named spawn the zone on screen knows about, not only the ones something on
 * the shopping list wants ([ADR 0265](../../../specs/decisions/0265-named-spawns-mark-themselves-on-the-map.md)).
 *
 * A mob is "named" per `isNamedMob` (`../named-mobs.ts`) — eqlwiki's own `Category:Named Mobs` — and
 * this zone's candidates come from two places: the zone's **own wiki page roster** (`npcs`, only
 * ever about the zone it was fetched for) and any kill recorded here, so a mob missing from a stale
 * or unfetched roster still shows the moment you've killed it.
 *
 * **A position comes from your kills, peers' kills, or the wiki, in that order** — see
 * [mob-place.ts](./mob-place.ts), which owns that ranking, exactly as hunt pins use it. Unlike a
 * hunted mob's wiki fallback, a roster name needs no zone check before trusting its page's stated
 * coordinate: it is already known to be about *this* zone, because it came from this zone's own
 * page.
 *
 * Pure and DOM-free, like the rest of `src/shared/map` — tested in `electron/tests/named-pins.test.ts`.
 */
import { mobKey, type MobKnowledge, type MobObservation } from "../mob-stats";
import { isNamedMob } from "../named-mobs";
import { bestPlaced, mobPlace, type MobPlace, type PlaceSource, type WikiPlace } from "./mob-place";

/** A named mob, placed by whichever source can — the map's own mark, not something you dropped. */
export interface NamedPin {
  /** Stable across redraws — one pin per mob, keyed the way every mob lookup here is. */
  id: string;
  /** The mob, named as whatever placed it names it. */
  mob: string;
  y: number;
  x: number;
  /** How rough the position is, in EQ units. Absent means stated rather than measured. */
  spread?: number;
  /** Who placed it: your kills, those pooled with peers', peers' alone, or the wiki. */
  source: PlaceSource;
  /** The caption drawn under the pin. */
  title: string;
  /** The hover: why it's marked, and what the position rests on. */
  note: string;
}

/** Everything a named pin is built from — the zone's own roster plus what's known about it. */
export interface NamedPinInput {
  /** The zone's own wiki page roster (`WikiPage.npcs`). Undefined/empty if unfetched. */
  npcs?: readonly { name: string }[];
  /** Pooled knowledge for the zone on screen (`mobs.all(zone)`). */
  known?: MobKnowledge[];
  /** Your own observations for that zone (`mobs.mine(zone)`). */
  mine?: MobObservation[];
  /** What each named mob's own wiki page states, keyed by the name asked for. */
  wiki?: Record<string, WikiPlace | undefined>;
  /** Coordinates already drawn — hand-placed pins and hunt pins alike, so nothing is marked twice. */
  placed?: readonly { y: number; x: number }[];
}

/**
 * Every named mob this zone knows about, keyed by `mobKey` — from the zone's own roster, or from a
 * kill that roster doesn't (yet) list, so a page that's missing or stale doesn't hide a mob you've
 * actually killed here.
 */
function namedCandidates(
  npcs: readonly { name: string }[],
  known: readonly { mob: string }[],
  mine: readonly { mob: string }[],
): Map<string, string> {
  const candidates = new Map<string, string>();
  for (const npc of npcs) {
    if (isNamedMob(npc.name)) candidates.set(mobKey(npc.name), npc.name);
  }
  for (const row of [...known, ...mine]) {
    const key = mobKey(row.mob);
    if (!candidates.has(key) && isNamedMob(row.mob)) candidates.set(key, row.mob);
  }
  return candidates;
}

/**
 * The named mobs **this zone's kills cannot place** — the ones worth asking the wiki about, the
 * same cut `unplacedHuntMobs` makes for the hunt list.
 */
export function unplacedNamedMobs({ npcs = [], known = [], mine = [] }: Pick<NamedPinInput, "npcs" | "known" | "mine">): string[] {
  const names: string[] = [];
  for (const [key, name] of namedCandidates(npcs, known, mine)) {
    if (bestPlaced(known, key)?.area || bestPlaced(mine, key)?.area) continue;
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** The pins for the zone on screen: every named mob anything can place there. */
export function namedPins({ npcs = [], known = [], mine = [], wiki = {}, placed = [] }: NamedPinInput): NamedPin[] {
  const pins: NamedPin[] = [];
  for (const [key, name] of namedCandidates(npcs, known, mine)) {
    const pooled = bestPlaced(known, key);
    const yours = bestPlaced(mine, key);
    const place: MobPlace | undefined = mobPlace({
      mine: yours?.area,
      pooled: pooled?.area,
      contributors: pooled?.contributors,
      wiki: wiki[name],
    });
    // Nothing can place it: named, but genuinely unlocated. Say nothing rather than guess.
    if (!place) continue;
    if (placed.some((p) => p.y === place.y && p.x === place.x)) continue;
    const mob = pooled?.mob ?? yours?.mob ?? name;
    pins.push({
      id: `named:${key}`,
      mob,
      y: place.y,
      x: place.x,
      spread: place.spread,
      source: place.source,
      title: mob,
      note: ["Named spawn", place.why].filter(Boolean).join(" · "),
    });
  }
  return pins.sort((a, b) => a.mob.localeCompare(b.mob));
}
