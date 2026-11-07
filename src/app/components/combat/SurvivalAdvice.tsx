"use client";
import { useMemo } from "react";
import { useHeadroom } from "@/lib/combat/headroom";
import { adviceOf } from "@/shared/combat/damage-taken-text";
import { survivalFound } from "@/shared/combat/survival";
import type { FightStats } from "@/shared/types";

/**
 * **Next time** — under a fight's deaths, what to change to live through it: a resist for the spell damage
 * that landed, armour if it was swings, more mana if you ran dry, more health either way. The same
 * suggestions the status bar and the loadout builder make, asked of this one fight
 * ([ADR 0364](../../../../specs/decisions/0364-a-fight-you-died-in-says-how-to-survive-the-next.md)).
 *
 * Armour, mana and health are priced against what the loadout builder plans for your goals, so they need it
 * to have planned once for this inventory; without that the resists still show and the rest says so.
 */
export default function SurvivalAdvice({ stats }: { stats: FightStats }) {
  const headroom = useHeadroom();
  const advice = useMemo(() => adviceOf(survivalFound(stats, headroom), "fight"), [stats, headroom]);
  return (
    <div className="survival">
      <h3 className="section-head">Next time</h3>
      {advice.length > 0 ? (
        <ul className="bis-list small">
          {advice.map((a) => (
            <li key={a.label}>{a.sentence}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Nothing stands out: no resist or armour is clearly worth more against this fight
          {headroom ? ", and the loadout the builder plans for your goals reaches no meaningfully more health than you wear." : "."}
        </p>
      )}
      {!headroom && (
        <p className="muted small">
          Open the loadout builder (Find → Items) once to see what armour, mana and health your gear could reach — those suggestions need it.
        </p>
      )}
    </div>
  );
}
