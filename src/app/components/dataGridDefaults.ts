import type { GridColDef } from "@mui/x-data-grid";
import type { SxProps, Theme } from "@mui/material/styles";

/**
 * dataGridDefaults.ts — the styling and column shorthand every table's grid wants, so seven tables
 * don't each reinvent "dense rows in this app's own colors" (ADR 0230).
 *
 * Config and data, not a component or a behavior — same reasoning `sorting.ts` and `SortHeader` were
 * built on: sharing the *look*, not the table. Each file still declares its own `columns` and owns
 * its own rows.
 */

/**
 * Grown to fit its rows rather than scrolling internally — every panel here already scrolls at the
 * page level, and a second, inner scrollbar would be a new kind of control nothing else in the app
 * has. `autoHeight` already draws every row, so the footer's pagination has nothing to page through
 * — `hideFooter` drops it, which also drops its "rows per page" `Select`, whose popover menu
 * mispositions under this app's per-window CSS-`zoom` scaling
 * ([ADR 0041](../../../specs/decisions/0041-interface-scale-is-a-css-zoom-per-window.md)): MUI's
 * `Popover` computes its position from `getBoundingClientRect()`, in zoomed/visual pixels, then
 * writes it back as unzoomed `style.top`/`left` on an element portaled to `document.body` — which
 * the ambient `zoom` scales a second time, so the further the scale sits from 100% the further the
 * menu lands from its anchor. A column's own filter/sort menu is `@mui/x-data-grid`'s own popper,
 * not `@mui/material`'s `Popover`, and wasn't reported broken — this removes the one control that was.
 */
export const GRID_DEFAULTS = {
  autoHeight: true,
  density: "compact" as const,
  disableRowSelectionOnClick: false,
  hideFooter: true,
};

export const GRID_SX: SxProps<Theme> = {
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
