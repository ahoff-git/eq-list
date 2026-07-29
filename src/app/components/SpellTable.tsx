"use client";
import { useState } from "react";
import type { FightStats, SpellStat } from "@/shared/types";

/**
 * Where your damage came from, spell by spell — and whether each spell earns its cast
 * time. Two figures do the real work here, and neither is in the log:
 *
 *   **Dmg/s cast** — damage divided by the seconds actually spent casting it. A 4s nuke
 *   and a 2s nuke that hit for the same number are not equally good, and this is the
 *   column that says so. Only measured casts count (see `combat-stats.ts`).
 *   **Resist %** — share of completed casts the target shrugged off.
 *
 * Melee gets a synthetic row: it's the rest of your damage, and "where did my damage
 * come from" is a question about the whole pie, not just the spells.
 */
type SortKey = "damage" | "dpc" | "resistRate" | "casts" | "avgCastSec";

export default function SpellTable({ window }: { window: FightStats }) {
  const [sort, setSort] = useState<SortKey>("damage");

  const spells = [...window.spells].sort((a, b) => b[sort] - a[sort] || b.damage - a.damage);
  const spellDamage = window.spells.reduce((n, s) => n + s.damage, 0);
  const melee = window.yourDealt - spellDamage;

  if (!window.spells.length && melee <= 0) {
    return (
      <div className="empty">
        <p>No spells cast yet.</p>
        <p className="small">Cast something — cast times are measured from the log as spells land.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="stat-table spell-table">
        <thead>
          <tr>
            <th>Spell</th>
            <Th label="Casts" k="casts" sort={sort} onSort={setSort} />
            <Th label="Damage" k="damage" sort={sort} onSort={setSort} />
            <th>Healed</th>
            <Th label="Cast" k="avgCastSec" sort={sort} onSort={setSort} title="Average measured cast time" />
            <Th label="Dmg/s cast" k="dpc" sort={sort} onSort={setSort} title="Damage per second spent casting" />
            <Th label="Resist" k="resistRate" sort={sort} onSort={setSort} title="Share of completed casts resisted" />
            <th title="Fizzles + interrupts">Failed</th>
          </tr>
        </thead>
        <tbody>
          {spells.map((s) => (
            <tr key={s.spell} title={detail(s)}>
              <td>{s.spell}</td>
              <td>{s.casts || "—"}</td>
              <td>{s.damage ? s.damage.toLocaleString() : "—"}</td>
              <td>{s.healed ? s.healed.toLocaleString() : "—"}</td>
              <td>{s.avgCastSec ? `${s.avgCastSec.toFixed(1)}s` : "—"}</td>
              <td className="num-accent">{s.dpc || "—"}</td>
              <td className={s.resistRate >= 0.25 ? "num-bad" : undefined}>
                {s.resists ? `${Math.round(s.resistRate * 100)}%` : "—"}
              </td>
              <td>{s.fizzles + s.interrupts || "—"}</td>
            </tr>
          ))}
          {melee > 0 && (
            <tr className="spell-melee" title="Everything you and your pet dealt that wasn't a named spell">
              <td>Melee swings</td>
              <td>—</td>
              <td>{melee.toLocaleString()}</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** A sortable column header (click to sort by it; the active one is marked). */
function Th({
  label,
  k,
  sort,
  onSort,
  title,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  title?: string;
}) {
  return (
    <th className={`sortable ${sort === k ? "sorted" : ""}`} title={title ?? `Sort by ${label.toLowerCase()}`}>
      <button onClick={() => onSort(k)}>
        {label}
        {sort === k ? " ▾" : ""}
      </button>
    </th>
  );
}

function detail(s: SpellStat): string {
  // Resist rates vary hugely by mob, so name the culprits — an overall 4% can hide a
  // 30% wall on one family of mobs.
  const resistedBy = s.resistedBy
    .slice(0, 4)
    .map((r) => `${r.target} ${r.count}`)
    .join(", ");
  const overheal =
    s.overhealed && s.healed + s.overhealed > 0
      ? `${Math.round((s.overhealed / (s.healed + s.overhealed)) * 100)}% overhealed`
      : "";
  return [
    `${s.lands} landed`,
    s.ticks ? `${s.ticks} ticks` : "",
    s.maxHit ? `max hit ${s.maxHit.toLocaleString()}` : "",
    s.resists ? `${s.resists} resisted${resistedBy ? ` (${resistedBy})` : ""}` : "",
    s.blocked ? `${s.blocked} blocked` : "",
    s.fizzles ? `${s.fizzles} fizzled` : "",
    s.interrupts ? `${s.interrupts} interrupted` : "",
    overheal,
  ]
    .filter(Boolean)
    .join(" · ");
}
