"use client";
import { useEffect, useMemo, useState } from "react";
import {
  DataGrid,
  type GridColDef,
  type GridFilterModel,
  type GridPaginationModel,
} from "@mui/x-data-grid";
import { useCombatStats, useFactionHitsPage, useFactionStandings, useFactionStandingsSince } from "@/lib/hooks";
import { resetSession } from "@/lib/api";
import { usePersistentState } from "@/lib/usePersistentState";
import { useFuzzyFilter } from "@/lib/useFuzzyFilter";
import { useGridSort } from "@/lib/useGridSort";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { causeConfidence, causeConfidenceWhy } from "@/shared/faction-cause";
import { factionKey } from "@/shared/faction-feed";
import {
  DEFAULT_FACTION_HIT_SORT,
  DEFAULT_FACTION_STANDING_SORT,
  causeKindLabel,
  causeSource,
  ratePerHour,
  sortFactionStandings,
  type FactionHitSortKey,
  type FactionStandingSortKey,
} from "@/shared/faction-sort";
import { clock, count, dayTime, when } from "@/shared/format";
import type { Sort } from "@/shared/sorting";
import type {
  FactionCauseTally,
  FactionHitFilterField,
  FactionHitFilterItem,
  FactionHitsFilter,
  FactionHitsQuery,
  FactionRecord,
  FactionStanding,
} from "@/shared/types";
import ItemLink, { NameList } from "./ItemLink";
import RaceUnlocksView from "./RaceUnlocksView";
import SearchField from "./SearchField";
import {
  DEFAULT_PAGE_SIZE,
  GRID_DEFAULTS,
  GRID_SX,
  GRID_SX_FILL,
  NUM_COL,
  PAGE_SIZE_OPTIONS,
  hiddenByDefault,
} from "./dataGridDefaults";
import { Empty, segCls, StatTile } from "./ui";

