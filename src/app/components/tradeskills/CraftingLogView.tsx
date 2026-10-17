"use client";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "@/app/components/items/ItemLink";
import { Empty } from "@/app/components/ui";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { successText, type CraftItem, type CraftSitting, type Tally } from "@/shared/tradeskills/crafting-log";
import { craftRateKey, type PooledCraftRate } from "@/shared/tradeskills/craft-rates";
import type { SkillProgressView } from "@/shared/tradeskills/skill-progress";

/**
 * Your crafting log ([ADR 0303](../../../../specs/decisions/0303-a-tradeskill-guide-follows-your-skill.md)) —
 * the combat log's idea, at the forge: every combine your log records, by **sitting** (when, which
 * skill, how many, how many came out, how far it took you), by **item**, and by **item at each skill
 * level**, which is the question "how reliably can I make this yet?" asked level by level.
 *
 * All of them are the shared grid (ADR 0230), so any column sorts and filters — filter "By level" to
 * one item and it reads as that item's success curve. The skill a combine belongs to is read off its
 * sitting (`crafting-log.ts`); one no sitting ever tied to a skill reads "—".
 *
 * **The room** is everyone else's shared rates (the `crafting` share kind), added up. It sits in its
 * own columns beside yours and its own table below, and is never mixed into your figures — your
 * success at a level is a fact about your character, and a pooled one is a different fact.
 */
export default function CraftingLogView({ progress }: { progress: SkillProgressView }) {
  const { sittings, items } = progress.crafting;
  if (!progress.character) {
    return <Empty title="No log to read." hint="The crafting log is built from your EverQuest log — set the log folder in Settings." />;
  }
  if (!sittings.length) {
    return (
      <Empty
        title={progress.scanning ? `Reading ${progress.character}'s log…` : `${progress.character}'s log has no combines yet.`}
        hint="Every combine you make — success or failure — lands here, with the skill you had when you made it."
      />
    );
  }
  const pooled = progress.pooled ?? [];
  const room = new Map(pooled.map((p) => [craftRateKey(p), p]));
  const levels = items.flatMap((it) =>
    it.levels.map((l) => {
      const theirs = it.skill ? room.get(craftRateKey({ skill: it.skill, item: it.item, level: l.level })) : undefined;
      return {
        id: `${it.skill ?? ""}|${it.item}|${l.level}`,
        item: it.item,
        skill: it.skill ?? "",
        ...l,
        rate: rate(l),
        roomAttempts: theirs?.attempts ?? 0,
        roomRate: theirs ? rate(theirs) : null,
      };
    }),
  );
  const total = sittings.reduce((t, s) => ({ attempts: t.attempts + s.attempts, ok: t.ok + s.ok }), { attempts: 0, ok: 0 });

  return (
    <div className="crafting-log">
      <p className="muted small">
        {progress.character}: {total.attempts} combines over {sittings.length} {sittings.length === 1 ? "sitting" : "sittings"},{" "}
        {successText(total)} came out.
      </p>

      <h4>Sittings</h4>
      <div className="table-scroll">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          columns={SITTING_COLUMNS}
          rows={sittings.map((s) => ({ id: s.start, ...s, rate: rate(s), skillName: s.skill ?? "" }))}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
        />
      </div>

      <h4>Items</h4>
      <div className="table-scroll">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          columns={ITEM_COLUMNS}
          rows={items.map((it) => ({ id: `${it.skill ?? ""}|${it.item}`, ...it, rate: rate(it), skillName: it.skill ?? "", span: levelSpan(it) }))}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
        />
      </div>

      <h4 title="One row per item per skill level — filter by Item to see one craft's success climb">By level</h4>
      <div className="table-scroll">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          columns={LEVEL_COLUMNS}
          rows={levels}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          initialState={{
            pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } },
            sorting: { sortModel: [{ field: "item", sort: "asc" }, { field: "level", sort: "asc" }] },
            columns: { columnVisibilityModel: pooled.length ? {} : { roomAttempts: false, roomRate: false } },
          }}
        />
      </div>

      <RoomRates pooled={pooled} />
    </div>
  );
}

/**
 * Everyone else's shared success rates, item by level — including crafts you have never made, which
 * is the point: how often does Electrum Topaz come out at 106 before you've bought the gems.
 */
function RoomRates({ pooled }: { pooled: PooledCraftRate[] }) {
  return (
    <>
      <h4 title="Success rates other players have shared with you — turn on “Crafting success rates” on the Peers tab to share yours">
        The room
      </h4>
      {pooled.length === 0 ? (
        <p className="muted small">
          Nobody has shared crafting rates with you yet. They arrive from peers who share “Crafting success rates” (Peers
          tab) — turn it on there to share yours.
        </p>
      ) : (
        <div className="table-scroll">
          <DataGrid
            {...GRID_DEFAULTS}
            sx={GRID_SX}
            columns={ROOM_COLUMNS}
            rows={pooled.map((p) => ({ id: craftRateKey(p), ...p, rate: rate(p) }))}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            initialState={{
              pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } },
              sorting: { sortModel: [{ field: "item", sort: "asc" }, { field: "level", sort: "asc" }] },
            }}
          />
        </div>
      )}
    </>
  );
}

