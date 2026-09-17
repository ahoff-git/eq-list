# 0251: A grid's unshown columns are still reachable, hidden rather than absent

## Status

Accepted

The `hiddenByDefault` helper and every column it applies to stand. Its `causeKind`/`raw`
`filterable: false` call, specifically, is superseded by [0260](./0260-a-paged-grids-filter-allow-list-can-widen-past-its-sort.md):
both turned out to be backed by a real column or expression `hitsPage` can filter on after all — only
`sortable: false` was actually load-bearing for either.

## Context

Every row `DataGrid` draws (ADR 0230) carries more than its columns show. `ItemRow` alone has
`classes`, `races`, `flags`, `requiredLevel`, `skill`, `size`, `effects` and the full `quests` list
sitting on it unused by `ItemTable`, and eleven of `ItemStats`' twenty numeric stats go unrendered
whenever the weight editor hasn't asked for them as one of its chosen `columns` — the card read them,
the row carries them, nothing draws them. The same shape repeats everywhere: `SpellStat` tracks
`resists`/`blocked`/`fizzles`/`interrupts` as one combined "Failed" cell in `SpellTable` and never
surfaces `lands`, `maxHit`, `ticks`, `tickDamage`, `overhealed` or `invocationHealed` at all;
`FactionRecord` carries the original log line (`raw`) that `HitTable` parsed a row from and never
shows it; `FactionStanding` computes `floors`/`ceilings`/`firstAt` and an optional `correction` that
only ever reach a hover or nothing; `LootRecord`'s `soldFor` and `ItemPrice`'s `sales` are folded into
another cell's tooltip instead of standing on their own; `MobKillStat`/`ZoneReport` split `copper`
into corpse coin vs. auto-sold coin only in a hover, and `ZoneReport` alone also tracks `xpPct`,
`yourDealt` and `unsettled` with no cell at all.

None of this is a bug — every one of those fields is either folded into a friendlier combined column
or deliberately left for a hover, and that's still the right default for a reader who wants "is this
worth killing" or "what's on this ring" at a glance. But it means nobody can tell **what the app has
actually collected** without reading the source, and the person deciding what belongs in that default
view for everyone needs to see the fuller row first — the whole point of asking is to find out whether
the app is already sitting on something worth promoting, not to guess from the schema. Changing what's
on by default is a separate, human call once that's visible; this decision is only about making it
visible.

`DataGrid`'s own column menu already ships a "Manage columns" item (`GridColumnMenuColumnsItem`,
confirmed by reading `@mui/x-data-grid`'s own source rather than assumed) on the Community tier, with
no toolbar or extra wiring needed — it lists every column a grid was given, checked or not, and toggles
visibility from there. ADR 0230 already turned this on for every table by not disabling it. The gap was
never the surface; it was that a field with no `GridColDef` at all can't appear in a panel that only
ever lists columns it was handed.

## Decision

**A field a row carries but the default view doesn't draw gets an ordinary `GridColDef` like any
other, and starts hidden.** `dataGridDefaults.ts` gains one helper for this:

```ts
export function hiddenByDefault(...fields: string[]): Record<string, boolean> {
  return Object.fromEntries(fields.map((field) => [field, false]));
}
```

passed to `initialState.columns.columnVisibilityModel` beside whatever pagination/sorting state a
grid already seeds. Nothing else changes — the same "Manage columns" item ADR 0230 already turned on
now has something to list beyond the columns already on screen, and ticking one on is exactly as
durable (or not) as any other grid preference already is: local to that install, gone if storage is
cleared, never synced to what anyone else sees.

Applied per grid:

