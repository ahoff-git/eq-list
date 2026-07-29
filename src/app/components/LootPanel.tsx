"use client";
import { useMemo } from "react";
import { useLootFeed, useShoppingList } from "@/lib/hooks";
import { normalizeItemName } from "@/shared/grouping";
import ItemLink from "./ItemLink";
import type { LootEvent, LootFate } from "@/shared/types";

/**
 * Everything that has dropped this session and what became of it — kept, sold, stored in a
 * depot, or consumed to make something else. The log distinguishes all four and they matter
 * differently: a sold item is gone, a combined one turned into something, a stored one is in
 * a depot rather than your bags.
 *
 * Names are `ItemLink`s, so the same hover card and in-app navigation the List tab gives
 * work here too — the point of the tab is to notice *what you got* without having to know
 * in advance to add it to a list.
 *
 * Rows on your shopping list are highlighted. That's deliberately the only highlight rule
 * for now: it's free (the list is already in hand) and it can't cry wolf. Broader rules
 * ("used by a quest in my level range in this zone") need filters and an ignore list before
 * they'd be signal rather than noise — see the todo.
 */
const FATE_LABEL: Record<LootFate, string> = {
  kept: "kept",
  sold: "sold",
  stored: "stored",
  combined: "combined",
};

export default function LootPanel() {
  const drops = useLootFeed(200);
  const list = useShoppingList();

  // Names on the shopping list, normalized the same way the store matches them.
  const wanted = useMemo(
    () => new Set(list.entries.map((e) => normalizeItemName(e.name))),
    [list.entries],
  );

  const totals = useMemo(() => {
    const counts = { kept: 0, sold: 0, stored: 0, combined: 0 } as Record<LootFate, number>;
    for (const d of drops) counts[d.fate] += d.qty;
    return counts;
  }, [drops]);

  if (drops.length === 0) {
    return (
      <div className="empty">
        <p>Nothing has dropped yet this session.</p>
        <p className="small">
          Loot lines appear here as they happen — what dropped, from what, and where it went.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <span className="muted small">
          {drops.length} drop{drops.length === 1 ? "" : "s"} this session
        </span>
        <span className="spacer" />
        {(Object.keys(FATE_LABEL) as LootFate[])
          .filter((fate) => totals[fate] > 0)
          .map((fate) => (
            <span key={fate} className={`fate-tally f-${fate}`}>
              {totals[fate]} {FATE_LABEL[fate]}
            </span>
          ))}
      </div>

      <div className="loot-rows">
        {drops.map((drop) => (
          <LootRow key={`${drop.logId}-${drop.item}`} drop={drop} wanted={wanted.has(normalizeItemName(drop.item))} />
        ))}
      </div>
    </div>
  );
}

function LootRow({ drop, wanted }: { drop: LootEvent; wanted: boolean }) {
  return (
    <div className={`loot-row ${wanted ? "wanted" : ""}`} title={wanted ? "On your shopping list" : undefined}>
      <span className="lr-time">{clock(drop.at)}</span>
      <span className={`src-kind f-${drop.fate}`}>{FATE_LABEL[drop.fate]}</span>
      {drop.qty > 1 && <span className="lr-qty">{drop.qty}×</span>}
      <ItemLink title={drop.item} className="lr-item" />
      <span className="lr-source muted small">from {drop.source}</span>
      <span className="spacer" />
      {drop.detail && <span className="lr-detail muted small">{detailLabel(drop)}</span>}
    </div>
  );
}

/** Phrase the fate's particulars the way the log means them. */
function detailLabel(drop: LootEvent): string {
  switch (drop.fate) {
    case "sold":
      return `for ${drop.detail}`;
    case "stored":
      return `into ${drop.detail}`;
    case "combined":
      return `→ ${drop.detail}`;
    default:
      return drop.detail ?? "";
  }
}

function clock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
