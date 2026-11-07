"use client";
import { useDamageTaken } from "@/lib/combat/useDamageTaken";
import { adviceOf } from "@/shared/combat/damage-taken-text";
import type { DamageWindow } from "@/shared/combat/damage-window";

/**
 * The status bar's suggestion from your fights: more AC when it is mostly melee and the builder's loadout
 * reaches more of it ([ADR 0362](../../../../specs/decisions/0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md)),
 * a resist when a type of spell damage is enough of it to be worth one
 * ([ADR 0361](../../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md)),
 * and more mana or health when you run dry or keep dying
 * ([ADR 0363](../../../../specs/decisions/0363-running-dry-and-dying-suggest-mana-and-health.md)) — or, when
 * none of that is wrong and you are winning comfortably with your own sword, a harder swing for some of the
 * survivability you aren't using ([ADR 0365](../../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)).
 * One click opens the loadout builder on the section that explains it — like everything else in the bar,
 * it is a way in ([ADR 0326](../../../../specs/decisions/0326-the-status-bar-is-a-way-in.md)).
 *
 * Draws nothing while there is nothing to say: a zone you have just arrived in (the window is empty, so
 * too thin to advise on), nothing a resist or armour would help, or figures the builder hasn't planned yet
 * for this inventory.
 */
export default function DamageTakenChip({ window, onOpen }: { window: DamageWindow; onOpen: () => void }) {
  const { suggestions, ac, hp, mana, swing } = useDamageTaken(window);
  const advice = adviceOf({ ac, resists: suggestions, hp, mana, swing }, window);
  if (!advice.length) return null;
  const more = advice.length - 1;
  const title = [...advice.map((a) => a.sentence), "Click to open it in the loadout builder."].join("\n\n");
  return (
    <button type="button" className="chip damage-chip" title={title} onClick={onOpen}>
      {advice[0].icon ?? "🛡"} {advice[0].label}
      {more > 0 ? ` · ${more} more` : ""}
    </button>
  );
}