- **`ItemTable`**: every `STATS` key not currently one of the weight editor's chosen `columns` (they
  already sort correctly either way — `ItemSortKey` is `"name" | "value" | "slot" | "source" | "zone" |
  "level" | StatKey`, a superset that was already true before this decision), plus `origin`, `classes`,
  `races`, `flags`, `requiredLevel`, `skill`, `size`, `effects` and `quests` — all `sortable: false`
  (they aren't `ItemSortKey` members, and `sortingMode="server"` here means a sort must resolve to a
  real, persisted `Sort<ItemSortKey>` or `useItemQuery` has nothing to act on).

  Because which stats are "currently chosen" is a **prop**, not a constant, and `ItemSearchPanel` never
  remounts `ItemTable` when the weight editor's picks change, the `DataGrid` here carries
  `key={columns.join(",")}`: `initialState` is only ever consulted once, so without a fresh key a stat
  promoted into `columns` after mount would still carry the `hidden: false` its very first render seeded
  it with. Remounting on the one prop that decides the model is simpler than hand-rolling a controlled
  `columnVisibilityModel` merge for a picker that changes rarely.

- **`SpellCatalogTable`**: `outOfEra`, `beneficial`, `instant` — the first already shows as a badge
  beside the name, the other two never appear anywhere. All `sortable: false` (`SpellSortKey` is
  closed and doesn't name them).

- **`SpellTable`**: `rank`, `lands`, `maxHit`, `ticks`, `tickDamage`, `maxTick`, `resists`, `blocked`,
  `fizzles`, `interrupts` (today only ever seen combined as "Failed"), `overhealed`,
  `invocationHealed`, `manaSpent`, `healPerMana`. This grid's sort is never read outside it (ADR 0230),
  so nothing stops these being ordinarily sortable.

- **`FactionPanel`**: `HitTable` and `FactionHitsForStanding` both gain `raw` (the original log line),
  `sortable: false` and, on `HitTable`, `filterable: false` too — `hitsPage`'s server-side sort/filter
  allow-lists (`FactionHitSortField`, `HIT_FILTER_FIELDS`) don't know this field, and a menu item that
  silently does nothing is worse than one that isn't offered. `StandingTable` gains `floors`,
  `ceilings`, `firstAt`, `observedNet` and `correctedAt` (the latter two off `FactionStanding.correction`,
  present only once a player has stated a real total) — all `sortable: false` since
  `FactionStandingSortKey` is closed too.

- **`LootPanel`**: `DropTable` gains `soldFor` and `raw`; `PriceTable` gains `sales`. All
  `sortable: false` (`LootSortKey`/`PriceSortKey` are closed).

- **`CampReport`**: both the per-mob and per-zone tables gain the raw `copper`/`soldCopper` split
  behind their combined "Coin" column's hover; the per-zone table also gains `xpPct`, `yourDealt` and
  `unsettled`. Neither table's sort is read outside the grid, so these stay ordinarily sortable.

**`PeerScores` is deliberately untouched.** It isn't a row with fields to spare — it's a pivot, one
column per peer, and every per-score detail (`zone`, `previous`, `beaten`) already lives in that cell's
own hover. There's no "the rest of the row" to expose, because there is no fixed row shape to have left
something off of.

## Consequences

- Nobody has to read `shared/types.ts` to find out what a ledger or a catalogue actually recorded — the
  same "Manage columns" panel every grid already had (ADR 0230) now has something to check.
- The default view is unchanged for every existing user: `hiddenByDefault` only ever seeds `false`, so
  a fresh install and an upgraded one look identical until someone opens the panel.
- Most of the new columns are `sortable: false`. Every persisted `Sort<K>` in this app (`ItemSortKey`,
  `SpellSortKey`, `FactionHitSortKey`, `FactionStandingSortKey`, `LootSortKey`, `PriceSortKey`) is a
  closed union that predates this decision and doesn't name these fields, and a column whose sort click
  silently fails (or, worse, corrupts the persisted sort key into something `nextSort`/`compareValues`
  was never built to hold) is a worse outcome than a column that's plainly unsortable. Widening one of
  those unions to make a specific field sortable is possible later and is its own, smaller decision —
  not taken on here.
- Promoting one of these into the *default* view for everyone is explicitly **not** this decision — it
  stays a change to that grid's own visible `columns`/`GridColDef` list, made by a person who looked at
  what the panel turned up and decided it earns a permanent place, same as any other column always has.
