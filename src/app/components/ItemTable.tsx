"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "./ItemLink";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, ACTION_COL, PAGE_SIZE_OPTIONS } from "./dataGridDefaults";
import { AddButton } from "./ui";
import { addByTitle } from "@/lib/addToList";
import { api } from "@/lib/api";
import { useGridSort } from "@/lib/useGridSort";
import { sourceKindLabel } from "@/shared/sources";
import { LEVEL_CONFIDENCE, levelText } from "@/shared/item-levels";
import { statLine, statMeta, type StatKey } from "@/shared/item-stats";
import { zonesInFilterOrder, type ItemSortKey, type ValuedItem } from "@/shared/item-search";
import type { Sort } from "@/shared/sorting";

/**
 * Which way a column opens on its first click — descending for a number ("show me the most"),
 * ascending for a name. The same rule `ItemTable`'s old `SortHeader` calls encoded per column,
 * kept here since the grid's own click cycle is overridden to match it (see `ItemTable`).
 */
function startDescFor(key: ItemSortKey): boolean {
  return key !== "name" && key !== "slot" && key !== "source" && key !== "zone" && key !== "level";
}

type Row = ValuedItem & { id: string };

/** The results, as a `DataGrid` (ADR 0230) — sortable and filterable on every column, core and
 *  stat alike. Holds no state: the sort lives with the criteria that made it. */
