"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useItemPrices, useLootFeed, useLootSearch, useLootVocabulary, useShoppingList } from "@/lib/hooks";
import { usePersistentShape, usePersistentState } from "@/lib/usePersistentState";
import { useGridSort } from "@/lib/useGridSort";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { lootKey } from "@/shared/loot-feed";
import {
  DEFAULT_LOOT_FILTERS,
  DEFAULT_LOOT_SORT,
  DEFAULT_PRICE_SORT,
  LOOT_FATES,
  filterLoot,
  foldSources,
  foldZones,
  isFiltered,
  sortLoot,
  sortPrices,
  tallyFates,
  type LootFilters,
  type LootSortKey,
  type PriceSortKey,
} from "@/shared/loot-filters";
import { normalizeItemName } from "@/shared/grouping";
import { describeCoins, formatCoins } from "@/shared/money";
import type { Sort } from "@/shared/sorting";
import ItemLink from "./ItemLink";
import ZoneTag from "./ZoneTag";
import { DEFAULT_PAGE_SIZE, GRID_DEFAULTS, GRID_SX_FILL, NUM_COL, PAGE_SIZE_OPTIONS } from "./dataGridDefaults";
import type { ItemPrice, LootFate, LootRecord, LootSearchFilter } from "@/shared/types";

import { count, countOf, dayTime, when } from "@/shared/format";
import { CheckField, Empty, PickField, segCls } from "./ui";
/**
 * Everything that has dropped and what became of it — kept, sold, stored in a depot, or consumed
 * to make something else. The log distinguishes all four and they matter differently: a sold item
 * is gone, a combined one turned into something, a stored one is in a depot rather than your bags.
 *
 * **Two views, not one scroll.** The drops and the prices answer different questions, and stacking
 * them meant a few hundred rows of ledger pushed "what it sells for" off the bottom of the screen
 * where nobody would ever see it. They're segmented the way the damage tab's scopes are, so each
 * one gets the panel.
 *
 * **The ledger, not the session.** `loot-log.ts` persists it and reads it back on launch, so what's
 * listed here reaches back through previous runs. That's also why it needs filters: by the second
 * evening this is mostly trash you've already dealt with.
 *
 * Names are `ItemLink`s, so the same hover card and in-app navigation the List tab gives
 * work here too — the point of the tab is to notice *what you got* without having to know
 * in advance to add it to a list.
 *
 * Rows on your shopping list are highlighted, and "on my list" is one of the filters. That's
 * deliberately still the only highlight rule: it's free (the list is already in hand) and it can't
 * cry wolf. Broader rules ("used by a quest in my level range in this zone") are a filter question
 * now that there are filters — see the todo.
 *
 * The prices view is the item half of the money question (ADR 0047): an auto-sell is the only line
 * that ever prices an item, and a price holds wherever the item dropped — so it's worth keeping per
 * item, apart from what any one mob's corpses paid.
 *
 * Both tables are `DataGrid`s (ADR 0230), which adds a per-column filter menu on top of
 * `LootFilterBar` — two different questions sharing a screen rather than a mechanism, matching
 * [ADR 0211](../../../specs/decisions/0211-a-loot-filter-searches-the-ledger-not-the-window.md)'s
 * distinction: a grid column filter only ever narrows what's already on screen, never the ledger
 * itself.
 *
 * **Drops reaches the whole ledger unconditionally now, and pages through it** (ADR 0249, extending
 * ADR 0211/0240). The "small window unless a filter engages" split used to exist so the common case
 * stayed cheap, but with nowhere left for the grid to draw more than `MAX_ROWS` at once, the payoff
 * was a fetch that was still capped in every practical sense — just a fetch you couldn't see past.
 * `DropTable` now always reads from `loot.search`, and an empty filter is simply a query with no
 * `WHERE` clause (every row, same as `recent`'s own order). A real footer pages through however much
 * that comes to, the same picker `FactionPanel`'s `HitTable` proved out — see that ADR for why
 * client-side pagination over an already-fetched array is the right scope here rather than a
 * `hitsPage`-style paged IPC surface: nothing has shown the whole-ledger fetch itself costs enough to
 * be worth a second bespoke query shape, and `loot.search`'s own index (ADR 0241) already makes it
 * cheap to ask for.
 */
