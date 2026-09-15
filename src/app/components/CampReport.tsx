"use client";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { describeCoins, formatCoins } from "@/shared/money";
import type { MobKillStat, ZoneReport } from "@/shared/types";

import { duration, when } from "@/shared/format";
import { useRead } from "@/lib/hooks";
import ItemLink from "./ItemLink";
import { GRID_DEFAULTS, GRID_SX, NUM_COL } from "./dataGridDefaults";
/** A stable empty, so a render that hasn't heard back yet doesn't look like a change. */
const NO_ZONES: ZoneReport[] = [];

/**
 * "Is this camp worth it?" — the two tables that answer it.
 *
 * **Per mob** (this session): how long one takes to kill and what it pays per minute.
 * **Per zone** (all recorded history): the same question across camps, so tonight's
 * spot can be compared with last week's.
 *
 * Experience is in percent of a level, because that's the only form the log gives. Money is
 * the other half of the answer, and comes in two columns rather than one total: coin the mob
 * carried and what its drops vendored for behave differently and are gathered differently
 * (ADR 0047) — a hover breaks the split out where the table shows the sum.
 * `refreshKey` re-reads the zone table — history only changes when a fight ends.
 *
 * Both tables are `DataGrid`s (ADR 0230) — sortable and filterable on every column, which neither
 * had before, since nothing here previously asked a question narrower than "show me everything".
 */
export default function CampReport({ byMob, refreshKey }: { byMob: MobKillStat[]; refreshKey: string }) {
  const zones = useRead((a) => a.combat.zones(), NO_ZONES, [refreshKey]);

  return (
    <>
      <h3 className="section-head" title="From this session's fights">
        Per mob, this session
      </h3>
      {byMob.length === 0 ? (
        <p className="muted small">Nothing killed yet this session.</p>
      ) : (
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          columns={MOB_COLUMNS}
          rows={byMob.map((m) => ({ id: m.mob, ...m }))}
        />
      )}

      <h3 className="section-head" title="Every fight ever recorded, grouped by zone">
        Per zone, all time
      </h3>
      {zones.length === 0 ? (
        <p className="muted small">
          No zoned history yet — fights are filed against whatever zone the log last reported.
        </p>
      ) : (
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          columns={ZONE_COLUMNS}
          rows={zones.map((z) => ({ id: z.zone, ...z }))}
        />
      )}
    </>
  );
}

type MobRow = MobKillStat & { id: string };

const MOB_COLUMNS: GridColDef<MobRow>[] = [
  {
    field: "mob",
    headerName: "Mob",
    flex: 2,
    minWidth: 160,
    // "Is this camp worth it?" is usually followed by "what does it drop?" — so the mob's name is
    // the same link it is in every other list.
    renderCell: (p) => <ItemLink title={p.row.mob} />,
  },
  { field: "kills", headerName: "Kills", ...NUM_COL, flex: 1 },
  {
    field: "avgKillSec",
    headerName: "Kill time",
    description: "Average time from the previous kill in the fight",
    ...NUM_COL,
    flex: 1,
    valueFormatter: (v: number) => (v ? `${v}s` : "—"),
  },
  {
    field: "xpPct",
    headerName: "XP",
    description: "Experience credited to it, in percent of a level",
    ...NUM_COL,
    flex: 1,
    valueFormatter: (v: number) => (v ? `${v}%` : "—"),
  },
  {
    field: "xpPerMin",
    headerName: "XP/min fighting",
    description:
      "Percent of a level per minute spent fighting it — downtime excluded, so it ranks mobs rather than forecasting an evening",
    ...NUM_COL,
    flex: 1,
    cellClassName: "num-accent",
    valueFormatter: (v: number) => (v ? `${v}%` : "—"),
  },
  {
    field: "coinTotal",
    headerName: "Coin",
    description: "Coin off its corpses plus what its drops auto-sold for — hover a figure for the split",
    ...NUM_COL,
    flex: 1,
    valueGetter: (_v, row) => coinTotal(row),
    renderCell: (p) => <span title={coinSplit(p.row)}>{p.value ? formatCoins(p.value) : "—"}</span>,
  },
  {
    field: "copperPerMin",
    headerName: "Coin/min fighting",
    description:
      "That coin per minute spent fighting it — same caveat as XP/min: it ranks mobs, it doesn't forecast an evening",
    ...NUM_COL,
    flex: 1,
    cellClassName: "num-accent",
    valueFormatter: (v: number) => (v ? formatCoins(v) : "—"),
  },
];

type ZoneRow = ZoneReport & { id: string };

const ZONE_COLUMNS: GridColDef<ZoneRow>[] = [
  {
    field: "zone",
    headerName: "Zone",
    flex: 2,
    minWidth: 160,
    renderCell: (p) => (
      <span title={`Last fought ${when(p.row.lastAt)}`}>
        <ItemLink title={p.row.zone} />
      </span>
    ),
  },
  { field: "fights", headerName: "Fights", ...NUM_COL, flex: 1 },
  { field: "kills", headerName: "Kills", ...NUM_COL, flex: 1 },
  {
    field: "combatSec",
    headerName: "Combat",
    description: "Time in combat, downtime excluded",
    ...NUM_COL,
    flex: 1,
    valueFormatter: (v: number) => duration(v),
  },
  {
    field: "xpPerMin",
    headerName: "XP/min fighting",
    description: "Per minute of combat in the zone, downtime excluded",
    ...NUM_COL,
    flex: 1,
    cellClassName: "num-accent",
    valueFormatter: (v: number) => (v ? `${v}%` : "—"),
  },
  {
    field: "copperPerMin",
    headerName: "Coin/min fighting",
    description:
      "Coin and sales per minute of combat. Fights recorded before coin was parsed contribute none, so a long history reads low until it turns over",
    ...NUM_COL,
    flex: 1,
    cellClassName: "num-accent",
    renderCell: (p) => (
      <span title={`${describeCoins(p.row.copper ?? 0)} off corpses · ${describeCoins(p.row.soldCopper ?? 0)} from auto-sold drops`}>
        {p.value ? formatCoins(p.value) : "—"}
      </span>
    ),
  },
  { field: "dps", headerName: "DPS", ...NUM_COL, flex: 1, valueFormatter: (v: number) => v || "—" },
];

/** Everything the mob was worth, in copper. */
function coinTotal(m: MobKillStat): number {
  return (m.copper ?? 0) + (m.soldCopper ?? 0);
}

/** The split behind the total, for the hover — the table shows one number, this says why. */
function coinSplit(m: MobKillStat): string {
  return `${describeCoins(m.copper ?? 0)} off its corpses · ${describeCoins(m.soldCopper ?? 0)} from auto-sold drops`;
}
