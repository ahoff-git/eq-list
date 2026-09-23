/**
 * faction-log.ts — a running record of what has raised or lowered your faction standing, kept in
 * the main process so it's complete whether or not the Faction tab is open.
 *
 * Mirrors [loot-log.ts](./loot-log.ts): the watcher hands every parsed hit here (as a `FactionRecord`
 * — the event plus the ledger's own guess at what caused it, from `faction-cause.ts`), the tab reads
 * the history on open and follows live ones after. Eating a past log feeds this too, for the same
 * reason loot does (ADR 0055) — every hit is keyed by its log line, which is what makes that safe to
 * do twice (ADR 0033).
 *
 * Deliberately its own store rather than a branch of loot-log.ts: a faction hit is not a drop, needs
 * no zone (a standing is a fact about your character, not about where you were standing when the
 * game told you about it — ADR 0136 has nothing to attach to here), and folds to a **net delta** per
 * faction rather than a count.
 *
 * **Backed by SQLite, not a capped JSON array (ADR 0232).** The ledger keeps every hit forever —
 * there is no cap to evict past — and `standings()` is one `GROUP BY faction` query rather than an
 * incrementally-maintained fold. The one place the old `retired` idea survives is `clear("records")`:
 * asked to forget the hits but keep what they taught, it freezes the current merged standings into
 * `faction_standings_frozen` (a snapshot, not an eviction side effect) and only then deletes the
 * hits — the same "a standing outlives the hits that built it" rule (ADR 0056), just triggered by
 * the player asking rather than by a feed filling up.
 *
 * **`faction-log.json` still exists, but only as a provenance stamp.** `data-health.ts` and
 * `log-reread.ts`'s unattended-re-read mechanism (ADR 0129) read this file's `provenance` field
 * directly off disk, independent of this store — that contract belongs to `DATA_CONCERNS`, not to
 * how the hits themselves are kept, so moving them into SQL doesn't touch it. The file goes on
 * existing as a tiny stub carrying nothing but the stamp, rewritten (still debounced, still through
 * `json-store.ts`) on every mutation exactly as before a migrated-away file would read as
 * `state: "absent"` forever — not stale, not current, just silently un-checked — which would
 * quietly disable the self-healing re-read for this concern the moment it upgraded.
 *
 * **`hitsPage`'s filter reaches the whole ledger, not just the page already fetched** (ADR 0234) —
 * the main Hits tab's `FactionHitsGrid` (the Standings drill-down skips its filter panel, already
 * scoped to one faction) hands its `GridFilterModel` straight through as a `FactionHitsFilter`, and
 * `buildFilterSql` turns it into one parameterized `WHERE` fragment: every value travels as a bound
 * `?` parameter, and only a fixed column name (`HIT_FILTER_COLUMNS`) or operator keyword is ever
 * written into the SQL text. A million-hit ledger with 1% "Mistmoore" in it can otherwise never
 * surface the other 999,000 by scrolling through whatever page happens to be open.
 */
import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { createLogger } from "../src/shared/logging";
import type { AdminAudit, AdminScalar } from "../src/shared/admin";
import type { DataStamp } from "../src/shared/data-provenance";
import type {
  FactionCause,
  FactionCauseTally,
  FactionDirection,
  FactionHitFilterField,
  FactionHitFilterItem,
  FactionHitSortField,
  FactionHitsFilter,
  FactionHitsPage,
  FactionHitsQuery,
  FactionRecord,
  FactionStanding,
  ForgetScope,
} from "../src/shared/types";
import { questsForSpeaker, type FactionCauseTrackerDeps } from "../src/shared/faction-cause";
import { createSaver, readJson, writeJson } from "./json-store";
import { DEFAULT_LIMIT, likeEscape, type Migration } from "./sqlite-store";
import { createSqlAdminStore, type AdminStore } from "./admin";

const log = createLogger("faction-log");

/** Hits arrive in bursts; coalesce the provenance-stamp writes the same way the old full-file saver
 *  did. */
const WRITE_DEBOUNCE_MS = 3000;

export type FactionAdded = "added" | "known";

/**
 * A faction hit's identity: the log line behind it, the same rule a drop is keyed by (ADR 0033).
 * Two hits against the same faction, in the same direction, for the same amount, in the same
 * logged second collapse into one — the same trade loot's own key makes, and under-counting is the
 * safer way to be wrong. Deliberately excludes `causedBy`: it's a guess about the same line, not
 * part of what the line *is*, so it must never make one hit look like two.
 */
const factionKey = (e: FactionRecord): string => `${e.at} ${e.faction.toLowerCase()} ${e.direction} ${e.delta ?? ""}`;

