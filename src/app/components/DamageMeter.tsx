"use client";
import { useState } from "react";
import { drillDown } from "@/shared/damage-tree";
import type { CombatantStat, DamageAxis, DamageCell, DamageNode, SpecialHitStat } from "@/shared/types";

/** Which number the bars are showing. */
export type DamageView = "dealt" | "taken";

/**
 * The bar list: one row per combatant, scaled to the biggest row so relative contribution reads
 * at a glance. Your rows (you + pet) are tinted.
 *
 * Click a row to drill into it. What the levels *are* is the caller's choice (`drill`, one of
 * `DamagePanel`'s `LAYOUTS`) — this component only knows how to render a roll-up, so a new
 * question is a new axis order, not a new component:
 *
 *   Targets    a coyote  →  who hit it    →  Melee / Spell / Other  →  which skill or spell
 *   Dealers    You       →  what you hit  →  Melee / Spell / Other  →  which skill or spell
 *   Abilities  You       →  Melee / Spell →  which skill or spell   →  what it landed on
 *
 * Every level sums exactly to the one above it, so the shares always add up — which the old
 * three-peer-groups breakdown didn't (and in the taken view it showed the row's *dealt*
 * sources beneath a *taken* total). Qualifiers — Critical, Riposte, Flurry — are the one thing
 * that can't be a level, because they overlap the sources rather than partitioning them; they
 * sit at the bottom as an explicit "of these hits" line.
 */
