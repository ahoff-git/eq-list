"use client";
import { useCallback, useMemo, useState } from "react";
import { useClosedZones, useHarvest, useItemCatalog } from "@/lib/hooks";
import { useItemQuery } from "@/lib/useItemQuery";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import CatalogueHarvest from "./CatalogueHarvest";
import ItemFacetRow from "./ItemFacetRow";
import ItemLevelBand from "./ItemLevelBand";
import ItemTable from "./ItemTable";
import ItemWeights from "./ItemWeights";
import StatFloors from "./StatFloors";
import { CheckField, Empty, TextField, caretGlyph } from "./ui";
import { countOf } from "@/shared/format";
import type { Sort } from "@/shared/sorting";
import {
  EFFECT_FACETS,
  NO_CRITERIA,
  PLAIN_FACETS,
  activeCriteria,
  type ItemCriteria,
  type ItemSortKey,
  type StatWeights,
} from "@/shared/item-search";

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
  const harvest = useHarvest();
  /**
   * Re-read the catalogue when a run **ends**, not as it goes.
   *
   * The key is constant while the harvest is running, so eleven thousand progress events don't
   * become eleven thousand re-reads of a growing catalogue — and it changes once when the run stops
   * or finishes, which is the moment there is something new to show.
   */
  const catalogueKey = harvest.status === "running" ? "running" : `${harvest.status}:${harvest.fetched}`;
  const { rows, loading } = useItemCatalog(catalogueKey);

  // Persisted, like the Hunt tab's zone: this is a workbench you come back to. A half-built query
  // thrown away because you glanced at the List tab is the same annoyance in both places.
  const [criteria, setCriteria] = usePersistentState<ItemCriteria>(STORAGE_KEYS.itemCriteria, NO_CRITERIA, {
    key: STORAGE_KEYS.itemCriteriaV1,
    migrate: (stored) => ({ ...NO_CRITERIA, ...(stored as ItemCriteria), hideOutOfEra: true }),
  });
  const [weights, setWeights] = usePersistentState<StatWeights>(STORAGE_KEYS.itemWeights, {});
  const [sort, setSort] = usePersistentState<Sort<ItemSortKey>>(STORAGE_KEYS.itemSort, { key: "name", desc: false });
  const [pace, setPace] = usePersistentState<string>(STORAGE_KEYS.itemHarvestPace, "1000");
  const [weightsOpen, setWeightsOpen] = useState(false);

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
  const { options, counts, found, columns, scored, unplaced } = useItemQuery(rows, active, weights, sort, closedZones);
  const conditions = activeCriteria(active);
  const shown = useMemo(() => found.slice(0, MAX_ROWS), [found]);

  return (
    <div className="item-search">
      <CatalogueHarvest progress={harvest} held={rows.length} pace={pace} onPace={setPace} />

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
          {caretGlyph(weightsOpen)} Value weights{scored.length ? ` (${scored.length})` : ""}
        </button>
        <span className="muted small">
          {loading ? "Reading the item cache…" : countOf(found.length, rows.length, "item")}
        </span>
      </div>
      {weightsOpen && <ItemWeights weights={weights} onChange={setWeights} />}

      {!loading && !rows.length && (
        <Empty
          title="Nothing cached yet."
          hint="Open a few items from the Search tab and they'll appear here — this searches what you've already looked at, so it grows as you use the app."
        />
      )}

      {!loading && rows.length > 0 && !found.length && (
        <Empty
          title="No item matches all of that."
          hint="Every criterion only ever removes rows — drop one and the list grows back."
        />
      )}

      {shown.length > 0 && (
        <ItemTable
          rows={shown}
          columns={columns}
          sort={sort}
          onSort={setSort}
          scored={!!scored.length}
          pickedZones={active.facets.zone}
        />
      )}

      {found.length > shown.length && (
        <div className="muted small item-more">
          Showing the first {MAX_ROWS} of {found.length}. Narrow it and the rest come into view.
        </div>
      )}
    </div>
  );
}
