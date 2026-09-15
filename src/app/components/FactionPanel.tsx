"use client";
import { useMemo, useState } from "react";
import { DataGrid, type GridColDef, type GridSortModel } from "@mui/x-data-grid";
import { useFactionFeed, useFactionStandings } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { causeConfidence, causeConfidenceWhy } from "@/shared/faction-cause";
import { factionKey } from "@/shared/faction-feed";
import {
  DEFAULT_FACTION_HIT_SORT,
  DEFAULT_FACTION_STANDING_SORT,
  causeSource,
  ratePerHour,
  sortFactionHits,
  sortFactionStandings,
  type FactionHitSortKey,
  type FactionStandingSortKey,
} from "@/shared/faction-sort";
import { clock, count, when } from "@/shared/format";
import { nextSort, type Sort } from "@/shared/sorting";
import type { FactionCauseTally, FactionRecord, FactionStanding } from "@/shared/types";
import ItemLink, { NameList } from "./ItemLink";
import RaceUnlocksView from "./RaceUnlocksView";
import { GRID_DEFAULTS, GRID_SX, NUM_COL } from "./dataGridDefaults";
import { Empty, segCls } from "./ui";

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
 * Both tables are `DataGrid`s — sortable and filterable on every column.
 *
 * **Hits pages back through the whole ledger, not just the most recent 200.** The feed used to be
 * fetched once at a flat 200-row cap with nowhere further to go; it's now fetched with no cut-off of
 * its own (`HITS_FETCH_LIMIT` — the ledger's own retention, `MAX_FACTION` in `electron/faction-log.ts`,
 * is the real limit), and `HitTable` turns its grid's footer back on with a real "rows per page"
 * choice and page arrows. `dataGridDefaults.ts`'s `GRID_DEFAULTS` still hides the footer on every
 * other table — none of them were designed to page, `autoHeight` already draws every row — but the
 * footer itself is no longer something to avoid: its "rows per page" `Select` used to misposition
 * under this app's CSS-`zoom` scaling, fixed at the root by moving the zoom onto the window's own
 * shell instead of the document root ([ADR 0231](../../../specs/decisions/0231-the-zoom-root-moves-inside-the-shell.md)).
 *
 * **A third view, Race Unlocks** (`RaceUnlocksView`), folds the live Standings onto Alanna's Race
 * Unlock Guide ([ADR 0222](../../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md))
 * — which factions each race needs maxed, the quests that raise them, and how close the ledger has
 * seen you get. Unlike the other two, it's useful with zero hits recorded (it's reference data, not a
 * ledger), so it's the one view the empty state below doesn't gate.
 */
type View = "hits" | "standings" | "unlocks";

/** Ask the ledger for everything it's holding rather than an arbitrary cut-off — `HitTable` pages
 *  through it, so unlike a flat list there's no cap worth guessing at here; the feed's own retention
 *  (`MAX_FACTION`, `electron/faction-log.ts`) is the real limit, whatever it happens to be. */