/** Success as a 0–100 number, so the column sorts and filters as one. */
const rate = (t: Tally): number => (t.attempts ? Math.round((t.ok / t.attempts) * 100) : 0);

/** "26–60", or one level, or nothing when the level was never known. */
function levelSpan(it: CraftItem): string {
  if (!it.levels.length) return "";
  const lo = it.levels[0].level;
  const hi = it.levels[it.levels.length - 1].level;
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

const when = (at: string) => at.replace("T", " ").slice(0, 16);

function minutes(s: CraftSitting): number {
  return Math.max(1, Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000));
}

const RATE_COL: GridColDef = {
  field: "rate",
  headerName: "Success",
  ...NUM_COL,
  width: 90,
  valueFormatter: (v: number) => `${v}%`,
};

type SittingRow = CraftSitting & { id: string; rate: number; skillName: string };

const SITTING_COLUMNS: GridColDef<SittingRow>[] = [
  { field: "start", headerName: "When", width: 140, valueFormatter: (v: string) => when(v) },
  { field: "minutes", headerName: "Min", ...NUM_COL, width: 60, valueGetter: (_v, row) => minutes(row) },
  { field: "skillName", headerName: "Skill", width: 120, valueFormatter: (v: string) => v || "—" },
  { field: "attempts", headerName: "Combines", ...NUM_COL, width: 95 },
  RATE_COL as GridColDef<SittingRow>,
  {
    field: "points",
    headerName: "Skill-ups",
    width: 110,
    valueFormatter: (_v, row) => (row.points ? `+${row.points} (${row.from}→${row.to})` : "—"),
  },
  {
    field: "items",
    headerName: "Made",
    flex: 1,
    minWidth: 200,
    sortable: false,
    valueGetter: (_v, row) => row.items.map((i) => `${i.item} ×${i.attempts}`).join(", "),
  },
];

type ItemRow = CraftItem & { id: string; rate: number; skillName: string; span: string };

const ITEM_COLUMNS: GridColDef<ItemRow>[] = [
  { field: "item", headerName: "Item", flex: 1, minWidth: 180, renderCell: (p) => <ItemLink title={p.row.item} craft /> },
  { field: "skillName", headerName: "Skill", width: 120, valueFormatter: (v: string) => v || "—" },
  { field: "attempts", headerName: "Combines", ...NUM_COL, width: 95 },
  { field: "ok", headerName: "Made", ...NUM_COL, width: 75 },
  RATE_COL as GridColDef<ItemRow>,
  { field: "span", headerName: "At skill", width: 90 },
  { field: "lastAt", headerName: "Last made", width: 140, valueFormatter: (v: string) => when(v) },
];

type LevelRow = {
  id: string;
  item: string;
  skill: string;
  level: number;
  attempts: number;
  ok: number;
  rate: number;
  roomAttempts: number;
  roomRate: number | null;
};

const LEVEL_COLUMNS: GridColDef<LevelRow>[] = [
  { field: "item", headerName: "Item", flex: 1, minWidth: 180, renderCell: (p) => <ItemLink title={p.row.item} craft /> },
  { field: "skill", headerName: "Skill", width: 120, valueFormatter: (v: string) => v || "—" },
  { field: "level", headerName: "Your skill", ...NUM_COL, width: 95 },
  { field: "attempts", headerName: "Combines", ...NUM_COL, width: 95 },
  { field: "ok", headerName: "Made", ...NUM_COL, width: 75 },
  RATE_COL as GridColDef<LevelRow>,
  {
    field: "roomAttempts",
    headerName: "Room combines",
    ...NUM_COL,
    width: 120,
    description: "Combines other players have shared for this item at this skill level",
    valueFormatter: (v: number) => (v ? v : "—"),
  },
  {
    field: "roomRate",
    headerName: "Room success",
    ...NUM_COL,
    width: 115,
    description: "Their success rate at this level, added up across everyone who shared",
    valueFormatter: (v: number | null) => (v === null ? "—" : `${v}%`),
  },
];

type RoomRow = PooledCraftRate & { id: string; rate: number };

const ROOM_COLUMNS: GridColDef<RoomRow>[] = [
  { field: "item", headerName: "Item", flex: 1, minWidth: 180, renderCell: (p) => <ItemLink title={p.row.item} craft /> },
  { field: "skill", headerName: "Skill", width: 120 },
  { field: "level", headerName: "At skill", ...NUM_COL, width: 90 },
  { field: "attempts", headerName: "Combines", ...NUM_COL, width: 95 },
  { field: "ok", headerName: "Made", ...NUM_COL, width: 75 },
  RATE_COL as GridColDef<RoomRow>,
  { field: "people", headerName: "People", ...NUM_COL, width: 80 },
];
