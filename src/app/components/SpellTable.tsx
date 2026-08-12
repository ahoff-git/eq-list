"use client";
import { Fragment, useState } from "react";
import { useSettings, useSpellFacts, type SpellFacts } from "@/lib/hooks";
import { sortRows, type Sort } from "@/shared/sorting";
import SortHeader from "./SortHeader";
import { Caret, Empty } from "./ui";
import type { FightStats, SpellStat } from "@/shared/types";

import { count, figure, percent } from "@/shared/format";
import { ratio } from "@/shared/numbers";
/**
 * A resist rate worth flagging. One in four casts wasted is the point where the spell is the problem
 * rather than the luck — below that it's variance on a small number of casts.
 */
const HIGH_RESIST_RATE = 0.25;

/** Columns in the table, so an opened breakdown spans the whole width. Keep in step with `<thead>`. */
const COLUMNS = 10;

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
 * misleading if you stop there — an invocation changes damage *and* cast time, so the
 * breakdown splits the row by the invocation that was active (ADR 0020).
 *
 * A row's `Damage` is everything that spell did, a DoT's ticks included
 * ([ADR 0071](../../../specs/decisions/0071-a-dot-tick-belongs-to-whoever-cast-it.md)) — which
 * is the honest total and, on a DoT, hides where it came from. **Clicking a row opens the
 * breakdown**: the hit against the ticks, how many there were, how big they got, and what the
 * casts that never landed cost. Too many figures for a hover, which is what they used to be.
 *
 * Melee gets a synthetic row: it's the rest of your damage, and "where did my damage
 * come from" is a question about the whole pie, not just the spells.
 */
type SortKey = "damage" | "dpc" | "resistRate" | "casts" | "avgCastSec";

export default function SpellTable({ window }: { window: FightStats }) {
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "damage", desc: true });
  /** One breakdown open at a time — two of them side by side is a table, not a drill-down. */
  const [open, setOpen] = useState<string | null>(null);
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
      <Empty
        title="No spells cast yet."
        hint="Cast something — cast times are measured from the log as spells land."
      />
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
              <tr
                className="spell-row expandable"
                title={`Click for ${s.spell}'s breakdown`}
                onClick={() => setOpen(open === s.spell ? null : s.spell)}
              >
                <td>
                  <Caret open={open === s.spell} /> {s.spell}
                </td>
                <td>{s.casts || "—"}</td>
                <td>{figure(s.damage)}</td>
                <td>{figure(s.healed)}</td>
                <td>{s.avgCastSec ? `${s.avgCastSec.toFixed(1)}s` : "—"}</td>
                <td className="num-accent">{s.dpc || "—"}</td>
                <td>{facts[s.spell]?.mana ?? "—"}</td>
                <td className="num-accent">{perMana(s, facts[s.spell]) ?? "—"}</td>
                <td className={s.resistRate >= HIGH_RESIST_RATE ? "num-bad" : undefined}>
                  {s.resists ? percent(s.resistRate) : "—"}
                </td>
                <td>{s.fizzles + s.interrupts || "—"}</td>
              </tr>
              {open === s.spell && (
                <tr className="spell-detail">
                  <td colSpan={COLUMNS}>
                    <Breakdown spell={s} facts={facts[s.spell]} />
                  </td>
                </tr>
              )}
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
              {count(i.procs, "free cast")} in {i.swings} swings (
              {percent(i.procRate, { places: 1 })}) · {i.procDamage.toLocaleString()} dmg
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
 * in rather than making the spell look wasteful. The breakdown spells out the split.
 */
function perMana(s: SpellStat, facts?: SpellFacts): string | undefined {
  if (!facts?.mana || !s.lands) return undefined;
  const returned = s.damage + s.invocationHealed;
  if (!returned) return undefined;
  return ratio(returned, s.lands * facts.mana, 1).toString();
}

/**
 * What's behind a row, laid out in groups. A DoT is the reason this exists as a panel rather
 * than a hover: its damage is one landing plus a long tail of ticks, and a single total says
 * nothing about which of the two the spell is actually made of.
 *
 * Every group hides itself when it has nothing to report, so a plain nuke shows two lines and a
 * DoT with a resist wall shows six — the panel is as long as the spell is complicated.
 */