export const FACTION_LOG_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    label: "faction_hits",
    up(db) {
      db.exec(`
        CREATE TABLE faction_hits (
          key TEXT PRIMARY KEY,
          at TEXT NOT NULL,
          faction TEXT NOT NULL,
          direction TEXT NOT NULL,
          delta INTEGER,
          caused_by_kind TEXT,
          caused_by_source TEXT,
          caused_by_gap_sec REAL,
          caused_by_text TEXT,
          caused_by_quests TEXT,
          caused_by_quests_matched INTEGER,
          raw TEXT NOT NULL,
          log_id INTEGER NOT NULL,
          admin_audit TEXT
        );
        CREATE INDEX faction_hits_faction_idx ON faction_hits(faction);
        CREATE INDEX faction_hits_at_idx ON faction_hits(at);

        CREATE TABLE faction_standings_frozen (
          faction TEXT PRIMARY KEY,
          net INTEGER NOT NULL,
          raises INTEGER NOT NULL,
          lowers INTEGER NOT NULL,
          floors INTEGER NOT NULL,
          ceilings INTEGER NOT NULL,
          first_at TEXT NOT NULL,
          last_at TEXT NOT NULL,
          causes_json TEXT NOT NULL
        );
      `);
    },
  },
];

/** A `FactionCause` flattened to the columns `faction_hits` stores it in. */
interface CauseRow {
  kind: string | null;
  source: string | null;
  gapSec: number | null;
  text: string | null;
  quests: string | null;
  questsMatched: number | null;
}

function causeToRow(c: FactionCause | undefined): CauseRow {
  if (!c) return { kind: null, source: null, gapSec: null, text: null, quests: null, questsMatched: null };
  if (c.kind === "kill") {
    return { kind: "kill", source: c.mob, gapSec: c.gapSec, text: null, quests: null, questsMatched: null };
  }
  return {
    kind: "dialogue",
    source: c.npc,
    gapSec: c.gapSec,
    text: c.text,
    quests: c.quests ? JSON.stringify(c.quests) : null,
    questsMatched: c.questsMatched === undefined ? null : c.questsMatched ? 1 : 0,
  };
}

interface HitRow {
  key: string;
  at: string;
  faction: string;
  direction: FactionDirection;
  delta: number | null;
  caused_by_kind: string | null;
  caused_by_source: string | null;
  caused_by_gap_sec: number | null;
  caused_by_text: string | null;
  caused_by_quests: string | null;
  caused_by_quests_matched: number | null;
  raw: string;
  log_id: number;
  admin_audit: string | null;
}

function rowToCause(r: HitRow): FactionCause | undefined {
  if (!r.caused_by_kind) return undefined;
  if (r.caused_by_kind === "kill") return { kind: "kill", mob: r.caused_by_source!, gapSec: r.caused_by_gap_sec! };
  return {
    kind: "dialogue",
    npc: r.caused_by_source!,
    text: r.caused_by_text!,
    gapSec: r.caused_by_gap_sec!,
    ...(r.caused_by_quests ? { quests: JSON.parse(r.caused_by_quests) as string[] } : {}),
    ...(r.caused_by_quests_matched !== null ? { questsMatched: !!r.caused_by_quests_matched } : {}),
  };
}

function rowToRecord(r: HitRow): FactionRecord {
  const causedBy = rowToCause(r);
  return {
    kind: "faction",
    logId: r.log_id,
    raw: r.raw,
    at: r.at,
    faction: r.faction,
    delta: r.delta,
    direction: r.direction,
    ...(causedBy ? { causedBy } : {}),
  };
}

/** Biggest `|net|` leads, ties broken by hit count — the order every cause rollup presents in,
 *  whether merged from two pre-summed arrays (`mergeCauseTallies`) or built fresh over a time-scoped
 *  slice of the live table (`computeStandingsSince`). */
function byCauseImpact(a: FactionCauseTally, b: FactionCauseTally): number {
  return Math.abs(b.net) - Math.abs(a.net) || b.hits - a.hits;
}

/** Fold two (already-aggregated) sets of per-cause tallies into one, biggest `|net|` first — the
 *  same rule `foldCause` folded one event at a time, now combining two small pre-summed arrays (the
 *  live hits' own rollup and whatever a past `clear("records")` already froze) instead of scanning
 *  every hit on every read. */