/**
 * Everything the log has said raised or lowered a faction, and what it comes to for each one.
 *
 * **Two views, not one scroll** — the same split as the Loot tab's Drops/Sells for, because "what
 * just happened" and "where do I stand with them" are different questions. Hits is the ledger, newest
 * first; Standings folds it to one row per faction with a net delta and a rough rate, the way the
 * Session tab turns raw coin into copper/hour (ADR 0047) — computed here at render time from the raw
 * totals rather than stored, so it can never disagree with what the totals themselves say.
 *
 * **"Likely cause" is a guess, not a fact, and every place it appears says so.** EQ's own faction
 * line names no cause at all — the ledger guesses one from *timing*: the most recent kill that
 * landed shortly before the hit, or — when no kill fits — the most recent line of NPC (or,
 * indistinguishably, nearby player) dialogue, quoted verbatim so the reader can judge it rather than
 * trust a name alone (`src/shared/faction-cause.ts`,
 * [ADR 0219](../../../specs/decisions/0219-a-faction-cause-is-a-guess-from-timing.md),
 * [ADR 0220](../../../specs/decisions/0220-a-conversation-can-be-the-guessed-cause-too.md)). When a
 * dialogue guess's speaker matches a quest giver the wiki's own cache already knows about, the
 * quest(s) they give ride along as a parenthetical
 * ([ADR 0221](../../../specs/decisions/0221-a-guessed-speaker-can-name-a-quest-giver.md)), narrowed
 * further to just the quest(s) whose own cached dialogue resembles what was actually said, when that
 * comparison found one
 * ([ADR 0223](../../../specs/decisions/0223-a-guessed-line-can-match-a-quests-own-dialogue.md)) — a
 * plain name when narrowed, "possibly" when it's just every quest that speaker happens to give.
 * Unlike every other figure in the app, none of this has been checked against a real log showing the
 * true gap — it reads dim and italic for exactly that reason, and the tooltip on it always spells out
 * the uncertainty rather than presenting it as settled.
 *
 * Names are `ItemLink`s, so a faction opens its own wiki page — the raise/lower quests and mobs
 * ([ADR 0192](../../../specs/decisions/0192-factions-ride-their-own-wiki-pages.md)) sit one click away
 * from what your own log says actually moved it.
 *
 * **A Standings row opens its full likely-cause breakdown in a panel below the grid** (ADR 0230 —
 * `DataGrid`'s Community tier has no row to nest one under, so it moved from a second `<tr>` under
 * the clicked row to underneath the table, the same drill-down `SpellTable` uses). The row itself
 * still shows a capped "top 3, +N more" summary for a glance, but "+N more" used to be a dead end —
 * clicking the row reveals every cause the ledger has, with kills and quests kept in their own
 * independently-openable group (`CauseBreakdown`/`CauseGroup`) rather than one merged list — a kill
 * and a guessed conversation are different kinds of guess, and mixing them together would make the
 * weaker one borrow the stronger one's credibility. Each row there is also colored by
 * `causeConfidence` — dim for a name seen once, stepping up toward `--accent` as the *same* mob or
 * NPC keeps landing beside the same faction, since a repeat is what turns a lone guess into a pattern
 * worth trusting more (`faction-cause.ts`'s "a guess repeated is a guess corroborated"); the tooltip
 * on it always names the raw hit count behind the color, never just the color alone.
 *
 * **That same panel leads with the raw hits behind the net** — every ledger row the game actually
 * logged for this faction, embedded directly rather than behind a further click, with the guessed
 * likely-cause tally underneath it. `FactionHitsGrid`, the same grid component the Hits tab itself
 * renders, just handed a `faction` prop instead of left open — no second copy of its columns or its
 * query for what is, underneath, the same question the Hits tab already answers. Only queried once a
 * row is actually opened, same as the cause tally beside it.
 *
 * Both tables are `DataGrid`s — sortable and filterable on every column, save the few `sortable: false`
 * ones a closed sort/filter contract with `hitsPage` (or main-process aggregation) can't reach.
 *
 * **Hits pages through the whole ledger, server-side, not just the most recent 200.** The feed used
 * to be a flat 200-row cap fetched once with nowhere further to go, then (briefly) the *entire*
 * ledger fetched in one IPC call and paginated over an already-fully-fetched array. Neither survives
 * a ledger with no cap at all: `faction-log.ts` now keeps every hit forever
 * ([ADR 0232](../../../specs/decisions/0232-a-ledger-that-outlives-its-cap-is-a-database.md)), so
 * `FactionHitsGrid` asks main for one page at a time (`faction.hitsPage`) as the player turns pages or
 * re-sorts a column, instead of holding the whole history in the renderer. Every grid in the app now
 * pages (ADR 0249) — `dataGridDefaults.ts`'s `GRID_SX_FILL` is the variant for a table that's the
 * whole of its tab (both of this panel's, and `LootPanel`'s two): it fills whatever height its flex
 * container hands it rather than a fixed box, so it uses a tall window rather than stopping partway
 * down it ([ADR 0248](../../../specs/decisions/0248-a-paged-grid-fills-the-window-instead-of-a-fixed-height.md),
 * superseding [ADR 0234](../../../specs/decisions/0234-a-paged-grid-gets-a-fixed-height-and-a-real-filter.md)'s
 * fixed `height: 560`). The Hits tab's own column filter also reaches the whole ledger, not just the
 * fetched page, via `hitsPage`'s own `filter` parameter (ADR 0234's other half, which still stands) —
 * the one table in the app where ADR 0230's "filter narrows what's on screen" rule doesn't hold (the
 * Standings drill-down's own `FactionHitsGrid` skips the filter panel entirely — it's already scoped
 * to one faction, so there's nothing left to narrow).
 *
 * **A third view, Race Unlocks** (`RaceUnlocksView`), folds the live Standings onto Alanna's Race
 * Unlock Guide ([ADR 0222](../../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md))
 * — which factions each race needs maxed, the quests that raise them, and how close the ledger has
 * seen you get. Unlike the other two, it's useful with zero hits recorded (it's reference data, not a
 * ledger), so it's the one view the empty state below doesn't gate.
 *
 * **A fourth view, Session, answers a narrower question than Standings: not "where do I stand" but
 * "what changed tonight."** The ledger keeps every hit forever with nothing session-shaped about it
 * (unlike `CombatStats`, ADR 0019's one tracker for everything else called "session") — so this folds
 * the same way `standings` does, just scoped to hits at or after the session's own start
 * (`useCombatStats().startedAt`, `faction.standingsSince`/`FactionLog.standingsSince`). Reuses
 * `StandingTable` rather than a second copy of its columns, with its row drill-down turned off: the
 * ledger has no per-session *hit* query yet, so opening one here would show a faction's whole lifetime
 * of hits under a "this session" heading instead of honestly having nothing further to show.
 */
type View = "hits" | "standings" | "session" | "unlocks";

/** A single newest-hit probe — cheap (one row, one `COUNT(*)`), and enough to answer "is the ledger
 *  empty" and "how many hits total" for the header without fetching a page `FactionHitsGrid` owns
 *  fetching for itself. Also the standings refresh key: only a hit can change a standing, and the newest one
 *  is the cheapest signal that one landed, the same trick `LootPanel` uses for `useItemPrices`. */
const HITS_PROBE_QUERY: FactionHitsQuery = { offset: 0, limit: 1, sortField: "at", sortDesc: true };