const FATE_LABEL: Record<LootFate, string> = {
  kept: "kept",
  sold: "sold",
  stored: "stored",
  combined: "combined",
};

type View = "drops" | "prices";

/** A single newest-drop probe — cheap (one row), and enough to answer "is the ledger empty" and to
 *  key the prices refetch, without fetching the window `DropTable` now owns fetching for itself (the
 *  same trick `FactionPanel`'s `HITS_PROBE_QUERY` uses). */
const PROBE_FETCH = 1;

export default function LootPanel() {
  // All four persist: this is a panel you set up the way you read it, and every one of them was
  // resetting the moment you looked at another tab.
  const [view, setView] = usePersistentState<View>(STORAGE_KEYS.lootView, "drops");
  const [filters, setFilters] = usePersistentShape<LootFilters>(STORAGE_KEYS.lootFilters, DEFAULT_LOOT_FILTERS);
  const [lootSort, setLootSort] = usePersistentState<Sort<LootSortKey>>(STORAGE_KEYS.lootSort, DEFAULT_LOOT_SORT);
  const [priceSort, setPriceSort] = usePersistentState<Sort<PriceSortKey>>(
    STORAGE_KEYS.lootPriceSort,
    DEFAULT_PRICE_SORT,
  );

  const probe = useLootFeed(PROBE_FETCH);
  // Always a real query, even with nothing filtered — an empty filter is just no `WHERE` clause, so
  // this reaches the whole ledger unconditionally rather than switching between a small fetched
  // window and a full search depending on whether a filter happens to be engaged.
  const searchFilter = useMemo<LootSearchFilter>(
    () => ({
      fate: filters.fate === "all" ? undefined : filters.fate,
      item: filters.item.trim() || undefined,
      source: filters.source || undefined,
      zone: filters.zone || undefined,
    }),
    [filters.fate, filters.item, filters.source, filters.zone],
  );
  const { matches: source } = useLootSearch(searchFilter);

  const list = useShoppingList();
  // Only a sale can change a price, and the newest drop is the cheapest signal that one landed.
  // Keyed by the drop's whole identity rather than its `logId`: that counter restarts at zero
  // every launch, so on its own it can repeat the value it already held and the refetch is skipped.
  // The probe, not `source` — a filter narrowing what matches shouldn't also narrow which drop
  // counts as "the newest one" for this.
  const prices = useItemPrices(probe[0] ? lootKey(probe[0]) : "");

  // Names on the shopping list, normalized the same way the store matches them.
  const wanted = useMemo(
    () => new Set(list.entries.map((e) => normalizeItemName(e.name))),
    [list.entries],
  );

  const matches = useMemo(
    () => sortLoot(filterLoot(source, filters, wanted), lootSort),
    [source, filters, wanted, lootSort],
  );
  // Tallied over every match — the grid pages through all of them now, but the tally by the header
  // always meant every match, not just a page's worth.
  const totals = useMemo(() => tallyFates(matches), [matches]);
  // Every corpse and camp the ledger has ever recorded, not just what's currently fetched — so
  // choosing a filter can't remove an option you'd need to choose a different one (ADR 0240).
  const vocabulary = useLootVocabulary();
  const sources = useMemo(() => foldSources(vocabulary.sources), [vocabulary.sources]);
  const zones = useMemo(() => foldZones(vocabulary.zones), [vocabulary.zones]);
  const sortedPrices = useMemo(() => sortPrices(prices, priceSort), [prices, priceSort]);

  if (probe.length === 0) {
    return (
      <Empty
        title="Nothing has dropped yet."
        hint="Loot lines appear here as they happen — what dropped, from what, and where it went. The list is kept, so it will still be here next time you open the app."
      />
    );
  }

  return (
    <div className="tab-fill">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="segmented">
          <button
            className={segCls(view === "drops")}
            onClick={() => setView("drops")}
            title="Every drop on record, newest first — kept across restarts"
          >
            Drops
          </button>
          <button
            className={segCls(view === "prices")}
            onClick={() => setView("prices")}
            title="What your trash sells for, learned from your own auto-sells"
          >
            Sells for{prices.length ? ` (${prices.length})` : ""}
          </button>
        </div>
        <span className="spacer" />
        {view === "drops" && (
          <>
            <span className="muted small" title="Drops matching the filters, reached across the whole ledger">
              {countOf(matches.length, source.length, "drop")}
            </span>
            {LOOT_FATES.filter((fate) => totals[fate] > 0).map((fate) => (
              <span key={fate} className={`fate-tally f-${fate}`}>
                {totals[fate]} {FATE_LABEL[fate]}
              </span>
            ))}
          </>
        )}
      </div>

      <div className="tab-fill-body">
        {view === "drops" ? (
          <>
            <LootFilterBar filters={filters} onFilters={setFilters} sources={sources} zones={zones} />
            <DropTable drops={matches} wanted={wanted} sort={lootSort} onSort={setLootSort} />
          </>
        ) : (
          <PriceTable prices={sortedPrices} sort={priceSort} onSort={setPriceSort} />
        )}
      </div>
    </div>
  );
}

