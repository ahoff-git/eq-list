"use client";
import { useMemo, type SyntheticEvent } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "@/app/components/items/ItemLink";
import { ZoneNames } from "@/app/components/map/ZoneName";
import { ACTION_COL, GRID_DEFAULTS, GRID_SX_FIT, NUM_COL } from "@/app/components/dataGridDefaults";
import { WORN_LAYOUT, type BisPick } from "@/shared/items/bis";
import { slotLabel, type BisHunt, type BisPlan, type BisSlotChoice } from "@/shared/items/bis-plan";
import { withExcluded, withLock, type BisOptions, type BisSlotLock } from "@/shared/items/bis-options";
import type { ItemRow, StatWeights } from "@/shared/items/item-search";
import { derivedGains, type DerivedRate } from "@/shared/items/derived-stats";
import { GainNote } from "@/app/components/items/GainNote";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { wikiName } from "@/shared/shown-name";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** What the slot's picker is set to: the solver's choice, held empty, or one title. */
const SOLVER = "";
const EMPTY = "\u0000empty";

/** One row per worn slot, filled or not — an empty one says why, and what would fill it. */
interface SlotRow {
  /** The slot index — unique per row, and what the Slot column sorts by. */
  id: number;
  slotIndex: number;
  slot: string;
  pick?: BisPick;
  why?: string;
  hunt?: BisHunt;
  lock?: BisSlotLock;
  /** The wanted effect this slot's item is worn for. */
  pinnedFor?: string;
  /** The stone a wanted effect put in this slot's item, when one did. */
  stone?: string;
  stale?: BisPlan["staleLocks"][number];
  choices: BisSlotChoice[];
}

/**
 * Every slot in the layout, in order. An empty slot is one nothing is worth putting in, the off-hand a
 * two-hander took, or one you've held empty. With hunting off it carries the best hunt for that slot.
 */
function slotRows(plan: BisPlan, options: BisOptions): SlotRow[] {
  const bySlot = new Map(plan.loadout.picks.map((p) => [p.slotIndex, p]));
  const twoHander = plan.loadout.picks.find((p) => p.slot === "PRIMARY" && p.item.twoHanded);
  const stale = new Map(plan.staleLocks.map((s) => [s.slotIndex, s]));
  return WORN_LAYOUT.map((slot, slotIndex) => {
    const pick = bySlot.get(slotIndex);
    const claim = pick && plan.socketClaims.find((c) => c.host === gradedTitle(pick.item.title, pick.item.grade) || c.host === pick.item.title);
    const base = {
      id: slotIndex,
      slotIndex,
      slot,
      lock: options.locks[slotIndex],
      pinnedFor: plan.pinned[slotIndex],
      stone: claim ? `${claim.stone.effect} stone from ${claim.stone.from}` : undefined,
      stale: stale.get(slotIndex),
      choices: plan.alternatives[slotIndex] ?? [],
    };
    if (pick) return { ...base, pick };
    if (slot === "SECONDARY" && twoHander) return { ...base, why: `taken by ${twoHander.item.title}` };
    if (base.lock && "empty" in base.lock) return { ...base, why: "held empty" };
    if (options.includeHunt) return { ...base, why: "nothing fits, under your criteria" };
    return { ...base, why: "nothing you hold fits", hunt: plan.hunt.find((h) => h.slot === slot) };
  });
}

/** Held, but not where the loadout wears it — the row says where to move it from. */
const isMoved = (r: SlotRow) => !!r.pick?.item.heldAt && !r.pick.item.heldAt.startsWith("Worn");
/** To be hunted — nothing you hold is this. */
const isHunt = (r: SlotRow) => !!r.pick && !r.pick.item.heldAt;

/** What the slot's picker shows: the current lock, and one option per title — held or to hunt. */
function pickerOf(r: SlotRow): { chosen: string; best: BisSlotChoice[] } {
  const chosen = !r.lock ? SOLVER : "empty" in r.lock ? EMPTY : r.lock.title;
  return { chosen, best: r.choices.filter((c, i) => r.choices.findIndex((o) => o.title === c.title) === i) };
}

/**
 * Keeps a cell's own controls to themselves. The grid listens on the cell for keys (arrows move
 * between cells, space selects the row) and for clicks (row selection); a native `<select>` or button
 * inside it needs those events not to reach the grid, or arrowing through the picker's options would
 * move the cell focus instead.
 */
const stop = (e: SyntheticEvent) => e.stopPropagation();
const OWN_EVENTS = { onKeyDown: stop, onMouseDown: stop, onClick: stop };

/** Rows wrap notes under the item — what its attributes give, a planned stone, a stale lock — so each sizes to fit. */
const rowHeight = () => "auto" as const;