function mergeCauseTallies(a: readonly FactionCauseTally[], b: readonly FactionCauseTally[]): FactionCauseTally[] {
  const byKey = new Map<string, FactionCauseTally>();
  for (const c of [...a, ...b]) {
    const key = `${c.kind}:${c.source}`;
    const cur = byKey.get(key) ?? { kind: c.kind, source: c.source, net: 0, hits: 0 };
    cur.net += c.net;
    cur.hits += c.hits;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort(byCauseImpact);
}

/** Columns/expressions `hitsPage` may sort by — an allow-list, so a caller's sort field is never
 *  interpolated into SQL as anything but one of these fixed strings. */
const HIT_SORT_COLUMNS: Record<FactionHitSortField, string> = {
  at: "at",
  faction: "LOWER(faction)",
  delta: "delta",
  cause: "LOWER(caused_by_source)",
};

/** Which SQL column (or fixed expression) backs each filterable field, and whether it's compared as
 *  text or a number — the same allow-list discipline as `HIT_SORT_COLUMNS`, so a filter's `field` can
 *  never become anything but one of these fixed expressions. `cause` filters by `caused_by_source`
 *  directly: that's the same column `causeSource` (`faction-sort.ts`) reads to produce the grid's
 *  `cause` value in the first place, just not yet lowercased/joined with the kill-vs-dialogue label
 *  the cell renders. `causeKind` has no column of its own — `caused_by_kind` stores `"kill"`/
 *  `"dialogue"`, not the "Kill"/"Quest" label `causeKindLabel` (`faction-sort.ts`) renders — so it
 *  filters against a `CASE` that reproduces that label in SQL instead (ADR 0260), matching what the
 *  Source column actually shows rather than the raw stored kind. */
const HIT_FILTER_COLUMNS: Record<FactionHitFilterField, { column: string; kind: "text" | "number" }> = {
  at: { column: "at", kind: "text" },
  faction: { column: "faction", kind: "text" },
  delta: { column: "delta", kind: "number" },
  cause: { column: "caused_by_source", kind: "text" },
  causeKind: { column: "(CASE caused_by_kind WHEN 'kill' THEN 'Kill' WHEN 'dialogue' THEN 'Quest' ELSE NULL END)", kind: "text" },
  raw: { column: "raw", kind: "text" },
};

/** One filter item's SQL fragment plus its bound params, or `null` if it can't produce a clause yet —
 *  no value typed, an empty `isAnyOf` list, or an operator that doesn't apply to the field's kind (the
 *  grid can hand any of these through mid-edit, so skipping quietly is correct, not an error). Every
 *  value travels as a bound parameter; only the column name (from the allow-list above) and a fixed
 *  operator keyword are ever concatenated into the SQL text itself. */
function filterItemSql(item: FactionHitFilterItem): { sql: string; params: unknown[] } | null {
  const col = HIT_FILTER_COLUMNS[item.field];
  if (!col) return null;

  if (item.operator === "isEmpty") return { sql: `${col.column} IS NULL`, params: [] };
  if (item.operator === "isNotEmpty") return { sql: `${col.column} IS NOT NULL`, params: [] };

  if (item.operator === "isAnyOf") {
    const values = Array.isArray(item.value) ? item.value : [];
    if (!values.length) return null;
    if (col.kind === "number") {
      const nums = values.map(Number).filter(Number.isFinite);
      if (!nums.length) return null;
      return { sql: `${col.column} IN (${nums.map(() => "?").join(", ")})`, params: nums };
    }
    return {
      sql: `LOWER(${col.column}) IN (${values.map(() => "LOWER(?)").join(", ")})`,
      params: values.map(String),
    };
  }

  if (item.value === undefined || item.value === null || item.value === "") return null;

  if (col.kind === "number") {
    const n = Number(item.value);
    if (!Number.isFinite(n)) return null;
    const numOps: Partial<Record<string, string>> = { "=": "=", "!=": "!=", ">": ">", ">=": ">=", "<": "<", "<=": "<=" };
    const op = numOps[item.operator];
    return op ? { sql: `${col.column} ${op} ?`, params: [n] } : null;
  }

  const v = String(item.value);
  switch (item.operator) {
    case "contains":
      return { sql: `LOWER(${col.column}) LIKE LOWER(?) ESCAPE '\\'`, params: [`%${likeEscape(v)}%`] };
    case "doesNotContain":
      return {
        sql: `(${col.column} IS NULL OR LOWER(${col.column}) NOT LIKE LOWER(?) ESCAPE '\\')`,
        params: [`%${likeEscape(v)}%`],
      };
    case "startsWith":
      return { sql: `LOWER(${col.column}) LIKE LOWER(?) ESCAPE '\\'`, params: [`${likeEscape(v)}%`] };
    case "endsWith":
      return { sql: `LOWER(${col.column}) LIKE LOWER(?) ESCAPE '\\'`, params: [`%${likeEscape(v)}`] };
    case "equals":
      return { sql: `LOWER(${col.column}) = LOWER(?)`, params: [v] };
    case "doesNotEqual":
      return { sql: `(${col.column} IS NULL OR LOWER(${col.column}) != LOWER(?))`, params: [v] };
    default:
      return null;
  }
}

/** Folds `FactionHitsGrid`'s whole filter model into one parameterized `WHERE` fragment — empty
 *  string (no filtering at all) when the filter is absent or every item is incomplete. */
function buildFilterSql(filter: FactionHitsFilter | undefined): { where: string; params: unknown[] } {
  const items = (filter?.items ?? [])
    .map(filterItemSql)
    .filter((x): x is { sql: string; params: unknown[] } => x !== null);
  if (!items.length) return { where: "", params: [] };
  const joiner = filter?.logicOperator === "or" ? " OR " : " AND ";
  return { where: `WHERE ${items.map((i) => i.sql).join(joiner)}`, params: items.flatMap((i) => i.params) };
}

export interface FactionLog {
  /**
   * Record a faction-standing change, live or eaten from a past log. Keyed by its log line, so a
   * replayed gap — or a log eaten twice — can't file the same hit twice (ADR 0033).
   */
  add(event: FactionRecord): FactionAdded;
  /** The most recent hits, newest first (at most `limit`). */
  recent(limit?: number): FactionRecord[];
  /**
   * One page of the whole ledger, in the order asked for and narrowed by whatever column filter is
   * active — what `FactionHitsGrid` calls instead of `recent`, now that there's no
   * flat cap to fetch "everything" up to. A filter reaches every hit the ledger holds, not just the
   * page already on screen (unlike ADR 0230's per-column-filter rule for the other six tables) —
   * `total` above already reflects it, so the grid's own page count stays honest.
   */
  hitsPage(query: FactionHitsQuery): FactionHitsPage;
  /**
   * Every faction the ledger has seen a change for, folded to one row each — `net` summing every
   * stated delta, plus how many hits of each kind produced it. Covers hits a past `clear("records")`
   * has frozen as well as whatever's still live.
   */
  standings(): FactionStanding[];
  /**
   * Every faction touched **at or after** `sinceIso`, folded the same way `standings()` is — net
   * summed, floor/ceiling hits counted apart, causes rolled up biggest `|net|` first — but scoped to
   * the live table alone, with nothing a past `clear("records")` froze folded in on top (a freeze can
   * only ever be older than whatever session is asking). What the Faction tab's Session view calls,
   * `sinceIso` being the session's own start (`CombatStats.startedAt` — ADR 0019's one tracker owns
   * what "session" means everywhere it's asked).
   */
  standingsSince(sinceIso: string): FactionStanding[];
  /**
   * Forget the feed. **Standings survive by default** — they're what the ledger *taught*, same rule
   * as a loot price (ADR 0056). `"everything"` is the deliberate, asked-for wipe.
   */
  clear(scope?: ForgetScope): void;
  /**
   * Re-derive every stored dialogue cause against **today's** wiki cache, fixing a hit recorded before
   * a rule change without needing its own log line back. Uses `questsForSpeaker` — the exact function
   * a live guess calls — against each hit's already-stored `npc`/`text`, so a re-check produces
   * precisely what a fresh guess would say right now, not a second implementation of the same rule.
   * Two rules it can now correct:
   *
   *   - **ADR 0257**: a "Quest giver" naming something that isn't a mob never should have named a
   *     quest at all — `quests`/`questsMatched` are cleared, the raw `npc`/`text` stay.
   *   - **ADR 0261**: a speaker matched to no quest at all is no cause at all any more, not a weaker
   *     one (it's just as likely a hostile mob's own combat social or a corpse's flavor line) — the
   *     whole `causedBy` is cleared, reverting the hit to uncorrelated.
   *
   * A hit whose fresh answer matches what's already stored is left untouched; only `changed` rows are
   * written. Idempotent and cheap to call repeatedly — as the wiki cache grows, a later call can still
   * improve (or, per ADR 0261, correct) a row an earlier one couldn't.
   */
  recheckDialogueCauses(deps: Pick<FactionCauseTrackerDeps, "questGiver" | "questDialogue" | "isMob">): {
    checked: number;
    changed: number;
  };
  /** No pending write ever outlives this call — kept for callers that flushed the old debounced JSON
   *  writer at the same moments (quitting, right after a log import), even though every write here is
   *  already synchronous the instant it's made. */
  flush(): void;
  /** The hidden admin panel's view of these hits — see `electron/admin.ts`. */
  admin: AdminStore;
}

export function createFactionLog(db: Database, userDataDir: string): FactionLog {
  const file = path.join(userDataDir, "faction-log.json");
  migrateFromLegacyJson(db, userDataDir, file);
  // Carries **only** the provenance stamp now — see the module doc.
  const saver = createSaver(file, "faction log", () => ({}), WRITE_DEBOUNCE_MS, { concern: "faction-log" });

  const insertHit = db.prepare(`
    INSERT OR IGNORE INTO faction_hits
      (key, at, faction, direction, delta, caused_by_kind, caused_by_source, caused_by_gap_sec,
       caused_by_text, caused_by_quests, caused_by_quests_matched, raw, log_id)
    VALUES
      (@key, @at, @faction, @direction, @delta, @causedByKind, @causedBySource, @causedByGapSec,
       @causedByText, @causedByQuests, @causedByQuestsMatched, @raw, @logId)
  `);
  const selectRecent = db.prepare(`SELECT * FROM faction_hits ORDER BY at DESC, rowid DESC LIMIT ?`);
  const selectAll = db.prepare(`SELECT * FROM faction_hits ORDER BY at DESC, rowid DESC`);
  const countHits = db.prepare(`SELECT COUNT(*) as n FROM faction_hits`);
  const countEditedHits = db.prepare(`SELECT COUNT(*) as n FROM faction_hits WHERE admin_audit IS NOT NULL`);
  // `COALESCE(..., 0)` on `net`/`raises`/`lowers` only: SQLite's `SUM` returns SQL `NULL`, not `0`,
  // when every row it's summing is `NULL` — which happens here for any faction whose hits are *all*
  // floor/ceiling caps (a `delta`-less direction), never a single raised/lowered hit with a real
  // number. Without this, such a faction's standing carries `net: null` instead of `net: 0` — a type
  // the rest of the app never expects (`FactionStanding.net` is a plain `number`), and one the
  // Standings table renders as a blank cell instead of "0". `floors`/`ceilings` need no such guard:
  // `direction = 'floor'`/`'ceiling'` is always `0` or `1`, never `NULL`, for any row.
  const selectStandingsAgg = db.prepare(`
    SELECT faction,
           COALESCE(SUM(net), 0) as net, COALESCE(SUM(raises), 0) as raises, COALESCE(SUM(lowers), 0) as lowers,
           SUM(floors) as floors, SUM(ceilings) as ceilings,
           MIN(firstAt) as firstAt, MAX(lastAt) as lastAt
    FROM (
      SELECT faction,
             SUM(delta) as net,
             SUM(delta >= 0) as raises,
             SUM(delta < 0) as lowers,
             SUM(direction = 'floor') as floors,
             SUM(direction = 'ceiling') as ceilings,
             MIN(at) as firstAt, MAX(at) as lastAt
      FROM faction_hits
      GROUP BY faction
      UNION ALL
      SELECT faction, net, raises, lowers, floors, ceilings, first_at as firstAt, last_at as lastAt
      FROM faction_standings_frozen
    )
    GROUP BY faction
  `);
  const selectLiveCauses = db.prepare(`
    SELECT faction, caused_by_kind as kind, caused_by_source as source,
           SUM(delta) as net, COUNT(*) as hits
    FROM faction_hits
    WHERE caused_by_kind IS NOT NULL
    GROUP BY faction, caused_by_kind, caused_by_source
  `);
  // `standingsSince`'s own pair, mirroring `selectStandingsAgg`/`selectLiveCauses` except for the
  // `at >= ?` cutoff and no frozen union — a freeze is always older than any session that could be
  // asking. `net`/`raises`/`lowers` all need their own `COALESCE` here (unlike `selectStandingsAgg`'s
  // inner subselect, which leaves that to its outer re-aggregation over the frozen union): a faction
  // touched only by floor/ceiling hits in the window has every `delta` — and so every `delta >= 0`/
  // `delta < 0` too — `NULL`, and `SUM` over an all-`NULL` group is `NULL`, not `0`.
  // `floors`/`ceilings` need no guard: `direction = 'floor'`/`'ceiling'` is always `0` or `1`, never
  // `NULL`, for any row.
  const selectStandingsSinceAgg = db.prepare(`
    SELECT faction,
           COALESCE(SUM(delta), 0) as net,
           COALESCE(SUM(delta >= 0), 0) as raises, COALESCE(SUM(delta < 0), 0) as lowers,
           SUM(direction = 'floor') as floors, SUM(direction = 'ceiling') as ceilings,
           MIN(at) as firstAt, MAX(at) as lastAt
    FROM faction_hits
    WHERE at >= ?
    GROUP BY faction
  `);
  const selectCausesSince = db.prepare(`
    SELECT faction, caused_by_kind as kind, caused_by_source as source,
           SUM(delta) as net, COUNT(*) as hits
    FROM faction_hits
    WHERE caused_by_kind IS NOT NULL AND at >= ?
    GROUP BY faction, caused_by_kind, caused_by_source
  `);
  const selectFrozen = db.prepare(`SELECT * FROM faction_standings_frozen`);
  const upsertFrozen = db.prepare(`
    INSERT INTO faction_standings_frozen (faction, net, raises, lowers, floors, ceilings, first_at, last_at, causes_json)
    VALUES (@faction, @net, @raises, @lowers, @floors, @ceilings, @firstAt, @lastAt, @causesJson)
    ON CONFLICT(faction) DO UPDATE SET
      net = excluded.net, raises = excluded.raises, lowers = excluded.lowers,
      floors = excluded.floors, ceilings = excluded.ceilings,
      first_at = excluded.first_at, last_at = excluded.last_at, causes_json = excluded.causes_json
  `);
  const deleteHits = db.prepare(`DELETE FROM faction_hits`);
  const deleteFrozen = db.prepare(`DELETE FROM faction_standings_frozen`);
  const deleteHit = db.prepare(`DELETE FROM faction_hits WHERE key = ?`);
  const updateAudit = db.prepare(`UPDATE faction_hits SET admin_audit = ? WHERE key = ?`);
  const selectDialogueCauses = db.prepare(`
    SELECT key, caused_by_source as source, caused_by_text as text,
           caused_by_quests as quests, caused_by_quests_matched as questsMatched
    FROM faction_hits
    WHERE caused_by_kind = 'dialogue'
  `);
  const updateDialogueQuests = db.prepare(`
    UPDATE faction_hits SET caused_by_quests = ?, caused_by_quests_matched = ? WHERE key = ?
  `);
  // ADR 0261: an unmatched speaker no longer names a weaker dialogue cause, it names none at all — a
  // hostile mob's own combat social or a corpse's flavor line reads exactly like a quest giver's
  // reply, so a hit like this reverts to uncorrelated rather than keeping a guess now known to be
  // more often wrong than right.
  const clearCause = db.prepare(`
    UPDATE faction_hits SET
      caused_by_kind = NULL, caused_by_source = NULL, caused_by_gap_sec = NULL,
      caused_by_text = NULL, caused_by_quests = NULL, caused_by_quests_matched = NULL
    WHERE key = ?
  `);

  function paramsOf(event: FactionRecord) {
    const c = causeToRow(event.causedBy);
    return {
      key: factionKey(event),
      at: event.at,
      faction: event.faction,
      direction: event.direction,
      delta: event.delta,
      causedByKind: c.kind,
      causedBySource: c.source,
      causedByGapSec: c.gapSec,
      causedByText: c.text,
      causedByQuests: c.quests,
      causedByQuestsMatched: c.questsMatched,
      raw: event.raw,
      logId: event.logId,
    };
  }

  /** Every faction the ledger holds a change for, folded from live hits and whatever's frozen —
   *  `standings()`'s own body, pulled out so `clear("records")` can call it to build the snapshot it
   *  freezes without duplicating the merge. */
  function computeStandings(): FactionStanding[] {
    const rows = selectStandingsAgg.all() as {
      faction: string;
      net: number;
      raises: number;
      lowers: number;
      floors: number;
      ceilings: number;
      firstAt: string;
      lastAt: string;
    }[];

    const liveCauses = new Map<string, FactionCauseTally[]>();
    for (const c of selectLiveCauses.all() as { faction: string; kind: string; source: string; net: number; hits: number }[]) {
      const list = liveCauses.get(c.faction) ?? [];
      list.push({ kind: c.kind as FactionCauseTally["kind"], source: c.source, net: c.net, hits: c.hits });
      liveCauses.set(c.faction, list);
    }

    const frozenCauses = new Map<string, FactionCauseTally[]>();
    for (const f of selectFrozen.all() as { faction: string; causes_json: string }[]) {
      frozenCauses.set(f.faction, JSON.parse(f.causes_json) as FactionCauseTally[]);
    }

    return rows
      .map((r) => ({
        faction: r.faction,
        net: r.net,
        raises: r.raises,
        lowers: r.lowers,
        floors: r.floors,
        ceilings: r.ceilings,
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        causes: mergeCauseTallies(liveCauses.get(r.faction) ?? [], frozenCauses.get(r.faction) ?? []),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  /** `standingsSince`'s own body — same shape as `computeStandings`, just a time-scoped query and no
   *  frozen data to fold in (see the interface doc). */
  function computeStandingsSince(sinceIso: string): FactionStanding[] {
    const rows = selectStandingsSinceAgg.all(sinceIso) as {
      faction: string;
      net: number;
      raises: number;
      lowers: number;
      floors: number;
      ceilings: number;
      firstAt: string;
      lastAt: string;
    }[];

    const causes = new Map<string, FactionCauseTally[]>();
    for (const c of selectCausesSince.all(sinceIso) as {
      faction: string;
      kind: string;
      source: string;
      net: number;
      hits: number;
    }[]) {
      const list = causes.get(c.faction) ?? [];
      list.push({ kind: c.kind as FactionCauseTally["kind"], source: c.source, net: c.net, hits: c.hits });
      causes.set(c.faction, list);
    }

    return rows
      .map((r) => ({
        faction: r.faction,
        net: r.net,
        raises: r.raises,
        lowers: r.lowers,
        floors: r.floors,
        ceilings: r.ceilings,
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        causes: (causes.get(r.faction) ?? []).sort(byCauseImpact),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  return {
    add(event) {
      const info = insertHit.run(paramsOf(event));
      if (info.changes > 0) saver.save();
      return info.changes === 0 ? "known" : "added";
    },

    recent: (limit = DEFAULT_LIMIT) => (selectRecent.all(limit) as HitRow[]).map(rowToRecord),

    hitsPage({ offset, limit, sortField, sortDesc, filter }) {
      const col = HIT_SORT_COLUMNS[sortField] ?? HIT_SORT_COLUMNS.at;
      const dir = sortDesc ? "DESC" : "ASC";
      const { where, params } = buildFilterSql(filter);
      // SQLite treats a negative `LIMIT` as "no limit at all" — every other value this query
      // interpolates is allow-listed (`col`, `dir`) or bound (`params`, and now these two), but
      // `offset`/`limit` arrive from the renderer's own pagination state with nothing at the IPC
      // boundary clamping them. Not reachable through `FactionHitsGrid` today (a grid's own page size is
      // always positive), but a page of the *whole* ledger handed back for a negative `limit` is
      // exactly the "fetch everything" cost this store's paging exists to avoid.
      const safeLimit = Math.max(0, limit);
      const safeOffset = Math.max(0, offset);
      // NULLs always last, in either direction — the same rule `sortRows` documents for `delta`
      // (a floor/ceiling hit) and `cause` (nothing correlated), just expressed as SQL here instead
      // of a comparator, since SQLite's own default NULL ordering flips with the sort direction.
      const rows = db
        .prepare(
          `SELECT * FROM faction_hits ${where} ORDER BY (${col} IS NULL) ASC, ${col} ${dir}, rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, safeLimit, safeOffset) as HitRow[];
      const total = where
        ? (db.prepare(`SELECT COUNT(*) as n FROM faction_hits ${where}`).get(...params) as { n: number }).n
        : (countHits.get() as { n: number }).n;
      return { rows: rows.map(rowToRecord), total };
    },

    standings: computeStandings,

    standingsSince: computeStandingsSince,

    clear(scope = "records") {
      if (scope === "records") {
        const freeze = db.transaction(() => {
          for (const s of computeStandings()) {
            upsertFrozen.run({
              faction: s.faction,
              net: s.net,
              raises: s.raises,
              lowers: s.lowers,
              floors: s.floors,
              ceilings: s.ceilings,
              firstAt: s.firstAt,
              lastAt: s.lastAt,
              causesJson: JSON.stringify(s.causes),
            });
          }
          deleteHits.run();
        });
        freeze();
      } else {
        db.transaction(() => {
          deleteHits.run();
          deleteFrozen.run();
        })();
      }
      saver.flush();
      log.debug("cleared", { scope });
    },

    recheckDialogueCauses(deps) {
      const rows = selectDialogueCauses.all() as {
        key: string;
        source: string;
        text: string;
        quests: string | null;
        questsMatched: number | null;
      }[];
      let changed = 0;
      const run = db.transaction(() => {
        for (const r of rows) {
          const fresh = questsForSpeaker(r.source, r.text, deps);
          if (!fresh) {
            // Not a known quest-giver at all under today's cache — the whole cause goes, not just
            // its quest, since ADR 0261 no longer treats an unmatched speaker as weaker evidence.
            clearCause.run(r.key);
            changed++;
            continue;
          }
          const quests = JSON.stringify(fresh.quests);
          const questsMatched = fresh.questsMatched ? 1 : 0;
          if (quests === r.quests && questsMatched === r.questsMatched) continue;
          updateDialogueQuests.run(quests, questsMatched, r.key);
          changed++;
        }
      });
      run();
      if (changed) saver.save();
      return { checked: rows.length, changed };
    },

    flush() {
      saver.flush();
    },

    // `editable: []`, same as the array-backed store this replaces: every scalar field here is
    // exactly what `factionKey` dedupes by, so editing one would leave a row the ledger can no
    // longer recognize as itself if the same line were ever replayed. `causedBy` is a nested guess,
    // not a scalar. Still worth listing: finding a bad hit is half of what an audit trail is for.
    admin: createSqlAdminStore<HitRow>("Faction hits", {
      list: () => selectAll.all() as HitRow[],
      idOf: (r) => r.key,
      summaryOf: (r) => `${r.faction} ${r.direction}${r.delta !== null ? ` ${r.delta > 0 ? "+" : ""}${r.delta}` : ""} (${r.at})`,
      editable: [],
      auditOf: (r) => (r.admin_audit ? (JSON.parse(r.admin_audit) as AdminAudit) : undefined),
      applyPatch: (id, field, value, audit) => {
        // `field` is always a member of `editable` by the time `createSqlAdminStore.patch` calls this
        // — safe to interpolate since it can only ever be one of this store's own fixed column names,
        // never arbitrary input. `editable` is empty here, so this never actually runs for this store.
        db.prepare(`UPDATE faction_hits SET ${field} = ? WHERE key = ?`).run(value as AdminScalar, id);
        updateAudit.run(JSON.stringify(audit), id);
      },
      // Left deduped forever, same reasoning as `kill-log.ts`'s own `remove`: a deleted row staying
      // out of the table means replaying the same log can't quietly bring it back — `INSERT OR
      // IGNORE` only ever ignores a key that's still present.
      removeRow: (id) => deleteHit.run(id),
      onChanged: () => saver.save(),
      // `stores()` (`electron/admin.ts`) calls this on every admin-panel open *and* every
      // `app.onDataChanged` broadcast the admin window is listening for while it's open — a `list()`
      // fallback would mean a full `faction_hits` scan-and-map on every faction hit logged while the
      // panel sits open in the background, exactly the cost ADR 0232 removed the row cap to avoid
      // paying anywhere else.
      counts: () => ({
        total: (countHits.get() as { n: number }).n,
        edited: (countEditedHits.get() as { n: number }).n,
      }),
    }),
  };
}

/**
 * Fold a pre-ADR-0232 `faction-log.json` into the new tables, once. Unlike a re-fetchable cache
 * (ADR 0165's wiki pages), the file isn't renamed away afterward — it goes on existing as a
 * provenance-only stub, because `data-health.ts` still reads its `provenance` field directly off
 * disk (see the module doc). Guarded by whether the file still carries a `hits` array at all, not by
 * whether the new tables are empty: a stub (already migrated) has no such array, so this can't
 * re-run on it, and a player who has since cleared the ledger for real doesn't get it silently
 * repopulated. `INSERT OR IGNORE` and the frozen table's upsert both make a second run — say, a
 * crash partway through — safe to simply retry.
 */
function migrateFromLegacyJson(db: Database, userDataDir: string, file: string): void {
  if (!fs.existsSync(file)) return;
  const legacy = readJson<{
    hits?: FactionRecord[];
    retired?: (Omit<FactionStanding, "causes"> & { causes?: FactionCauseTally[] })[];
    provenance?: DataStamp;
  }>(file, {});
  if (!Array.isArray(legacy.hits)) return; // already a stub, or nothing was ever stored
  const hits = legacy.hits;
  const retired = Array.isArray(legacy.retired) ? legacy.retired : [];

  const insertHit = db.prepare(`
    INSERT OR IGNORE INTO faction_hits
      (key, at, faction, direction, delta, caused_by_kind, caused_by_source, caused_by_gap_sec,
       caused_by_text, caused_by_quests, caused_by_quests_matched, raw, log_id)
    VALUES
      (@key, @at, @faction, @direction, @delta, @causedByKind, @causedBySource, @causedByGapSec,
       @causedByText, @causedByQuests, @causedByQuestsMatched, @raw, @logId)
  `);
  const upsertFrozen = db.prepare(`
    INSERT INTO faction_standings_frozen (faction, net, raises, lowers, floors, ceilings, first_at, last_at, causes_json)
    VALUES (@faction, @net, @raises, @lowers, @floors, @ceilings, @firstAt, @lastAt, @causesJson)
    ON CONFLICT(faction) DO UPDATE SET
      net = excluded.net, raises = excluded.raises, lowers = excluded.lowers,
      floors = excluded.floors, ceilings = excluded.ceilings,
      first_at = excluded.first_at, last_at = excluded.last_at, causes_json = excluded.causes_json
  `);

  const run = db.transaction(() => {
    for (const e of hits) {
      const c = causeToRow(e.causedBy);
      insertHit.run({
        key: factionKey(e),
        at: e.at,
        faction: e.faction,
        direction: e.direction,
        delta: e.delta,
        causedByKind: c.kind,
        causedBySource: c.source,
        causedByGapSec: c.gapSec,
        causedByText: c.text,
        causedByQuests: c.quests,
        causedByQuestsMatched: c.questsMatched,
        raw: e.raw,
        logId: e.logId,
      });
    }
    for (const s of retired) {
      upsertFrozen.run({
        faction: s.faction,
        net: s.net,
        raises: s.raises,
        lowers: s.lowers,
        floors: s.floors,
        ceilings: s.ceilings,
        firstAt: s.firstAt,
        lastAt: s.lastAt,
        causesJson: JSON.stringify(s.causes ?? []),
      });
    }
  });
  run();

  // Carry the legacy stamp forward exactly as it was, rather than re-stamping at the current
  // revision: moving storage engines doesn't re-derive anything through today's rules, so a stamp
  // that was stale before migrating must stay stale, or an unattended re-read still owed would
  // silently stop happening.
  if (legacy.provenance) fs.writeFileSync(file, JSON.stringify({ provenance: legacy.provenance }));
  else writeJson(file, {}, { concern: "faction-log" });
  log.info("migrated faction-log.json into eqlist.db", { hits: hits.length, retired: retired.length });
}