export default function FactionPanel() {
  const [view, setView] = usePersistentState<View>(STORAGE_KEYS.factionView, "hits");
  const [hitSort, setHitSort] = usePersistentState<Sort<FactionHitSortKey>>(
    STORAGE_KEYS.factionHitSort,
    DEFAULT_FACTION_HIT_SORT,
  );
  const [standingSort, setStandingSort] = usePersistentState<Sort<FactionStandingSortKey>>(
    STORAGE_KEYS.factionStandingSort,
    DEFAULT_FACTION_STANDING_SORT,
  );

  const { page: hitsProbe } = useFactionHitsPage(HITS_PROBE_QUERY);
  const standings = useFactionStandings(hitsProbe.rows[0] ? factionKey(hitsProbe.rows[0]) : "");

  const combat = useCombatStats();
  const sessionStandings = useFactionStandingsSince(
    combat.startedAt,
    hitsProbe.rows[0] ? factionKey(hitsProbe.rows[0]) : "",
  );
  const shownSession = useMemo(
    () => sortFactionStandings(sessionStandings, standingSort),
    [sessionStandings, standingSort],
  );
  // What the session view's stat tiles lead with — "Raised"/"Lowered" are hit counts here, the same
  // thing those words already mean as the Standings table's own column headers, not a net delta summed
  // across factions that share no common scale.
  const sessionTotals = useMemo(
    () =>
      sessionStandings.reduce(
        (t, s) => ({
          raises: t.raises + s.raises,
          lowers: t.lowers + s.lowers,
          caps: t.caps + s.floors + s.ceilings,
        }),
        { raises: 0, lowers: 0, caps: 0 },
      ),
    [sessionStandings],
  );

  // Search narrows *which* factions show; the declared column sort still governs the order they show
  // in. Sorting before the fuzzy filter (the old order here) let the search silently override it —
  // `useFuzzyFilter`'s own re-ranking by match quality doesn't preserve the input order it was given,
  // so `StandingTable`'s `sortingMode="server"` header arrow kept claiming a sort the visible rows no
  // longer followed the moment a query was typed. Sorting the *matched* set instead keeps the arrow
  // honest whether or not a search is active.
  const { query: standingQuery, setQuery: setStandingQuery, filtered: matchedStandings } = useFuzzyFilter(
    standings,
    (s) => s.faction,
  );
  const shownStandings = useMemo(
    () => sortFactionStandings(matchedStandings, standingSort),
    [matchedStandings, standingSort],
  );

  return (
    <div className="tab-fill">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="segmented">
          <button
            className={segCls(view === "hits")}
            onClick={() => setView("hits")}
            title="Every faction-standing change on record, newest first — kept across restarts"
          >
            Hits
          </button>
          <button
            className={segCls(view === "standings")}
            onClick={() => setView("standings")}
            title="Every faction the ledger has a change for, folded to its net standing"
          >
            Standings{standings.length ? ` (${standings.length})` : ""}
          </button>
          <button
            className={segCls(view === "session")}
            onClick={() => setView("session")}
            title="Every faction changed since this session began — the same 'session' Combat and XP already mean (ADR 0019)"
          >
            Session
          </button>
          <button
            className={segCls(view === "unlocks")}
            onClick={() => setView("unlocks")}
            title="Which factions each race's unlock needs maxed, and how close your own log has seen you get"
          >
            Race Unlocks
          </button>
        </div>
        <span className="spacer" />
        {view === "standings" && standings.length > 0 && (
          <SearchField
            value={standingQuery}
            onChange={setStandingQuery}
            placeholder="Search factions…"
            title="Matches a faction's name — spelling need not be exact"
          />
        )}
        {view === "hits" && hitsProbe.total > 0 && <span className="muted small">{count(hitsProbe.total, "hit")}</span>}
        {view === "session" && (
          <>
            <span className="muted small">Since {clock(combat.startedAt, { seconds: true })}</span>
            <button
              className="btn ghost sm"
              onClick={resetSession}
              title="Clear the session counters app-wide (Combat, XP, Loot, and this view) — every hit stays on the ledger"
            >
              Reset session
            </button>
          </>
        )}
      </div>

      {/* `flex: 1; min-height: 0` so whichever view is open can fill whatever's left of the window
       *  instead of a fixed pixel height (ADR 0248/0249) — both `FactionHitsGrid` (unscoped) and
       *  `StandingTable` use it (`GRID_SX_FILL`); Race Unlocks and the empty state aren't `flex` children of their own,
       *  so they keep sizing to their own content and cost nothing here. */}
      <div className="tab-fill-body">
        {view === "unlocks" ? (
          <RaceUnlocksView standings={standings} />
        ) : view === "session" ? (
          <>
            <div className="stat-row" style={{ marginBottom: 12 }}>
              <StatTile label="Factions touched" value={sessionStandings.length} />
              <StatTile label="Raised" value={sessionTotals.raises} hint="Hits that stated a positive amount, this session" />
              <StatTile label="Lowered" value={sessionTotals.lowers} hint="Hits that stated a negative amount, this session" />
              {sessionTotals.caps > 0 && (
                <StatTile
                  label="Floor/ceiling hits"
                  value={sessionTotals.caps}
                  hint="Hits that stated no amount at all — already at the cap"
                />
              )}
            </div>
            <StandingTable
              standings={shownSession}
              sort={standingSort}
              onSort={setStandingSort}
              drillDown={false}
              emptyTitle="Nothing has changed a faction yet this session."
              emptyHint={`Since ${clock(combat.startedAt, { seconds: true })} — a hit appears here the moment the game logs one.`}
            />
          </>
        ) : hitsProbe.total === 0 ? (
          <Empty
            title="Nothing has raised or lowered a faction yet."
            hint="A hit appears here the moment the game says so — a quest turn-in, a kill that mattered to one side. The list is kept, so it will still be here next time you open the app."
          />
        ) : view === "hits" ? (
          <FactionHitsGrid sort={hitSort} onSort={setHitSort} />
        ) : standingQuery.trim() && shownStandings.length === 0 ? (
          <Empty
            title="No faction matches that."
            hint="Every faction the ledger has a change for is searched by name — try a shorter or different spelling."
          />
        ) : (
          <StandingTable standings={shownStandings} sort={standingSort} onSort={setStandingSort} />
        )}
      </div>
    </div>
  );
}