function Breakdown({ spell, facts }: { spell: SpellStat; facts?: SpellFacts }) {
  return (
    <div className="spell-breakdown">
      {statGroups(spell, facts).map((g) => (
        <div className="spell-group" key={g.caption}>
          <span className="dmg-caption">{g.caption}</span>
          {g.items.map((item) => (
            <span className="spell-stat" key={item.label} title={item.title}>
              {item.value} <span className="muted">{item.label}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** One figure in the breakdown: the number, what it is, and why it's worth knowing. */
interface Stat {
  label: string;
  value: string;
  title?: string;
}

interface StatGroup {
  caption: string;
  items: Stat[];
}

/**
 * Every figure the tracker keeps about one spell, grouped by the question it answers. Computed
 * here rather than in the JSX so the render stays a list of what's non-empty (`CLAUDE.md`), and
 * so "what does the panel show" is one function to read.
 */
function statGroups(s: SpellStat, facts?: SpellFacts): StatGroup[] {
  const ticks = s.ticks ?? 0;
  // Older stored fights recorded the tick *count* but not its damage, so the split can't be
  // shown for them — the total is still right, it just can't be taken apart.
  const tickDamage = s.tickDamage ?? 0;
  const hitDamage = s.damage - tickDamage;
  const failed = s.resists + s.blocked + s.fizzles + s.interrupts;

  const landed: Stat[] = [
    { label: "landed", value: s.lands.toLocaleString(), title: "Casts that put damage or a heal on something. A DoT counts once, when it first lands." },
    s.maxHit ? { label: "biggest", value: s.maxHit.toLocaleString(), title: "The largest single landing" } : null,
    s.lands && hitDamage > 0
      ? { label: "per landing", value: Math.round(hitDamage / s.lands).toLocaleString(), title: "Direct damage per landing, before any ticks" }
      : null,
  ].filter(nonNull);

  const overTime: Stat[] = ticks
    ? [
        { label: "ticks", value: ticks.toLocaleString(), title: "Damage-over-time ticks logged after the spell landed" },
        tickDamage ? { label: "from ticks", value: tickDamage.toLocaleString(), title: `Of this spell's ${s.damage.toLocaleString()} damage, what the ticks did` } : null,
        tickDamage ? { label: "per tick", value: Math.round(tickDamage / ticks).toLocaleString(), title: "Mean damage per tick" } : null,
        s.maxTick ? { label: "biggest tick", value: s.maxTick.toLocaleString() } : null,
        // The share is the figure that settles "is this a DoT or a nuke with a trailer".
        tickDamage && s.damage
          ? { label: "of its damage", value: percent(ratio(tickDamage, s.damage)), title: "How much of the spell's total the ticks account for" }
          : null,
      ].filter(nonNull)
    : [];

  // Resist rates vary hugely by mob, so name the culprits — an overall 4% can hide a
  // 30% wall on one family of mobs.
  const resistedBy = s.resistedBy
    .slice(0, 4)
    .map((r) => `${r.target} ${r.count}`)
    .join(", ");
  const wasted: Stat[] = failed
    ? [
        s.resists ? { label: "resisted", value: s.resists.toLocaleString(), title: resistedBy ? `Resisted by ${resistedBy}` : undefined } : null,
        s.blocked ? { label: "blocked", value: s.blocked.toLocaleString(), title: "Landed on a target already holding a better version" } : null,
        s.fizzles ? { label: "fizzled", value: s.fizzles.toLocaleString() } : null,
        s.interrupts ? { label: "interrupted", value: s.interrupts.toLocaleString() } : null,
      ].filter(nonNull)
    : [];

  const healing: Stat[] = [
    s.healed ? { label: "healed", value: s.healed.toLocaleString() } : null,
    s.overhealed && s.healed + s.overhealed > 0
      ? { label: "overhealed", value: percent(ratio(s.overhealed, s.healed + s.overhealed)), title: `${s.overhealed.toLocaleString()} hit points the heal would have restored but didn't` }
      : null,
    s.invocationHealed
      ? {
          label: "healed by invocation",
          value: `+${s.invocationHealed.toLocaleString()}`,
          title: `Health the invocation granted off this spell's damage${s.lands ? ` — ${Math.round(s.invocationHealed / s.lands)} per cast` : ""}`,
        }
      : null,
  ].filter(nonNull);

  // The wiki's stated cast time next to ours: a big gap usually means the log paired a cast
  // with the wrong landing, so it's worth being able to see both.
  const wiki: Stat[] = [
    facts?.castSec ? { label: "wiki cast time", value: `${facts.castSec}s`, title: "What the wiki states, against the measured figure in the row above" } : null,
    facts?.mana ? { label: "mana", value: facts.mana.toLocaleString() } : null,
  ].filter(nonNull);

  // Under a single invocation the row already *is* the answer, so there's nothing to compare.
  const byMode: Stat[] =
    s.byInvocation.length > 1
      ? s.byInvocation.map((m) => ({
          label: m.mode,
          value: count(m.casts, "cast"),
          title: [
            `${m.damage.toLocaleString()} damage`,
            m.avgCastSec ? `${m.avgCastSec.toFixed(1)}s average cast` : "",
            m.damage && m.lands ? `${Math.round(m.damage / m.lands)} per cast` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        }))
      : [];

  return [
    { caption: "casts", items: landed },
    { caption: "over time", items: overTime },
    { caption: "wasted", items: wasted },
    { caption: "healing", items: healing },
    { caption: "by invocation", items: byMode },
    { caption: "the wiki says", items: wiki },
  ].filter((g) => g.items.length > 0);
}

const nonNull = <T,>(x: T | null): x is T => x !== null;
