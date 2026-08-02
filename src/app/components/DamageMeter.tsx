"use client";
import { useState } from "react";
import type { CombatantStat, MeleeTypeStat, SpecialHitStat } from "@/shared/types";

/** Which number the bars are showing. */
export type DamageView = "dealt" | "taken";

/**
 * The bar list: one row per combatant, scaled to the biggest row so relative contribution reads
 * at a glance. Your rows (you + pet) are tinted. Quick numbers that don't earn a column — max hit,
 * accuracy, healing, the stance split — stay on hover; the **breakdown** (melee by weapon/skill and
 * the special hits like Critical / Riposte / Flurry) opens on click, since "which weapon landed
 * that" is a thing you go looking for, not a hover afterthought.
 */
export default function DamageMeter({ rows, view }: { rows: CombatantStat[]; view: DamageView }) {
  const [open, setOpen] = useState<string | null>(null);
  const relevant = rows.filter((r) => value(r, view) > 0);
  const sorted = view === "dealt" ? relevant : [...relevant].sort((a, b) => b.taken - a.taken);
  const top = sorted.length ? value(sorted[0], view) : 0;
  const total = sorted.reduce((n, r) => n + value(r, view), 0);

  return (
    <div className="meters">
      {sorted.map((row) => {
        const v = value(row, view);
        // Old persisted fights predate these fields — treat their absence as "nothing to expand".
        const byType = row.byType ?? [];
        const specials = row.specials ?? [];
        const canExpand = byType.length > 0 || specials.length > 0;
        const isOpen = open === row.name;
        return (
          <div className="meter-group" key={row.name}>
            <div
              className={`meter ${row.mine ? "mine" : ""} ${canExpand ? "expandable" : ""}`}
              title={detail(row)}
              onClick={canExpand ? () => setOpen(isOpen ? null : row.name) : undefined}
            >
              <div className="meter-bar" style={{ width: `${top > 0 ? Math.max(2, (v / top) * 100) : 0}%` }} />
              {canExpand && <span className="meter-caret">{isOpen ? "▾" : "▸"}</span>}
              <span className="meter-name">{row.name}</span>
              <span className="meter-nums">
                {v.toLocaleString()} <span className="muted">({total > 0 ? Math.round((v / total) * 100) : 0}%)</span>
                {view === "dealt" && <span className="meter-dps"> {row.dps}/s</span>}
              </span>
            </div>
            {isOpen && <Breakdown byType={byType} specials={specials} />}
          </div>
        );
      })}
    </div>
  );
}

const value = (row: CombatantStat, view: DamageView): number => (view === "dealt" ? row.dealt : row.taken);

/** The melee-by-weapon and special-hits breakdown revealed under an opened row. */
function Breakdown({ byType, specials }: { byType: MeleeTypeStat[]; specials: SpecialHitStat[] }) {
  return (
    <div className="meter-breakdown">
      {byType.length > 0 && (
        <div className="mb-section">
          <span className="mb-title">by weapon / skill</span>
          {byType.map((t) => (
            <div className="mb-row" key={t.type}>
              <span className="mb-label">{t.type}</span>
              <span className="mb-hits muted">{t.hits}×</span>
              <span className="spacer" />
              <span className="mb-dmg">{t.damage.toLocaleString()}</span>
              <span className="muted small">max {t.maxHit.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {specials.length > 0 && (
        <div className="mb-section">
          <span className="mb-title">special hits</span>
          {specials.map((s) => (
            <div className="mb-row" key={s.kind}>
              <span className="mb-label">{s.kind}</span>
              <span className="mb-hits muted">{s.hits}×</span>
              <span className="spacer" />
              {s.damage > 0 && <span className="mb-dmg">{s.damage.toLocaleString()}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    (row.byType?.length ?? 0) || (row.specials?.length ?? 0) ? "click for the weapon / special-hit breakdown" : "",
    stanceSplit(row),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Your melee by stance — shown only when more than one stance contributed. */
function stanceSplit(row: CombatantStat): string {
  if (row.byStance.length < 2) return "";
  const parts = row.byStance.map((s) => {
    const swings = s.hits + s.misses;
    const acc = swings ? ` ${Math.round((s.hits / swings) * 100)}%` : "";
    return `${s.stance}: ${s.damage.toLocaleString()}${acc}`;
  });
  return `melee by stance — ${parts.join(" · ")}`;
}
