/**
 * hunt-pins.ts — the mobs your hunt wants, marked wherever anything can place them.
 *
 * The Hunt tab answers *what should I go kill*, and the map answers *where is it*. Both halves
 * already existed and nothing joined them: standing in the zone, you had to open the 📖 panel, find
 * the mob among everything else killed here, and press its ± button — for a position the app had all
 * along, about a mob it already knew you were after
 * ([ADR 0142](../../../specs/decisions/0142-a-hunted-mob-marks-itself.md)).
 *
 * So the map places them itself. These pins are **derived, never stored**: they exist while the hunt
 * wants the mob and something can place it, and they go when either stops being true — which is why
 * nothing here writes to the pin store, shares to peers, or can be dragged.
 *
 * **A position comes from your kills, peers' kills, or the wiki, in that order**, and each pin says
 * which — see [mob-place.ts](./mob-place.ts), which owns that ranking. The wiki matters most here:
 * it is the only source that can place a mob you have **never killed**, and a mob you have never
 * killed is precisely what a shopping list sends you after.
 *
 * Pure and DOM-free, like the rest of `src/shared/map` — tested in `electron/tests/hunt-pins.test.ts`.
 */
import type { HuntZone } from "../hunt";
import { mobKey, type MobKnowledge, type MobObservation } from "../mob-stats";
import { zoneMatches } from "../sources";
import { mobPlace, type MobPlace, type PlaceSource, type WikiPlace } from "./mob-place";

/** A mob the hunt wants, placed by whichever source can. */
export interface HuntPin {
  /** Stable across redraws — one pin per mob, keyed the way every mob lookup here is. */
  id: string;
  /** The mob, named as whatever placed it names it — what the map's lists narrow to when clicked. */
  mob: string;
  y: number;
  x: number;
  /**
   * How rough the position is, in EQ units. **Absent means stated rather than measured** (a wiki
   * coordinate), which the map draws differently — see `MobPlace.spread`.
   */
  spread?: number;
  /** Who placed it: your kills, those pooled with peers', peers' alone, or the wiki. */
  source: PlaceSource;
  /** On your list in its own right, rather than for something it drops (`HuntMob.target`). */
  target: boolean;
  /** The needed items it drops. Empty for a bare target. */
  items: string[];
  /** The caption drawn under the pin. */
  title: string;
  /** The hover: what it's wanted for, and what the position rests on. */
  note: string;
}

/** What the hunt wants of one mob, folded across every zone it was listed under. */
interface Wanted {
  mob: string;
  target: boolean;
  items: string[];
  /** The zones the hunt files it under — the wiki's wording, used only to place a wiki coordinate. */
  zones: string[];
}

/** Everything a hunt pin is built from. Named because it is five things and every one is optional. */
export interface HuntPinInput {
  /** The built hunt — what your list is after (`buildHunt`). */
  hunt: HuntZone[];
  /** The zone on screen, which is what a *stated* coordinate has to be about before it can be drawn. */
  zone?: string;
  /** Pooled knowledge for that zone (`mobs.all(zone)`) — yours and peers' together. */
  known?: MobKnowledge[];
  /** Your own observations for that zone (`mobs.mine(zone)`), so "yours" can be told from "theirs". */
  mine?: MobObservation[];
  /** What each mob's wiki page states, keyed by the name the hunt calls it. */
  wiki?: Record<string, WikiPlace | undefined>;
  /** Coordinates already pinned by hand in this zone — see `huntPins`. */
  placed?: readonly { y: number; x: number }[];
}

/**
 * Everything the hunt is after, keyed by `mobKey`.
 *
 * The zones are kept but **do not decide where the mob is**. A hunt zone is the *wiki's* wording for
 * where an item drops; a measured position is a kill recorded in the zone you are looking at, and
 * making the two names agree first would drop a mob you have actually killed here because a page
 * files it somewhere else. They earn their keep for one thing only: a wiki coordinate on a page that
 * doesn't say which zone it is in, which the hunt's own zones can vouch for — both are the wiki
 * speaking.
 */
function wantedMobs(hunt: HuntZone[]): Map<string, Wanted> {
  const wanted = new Map<string, Wanted>();
  for (const zone of hunt) {
    for (const mob of zone.mobs) {
      const key = mobKey(mob.mob);
      const want = wanted.get(key) ?? { mob: mob.mob, target: false, items: [], zones: [] };
      want.target ||= !!mob.target;
      for (const item of mob.items) if (!want.items.includes(item.item)) want.items.push(item.item);
      if (!want.zones.includes(zone.zone)) want.zones.push(zone.zone);
      wanted.set(key, want);
    }
  }
  return wanted;
}