/** The filters, in the order you'd reach for them: what happened to it, what it was, whose corpse. */
function LootFilterBar({
  filters,
  onFilters,
  sources,
  zones,
}: {
  filters: LootFilters;
  onFilters: (next: LootFilters) => void;
  sources: string[];
  /** The camps present, already folded to one option each (`lootZones`). */
  zones: string[];
}) {
  const set = <K extends keyof LootFilters>(key: K, value: LootFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  return (
    <div className="row wrap loot-filters">
      <div className="segmented">
        <button className={segCls(filters.fate === "all")} onClick={() => set("fate", "all")} title="Every fate">
          all
        </button>
        {LOOT_FATES.map((fate) => (
          <button
            key={fate}
            className={segCls(filters.fate === fate)}
            onClick={() => set("fate", fate)}
            title={FATE_HINT[fate]}
          >
            {FATE_LABEL[fate]}
          </button>
        ))}
      </div>

      <input
        className="field sm"
        placeholder="item…"
        value={filters.item}
        onChange={(e) => set("item", e.target.value)}
        title="Only drops whose name contains this"
      />

      <PickField
        value={filters.source}
        onChange={(source) => set("source", source)}
        blank="any corpse"
        options={sources.map((s) => ({ value: s, label: s }))}
        title="Only drops off this corpse"
      />

      {/* Offered only once the ledger has a camp to offer — a picker with one blank option is a
          control that does nothing, and every drop recorded before drops carried a zone has none. */}
      {zones.length > 0 && (
        <PickField
          value={filters.zone}
          onChange={(zone) => set("zone", zone)}
          blank="any zone"
          options={zones.map((z) => ({ value: z, label: z }))}
          title="Only drops looted in this zone — every difficulty of it, since the camp is the same place"
        />
      )}

      <CheckField
        label="on my list"
        checked={filters.wantedOnly}
        onChange={(on) => set("wantedOnly", on)}
        title="Only drops that are on your shopping list"
      />

      {isFiltered(filters) && (
        <button className="btn ghost sm" onClick={() => onFilters(DEFAULT_LOOT_FILTERS)} title="Show everything again">
          Clear
        </button>
      )}
    </div>
  );
}

const FATE_HINT: Record<LootFate, string> = {
  kept: "Went into your bags",
  sold: "Auto-sold on the spot — the only line that ever states a price",
  stored: "Auto-stored in a depot or currency tab, not your bags",
  combined: "Consumed to make something else",
};

/** Which way each column opens on its first click — the rule the old `SortHeader` calls encoded
 *  per column, kept here since the grid's own click cycle is overridden to match it. */
const LOOT_START_DESC: Record<LootSortKey, boolean> = {
  at: true,
  fate: false,
  qty: true,
  item: false,
  source: false,
  zone: false,
};

/** Phrase the fate's particulars the way the log means them. */
function detailLabel(drop: LootRecord): string {
  switch (drop.fate) {
    case "sold":
      return `for ${drop.detail}`;
    case "stored":
      return `into ${drop.detail}`;
    case "combined":
      return `→ ${drop.detail}`;
    default:
      return drop.detail ?? "";
  }
}

/** Rows-per-page choices for the Drops grid's footer, and which one it opens on — a ledger with no
 *  cap wants bigger pages than the bounded catalogues `dataGridDefaults.ts`'s shared
 *  `PAGE_SIZE_OPTIONS` sizes for, the same reason `FactionPanel`'s `HitTable` keeps its own. */
const DROP_PAGE_SIZES = [25, 50, 100];
const DROP_DEFAULT_PAGE_SIZE = 50;

type DropRow = LootRecord & { id: string };

/** The ledger, as a `DataGrid` (ADR 0230) — sortable and filterable on every column. */
function DropTable({
  drops,
  wanted,
  sort,
  onSort,
}: {
  drops: LootRecord[];
  wanted: ReadonlySet<string>;
  sort: Sort<LootSortKey>;
  onSort: (next: Sort<LootSortKey>) => void;
}) {
  // Keyed by the drop's identity, not `logId-item`. The ledger outlives a run while `logId`
  // restarts at zero each launch, so that pair repeats across runs — two rows claiming one key.
  // `lootKey` is the same identity the feed merges on, so the grid and the merge agree on what one
  // drop is.
  const rows = useMemo<DropRow[]>(() => drops.map((d) => ({ ...d, id: lootKey(d) })), [drops]);

  const columns = useMemo<GridColDef<DropRow>[]>(
    () => [
      {
        field: "at",
        headerName: "Time",
        description: "When the log recorded it",
        flex: 1,
        minWidth: 130,
        renderCell: (p) => <span className="lt-time">{dayTime(p.row.at)}</span>,
      },
      {
        field: "fate",
        headerName: "Fate",
        description: "What became of it",
        flex: 1,
        renderCell: (p) => <span className={`src-kind f-${p.row.fate}`}>{FATE_LABEL[p.row.fate]}</span>,
      },
      {
        field: "qty",
        headerName: "Qty",
        description: "How many the line reported",
        ...NUM_COL,
        flex: 1,
        renderCell: (p) => (p.row.qty > 1 ? `${p.row.qty}×` : ""),
      },
      {
        field: "item",
        headerName: "Item",
        flex: 2,
        minWidth: 160,
        renderCell: (p) => <ItemLink title={p.row.item} className="lt-item" />,
      },
      {
        field: "source",
        headerName: "From",
        description: "Whose corpse",
        flex: 2,
        minWidth: 140,
        cellClassName: "muted",
        // Whose corpse it came off is a mob name like any other — worth a look-up, since "what else
        // does this thing drop" is the next question a ledger raises.
        renderCell: (p) => (p.row.source ? <ItemLink title={p.row.source} /> : ""),
      },
      {
        field: "zone",
        headerName: "Zone",
        description:
          "Where you were standing when it dropped, with how hard the zone was beside it. Sorts by camp, so every difficulty of one zone groups together.",
        flex: 2,
        minWidth: 140,
        // Where it came from, the one way every logged row says it (`ZoneTag`, ADR 0136) — clicking
        // the camp opens its map, like any other place name in the app.
        renderCell: (p) => <ZoneTag zone={p.row.zone} />,
      },
      {
        field: "detail",
        headerName: "Where it went",
        flex: 2,
        minWidth: 140,
        sortable: false,
        cellClassName: "muted",
        valueGetter: (_v, row) => (row.detail ? detailLabel(row) : ""),
      },
    ],
    [],
  );

  // Computed before the early return below: a hook can't be called conditionally.
  const { sortModel, onSortModelChange } = useGridSort(sort, onSort, LOOT_START_DESC);

  if (drops.length === 0) {
    return <Empty title="No drops match these filters." hint="Widen them — the whole ledger is still there." />;
  }

  return (
    <div className="table-scroll grid-fill">
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX_FILL}
        rows={rows}
        columns={columns}
        getRowClassName={(p) => (wanted.has(normalizeItemName(p.row.item)) ? "row-wanted" : "")}
        // Already sorted upstream by `LootPanel` (`sortLoot`, which folds `zone` by place rather
        // than by raw string) — the grid must reflect that order, not re-derive it. See ItemTable
        // for the same shape.
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        pageSizeOptions={DROP_PAGE_SIZES}
        initialState={{ pagination: { paginationModel: { pageSize: DROP_DEFAULT_PAGE_SIZE, page: 0 } } }}
      />
    </div>
  );
}

