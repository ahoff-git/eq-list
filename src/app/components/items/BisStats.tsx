"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { GRID_DEFAULTS, GRID_SX_FIT, NUM_COL } from "@/app/components/dataGridDefaults";
import { STAT_GROUPS, statMeta } from "@/shared/items/item-stats";
import { compareLoadoutStats, type LoadoutStats, type StatComparison } from "@/shared/items/loadout-stats";
import type { DerivedRate } from "@/shared/items/derived-stats";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const groupLabel = new Map(STAT_GROUPS.map((g) => [g.key, g.label]));

type Row = StatComparison & { id: string; order: number };

/** Is this change an improvement? More is better, except where less is (weight). */
const better = (r: StatComparison) => (statMeta(r.key).lowerIsBetter ? r.change < 0 : r.change > 0);

const COLUMNS: GridColDef<Row>[] = [
  {
    field: "stat",
    headerName: "Stat",
    flex: 1,
    minWidth: 110,
    valueGetter: (_v, row) => statMeta(row.key).label,
    // Sorted by card order rather than alphabet, so AC/HP/Mana lead the way a card prints them.
    sortComparator: (_a, _b, p1, p2) => (p1.api.getRow(p1.id) as Row).order - (p2.api.getRow(p2.id) as Row).order,
  },
  { field: "group", headerName: "Group", flex: 1, minWidth: 110, valueGetter: (_v, row) => groupLabel.get(statMeta(row.key).group), cellClassName: "muted" },
  {
    field: "before",
    headerName: "Wearing now",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => <Total value={p.row.before} fromAttributes={p.row.fromAttributes?.before} />,
  },
  {
    field: "after",
    headerName: "Loadout",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => <Total value={p.row.after} fromAttributes={p.row.fromAttributes?.after} />,
  },
  {
    field: "change",
    headerName: "Change",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => (p.row.change ? <span className={better(p.row) ? "good" : "warn"}>{signed(p.row.change)}</span> : <span className="muted">—</span>),
  },
];

/** A total, with the part the attributes gave beside it — the hover names the stat it came from. */
function Total({ value, fromAttributes }: { value?: number; fromAttributes?: number }) {
  if (value === undefined) return <span className="muted">—</span>;
  return (
    <span title={fromAttributes ? `${value - fromAttributes} from gear + ${fromAttributes} from attributes (STA → HP, INT/WIS → mana, AGI → AC, for your classes and level)` : undefined}>
      {value}
      {fromAttributes ? <span className="muted small"> ({fromAttributes} from attributes)</span> : null}
    </span>
  );
}

/**
 * What best in slot would do to your stats: each total you're wearing now beside what the loadout
 * adds up to, and the change. The weighted score above says *whether* to change; this says *what
 * you get* — the same pieces, at the same grades (`loadoutStats`).
 */
export default function BisStats({ wearing, loadout, rates = [] }: { wearing: LoadoutStats; loadout: LoadoutStats; rates?: readonly DerivedRate[] }) {
  const rows = useMemo<Row[]>(
    () => compareLoadoutStats(wearing, loadout, rates).map((r, order) => ({ ...r, id: r.key, order })),
    [wearing, loadout, rates],
  );
  if (!rows.length) return <p className="muted small">Nothing worn or chosen gives any stats yet.</p>;
  return <DataGrid {...GRID_DEFAULTS} sx={GRID_SX_FIT} columns={COLUMNS} rows={rows} autoHeight hideFooter />;
}