/** Why the mob is on the map: what you want off it, or that you want *it*. */
function wantWhy(want: Wanted): string {
  return [want.target ? "On your list" : "", want.items.length ? `drops ${want.items.join(", ")}` : ""]
    .filter(Boolean)
    .join(", ");
}

/**
 * The row with the most positions behind it, of however many share a mob's folded name.
 *
 * Two spellings of one mob in one zone are two stored rows on purpose (ADR 0083), and the one that
 * placed it forty times knows better than the one that placed it once.
 */
function bestPlaced<T extends { mob: string; area?: { samples: number } }>(rows: T[], key: string): T | undefined {
  return rows
    .filter((r) => mobKey(r.mob) === key)
    .sort((a, b) => (b.area?.samples ?? 0) - (a.area?.samples ?? 0))[0];
}

/**
 * Whether a *stated* coordinate is about the zone on screen.
 *
 * Only ever asked of the wiki, and deliberately the stricter test: a measured position is about this
 * zone by construction (the caller scoped the rows), while a page's coordinate is about whatever
 * zone the page means — so it has to say, either on the card or through the hunt that filed the mob
 * here. Matching is `zoneMatches`, the loose rule for meeting the wiki's wording halfway.
 */
function statedHere(want: Wanted, wiki: WikiPlace | undefined, zone: string | undefined): boolean {
  if (!wiki?.loc || !zone) return false;
  if (wiki.zone) return zoneMatches(zone, wiki.zone);
  return want.zones.some((z) => zoneMatches(zone, z));
}

/**
 * The hunted mobs **this zone's kills cannot place** — the ones, and only the ones, worth asking the
 * wiki about.
 *
 * The ranking in `mobPlace` says the wiki fills observation's silence rather than competing with it,
 * so this is that rule read forwards: it is what the map hands `useMobWikiPlaces`, which keeps a page
 * lookup per mob down to the mobs an answer could actually change. Sorted, because the caller keys a
 * fetch on the list and an unstable order would re-ask for the same set.
 */
export function unplacedHuntMobs({ hunt, known = [], mine = [] }: Pick<HuntPinInput, "hunt" | "known" | "mine">): string[] {
  const names: string[] = [];
  for (const [key, want] of wantedMobs(hunt)) {
    if (bestPlaced(known, key)?.area || bestPlaced(mine, key)?.area) continue;
    names.push(want.mob);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * The pins for the zone on screen: every hunted mob anything can place there.
 *
 * `known` and `mine` are what's known *here* — the caller scopes them by zone (`mobs.all(zone)` /
 * `mobs.mine(zone)`), exactly as the 📖 panel does, so the zone match happens once and in one place.
 *
 * `placed` is the coordinates already pinned by hand in this zone: a roam centre you marked yourself
 * with the 📖 panel's ± button is the same spot with the same meaning, and drawing a second marker
 * over it would only make the map say it twice.
 */
export function huntPins({ hunt, zone, known = [], mine = [], wiki = {}, placed = [] }: HuntPinInput): HuntPin[] {
  const pins: HuntPin[] = [];
  for (const [key, want] of wantedMobs(hunt)) {
    const pooled = bestPlaced(known, key);
    const yours = bestPlaced(mine, key);
    const stated = wiki[want.mob];
    const place: MobPlace | undefined = mobPlace({
      mine: yours?.area,
      pooled: pooled?.area,
      contributors: pooled?.contributors,
      wiki: statedHere(want, stated, zone) ? stated : undefined,
    });
    // Nothing can place it: a mob you've never killed whose page states no coordinate really is
    // unlocated, and "we don't know where" is an answer. A mark in the middle of the map is not.
    if (!place) continue;
    if (placed.some((p) => p.y === place.y && p.x === place.x)) continue;
    // Named by whatever placed it: the kill log's wording where kills placed it, since that is what
    // the map's own lists are keyed by, and the wiki's where only the wiki could.
    const mob = pooled?.mob ?? yours?.mob ?? want.mob;
    pins.push({
      id: `hunt:${key}`,
      mob,
      y: place.y,
      x: place.x,
      spread: place.spread,
      source: place.source,
      target: want.target,
      items: want.items,
      title: mob,
      note: [wantWhy(want), place.why].filter(Boolean).join(" · "),
    });
  }
  // A mob you asked for by name leads, as it does in the hunt itself — then by name, so the map
  // doesn't reorder its own labels as kills come in.
  return pins.sort((a, b) => Number(b.target) - Number(a.target) || a.mob.localeCompare(b.mob));
}
