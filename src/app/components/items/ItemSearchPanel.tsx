"use client";
import { useCallback, useMemo } from "react";
import { useClosedZones, useCurrentItemCatalog } from "@/lib/hooks";
import { useItemQuery } from "@/lib/items/useItemQuery";
import { useHeldGrades, useOwnedItems } from "@/lib/exports/useGameExports";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import CatalogueHarvest from "@/app/components/items/CatalogueHarvest";
import ItemFacetRow from "@/app/components/items/ItemFacetRow";
import ItemLevelBand, { MAX_PLAYER_LEVEL } from "@/app/components/items/ItemLevelBand";
import ItemTable from "@/app/components/items/ItemTable";
import ItemWeights from "@/app/components/items/ItemWeights";
import BisView from "@/app/components/items/BisView";
import ItemPresets from "@/app/components/items/ItemPresets";
import StatFloors from "@/app/components/items/StatFloors";
import { CheckField, Empty, TextField, caretGlyph, segCls } from "@/app/components/ui";
import { count, countOf } from "@/shared/format";
import { exportAgeText } from "@/shared/game-exports";
import { ownedText } from "@/shared/game-export-dumps";
import { gradedItemStats } from "@/shared/items/item-upgrade";
import { normalizeItemName } from "@/shared/items/grouping";
import { derivedRates, foldDerivedWeights } from "@/shared/items/derived-stats";
import { normalizeBisOptions, type BisOptions } from "@/shared/items/bis-options";
import { normalizePreset, type ItemPreset } from "@/shared/items/item-presets";
import type { Sort } from "@/shared/sorting";
import {
  EFFECT_FACETS,
  NO_CRITERIA,
  PLAIN_FACETS,
  activeCriteria,
  weightedStats,
  type ItemCriteria,
  type ItemSortKey,
  type StatWeights,
} from "@/shared/items/item-search";

/** How many rows to draw. Sorted, so these are the best ones — and a filter is one keystroke away. */
const MAX_ROWS = 300;

/**
 * The Items tab: everything we hold, asked a question instead of a name.
 *
 * The Search tab answers "where is the page for X". This answers the question you actually spend the
 * evening on — *what is the best thing I could put on my fingers* — which no name lookup can, because
 * you don't know the name yet. It is a filter over every item page already cached
 * ([wiki-data](../../../specs/wiki-data/README.md), [lucy-data](../../../specs/lucy-data/README.md)),
 * ordered by a yardstick you set
 * ([ADR 0152](../../../specs/decisions/0152-an-item-search-is-a-filter-with-your-own-yardstick.md)).
 *
 * Three things it deliberately does:
 *
 * - **Only ever cuts.** Every criterion removes rows; nothing here helpfully adds near-misses back.
 *   So the count under the criteria is a number you can trust to fall as you add conditions, which
 *   is what makes it possible to work out *why* something you expected isn't there.
 * - **Scores by your weights, not ours.** See `ItemWeights`. With none set the Value column is 0 for
 *   everything and says so, rather than inventing a ranking.
 * - **Shows only the columns you asked about.** A stat earns a column by being weighted or by having
 *   a floor set — twenty-one stat columns would be unreadable, and the ones you're thinking about
 *   are exactly the ones you've just typed a number into. With none of either, the card's own
 *   numbers are shown as a line instead, so the table always has something to read.
 *
 * The catalogue is **what you have already looked at**. Nothing here fetches: the wiki has no way to
 * be asked for "every item with its stats" ([ADR 0003](../../../specs/decisions/0003-eqlwiki-runtime-data-source.md)),
 * so the honest corpus is the cache, and the footer says how big it is rather than implying it's
 * every item in the game.
 *
 * This file is the tab's **state and layout only**. The computation is
 * [useItemQuery](../../lib/useItemQuery.ts) and each band of controls is its own component, because
 * the two kinds of change — "what does this ask?" and "how is it arranged?" — arrive separately and
 * were previously in the same four hundred lines.
 */