/** What the line stated, worded the way it would read in the log — a signed amount, or a cap. */
function changeLabel(e: FactionRecord): string {
  switch (e.direction) {
    case "raised":
      return `+${e.delta}`;
    case "lowered":
      return `${e.delta}`;
    case "floor":
      return "at floor";
    case "ceiling":
      return "at ceiling";
  }
}

/** Green for a raise, red for a drop — a cap is neither, since it states no amount. */
function changeClass(e: FactionRecord): string {
  if (e.direction === "raised") return "num-accent";
  if (e.direction === "lowered") return "num-bad";
  return "";
}

/** Why the ≈ prefix and the caveat: this cell is never a fact, only ever a guess from timing. */
function causeTitle(hit: FactionRecord): string {
  if (!hit.causedBy) return "Nothing landed close enough to guess a cause for this hit.";
  if (hit.causedBy.kind === "kill") {
    const apart = hit.causedBy.gapSec === 0 ? "in the same second" : `${count(Math.round(hit.causedBy.gapSec), "second")} apart`;
    return `Guessed from timing, not stated by the game: killing ${hit.causedBy.mob} logged ${apart} — this server often logs a kill's faction/XP/coin lines *before* its own "You have slain" text, so which one actually came first isn't assumed. Unverified — see ADR 0219 and ADR 0224.`;
  }
  const gap = hit.causedBy.gapSec === 0 ? "the same second" : count(Math.round(hit.causedBy.gapSec), "second") + " earlier";
  const quests = hit.causedBy.quests?.length
    ? hit.causedBy.questsMatched
      ? ` What was said reads like ${hit.causedBy.quests.join(" or ")} specifically — a second guess on top of the first, not a fact either.`
      : ` ${hit.causedBy.npc} is a known giver of ${hit.causedBy.quests.join(", ")} — nothing said narrowed it further, so every one of their quests is possible.`
    : "";
  return `Guessed from timing, not stated by the game: ${hit.causedBy.npc} said, "${hit.causedBy.text}" — ${gap}. Could be an NPC's reply, or just someone talking nearby — rare together, but nothing here can tell the two apart.${quests} Unverified — see ADR 0220, ADR 0221 and ADR 0223.`;
}

/** The inline parenthetical beside a dialogue cause's name — one quest plainly, several as a count,
 *  since a giver commonly hands out more than one and the row has no room to list them all.
 *  Prefixed "possibly" when nothing narrowed the giver's own list — a matched quest is a second guess
 *  that beat a real comparison, an unmatched one is just every quest that speaker happens to give. */
function questHint(quests: string[], matched: boolean): string {
  const label = quests.length === 1 ? quests[0] : `${quests[0]} +${quests.length - 1} more`;
  return matched ? label : `possibly ${label}`;
}

type HitRow = FactionRecord & { id: string };

/** Rows-per-page choices for the main Hits tab's footer, and which one it opens on. */
const HITS_PAGE_SIZES = [25, 50, 100];
const HITS_DEFAULT_PAGE_SIZE = 50;

/** Rows-per-page choices for the Standings drill-down's own Hits grid — smaller than the main Hits
 *  tab's, since one faction's slice of the ledger is a fraction of the whole thing. */
const STANDING_HITS_PAGE_SIZES = [10, 25, 50];
const STANDING_HITS_DEFAULT_PAGE_SIZE = 10;

