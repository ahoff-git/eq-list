"use client";
import { useEffect, useState } from "react";
import {
  useCapabilities,
  useClosedZones,
  useGoalFocus,
  useMatchFlashes,
  useCurrentZone,
  useSettings,
  type GoalFocus,
} from "@/lib/hooks";
import { api } from "@/lib/api";
import { countFromInventory, setHave, useCountedList } from "@/lib/items/useCountedList";
import { useReorder, type Reorder } from "@/lib/items/useReorder";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { HeldNote, HeldSourceNote } from "@/app/components/items/HeldNote";
import type { EntryCount } from "@/shared/items/held-count";
import QuestPickupAdd from "@/app/components/items/QuestPickupAdd";
import AskValue from "@/app/components/AskValue";
import ItemLink, { NameList } from "@/app/components/items/ItemLink";
import { ZoneName } from "@/app/components/map/ZoneName";
import { LucyLink } from "@/app/components/items/LucySays";
import { count } from "@/shared/format";
import { Caret, caretGlyph, Empty } from "@/app/components/ui";
import { AlertStyleDrawer } from "@/app/components/alerts/AlertStyleField";
import { LOOT_STYLE_ID } from "@/shared/alerts/alert-styles";
import { goalWantsItem, goalWantsMob } from "@/shared/goals/goal-progress";
import GoalFocusBanner from "@/app/components/goals/GoalFocusBanner";
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
} from "@/shared/items/grouping";
import { moveGroup, moveRow } from "@/shared/items/list-order";
import {
  groupDropsByZone,
  splitDropsByCurrentZone,
  otherSources,
  sourceKindLabel,
  type ZoneDrops,
} from "@/shared/items/sources";
import { zoneShut } from "@/shared/items/item-era";
import { unavailableReason, zoneExpansion } from "@/shared/zones/expansions";
import { createLogger } from "@/shared/logging";
import type { ItemSource, ShoppingListEntry } from "@/shared/types";
import { heldAsNamed, notAnItem } from "@/shared/shown-name";

const log = createLogger("shopping-list");

/** Ceiling on a typed count — far past any real stack, just enough to catch a typo. */
const MAX_COUNT = 100_000;

/**
 * The shopping list, grouped under the quest/recipe that added each item (added
 * via "add full quest" on the Search tab). Standalone items fall into "Other".
 * Entries flash gold the moment a matching loot line hits the log, and each expands
 * (▸) to show where to get it — drop mobs by zone (current zone first) plus vendor/
 * quest/craft sources, color-coded.
 */
