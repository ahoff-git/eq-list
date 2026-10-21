"use client";
import { useMemo, useState } from "react";
import SearchField from "@/app/components/SearchField";
import ItemLink from "@/app/components/items/ItemLink";
import { useCurrentItemCatalog } from "@/lib/hooks";
import { rowsOf } from "@/lib/peers/usePeerShare";
import { exportAgeText } from "@/shared/game-exports";
import { normalizeItemName } from "@/shared/items/grouping";
import { gradedTitle } from "@/shared/items/item-upgrade";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import type { ReceivedShare } from "@/shared/types";

/** Flags that mean an item can't be handed to someone else, as the item card writes them. */
const UNTRADEABLE = new Set(["NO DROP", "NO TRADE"]);

/** How many matches to draw. A search is one keystroke from narrower. */
const MAX_SHOWN = 100;

interface Holder {
  by: string;
  count: number;
  grade: number;
  where: string;
  asOf: string;
}

interface Found {
  item: string;
  total: number;
  /** The best grade any holder has — what the link's card is shown at. */
  bestGrade: number;
  holders: Holder[];
}

/** `Bank 3, 14 (5)` — a place, its slots, and how many there when the total is split. */
function whereText(places: InventoryShareRow["places"], split: boolean): string {
  return places
    .map((p) => `${p.label}${p.slots.length ? ` ${p.slots.join(", ")}` : ""}${split && places.length > 1 ? ` (${p.count})` : ""}`)
    .join(" · ");
}

/**
 * Search the inventories peers have handed over: who holds a material, how many, and where — so a
 * group can pool what it has. Only ever what someone chose to share (the **Inventory** kind, off by
 * default) and only what you asked them for.
 *
 * **Whether something can be traded is judged here, not by the sender**: an item whose card in *your*
 * catalogue says `NO DROP` or `NO TRADE` is flagged, so nobody's copy of the app can claim otherwise.
 * An item with no page here gets no verdict either way.
 */
export default function PeerInventories({ received }: { received: ReceivedShare[] }) {
  const rows = useMemo(() => rowsOf<InventoryShareRow>(received, "inventory"), [received]);
  const [query, setQuery] = useState("");

  const found = useMemo<Found[]>(() => {
    const q = query.trim().toLowerCase();
    const byItem = new Map<string, Found>();
    for (const { row, by } of rows) {
      if (q && !row.item.toLowerCase().includes(q)) continue;
      const key = normalizeItemName(row.item);
      const f = byItem.get(key) ?? { item: row.item, total: 0, bestGrade: 0, holders: [] };
      f.total += row.count;
      f.bestGrade = Math.max(f.bestGrade, row.grade ?? 0);
      f.holders.push({ by, count: row.count, grade: row.grade ?? 0, where: whereText(row.places, true), asOf: row.asOf });
      byItem.set(key, f);
    }
    return [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item));
  }, [rows, query]);

  if (!rows.length) return null;
  const people = new Set(rows.map((r) => r.by)).size;

  return (
    <section className="peers-block">
      <h3>Who has it</h3>
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Find a material…" />
        <span className="muted small">
          {found.length} items across {people} {people === 1 ? "inventory" : "inventories"}
        </span>
      </div>
      <TradeFlags items={found.slice(0, MAX_SHOWN)} />
      {found.length > MAX_SHOWN && (
        <p className="muted small">Showing the first {MAX_SHOWN} of {found.length}. Narrow the search for the rest.</p>
      )}
    </section>
  );
}

/**
 * The results, with the catalogue's verdict on each. Its own component so the catalogue is only
 * read once there are results to judge — it's the largest thing a window holds.
 */
function TradeFlags({ items }: { items: Found[] }) {
  const { rows: catalogue } = useCurrentItemCatalog();
  const untradeable = useMemo(() => {
    const flagged = new Set<string>();
    for (const r of catalogue) if (r.stats.flags.some((f) => UNTRADEABLE.has(f))) flagged.add(normalizeItemName(r.item.title));
    return flagged;
  }, [catalogue]);
  const now = Date.now();

  return (
    <table className="dump-table peer-inventory">
      <tbody>
        {items.map((f) => {
          const stuck = untradeable.has(normalizeItemName(f.item));
          return (
            <tr key={f.item} className={stuck ? "untradeable" : ""}>
              <td className="num">{f.total}</td>
              <td>
                <ItemLink title={gradedTitle(f.item, f.bestGrade)} />
                {stuck && (
                  <span className="chip no-trade" title="Its item card says NO DROP / NO TRADE — it can't be handed over">
                    no trade
                  </span>
                )}
              </td>
              <td className="small">
                {f.holders.map((h) => (
                  <div key={h.by} title={`From their inventory dump, written ${exportAgeText(now - Date.parse(h.asOf))}`}>
                    <b>{h.by}</b> {h.count}
                    {h.grade > 0 && <span className="muted"> (best +{h.grade})</span>} <span className="muted">· {h.where}</span>
                  </div>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
