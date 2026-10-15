/**
 * quest-npc-pins.ts — the NPCs a quest on your list sends you to, marked where they stand.
 *
 * The other half of [pickup-pins.ts](./pickup-pins.ts): pickups are what a quest has you collect,
 * these are who it has you hand them to. **Derived, never stored**, and drawn in the same shape, so
 * the map treats both as "what my list is sending me to do here"
 * ([ADR 0293](../../../specs/decisions/0293-quest-npcs-are-bundled-and-pinned-while-their-quest-is-listed.md)).
 *
 * A quest's NPCs are pinned while **any** entry filed under that quest is still needed — the list
 * has no entry for "hand the coin to Tarn", so the quest's own progress is what says you still need him.
 *
 * Pure and DOM-free, like the rest of `src/shared/map` — tested in `electron/tests/quest-pickups.test.ts`.
 */
import { pickupLocText, QUEST_NPCS } from "../quests/quest-pickups";
import type { PickupPin } from "./pickup-pins";

/** One pin per NPC of a quest that still has a needed entry, in the zone on screen. */
export function questNpcPins(
  needed: readonly { name: string; origin?: { name: string } }[],
  inZone: (zone: string) => boolean,
): PickupPin[] {
  const quests = new Set(needed.flatMap((e) => (e.origin ? [e.origin.name] : [])));
  return QUEST_NPCS.filter((n) => quests.has(n.quest) && inZone(n.zone)).map((n) => ({
    id: `quest-npc:${n.quest}:${n.npc}`,
    y: n.loc.y,
    x: n.loc.x,
    title: n.npc,
    about: `${n.npc} for ${n.quest} — ${pickupLocText(n)}`,
    note: [...n.steps, n.note].filter(Boolean).join(" "),
  }));
}
