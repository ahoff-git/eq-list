"use client";
import { useMemo } from "react";
import FacetPicker from "@/app/components/FacetPicker";
import ItemLink from "@/app/components/items/ItemLink";
import { AddButton } from "@/app/components/ui";
import { addByTitle } from "@/lib/items/addToList";
import { effectIndex, slotLabel, type BisEffectPlan } from "@/shared/items/bis-plan";
import type { ItemRow } from "@/shared/items/item-search";
import { wikiName } from "@/shared/shown-name";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const MARK: Record<BisEffectPlan["how"], string> = { worn: "✓", socket: "◆", forced: "✓", missing: "✗" };

/**
 * Wanted effects: the ones you'd give up stats for. Best in slot can't price an effect (ADR 0310), so
 * rather than guess, it takes your word — name the haste, the focus, the clicky — and makes each one
 * happen the cheapest way it can, saying how (ADR 0318).
 */
export default function BisEffects({
  rows,
  wanted,
  plans,
  onWanted,
}: {
  rows: readonly ItemRow[];
  wanted: readonly string[];
  plans: readonly BisEffectPlan[];
  onWanted: (next: string[]) => void;
}) {
  // Every effect a cached card carries, with how many carry it — the picker's options and counts.
  const index = useMemo(() => effectIndex(rows), [rows]);
  const options = useMemo(() => index.map((e) => e.name), [index]);
  const counts = useMemo(() => new Map(index.map((e) => [e.name, e.count])), [index]);

  return (
    <div className="bis-effects">
      <div className="row wrap">
        <FacetPicker label="Want effects" any="no effect asked for" options={options} counts={counts} chosen={wanted} onChange={onWanted} />
        <span className="muted small">
          worn already → a stone you hold, socketed (costs no stats) → wear something you hold that has it → hunt it
        </span>
      </div>
      {plans.length > 0 && (
        <ul className="bis-list">
          {plans.map((p) => (
            <li key={p.effect} className={`bis-effect ${p.how}`}>
              <span className="bis-effect-mark">{MARK[p.how]}</span> <b>{p.effect}</b>
              {p.kind && <span className="muted small"> {p.kind}</span>} — <EffectHow plan={p} />
              <button className="btn ghost sm" title="Stop asking for this effect" onClick={() => onWanted(wanted.filter((w) => w !== p.effect))}>
                ×
              </button>
              {p.how === "missing" && p.hunt.length > 0 && (
                <ul className="bis-list small">
                  {p.hunt.map((h) => (
                    <li key={h.item.id}>
                      <ItemLink title={wikiName(h.item.title)} /> <span className="muted">{slotLabel(h.slot)}</span>{" "}
                      <span className={h.gain > 0 ? "good" : "muted"} title="Stats over what it would replace">
                        {signed(h.gain)}
                      </span>
                      <span className="muted"> · {h.row.zones[0] ?? h.row.kinds.join(", ")}</span>{" "}
                      <AddButton className="btn ghost sm" onAdd={() => void addByTitle(h.item.title, h.row.item.wikiPath)} title="Put it on the shopping list">
                        + Add
                      </AddButton>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EffectHow({ plan: p }: { plan: BisEffectPlan }) {
  switch (p.how) {
    case "worn":
      return <span className="small">worn on {p.by}</span>;
    case "forced":
      return (
        <span className="small">
          wear {p.by}
          {p.cost ? <span className="warn"> (costs {p.cost})</span> : <span className="muted"> (costs nothing)</span>}
        </span>
      );
    case "socket":
      return (
        <span className="small">
          put the stone from {p.stone?.from} <span className="muted">({p.stone?.where})</span> in {p.by}&apos;s {p.stone?.kind} socket
          {p.replaces && <span className="warn"> — replacing {p.replaces}</span>}
        </span>
      );
    case "missing":
      return (
        <span className="small muted">
          {p.why}
          {p.hunt.length > 0 && (p.broad ? " — these carry it, outside your criteria:" : " — hunt one, to wear or (at the grade it unlocks) take the effect out of:")}
        </span>
      );
  }
}