export default function ItemTable({
  rows,
  columns,
  sort,
  onSort,
  scored,
  pickedZones,
}: {
  rows: readonly ValuedItem[];
  /** The stat columns to show, in card order. */
  columns: StatKey[];
  sort: Sort<ItemSortKey>;
  onSort: (next: Sort<ItemSortKey>) => void;
  /** Whether the weight sheet scores anything — with nothing set, Value says so rather than "0". */
  scored: boolean;
  /** The ticked zones, so the Zone column can lead with one that kept the row. */
  pickedZones: string[];
}) {
  const gridRows = useMemo<Row[]>(
    () => rows.map((row) => ({ ...row, id: `${row.item.origin}:${row.item.title}` })),
    [rows],
  );

  const gridColumns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: "name",
        headerName: "Item",
        description: "The item's name",
        flex: 2,
        minWidth: 180,
        valueGetter: (_v, row) => row.item.title,
        renderCell: (p) => (
          <>
            <ItemLink title={p.row.item.title} />
            {/* Lucy describes a different game, so a row sourced from it never passes as the wiki's. */}
            {p.row.item.origin === "lucy" && (
              <span className="chip lucy-chip" title="From Lucy — Live EverQuest's database, not this game's">
                Lucy
              </span>
            )}
          </>
        ),
      },
      {
        field: "slot",
        headerName: "Slot",
        description: "Where it's worn",
        flex: 1,
        cellClassName: "muted",
        valueGetter: (_v, row) => row.stats.slots.join(" ") || "—",
      },
      {
        field: "source",
        headerName: "From",
        description: "Kill it, buy it, quest it or craft it",
        flex: 1,
        valueGetter: (_v, row) => row.kinds.map(sourceKindLabel).join(" ") || "—",
        renderCell: (p) => {
          const row = p.row;
          if (!row.kinds.length) return "—";
          return (
            <>
              {row.kinds.map((kind) =>
                // A quest chip goes to the quest itself — the same "look this up" an item's own name
                // gives you — rather than sitting there as a label with nowhere to go. Several related
                // quests link to the first; the hover names them all.
                kind === "quest" && row.quests.length ? (
                  <ItemLink
                    key={kind}
                    title={row.quests[0]}
                    className="src-kind-link"
                    label={
                      <span
                        className={`src-kind k-${kind}`}
                        title={row.quests.length > 1 ? `Quests: ${row.quests.join(", ")}` : row.quests[0]}
                      >
                        {sourceKindLabel(kind)}
                      </span>
                    }
                  />
                ) : (
                  <span key={kind} className={`src-kind k-${kind}`}>
                    {sourceKindLabel(kind)}
                  </span>
                ),
              )}
            </>
          );
        },
      },
      {
        field: "zone",
        headerName: "Zone",
        description: "Where its sources are",
        flex: 1,
        valueGetter: (_v, row) => zonesInFilterOrder(row.zones, pickedZones).join(" ") || "—",
        renderCell: (p) => {
          const zones = zonesInFilterOrder(p.row.zones, pickedZones);
          const zoneTitle = zones.length > 1 ? `Drops in ${zones.length} zones: ${zones.join(", ")}` : zones[0];
          return (
            // `+N` is "and N other zones" — the count is in the hover, since the column has to stay narrow.
            <span className="muted" title={zoneTitle}>
              {zones.length > 1 ? `${zones[0]} +${zones.length - 1}` : (zones[0] ?? "—")}
            </span>
          );
        },
      },
      {
        field: "level",
        headerName: "Level",
        description: "What level you need to be — from the mob, the quest, or the zone",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.level?.min,
        cellClassName: (p) => `lvl-${p.row.level?.from ?? "none"}`,
        renderCell: (p) => {
          const level = p.row.level;
          return (
            <span title={level ? `${level.why} — ${LEVEL_CONFIDENCE[level.from]}` : "Nothing places this one yet"}>
              {level ? levelText(level) : "—"}
            </span>
          );
        },
      },
      ...(columns.length
        ? columns.map(
            (key): GridColDef<Row> => ({
              field: key,
              headerName: statMeta(key).label,
              description: `Sort by ${statMeta(key).label}`,
              ...NUM_COL,
              flex: 1,
              valueGetter: (_v, row) => row.stats.stats[key],
              cellClassName: (p) => (p.row.stats.stats[key] !== undefined ? "num-accent" : "muted"),
              renderCell: (p) => p.value ?? "—",
            }),
          )
        : // With no stat column asked for, the card's own numbers fill the gap so the table always
          // has something to read. No `ItemSortKey` names this combined line, so it isn't sortable —
          // it wasn't before either (a plain, unsortable `<th>Stats</th>`).
          [
            {
              field: "statsLine",
              headerName: "Stats",
              flex: 2,
              sortable: false,
              cellClassName: "muted small",
              valueGetter: (_v, row) => statLine(row.stats) || "—",
            } satisfies GridColDef<Row>,
          ]),
      {
        field: "value",
        headerName: "Value",
        description: scored ? "Your weights, applied" : "Set some weights and this becomes the ranking",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.value,
        cellClassName: (p) => (scored && p.row.value ? "num-accent" : "muted"),
        renderCell: (p) => (scored ? p.row.value : "—"),
      },
      {
        field: "actions",
        headerName: "",
        ...ACTION_COL,
        flex: 1,
        minWidth: 120,
        renderCell: (p) => {
          const row = p.row;
          const wikiPath = row.item.wikiPath;
          return (
            <span className="item-add">
              {wikiPath && (
                <button className="btn ghost sm" title="Open on eqlwiki" onClick={() => api()?.wiki.openInBrowser(wikiPath)}>
                  ↗
                </button>
              )}
              <AddButton
                onAdd={() => void addByTitle(row.item.title, row.item.wikiPath)}
                title="Put it on the shopping list"
                className="btn sm"
              >
                + Add
              </AddButton>
            </span>
          );
        },
      },
    ],
    [columns, pickedZones, scored],
  );

  const { sortModel, onSortModelChange } = useGridSort(sort, onSort, startDescFor);

  return (
    <DataGrid
      {...GRID_DEFAULTS}
      sx={GRID_SX}
      rows={gridRows}
      columns={gridColumns}
      // The catalogue is already sorted (and truncated to `MAX_ROWS`) upstream by `useItemQuery`,
      // *before* the cut — so the grid must not re-sort what it's handed, only reflect and drive the
      // same `Sort<ItemSortKey>` state that produced this order (`sortingMode="server"`).
      sortingMode="server"
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
    />
  );
}
