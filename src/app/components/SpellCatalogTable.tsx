"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "./ItemLink";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "./dataGridDefaults";
import { useGridSort } from "@/lib/useGridSort";
import { manaPerDamage, minLevel, type SpellRow, type SpellSortKey } from "@/shared/spell-search";
import type { Sort } from "@/shared/sorting";

/** Which way each column opens on its first click — the same rule the old `SortHeader` calls
 *  encoded per column, kept here since the grid's own click cycle is overridden to match it. */
const START_DESC: Record<SpellSortKey, boolean> = {
  name: false,
  level: false,
  mana: false,
  castSec: false,
  recastSec: false,
  range: false,
  damage: true,
  manaPerDamage: false,
};

type Row = SpellRow & { id: string };

/** The spell catalogue, as a `DataGrid` (ADR 0230) — sortable and filterable on every column.
 *  Holds no state: the sort lives with the panel. */
export default function SpellCatalogTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly SpellRow[];
  sort: Sort<SpellSortKey>;
  onSort: (next: Sort<SpellSortKey>) => void;
}) {
  const gridRows = useMemo<Row[]>(() => rows.map((row) => ({ ...row, id: row.spell.title })), [rows]);

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: "name",
        headerName: "Spell",
        description: "The spell's name",
        flex: 2,
        minWidth: 180,
        valueGetter: (_v, row) => row.spell.title,
        renderCell: (p) => (
          <>
            <ItemLink title={p.row.spell.title} />
            {p.row.spell.outOfEra && <span className="badge era-out">out of era</span>}
          </>
        ),
      },
      {
        field: "level",
        headerName: "Level",
        description: "Lowest level any class can cast it at",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => minLevel(row.stats.levels),
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "mana",
        headerName: "Mana",
        description: "Mana per cast, from the wiki's own card",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.stats.mana,
        cellClassName: (p) => (p.row.stats.mana !== undefined ? "num-accent" : "muted"),
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "castSec",
        headerName: "Cast",
        description: "Casting time, seconds",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.stats.castSec,
        renderCell: (p) => (p.value !== undefined ? `${p.value}s` : "—"),
      },
      {
        field: "recastSec",
        headerName: "Recast",
        description: "This spell's own reuse timer, seconds",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.stats.recastSec,
        renderCell: (p) => (p.value ? `${p.value}s` : "—"),
      },
      {
        field: "range",
        headerName: "Range",
        description: "How far away it reaches",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.stats.range,
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "damage",
        headerName: "Damage",
        description: "Best-effort, read from the wiki's own text — approximate, for ranking only",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => row.stats.damage,
        cellClassName: (p) => (p.row.stats.damage !== undefined ? "num-accent" : "muted"),
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "manaPerDamage",
        headerName: "Mana/dmg",
        description: "Mana spent per point of damage — lower is more efficient. Same caveat as Damage.",
        ...NUM_COL,
        flex: 1,
        valueGetter: (_v, row) => manaPerDamage(row.stats),
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "classes",
        headerName: "Classes",
        flex: 2,
        // No `SpellSortKey` names this combined line, so it isn't sortable — it wasn't before either
        // (a plain, unsortable `<th>Classes</th>`).
        sortable: false,
        cellClassName: "muted small",
        valueGetter: (_v, row) => classesOf(row) || "—",
      },
    ],
    [],
  );

  const { sortModel, onSortModelChange } = useGridSort(sort, onSort, START_DESC);

  return (
    <DataGrid
      {...GRID_DEFAULTS}
      sx={GRID_SX}
      rows={gridRows}
      columns={columns}
      // Already sorted (and truncated to `MAX_ROWS`) upstream by `useSpellQuery` before the cut, so
      // the grid must reflect that order rather than re-derive it — see ItemTable for the same shape.
      sortingMode="server"
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
    />
  );
}

function classesOf(row: SpellRow): string {
  return Object.entries(row.stats.levels)
    .sort(([, a], [, b]) => (a ?? 0) - (b ?? 0))
    .map(([cls, level]) => `${cls} ${level}`)
    .join(", ");
}
