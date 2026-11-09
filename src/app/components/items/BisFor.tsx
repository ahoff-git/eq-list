"use client";
import { useMemo, useState, type ComponentProps } from "react";
import BisView from "@/app/components/items/BisView";
import { segCls } from "@/app/components/ui";
import { usePeerInventories, usePeerStats } from "@/lib/exports/useGameExports";
import { exportAgeText } from "@/shared/game-exports";
import { MAX_PLAYER_LEVEL } from "@/shared/items/item-levels";
import { applyStatsRead } from "@/shared/items/stat-read-apply";
import { readOfRecord, whoText } from "@/shared/items/stats-record";
import { wornStats } from "@/shared/items/worn-stats";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { normalizeBisOptions, startFromYours, type BisOptions } from "@/shared/items/bis-options";

/**
 * The loadout builder, for you or for anyone sharing their inventory with you (ADR 0342). Picking a
 * person plans from what they hold, with locks, wanted effects and exclusions of their own — kept by
 * name, so trying things on their gear never touches your plan. A person's plan starts from your
 * settings (hunting, grade, melee weights) with none of your changes — and none of your calibration, which
 * is about your own character.
 *
 * A person who also shared their **stats** can be planned for in their real numbers (ADR 0371): *Plan as them* sets
 * their classes, race and level (the Class and Race pickers and the level slider — yours, so it says so) and measures
 * what the game showed them against what *they* wear, so a floor means what their own window would show.
 *
 * Its own component so the peers are only asked for their inventories (and stats) while the builder is open.
 */
export default function BisFor({ options, onOptions, ...bis }: ComponentProps<typeof BisView>) {
  const people = usePeerInventories();
  const shared = usePeerStats();
  // Whose plan is showing, by name — "" is yours. Not remembered: who's sharing changes session to session.
  const [whose, setWhose] = useState("");
  const [peerOptions, setPeerOptions] = usePersistentState<Record<string, BisOptions>>(STORAGE_KEYS.itemBisPeerOptions, {});
  const holder = people.find((p) => p.name === whose);
  const stored = holder ? peerOptions[holder.name] : undefined;
  const planning = !!holder;
  const theirs = useMemo(() => (planning ? (stored ? normalizeBisOptions(stored) : startFromYours(options)) : undefined), [planning, stored, options]);
  const onTheirs = (next: BisOptions) => holder && setPeerOptions({ ...peerOptions, [holder.name]: next });
  const theirStats = holder ? shared.find((s) => s.name === holder.name) : undefined;
  const usingTheirs = !!theirs && Object.keys(theirs.calibration).length > 0;
  const planAsThem = () => {
    if (!holder?.items || !theirStats || !theirs) return;
    const { record } = theirStats;
    // Measured against *their* gear and *their* race, classes and level — the figures are the game's totals for them.
    const applied = applyStatsRead({
      read: readOfRecord(record),
      planner: { race: record.race, classes: record.classes, level: record.level ?? MAX_PLAYER_LEVEL },
      worn: wornStats(holder.items, bis.rows),
      calibration: {},
    });
    onTheirs({ ...theirs, calibration: applied.calibration });
    bis.onWho?.({ classes: record.classes, ...(record.level !== undefined && { level: record.level }), ...(record.race && { race: record.race }) });
  };

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
      {holder && theirStats && (
        <div className="row wrap bis-steer small">
          <span className="muted">
            {holder.name} shared their stats — {whoText(theirStats.record)}, read {exportAgeText(Date.now() - theirStats.at)}.
            {usingTheirs ? " Floors count their real numbers." : ""}
          </span>
          <button
            className="btn sm"
            disabled={!holder.items}
            onClick={planAsThem}
            title="Sets your Class and Race pickers and the level slider to theirs, and measures the figures their game showed against what they wear — so a floor means what their own Inventory window would say. Their inventory has to have arrived."
          >
            {usingTheirs ? `Refresh from ${holder.name}'s latest` : `Plan as ${holder.name}`}
          </button>
        </div>
      )}
      <BisView {...bis} holder={holder} options={theirs ?? options} onOptions={holder ? onTheirs : onOptions} />
    </>
  );
}
