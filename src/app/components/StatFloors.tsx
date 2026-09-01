"use client";
import { PickField } from "./ui";
import { STATS, statMeta, type StatKey } from "@/shared/item-stats";

/**
 * The stat floors: "at least this much INT".
 *
 * A floor and a weight are different questions and get different controls. A weight says *how much I
 * care*; a floor says *don't show me this at all*. Conflating them — "sort by INT and read down" — is
 * what makes you scroll past forty items to find the six that clear the bar.
 *
 * An item whose card never mentions the stat fails the floor, which is `matchesItem`'s decision and
 * worth knowing about here: silence is not a zero that might squeak through.
 */
export default function StatFloors({
  mins,
  onChange,
}: {
  mins: Partial<Record<StatKey, number>>;
  onChange: (mins: Partial<Record<StatKey, number>>) => void;
}) {
  const chosen = Object.keys(mins) as StatKey[];
  const spare = STATS.filter((s) => mins[s.key] === undefined);

  const add = () => {
    if (spare.length) onChange({ ...mins, [spare[0].key]: 1 });
  };

  const without = (key: StatKey) => {
    const next = { ...mins };
    delete next[key];
    return next;
  };

  /** Move a floor to a different stat, keeping the number you already typed. */
  const retarget = (from: StatKey, to: string) => {
    if (!to || to === from) return;
    onChange({ ...without(from), [to as StatKey]: mins[from] ?? 1 });
  };

  return (
    <div className="row wrap stat-floors">
      {chosen.map((key) => (
        <span className="floor" key={key}>
          <PickField
            value={key}
            blank={statMeta(key).label}
            blankValue={key}
            options={spare.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(to) => retarget(key, to)}
            title="Which stat this floor is about"
          />
          <span className="muted">≥</span>
          <input
            className="field sm"
            type="number"
            step="any"
            value={mins[key] ?? 0}
            onChange={(e) => onChange({ ...mins, [key]: Number(e.target.value) })}
          />
          <button className="btn sm" onClick={() => onChange(without(key))} title={`Stop requiring ${statMeta(key).label}`}>
            ✕
          </button>
        </span>
      ))}
      {spare.length > 0 && (
        <button className="btn sm" onClick={add} title="Require a minimum of some stat">
          + Stat floor
        </button>
      )}
    </div>
  );
}
