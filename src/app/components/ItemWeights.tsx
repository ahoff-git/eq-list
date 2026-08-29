"use client";
import { STATS, statMeta, type StatGroup, type StatKey } from "@/shared/item-stats";
import { weightedStats, type StatWeights } from "@/shared/item-search";
import { count } from "@/shared/format";

/** The sections a card's numbers fall into, in the order a card prints them. */
const GROUPS: readonly { key: StatGroup; label: string }[] = [
  { key: "defence", label: "Defence" },
  { key: "attribute", label: "Attributes" },
  { key: "resist", label: "Resists" },
  { key: "weapon", label: "Weapon" },
];

/**
 * The yardstick: how many value points one point of each stat is worth.
 *
 * This is the whole reason the Items tab can sort by anything but a name. No ranking this app
 * invented could be right for both a cleric and a wizard, so the weights are the **player's** — set
 * INT to 2 and WIS to 1 and a ten-wisdom item lands exactly level with a five-intelligence one.
 *
 * Every stat is shown rather than added one at a time from a menu: the sheet is read as a whole ("am
 * I scoring resists at all?"), and a stat you have to go and find is a stat you forget to set. A
 * blank box is *unweighted*, not zero-weighted — the same distinction the cards themselves make —
 * which is why clearing a box removes the key instead of storing a 0.
 *
 * Delay and weight are marked as wanting a negative number. They are the two stats where less is
 * better, and a sheet that scored them like the rest would rank the heaviest, slowest weapon top.
 */
export default function ItemWeights({
  weights,
  onChange,
}: {
  weights: StatWeights;
  onChange: (weights: StatWeights) => void;
}) {
  const scored = weightedStats(weights);

  const setWeight = (key: StatKey, text: string) => {
    const next = { ...weights };
    const value = Number(text);
    if (!text.trim() || !Number.isFinite(value) || value === 0) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <div className="item-weights">
      <div className="row wrap iw-head">
        <span className="muted small">
          {scored.length
            ? `Value = ${scored.map((k) => `${weights[k]}×${statMeta(k).label}`).join(" + ")}`
            : "Give a stat a weight and every item gets a score — 2 for INT and 1 for WIS makes 10 wisdom worth 5 intelligence."}
        </span>
        <span className="spacer" />
        {scored.length > 0 && (
          <button className="btn sm" onClick={() => onChange({})} title="Unweight every stat">
            Clear {count(scored.length, "weight")}
          </button>
        )}
      </div>

      {GROUPS.map((group) => (
        <div className="row wrap iw-group" key={group.key}>
          <span className="iw-group-label muted small">{group.label}</span>
          {STATS.filter((s) => s.group === group.key).map((stat) => (
            <label className="iw-stat" key={stat.key} title={stat.lowerIsBetter ? `${stat.label} — less is better, so weight it negative` : `Points per point of ${stat.label}`}>
              <span className={weights[stat.key] ? "iw-name on" : "iw-name"}>{stat.label}</span>
              <input
                className="field sm iw-box"
                type="number"
                step="any"
                placeholder={stat.lowerIsBetter ? "−" : ""}
                value={weights[stat.key] ?? ""}
                onChange={(e) => setWeight(stat.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
