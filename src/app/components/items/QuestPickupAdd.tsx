"use client";
import { addPage } from "@/lib/items/addToList";
import { PICKUP_QUESTS, pickupQuestPage, pickupsForQuest } from "@/shared/quests/quest-pickups";

/**
 * "+ Quest pickups": add every ground pickup of one quest to the list in one go (ADR 0291).
 *
 * A picker rather than a search hit because the set is bundled, not on eqlwiki — there is no page
 * to arrive at. It goes through `addPage`, so the pickups land grouped under the quest, with the
 * same toast, exactly as a wiki quest's turn-ins would.
 */
export default function QuestPickupAdd() {
  if (!PICKUP_QUESTS.length) return null;
  return (
    <select
      className="btn ghost sm"
      value=""
      title="Add a quest's ground pickups — each is pinned on the map until you mark it obtained"
      onChange={(ev) => ev.target.value && void addPage(pickupQuestPage(ev.target.value))}
    >
      <option value="">＋ Quest pickups…</option>
      {PICKUP_QUESTS.map((q) => (
        <option key={q} value={q}>
          {q} ({pickupsForQuest(q).length})
        </option>
      ))}
    </select>
  );
}
