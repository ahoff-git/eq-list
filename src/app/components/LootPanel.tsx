"use client";
import { useMemo } from "react";
import { useItemPrices, useLootFeed, useShoppingList } from "@/lib/hooks";
import { lootKey } from "@/shared/loot-feed";
import { normalizeItemName } from "@/shared/grouping";
import { describeCoins, formatCoins } from "@/shared/money";
import ItemLink from "./ItemLink";
import type { ItemPrice, LootEvent, LootFate } from "@/shared/types";

/**
 * Everything that has dropped and what became of it — kept, sold, stored in a depot, or consumed
 * to make something else. The log distinguishes all four and they matter differently: a sold item
 * is gone, a combined one turned into something, a stored one is in a depot rather than your bags.
 *
 * **The ledger, not the session.** `loot-log.ts` persists it and reads it back on launch, so what's
 * listed here reaches back through previous runs. The wording used to say "this session", which was
 * true of the renderer-side feed this replaced and has been a quiet lie since.
 *
 * Names are `ItemLink`s, so the same hover card and in-app navigation the List tab gives
 * work here too — the point of the tab is to notice *what you got* without having to know
 * in advance to add it to a list.
 *
 * Rows on your shopping list are highlighted. That's deliberately the only highlight rule
 * for now: it's free (the list is already in hand) and it can't cry wolf. Broader rules
 * ("used by a quest in my level range in this zone") need filters and an ignore list before
 * they'd be signal rather than noise — see the todo.
 *
 * The prices table underneath is the item half of the money question (ADR 0047): an auto-sell
 * is the only line that ever prices an item, and a price holds wherever the item dropped — so
 * it's worth keeping per item, apart from what any one mob's corpses paid.
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
  // Only a sale can change a price, and the newest drop is the cheapest signal that one landed.
  // Keyed by the drop's whole identity rather than its `logId`: that counter restarts at zero
  // every launch, so on its own it can repeat the value it already held and the refetch is skipped.
  const prices = useItemPrices(drops[0] ? lootKey(drops[0]) : "");

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
        <p>Nothing has dropped yet.</p>
        <p className="small">
          Loot lines appear here as they happen — what dropped, from what, and where it went. The
          list is kept, so it will still be here next time you open the app.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <span className="muted small" title="The most recent drops on record, newest first — kept across restarts">
          {drops.length} recent drop{drops.length === 1 ? "" : "s"}
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
        {/* Keyed by the drop's identity, not `logId-item`. The ledger outlives a run while `logId`
            restarts at zero each launch, so that pair repeats across runs — two rows claiming one
            key, which React resolves by reusing the wrong node (and warns about). `lootKey` is the
            same identity the feed merges on, so the list and the merge agree on what one drop is. */}
        {drops.map((drop) => (
          <LootRow key={lootKey(drop)} drop={drop} wanted={wanted.has(normalizeItemName(drop.item))} />
        ))}
      </div>

      <PriceTable prices={prices} />
    </div>
  );
}

/**
 * What your trash is worth, learned from your own auto-sells. Only what you've actually sold
 * appears — the log never states a price otherwise, and guessing one would be worse than a gap.
 */
function PriceTable({ prices }: { prices: ItemPrice[] }) {
  if (prices.length === 0) return null;
  const earned = prices.reduce((n, p) => n + p.copper, 0);

  return (
    <>
      <h3 className="section-head" title="Prices come from auto-sell lines — the only place the log states one">
        What it sells for
      </h3>
      <div className="table-scroll">
        <table className="stat-table">
          <thead>
            <tr>
              <th>Item</th>
              <th title="Price for one — a stack's line price divided by the stack">Each</th>
              <th title="How many you've auto-sold">Sold</th>
              <th title="What they came to in total">Earned</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.item} title={`${p.sales} sale${p.sales === 1 ? "" : "s"}, last ${new Date(p.lastAt).toLocaleString()}`}>
                <td>
                  <ItemLink title={p.item} />
                </td>
                <td>{formatCoins(p.unitCopper)}</td>
                <td>{p.qty}</td>
                <td className="num-accent" title={describeCoins(p.copper)}>
                  {formatCoins(p.copper)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Auto-sales in the ledger have earned {describeCoins(earned)}.</p>
    </>
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
