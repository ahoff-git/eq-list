"use client";
import { addPage } from "@/lib/items/addToList";
import { PICKUP_QUESTS, pickupQuestPage, pickupsForQuest } from "@/shared/quests/quest-pickups";
import { planFor, planItems, planQuestPage, QUEST_PLANS } from "@/shared/quests/quest-plans";

/** A plan's option value, kept apart from a pickup quest's so one name can't mean both. */
const PLAN = "plan:";

/**
 * "+ Quest pickups": add a bundled quest to the list in one go — a quest's ground pickups (ADR 0291),
 * or a long quest's whole route, every item a step gets (ADR 0300).
 *
 * A picker rather than a search hit because the set is bundled, not on eqlwiki — there is no page
 * to arrive at. It goes through `addPage`, so the entries land grouped under the quest, with the
 * same toast, exactly as a wiki quest's turn-ins would.
 */
export default function QuestPickupAdd() {
  if (!PICKUP_QUESTS.length && !QUEST_PLANS.length) return null;
  const add = (value: string) => {
    const plan = value.startsWith(PLAN) ? planFor(value.slice(PLAN.length)) : undefined;
    void addPage(plan ? planQuestPage(plan) : pickupQuestPage(value));
  };
  return (
    <select
      className="btn ghost sm"
      value=""
      title="Add a quest's ground pickups, or a long quest's whole route — pinned on the map until you mark them obtained"
      onChange={(ev) => ev.target.value && add(ev.target.value)}
    >
      <option value="">＋ Quest pickups…</option>
      <optgroup label="Ground pickups">
        {PICKUP_QUESTS.map((q) => (
          <option key={q} value={q}>
            {q} ({pickupsForQuest(q).length})
          </option>
        ))}
      </optgroup>
      <optgroup label="Long quests">
        {QUEST_PLANS.map((p) => (
          <option key={p.quest} value={`${PLAN}${p.quest}`}>
            {p.quest} ({planItems(p).length})
          </option>
        ))}
      </optgroup>
    </select>
  );
}
