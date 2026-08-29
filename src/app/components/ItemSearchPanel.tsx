"use client";
import { useMemo, useState } from "react";
import { useHarvest, useItemCatalog } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { addByTitle } from "@/lib/addToList";
import ItemLink from "./ItemLink";
import CatalogueHarvest from "./CatalogueHarvest";
import FacetPicker from "./FacetPicker";
import ItemWeights from "./ItemWeights";
import SortHeader from "./SortHeader";
import { AddButton, CheckField, Empty, PickField, TextField, caretGlyph } from "./ui";
import { countOf } from "@/shared/format";
import { sourceKindLabel } from "@/shared/sources";
import type { Sort } from "@/shared/sorting";
import { STATS, statLine, statMeta, type StatKey } from "@/shared/item-stats";
import {
  FACETS,
  NO_CRITERIA,
  activeCriteria,
  facetOptions,
  searchItems,
  weightedStats,
  type ItemCriteria,
  type ItemSortKey,
  type StatWeights,
  type ValuedItem,
} from "@/shared/item-search";

/** How many rows to draw. The catalogue is a few hundred today and a filter is one keystroke away. */
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
 */
export default function ItemSearchPanel() {
  const harvest = useHarvest();
  /**
   * Re-read the catalogue when a run **ends**, not as it goes.
   *
   * The key is constant while the harvest is running, so eleven thousand progress events don't
   * become eleven thousand re-reads of a growing directory — and it changes once when the run stops
   * or finishes, which is the moment there is something new to show.
   */
  const catalogueKey = harvest.status === "running" ? "running" : `${harvest.status}:${harvest.fetched}`;
  const { rows, loading } = useItemCatalog(catalogueKey);

  // Persisted, like the Hunt tab's zone: this is a workbench you come back to. A half-built query
  // thrown away because you glanced at the List tab is the same annoyance in both places.
  const [criteria, setCriteria] = usePersistentState<ItemCriteria>(STORAGE_KEYS.itemCriteria, NO_CRITERIA);
  const [weights, setWeights] = usePersistentState<StatWeights>(STORAGE_KEYS.itemWeights, {});
  const [sort, setSort] = usePersistentState<Sort<ItemSortKey>>(STORAGE_KEYS.itemSort, { key: "name", desc: false });
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [pace, setPace] = usePersistentState<string>(STORAGE_KEYS.itemHarvestPace, "1000");

  // A criteria object stored last week can be missing a facet added since; folding it over the empty
  // shape keeps a new facet from arriving as `undefined` in the middle of a filter.
  //
  // Memoized because it is the search's input: rebuilt each render, it would re-run the filter over
  // the whole catalogue every time anything on the panel moved, including opening the weight sheet.
  const active = useMemo<ItemCriteria>(
    () => ({ ...NO_CRITERIA, ...criteria, facets: { ...NO_CRITERIA.facets, ...criteria.facets } }),
    [criteria],
  );
  const set = (patch: Partial<ItemCriteria>) => setCriteria({ ...active, ...patch });
  const setFacet = (key: string, values: string[]) => set({ facets: { ...active.facets, [key]: values } });

  const options = useMemo(
    () => Object.fromEntries(FACETS.map((f) => [f.key, facetOptions(rows, f.key)])),
    [rows],
  ) as Record<string, string[]>;

  const found = useMemo(() => searchItems(rows, active, weights, sort), [rows, active, weights, sort]);

  // The stats worth a column: the ones you're weighting by, plus the ones you've set a floor on.
  // In `STATS` order rather than the order they were added, so the table reads like a card.
  const columns = useMemo(() => {
    const wanted = new Set<StatKey>([...weightedStats(weights), ...(Object.keys(active.mins) as StatKey[])]);
    return STATS.filter((s) => wanted.has(s.key)).map((s) => s.key);
  }, [weights, active.mins]);

  const onSort = (next: Sort<ItemSortKey>) => setSort(next);
  const shown = found.slice(0, MAX_ROWS);

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
        {FACETS.map((facet) => (
          <FacetPicker
            key={facet.key}
            label={facet.label}
            any={facet.any}
            options={options[facet.key] ?? []}
            chosen={active.facets[facet.key]}
            onChange={(values) => setFacet(facet.key, values)}
          />
        ))}
        {/* The era toggle is this panel's own rather than the Search tab's setting. They answer
            different questions: that one is about a results list you're reading now, this one is a
            criterion like the rest, and it has to be in the count that says how many are cutting. */}
        <CheckField
          label="in era only"
          title="Hide items the server hasn't opened yet"
          checked={active.hideOutOfEra}
          onChange={(hideOutOfEra) => set({ hideOutOfEra })}
        />
        <span className="spacer" />
        {activeCriteria(active) > 0 && (
          <button className="btn sm" onClick={() => setCriteria(NO_CRITERIA)} title="Drop every criterion">
            Clear ({activeCriteria(active)})
          </button>
        )}
      </div>

      <StatFloors mins={active.mins} onChange={(mins) => set({ mins })} />

      <div className="row wrap item-weights-head">
        <button className="btn sm" onClick={() => setWeightsOpen((o) => !o)} aria-expanded={weightsOpen}>
          {caretGlyph(weightsOpen)} Value weights
          {weightedStats(weights).length ? ` (${weightedStats(weights).length})` : ""}
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
        <Empty title="No item matches all of that." hint="Every criterion only ever removes rows — drop one and the list grows back." />
      )}

      {shown.length > 0 && (
        <table className="stat-table item-table">
          <thead>
            <tr>
              <SortHeader label="Item" column="name" sort={sort} onSort={onSort} startDesc={false} />
              <SortHeader label="Slot" column="slot" sort={sort} onSort={onSort} startDesc={false} title="Where it's worn" />
              <SortHeader label="From" column="source" sort={sort} onSort={onSort} startDesc={false} title="Kill it, buy it, quest it or craft it" />
              <SortHeader label="Zone" column="zone" sort={sort} onSort={onSort} startDesc={false} title="Where its sources are" />
              {columns.map((key) => (
                <SortHeader key={key} label={statMeta(key).label} column={key} sort={sort} onSort={onSort} className="num" title={`Sort by ${statMeta(key).label}`} />
              ))}
              {!columns.length && <th>Stats</th>}
              <SortHeader
                label="Value"
                column="value"
                sort={sort}
                onSort={onSort}
                className="num"
                title={weightedStats(weights).length ? "Your weights, applied" : "Set some weights and this becomes the ranking"}
              />
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <ItemRowView key={`${row.item.origin}:${row.item.title}`} row={row} columns={columns} scored={!!weightedStats(weights).length} />
            ))}
          </tbody>
        </table>
      )}

      {found.length > shown.length && (
        <div className="muted small item-more">
          Showing the first {MAX_ROWS} of {found.length}. Narrow it and the rest come into view.
        </div>
      )}
    </div>
  );
}