export default function DamageMeter({
  rows,
  view,
  drill,
  cells,
}: {
  rows: CombatantStat[];
  view: DamageView;
  /** Which axes the drill-down fans out along, outermost first — the caller's question (`LAYOUTS`). */
  drill: DamageAxis[];
  /** The window's damage cells. Absent on fights stored before they existed. */
  cells?: DamageCell[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const relevant = rows.filter((r) => value(r, view) > 0);
  const sorted = view === "dealt" ? relevant : [...relevant].sort((a, b) => b.taken - a.taken);
  const top = sorted.length ? value(sorted[0], view) : 0;
  const total = sorted.reduce((n, r) => n + value(r, view), 0);
  // The tree needs to know whose rows are yours; the rows already say, so nothing here has to
  // re-derive who the player is.
  const mine = (name: string): boolean => rows.find((r) => r.name === name)?.mine ?? false;

  return (
    <div className="meters">
      {sorted.map((row) => {
        const v = value(row, view);
        const isOpen = open === row.name;
        // Rolled up only for the row on show: the meter re-renders several times a second, and
        // nothing below the fold needs computing to know a caret belongs on the line.
        const nodes = isOpen ? breakdown(row, view, drill, cells, mine) : [];
        const canExpand = hasBreakdown(row, view, cells) || row.specials?.length > 0;
        return (
          <div className="meter-group" key={row.name}>
            <div
              className={`meter ${row.mine ? "mine" : ""} ${canExpand ? "expandable" : ""}`}
              title={detail(row, view, canExpand)}
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
            {isOpen && (
              <div className="meter-breakdown">
                {nodes.length > 0 ? (
                  <Level nodes={nodes} />
                ) : (
                  <p className="muted small">
                    This fight was recorded before the breakdown existed, so only its totals were kept.
                  </p>
                )}
                <Qualifiers specials={row.specials ?? []} hits={row.hits} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const value = (row: CombatantStat, view: DamageView): number => (view === "dealt" ? row.dealt : row.taken);

/** Whether there's anything under the row — the cheap question, asked of every row. */
function hasBreakdown(row: CombatantStat, view: DamageView, cells?: DamageCell[]): boolean {
  const axis = view === "dealt" ? "attacker" : "target";
  if (cells?.length) return cells.some((c) => c[axis] === row.name);
  return view === "dealt" && ((row.byType?.length ?? 0) > 0 || (row.bySpell?.length ?? 0) > 0);
}

/**
 * The tree under a row: from the row as the dealer in the dealt view, as the victim in the
 * taken view. A fight stored before the cells existed keeps only the dealer's own
 * kind/source split, so that much is rebuilt from it — there's nothing to rebuild a *taken*
 * tree from, since a victim's attackers were never recorded.
 */
function breakdown(
  row: CombatantStat,
  view: DamageView,
  drill: DamageAxis[],
  cells: DamageCell[] | undefined,
  mine: (name: string) => boolean,
): DamageNode[] {
  if (cells?.length) return drillDown(cells, view === "dealt" ? "attacker" : "target", row.name, drill, mine);
  return view === "dealt" ? legacyNodes(row) : [];
}

/** One level of the tree: what it splits by, then its rows. */
function Level({ nodes }: { nodes: DamageNode[] }) {
  return (
    <div className="dmg-level">
      <div className="dmg-caption">{CAPTIONS[nodes[0].axis]}</div>
      {nodes.map((node) => (
        // With one child there's nothing to compare it against, so open it and save the click.
        <Node key={node.label} node={node} startOpen={nodes.length === 1} />
      ))}
    </div>
  );
}

/** What each level answers, so the reader never has to infer it from the indentation. */
const CAPTIONS: Record<DamageNode["axis"], string> = {
  target: "on",
  attacker: "from",
  kind: "how",
  source: "with",
};

function Node({ node, startOpen }: { node: DamageNode; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const canExpand = node.children.length > 0;
  return (
    <div className={`dmg-node ${node.mine ? "mine" : ""}`}>
      <div
        className={`dmg-head ${canExpand ? "expandable" : ""}`}
        title={nodeDetail(node)}
        onClick={canExpand ? () => setOpen((o) => !o) : undefined}
      >
        <div className="dmg-share" style={{ width: `${Math.max(1, node.share * 100)}%` }} />
        <span className="caret">{canExpand ? (open ? "▾" : "▸") : ""}</span>
        <span className="dmg-label">{node.label}</span>
        <span className="spacer" />
        <span className="dmg-nums">
          {node.damage.toLocaleString()} <span className="muted">({pct(node.share)})</span>
        </span>
        <span className="dmg-meta muted small">{meta(node)}</span>
      </div>
      {open && canExpand && <Level nodes={node.children} />}
    </div>
  );
}

/** The metrics that fit on the line; `nodeDetail` has the rest. */
function meta(node: DamageNode): string {
  const swings = node.hits - node.ticks + node.misses;
  return [
    `${node.hits}×`,
    node.crits > 0 ? `${pct(node.critRate)} crit` : "",
    node.misses > 0 ? `${pct(node.hitRate)} of ${swings}` : "",
    node.maxHit > 0 ? `max ${node.maxHit.toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Every metric for the level, spelled out — the line above is the abbreviation. Multi-line,
 * because the shares alone are five figures and a run-on sentence of percentages is unreadable.
 */
function nodeDetail(node: DamageNode): string {
  const swings = node.hits - node.ticks + node.misses;
  const avg = node.hits > 0 ? Math.round(node.damage / node.hits) : 0;
  return [
    `${node.label} — ${node.damage.toLocaleString()} damage`,
    node.hits > 0 ? `${node.hits} hits · ${avg} average · ${node.maxHit.toLocaleString()} biggest` : "",
    node.ticks > 0 ? `${node.ticks} of them damage-over-time ticks` : "",
    swings > 0 ? `${pct(node.hitRate)} of ${swings} swings landed (${node.misses} missed)` : "",
    node.crits > 0 ? `${node.crits} critical (${pct(node.critRate)} of hits)` : "",
    "",
    ...shareLines(node),
    node.children.length > 0 ? `\nclick to split by ${CAPTIONS[node.children[0].axis]}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * The same damage as a share of each denominator that means something here (`DamageShares`).
 * Every line names what it's a share of — a bare percentage next to four others is a riddle.
 */
function shareLines(node: DamageNode): string[] {
  const { ofFight, ofTarget, ofAttacker, ofAttackerOnTarget } = node.of;
  const whose = node.byAttacker === "You" ? "your" : `${node.byAttacker}'s`;
  return [
    `${pct(node.share)} of the level above`,
    ofTarget !== undefined ? `${pct(ofTarget)} of all damage on ${node.onTarget}` : "",
    ofAttackerOnTarget !== undefined ? `${pct(ofAttackerOnTarget)} of ${whose} damage on ${node.onTarget}` : "",
    ofFight !== undefined ? `${pct(ofFight)} of the whole fight` : "",
    ofAttacker !== undefined ? `${pct(ofAttacker)} of ${whose} damage in the fight` : "",
  ].filter(Boolean);
}

/**
 * Qualifiers the log tagged hits with. Kept apart from the tree and labelled as such because
 * they *overlap* it — a critical slash is already counted under Melee → Slash — so summing
 * these with the levels above would double-count. That confusion is exactly what this replaces.
 */
function Qualifiers({ specials, hits }: { specials: SpecialHitStat[]; hits: number }) {
  if (!specials.length) return null;
  return (
    <div className="dmg-qualifiers">
      <span className="dmg-caption">of these hits</span>
      {specials.map((s) => (
        <span key={s.kind} title={`${s.kind} on ${s.hits} of ${hits} landed hits, for ${s.damage.toLocaleString()} damage`}>
          {s.kind} <span className="muted">{s.hits}×</span>
          {hits > 0 && <span className="muted small"> ({Math.round((s.hits / hits) * 100)}%)</span>}
        </span>
      ))}
    </div>
  );
}

/** A row's own kind/source split, from the fields that predate the cells. */
function legacyNodes(row: CombatantStat): DamageNode[] {
  const groups: [kind: DamageNode["label"], sources: { label: string; hits: number; damage: number; maxHit: number }[]][] = [
    ["Melee", (row.byType ?? []).map((t) => ({ label: t.type, hits: t.hits, damage: t.damage, maxHit: t.maxHit }))],
    ["Spell", (row.bySpell ?? []).map((s) => ({ label: s.spell, hits: s.hits, damage: s.damage, maxHit: s.maxHit }))],
  ];
  const total = groups.reduce((n, [, sources]) => n + sum(sources, (s) => s.damage), 0);
  return groups
    .filter(([, sources]) => sources.length > 0)
    .map(([kind, sources]) => {
      const damage = sum(sources, (s) => s.damage);
      return {
        ...bare(kind, "kind", damage, total),
        hits: sum(sources, (s) => s.hits),
        maxHit: Math.max(...sources.map((s) => s.maxHit)),
        children: sources.map((s) => ({
          ...bare(s.label, "source", s.damage, damage),
          hits: s.hits,
          maxHit: s.maxHit,
        })),
      };
    });
}

/**
 * A node with only what an old stored fight kept — no misses, ticks or crits were recorded, and
 * no who-hit-whom either, so the fixed-denominator shares can't be worked out and stay empty.
 */
function bare(label: string, axis: DamageNode["axis"], damage: number, parent: number): DamageNode {
  return {
    label,
    axis,
    damage,
    hits: 0,
    ticks: 0,
    misses: 0,
    crits: 0,
    maxHit: 0,
    share: parent > 0 ? damage / parent : 0,
    of: {},
    critRate: 0,
    hitRate: 0,
    children: [],
  };
}

const sum = <T,>(xs: T[], pick: (x: T) => number): number => xs.reduce((n, x) => n + pick(x), 0);

const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** Hover detail — the numbers that don't earn a column of their own. */
function detail(row: CombatantStat, view: DamageView, canExpand: boolean): string {
  const swings = row.hits + row.misses;
  return [
    `${row.dealt.toLocaleString()} dealt · ${row.taken.toLocaleString()} taken`,
    `max hit ${row.maxHit.toLocaleString()}`,
    swings > 0 ? `${Math.round((row.hits / swings) * 100)}% of ${swings} swings landed` : "",
    row.crits > 0 ? `${row.crits} critical${row.crits === 1 ? "" : "s"}` : "",
    row.healed > 0 ? `healed ${row.healed.toLocaleString()}` : "",
    `active ${row.activeSec}s`,
    canExpand ? (view === "dealt" ? "click for what it hit, how, and with what" : "click for who hit it, how, and with what") : "",
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