export default function ListPanel() {
  // The list as it counts: a row's figure is the larger of its own tally and what your last inventory dump
  // plus the ledger since says you hold (ADR 0382). `counts` says which it was, for the row to explain.
  const { list, counts, dump } = useCountedList();
  const { log: canReadLog } = useCapabilities();
  const flashed = useMatchFlashes();
  const zone = useCurrentZone();
  // Read once here and passed down, not read per row: `useSettings` costs an IPC read and a listener
  // per instance, and a long list would pay one of each per item to learn a single flag.
  const askLucy = useSettings()?.askLucy ?? true;
  // Same reasoning as `askLucy` — `useClosedZones` costs a message per mount, so the live half of the
  // era judgement is read once and passed down rather than once per row.
  const closedZones = useClosedZones();
  // Which groups are folded shut — kept across restarts (ADR 0388), so a list tidied once stays tidy.
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>(STORAGE_KEYS.listCollapsed, {});
  const [styling, setStyling] = useState(false);
  // Which items your running goals want (ADR 0198) — emphasized while focus is on, and the rest
  // hidden as well once the reader also asks for that. Read once here, not per row, for the same
  // reason `askLucy` is.
  const focus = useGoalFocus();
  // Every armed row wears the one Loot look — there is no style per row (ADR 0105) — so the control
  // for it belongs to the list rather than to any entry, and only once something is armed: before
  // that it describes a banner nothing will raise.
  const armed = list.entries.some((e) => e.notify);

  const groups = groupByOrigin(list.entries, list.questRuns);
  // Who wants each item and how many: the parenthetical grand total, and the hover that
  // names the quests/recipes behind it.
  const demands = itemDemands(groups);
  // Only shut groups are stored, and a key for a group that has since gone is dropped on the way past — otherwise
  // every quest ever folded would stay in the saved state for good.
  const groupKeys = new Set(groups.map((g) => g.key));
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const kept = Object.fromEntries(Object.entries(c).filter(([k]) => k !== key && groupKeys.has(k)));
      return c[key] ? kept : { ...kept, [key]: true };
    });
  // What a goal-focused list leaves on screen in a group — the rows that can be dragged, and drawn.
  const visibleRows = (g: ListGroup) => (focus.active && focus.hiding ? g.entries.filter((e) => matchesGoalFocus(e, focus)) : g.entries);
  // Who may be dropped beside whom. Finished groups and rows sink below unfinished ones whatever their order, so a
  // drag across that line would only snap back: each bucket is its own run. "Other items" never moves.
  const groupSiblings = (key: string): string[] => {
    const g = groups.find((x) => x.key === key);
    return g && g.kind !== null ? groups.filter((x) => x.kind !== null && x.complete === g.complete).map((x) => x.key) : [];
  };
  const rowSiblings = (id: string): string[] => {
    const g = groups.find((x) => x.entries.some((e) => e.id === id));
    const row = g?.entries.find((e) => e.id === id);
    if (!g || !row) return [];
    const done = (e: ShoppingListEntry) => !isMobEntry(e) && satisfied(e, g.runs);
    return visibleRows(g).filter((e) => done(e) === done(row)).map((e) => e.id);
  };
  // A move is the whole new order, sent as one array (list-order.ts) — the same order that decides which row is
  // handed held items first (ADR 0387), so arranging the list is how you say which quest the chips are for.
  const groupMoves = useReorder({
    siblingsOf: groupSiblings,
    onMove: (key, target, after) => void api()?.list.reorder(moveGroup(list.entries, key, target, after)),
  });
  const rowMoves = useReorder({
    siblingsOf: rowSiblings,
    onMove: (id, target, after) => void api()?.list.reorder(moveRow(list.entries, id, target, after)),
  });
  const setRuns = (g: ListGroup, delta: number) => api()?.list.setRuns(g.key, g.runs + delta);
  const removeGroup = (g: ListGroup) => Promise.all(g.entries.map((e) => api()?.list.remove(e.id)));

  return (
    <div>
      {list.entries.length === 0 ? (
        <>
          <Empty
            title="Your shopping list is empty."
            hint="Find items, quests, or recipes on the Search tab and add them here."
          />
          <QuestPickupAdd />
        </>
      ) : (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted small">
            {count(list.entries.length, "item")} watched · {count(groups.length, "group")}
          </span>
          {/* Only where there is a game to dump from — a browser has no /outputfile to suggest. */}
          {canReadLog && dump !== undefined && <HeldSourceNote dump={dump} />}
          <span className="spacer" />
          <QuestPickupAdd />
          {armed && (
            <button
              className={`btn ghost sm ${styling ? "on" : ""}`}
              title={styling ? "Close" : "Edit the look a drop alert wears"}
              onClick={() => setStyling((v) => !v)}
            >
              🎨 Drop alerts
            </button>
          )}
          <button className="btn ghost sm" onClick={() => api()?.list.clear()}>
            Clear all
          </button>
        </div>
      )}
      {armed && styling && <AlertStyleDrawer fallback={LOOT_STYLE_ID} />}

      {focus.active && focus.hiding && (
        <GoalFocusBanner
          hidden={list.entries.filter((e) => !matchesGoalFocus(e, focus)).length}
          onShowAll={() => focus.setHiding(false)}
        />
      )}

      <div className="groups">
        {groups.map((g) => {
          const isCollapsed = !!collapsed[g.key];
          // The tally is over the rows that can actually be completed. A mob can't, so counting it
          // left a group reading "2/3" for ever — see `isMobEntry`; hidden altogether when a group
          // holds nothing else, since "0/0" is not progress.
          const countable = countableEntries(g.entries);
          // While focused *and* hiding, a group with nothing goal-relevant left in it has nothing to
          // show at all — its header would just be an empty shell over a group the reader asked to
          // stop seeing.
          const visible = visibleRows(g);
          if (focus.active && focus.hiding && visible.length === 0) return null;
          const drop = groupMoves.target(g.key);
          return (
            <div className={`group ${g.complete ? "done" : ""} ${drop.mark}`.trim()} key={g.key} {...drop.props}>
              <div className="group-header" onClick={() => toggle(g.key)}>
                {/* Not for "Other items": it is the catch-all that stays last. A grip is a button for the
                    keyboard's sake, so its click must not also fold the group. */}
                {g.kind && (
                  <span
                    className="drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label={`Move ${g.label}`}
                    title="Drag to move this group — or focus it and press Alt with ↑ or ↓"
                    onClick={(ev) => ev.stopPropagation()}
                    {...groupMoves.handle(g.key)}
                  >
                    ⠿
                  </span>
                )}
                <Caret open={!isCollapsed} />
                {g.kind && <span className={`badge kind-${g.kind}`}>{g.kind}</span>}
                {/* "Other items" has no page behind it — nothing to open — so it stays plain text;
                    every real quest/recipe group opens the same way an item name does (ItemLink
                    stops the click reaching the header's own onClick, so this doesn't also toggle it). */}
                {g.kind ? (
                  <ItemLink title={notAnItem(g.label)} className="group-label" />
                ) : (
                  <span className="group-label">{g.label}</span>
                )}
                <span className="spacer" />
                {/* Gated on there being anything *countable* in the group, not just a `kind` — a
                    faction group's entries are all mobs (`countableEntries` excludes every one of
                    them), and "how many times you'll run this" isn't a question a hunt list answers;
                    a bare `g.kind` check would show the stepper for it anyway, the same way it would
                    for any future kind whose entries are never countable. */}
                {g.kind && countable.length > 0 && (
                  <span className="group-runs" onClick={(ev) => ev.stopPropagation()} title="How many times you'll run this">
                    <button className="btn ghost sm" onClick={() => setRuns(g, -1)} disabled={g.runs <= 1}>
                      −
                    </button>
                    <span className="runs-count">
                      ×
                      <AskValue
                        prompt={String(g.runs)}
                        why="How many times you'll run this — click to type it"
                        initial={g.runs}
                        min={1}
                        max={MAX_COUNT}
                        step={1}
                        onSubmit={(runs) => api()?.list.setRuns(g.key, runs)}
                      />
                    </span>
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
                  {visible.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      grip={rowMoves.handle(e.id)}
                      drop={rowMoves.target(e.id)}
                      runs={g.runs}
                      demands={demands.get(normalizeItemName(e.name)) ?? []}
                      count={counts.get(e.id)}
                      now={dump?.now ?? 0}
                      flashing={flashed.has(e.id)}
                      currentZone={zone}
                      askLucy={askLucy}
                      closedZones={closedZones}
                      // Only worth marking in emphasize-only mode — once hiding is on, every row left
                      // on screen already matches, and outlining all of them would say nothing.
                      goalMatch={focus.active && !focus.hiding ? matchesGoalFocus(e, focus) : undefined}
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
  grip,
  drop,
  runs,
  demands,
  count: counted,
  now,
  flashing,
  currentZone,
  askLucy,
  closedZones,
  goalMatch,
}: {
  /** The entry as it counts: its `obtained` is the figure used (`useCountedList`). */
  entry: ShoppingListEntry;
  /** What the row's grip is given to start a move (ADR 0388) — and what the row is given to be dropped on. */
  grip: ReturnType<Reorder["handle"]>;
  drop: ReturnType<Reorder["target"]>;
  runs: number;
  /** Every group wanting this item — the source of the "(N)" hint and its hover. */
  demands: ItemDemand[];
  /** How `entry.obtained` was reached, and what the inventory said — absent for a mob. */
  count?: EntryCount;
  /** The clock the dump's age is measured against. */
  now: number;
  flashing: boolean;
  currentZone: string | null;
  /** Whether to offer the ↗ Lucy link. Passed rather than read here — see `ListPanel`. */
  askLucy: boolean;
  /** The live out-of-era zone list. Passed rather than read here — see `ListPanel`. */
  closedZones: ReadonlySet<string>;
  /** Goal focus is on (but not hiding): `true` outlines the row, `false` dims it, `undefined` means
   *  focus isn't active at all and the row is drawn exactly as it always was. */
  goalMatch?: boolean;
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
  const cls = [
    "entry",
    met ? "done" : "",
    isMob ? "is-mob" : "",
    flashing ? "flash" : "",
    goalMatch === true ? "goal-focus-match" : "",
    goalMatch === false ? "goal-focus-dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // +/- adjust how many you've ACQUIRED (obtained); needed comes from the quest/recipe
  // qty × the group's runs. Obtained can exceed need (you can over-loot) but not go below 0.
  // A figure you set is yours: the inventory stops raising it (`countedByHand`) until you hand it back (↺).
  const setObtained = (delta: number) => setHave(entry.id, entry.obtained + delta);
  // The figures themselves are typed into as well — 800 Phosphorous Powder is not 800 presses of +.
  // Need is stored per run, so with runs set the box asks for the per-run figure it scales.
  const perRun = runs > 1;

  // Fetched as soon as the row mounts (cached in main, so this is usually free) rather than waiting
  // for the ▸ to be clicked: "where do I get this" is exactly what a shopping list is for, so the row
  // shows its best answer — a zone and its mobs, or a vendor/quest/craft line — without a click. The
  // caret still exists for the full breakdown (every zone, every other source). Never for a mob: it
  // has no sources of its own to look up (it's the thing being hunted, not a thing that drops).
  useEffect(() => {
    if (isMob) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const page = await api()?.wiki.getPage(entry.name);
      if (!cancelled) {
        setSources(page?.sources ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.name, isMob]);

  const toggle = () => setOpen((o) => !o);

  const drops = sources ? groupDropsByZone(sources) : null;
  const others = sources ? otherSources(sources) : [];
  const split = drops ? splitDropsByCurrentZone(drops, currentZone) : null;
  const nothing = !!sources && !!drops && drops.length === 0 && others.length === 0;
  // The row's one-line answer: the current zone's drop if there is one, else the first known drop
  // zone, else the first non-drop source. `split` already orders "here" before "elsewhere", so the
  // first entry across both is exactly the one the full breakdown would lead with.
  const hereZone = split?.here[0] ?? null;
  const bestZone = hereZone ?? split?.elsewhere[0] ?? null;
  const isHere = !!hereZone;
  const bestOther = !bestZone ? (others[0] ?? null) : null;

  return (
    <div className={`entry-wrap ${drop.mark}`.trim()} {...drop.props}>
      <div className={cls}>
        <span
          className="drag-handle"
          role="button"
          tabIndex={0}
          aria-label={`Move ${entry.name}`}
          title="Drag to move this item within its group — or focus it and press Alt with ↑ or ↓"
          {...grip}
        >
          ⠿
        </span>
        <button className="entry-caret" title="Where to get it" onClick={toggle}>
          {caretGlyph(open)}
        </button>
        <div className="entry-main">
          <ItemLink title={heldAsNamed(entry.name)} className="entry-name" />
          {/* The one-line answer, right under the name — see the effect above for why it's already
              here and not waiting on a click. Silent while loading and when nothing is known, rather
              than a placeholder that would flicker true on almost every row (this is cache-fast). */}
          {!isMob && !loading && (bestZone || bestOther) && (
            <div className="entry-summary muted small">
              {bestZone ? (
                <>
                  <ZoneName zone={bestZone.zone} className={`es-zone ${isHere ? "here" : ""}`} />
                  {" — "}
                  <NameList names={bestZone.mobs.map(notAnItem)} />
                </>
              ) : (
                bestOther && (
                  <>
                    <span className={`src-kind k-${bestOther.kind}`}>{sourceKindLabel(bestOther.kind)}</span>
                    <ItemLink title={notAnItem(bestOther.where)} />
                  </>
                )
              )}
            </div>
          )}
          {/* Under the name rather than in the row's own line: a narrow window has no room for a second
              figure beside the count, and the count wrapped when it was tried there. */}
          {counted && <HeldNote count={counted} need={need} now={now} onUseInventory={(held) => countFromInventory(entry.id, held)} />}
        </div>
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
            <AskValue
              className={`have ${met ? "met" : ""}`}
              prompt={String(entry.obtained)}
              why="How many you have — click to type it"
              initial={entry.obtained}
              max={MAX_COUNT}
              step={1}
              onSubmit={(obtained) => setHave(entry.id, Math.round(obtained))}
            />{" "}
            of{" "}
            <AskValue
              prompt={String(need)}
              why={perRun ? `How many one run needs (now ${entry.needed}, ×${runs} runs) — click to type it` : "How many you need — click to type it"}
              initial={entry.needed}
              min={1}
              max={MAX_COUNT}
              step={1}
              onSubmit={(needed) => api()?.list.update(entry.id, { needed: Math.round(needed) })}
            />
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
        {/* And the second opinion, beside it. By name rather than id — a list row has no Lucy id and
            getting one would mean a request per row, which is exactly what a link doesn't need to do.
            Not for a mob: Lucy is an item database, and a mob's name reliably finds nothing there. */}
        {!isMob && <LucyLink target={entry.name} label="↗L" show={askLucy} />}
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
                <ZoneRow key={d.zone} drops={d} here closedZones={closedZones} />
              ))}
              {split.here.length > 0 && split.elsewhere.length > 0 && (
                <button className="entry-more" onClick={() => setShowOthers((s) => !s)}>
                  {showOthers
                    ? "− hide other zones"
                    : `+ ${count(split.elsewhere.length, "other zone")}`}
                </button>
              )}
              {(split.here.length === 0 || showOthers) &&
                split.elsewhere.map((d) => <ZoneRow key={d.zone} drops={d} closedZones={closedZones} />)}
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

/**
 * Drop mobs for one zone (current zone highlighted); mob names are in-app links.
 *
 * Badged, never hidden, the same rule `WikiPageView`'s `SourceList` applies to a source: the mobs
 * are still the truth about where the item comes from, and still what to plan around when the era
 * opens ([ADR 0170](../../../specs/decisions/0170-an-item-s-sources-are-read-against-the-era.md)
 * named this exact gap — the shopping list applied no era test at all).
 */
function ZoneRow({ drops, here, closedZones }: { drops: ZoneDrops; here?: boolean; closedZones: ReadonlySet<string> }) {
  const shut = zoneShut(drops.zone, closedZones);
  const why = shut ? unavailableReason(shut, zoneExpansion(drops.zone)) : undefined;
  if (shut) log.debug("marked", drops.zone, "out of era:", why);
  return (
    <div className={`drop-zone ${here ? "here" : ""} ${shut ? "out-of-era" : ""}`.trim()}>
      <span className="src-kind k-drop">kill</span>
      <ZoneName zone={drops.zone} className="dz-name" />
      <NameList names={drops.mobs.map(notAnItem)} className="dz-mobs" />
      {shut && (
        <span className="badge era-out" title={why}>
          {shut === "future" ? "not on this server" : "out of era"}
        </span>
      )}
    </div>
  );
}

/**
 * Whether a row is what a running goal wants (ADR 0198) — an item goal against an item row, a mob
 * goal against a "hunt" row, never the other kind: a mob goal names nothing an item row could ever
 * satisfy, and the reverse.
 */
function matchesGoalFocus(entry: ShoppingListEntry, focus: GoalFocus): boolean {
  if (isMobEntry(entry)) return focus.mobTargets.some((t) => goalWantsMob(t, entry.name));
  return focus.itemTargets.some((t) => goalWantsItem(t, entry.name));
}

/** A non-drop source (vendor / quest / craft …), colored by kind. */
function SourceLine({ source }: { source: ItemSource }) {
  return (
    <div className="src-line">
      <span className={`src-kind k-${source.kind}`}>{sourceKindLabel(source.kind)}</span>
      <ItemLink title={notAnItem(source.where)} />
      {source.detail && <span className="muted small">{source.detail}</span>}
    </div>
  );
}

