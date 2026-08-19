"use client";
import { useState } from "react";
import { useShoppingList, useMatchFlashes, useCurrentZone } from "@/lib/hooks";
import { api } from "@/lib/api";
import ItemLink, { NameList } from "./ItemLink";
import { count } from "@/shared/format";
import { Caret, caretGlyph, Empty } from "./ui";
import {
  countableEntries,
  effectiveNeeded,
  groupByOrigin,
  isMobEntry,
  itemDemands,
  normalizeItemName,
  satisfied,
  totalNeed,
  type ItemDemand,
  type ListGroup,
} from "@/shared/grouping";
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

  const groups = groupByOrigin(list.entries, list.questRuns);
  // Who wants each item and how many: the parenthetical grand total, and the hover that
  // names the quests/recipes behind it.
  const demands = itemDemands(groups);
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const setRuns = (g: ListGroup, delta: number) => api()?.list.setRuns(g.key, g.runs + delta);
  const removeGroup = (g: ListGroup) => Promise.all(g.entries.map((e) => api()?.list.remove(e.id)));

  return (
    <div>
      {list.entries.length === 0 ? (
        <Empty
          title="Your shopping list is empty."
          hint="Find items, quests, or recipes on the Search tab and add them here."
        />
      ) : (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted small">
            {count(list.entries.length, "item")} watched · {count(groups.length, "group")}
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
          // The tally is over the rows that can actually be completed. A mob can't, so counting it
          // left a group reading "2/3" for ever — see `isMobEntry`; hidden altogether when a group
          // holds nothing else, since "0/0" is not progress.
          const countable = countableEntries(g.entries);
          return (
            <div className={`group ${g.complete ? "done" : ""}`} key={g.key}>
              <div className="group-header" onClick={() => toggle(g.key)}>
                <Caret open={!isCollapsed} />
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
                {countable.length > 0 && (
                  <span className="muted small">
                    {countable.filter((e) => satisfied(e, g.runs)).length}/{countable.length}
                  </span>
                )}
                {g.kind && (
                  <button
                    className="btn ghost sm"
                    title={`Open ${g.label} on eqlwiki`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      api()?.wiki.openInBrowser(g.label);
                    }}
                  >
                    ↗
                  </button>
                )}
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
                    <EntryRow
                      key={e.id}
                      entry={e}
                      runs={g.runs}
                      demands={demands.get(normalizeItemName(e.name)) ?? []}
                      flashing={flashed.has(e.id)}
                      currentZone={zone}
                    />
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
  demands,
  flashing,
  currentZone,
}: {
  entry: ShoppingListEntry;
  runs: number;
  /** Every group wanting this item — the source of the "(N)" hint and its hover. */
  demands: ItemDemand[];
  flashing: boolean;
  currentZone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<ItemSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  const need = effectiveNeeded(entry, runs);
  const total = totalNeed(demands);
  const isMob = isMobEntry(entry);
  // A mob is never "done" — there's no count to complete — so it must not be struck through the way
  // a finished item is.
  const met = !isMob && satisfied(entry, runs);
  const cls = ["entry", met ? "done" : "", isMob ? "is-mob" : "", flashing ? "flash" : ""]
    .filter(Boolean)
    .join(" ");
  // +/- adjust how many you've ACQUIRED (obtained); needed comes from the quest/recipe
  // qty × the group's runs. Obtained can exceed need (you can over-loot) but not go below 0.
  const setObtained = (delta: number) => api()?.list.update(entry.id, { obtained: Math.max(0, entry.obtained + delta) });

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
          {caretGlyph(open)}
        </button>
        <ItemLink title={entry.name} className="entry-name" />
        {/* A mob has no count to show and never will: nothing drops it, so "0 of 1" would be a
            progress bar that can't move. It says what it *is* instead — a thing to go and kill,
            which is what the Hunt tab lists it as. */}
        {isMob ? (
          <span className="entry-kind" title="A mob to hunt — see the Hunt tab for where">
            hunt
          </span>
        ) : (
          /* "5 of 3 (10)" — you have 5, this group wants 3, everything wants 10 between
             them. A drop credits every group that wants the item, so the combined figure
             is the one that says whether you can stop farming. */
          <span className="entry-count" title={countTitle(entry.obtained, need, demands)}>
            <span className={`have ${met ? "met" : ""}`}>{entry.obtained}</span> of {need}
            {total > need && <span className="muted small"> ({total})</span>}
          </span>
        )}
        <button
          className="btn ghost sm"
          title="Open on eqlwiki"
          onClick={() => api()?.wiki.openInBrowser(entry.wikiPath ?? entry.name)}
        >
          ↗
        </button>
        {!isMob && (
          <>
            <button
              className="btn ghost sm"
              title="Got one fewer"
              onClick={() => setObtained(-1)}
              disabled={entry.obtained <= 0}
            >
              −
            </button>
            <button className="btn ghost sm" title="Got one more" onClick={() => setObtained(+1)}>
              +
            </button>
          </>
        )}
        {/* Off by default, and per row: the list holds a quest's twenty Bone Chips beside the one
            robe you're camping, and a banner per chip is the noise an overlay exists to spare you
            (ADR 0105). The glyph carries the state, so it needs no second control saying which it is.
            Never on a mob — nothing drops it, so there is no loot line to speak. */}
        {!isMob && (
          <button
            className="btn ghost sm"
            title={entry.notify ? "Alerting when this drops — click to silence" : "Alert me when this drops"}
            aria-pressed={!!entry.notify}
            onClick={() => api()?.list.update(entry.id, { notify: !entry.notify })}
          >
            {entry.notify ? "🔔" : "🔕"}
          </button>
        )}
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
                    : `+ ${count(split.elsewhere.length, "other zone")}`}
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

/**
 * Spell out the terse "5 of 3 (10)" on hover. With more than one claim on the item, the
 * parenthetical total is only meaningful if you can see what it's made of — so name each
 * quest/recipe and what it wants (including why, when it's set to multiple runs).
 */
function countTitle(obtained: number, need: number, demands: ItemDemand[]): string {
  if (demands.length <= 1) return `You have ${obtained}; this group needs ${need}`;
  const total = totalNeed(demands);
  const lines = demands.map((d) => {
    const tag = d.kind ? ` (${d.kind}${d.runs > 1 ? ` ×${d.runs} runs` : ""})` : "";
    return `• ${d.label}${tag} — ${d.need}`;
  });
  return [`You have ${obtained} of ${total} needed:`, ...lines].join("\n");
}

/** Drop mobs for one zone (current zone highlighted); mob names are in-app links. */
function ZoneRow({ drops, here }: { drops: ZoneDrops; here?: boolean }) {
  return (
    <div className={`drop-zone ${here ? "here" : ""}`}>
      <span className="src-kind k-drop">kill</span>
      <span className="dz-name">{drops.zone}</span>
      <NameList names={drops.mobs} className="dz-mobs" />
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
