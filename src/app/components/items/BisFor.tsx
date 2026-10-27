"use client";
import { useMemo, useState, type ComponentProps } from "react";
import BisView from "@/app/components/items/BisView";
import { segCls } from "@/app/components/ui";
import { usePeerInventories } from "@/lib/exports/useGameExports";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { normalizeBisOptions, withoutChanges, type BisOptions } from "@/shared/items/bis-options";

/**
 * The loadout builder, for you or for anyone sharing their inventory with you (ADR 0342). Picking a
 * person plans from what they hold, with locks, wanted effects and exclusions of their own — kept by
 * name, so trying things on their gear never touches your plan. A person's plan starts from your
 * settings (hunting, grade, melee weights) with none of your changes.
 *
 * Its own component so the peers are only asked for their inventories while the builder is open.
 */
export default function BisFor({ options, onOptions, ...bis }: ComponentProps<typeof BisView>) {
  const people = usePeerInventories();
  // Whose plan is showing, by name — "" is yours. Not remembered: who's sharing changes session to session.
  const [whose, setWhose] = useState("");
  const [peerOptions, setPeerOptions] = usePersistentState<Record<string, BisOptions>>(STORAGE_KEYS.itemBisPeerOptions, {});
  const holder = people.find((p) => p.name === whose);
  const stored = holder ? peerOptions[holder.name] : undefined;
  const planning = !!holder;
  const theirs = useMemo(() => (planning ? (stored ? normalizeBisOptions(stored) : withoutChanges(options)) : undefined), [planning, stored, options]);
  const onTheirs = (next: BisOptions) => holder && setPeerOptions({ ...peerOptions, [holder.name]: next });

  return (
    <>
      {people.length > 0 && (
        <div className="row wrap bis-steer">
          <span className="muted small">Loadout for</span>
          <div className="segmented" role="group" aria-label="Whose loadout">
            <button className={segCls(!holder)} onClick={() => setWhose("")} title="Plan from your own inventory dump">
              You
            </button>
            {people.map((p) => (
              <button
                key={p.name}
                className={segCls(holder?.name === p.name)}
                onClick={() => setWhose(p.name)}
                title={p.items ? `Plan from what ${p.name} shares — their bags, bank and Storage` : `${p.name} is sharing; their inventory is on its way`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <BisView {...bis} holder={holder} options={theirs ?? options} onOptions={holder ? onTheirs : onOptions} />
    </>
  );
}