/** A rule down a row's Slot cell: accent for a move, warn for a hunt, border for an empty slot. */
const WEAR_SX = {
  // Every slot is on the one page (23 < `DEFAULT_PAGE_SIZE`), so the box grows to fit them.
  ...GRID_SX_FIT,
  "& .MuiDataGrid-row.bis-move .MuiDataGrid-cell[data-field='slot']": { boxShadow: "inset 3px 0 0 var(--accent)" },
  "& .MuiDataGrid-row.bis-hunt .MuiDataGrid-cell[data-field='slot']": { boxShadow: "inset 3px 0 0 var(--warn)" },
  "& .MuiDataGrid-row.bis-empty .MuiDataGrid-cell[data-field='slot']": { boxShadow: "inset 3px 0 0 var(--border)" },
  "& .MuiDataGrid-row.bis-empty .MuiDataGrid-cell": { opacity: 0.85 },
};

/**
 * The loadout, slot by slot — what you hold and where, and what you'd go and get and where from — and
 * the controls that tell the solver what *you* want: lock a slot to what's in it (🔒), pick something
 * else, hold it empty, or exclude an item from the whole page (⊘). Everything is by title, so it
 * survives the next dump (`bis-options.ts`). A `DataGrid` (ADR 0230), so every column sorts; it opens
 * in the worn layout's own order — the Slot column sorts by slot index, not by its label.
 */
