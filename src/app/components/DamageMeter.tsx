"use client";
import { useState } from "react";
import type { CombatantStat } from "@/shared/types";

/** Which number the bars are showing. */
export type DamageView = "dealt" | "taken";

/**
 * The bar list: one row per combatant, scaled to the biggest row so relative contribution reads
 * at a glance. Your rows (you + pet) are tinted. Quick numbers that don't earn a column — max hit,
 * accuracy, healing, the stance split — stay on hover; the **breakdown** opens on click into three
 * collapsible groups (Melee, Spells, Special hits), each drilling into its detail. Melee + Spells
 * account for the whole of that row's damage; "which weapon landed that" is a thing you go looking
 * for, not a hover afterthought.
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
        const canExpand = hasBreakdown(row);
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
            {isOpen && <Breakdown row={row} />}
          </div>
        );
      })}
    </div>
  );
}

const value = (row: CombatantStat, view: DamageView): number => (view === "dealt" ? row.dealt : row.taken);

/** Old persisted fights predate these fields — treat their absence as "nothing to expand". */
function hasBreakdown(row: CombatantStat): boolean {
  return (row.byType?.length ?? 0) > 0 || (row.bySpell?.length ?? 0) > 0 || (row.specials?.length ?? 0) > 0;
}

/** The three damage-source groups under an opened row, each collapsible into its detail. */
function Breakdown({ row }: { row: CombatantStat }) {
  const byType = row.byType ?? [];
  const bySpell = row.bySpell ?? [];
  const specials = row.specials ?? [];
  return (
    <div className="meter-breakdown">
      {byType.length > 0 && (
        <Group title="Melee" total={sum(byType, (t) => t.damage)} note={`${sum(byType, (t) => t.hits)} hits`}>
          {byType.map((t) => (
            <DetailRow key={t.type} label={t.type} hits={t.hits} damage={t.damage} maxHit={t.maxHit} />
          ))}
        </Group>
      )}
      {bySpell.length > 0 && (
        <Group title="Spells" total={sum(bySpell, (s) => s.damage)} note={`${bySpell.length} source${bySpell.length === 1 ? "" : "s"}`}>
          {bySpell.map((s) => (
            <DetailRow key={s.spell} label={s.spell} hits={s.hits} damage={s.damage} maxHit={s.maxHit} />
          ))}
        </Group>
      )}
      {specials.length > 0 && (
        <Group title="Special hits" note={`${sum(specials, (s) => s.hits)} hits`}>
          {specials.map((s) => (
            <DetailRow key={s.kind} label={s.kind} hits={s.hits} damage={s.damage} />
          ))}
        </Group>
      )}
    </div>
  );
}

/** A collapsible group header (Melee / Spells / Special hits) with its damage total, opening its rows. */
function Group({ title, total, note, children }: { title: string; total?: number; note: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mb-group ${open ? "open" : ""}`}>
      <div className="mb-group-head" onClick={() => setOpen((o) => !o)}>
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="mb-group-title">{title}</span>
        <span className="spacer" />
        {total !== undefined && <span className="mb-group-total">{total.toLocaleString()}</span>}
        <span className="muted small">{note}</span>
      </div>
      {open && <div className="mb-group-body">{children}</div>}
    </div>
  );
}

/** One source line inside a group: what it was, how many, how much, biggest. */
function DetailRow({ label, hits, damage, maxHit }: { label: string; hits: number; damage: number; maxHit?: number }) {
  return (
    <div className="mb-row">
      <span className="mb-label">{label}</span>
      <span className="mb-hits muted">{hits}×</span>
      <span className="spacer" />
      {damage > 0 && <span className="mb-dmg">{damage.toLocaleString()}</span>}
      {maxHit !== undefined && maxHit > 0 && <span className="muted small">max {maxHit.toLocaleString()}</span>}
    </div>
  );
}

const sum = <T,>(xs: T[], pick: (x: T) => number): number => xs.reduce((n, x) => n + pick(x), 0);

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
    hasBreakdown(row) ? "click for the melee / spell / special breakdown" : "",
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