export default function ItemSearchPanel() {
  // Re-read when a harvest run ends, not as it goes — see `useCurrentItemCatalog`.
  const { rows, loading, harvest } = useCurrentItemCatalog();

  // Persisted, like the Hunt tab's zone: this is a workbench you come back to. A half-built query
  // thrown away because you glanced at the List tab is the same annoyance in both places.
  const [criteria, setCriteria] = usePersistentState<ItemCriteria>(STORAGE_KEYS.itemCriteria, NO_CRITERIA, {
    key: STORAGE_KEYS.itemCriteriaV1,
    migrate: (stored) => ({ ...NO_CRITERIA, ...(stored as ItemCriteria), hideOutOfEra: true }),
  });
  const [weights, setWeights] = usePersistentState<StatWeights>(STORAGE_KEYS.itemWeights, {});
  const [sort, setSort] = usePersistentState<Sort<ItemSortKey>>(STORAGE_KEYS.itemSort, { key: "name", desc: false });
  const [pace, setPace] = usePersistentState<string>(STORAGE_KEYS.itemHarvestPace, "1000");
  const [weightsOpen, setWeightsOpen] = usePersistentState(STORAGE_KEYS.itemWeightsOpen, false);
  // The same criteria and weights answer two questions: "which items are like this" (Search) and
  // "what should I be wearing, and what next" (the loadout builder, `BisView`).
  const [mode, setMode] = usePersistentState<"search" | "bis">(STORAGE_KEYS.itemMode, "search");
  // What you've told the loadout builder. Held here rather than in `BisView` so a preset can carry it.
  const [storedBis, setBisOptions] = usePersistentState<BisOptions>(STORAGE_KEYS.itemBisOptions, normalizeBisOptions(undefined));
  const bisOptions = useMemo(() => normalizeBisOptions(storedBis), [storedBis]);
  const [presets, setPresets] = usePersistentState<ItemPreset[]>(STORAGE_KEYS.itemPresets, []);
  const applyPreset = useCallback(
    (stored: ItemPreset) => {
      const p = normalizePreset(stored);
      setCriteria(p.criteria);
      setWeights(p.weights);
      setBisOptions(p.bis);
    },
    [setCriteria, setWeights, setBisOptions],
  );

  /**
   * A criteria object stored last week can be missing a facet added since; folding it over the empty
   * shape keeps a new facet from arriving as `undefined` in the middle of a filter.
   *
   * Memoized because it is the query's input: rebuilt each render, every derived value in
   * `useItemQuery` would recompute whenever anything on the panel moved, the weight sheet included.
   */
  const active = useMemo<ItemCriteria>(
    () => ({ ...NO_CRITERIA, ...criteria, facets: { ...NO_CRITERIA.facets, ...criteria.facets } }),
    [criteria],
  );
  const set = useCallback((patch: Partial<ItemCriteria>) => setCriteria({ ...active, ...patch }), [active, setCriteria]);
  const setFacet = useCallback(
    (key: string, values: string[]) => set({ facets: { ...active.facets, [key]: values } }),
    [active.facets, set],
  );

  // Which of the eras this server *has* are actually open — the live half of the era judgement, and
  // the only half a window can't work out for itself (`item-era.ts`).
  const closedZones = useClosedZones();

  /**
   * **What you own** narrows the *catalogue*, not the query — the same way the era toggle does (see
   * `useItemQuery`'s `corpus`). Every picker then counts within your inventory, so "Fingers · 3" means
   * three rings you hold. Exaltations count for their base item, and the Where column says where each
   * is socketed.
   */
  const { owned, at: ownedAt } = useOwnedItems();
  const [ownedOnly, setOwnedOnly] = usePersistentState(STORAGE_KEYS.itemOwnedOnly, false);
  const narrowToOwned = ownedOnly && !!owned;
  // A thing you hold graded is searched, scored and shown as *your* copy — a `+9` talisman at +9, not
  // at the catalogue's +0 (ADR 0312). Best-in-slot gets the plain rows: it grades each copy itself.
  const held = useHeldGrades();
  const yours = useMemo(
    () =>
      held.size
        ? rows.map((r) => {
            const grade = held.get(normalizeItemName(r.item.title));
            return grade ? { ...r, grade, stats: gradedItemStats(r.stats, grade) } : r;
          })
        : rows,
    [held, rows],
  );
  const searched = useMemo(
    () => (narrowToOwned && owned ? yours.filter((r) => owned.has(normalizeItemName(r.item.title))) : yours),
    [narrowToOwned, owned, yours],
  );
  // Owned things the catalogue has no page for can't be searched by stat; say how many, not nothing.
  const uncatalogued = useMemo(() => {
    if (!narrowToOwned || !owned) return 0;
    const known = new Set(rows.map((r) => normalizeItemName(r.item.title)));
    return [...owned.keys()].filter((k) => !known.has(k)).length;
  }, [narrowToOwned, owned, rows]);
  const where = useCallback(
    (title: string) => {
      const places = owned?.get(normalizeItemName(title));
      return places ? ownedText(places) : undefined;
    },
    [owned],
  );

  /**
   * The sheet both Search and the loadout builder score by: yours, with HP, mana and AC folded into the stats
   * that make them, for the ticked classes at the level cap (`derived-stats.ts`). Folded once here so
   * the two modes can't weigh an INT point differently.
   */
  const rates = useMemo(
    () => derivedRates({ classes: active.facets.class, level: active.levelMax ?? MAX_PLAYER_LEVEL }),
    [active.facets.class, active.levelMax],
  );
  const scoring = useMemo(() => foldDerivedWeights(weights, rates), [weights, rates]);
  const yourWeights = weightedStats(weights);

  const { options, counts, found, columns, scored, unplaced } = useItemQuery(searched, active, scoring, sort, closedZones, owned ? where : undefined);
  const conditions = activeCriteria(active);
  const shown = useMemo(() => found.slice(0, MAX_ROWS), [found]);

  return (
    <div className="item-search">
      <CatalogueHarvest progress={harvest} held={rows.length} pace={pace} onPace={setPace} />

      <ItemPresets presets={presets} onPresets={setPresets} current={{ criteria: active, weights, bis: bisOptions }} onApply={applyPreset} />

      <div className="segmented item-mode">
        <button className={segCls(mode === "search")} onClick={() => setMode("search")}>Search</button>
        <button
          className={segCls(mode === "bis")}
          onClick={() => setMode("bis")}
          title="Plan your gear: the best loadout from what you hold and what you could hunt, by your value weights"
        >
          Loadout builder
        </button>
      </div>

      <div className="row wrap item-criteria">
        <TextField
          className="field item-name-box"
          placeholder="Name contains…"
          value={active.text}
          onChange={(text) => set({ text })}
        />
        <ItemFacetRow facets={PLAIN_FACETS} options={options} counts={counts} criteria={active} onChange={setFacet} />
        {/* This panel's own toggle rather than the Search tab's setting. They answer different
            questions: that one is about a results list you're reading now; this one says which game
            you are playing, and so takes its values out of the pickers as well as out of the rows. */}
        <CheckField
          label="in era only"
          title="Hide items the server hasn't opened yet — judged zone by zone, so a zone it hasn't opened leaves the Zone picker too, along with everything only found there"
          checked={active.hideOutOfEra}
          onChange={(hideOutOfEra) => set({ hideOutOfEra })}
        />
        {owned && (
          <CheckField
            label="what I own"
            title={`Only items in your newest /outputfile inventory dump${ownedAt ? `, written ${exportAgeText(Date.now() - ownedAt)}` : ""} — bags, bank, depot, hoard, Storage, and exaltations wherever they're socketed`}
            checked={ownedOnly}
            onChange={setOwnedOnly}
          />
        )}
        <span className="spacer" />
        {conditions > 0 && (
          <button className="btn sm" onClick={() => setCriteria(NO_CRITERIA)} title="Drop every criterion">
            Clear ({conditions})
          </button>
        )}
      </div>

      {/* Their own row, because they are a different question from "what is it and where's it from",
          and because four more dropdowns in the row above would have made ten. Each picker's filter
          box is fuzzy, which is what makes these usable: the same effect is spelled a dozen ways
          across the catalogue, so "haste" has to reach `Hastening of Salik` too. */}
      <div className="row wrap effect-facets">
        <span className="muted small">Effects</span>
        <ItemFacetRow facets={EFFECT_FACETS} options={options} counts={counts} criteria={active} onChange={setFacet} />
        <span className="muted small">type to search — spelling need not be exact</span>
      </div>

      <ItemLevelBand criteria={active} unplaced={unplaced} onChange={set} />

      <StatFloors mins={active.mins} onChange={(mins) => set({ mins })} />

      <div className="row wrap item-weights-head">
        <button className="btn sm" onClick={() => setWeightsOpen((open) => !open)} aria-expanded={weightsOpen}>
          {caretGlyph(weightsOpen)} Value weights{yourWeights.length ? ` (${yourWeights.length})` : ""}
        </button>
        <span className="muted small">
          {loading ? "Reading the item cache…" : countOf(found.length, searched.length, "item")}
          {uncatalogued > 0 && ` · ${count(uncatalogued, "thing")} you own has no item page here yet`}
        </span>
      </div>
      {weightsOpen && (
        <ItemWeights
          weights={weights}
          rates={rates}
          level={active.levelMax ?? MAX_PLAYER_LEVEL}
          classesTicked={active.facets.class.length > 0}
          onChange={setWeights}
        />
      )}

      {mode === "bis" && (
        <BisView
          rows={rows}
          criteria={active}
          weights={scoring}
          closedZones={closedZones}
          scored={!!scored.length}
          options={bisOptions}
          onOptions={setBisOptions}
          onClearName={() => set({ text: "" })}
          rates={rates}
        />
      )}

      {mode === "search" && !loading && !rows.length && (
        <Empty
          title="Nothing cached yet."
          hint="Open a few items from the Search tab and they'll appear here — this searches what you've already looked at, so it grows as you use the app."
        />
      )}

      {mode === "search" && !loading && rows.length > 0 && !found.length && (
        <Empty
          title="No item matches all of that."
          hint="Every criterion only ever removes rows — drop one and the list grows back."
        />
      )}

      {mode === "search" && shown.length > 0 && (
        <ItemTable
          rows={shown}
          columns={columns}
          sort={sort}
          onSort={setSort}
          scored={!!scored.length}
          pickedZones={active.facets.zone}
          where={owned ? where : undefined}
        />
      )}

      {mode === "search" && found.length > shown.length && (
        <div className="muted small item-more">
          Showing the first {MAX_ROWS} of {found.length}. Narrow it and the rest come into view.
        </div>
      )}
    </div>
  );
}
