"use client";
import { useState } from "react";
import { useShoppingList, useMatchFlashes } from "@/lib/hooks";
import { api } from "@/lib/api";
import { groupByOrigin, type ListGroup } from "@/shared/grouping";
import type { ShoppingListEntry } from "@/shared/types";

/**
 * The shopping list, grouped under the quest/recipe that added each item (added
 * via "add full quest" on the Search tab). Standalone items fall into "Other".
 * Entries flash gold the moment a matching loot line hits the log.
 */
export default function ListPanel() {
  const list = useShoppingList();
  const flashed = useMatchFlashes();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quickAdd, setQuickAdd] = useState("");

  const groups = groupByOrigin(list.entries);
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
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
                <span className="muted small">
                  {g.entries.filter((e) => e.obtained >= e.needed).length}/{g.entries.length}
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
                    <EntryRow key={e.id} entry={e} flashing={flashed.has(e.id)} />
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

function EntryRow({ entry, flashing }: { entry: ShoppingListEntry; flashing: boolean }) {
  const met = entry.obtained >= entry.needed;
  const cls = ["entry", met ? "done" : "", flashing ? "flash" : ""].filter(Boolean).join(" ");
  const setNeeded = (delta: number) => api()?.list.update(entry.id, { needed: Math.max(1, entry.needed + delta) });
  return (
    <div className={cls}>
      <span className="entry-name">{entry.name}</span>
      <span className="entry-count">
        <span className={`have ${met ? "met" : ""}`}>{entry.obtained}</span> / {entry.needed}
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
  );
}
