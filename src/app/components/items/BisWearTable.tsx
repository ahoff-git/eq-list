"use client";
import { useMemo, type SyntheticEvent } from "react";
import { DataGrid, type GridColDef, type GridRowHeightParams } from "@mui/x-data-grid";
import ItemLink from "@/app/components/items/ItemLink";
import { ACTION_COL, GRID_DEFAULTS, GRID_SX_FIT, NUM_COL } from "@/app/components/dataGridDefaults";
import { WORN_LAYOUT, type BisPick } from "@/shared/items/bis";
import { slotLabel, type BisHunt, type BisPlan, type BisSlotChoice } from "@/shared/items/bis-plan";
import { toggleTitle, withLock, type BisOptions, type BisSlotLock } from "@/shared/items/bis-options";
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
  /** The wanted effect this slot's item is held for. */
  pinnedFor?: string;
  stale?: string;
  choices: BisSlotChoice[];
}

/**
 * Every slot in the layout, in order. An empty slot is one nothing you hold (that your criteria let
 * you wear) is worth putting in, the off-hand a two-hander took, or one you've held empty. It carries
 * the best hunt target for that slot, when the criteria leave one.
 */
function slotRows(plan: BisPlan, options: BisOptions): SlotRow[] {
  const bySlot = new Map(plan.loadout.picks.map((p) => [p.slotIndex, p]));
  const twoHander = plan.loadout.picks.find((p) => p.slot === "PRIMARY" && p.item.twoHanded);
  const stale = new Map(plan.staleLocks.map((s) => [s.slotIndex, s.title]));
  return WORN_LAYOUT.map((slot, slotIndex) => {
    const base = {
      id: slotIndex,
      slotIndex,
      slot,
      lock: options.locks[slotIndex],
      pinnedFor: plan.pinned[slotIndex],
      stale: stale.get(slotIndex),
      choices: plan.alternatives[slotIndex] ?? [],
    };
    const pick = bySlot.get(slotIndex);
    if (pick) return { ...base, pick };
    if (slot === "SECONDARY" && twoHander) return { ...base, why: `taken by ${twoHander.item.title}` };
    if (base.lock && "empty" in base.lock) return { ...base, why: "held empty" };
    return { ...base, why: "nothing you hold fits", hunt: plan.hunt.find((h) => h.slot === slot) };
  });
}

/** Worn somewhere else now — the row says where to move it from. */
const isMoved = (r: SlotRow) => !!r.pick && !r.pick.item.heldAt?.startsWith("Worn");

/** What the slot's picker shows: the current lock, and one option per title — its best copy, since a
 *  lock takes the best copy that fits anyway. */
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

/** Slot rows that wrap a stale-lock note need their own height; the rest keep the compact default. */
const rowHeight = ({ model }: GridRowHeightParams) => ((model as SlotRow).stale ? "auto" : null);

/** The moved/empty rule down a row's Slot cell — what `.bis-wear`'s `td:nth-child(2)` did for the
 *  old table, keyed by field now that the grid's cells aren't `td`s. */
const WEAR_SX = {
  // Every slot is on the one page (23 < `DEFAULT_PAGE_SIZE`), so the box grows to fit them.
  ...GRID_SX_FIT,
  "& .MuiDataGrid-row.bis-move .MuiDataGrid-cell[data-field='slot']": { boxShadow: "inset 3px 0 0 var(--accent)" },
  "& .MuiDataGrid-row.bis-empty .MuiDataGrid-cell[data-field='slot']": { boxShadow: "inset 3px 0 0 var(--border)" },
  "& .MuiDataGrid-row.bis-empty .MuiDataGrid-cell": { opacity: 0.85 },
};

/**
 * The Wear table: the loadout slot by slot, and the controls that tell the solver what *you* want —
 * lock a slot to what's in it (🔒), pick something else from what you hold, hold it empty, or bench
 * an item so it's never worn. Everything is by title, so it survives the next dump (`bis-options.ts`).
 * A `DataGrid` (ADR 0230), so every column sorts; it opens in the worn layout's own order — the Slot
 * column sorts by slot index, not by its label.
 */
export default function BisWearTable({
  plan,
  options,
  onOptions,
}: {
  plan: BisPlan;
  options: BisOptions;
  onOptions: (next: BisOptions) => void;
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
        description: "Locked slots — the solver works around them",
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
                  <span className="bis-tag" title="Held here for an effect you asked for">
                    {r.pinnedFor}
                  </span>
                )}
              </>
            ) : (
              <i className="muted">{r.why}</i>
            )}
            {r.stale && (
              <div className="small warn" title="Locks are by name; the newest dump has no copy of it that fits here">
                locked to {r.stale}, which you no longer hold here — solved without it
              </div>
            )}
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
        headerName: "Held at / hunt",
        description: "Where a pick is held now, or what to hunt for an empty slot",
        flex: 1.5,
        minWidth: 180,
        cellClassName: "small",
        valueGetter: (_v, row) => row.pick?.item.heldAt ?? row.hunt?.item.title,
        renderCell: ({ row: r }) =>
          r.pick ? (
            isMoved(r) ? <>from {r.pick.item.heldAt}</> : <span className="muted">{r.pick.item.heldAt}</span>
          ) : r.hunt ? (
            <>
              hunt <ItemLink title={wikiName(r.hunt.item.title)} /> <span className="good">{signed(r.hunt.gain)}</span>
            </>
          ) : r.why === "nothing you hold fits" ? (
            <span className="muted">nothing in the catalogue matches your criteria either</span>
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
              {/* What else you hold that fits — choosing one locks it in. */}
              <select
                {...OWN_EVENTS}
                className="select-sm"
                value={chosen}
                onChange={(e) => choose(r.slotIndex, e.target.value)}
                title="Choose what goes here yourself"
              >
                <option value={SOLVER}>best (solver)</option>
                <option value={EMPTY}>keep empty</option>
                {r.lock && "title" in r.lock && !best.some((c) => c.title === chosen) && <option value={chosen}>{chosen}</option>}
                {best.map((c) => (
                  <option key={c.title} value={c.title}>
                    {gradedTitle(c.title, c.grade)} · {c.value}
                    {c.heldAt ? ` · ${c.heldAt}` : ""}
                  </option>
                ))}
              </select>
              {r.pick ? (
                <button
                  {...OWN_EVENTS}
                  className="btn ghost sm"
                  title={`Bench ${r.pick.item.title}: never wear it, wherever it would go`}
                  onClick={(e) => {
                    stop(e);
                    onOptions({ ...withLock(options, r.slotIndex, undefined), benched: toggleTitle(options.benched, r.pick!.item.title) });
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
  }, [options, onOptions]);

  return (
    <DataGrid
      {...GRID_DEFAULTS}
      sx={WEAR_SX}
      columns={columns}
      rows={rows}
      autoHeight
      hideFooter
      getRowHeight={rowHeight}
      getRowClassName={({ row }) => (row.pick ? (isMoved(row) ? "bis-move" : "") : "bis-empty")}
      initialState={{ sorting: { sortModel: [{ field: "slot", sort: "asc" }] } }}
    />
  );
}
