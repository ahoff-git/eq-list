"use client";
import { useEffect, useMemo, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { api } from "@/lib/api";
import { useRead, useWatcherStatus } from "@/lib/hooks";
import { rowsOf } from "@/lib/usePeerShare";
import { compareScores, type ScoreRow } from "@/shared/peer-share";
import { categoryOf, formatScore, scoreOrder } from "@/shared/high-scores";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "./dataGridDefaults";
import { Empty } from "./ui";
import type { HighScore, ReceivedShare, ScoreBoard } from "@/shared/types";

/** Stable empty, so a board that hasn't arrived doesn't restart the comparison memo each render. */
const NO_BOARD: ScoreBoard = { character: "", scores: [], streak: 0, seeded: false };

type Row = ScoreRow & { id: string };

/**
 * Everybody's personal bests, side by side.
 *
 * **Nothing merges.** A peer's figure cannot beat, seed or touch your board
 * ([ADR 0141](../../../specs/decisions/0141-the-room-is-a-meeting-place.md)) — a drop rate from a
 * stranger is a sample, but a 4000-damage hit is simply typed, and there is no way to tell an
 * unlucky streak from a liar in one number. So this lays the columns out and names who is ahead, and
 * that is the whole of it: the comparison is the feature, and the board stays yours.
 *
 * A `?` on a figure is [ADR 0130](../../../specs/decisions/0130-data-in-doubt-says-so.md)'s
 * provisional flag surviving the wire, and such a figure is **excluded from leading** — a number
 * that says it might be wrong should not take a crown it may not be owed.
 *
 * A `DataGrid` (ADR 0230), one column per peer — sortable and filterable like any other table here,
 * a capability this board never had before: ranking categories by how one peer's column stacks up,
 * or narrowing to categories where someone's figure clears a floor, are both a column filter away.
 * The default row order is still `scoreOrder`'s, since nothing sorted it until you ask.
 */
export default function PeerScores({ received }: { received: ReceivedShare[] }) {
  const status = useWatcherStatus();
  // Re-read on a record and on a bulk data change, and keyed on the log file — a board belongs to a
  // character, so switching logs switches boards with no event to announce it (`HighScoreBoard`
  // reads it the same way, for the same reasons).
  const [beaten, setBeaten] = useState(0);
  const board = useRead((a) => a.records.board(), NO_BOARD, [beaten, status.file]);
  useEffect(() => {
    const a = api();
    if (!a) return;
    const off = a.records.onRecord(() => setBeaten((n) => n + 1));
    const offData = a.app.onDataChanged(() => setBeaten((n) => n + 1));
    return () => {
      off();
      offData();
    };
  }, []);
  const theirs = useMemo(() => boardsOf(received), [received]);
  const rows = useMemo(
    () => compareScores({ character: board.character, scores: board.scores }, theirs, scoreOrder),
    [board, theirs],
  );

  const gridRows = useMemo<Row[]>(() => rows.map((row) => ({ ...row, id: row.categoryId })), [rows]);
  const characters = useMemo(() => rows[0]?.columns ?? [], [rows]);

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: "category",
        headerName: "Category",
        flex: 2,
        minWidth: 160,
        valueGetter: (_v, row) => categoryOf(row.categoryId).label,
        renderCell: (p) => {
          const category = categoryOf(p.row.categoryId);
          return <span title={category.blurb}>{category.label}</span>;
        },
      },
      ...characters.map(
        (c): GridColDef<Row> => ({
          field: c.character,
          headerName: c.character,
          renderHeader: () => (
            <span className={c.mine ? "mine" : undefined}>
              {c.character}
              {c.mine ? <span className="muted small"> (you)</span> : null}
            </span>
          ),
          ...NUM_COL,
          flex: 1,
          valueGetter: (_v, row) => row.columns.find((col) => col.character === c.character)?.score?.value,
          cellClassName: (p) => {
            const col = p.row.columns.find((x) => x.character === c.character);
            return [col?.mine ? "mine" : "", p.row.leader === c.character ? "leader" : ""].filter(Boolean).join(" ");
          },
          renderCell: (p) => {
            const col = p.row.columns.find((x) => x.character === c.character);
            const category = categoryOf(p.row.categoryId);
            if (!col?.score) {
              // A blank, not a zero: "never done it" and "did it, scored nothing" are different
              // claims and a 0 would assert the second.
              return <span className="muted">—</span>;
            }
            return (
              <span title={detail(col.score)}>
                {formatScore(category.unit, col.score.value)}
                {col.score.unsettled ? <span className="muted"> ?</span> : null}
              </span>
            );
          },
        }),
      ),
    ],
    [characters],
  );

  if (!theirs.length) {
    return (
      <section className="peers-block">
        <h3>High scores</h3>
        <Empty
          title="Nobody has shared a scoreboard."
          hint="Ask a peer above for their high scores, and they'll line up beside yours here."
        />
      </section>
    );
  }

  return (
    <section className="peers-block">
      <h3>High scores</h3>
      <div className="peers-scores-wrap">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          rows={gridRows}
          columns={columns}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
        />
      </div>
      <span className="hint">
        Nobody else&rsquo;s figure can change your board — these sit beside it and nothing more. A{" "}
        <b>?</b> is a provisional score, and doesn&rsquo;t count as leading.
      </span>
    </section>
  );
}

/**
 * Peers' scoreboards, one per person rather than one per row.
 *
 * The tray holds a flat list of scores tagged with who sent them, and a comparison wants columns —
 * so they're regrouped by the sender's **display name**, which is also what the column is headed
 * with. A board belongs to a character (`electron/high-scores.ts` rule 1) and the name we have is
 * the nearest thing to one a peer announces.
 */
function boardsOf(received: ReceivedShare[]): { character: string; scores: HighScore[] }[] {
  const by = new Map<string, HighScore[]>();
  for (const r of rowsOf<HighScore>(received, "scores")) {
    const held = by.get(r.by);
    if (held) held.push(r.row);
    else by.set(r.by, [r.row]);
  }
  return [...by.entries()].map(([character, scores]) => ({ character, scores }));
}

/** What a figure rests on, for the hover: when, where, and how often it's changed hands. */
function detail(score: HighScore): string {
  const bits = [score.detail, score.zone, score.at ? new Date(score.at).toLocaleDateString() : ""];
  return bits.filter(Boolean).join(" · ");
}