const HITS_FETCH_LIMIT = Number.MAX_SAFE_INTEGER;

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

  const hits = useFactionFeed(HITS_FETCH_LIMIT);
  // Only a hit can change a standing, and the newest one is the cheapest signal that one landed —
  // the same trick `LootPanel` uses to key `useItemPrices`'s refetch off the newest drop.
  const standings = useFactionStandings(hits[0] ? factionKey(hits[0]) : "");

  const sortedHits = useMemo(() => sortFactionHits(hits, hitSort), [hits, hitSort]);
  const sortedStandings = useMemo(() => sortFactionStandings(standings, standingSort), [standings, standingSort]);

  return (
    <div>
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
            className={segCls(view === "unlocks")}
            onClick={() => setView("unlocks")}
            title="Which factions each race's unlock needs maxed, and how close your own log has seen you get"
          >
            Race Unlocks
          </button>
        </div>
        <span className="spacer" />
        {view === "hits" && hits.length > 0 && <span className="muted small">{count(hits.length, "hit")}</span>}
      </div>

      {view === "unlocks" ? (
        <RaceUnlocksView standings={standings} />
      ) : hits.length === 0 ? (
        <Empty
          title="Nothing has raised or lowered a faction yet."
          hint="A hit appears here the moment the game says so — a quest turn-in, a kill that mattered to one side. The list is kept, so it will still be here next time you open the app."
        />
      ) : view === "hits" ? (
        <HitTable hits={sortedHits} sort={hitSort} onSort={setHitSort} />
      ) : (
        <StandingTable standings={sortedStandings} sort={standingSort} onSort={setStandingSort} />
      )}
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

/** Rows-per-page choices for the Hits grid's footer, and which one it opens on. */
const HITS_PAGE_SIZES = [25, 50, 100];
const HITS_DEFAULT_PAGE_SIZE = 50;

function HitTable({
  hits,
  sort,
  onSort,
}: {
  hits: FactionRecord[];
  sort: Sort<FactionHitSortKey>;
  onSort: (next: Sort<FactionHitSortKey>) => void;
}) {
  const rows = useMemo<HitRow[]>(() => hits.map((hit) => ({ ...hit, id: factionKey(hit) })), [hits]);

  const columns = useMemo<GridColDef<HitRow>[]>(
    () => [
      {
        field: "at",
        headerName: "Time",
        description: "When the log recorded it",
        flex: 1,
        valueGetter: (_v, row) => row.at,
        renderCell: (p) => <span className="lt-time">{clock(p.row.at)}</span>,
      },
      {
        field: "faction",
        headerName: "Faction",
        flex: 2,
        minWidth: 160,
        renderCell: (p) => <ItemLink title={p.row.faction} />,
      },
      {
        field: "delta",
        headerName: "Change",
        description: "What the line stated — a signed amount, or a floor/ceiling hit, which states none",
        ...NUM_COL,
        flex: 1,
        cellClassName: (p) => changeClass(p.row),
        renderCell: (p) => changeLabel(p.row),
      },
      {
        field: "cause",
        headerName: "Likely cause",
        description: "A guess from timing, not a fact the game states — see the ≈ on each row",
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
    ],
    [],
  );

  const sortModel: GridSortModel = [{ field: sort.key, sort: sort.desc ? "desc" : "asc" }];

  return (
    <div className="table-scroll">
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        rows={rows}
        columns={columns}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={(model) => {
          const key = (model[0]?.field ?? sort.key) as FactionHitSortKey;
          onSort(nextSort(sort, key, key !== "faction" && key !== "cause"));
        }}
        // A real "next page" instead of one long scroll, now that `hits` reaches back through the
        // whole ledger rather than a flat 200-row cut-off (see the module header) — with a genuine
        // choice of page size, now that the "rows per page" `Select`'s popover-position bug is fixed
        // at its root (ADR 0231) rather than sidestepped.
        hideFooter={false}
        pageSizeOptions={HITS_PAGE_SIZES}
        initialState={{ pagination: { paginationModel: { pageSize: HITS_DEFAULT_PAGE_SIZE, page: 0 } } }}
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
}: {
  standings: FactionStanding[];
  sort: Sort<FactionStandingSortKey>;
  onSort: (next: Sort<FactionStandingSortKey>) => void;
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
        description:
          "A guess from timing, not a fact the game states — a mob's kill or a nearby conversation that landed shortly before one or more hits (ADR 0219, ADR 0220). Click a row for the full breakdown, kills and quests apart.",
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
        cellClassName: "lt-time",
        renderCell: (p) => <span title={when(p.row.lastAt)}>{clock(p.row.lastAt)}</span>,
      },
    ],
    [],
  );

  if (standings.length === 0) {
    return <Empty title="No standings yet." hint="Folded from the hits on the other view." />;
  }

  const sortModel: GridSortModel = [{ field: sort.key, sort: sort.desc ? "desc" : "asc" }];
  const openStanding = open ? standings.find((s) => s.faction === open) : undefined;

  return (
    <div className="table-scroll">
      <DataGrid
        {...GRID_DEFAULTS}
        sx={GRID_SX}
        rows={rows}
        columns={columns}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={(model) => {
          const key = (model[0]?.field ?? sort.key) as FactionStandingSortKey;
          onSort(nextSort(sort, key, key !== "faction"));
        }}
        disableRowSelectionOnClick
        rowSelectionModel={{ type: "include", ids: new Set(open ? [open] : []) }}
        onRowClick={(params) => setOpen((prev) => (prev === params.id ? null : (params.id as string)))}
      />
      {openStanding && <CauseBreakdown causes={openStanding.causes} />}
    </div>
  );
}

/** The full likely-cause breakdown behind a standing's `net` — every kill and every conversation the
 *  ledger has correlated to it, kills and quests kept apart (they're different kinds of guess, ADR
 *  0219 vs. ADR 0220/0221) rather than folded into one capped "+N more" line with nowhere to go. */
function CauseBreakdown({ causes }: { causes: FactionCauseTally[] }) {
  const kills = causes.filter((c) => c.kind === "kill");
  const quests = causes.filter((c) => c.kind === "dialogue");
  if (!kills.length && !quests.length) {
    return <div className="muted small">Nothing has been correlated to a kill or a conversation yet.</div>;
  }
  return (
    <div className="cause-breakdown">
      {kills.length > 0 && <CauseGroup label="Kills" causes={kills} />}
      {quests.length > 0 && <CauseGroup label="Quests" causes={quests} />}
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
