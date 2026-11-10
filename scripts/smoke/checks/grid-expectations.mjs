/**
 * grid-expectations.mjs — which tables the sweep asserts on, where they are, and what each promises.
 *
 * Data, not logic: it is the manual checklist's list of tables (`specs/testing/manual-qa.md`) written
 * down once, so a new grid is one more entry rather than a new check. Each entry:
 *
 *   id          what the report calls it
 *   section     the section key (`AREAS`) the grid lives in
 *   view        a RegExp for the view-switch button that shows it; absent = what the section opens on
 *   hasField    which grid of the view, by a column it has — for views whose tables come and go
 *   gridIndex   which grid of the view by position, when there is more than one (default 0)
 *   extras      the columns Manage columns must offer, unticked (ADR 0251) — the labels as the app spells them
 *   columnFilter "absent" for a grid paged on the server, whose column menu must NOT offer a Filter (default: it must)
 *   optional    the grid may legitimately be absent (an empty state shown instead)
 *   fillsPanel  the grid is the whole of its tab, so its footer must stay on screen (ADR 0248)
 *   pagerFaultTarget  the grid `--inject-fault no-pager` strips the footer from (a fault needs one target)
 *   paging      Faction-Hits-style: assert ▶ / ◀ / page-size change (ADRs 0232, 0234)
 *   sortThenPage the sort is persisted, so the unstable-sortModel regression applies (ADR 0249)
 *
 * Peers' scoreboard is not here: it only renders once the peer room is connected, which an isolated
 * test instance must never be. It stays on the manual list.
 */
export const GRID_EXPECTATIONS = [
  {
    id: "Items",
    section: "items",
    extras: [/^classes$/i, /^races$/i, /^flags$/i, /^effects$/i, /^quests$/i, /^origin$/i, /^req\. level$/i, /^skill$/i, /^size$/i],
    sortThenPage: true,
  },
  { id: "Spells", section: "spells", extras: [], sortThenPage: true },
  {
    id: "Loot · Drops",
    section: "loot",
    view: /^Drops/,
    extras: [/^sold for$/i, /^raw line$/i],
    fillsPanel: true,
    sortThenPage: true,
    // Paged on the server, so `disableColumnFilter` is deliberate: a grid filter would narrow only the page
    // on screen while looking like it searched the ledger (LootPanel, ADR 0250 and 0251).
    columnFilter: "absent",
  },
  { id: "Loot · Sells for", section: "loot", view: /^Sells for/, extras: [/^sales$/i], fillsPanel: true, sortThenPage: true },
  {
    id: "Faction · Hits",
    section: "faction",
    view: /^Hits/,
    extras: [/^raw line$/i],
    fillsPanel: true,
    paging: true,
    sortThenPage: true,
  },
  {
    id: "Faction · Standings",
    section: "faction",
    view: /^Standings/,
    extras: [/^floor hits$/i, /^ceiling hits$/i, /^first hit$/i, /^ledger-observed$/i, /^corrected at$/i],
    fillsPanel: true,
    sortThenPage: true,
    pagerFaultTarget: true, // `--inject-fault no-pager` removes this grid's footer
  },
  // The Session tab shows a table per mob (this session's kills) and one per zone (past fights), each only
  // when it has rows, so they are found by a column of their own rather than by position.
  { id: "Session · per mob", section: "session", hasField: "mob", extras: [/^coin off corpses$/i, /^coin from sold drops$/i] },
  {
    id: "Session · per zone",
    section: "session",
    hasField: "fights",
    optional: true, // a fixture profile has no past fights
    extras: [/^xp$/i, /^damage dealt$/i, /^unsettled$/i],
  },
];

/**
 * Which of the view's grids an expectation is about: the one with the column it names (`hasField`), else
 * the one at `gridIndex` (default the first). `grids` is each showing grid's list of column fields;
 * returns the index, or -1 when there is no such grid.
 */
export function findGrid(grids, expectation) {
  if (expectation.hasField) return grids.findIndex((fields) => fields.includes(expectation.hasField));
  const index = expectation.gridIndex ?? 0;
  return index < grids.length ? index : -1;
}

/** The expectations that apply once a section is open on `view` (`null` = the view it opened on). */
export function expectationsAt(section, view, table = GRID_EXPECTATIONS) {
  return table.filter((e) => e.section === section && (e.view ? view !== null && e.view.test(view) : view === null));
}
