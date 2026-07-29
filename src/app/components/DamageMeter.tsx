"use client";
import type { CombatantStat } from "@/shared/types";

/** Which number the bars are showing. */
export type DamageView = "dealt" | "taken";

/**
 * The bar list: one row per combatant, scaled to the biggest row so relative
 * contribution reads at a glance. Your rows (you + pet) are tinted; the numbers that
 * don't earn a column — max hit, accuracy, crits, healing — are on hover.
 */
export default function DamageMeter({ rows, view }: { rows: CombatantStat[]; view: DamageView }) {
  const relevant = rows.filter((r) => value(r, view) > 0);
  const sorted = view === "dealt" ? relevant : [...relevant].sort((a, b) => b.taken - a.taken);
  const top = sorted.length ? value(sorted[0], view) : 0;
  const total = sorted.reduce((n, r) => n + value(r, view), 0);

  return (
    <div className="meters">
      {sorted.map((row) => {
        const v = value(row, view);
        return (
          <div className={`meter ${row.mine ? "mine" : ""}`} key={row.name} title={detail(row)}>
            <div className="meter-bar" style={{ width: `${top > 0 ? Math.max(2, (v / top) * 100) : 0}%` }} />
            <span className="meter-name">{row.name}</span>
            <span className="meter-nums">
              {v.toLocaleString()} <span className="muted">({total > 0 ? Math.round((v / total) * 100) : 0}%)</span>
              {view === "dealt" && <span className="meter-dps"> {row.dps}/s</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const value = (row: CombatantStat, view: DamageView): number => (view === "dealt" ? row.dealt : row.taken);

/** Hover detail — the numbers that don't earn a column of their own. */
function detail(row: CombatantStat): string {
  const swings = row.hits + row.misses;
  return [
    `${row.dealt.toLocaleString()} dealt · ${row.taken.toLocaleString()} taken`,
    `max hit ${row.maxHit.toLocaleString()}`,
    swings > 0 ? `${Math.round((row.hits / swings) * 100)}% of ${swings} swings landed` : "",
    row.crits > 0 ? `${row.crits} critical${row.crits === 1 ? "" : "s"}` : "",
    row.healed > 0 ? `healed ${row.healed.toLocaleString()}` : "",
    `active ${row.activeSec}s`,
  ]
    .filter(Boolean)
    .join(" · ");
}
