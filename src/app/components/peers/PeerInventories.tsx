"use client";
import { useMemo, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { SxProps, Theme } from "@mui/material/styles";
import SearchField from "@/app/components/SearchField";
import ItemLink from "@/app/components/items/ItemLink";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { useCurrentItemCatalog } from "@/lib/hooks";
import { rowsOf } from "@/lib/peers/usePeerShare";
import { exportAgeText } from "@/shared/game-exports";
import { normalizeItemName } from "@/shared/items/grouping";
import { gradedTitle } from "@/shared/items/item-upgrade";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import type { ReceivedShare } from "@/shared/types";

/** Flags that mean an item can't be handed to someone else, as the item card writes them. */
const UNTRADEABLE = new Set(["NO DROP", "NO TRADE"]);

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
      {/* Every match, paged: a cap would make a sort by Total rank only whichever came first by name. */}
      <TradeFlags items={found} />
    </section>
  );
}

type Row = Found & { stuck: boolean };

/** Dims a row nobody can hand over, as the old table's `tr.untradeable` did. `GRID_SX` is a plain
 *  object; its `SxProps` type just doesn't promise that, hence the cast to spread it. */
const TRADE_SX: SxProps<Theme> = { ...(GRID_SX as object), "& .MuiDataGrid-row.untradeable": { opacity: 0.6 } };

/**
 * The results, with the catalogue's verdict on each. Its own component so the catalogue is only
 * read once there are results to judge — it's the largest thing a window holds. A `DataGrid`
 * (ADR 0230), so every column sorts; it opens by item name, the order it's handed.
 */
function TradeFlags({ items }: { items: Found[] }) {
  const { rows: catalogue } = useCurrentItemCatalog();
  const untradeable = useMemo(() => {
    const flagged = new Set<string>();
    for (const r of catalogue) if (r.stats.flags.some((f) => UNTRADEABLE.has(f))) flagged.add(normalizeItemName(r.item.title));
    return flagged;
  }, [catalogue]);
  const rows = useMemo<Row[]>(() => items.map((f) => ({ ...f, stuck: untradeable.has(normalizeItemName(f.item)) })), [items, untradeable]);
  const columns = useMemo<GridColDef<Row>[]>(() => {
    const now = Date.now();
    return [
      { field: "total", headerName: "Total", ...NUM_COL, width: 80 },
      {
        field: "item",
        headerName: "Item",
        flex: 2,
        minWidth: 180,
        renderCell: ({ row: f }) => (
          <>
            <ItemLink title={gradedTitle(f.item, f.bestGrade)} />
            {f.stuck && (
              <span className="chip no-trade" title="Its item card says NO DROP / NO TRADE — it can't be handed over">
                no trade
              </span>
            )}
          </>
        ),
      },
      {
        field: "holders",
        headerName: "Held by",
        flex: 3,
        minWidth: 220,
        description: "Who has it, how many, and where",
        // Sorts by who holds it, so one person's share reads together.
        valueGetter: (_v, row) => row.holders.map((h) => h.by).join(", "),
        renderCell: ({ row: f }) => (
          <div className="small">
            {f.holders.map((h) => (
              <div key={h.by} title={`From their inventory dump, written ${exportAgeText(now - Date.parse(h.asOf))}`}>
                <b>{h.by}</b> {h.count}
                {h.grade > 0 && <span className="muted"> (best +{h.grade})</span>} <span className="muted">· {h.where}</span>
              </div>
            ))}
          </div>
        ),
      },
    ];
  }, []);

  return (
    <DataGrid
      {...GRID_DEFAULTS}
      sx={TRADE_SX}
      columns={columns}
      rows={rows}
      getRowId={(f) => f.item}
      // A row is as tall as its holder list, one line per peer.
      getRowHeight={() => "auto"}
      getRowClassName={(p) => (p.row.stuck ? "untradeable" : "")}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
    />
  );
}