export default function BisWearTable({
  plan,
  options,
  onOptions,
  weights = {},
  rates = [],
}: {
  plan: BisPlan;
  options: BisOptions;
  onOptions: (next: BisOptions) => void;
  /** Your own weights (unfolded) and your classes' rates — so a row can say what its attributes give you. */
  weights?: StatWeights;
  rates?: readonly DerivedRate[];
}) {
  const rows = useMemo(() => slotRows(plan, options), [plan, options]);

  const columns = useMemo<GridColDef<SlotRow>[]>(() => {
    const setLock = (slotIndex: number, lock: BisSlotLock | undefined) => onOptions(withLock(options, slotIndex, lock));
    const choose = (slotIndex: number, value: string) =>
      setLock(slotIndex, value === SOLVER ? undefined : value === EMPTY ? { empty: true } : { title: value });
    return [
      {
        field: "lock",
        headerName: "🔒",
        description: "Locked slots — the solver works around them, until you unlock them",
        width: 56,
        disableColumnMenu: true,
        valueGetter: (_v, row) => (row.lock ? 1 : 0),
        renderCell: ({ row: r }) => {
          const locked = !!r.lock;
          return (
            <button
              {...OWN_EVENTS}
              className={`btn ghost sm bis-lock${locked ? " on" : ""}`}
              aria-pressed={locked}
              title={
                locked
                  ? "Locked — the solver works around this slot. Click to let it choose again."
                  : r.pick
                    ? `Lock ${r.pick.item.title} here, and solve the rest around it`
                    : "Hold this slot empty"
              }
              onClick={(e) => {
                stop(e);
                setLock(r.slotIndex, locked ? undefined : r.pick ? { title: r.pick.item.title } : { empty: true });
              }}
            >
              {locked ? "🔒" : "🔓"}
            </button>
          );
        },
      },
      {
        field: "slot",
        headerName: "Slot",
        width: 100,
        cellClassName: "muted",
        valueGetter: (_v, row) => slotLabel(row.slot),
        // The layout's order, not the labels' alphabet — the row id is the slot index.
        sortComparator: (_a, _b, p1, p2) => Number(p1.id) - Number(p2.id),
      },
      {
        field: "item",
        headerName: "Item",
        flex: 2,
        minWidth: 200,
        valueGetter: (_v, row) => row.pick?.item.title ?? row.why,
        renderCell: ({ row: r }) => (
          <div>
            {r.pick ? (
              <>
                {/* By the graded name, so the hover shows this copy's numbers — the ones it was weighed by. */}
                <ItemLink title={gradedTitle(r.pick.item.title, r.pick.item.grade)} />
                {r.pinnedFor && (
                  <span className="bis-tag" title="Worn here for an effect you asked for">
                    {r.pinnedFor}
                  </span>
                )}
              </>
            ) : (
              <i className="muted">{r.why}</i>
            )}
            {r.pick && <GainNote gains={derivedGains(plan.pickStats[r.slotIndex] ?? {}, weights, rates)} />}
            {r.stone && <div className="small muted">◆ socket: {r.stone}</div>}
            {r.stale &&
              (r.stale.notHeld ? (
                <div className="small warn" title="The lock is kept — choose Owned + hunt and it's back in force">
                  locked to {r.stale.title}, which you don&apos;t hold — set aside while planning owned gear only
                </div>
              ) : (
                <div className="small warn" title="Locks are by name, and hold until unlocked — but nothing by that name can go here now">
                  locked to {r.stale.title}, which can&apos;t go here — solved without it until you unlock it
                </div>
              ))}
          </div>
        ),
      },
      {
        field: "value",
        headerName: "Value",
        ...NUM_COL,
        width: 80,
        valueGetter: (_v, row) => row.pick?.value,
        renderCell: (p) => (p.value === undefined ? <span className="muted">—</span> : p.value),
      },
      {
        field: "where",
        headerName: "Held / get from",
        description: "Where you hold a pick, or where to go and get one you don't",
        flex: 1.5,
        minWidth: 190,
        cellClassName: "small",
        valueGetter: (_v, row) =>
          row.pick ? (row.pick.item.heldAt ?? `hunt ${fromText(plan.huntFrom[row.pick.item.title])}`) : row.hunt?.item.title,
        renderCell: ({ row: r }) =>
          r.pick ? (
            r.pick.item.heldAt ? (
              isMoved(r) ? (
                <>from {r.pick.item.heldAt}</>
              ) : r.pick.kept ? (
                <span className="muted" title="Nothing under your weights and criteria matched this slot, so you keep what you wear">
                  {r.pick.item.heldAt} · kept
                </span>
              ) : (
                <span className="muted">{r.pick.item.heldAt}</span>
              )
            ) : (
              <HuntSource row={plan.huntFrom[r.pick.item.title]} />
            )
          ) : r.hunt ? (
            <>
              hunt <ItemLink title={wikiName(r.hunt.item.title)} /> <span className="good">{signed(r.hunt.gain)}</span>
            </>
          ) : null,
      },
      {
        field: "actions",
        headerName: "",
        ...ACTION_COL,
        width: 270,
        renderCell: ({ row: r }) => {
          const { chosen, best } = pickerOf(r);
          return (
            <span className="bis-actions">
              {/* What else could go here, held or to hunt — choosing one locks it in. */}
              <select {...OWN_EVENTS} className="select-sm" value={chosen} onChange={(e) => choose(r.slotIndex, e.target.value)} title="Choose what goes here yourself">
                <option value={SOLVER}>best (solver)</option>
                <option value={EMPTY}>keep empty</option>
                {r.lock && "title" in r.lock && !best.some((c) => c.title === chosen) && <option value={chosen}>{chosen}</option>}
                {best.map((c) => (
                  <option key={c.title} value={c.title}>
                    {gradedTitle(c.title, c.grade)} · {c.value} · {c.heldAt ?? "hunt"}
                  </option>
                ))}
              </select>
              {r.pick ? (
                <button
                  {...OWN_EVENTS}
                  className="btn ghost sm"
                  title={`Exclude ${r.pick.item.title}: never worn, hunted or used for an effect on this page — undo from Exclusions`}
                  onClick={(e) => {
                    stop(e);
                    onOptions(withExcluded(options, r.pick!.item.title));
                  }}
                >
                  ⊘
                </button>
              ) : (
                // Holds the column's width, so an empty slot's picker lines up with the rest.
                <button className="btn ghost sm" style={{ visibility: "hidden" }} tabIndex={-1} aria-hidden>
                  ⊘
                </button>
              )}
            </span>
          );
        },
      },
    ];
  }, [options, onOptions, plan.huntFrom, plan.pickStats, weights, rates]);

  return (
    <DataGrid
      {...GRID_DEFAULTS}
      sx={WEAR_SX}
      columns={columns}
      rows={rows}
      autoHeight
      hideFooter
      getRowHeight={rowHeight}
      getRowClassName={({ row }) => (!row.pick ? "bis-empty" : isHunt(row) ? "bis-hunt" : isMoved(row) ? "bis-move" : "")}
      initialState={{ sorting: { sortModel: [{ field: "slot", sort: "asc" }] } }}
    />
  );
}

/** Where a catalogue item comes from, as one line of text — the source column's sort value. */
function fromText(row: ItemRow | undefined): string {
  return row ? (row.zones[0] ?? row.kinds.join(", ")) : "";
}

/** Where a pick to hunt comes from: its zones (or how it's got), and its level. */
function HuntSource({ row }: { row: ItemRow | undefined }) {
  if (!row) return <span className="bis-tag">hunt</span>;
  const level = row.level ? (row.level.min === row.level.max ? `lv ${row.level.min}` : `lv ${row.level.min}–${row.level.max}`) : undefined;
  return (
    <span>
      <span className="bis-tag">hunt</span> <ZoneNames zones={row.zones} empty={row.kinds.join(", ") || "—"} className="muted" />
      {level && (
        <span className="muted" title={row.level?.why}>
          {" "}
          · {level}
        </span>
      )}
    </span>
  );
}