/** The only fields the main Hits tab's columns declare — a filter item naming anything else
 *  (shouldn't happen; the grid only ever offers a column it was given) is dropped rather than
 *  forwarded. Moot for the Standings drill-down's own `FactionHitsGrid`, which skips the filter panel
 *  entirely (see `FactionHitsGrid` itself). Wider than `FactionHitSortKey` since `causeKind` and `raw`
 *  are filterable but not sortable (ADR 0260) — see `hitColumns`. */
const HIT_FILTER_FIELDS = new Set<FactionHitFilterField>(["at", "faction", "delta", "cause", "causeKind", "raw"]);

/** Converts the grid's own filter model into what `hitsPage` takes (ADR 0234) — same field names and
 *  operator strings, so this is a pass-through, not a translation. `faction-log.ts`'s own allow-list
 *  quietly skips any operator it doesn't implement or any item still missing a value, so nothing here
 *  duplicates that validation — it only drops a field the grid could never actually send. */
function toHitsFilter(model: GridFilterModel): FactionHitsFilter | undefined {
  const items: FactionHitFilterItem[] = model.items
    .filter((i) => HIT_FILTER_FIELDS.has(i.field as FactionHitFilterField))
    .map((i) => ({
      field: i.field as FactionHitFilterField,
      operator: i.operator as FactionHitFilterItem["operator"],
      value: i.value,
    }));
  if (!items.length) return undefined;
  return { items, logicOperator: model.logicOperator === "or" ? "or" : "and" };
}

/** The Hits grid's columns — identical in every place it's shown, the open ledger and the Standings
 *  drill-down's one-faction slice alike, right down to the Faction column that's redundant once
 *  scoped to a single faction: showing it anyway is the price of it actually being the same grid
 *  rather than one that merely looks similar. `sortable` turns off column sorting for the
 *  drill-down's fixed, newest-first order instead of the main tab's interactive, persisted one —
 *  the one difference `hitsPage`'s query shape doesn't currently let this collapse away too (its
 *  scope filter and a column's own filter aren't composable yet; see `FactionHitsGrid`). Source and
 *  Raw line stay unsortable either way — neither is a `FactionHitSortField` `hitsPage` knows how to
 *  order by — but both are filterable (ADR 0260): `hitsPage` filters `causeKind` against the same
 *  "Kill"/"Quest" label the Source column shows, and `raw` by plain substring match. */
