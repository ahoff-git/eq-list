"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef, type GridSortModel } from "@mui/x-data-grid";
import { useItemPrices, useLootFeed, useShoppingList } from "@/lib/hooks";
import { usePersistentShape, usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { lootKey } from "@/shared/loot-feed";
import {
  DEFAULT_LOOT_FILTERS,
  DEFAULT_LOOT_SORT,
  DEFAULT_PRICE_SORT,
  LOOT_FATES,
  filterLoot,
  isFiltered,
  lootSources,
  lootZones,
  sortLoot,
  sortPrices,
  tallyFates,
  type LootFilters,
  type LootSortKey,
  type PriceSortKey,
} from "@/shared/loot-filters";
import { normalizeItemName } from "@/shared/grouping";
import { describeCoins, formatCoins } from "@/shared/money";
import { nextSort, type Sort } from "@/shared/sorting";
import ItemLink from "./ItemLink";
import ZoneTag from "./ZoneTag";
import { GRID_DEFAULTS, GRID_SX, NUM_COL } from "./dataGridDefaults";
import type { ItemPrice, LootFate, LootRecord } from "@/shared/types";

import { clock, count, countOf, when } from "@/shared/format";
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
 * distinction: `LootFilterBar` reaches the whole fetched ledger (`SEARCH_FETCH`/`DEFAULT_FETCH`
 * below), and a grid column filter only ever narrows what's already on screen.
 */
const FATE_LABEL: Record<LootFate, string> = {
  kept: "kept",
  sold: "sold",
  stored: "stored",
  combined: "combined",
};

type View = "drops" | "prices";

/** Fetched by default — enough for a typical evening without pulling the ledger over IPC on every mount. */
const DEFAULT_FETCH = 200;

/**
 * Fetched once a filter is actively narrowing things, so a search reaches the whole ledger
 * (`MAX_LOOT`, electron/loot-log.ts) rather than silently answering "not found" for anything
 * older than whatever the default fetch happened to hold.
 */
const SEARCH_FETCH = 20_000;

/**
 * How many matching rows `DropTable` draws. It has no virtualization, so a filter that matches
 * more than this says so instead of handing it thousands of rows — the same cap `ItemSearchPanel`
 * and `SpellSearchPanel` use over their own catalogues.
 */
const MAX_ROWS = 300;

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

  const drops = useLootFeed(isFiltered(filters) ? SEARCH_FETCH : DEFAULT_FETCH);
  const list = useShoppingList();
  // Only a sale can change a price, and the newest drop is the cheapest signal that one landed.
  // Keyed by the drop's whole identity rather than its `logId`: that counter restarts at zero
  // every launch, so on its own it can repeat the value it already held and the refetch is skipped.
  const prices = useItemPrices(drops[0] ? lootKey(drops[0]) : "");

  // Names on the shopping list, normalized the same way the store matches them.
  const wanted = useMemo(
    () => new Set(list.entries.map((e) => normalizeItemName(e.name))),
    [list.entries],
  );

  const matches = useMemo(
    () => sortLoot(filterLoot(drops, filters, wanted), lootSort),
    [drops, filters, wanted, lootSort],
  );
  // Capped for the table the way ItemSearchPanel/SpellSearchPanel cap theirs — see MAX_ROWS.
  const shown = useMemo(() => matches.slice(0, MAX_ROWS), [matches]);
  // Tallied over every match, not just the rows drawn, so a truncated table doesn't under-count.
  const totals = useMemo(() => tallyFates(matches), [matches]);
  const sources = useMemo(() => lootSources(drops), [drops]);
  // The camps the ledger covers, folded — see `lootZones`. From the whole ledger rather than the
  // filtered rows, so choosing a zone can't remove the option you'd need to choose a different one.
  const zones = useMemo(() => lootZones(drops), [drops]);
  const sortedPrices = useMemo(() => sortPrices(prices, priceSort), [prices, priceSort]);

  if (drops.length === 0) {
    return (
      <Empty
        title="Nothing has dropped yet."
        hint="Loot lines appear here as they happen — what dropped, from what, and where it went. The list is kept, so it will still be here next time you open the app."
      />
    );
  }

  return (
    <div>
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
            <span
              className="muted small"
              title={isFiltered(filters) ? "Drops matching the filters, of the whole ledger" : "Drops shown, of what's loaded"}
            >
              {countOf(matches.length, drops.length, "drop")}
            </span>
            {LOOT_FATES.filter((fate) => totals[fate] > 0).map((fate) => (
              <span key={fate} className={`fate-tally f-${fate}`}>
                {totals[fate]} {FATE_LABEL[fate]}
              </span>
            ))}
          </>
        )}
      </div>

      {view === "drops" ? (
        <>
          <LootFilterBar filters={filters} onFilters={setFilters} sources={sources} zones={zones} />
          <DropTable drops={shown} wanted={wanted} sort={lootSort} onSort={setLootSort} />
          {matches.length > shown.length && (
            <p className="muted small">
              Showing the first {MAX_ROWS} of {matches.length} matching drops. Narrow the filters and the rest come
              into view.
            </p>
          )}
        </>
      ) : (
        <PriceTable prices={sortedPrices} sort={priceSort} onSort={setPriceSort} />
      )}
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
        renderCell: (p) => <span className="lt-time">{clock(p.row.at)}</span>,
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

  if (drops.length === 0) {
    return <Empty title="No drops match these filters." hint="Widen them — the whole ledger is still there." />;
  }

  const sortModel: GridSortModel = [{ field: sort.key, sort: sort.desc ? "desc" : "asc" }];

  return (
    <div className="table-scroll">
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        rows={rows}
        columns={columns}
        getRowClassName={(p) => (wanted.has(normalizeItemName(p.row.item)) ? "row-wanted" : "")}
        // Already sorted (and truncated to `MAX_ROWS`) upstream by `LootPanel`, before the cut — the
        // grid must reflect that order, not re-derive it. See ItemTable for the same shape.
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={(model) => {
          const key = (model[0]?.field ?? sort.key) as LootSortKey;
          onSort(nextSort(sort, key, LOOT_START_DESC[key]));
        }}
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
        cellClassName: "lt-time",
        renderCell: (p) => (
          <span title={`${count(p.row.sales, "sale")}, last ${when(p.row.lastAt)}`}>{clock(p.row.lastAt)}</span>
        ),
      },
    ],
    [],
  );

  if (prices.length === 0) {
    return (
      <Empty
        title="No prices yet."
        hint="A price comes from an auto-sell line — the only place the log ever states one. Sell some trash and it fills in here, item by item."
      />
    );
  }
  const earned = prices.reduce((n, p) => n + p.copper, 0);
  const sortModel: GridSortModel = [{ field: sort.key, sort: sort.desc ? "desc" : "asc" }];

  return (
    <>
      <div className="table-scroll">
        <DataGrid
          {...GRID_DEFAULTS}
          sx={GRID_SX}
          rows={rows}
          columns={columns}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) => {
            const key = (model[0]?.field ?? sort.key) as PriceSortKey;
            onSort(nextSort(sort, key, key !== "item"));
          }}
        />
      </div>
      <p className="muted small">Auto-sales in the ledger have earned {describeCoins(earned)}.</p>
    </>
  );
}
