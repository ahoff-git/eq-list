import type { GridColDef } from "@mui/x-data-grid";
import type { SxProps, Theme } from "@mui/material/styles";

/**
 * dataGridDefaults.ts — the styling and pagination shorthand every table's grid wants, so ten grids
 * across seven files don't each reinvent "dense rows in this app's own colors, with a real pager"
 * (ADR 0230, ADR 0249).
 *
 * Config and data, not a component or a behavior — same reasoning `sorting.ts` and `SortHeader` were
 * built on: sharing the *look*, not the table. Each file still declares its own `columns` and owns
 * its own rows.
 *
 * **Every grid pages now** (ADR 0249, superseding ADR 0230's `autoHeight`/`hideFooter: true` default
 * for six of the seven tables). `autoHeight` and a real footer don't mix: it sizes the grid's
 * container to fit however many rows it was handed, so a multi-row-per-page footer ends up wherever
 * that page's *last* row happens to end rather than staying put — which is why `FactionPanel`'s
 * `FactionHitsGrid` needed a whole second, non-`autoHeight` export (`GRID_DEFAULTS_PAGED`) to page at
 * all. ADR 0230 hid the footer everywhere else specifically because a *multi-option* "rows per page"
 * `Select` misplaced its popover under this app's CSS-`zoom` scaling — a bug fixed at its root by
 * [ADR 0231](../../../specs/decisions/0231-the-zoom-root-moves-inside-the-shell.md) (moving the zoom
 * onto the window's own shell), which `FactionHitsGrid`'s own three-option picker has been proving
 * safe ever since. With that bug gone, hiding the footer everywhere else was a leftover workaround
 * outliving the thing it worked around.
 */
export const GRID_DEFAULTS = {
  density: "compact" as const,
  disableRowSelectionOnClick: false,
};

/** How many rows a page shows, and the choices offered — one shared list rather than each table
 *  guessing its own, so switching from a 25-row table to a 300-row one doesn't also mean relearning
 *  what the picker offers. `FactionPanel`'s `FactionHitsGrid` and `LootPanel`'s `DropTable` keep their own
 *  larger `[25, 50, 100]` (`HITS_PAGE_SIZES`) — a ledger with no cap wants bigger pages than a
 *  bounded catalogue does. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** The page size a table opens on, absent a reason to pick a different one. */
export const DEFAULT_PAGE_SIZE = 25;

/** The look every grid shares — colors, borders, row highlights — independent of how each one is
 *  sized (`GRID_SX`'s fixed height vs `GRID_SX_FILL`'s flex fill). Not exported: nothing outside
 *  this file has ever needed the look apart from a height. */
const GRID_LOOK_SX: SxProps<Theme> = {
  border: "none",
  fontSize: 13,
  "--DataGrid-rowBorderColor": "#2a2f38",
  "& .MuiDataGrid-columnHeaders": {
    background: "#171a1f",
    borderBottom: "1px solid #2a2f38",
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 600,
    fontSize: 12,
    color: "#99a1ad",
  },
  "& .MuiDataGrid-cell": {
    borderBottom: "1px solid #2a2f38",
  },
  "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
  "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
  "& .MuiDataGrid-row:hover": { background: "#10131a" },
  // The row a detail panel below the grid is currently open for (SpellTable, FactionPanel's
  // StandingTable) — the same "which row is this about" job `.hist-fight.on`'s accent bar does
  // elsewhere in the app.
  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
    background: "#10131a",
    boxShadow: "inset 2px 0 0 #f0b429",
  },
  // The shopping-list highlight (LootPanel's DropTable) — same color `.loot-table tr.wanted` uses.
  "& .MuiDataGrid-row.row-wanted": {
    background: "#f0b42933",
    boxShadow: "inset 2px 0 0 #f0b429",
  },
  "& .MuiDataGrid-row.row-out-of-era": { opacity: 0.55 },
};

/** A fixed box for a table that shares its page with other content (Items, Spells, Camp Report,
 *  Peer Scores, the fight breakdown's Spells view, Faction's Standings, Loot's Sells-for) — tall
 *  enough for a handful of rows plus its footer, with its own internal scrollbar for the rest, the
 *  same "bounded box, own scrollbar" shape `ResizablePanel`'s `.panel-resize` gives a map overlay. */
const GRID_HEIGHT = 420;
export const GRID_SX: SxProps<Theme> = { ...GRID_LOOK_SX, height: GRID_HEIGHT };

/** For a table that *is* the whole of its tab (`FactionPanel`'s Hits/Standings, `LootPanel`'s
 *  Drops/Sells-for) — fills whatever height its flex container hands it instead of a fixed box, so
 *  it uses a tall window rather than stopping partway down it (ADR 0248). The caller supplies that
 *  container: something up the ancestor chain needs a real height for `flex: 1` to fill, the same
 *  `flex: 1; min-height: 0` relay `.map-body`/`.panel-resize` already use elsewhere in this app. */
export const GRID_SX_FILL: SxProps<Theme> = { ...GRID_LOOK_SX, flex: 1, minHeight: 0 };

/** A numeric column's shorthand: right-aligned, numeric filter operators instead of text ones. */
export const NUM_COL: Pick<GridColDef, "type" | "align" | "headerAlign"> = {
  type: "number",
  align: "right",
  headerAlign: "right",
};

/** A cell with nowhere useful to sort or filter by — an actions column of buttons, not data. */
export const ACTION_COL: Pick<GridColDef, "sortable" | "filterable" | "disableColumnMenu" | "align" | "headerAlign"> =
  {
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    align: "right",
    headerAlign: "right",
  };

/**
 * Starts a set of columns hidden, so they show up unchecked in the grid's own "Manage columns" panel
 * (already on every column's menu — ADR 0230 — nothing to enable) rather than in the default view.
 *
 * For a field the row carries but the table's default view doesn't show — a raw log line, a rarer
 * stat, a split that's usually only in a hover — declaring it as an ordinary, filterable/sortable
 * `GridColDef` and listing its `field` here makes it reachable without changing what anyone sees by
 * default. Turning one of these *on* for everyone is a separate, human call (the person reading the
 * data decides that, not this file) — this only makes the data visible enough to inform it.
 */
export function hiddenByDefault(...fields: string[]): Record<string, boolean> {
  return Object.fromEntries(fields.map((field) => [field, false]));
}
