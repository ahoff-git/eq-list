/**
 * pickup-pins.ts — the quest pickups your list still wants, marked where they lie.
 *
 * The same idea as `hunt-pins.ts`, for things you pick up rather than kill: **derived, never stored**.
 * A pin exists while its entry is still needed on the list, so marking a Rod obtained takes its pin
 * off the map by itself, and nothing here writes to the pin store or shares to peers
 * ([ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md)).
 *
 * The position is the wiki's, stated rather than measured — which is what an absent `spread` means
 * on the map (a dashed ring).
 *
 * Pure and DOM-free, like the rest of `src/shared/map` — tested in `electron/tests/quest-pickups.test.ts`.
 */
import { pickupFor, pickupLocText } from "../quests/quest-pickups";

export interface PickupPin {
  id: string;
  y: number;
  x: number;
  /** The pickup's label — "Azia". */
  title: string;
  /** The hover's one-line summary: what it is, what for, and where. */
  about: string;
  /** The hover's body: the wiki's Description, and anything else its table says about reaching it. */
  note: string;
}

/**
 * One pin per still-needed list entry that is a pickup in the zone on screen.
 *
 * `inZone` is the map's own "is this the zone on screen?" test, so a pickup's wiki wording ("Lower
 * Guk", "Unrest") is matched the same way every other zone name on the map is.
 */
export function pickupPins(needed: readonly { name: string }[], inZone: (zone: string) => boolean): PickupPin[] {
  return needed.flatMap((e) => {
    const p = pickupFor(e.name);
    if (!p || !inZone(p.zone)) return [];
    return [
      {
        id: `pickup:${e.name}`,
        y: p.loc.y,
        x: p.loc.x,
        title: p.label,
        about: `${e.name} for ${p.quest} — ${pickupLocText(p)}`,
        note: p.note,
      },
    ];
  });
}
