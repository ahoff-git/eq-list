"use client";
import { useMemo, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import SearchField from "@/app/components/SearchField";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { factionConText, parseFactionDump, type FactionDumpRow } from "@/shared/game-export-dumps";
import { DumpBar, textMatches } from "./DumpParts";

const maxOf = (r: FactionDumpRow) => r.standing + r.pointsToMax;

const COLUMNS: GridColDef<FactionDumpRow>[] = [
  { field: "name", headerName: "Faction", flex: 2, minWidth: 180 },
  {
    field: "con",
    headerName: "Con",
    width: 130,
    // The `/con` word is a band of the standing, so it sorts by the standing rather than alphabetically.
    valueGetter: (_v, row) => row.standing,
    renderCell: (p) => <span className="muted small">{factionConText(p.row.standing)}</span>,
  },
  { field: "standing", headerName: "Standing", ...NUM_COL, width: 100 },
  {
    field: "toMax",
    headerName: "To max",
    width: 100,
    description: "How far along to max standing the faction is",
    valueGetter: (_v, row) => (maxOf(row) > 0 ? row.standing / maxOf(row) : 0),
    renderCell: (p) => (
      <DumpBar
        fraction={p.value as number}
        title={p.row.pointsToMax > 0 ? `${p.row.pointsToMax} to max (${maxOf(p.row)})` : "At max"}
      />
    ),
  },
];

/**
 * A faction dump: every standing the game holds for you, as the number and the `/con` word it
 * earns, with how far is left to max. This is the game's own figure, so unlike the Faction tab's
 * ledger it has no history behind it and no gaps in it. A `DataGrid` (ADR 0230), so every column
 * sorts; it opens best standing first, names breaking ties.
 */
export default function FactionDumpView({ text }: { text: string }) {
  const rows = useMemo(() => parseFactionDump(text), [text]);
  const [query, setQuery] = useState("");
  // Handed over in name order so ties in whatever column is sorted read alphabetically: the grid's
  // sort is stable, and the free grid sorts by one column only.
  const shown = rows.filter((r) => textMatches(query, r.name)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Find a faction…" />
        <span className="muted small">{rows.length} factions</span>
      </div>
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        columns={COLUMNS}
        rows={shown}
        getRowId={(r) => r.id || r.name}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        initialState={{
          pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } },
          sorting: { sortModel: [{ field: "standing", sort: "desc" }] },
        }}
      />
    </div>
  );
}