type PriceRow = ItemPrice & { id: string };

/**
 * What your trash is worth, learned from your own auto-sells. Only what you've actually sold
 * appears — the log never states a price otherwise, and guessing one would be worse than a gap.
 */
function PriceTable({
  prices,
  sort,
  onSort,
}: {
  prices: ItemPrice[];
  sort: Sort<PriceSortKey>;
  onSort: (next: Sort<PriceSortKey>) => void;
}) {
  const rows = useMemo<PriceRow[]>(() => prices.map((p) => ({ ...p, id: p.item })), [prices]);

  const columns = useMemo<GridColDef<PriceRow>[]>(
    () => [
      { field: "item", headerName: "Item", flex: 2, minWidth: 160, renderCell: (p) => <ItemLink title={p.row.item} /> },
      {
        field: "unitCopper",
        headerName: "Each",
        description: "Price for one — a stack's line price divided by the stack",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num",
        renderCell: (p) => formatCoins(p.row.unitCopper),
      },
      {
        field: "qty",
        headerName: "Sold",
        description: "How many you've auto-sold",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num",
      },
      {
        field: "copper",
        headerName: "Earned",
        description: "What they came to in total",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num num-accent",
        renderCell: (p) => <span title={describeCoins(p.row.copper)}>{formatCoins(p.row.copper)}</span>,
      },
      {
        field: "lastAt",
        headerName: "Last sold",
        description: "When you last sold one",
        flex: 1,
        minWidth: 130,
        cellClassName: "lt-time",
        renderCell: (p) => (
          <span title={`${count(p.row.sales, "sale")}, last ${when(p.row.lastAt)}`}>{dayTime(p.row.lastAt)}</span>
        ),
      },
    ],
    [],
  );

  // Computed before the early return below: a hook can't be called conditionally.
  const { sortModel, onSortModelChange } = useGridSort(sort, onSort, (key) => key !== "item");

  if (prices.length === 0) {
    return (
      <Empty
        title="No prices yet."
        hint="A price comes from an auto-sell line — the only place the log ever states one. Sell some trash and it fills in here, item by item."
      />
    );
  }
  const earned = prices.reduce((n, p) => n + p.copper, 0);

  return (
    <>
      <div className="table-scroll grid-fill">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX_FILL}
          rows={rows}
          columns={columns}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }}
        />
      </div>
      <p className="muted small">Auto-sales in the ledger have earned {describeCoins(earned)}.</p>
    </>
  );
}
