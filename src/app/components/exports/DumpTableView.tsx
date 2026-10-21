"use client";
import { useMemo, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import SearchField from "@/app/components/SearchField";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { parseDumpTable, type DumpTable } from "@/shared/game-export-dumps";
import { textMatches } from "./DumpParts";

type Row = { id: number; cells: string[] };

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * One column per header cell — or per cell of the widest row, for a dump with no header — named by
 * the dump itself. A column whose every filled cell is a number sorts as numbers, so `10` follows `9`.
 */
function dumpColumns(table: DumpTable): GridColDef<Row>[] {
  const width = Math.max(table.header.length, ...table.rows.map((r) => r.length));
  return Array.from({ length: width }, (_, n): GridColDef<Row> => {
    const filled = table.rows.map((r) => r[n] ?? "").filter((c) => c);
    const numeric = filled.length > 0 && filled.every((c) => NUMBER.test(c));
    return {
      field: `c${n}`,
      headerName: table.header[n] ?? "",
      flex: 1,
      minWidth: 80,
      ...(numeric ? NUM_COL : {}),
      valueGetter: (_v, row) => {
        const cell = row.cells[n] ?? "";
        return numeric ? (cell ? Number(cell) : undefined) : cell;
      },
      // Shown as the dump wrote it — a spell id is `12345`, not the number grid's `12,345`.
      valueFormatter: (_v, row) => row.cells[n] ?? "",
    };
  });
}

/**
 * Any dump without a reader of its own — spellbook, guild bank, recipes, whatever the client writes
 * next — shown as the table it is, so a new kind of dump is readable before it is understood. A
 * `DataGrid` (ADR 0230), so every column sorts; it opens in the dump's own order.
 */
export default function DumpTableView({ text, columns, emptyText }: { text: string; columns?: readonly string[]; emptyText: string }) {
  const table = useMemo(() => parseDumpTable(text, columns), [text, columns]);
  const gridColumns = useMemo(() => dumpColumns(table), [table]);
  const [query, setQuery] = useState("");
  if (!table.rows.length) return <p className="muted">{emptyText}</p>;
  const shown: Row[] = table.rows.flatMap((cells, id) => (textMatches(query, ...cells) ? [{ id, cells }] : []));
  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Filter…" />
        <span className="muted small">{table.rows.length} rows</span>
      </div>
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        columns={gridColumns}
        rows={shown}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
      />
    </div>
  );
}
