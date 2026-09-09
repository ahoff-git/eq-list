"use client";
import { useCallback, useMemo } from "react";
import { useSpellCatalog, useSpellHarvest } from "@/lib/hooks";
import { useSpellQuery } from "@/lib/useSpellQuery";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import FacetPicker from "./FacetPicker";
import SpellCatalogTable from "./SpellCatalogTable";
import SpellCatalogueHarvest from "./SpellCatalogueHarvest";
import { CheckField, Empty, TextField } from "./ui";
import { countOf } from "@/shared/format";
import type { Sort } from "@/shared/sorting";
import { activeCriteria, NO_CRITERIA, type SpellCriteria, type SpellSortKey } from "@/shared/spell-search";

/** How many rows to draw — same cap and the same "narrow it" nudge as the Items tab. */
const MAX_ROWS = 300;

/**
 * The Spells tab: every spell page already cached, asked a question instead of a name.
 *
 * The catalogue is the wiki spell pages you've already looked at, exactly the way the Items tab's
 * catalogue is the item pages you've already looked at — it grows as you browse rather than
 * pretending to be complete. Damage and range come from the wiki's own text and are approximate;
 * see [ADR 0195](../../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md) for
 * why that's an acceptable trade for a browsing tool, unlike the tracker.
 */
export default function SpellSearchPanel() {
  const harvest = useSpellHarvest();
  // Re-read the catalogue when a run ends, not as it goes — same reasoning as `ItemSearchPanel`'s
  // `catalogueKey`: a constant key while running spares the table a re-parse on every progress tick.
  const catalogueKey = harvest.status === "running" ? "running" : `${harvest.status}:${harvest.fetched}`;
  const { rows, loading } = useSpellCatalog(catalogueKey);

  const [criteria, setCriteria] = usePersistentState<SpellCriteria>(STORAGE_KEYS.spellCriteria, NO_CRITERIA);
  const [sort, setSort] = usePersistentState<Sort<SpellSortKey>>(STORAGE_KEYS.spellSort, { key: "name", desc: false });
  const [pace, setPace] = usePersistentState<string>(STORAGE_KEYS.spellHarvestPace, "1000");

  const active = useMemo<SpellCriteria>(() => ({ ...NO_CRITERIA, ...criteria }), [criteria]);
  const set = useCallback((patch: Partial<SpellCriteria>) => setCriteria({ ...active, ...patch }), [active, setCriteria]);

  const { classes, found } = useSpellQuery(rows, active, sort);
  const conditions = activeCriteria(active);
  const shown = useMemo(() => found.slice(0, MAX_ROWS), [found]);

  return (
    <div className="item-search spell-search">
      <SpellCatalogueHarvest progress={harvest} held={rows.length} pace={pace} onPace={setPace} />

      <div className="row wrap item-criteria">
        <TextField
          className="field item-name-box"
          placeholder="Name contains…"
          value={active.text}
          onChange={(text) => set({ text })}
        />
        <FacetPicker
          label="Class"
          any="any class"
          options={classes}
          chosen={active.classes}
          onChange={(next) => set({ classes: next })}
        />
        <CheckField
          label="in era only"
          title="Hide spells the server hasn't opened yet"
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

      <div className="row wrap item-weights-head">
        <span className="muted small">
          {loading ? "Reading the spell cache…" : countOf(found.length, rows.length, "spell")}
        </span>
      </div>

      {!loading && !rows.length && (
        <Empty
          title="Nothing cached yet."
          hint="Open a few spells from the Search tab and they'll appear here — this searches what you've already looked at, so it grows as you use the app."
        />
      )}

      {!loading && rows.length > 0 && !found.length && (
        <Empty
          title="No spell matches all of that."
          hint="Every criterion only ever removes rows — drop one and the list grows back."
        />
      )}

      {shown.length > 0 && <SpellCatalogTable rows={shown} sort={sort} onSort={setSort} />}

      {found.length > shown.length && (
        <div className="muted small item-more">
          Showing the first {MAX_ROWS} of {found.length}. Narrow it and the rest come into view.
        </div>
      )}
    </div>
  );
}