/** One result. Split out because it holds nothing — the table just got long enough to read badly. */
function ItemRowView({ row, columns, scored }: { row: ValuedItem; columns: StatKey[]; scored: boolean }) {
  const zones = row.zones;
  return (
    <tr className={row.item.outOfEra ? "out-of-era" : undefined}>
      <td>
        <ItemLink title={row.item.title} />
        {/* Lucy describes a different game, so a row sourced from it never passes as the wiki's. */}
        {row.item.origin === "lucy" && (
          <span className="chip lucy-chip" title="From Lucy — Live EverQuest's database, not this game's">
            Lucy
          </span>
        )}
      </td>
      <td className="muted">{row.stats.slots.join(" ") || "—"}</td>
      <td>
        {row.kinds.length
          ? row.kinds.map((kind) => (
              <span key={kind} className={`src-kind k-${kind}`}>
                {sourceKindLabel(kind)}
              </span>
            ))
          : "—"}
      </td>
      <td className="muted" title={zones.join(", ")}>
        {zones.length > 1 ? `${zones[0]} +${zones.length - 1}` : (zones[0] ?? "—")}
      </td>
      {columns.map((key) => (
        <td key={key} className={`num ${row.stats.stats[key] !== undefined ? "num-accent" : "muted"}`}>
          {row.stats.stats[key] ?? "—"}
        </td>
      ))}
      {!columns.length && <td className="muted small">{statLine(row.stats) || "—"}</td>}
      <td className={`num ${scored && row.value ? "num-accent" : "muted"}`}>{scored ? row.value : "—"}</td>
      <td className="item-add">
        <AddButton
          onAdd={() => void addByTitle(row.item.title, row.item.wikiPath)}
          title="Put it on the shopping list"
          className="btn sm"
        >
          + Add
        </AddButton>
      </td>
    </tr>
  );
}

/**
 * The stat floors: "at least this much INT".
 *
 * A floor and a weight are different questions and get different controls. A weight says *how much I
 * care*; a floor says *don't show me this at all*. Conflating them — "sort by INT and read down" —
 * is what makes you scroll past forty items to find the six that clear the bar.
 *
 * An item whose card never mentions the stat fails the floor, which is `matchesItem`'s decision and
 * worth knowing about here: silence is not a zero that might squeak through.
 */
function StatFloors({
  mins,
  onChange,
}: {
  mins: Partial<Record<StatKey, number>>;
  onChange: (mins: Partial<Record<StatKey, number>>) => void;
}) {
  const chosen = Object.keys(mins) as StatKey[];
  const spare = STATS.filter((s) => mins[s.key] === undefined);

  const add = () => {
    if (!spare.length) return;
    onChange({ ...mins, [spare[0].key]: 1 });
  };
  const drop = (key: StatKey) => {
    const next = { ...mins };
    delete next[key];
    onChange(next);
  };
  const retarget = (from: StatKey, to: string) => {
    if (!to || to === from) return;
    const next = { ...mins };
    next[to as StatKey] = next[from] ?? 1;
    delete next[from];
    onChange(next);
  };

  return (
    <div className="row wrap stat-floors">
      {chosen.map((key) => (
        <span className="floor" key={key}>
          <PickField
            value={key}
            blank={statMeta(key).label}
            blankValue={key}
            options={spare.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(to) => retarget(key, to)}
            title="Which stat this floor is about"
          />
          <span className="muted">≥</span>
          <input
            className="field sm"
            type="number"
            step="any"
            value={mins[key] ?? 0}
            onChange={(e) => onChange({ ...mins, [key]: Number(e.target.value) })}
          />
          <button className="btn sm" onClick={() => drop(key)} title={`Stop requiring ${statMeta(key).label}`}>
            ✕
          </button>
        </span>
      ))}
      {spare.length > 0 && (
        <button className="btn sm" onClick={add} title="Require a minimum of some stat">
          + Stat floor
        </button>
      )}
    </div>
  );
}
