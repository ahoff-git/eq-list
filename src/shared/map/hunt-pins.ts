/**
 * hunt-pins.ts — the mobs your hunt wants, marked where your kills say they live.
 *
 * The Hunt tab answers *what should I go kill*, and the map answers *where was it last time*. Both
 * halves already existed and nothing joined them: standing in the zone, you had to open the 📖 panel,
 * find the mob among everything else killed here, and press its ± button — for a position the app had
 * all along, about a mob it already knew you were after
 * ([ADR 0142](../../../specs/decisions/0142-a-hunted-mob-marks-itself.md)).
 *
 * So the map places them itself. These pins are **derived, never stored**: they exist while the hunt
 * wants the mob and your kills can place it, and they go when either stops being true — which is why
 * nothing here writes to the pin store, shares to peers, or can be dragged.
 *
 * **A position is only ever a mob's own kills** (`MobKnowledge.area`), which is the only positional
 * knowledge this app has at all — the wiki's `ItemSource` names a mob and a zone but never a spot
 * ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)). It is an *average of where
 * it died*, not a spawn point, so every pin carries `roamWhy`'s hedge and says whose kills it rests on.
 *
 * Pure and DOM-free, like the rest of `src/shared/map` — tested in `electron/tests/hunt-pins.test.ts`.
 */
import type { HuntZone } from "../hunt";
import { mobKey, roamWhy, type MobKnowledge } from "../mob-stats";

/** A mob the hunt wants, placed where it has been killed. */
export interface HuntPin {
  /** Stable across redraws: the same key the knowledge row is grouped under (mob + place). */
  id: string;
  /** The mob, named as the kill log wrote it — what the map's lists narrow to when it's clicked. */
  mob: string;
  y: number;
  x: number;
  /** How rough "roughly here" is, in EQ units — the roam area's spread. */
  spread: number;
  /** On your list in its own right, rather than for something it drops (`HuntMob.target`). */
  target: boolean;
  /** The needed items it drops. Empty for a bare target. */
  items: string[];
  /** The caption drawn under the pin. */
  title: string;
  /** The hover: what it's wanted for, whose kills placed it, and how rough that is. */
  note: string;
}

/** What the hunt wants of one mob, folded across every zone it was listed under. */
interface Wanted {
  mob: string;
  target: boolean;
  items: string[];
}

/**
 * Everything the hunt is after, keyed by `mobKey` — **its zones folded away**.
 *
 * Deliberately not per zone. A hunt zone is the *wiki's* wording for where an item drops, while a
 * position comes from a kill recorded here; asking the two to agree about a name would be a second,
 * weaker zone match in front of one that has already been made, and it would drop a mob you have
 * actually killed here because a wiki page files it somewhere else. What the mob is wanted *for*
 * travels with it, since that is true of the mob wherever it turns out to be standing.
 */
function wantedMobs(hunt: HuntZone[]): Map<string, Wanted> {
  const wanted = new Map<string, Wanted>();
  for (const zone of hunt) {
    for (const mob of zone.mobs) {
      const key = mobKey(mob.mob);
      const want = wanted.get(key) ?? { mob: mob.mob, target: false, items: [] };
      want.target ||= !!mob.target;
      for (const item of mob.items) if (!want.items.includes(item.item)) want.items.push(item.item);
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
 * Whose kills put it there, when that isn't simply "yours".
 *
 * Said out loud because a pooled position is more useful *and* less checkable than your own, and a
 * marker that looks identical either way invites you to walk to a camp on somebody else's word
 * without knowing that's what you're doing (the concern behind `huntTargetsFor`'s own rule).
 */
function whoseKills(known: MobKnowledge): string {
  if (!known.contributors.length) return "";
  const names = known.contributors.join(", ");
  return known.myKills > 0 ? `pooled with ${names}` : `${names}' kills, not yours`;
}

/**
 * The pins for the zone on screen: every hunted mob that **this zone's** knowledge can place.
 *
 * `known` is what's known *here* — the caller scopes it (`mobs.all(zone)`), exactly as the 📖 panel
 * does, so the zone match happens once and in one place rather than being re-litigated here.
 *
 * `placed` is the coordinates already pinned by hand in this zone: a roam centre you marked yourself
 * with the 📖 panel's ± button is the same spot with the same meaning, and drawing a second marker
 * over it would only make the map say it twice.
 */
export function huntPins(
  hunt: HuntZone[],
  known: MobKnowledge[],
  placed: readonly { y: number; x: number }[] = [],
): HuntPin[] {
  const wanted = wantedMobs(hunt);
  if (!wanted.size) return [];
  const pins: HuntPin[] = [];
  for (const mob of known) {
    const want = wanted.get(mobKey(mob.mob));
    const area = mob.area;
    // No area is the honest "we don't know where": a mob killed here only ever at positions too poor
    // to believe (`AREA_MIN_CONFIDENCE`) has nowhere to be drawn, and is left off rather than guessed.
    if (!want || !area) continue;
    if (placed.some((p) => p.y === area.y && p.x === area.x)) continue;
    pins.push({
      id: `hunt:${mob.mob.toLowerCase()}|${mob.zone}`,
      mob: mob.mob,
      y: area.y,
      x: area.x,
      spread: area.spread,
      target: want.target,
      items: want.items,
      title: mob.mob,
      note: [wantWhy(want), whoseKills(mob), roamWhy(area)].filter(Boolean).join(" · "),
    });
  }
  // A mob you asked for by name leads, as it does in the hunt itself — then by name, so the map
  // doesn't reorder its own labels as kills come in.
  return pins.sort(
    (a, b) => Number(b.target) - Number(a.target) || a.mob.localeCompare(b.mob),
  );
}
