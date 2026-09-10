"use client";
import { useMemo } from "react";
import { useFactionFeed, useFactionStandings } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { factionKey } from "@/shared/faction-feed";
import {
  DEFAULT_FACTION_HIT_SORT,
  DEFAULT_FACTION_STANDING_SORT,
  sortFactionHits,
  sortFactionStandings,
  type FactionHitSortKey,
  type FactionStandingSortKey,
} from "@/shared/faction-sort";
import { ratio } from "@/shared/numbers";
import { clock, count, when } from "@/shared/format";
import type { Sort } from "@/shared/sorting";
import type { FactionEvent, FactionStanding } from "@/shared/types";
import ItemLink from "./ItemLink";
import SortHeader from "./SortHeader";
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
 * Names are `ItemLink`s, so a faction opens its own wiki page — the raise/lower quests and mobs
 * ([ADR 0192](../../../specs/decisions/0192-factions-ride-their-own-wiki-pages.md)) sit one click away
 * from what your own log says actually moved it.
 */
type View = "hits" | "standings";

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

  const hits = useFactionFeed(200);
  // Only a hit can change a standing, and the newest one is the cheapest signal that one landed —
  // the same trick `LootPanel` uses to key `useItemPrices`'s refetch off the newest drop.
  const standings = useFactionStandings(hits[0] ? factionKey(hits[0]) : "");

  const sortedHits = useMemo(() => sortFactionHits(hits, hitSort), [hits, hitSort]);
  const sortedStandings = useMemo(() => sortFactionStandings(standings, standingSort), [standings, standingSort]);

  if (hits.length === 0) {
    return (
      <Empty
        title="Nothing has raised or lowered a faction yet."
        hint="A hit appears here the moment the game says so — a quest turn-in, a kill that mattered to one side. The list is kept, so it will still be here next time you open the app."
      />
    );
  }

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
        </div>
        <span className="spacer" />
        {view === "hits" && <span className="muted small">{count(hits.length, "hit")}</span>}
      </div>

      {view === "hits" ? (
        <HitTable hits={sortedHits} sort={hitSort} onSort={setHitSort} />
      ) : (
        <StandingTable standings={sortedStandings} sort={standingSort} onSort={setStandingSort} />
      )}
    </div>
  );
}

/** What the line stated, worded the way it would read in the log — a signed amount, or a cap. */
function changeLabel(e: FactionEvent): string {
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
function changeClass(e: FactionEvent): string | undefined {
  if (e.direction === "raised") return "num-accent";
  if (e.direction === "lowered") return "num-bad";
  return undefined;
}

function HitTable({
  hits,
  sort,
  onSort,
}: {
  hits: FactionEvent[];
  sort: Sort<FactionHitSortKey>;
  onSort: (next: Sort<FactionHitSortKey>) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="stat-table faction-table">
        <thead>
          <tr>
            <SortHeader label="Time" column="at" sort={sort} onSort={onSort} title="When the log recorded it" />
            <SortHeader label="Faction" column="faction" sort={sort} onSort={onSort} startDesc={false} />
            <SortHeader
              label="Change"
              column="delta"
              sort={sort}
              onSort={onSort}
              title="What the line stated — a signed amount, or a floor/ceiling hit, which states none"
            />
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr key={factionKey(hit)}>
              <td className="lt-time">{clock(hit.at)}</td>
              <td>
                <ItemLink title={hit.faction} />
              </td>
              <td className={changeClass(hit)}>{changeLabel(hit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Net change per hour between the first and last hit on record — the same "part over elapsed
 *  hours" `SessionPanel`'s `coinPerHour` uses (ADR 0047), computed here rather than stored so it
 *  can never drift from the totals it's derived from. Zero (not a lie) while there's only one hit. */
function ratePerHour(s: FactionStanding): number {
  const spanHours = (Date.parse(s.lastAt) - Date.parse(s.firstAt)) / 3_600_000;
  return ratio(s.net, spanHours, 1);
}

/** What produced a standing's net, for the hover — the raises/lowers/caps folded into it. */
function standingTitle(s: FactionStanding): string {
  const parts = [count(s.raises, "raise"), count(s.lowers, "lower")];
  if (s.floors) parts.push(count(s.floors, "floor hit"));
  if (s.ceilings) parts.push(count(s.ceilings, "ceiling hit"));
  return parts.join(", ");
}

function StandingTable({
  standings,
  sort,
  onSort,
}: {
  standings: FactionStanding[];
  sort: Sort<FactionStandingSortKey>;
  onSort: (next: Sort<FactionStandingSortKey>) => void;
}) {
  if (standings.length === 0) {
    return <Empty title="No standings yet." hint="Folded from the hits on the other view." />;
  }
  return (
    <div className="table-scroll">
      <table className="stat-table faction-table">
        <thead>
          <tr>
            <SortHeader label="Faction" column="faction" sort={sort} onSort={onSort} startDesc={false} />
            <SortHeader label="Net" column="net" sort={sort} onSort={onSort} title="Every stated delta, summed" />
            <SortHeader label="Raised" column="raises" sort={sort} onSort={onSort} title="Hits that stated a positive amount" />
            <SortHeader label="Lowered" column="lowers" sort={sort} onSort={onSort} title="Hits that stated a negative amount" />
            <th title="Net change per hour between the first and last hit on record">Net / hour</th>
            <SortHeader label="Last hit" column="lastAt" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const rate = ratePerHour(s);
            return (
              <tr key={s.faction}>
                <td>
                  <ItemLink title={s.faction} />
                </td>
                <td className={s.net > 0 ? "num-accent" : s.net < 0 ? "num-bad" : undefined} title={standingTitle(s)}>
                  {s.net > 0 ? `+${s.net}` : s.net}
                </td>
                <td className="lt-num">{s.raises}</td>
                <td className="lt-num">{s.lowers}</td>
                <td className="lt-num muted">{rate ? (rate > 0 ? `+${rate}` : rate) : "—"}</td>
                <td className="lt-time" title={when(s.lastAt)}>
                  {clock(s.lastAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
