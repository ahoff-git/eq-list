"use client";
import { Fragment, useState } from "react";
import { useSettings, useSpellFacts, type SpellFacts } from "@/lib/hooks";
import { sortRows, type Sort } from "@/shared/sorting";
import SortHeader from "./SortHeader";
import type { FightStats, SpellStat } from "@/shared/types";

import { figure } from "@/shared/format";
/**
 * Where your damage came from, spell by spell — and whether each spell earns its cast
 * time. Two figures do the real work here, and neither is in the log:
 *
 *   **Dmg/s cast** — damage divided by the seconds actually spent casting it. A 4s nuke
 *   and a 2s nuke that hit for the same number are not equally good, and this is the
 *   column that says so. Only measured casts count (see `combat-stats.ts`).
 *   **Resist %** — share of completed casts the target shrugged off.
 *
 * Every row is the **blend across invocations**, which is what you want at a glance and
 * misleading if you stop there — an invocation changes damage *and* cast time, so hovering
 * splits the row by the invocation that was active (ADR 0020).
 *
 * Melee gets a synthetic row: it's the rest of your damage, and "where did my damage
 * come from" is a question about the whole pie, not just the spells.
 */
type SortKey = "damage" | "dpc" | "resistRate" | "casts" | "avgCastSec";

export default function SpellTable({ window }: { window: FightStats }) {
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "damage", desc: true });
  const facts = useSpellFacts(window.spells);
  // With the setting on, each invocation gets its own row under the spell's blended one.
  const split = useSettings()?.overlay.splitByMode ?? false;

  // Biggest first by default; clicking the sorted column flips it (`sorting.ts`). Rows the column
  // can't separate keep the order the tracker filed them in, which is damage-descending.
  const spells = sortRows(window.spells, sort, (s, key) => s[key] ?? 0);
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
            <SortHeader label="Casts" column="casts" sort={sort} onSort={setSort} />
            <SortHeader label="Damage" column="damage" sort={sort} onSort={setSort} />
            <th>Healed</th>
            <SortHeader label="Cast" column="avgCastSec" sort={sort} onSort={setSort} title="Average measured cast time" />
            <SortHeader label="Dmg/s cast" column="dpc" sort={sort} onSort={setSort} title="Damage per second spent casting" />
            <th title="Mana cost, from the spell's wiki page">Mana</th>
            <th title="What a point of mana bought: damage, plus any healing the invocation granted off it">
              Per mana
            </th>
            <SortHeader label="Resist" column="resistRate" sort={sort} onSort={setSort} title="Share of completed casts resisted" />
            <th title="Fizzles + interrupts">Failed</th>
          </tr>
        </thead>
        <tbody>
          {spells.map((s) => (
            <Fragment key={s.spell}>
              <tr title={detail(s, facts[s.spell])}>
                <td>{s.spell}</td>
                <td>{s.casts || "—"}</td>
                <td>{figure(s.damage)}</td>
                <td>{figure(s.healed)}</td>
                <td>{s.avgCastSec ? `${s.avgCastSec.toFixed(1)}s` : "—"}</td>
                <td className="num-accent">{s.dpc || "—"}</td>
                <td>{facts[s.spell]?.mana ?? "—"}</td>
                <td className="num-accent">{perMana(s, facts[s.spell]) ?? "—"}</td>
                <td className={s.resistRate >= 0.25 ? "num-bad" : undefined}>
                  {s.resists ? `${Math.round(s.resistRate * 100)}%` : "—"}
                </td>
                <td>{s.fizzles + s.interrupts || "—"}</td>
              </tr>
              {split &&
                s.byInvocation.length > 1 &&
                s.byInvocation.map((m) => (
                  <tr className="spell-mode" key={`${s.spell}-${m.mode}`}>
                    <td>↳ {m.mode}</td>
                    <td>{m.casts || "—"}</td>
                    <td>{figure(m.damage)}</td>
                    <td>{figure(m.healed)}</td>
                    <td>{m.avgCastSec ? `${m.avgCastSec.toFixed(1)}s` : "—"}</td>
                    <td className="num-accent">{m.dpc || "—"}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                ))}
            </Fragment>
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
              <td>—</td>
              <td>—</td>
            </tr>
          )}
        </tbody>
      </table>
      <InvocationNotes window={window} />
    </div>
  );
}

/**
 * What each invocation did beyond scaling numbers: the healing it granted off your damage
 * (divine), and the free casts it handed you (Spell Blade). Shown only when there's
 * something to report — most invocations do neither.
 */
function InvocationNotes({ window }: { window: FightStats }) {
  const notable = window.invocations.filter((i) => i.healed > 0 || i.procs > 0);
  if (!notable.length) return null;

  return (
    <div className="invocation-notes">
      {notable.map((i) => (
        <div key={i.mode} className="inv-note">
          <span className="inv-mode">{i.mode}</span>
          {i.healed > 0 && (
            <span title="Healing this invocation granted off your own spell damage — mana that bought health as well as damage">
              +{i.healed.toLocaleString()} healed
            </span>
          )}
          {i.procs > 0 && (
            <span
              title={`${i.procs} spell landings with no cast of their own, over ${i.swings} swings. Free casts have no log message, so this is inferred — a second landing from one cast (an area spell) would look the same.`}
            >
              {i.procs} free cast{i.procs === 1 ? "" : "s"} in {i.swings} swings (
              {(i.procRate * 100).toFixed(1)}%) · {i.procDamage.toLocaleString()} dmg
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Damage per point of mana, when the wiki knows the cost and the spell did damage. Under an
 * invocation that heals you off your damage, mana buys health too — so the healing is added
 * in rather than making the spell look wasteful. The hover spells out the split.
 */
function perMana(s: SpellStat, facts?: SpellFacts): string | undefined {
  if (!facts?.mana || !s.lands) return undefined;
  const returned = s.damage + s.invocationHealed;
  if (!returned) return undefined;
  return (Math.round((returned / s.lands / facts.mana) * 10) / 10).toString();
}

function detail(s: SpellStat, facts?: SpellFacts): string {
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
    // The wiki's stated cast time next to ours: a big gap usually means the log paired a
    // cast with the wrong landing, so it's worth being able to see both.
    facts?.castSec ? `wiki cast ${facts.castSec}s` : "",
    facts?.mana ? `${facts.mana} mana` : "",
    s.invocationHealed
      ? `+${s.invocationHealed.toLocaleString()} healed by invocation${
          s.lands ? ` (${Math.round(s.invocationHealed / s.lands)}/cast)` : ""
        }`
      : "",
    invocationSplit(s),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The per-invocation breakdown behind a row. Only shown when there's more than one to
 * compare — under a single invocation the row already *is* the answer.
 */
function invocationSplit(s: SpellStat): string {
  if (s.byInvocation.length < 2) return "";
  const parts = s.byInvocation.map((m) => {
    const cast = m.avgCastSec ? ` @ ${m.avgCastSec.toFixed(1)}s` : "";
    const per = m.damage && m.lands ? ` (${Math.round(m.damage / m.lands)}/cast)` : "";
    return `${m.mode}: ${m.casts} casts${cast}${per}`;
  });
  return `by invocation — ${parts.join(" · ")}`;
}
