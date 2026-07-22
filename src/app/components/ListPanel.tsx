"use client";
import { useState } from "react";
import { useShoppingList, useMatchFlashes, useCurrentZone } from "@/lib/hooks";
import { api } from "@/lib/api";
import ItemLink from "./ItemLink";
import { groupByOrigin, effectiveNeeded, type ListGroup } from "@/shared/grouping";
import {
  groupDropsByZone,
  splitDropsByCurrentZone,
  otherSources,
  type ZoneDrops,
} from "@/shared/sources";
import type { ItemSource, ShoppingListEntry, SourceKind } from "@/shared/types";

/**
 * The shopping list, grouped under the quest/recipe that added each item (added
 * via "add full quest" on the Search tab). Standalone items fall into "Other".
 * Entries flash gold the moment a matching loot line hits the log, and each expands
 * (▸) to show where to get it — drop mobs by zone (current zone first) plus vendor/
 * quest/craft sources, color-coded.
 */
export default function ListPanel() {
  const list = useShoppingList();
  const flashed = useMatchFlashes();
  const zone = useCurrentZone();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quickAdd, setQuickAdd] = useState("");

  const groups = groupByOrigin(list.entries, list.questRuns);
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const setRuns = (g: ListGroup, delta: number) => api()?.list.setRuns(g.key, g.runs + delta);
  const removeGroup = (g: ListGroup) => Promise.all(g.entries.map((e) => api()?.list.remove(e.id)));

  function add() {
    const name = quickAdd.trim();
    if (!name) return;
    void api()?.list.add({ name });
    setQuickAdd("");
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="field"
          placeholder="Add an item by name…"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button className="btn primary" onClick={add}>
          + Add
        </button>
      </div>

      {list.entries.length === 0 ? (
        <div className="empty">
          <p>Your shopping list is empty.</p>
          <p className="small">Add an item above, or find items/quests/recipes on the Search tab.</p>
        </div>
      ) : (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted small">
            {list.entries.length} item{list.entries.length === 1 ? "" : "s"} watched · {groups.length} group
            {groups.length === 1 ? "" : "s"}
          </span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => api()?.list.clear()}>
            Clear all
          </button>
        </div>
      )}

      <div className="groups">
        {groups.map((g) => {
          const isCollapsed = !!collapsed[g.key];
          return (
            <div className={`group ${g.complete ? "done" : ""}`} key={g.key}>
              <div className="group-header" onClick={() => toggle(g.key)}>
                <span className="caret">{isCollapsed ? "▸" : "▾"}</span>
                {g.kind && <span className={`badge kind-${g.kind}`}>{g.kind}</span>}
                <span className="group-label">{g.label}</span>
                <span className="spacer" />
                {g.kind && (
                  <span className="group-runs" onClick={(ev) => ev.stopPropagation()} title="How many times you'll run this">
                    <button className="btn ghost sm" onClick={() => setRuns(g, -1)} disabled={g.runs <= 1}>
                      −
                    </button>
                    <span className="runs-count">×{g.runs}</span>
                    <button className="btn ghost sm" onClick={() => setRuns(g, +1)}>
                      +
                    </button>
                  </span>
                )}
                <span className="muted small">
                  {g.entries.filter((e) => e.obtained >= effectiveNeeded(e, g.runs)).length}/{g.entries.length}
                </span>
                {g.kind && (
                  <button
                    className="btn ghost sm"
                    title="Remove this group"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void removeGroup(g);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {!isCollapsed && (
                <div className="group-entries">
                  {g.entries.map((e) => (
                    <EntryRow key={e.id} entry={e} runs={g.runs} flashing={flashed.has(e.id)} currentZone={zone} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  runs,
  flashing,
  currentZone,
}: {
  entry: ShoppingListEntry;
  runs: number;
  flashing: boolean;
  currentZone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<ItemSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  const need = effectiveNeeded(entry, runs);
  const met = entry.obtained >= need;
  const cls = ["entry", met ? "done" : "", flashing ? "flash" : ""].filter(Boolean).join(" ");
  const setNeeded = (delta: number) => api()?.list.update(entry.id, { needed: Math.max(1, entry.needed + delta) });

  // Lazily fetch this item's sources the first time it's expanded (cached in main).
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && sources === null && !loading) {
      setLoading(true);
      try {
        const page = await api()?.wiki.getPage(entry.name);
        setSources(page?.sources ?? []);
      } finally {
        setLoading(false);
      }
    }
  }

  const drops = sources ? groupDropsByZone(sources) : null;
  const others = sources ? otherSources(sources) : [];
  const split = drops ? splitDropsByCurrentZone(drops, currentZone) : null;
  const nothing = !!sources && !!drops && drops.length === 0 && others.length === 0;

  return (
    <div className="entry-wrap">
      <div className={cls}>
        <button className="entry-caret" title="Where to get it" onClick={toggle}>
          {open ? "▾" : "▸"}
        </button>
        <ItemLink title={entry.name} className="entry-name" />
        <span className="entry-count">
          <span className={`have ${met ? "met" : ""}`}>{entry.obtained}</span> / {need}
        </span>
        <button
          className="btn ghost sm"
          title="Open on eqlwiki"
          onClick={() => api()?.wiki.openInBrowser(entry.wikiPath ?? entry.name)}
        >
          ↗
        </button>
        <button className="btn ghost sm" title="Need one fewer" onClick={() => setNeeded(-1)}>
          −
        </button>
        <button className="btn ghost sm" title="Need one more" onClick={() => setNeeded(+1)}>
          +
        </button>
        <button className="btn ghost sm" title="Remove" onClick={() => api()?.list.remove(entry.id)}>
          ✕
        </button>
      </div>

      {open && (
        <div className="entry-sources">
          {loading && <div className="muted small">Loading…</div>}
          {nothing && <div className="muted small">No known source — open it on eqlwiki to check.</div>}
          {split && (
            <>
              {split.here.map((d) => (
                <ZoneRow key={d.zone} drops={d} here />
              ))}
              {split.here.length > 0 && split.elsewhere.length > 0 && (
                <button className="entry-more" onClick={() => setShowOthers((s) => !s)}>
                  {showOthers
                    ? "− hide other zones"
                    : `+ ${split.elsewhere.length} other zone${split.elsewhere.length === 1 ? "" : "s"}`}
                </button>
              )}
              {(split.here.length === 0 || showOthers) && split.elsewhere.map((d) => <ZoneRow key={d.zone} drops={d} />)}
            </>
          )}
          {others.map((s, i) => (
            <SourceLine key={`${s.kind}-${s.where}-${i}`} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Drop mobs for one zone (current zone highlighted); mob names are in-app links. */
function ZoneRow({ drops, here }: { drops: ZoneDrops; here?: boolean }) {
  return (
    <div className={`drop-zone ${here ? "here" : ""}`}>
      <span className="src-kind k-drop">kill</span>
      <span className="dz-name">{drops.zone}</span>
      <span className="dz-mobs">
        {drops.mobs.map((m, i) => (
          <span key={m}>
            {i > 0 && ", "}
            <ItemLink title={m} />
          </span>
        ))}
      </span>
    </div>
  );
}

/** A non-drop source (vendor / quest / craft …), colored by kind. */
function SourceLine({ source }: { source: ItemSource }) {
  return (
    <div className="src-line">
      <span className={`src-kind k-${source.kind}`}>{kindLabel(source.kind)}</span>
      <ItemLink title={source.where} />
      {source.detail && <span className="muted small">{source.detail}</span>}
    </div>
  );
}

function kindLabel(kind: SourceKind): string {
  switch (kind) {
    case "vendor":
      return "buy";
    case "quest":
      return "quest";
    case "recipe":
      return "craft";
    default:
      return kind;
  }
}