function hitColumns(sortable: boolean): GridColDef<HitRow>[] {
  return [
    {
      field: "at",
      headerName: "Time",
      description: "When the log recorded it",
      sortable,
      flex: 1,
      minWidth: 130,
      valueGetter: (_v, row) => row.at,
      renderCell: (p) => <span className="lt-time">{dayTime(p.row.at)}</span>,
    },
    {
      field: "faction",
      headerName: "Faction",
      sortable,
      flex: 2,
      minWidth: 160,
      renderCell: (p) => <ItemLink title={p.row.faction} />,
    },
    {
      field: "delta",
      headerName: "Change",
      description: "What the line stated — a signed amount, or a floor/ceiling hit, which states none",
      sortable,
      ...NUM_COL,
      flex: 1,
      cellClassName: (p) => changeClass(p.row),
      renderCell: (p) => changeLabel(p.row),
    },
    {
      field: "causeKind",
      headerName: "Source",
      description: "Which kind of guessed cause this is — a kill, or a conversation that might be a quest turn-in",
      flex: 1,
      minWidth: 90,
      sortable: false,
      valueGetter: (_v, row) => causeKindLabel(row) ?? "",
      renderCell: (p) => {
        const hit = p.row;
        const label = causeKindLabel(hit);
        return label ? (
          <span className="fc-cause" title={causeTitle(hit)}>
            {label}
          </span>
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    {
      field: "cause",
      headerName: "Likely cause",
      description: "A guess from timing, not a fact the game states — see the ≈ on each row",
      sortable,
      flex: 3,
      minWidth: 220,
      valueGetter: (_v, row) => (row.causedBy ? causeSource(row) : ""),
      renderCell: (p) => {
        const hit = p.row;
        if (!hit.causedBy) return <span className="muted">—</span>;
        return (
          <span className="fc-cause" title={causeTitle(hit)}>
            <span className="fc-guess">≈</span> <ItemLink title={causeSource(hit)!} />
            {hit.causedBy.kind === "dialogue" && hit.causedBy.quests?.length ? (
              <span className="muted"> ({questHint(hit.causedBy.quests, hit.causedBy.questsMatched ?? false)})</span>
            ) : null}
          </span>
        );
      },
    },
    {
      field: "raw",
      headerName: "Raw line",
      description: "The original log line this hit was read from",
      // `hitsPage`'s sort allow-list doesn't know this field, but its filter one does (ADR 0260).
      sortable: false,
      flex: 3,
      minWidth: 220,
      cellClassName: "muted small",
    },
  ];
}

/**
 * Every faction-standing hit the ledger has, one page at a time (`hitsPage`, ADR 0234) — the main
 * Hits tab's open ledger when `faction` is left unset, or one faction's own slice when a Standings
 * row is expanded (`faction` set, `CauseBreakdown`'s caller). One component instead of the two
 * near-identical ones this used to be (`HitTable`, `FactionHitsForStanding`): same columns
 * (`hitColumns`, Faction included) and same row shape everywhere — just a narrower filter, smaller
 * pages, and a simpler, fixed sort once scoped to a single faction.
 */
function FactionHitsGrid({
  faction,
  sort = DEFAULT_FACTION_HIT_SORT,
  onSort,
}: {
  /** Scopes the grid to one faction — no interactive sort/filter (`sort`/`onSort` are ignored), the
   *  drill-down's smaller page sizes, and a "Hits (N)" label above it. Columns stay the same as the
   *  main Hits tab's, Faction included, even though every row here shares one. Left unset for the
   *  main Hits tab, which shows every faction with interactive, persisted sort and a real filter
   *  panel. */
  faction?: string;
  /** Ignored when `faction` is set — the drill-down's sort is always newest-first, which happens to
   *  be this prop's own default (`DEFAULT_FACTION_HIT_SORT`), so its caller doesn't pass one at all. */
  sort?: Sort<FactionHitSortKey>;
  /** Ignored (and safe to leave unset) when `faction` is set — nothing ever re-sorts a fixed grid. */
  onSort?: (next: Sort<FactionHitSortKey>) => void;
}) {
  const scoped = faction !== undefined;
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: scoped ? STANDING_HITS_DEFAULT_PAGE_SIZE : HITS_DEFAULT_PAGE_SIZE,
  });
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  // The component instance is reused across different Standings drill-downs (no `key` on it), so a
  // switch from one scoped faction to another has to reset the page itself — otherwise page 3 of a
  // faction with fewer hits than that renders blank instead of the new faction's first page.
  useEffect(() => {
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }, [faction]);

  const query = useMemo<FactionHitsQuery>(
    () => ({
      offset: paginationModel.page * paginationModel.pageSize,
      limit: paginationModel.pageSize,
      sortField: sort.key,
      sortDesc: sort.desc,
      filter:
        faction !== undefined
          ? { items: [{ field: "faction", operator: "equals", value: faction }], logicOperator: "and" }
          : toHitsFilter(filterModel),
    }),
    [faction, paginationModel, sort, filterModel],
  );
  const { page, loading } = useFactionHitsPage(query);
  const rows = useMemo<HitRow[]>(() => page.rows.map((hit) => ({ ...hit, id: factionKey(hit) })), [page.rows]);

  const columns = useMemo<GridColDef<HitRow>[]>(() => hitColumns(!scoped), [scoped]);

  // A re-sort changes what belongs on every page, including this one — the row that opened page 3
  // under the old order has no claim to still be there under the new one, so re-sorting also resets
  // pagination back to page 0. Never actually fires when scoped: every column is unsortable there.
  const { sortModel, onSortModelChange } = useGridSort(
    sort,
    onSort ?? (() => {}),
    (key) => key !== "faction" && key !== "cause",
    () => setPaginationModel((p) => ({ ...p, page: 0 })),
  );

  return (
    <div className={scoped ? "table-scroll" : "table-scroll grid-fill"}>
      {scoped && (
        <div className="muted small" style={{ marginBottom: 4 }}>
          Hits{page.total ? ` (${page.total})` : ""}
        </div>
      )}
      <DataGrid
        {...GRID_DEFAULTS}
        sx={scoped ? GRID_SX : GRID_SX_FILL}
        rows={rows}
        columns={columns}
        loading={loading}
        // A real "next page" instead of one long scroll, or fetching the whole ledger to page over
        // client-side — `faction-log.ts` keeps every hit forever (ADR 0232), so `hitsPage` is asked
        // for one page at a time instead. The "rows per page" choice is safe to offer for real (not
        // just a single fixed size) now that its popover-position bug is fixed at the root (ADR 0231).
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        rowCount={page.total}
        {...(scoped
          ? {}
          : {
              sortingMode: "server" as const,
              sortModel,
              onSortModelChange,
              // Reaches every hit the ledger holds, not just this page — ADR 0234. Same reason a
              // re-sort resets to page 0: a new filter changes what belongs on every page, including
              // this one.
              filterMode: "server" as const,
              filterModel,
              onFilterModelChange: (model: GridFilterModel) => {
                setFilterModel(model);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              },
            })}
        pageSizeOptions={scoped ? STANDING_HITS_PAGE_SIZES : HITS_PAGE_SIZES}
        initialState={{ columns: { columnVisibilityModel: hiddenByDefault("raw") } }}
      />
    </div>
  );
}

/** What produced a standing's net, for the hover — the raises/lowers/caps folded into it. */
function standingTitle(s: FactionStanding): string {
  const parts = [count(s.raises, "raise"), count(s.lowers, "lower")];
  if (s.floors) parts.push(count(s.floors, "floor hit"));
  if (s.ceilings) parts.push(count(s.ceilings, "ceiling hit"));
  return parts.join(", ");
}

/** How many causes to name before falling back to "and N more" — a standing built up over months
 *  could otherwise list a dozen one-off mobs and crowd out the two or three that actually matter. */
const MAX_CAUSES_SHOWN = 3;

function causeExtra(c: FactionCauseTally): string {
  const sign = c.net > 0 ? `+${c.net}` : c.net ? `${c.net}` : "";
  return sign ? ` (${sign})` : ` (${count(c.hits, "hit")})`;
}

type StandingRow = FactionStanding & { id: string };

function StandingTable({
  standings,
  sort,
  onSort,
  drillDown = true,
  emptyTitle = "No standings yet.",
  emptyHint = "Folded from the hits on the other view.",
}: {
  standings: FactionStanding[];
  sort: Sort<FactionStandingSortKey>;
  onSort: (next: Sort<FactionStandingSortKey>) => void;
  /** Off for the Session view: the ledger has no per-session *hit* query yet (`hitsPage` filters by
   *  faction, not by time), so a row's own drill-down would open onto that faction's whole lifetime of
   *  hits — a lie by omission under a "this session" heading. `CauseBreakdown`'s own "Likely causes"
   *  column still shows, already folded correctly to the session by `standingsSince`. */
  drillDown?: boolean;
  /** The empty state's wording — the Session view's own hits-since-session-start question isn't "the
   *  hits on the other view" the lifetime Standings view means by that. */
  emptyTitle?: string;
  emptyHint?: string;
}) {
  /** One breakdown open at a time — two of them side by side is a table, not a drill-down. */
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo<StandingRow[]>(() => standings.map((s) => ({ ...s, id: s.faction })), [standings]);

  const columns = useMemo<GridColDef<StandingRow>[]>(
    () => [
      {
        field: "faction",
        headerName: "Faction",
        flex: 2,
        minWidth: 160,
        renderCell: (p) => <ItemLink title={p.row.faction} />,
      },
      {
        field: "net",
        headerName: "Net",
        description: "Every stated delta, summed",
        ...NUM_COL,
        flex: 1,
        cellClassName: (p) => (p.row.net > 0 ? "num-accent" : p.row.net < 0 ? "num-bad" : ""),
        renderCell: (p) => (
          <span title={standingTitle(p.row)}>{p.row.net > 0 ? `+${p.row.net}` : p.row.net}</span>
        ),
      },
      {
        field: "raises",
        headerName: "Raised",
        description: "Hits that stated a positive amount",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num",
      },
      {
        field: "lowers",
        headerName: "Lowered",
        description: "Hits that stated a negative amount",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num",
      },
      {
        field: "floors",
        headerName: "Floor hits",
        description: "Hits at the bottom, which states no amount",
        ...NUM_COL,
        flex: 1,
        sortable: false,
        cellClassName: "lt-num",
      },
      {
        field: "ceilings",
        headerName: "Ceiling hits",
        description: "Hits at the top, which states no amount",
        ...NUM_COL,
        flex: 1,
        sortable: false,
        cellClassName: "lt-num",
      },
      {
        field: "firstAt",
        headerName: "First hit",
        flex: 1,
        minWidth: 130,
        sortable: false,
        cellClassName: "lt-time",
        renderCell: (p) => <span title={when(p.row.firstAt)}>{dayTime(p.row.firstAt)}</span>,
      },
      {
        field: "observedNet",
        headerName: "Ledger-observed",
        description: "What the ledger alone has seen for this faction, live — Net above already has your stated correction folded in on top of it",
        ...NUM_COL,
        flex: 1,
        sortable: false,
        valueGetter: (_v, row) => row.correction?.observedNet,
        renderCell: (p) => p.value ?? "—",
      },
      {
        field: "correctedAt",
        headerName: "Corrected at",
        flex: 1,
        minWidth: 130,
        sortable: false,
        cellClassName: "lt-time",
        valueGetter: (_v, row) => row.correction?.correctedAt,
        renderCell: (p) => (p.value ? <span title={when(p.value)}>{dayTime(p.value)}</span> : "—"),
      },
      {
        field: "rate",
        headerName: "Net / hour",
        description: "Net change per hour between the first and last hit on record",
        ...NUM_COL,
        flex: 1,
        cellClassName: "lt-num muted",
        valueGetter: (_v, row) => ratePerHour(row),
        renderCell: (p) => (p.value ? (p.value > 0 ? `+${p.value}` : p.value) : "—"),
      },
      {
        field: "causes",
        headerName: "Likely causes",
        description: drillDown
          ? "A guess from timing, not a fact the game states — a mob's kill or a nearby conversation that landed shortly before one or more hits (ADR 0219, ADR 0220). Click a row for the full breakdown, kills and quests apart."
          : "A guess from timing, not a fact the game states — a mob's kill or a nearby conversation that landed shortly before one or more hits this session (ADR 0219, ADR 0220).",
        flex: 3,
        minWidth: 220,
        sortable: false,
        valueGetter: (_v, row) => row.causes.map((c) => c.source).join(" "),
        renderCell: (p) => {
          const shown = p.row.causes.slice(0, MAX_CAUSES_SHOWN);
          const hidden = p.row.causes.length - shown.length;
          if (!shown.length) return <span className="muted">—</span>;
          return (
            <span className="fc-cause">
              <span className="fc-guess">≈</span>{" "}
              <NameList names={shown.map((c) => c.source)} extra={(_, i) => causeExtra(shown[i])} />
              {hidden > 0 && <span className="muted"> +{hidden} more</span>}
            </span>
          );
        },
      },
      {
        field: "lastAt",
        headerName: "Last hit",
        flex: 1,
        minWidth: 130,
        cellClassName: "lt-time",
        renderCell: (p) => <span title={when(p.row.lastAt)}>{dayTime(p.row.lastAt)}</span>,
      },
    ],
    [drillDown],
  );

  // Computed before the early return below: a hook can't be called conditionally.
  const { sortModel, onSortModelChange } = useGridSort(sort, onSort, (key) => key !== "faction");

  if (standings.length === 0) {
    return <Empty title={emptyTitle} hint={emptyHint} />;
  }

  const openStanding = drillDown && open ? standings.find((s) => s.faction === open) : undefined;

  return (
    <div className="table-scroll grid-fill">
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX_FILL}
        rows={rows}
        columns={columns}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        disableRowSelectionOnClick
        rowSelectionModel={{ type: "include", ids: new Set(openStanding ? [open as string] : []) }}
        onRowClick={
          drillDown ? (params) => setOpen((prev) => (prev === params.id ? null : (params.id as string))) : undefined
        }
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        initialState={{
          pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } },
          columns: {
            columnVisibilityModel: hiddenByDefault("floors", "ceilings", "firstAt", "observedNet", "correctedAt"),
          },
        }}
      />
      {openStanding && <CauseBreakdown standing={openStanding} />}
    </div>
  );
}

