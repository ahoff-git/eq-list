"use client";
import { useMemo } from "react";
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
import type { Sort } from "@/shared/sorting";
import ItemLink from "./ItemLink";
import SortHeader from "./SortHeader";
import ZoneTag from "./ZoneTag";
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
 */
const FATE_LABEL: Record<LootFate, string> = {
  kept: "kept",
  sold: "sold",
  stored: "stored",
  combined: "combined",
};

type View = "drops" | "prices";

export default function LootPanel() {
  const drops = useLootFeed(200);
  const list = useShoppingList();
  // Only a sale can change a price, and the newest drop is the cheapest signal that one landed.
  // Keyed by the drop's whole identity rather than its `logId`: that counter restarts at zero
  // every launch, so on its own it can repeat the value it already held and the refetch is skipped.
  const prices = useItemPrices(drops[0] ? lootKey(drops[0]) : "");

  // All four persist: this is a panel you set up the way you read it, and every one of them was
  // resetting the moment you looked at another tab.
  const [view, setView] = usePersistentState<View>(STORAGE_KEYS.lootView, "drops");
  const [filters, setFilters] = usePersistentShape<LootFilters>(STORAGE_KEYS.lootFilters, DEFAULT_LOOT_FILTERS);
  const [lootSort, setLootSort] = usePersistentState<Sort<LootSortKey>>(STORAGE_KEYS.lootSort, DEFAULT_LOOT_SORT);
  const [priceSort, setPriceSort] = usePersistentState<Sort<PriceSortKey>>(
    STORAGE_KEYS.lootPriceSort,
    DEFAULT_PRICE_SORT,
  );

  // Names on the shopping list, normalized the same way the store matches them.
  const wanted = useMemo(
    () => new Set(list.entries.map((e) => normalizeItemName(e.name))),
    [list.entries],
  );

  const shown = useMemo(
    () => sortLoot(filterLoot(drops, filters, wanted), lootSort),
    [drops, filters, wanted, lootSort],
  );
  // Tallied over what's on screen, so the numbers describe what you're actually looking at.
  const totals = useMemo(() => tallyFates(shown), [shown]);
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
            <span className="muted small" title="Drops shown, of the whole ledger">
              {countOf(shown.length, drops.length, "drop")}
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

/** The ledger as a table, so the columns line up and any of them can do the sorting. */
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
  if (drops.length === 0) {
    return <Empty title="No drops match these filters." hint="Widen them — the whole ledger is still there." />;
  }

  return (
    <div className="table-scroll">
      <table className="stat-table loot-table">
        <thead>
          <tr>
            <SortHeader label="Time" column="at" sort={sort} onSort={onSort} title="When the log recorded it" />
            <SortHeader label="Fate" column="fate" sort={sort} onSort={onSort} startDesc={false} title="What became of it" />
            <SortHeader label="Qty" column="qty" sort={sort} onSort={onSort} title="How many the line reported" />
            <SortHeader label="Item" column="item" sort={sort} onSort={onSort} startDesc={false} />
            <SortHeader label="From" column="source" sort={sort} onSort={onSort} startDesc={false} title="Whose corpse" />
            <SortHeader
              label="Zone"
              column="zone"
              sort={sort}
              onSort={onSort}
              startDesc={false}
              title="Where you were standing when it dropped, with how hard the zone was beside it. Sorts by camp, so every difficulty of one zone groups together."
            />
            <th>Where it went</th>
          </tr>
        </thead>
        <tbody>
          {/* Keyed by the drop's identity, not `logId-item`. The ledger outlives a run while `logId`
              restarts at zero each launch, so that pair repeats across runs — two rows claiming one
              key, which React resolves by reusing the wrong node (and warns about). `lootKey` is the
              same identity the feed merges on, so the list and the merge agree on what one drop is. */}
          {drops.map((drop) => {
            const onList = wanted.has(normalizeItemName(drop.item));
            return (
              <tr
                key={lootKey(drop)}
                className={onList ? "wanted" : undefined}
                title={onList ? "On your shopping list" : undefined}
              >
                <td className="lt-time">{clock(drop.at)}</td>
                <td className={`src-kind f-${drop.fate}`}>{FATE_LABEL[drop.fate]}</td>
                <td className="lt-num">{drop.qty > 1 ? `${drop.qty}×` : ""}</td>
                <td>
                  <ItemLink title={drop.item} className="lt-item" />
                </td>
                {/* Whose corpse it came off is a mob name like any other — worth a look-up, since
                    "what else does this thing drop" is the next question a ledger raises. */}
                <td className="muted">{drop.source ? <ItemLink title={drop.source} /> : ""}</td>
                {/* Where it came from, the one way every logged row says it (`ZoneTag`, ADR 0136) —
                    clicking the camp opens its map, like any other place name in the app. */}
                <td className="lt-zone">
                  <ZoneTag zone={drop.zone} />
                </td>
                <td className="muted">{drop.detail ? detailLabel(drop) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
      <div className="table-scroll">
        <table className="stat-table loot-table">
          <thead>
            <tr>
              <SortHeader label="Item" column="item" sort={sort} onSort={onSort} startDesc={false} />
              <SortHeader
                label="Each"
                column="unitCopper"
                sort={sort}
                onSort={onSort}
                title="Price for one — a stack's line price divided by the stack"
              />
              <SortHeader label="Sold" column="qty" sort={sort} onSort={onSort} title="How many you've auto-sold" />
              <SortHeader label="Earned" column="copper" sort={sort} onSort={onSort} title="What they came to in total" />
              <SortHeader label="Last sold" column="lastAt" sort={sort} onSort={onSort} title="When you last sold one" />
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.item} title={`${count(p.sales, "sale")}, last ${when(p.lastAt)}`}>
                <td>
                  <ItemLink title={p.item} />
                </td>
                <td className="lt-num">{formatCoins(p.unitCopper)}</td>
                <td className="lt-num">{p.qty}</td>
                <td className="lt-num num-accent" title={describeCoins(p.copper)}>
                  {formatCoins(p.copper)}
                </td>
                <td className="lt-time">{clock(p.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Auto-sales in the ledger have earned {describeCoins(earned)}.</p>
    </>
  );
}

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
