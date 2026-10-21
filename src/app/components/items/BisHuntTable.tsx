"use client";
import { useMemo, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ItemLink from "@/app/components/items/ItemLink";
import { ZoneNames } from "@/app/components/map/ZoneName";
import { AddButton, PickField } from "@/app/components/ui";
import { ACTION_COL, DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { addByTitle } from "@/lib/items/addToList";
import { useShoppingList } from "@/lib/hooks";
import { normalizeItemName } from "@/shared/items/grouping";
import { HUNT_GRADES, slotLabel, type BisHunt } from "@/shared/items/bis-plan";
import { gradedTitle } from "@/shared/items/item-upgrade";
import { wikiName } from "@/shared/shown-name";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

type Row = BisHunt & { id: string; listed: boolean };

/** A gain column: what the item adds over what it pushes out, at one grade. `+0` is `gain` itself. */
function gainCol(grade: number, index?: number): GridColDef<Row> {
  return {
    field: `g${grade}`,
    headerName: `+${grade}`,
    description: grade ? `At +${grade} — merging ${2 ** grade} copies` : "As it drops",
    ...NUM_COL,
    width: 72,
    valueGetter: (_v, row) => (index === undefined ? row.gain : row.atGrades[index]?.gain),
    // The figure is the link: hovering it shows the card *at this grade*, so the number can be read
    // against the stats that make it.
    renderCell: (p) =>
      p.value === undefined ? (
        "—"
      ) : (
        <ItemLink title={gradedTitle(p.row.item.title, grade)} label={signed(p.value as number)} className={grade ? "muted" : "good"} />
      ),
  };
}

/**
 * The Hunt table: what to go and get, by what it would add over what it replaces — at `+0`, and at
 * the grades more copies would buy (`HUNT_GRADES`). A `DataGrid` (ADR 0230), so every column sorts;
 * it opens ranked by `+0` gain, the order the plan hands it in. Each row goes straight onto the
 * shopping list (+), or out of the suggestions for good (✕, kept in the options so it stays gone
 * across dumps). A row already on the list says so, so a second evening's look doesn't re-add the
 * first one's farm.
 */
export default function BisHuntTable({ hunt, onSkip }: { hunt: readonly BisHunt[]; onSkip: (title: string) => void }) {
  const [slot, setSlot] = useState("");
  const list = useShoppingList();
  const onList = useMemo(() => new Set(list.entries.map((e) => normalizeItemName(e.name))), [list.entries]);
  const slots = useMemo(() => [...new Set(hunt.map((h) => h.slot))].map((s) => ({ value: s, label: slotLabel(s) })), [hunt]);
  const rows = useMemo<Row[]>(
    () =>
      (slot ? hunt.filter((h) => h.slot === slot) : hunt).map((h) => ({
        ...h,
        id: h.item.id,
        listed: onList.has(normalizeItemName(h.item.title)),
      })),
    [hunt, slot, onList],
  );
  const notListed = rows.filter((r) => !r.listed);

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: "item",
        headerName: "Item",
        flex: 2,
        minWidth: 180,
        valueGetter: (_v, row) => row.item.title,
        renderCell: (p) => <ItemLink title={wikiName(p.row.item.title)} />,
      },
      { field: "slot", headerName: "Slot", width: 100, valueGetter: (_v, row) => slotLabel(row.slot), cellClassName: "muted" },
      gainCol(0),
      ...HUNT_GRADES.map((grade, i) => gainCol(grade, i)),
      {
        field: "replaces",
        headerName: "Replaces",
        flex: 1.5,
        minWidth: 150,
        valueGetter: (_v, row) => (row.replaces ? gradedTitle(row.replaces.item.title, row.replaces.item.grade) : "empty slot"),
        renderCell: (p) =>
          p.row.replaces ? (
            <ItemLink title={gradedTitle(p.row.replaces.item.title, p.row.replaces.item.grade)} />
          ) : (
            <span className="muted">empty slot</span>
          ),
      },
      {
        field: "level",
        headerName: "Level",
        ...NUM_COL,
        width: 80,
        description: "What level its source is, where anything says",
        valueGetter: (_v, row) => row.row.level?.min,
        renderCell: (p) => {
          const level = p.row.row.level;
          return (
            <span className="muted" title={level?.why}>
              {level ? (level.min === level.max ? level.min : `${level.min}–${level.max}`) : "—"}
            </span>
          );
        },
      },
      {
        field: "from",
        headerName: "From",
        flex: 1.5,
        minWidth: 140,
        valueGetter: (_v, row) => row.row.zones[0] ?? row.row.kinds.join(", "),
        renderCell: (p) => <ZoneNames zones={p.row.row.zones} empty={p.row.row.kinds.join(", ")} className="small muted" />,
      },
      {
        field: "actions",
        headerName: "",
        ...ACTION_COL,
        width: 130,
        renderCell: (p) => (
          <span className="bis-actions">
            <AddButton
              className={`btn sm${p.row.listed ? " ghost" : ""}`}
              title={p.row.listed ? "Already on the shopping list — add another" : "Put it on the shopping list"}
              onAdd={() => void addByTitle(p.row.item.title, p.row.row.item.wikiPath)}
            >
              {p.row.listed ? "✓ listed" : "+ Add"}
            </AddButton>
            <button className="btn ghost sm" title="Never suggest this — undo from Your choices above" onClick={() => onSkip(p.row.item.title)}>
              ✕
            </button>
          </span>
        ),
      },
    ],
    [onSkip],
  );

  return (
    <>
      <div className="row wrap">
        <PickField value={slot} onChange={setSlot} blank="every slot" options={slots} title="Only hunts for one slot" />
        {notListed.length > 1 && (
          <AddButton
            className="btn sm"
            title="Put the best hunt for each slot on the shopping list — one per slot, since two for the same slot each assume the other wasn't got"
            onAdd={() => {
              // The plan's own ranking (`+0` gain), whatever column the grid is showing sorted.
              const firstPerSlot = notListed.filter((h, i) => notListed.findIndex((o) => o.slot === h.slot) === i);
              void (async () => {
                for (const h of firstPerSlot) await addByTitle(h.item.title, h.row.item.wikiPath);
              })();
            }}
          >
            + Add the best per slot
          </AddButton>
        )}
      </div>
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        columns={columns}
        rows={rows}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
      />
    </>
  );
}