/** The full breakdown behind a standing's `net` — the actual hits first (`FactionHitsGrid`, scoped to
 *  this faction, the real ledger rows front and center rather than another click away), the guessed
 *  likely-cause tally underneath it (`CauseGroup`s — kills and conversations are different kinds of
 *  guess, ADR 0219 vs. ADR 0220/0221, so they stay apart rather than folding into one capped "+N more"
 *  line). */
function CauseBreakdown({ standing }: { standing: FactionStanding }) {
  const { causes, faction } = standing;
  const kills = causes.filter((c) => c.kind === "kill");
  const quests = causes.filter((c) => c.kind === "dialogue");
  return (
    <div className="cause-breakdown">
      <FactionHitsGrid faction={faction} />
      {kills.length > 0 && <CauseGroup label="Kills" causes={kills} />}
      {quests.length > 0 && <CauseGroup label="Quests" causes={quests} />}
      {!kills.length && !quests.length && (
        <div className="muted small">Nothing has been correlated to a kill or a conversation yet.</div>
      )}
    </div>
  );
}

/** One kind's causes, independently openable — collapsed to a summary line until asked, since a
 *  standing built up over months could otherwise open with a wall of one-off mobs or NPCs. Already
 *  sorted biggest `|net|` first by the ledger itself (`FactionStanding.causes`). */
function CauseGroup({ label, causes }: { label: string; causes: FactionCauseTally[] }) {
  return (
    <details className="cause-group">
      <summary>
        {label} <span className="muted small">({count(causes.length, causes[0]?.kind === "kill" ? "mob" : "conversation")})</span>
      </summary>
      <div className="cause-list">
        {causes.map((c) => (
          <span
            className={`cause-item ${causeConfidence(c)}`}
            key={`${c.kind}-${c.source}`}
            title={causeConfidenceWhy(c)}
          >
            <ItemLink title={c.source} />
            <span className="muted small">{causeExtra(c)}</span>
          </span>
        ))}
      </div>
    </details>
  );
}
