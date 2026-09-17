/**
 * combat-history.ts — keeps finished fights so a past session can be dug into.
 *
 * The live tracker (`combat-stats.ts`) deliberately holds only "current fight" and
 * "session"; this is where fights go when they end. It's a **flat, bounded list of
 * fights**, each tagged with the session it belongs to — sessions are then *derived* by
 * grouping. One list means one size bound and no second thing to keep consistent: if a
 * fight is on disk, its session exists by definition.
 *
 * **Backed by SQLite** ([ADR 0232](../specs/decisions/0232-a-ledger-that-outlives-its-cap-is-a-database.md),
 * following `faction-log.ts`/`loot-log.ts`/`kill-log.ts`). That first migration was a pure
 * storage-engine swap — `MAX_FIGHTS` stayed exactly as it was, cap-enforced the same way, so
 * `zones()`/`bests()` only reflected currently-held fights, a gap that migration explicitly accepted
 * rather than fixed. **The cap itself is gone now**
 * ([ADR 0243](../specs/decisions/0243-remove-the-remaining-storage-caps.md)): `combat_fights` keeps
 * every fight forever, the same as the other three ledgers, which resolves that gap as a side effect
 * rather than needing the "permanent-key bookkeeping" design work the first migration deferred —
 * `zones()`/`bests()`/`sessions()` scan whatever's held, and now that's everything, so there's nothing
 * left outside the scan for a frozen aggregate to protect. A fight's own dedup memory (`key`) is still
 * scoped to *currently held* rows rather than a separate permanent registry the way `kill-log.ts`'s
 * `kill_seen_keys` is — but with nothing ever evicted, `rederive()` can no longer legitimately
 * regenerate a row that left and have it leave again, which was the whole scenario that memory needed
 * to be permanent *for*. The one way a key still stops being tracked is the admin panel deleting a
 * fight by hand — unrelated to the cap, and unchanged by removing it (see `removeRow`, below).
 *
 * **`combat-history.json` still exists, but only as a provenance stamp.** `data-health.ts` and
 * `log-reread.ts`'s unattended-re-read mechanism (ADR 0129) read this file's `provenance` field
 * *directly off disk*, independent of this store — that's the whole contract `DATA_CONCERNS` makes.
 * Moving the fights themselves into SQL doesn't touch that contract, so this file keeps existing as a
 * tiny stub carrying nothing but the stamp, rewritten (still debounced, still through `json-store.ts`)
 * on every mutation exactly as before. A migrated-away file would read as `state: "absent"` forever —
 * not stale, not current, just silently un-checked — which would quietly disable the self-healing
 * re-read for this concern the moment it upgraded.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Database } from "better-sqlite3";
import { createLogger } from "../src/shared/logging";
import { fightMatches } from "../src/shared/fight-search";
import type { DataStamp } from "../src/shared/data-provenance";
import type {
  AdminAudit,
  AdminScalar,
} from "../src/shared/admin";
import type {
  DerivedFight,
  FightBest,
  FightSearch,
  FightStats,
  RederiveOutcome,
  SessionSummary,
  StoredFight,
  ZoneReport,
} from "../src/shared/types";
import { coerceBooleanAdminPatch, createSqlAdminStore, triNull, type AdminStore } from "./admin";
import { createSaver, readJson, writeJson } from "./json-store";
import type { Migration } from "./sqlite-store";
import { createBackgroundCache } from "./background-cache";
import { computeCombatReports, labelFor, rowToFight, type CombatReports, type FightRow } from "./combat-history-reports";
const log = createLogger("combat-history");

/** Fights arrive in bursts; coalesce the provenance-stamp writes the same way the old full-file
 *  saver did. */
const WRITE_DEBOUNCE_MS = 2000;

/**
 * How many matches a search sends back. A fight carries its whole breakdown — every damage cell of
 * it — so "a" matching a fortnight of play would push megabytes through IPC and a thousand rows into
 * a floating window. The newest matches are the ones being looked for; the count says how many were
 * left out (see `FightSearch`).
 */
const SEARCH_LIMIT = 100;

export const COMBAT_HISTORY_MIGRATIONS: readonly Migration[] = [
  {
    version: 4,
    label: "combat_fights",
    up(db) {
      db.exec(`
        CREATE TABLE combat_fights (
          id TEXT PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          sessionId TEXT NOT NULL,
          label TEXT NOT NULL,
          zone TEXT,
          logFile TEXT,
          startedAt TEXT NOT NULL,
          endedAt TEXT NOT NULL,
          unsourced INTEGER,
          statsJson TEXT NOT NULL,
          adminAudit TEXT
        );
        CREATE INDEX combat_fights_startedAt_idx ON combat_fights(startedAt);
      `);
    },
  },
  {
    version: 7,
    label: "combat_fights_sessionId_idx",
    up(db) {
      // `fights(sessionId)` (ADR 0243) filters by exact session server-side instead of decoding and
      // filtering every fight ever recorded in JS — cheap only with an index behind it, now that the
      // table has no cap left to bound its growth.
      db.exec(`CREATE INDEX combat_fights_sessionId_idx ON combat_fights(sessionId);`);
    },
  },
];

export interface CombatHistory {
  /**
   * File a finished fight under the current session (or `sessionId`, which is how eating a log
   * files each sitting it finds), tagged with the zone it happened in and the log file it came
   * from (with `stats.logIds` and the timestamps, that's the way back to the source lines — see
   * ADR 0021).
   *
   * Returns whether it was **new**. A fight is keyed by its log file and its own start/end
   * timestamps, so eating a log you already watched — or eating it twice — files each fight once
   * (ADR 0033's rule, applied to fights).
   */
  add(fight: FightStats, zone?: string | null, logFile?: string | null, sessionId?: string): boolean;
  /**
   * Re-read one log file's fights: replace what we hold from that file with what a fresh replay of
   * it derived ([ADR 0128](../specs/decisions/0128-a-fight-is-re-derived-not-refused.md)).
   *
   * This is what makes "digest the log again" the remedy `data-provenance.ts` already advertises for
   * a stale `combat-history`. `add` deduping is right for a kill — a count, which counting twice
   * corrupts — and wrong for a fight, which is a *derived summary* that a better parser should be
   * allowed to redo.
   *
   * `covers` is the span of the file in epoch ms, first parsed event to last. The replay is
   * **authoritative inside it**: a stored fight from this log within that span is replaced by
   * whatever the new pass produced there, boundaries included, since a rule that makes a new line
   * readable can move where a fight starts. A stored fight *outside* it is one the file can no
   * longer account for — kept, and marked `unsourced`.
   *
   * Idempotent in the sense that matters: run twice and the second run refreshes the same fights to
   * the same figures.
   */
  rederive(logFile: string, derived: DerivedFight[], covers: { from: number; to: number }): RederiveOutcome;
  /**
   * A new **play session** starts — the log said you logged in (ADR 0054). Fights filed from
   * here on group under it. The id comes from the login's own timestamp, so re-reading the same
   * line lands the same fights in the same session instead of splitting them in two.
   */
  startSession(at: string): void;
  /**
   * Per-zone totals across every recorded fight — which camp actually pays. Each fight's own
   * numbers live inside its `statsJson` blob, not scalar columns a `GROUP BY` could sum directly, so
   * unlike `kills(zone)` or `fights(sessionId)` there's no `WHERE` to push this down to — instead
   * `zones()`/`bests()`/`sessions()` share one `createBackgroundCache` (ADR 0247) that folds the
   * whole table once, off the main thread, and hands all three their own slice of the same answer.
   * Still synchronous and always correct to call — see `background-cache.ts`'s own contract.
   */
  zones(): ZoneReport[];
  /** Your best recorded fight per opponent. */
  bests(): FightBest[];
  /** Past sessions, newest first. */
  sessions(): SessionSummary[];
  /** One session's fights, newest first. */
  fights(sessionId: string): StoredFight[];
  /**
   * Fights whose name or zone matches `term`, across every session, newest first and capped —
   * "where did I fight those minotaurs" is a question about the whole history, not one sitting.
   * An empty term matches everything (`fight-search.ts` owns the rule).
   */
  search(term: string, limit?: number): FightSearch;
  /**
   * The log files the fights we hold came from, newest fight first — the sources a re-reading would
   * have to read ([ADR 0129](../specs/decisions/0129-a-release-can-ask-for-a-re-read.md)). Paths as
   * they were recorded, which may be a folder that has since moved; resolving them is the caller's
   * job, since only it knows where logs live now.
   */
  sources(): string[];
  clear(): void;
  /** No pending write ever outlives this call — every write here is already synchronous, so this
   *  is kept only so a caller that flushed the old debounced JSON writer still has something to call. */
  flush(): void;
  /**
   * Fires once a *background* refresh of `zones()`/`bests()`/`sessions()`'s shared cache actually
   * lands a fresher answer (ADR 0247) — never on every call, and never for a merely-synchronous
   * one. `main.ts` wires this to a broadcast, the same way `kill-log.ts`'s own
   * `onObservationsChanged` is, so a window whose read already fell back to the last-known-good
   * value gets a chance to see the fresher one land a moment later.
   */
  onCombatReportsChanged(cb: () => void): void;
  /** The hidden admin panel's view of these records — see `electron/admin.ts`. */
  admin: AdminStore;
}

// `labelFor` (below) now lives in `combat-history-reports.ts` — this file's own `zones()`/
// `bests()`/`sessions()` moved there too, and everything left here that names a fight (`fights()`,
// `search()`) reuses the same one rather than a second copy.

/** A stored fight with its label brought up to date. */
const labelled = (f: StoredFight): StoredFight => ({ ...f, label: labelFor(f.stats) });

/**
 * The session fights fall into before the log has said you logged in — the app was started
 * mid-sitting, or is watching a log whose login line is behind the cursor. Random, so it can't
 * collide with a real sitting's.
 */
const runSession = (): string => `run:${randomUUID()}`;

/**
 * The session a login at `at` belongs to. Shared with the importer so a sitting eaten from a log
 * lands in the *same* session as the one watched live — otherwise one evening shows up twice.
 */
export const loginSession = (at: string): string => `login:${at}`;

/**
 * The sitting a fight falls in when the log offers no login to bound it — everything before the
 * first `Welcome to EverQuest` line in a file we're reading whole. Named after the file rather than
 * minted fresh, because a re-derivation has to land the same id as the reading before it.
 */
export const fileSession = (file: string): string => `file:${file}`;

/**
 * A fight's identity: the log it came from and its own first and last timestamps. Intrinsic to
 * the log, like ADR 0033's kill and drop keys, so the same fight read again — re-eaten, or eaten
 * after being watched live — is recognised however it arrives. The *basename* of the file, not
 * its path, because the same log is reached by different paths (and it names the character, which
 * is what keeps two characters' overlapping fights apart).
 */
function fightKey(stats: FightStats, logFile?: string | null): string {
  return [logFile ? path.basename(logFile) : "", stats.startedAt, stats.endedAt].join(" ");
}

/** Newest first, by the log's own clock — insertion order stops being chronological after an import. */
const byNewest = (a: StoredFight, b: StoredFight): number => b.stats.startedAt.localeCompare(a.stats.startedAt);

/**
 * `FightRow` with `unsourced` restored to a real boolean, for the admin panel only. `admin.ts`'s
 * generic field-typing infers a field's type from its live JS value — a raw SQLite integer column
 * reads back as `number`/`null`, not `boolean` — so without this, `unsourced` would show in the
 * hidden admin panel as a plain number box instead of the `true`/`false` toggle it showed before this
 * store moved off a plain JS array (where `StoredFight.unsourced` was a genuine `boolean | undefined`).
 */
type FightAdminRow = Omit<FightRow, "unsourced"> & { unsourced: boolean | null };
function toAdminRow(r: FightRow): FightAdminRow {
  return { ...r, unsourced: triNull(r.unsourced) };
}

/** Which admin-editable column is genuinely boolean — see `applyPatch`'s own comment on why this
 *  has to be re-checked there too, not just in `toAdminRow`. */
const BOOLEAN_FIELDS = new Set(["unsourced"]);

function paramsOf(f: StoredFight): Record<string, unknown> {
  return {
    id: f.id,
    key: f.key ?? fightKey(f.stats, f.logFile),
    sessionId: f.sessionId,
    label: f.label,
    zone: f.zone ?? null,
    logFile: f.logFile ?? null,
    startedAt: f.stats.startedAt,
    endedAt: f.stats.endedAt,
    unsourced: f.unsourced ? 1 : null,
    statsJson: JSON.stringify(f.stats),
  };
}

export function createCombatHistory(db: Database, userDataDir: string, sessionId: string = runSession()): CombatHistory {
  const file = path.join(userDataDir, "combat-history.json");
  migrateFromLegacyJson(db, userDataDir, file);
  // Carries **only** the provenance stamp now — see the module doc. Debounced the same way the old
  // full-file saver was, since fights end in clusters and each stamp write is otherwise identical.
  const saver = createSaver(file, "combat history", () => ({}), WRITE_DEBOUNCE_MS, { concern: "combat-history" });

  // `OR IGNORE`: `add()` already refuses a second `insertFight.run` under a key it just checked with
  // `hasKey`, so this never actually triggers there. `rederive()` has no such pre-check across its
  // own freshly `derived` batch, and EQ's one-second log resolution means two genuinely different,
  // very short fights in the same file can legitimately share a `(file, startedAt, endedAt)` key —
  // without `OR IGNORE`, that collision throws `UNIQUE constraint failed` *inside* `rederive`'s own
  // transaction, rolling back every other fight it was about to correctly refresh in the same batch.
  // `combat_fights.key` was never actually enforced unique in the old array-backed store (nothing
  // stopped two entries sharing one), so dropping the second of a colliding pair here — rather than
  // crashing the whole re-derive — is the closer match to that behavior, not a new kind of data loss.
  const insertFight = db.prepare(`
    INSERT OR IGNORE INTO combat_fights (id, key, sessionId, label, zone, logFile, startedAt, endedAt, unsourced, statsJson)
    VALUES (@id, @key, @sessionId, @label, @zone, @logFile, @startedAt, @endedAt, @unsourced, @statsJson)
  `);
  const hasKey = db.prepare(`SELECT 1 FROM combat_fights WHERE key = ?`);
  const selectAll = db.prepare(`SELECT * FROM combat_fights`);
  const selectBySession = db.prepare(`SELECT * FROM combat_fights WHERE sessionId = ?`);
  const selectById = db.prepare(`SELECT * FROM combat_fights WHERE id = ?`);
  const countFights = db.prepare(`SELECT COUNT(*) as n FROM combat_fights`);
  const countEditedFights = db.prepare(`SELECT COUNT(*) as n FROM combat_fights WHERE adminAudit IS NOT NULL`);
  const deleteById = db.prepare(`DELETE FROM combat_fights WHERE id = ?`);
  const deleteAll = db.prepare(`DELETE FROM combat_fights`);
  const updateUnsourced = db.prepare(`UPDATE combat_fights SET unsourced = 1 WHERE id = ?`);
  const updateAudit = db.prepare(`UPDATE combat_fights SET adminAudit = ? WHERE id = ?`);

  // `zones()`/`bests()`/`sessions()` used to fold the whole (uncapped since ADR 0243) table fresh
  // on every read — three full scans of a table where every row's a fight's whole breakdown. ADR
  // 0247 keeps that off the main thread instead: one shared background cache computes all three
  // together (`computeCombatReports`), and each public method below just plucks its own piece.
  const reportsCache = createBackgroundCache<CombatReports>({
    label: "combat reports",
    computeSync: () => computeCombatReports(db),
    dbFile: db.memory ? null : db.name,
    modulePath: path.join(__dirname, "combat-history-reports.js"),
    exportName: "computeCombatReports",
  });

  let session = sessionId;

  /** The same log, whichever path or capitalisation names it — Windows spells one file many ways. */
  function sameLog(a: string | null | undefined, b: string): boolean {
    return !!a && path.basename(a).toLowerCase() === path.basename(b).toLowerCase();
  }

  return {
    add(stats, zone, logFile, sessionArg) {
      const key = fightKey(stats, logFile);
      if (hasKey.get(key)) return false; // seen before: eaten twice, or eaten after being watched
      const fight: StoredFight = {
        id: randomUUID(),
        key,
        sessionId: sessionArg ?? session,
        label: labelFor(stats),
        zone: zone ?? undefined,
        logFile: logFile ?? undefined,
        stats,
      };
      insertFight.run(paramsOf(fight));
      saver.save();
      reportsCache.markChanged();
      log.debug("filed fight", { label: fight.label, dealt: stats.totalDealt, kept: (countFights.get() as { n: number }).n });
      return true;
    },

    rederive(logFile, derived, covers) {
      const ms = (at: string): number => Date.parse(at);
      /** Could the file, as we just read it, have produced this fight? Then the replay outranks it. */
      const covered = (f: StoredFight): boolean =>
        !!f.stats.startedAt && ms(f.stats.startedAt) >= covers.from && ms(f.stats.endedAt) <= covers.to;
      /**
       * Is the file demonstrably unable to account for this fight any more? Only when it ends
       * **before** the earliest line the file still holds — it was rotated or truncated away.
       * Anything past `covers.to` is left alone entirely — neither replaced nor marked, since the
       * live watcher may be filing fresher fights into this history while a re-read is in progress.
       */
      const lost = (f: StoredFight): boolean => !!f.stats.endedAt && ms(f.stats.endedAt) < covers.from;

      const all = (selectAll.all() as FightRow[]).map(rowToFight);
      const mine = all.filter((f) => sameLog(f.logFile, logFile));
      const replaced = mine.filter(covered);
      const priorByKey = new Map(replaced.map((f) => [f.key ?? fightKey(f.stats, f.logFile), f]));

      // Beyond the file's reach. Still fights that happened, so they stay — flagged, so nothing
      // quietly presents a frozen figure as a current one.
      let unsourced = 0;
      for (const f of mine) {
        if (!lost(f) || f.unsourced) continue;
        updateUnsourced.run(f.id);
        unsourced += 1;
      }

      /**
       * Which sitting a *newly* derived fight joins. `loginSession` is shared with the live path, so
       * anything behind a login line agrees with what was filed live by construction. Before the
       * file's first login the two cannot agree — the live path invented a `run:` id — so the fight
       * inherits the sitting of the stored fight nearest it in this same log rather than opening a
       * rival one, which would split an evening's list in two.
       */
      const sittingFor = (d: DerivedFight): string => {
        if (d.sessionId) return d.sessionId;
        const at = ms(d.stats.startedAt);
        const before = replaced.filter((f) => ms(f.stats.startedAt) <= at).sort(byNewest)[0];
        return (before ?? [...replaced].sort(byNewest).pop())?.sessionId ?? fileSession(logFile);
      };

      /** Stored fights a derived one answered to — the rest of `replaced` had its boundary moved. */
      const matched = new Set<string>();
      // A plain `.map()` over `derived` would let two entries that land on the same key (EQ's log
      // timestamp is one-second resolution — two short, back-to-back fights can share a `(file,
      // startedAt, endedAt)` identity without being the same fight) both claim the same `priorByKey`
      // entry, and both build a `next` row under the *same* `id` — not just a `combat_fights.key`
      // collision `insertFight`'s `OR IGNORE` already tolerates, but a silently inflated `matched`/
      // `refreshed` count, since `survived` below counts by `id` and both entries share one. Tracking
      // which keys this batch has already placed keeps each key to exactly one row, the same "first
      // one wins" rule a key collision gets everywhere else in this app.
      const keysThisBatch = new Set<string>();
      const next: StoredFight[] = [];
      for (const d of derived) {
        const key = fightKey(d.stats, logFile);
        if (keysThisBatch.has(key)) continue;
        keysThisBatch.add(key);
        const prior = priorByKey.get(key);
        if (!prior) {
          next.push({
            id: randomUUID(),
            key,
            sessionId: sittingFor(d),
            label: labelFor(d.stats),
            zone: d.zone ?? undefined,
            logFile,
            stats: d.stats,
          });
          continue;
        }
        matched.add(prior.id);
        // The figures are re-derived; **where the fight sits is not** — its id, its sitting and the
        // zone it was filed under all survive, or a re-reading would reshuffle the History tab as a
        // side effect of correcting a number. `unsourced` clears because we just read the source.
        next.push({ ...prior, key, label: labelFor(d.stats), stats: d.stats, unsourced: undefined });
      }

      const run = db.transaction(() => {
        for (const f of replaced) deleteById.run(f.id);
        for (const f of next) insertFight.run(paramsOf(f));
      });
      run();
      saver.save();
      reportsCache.markChanged();

      // Counted from what's actually in the table afterward, not assumed from `next` — `insertFight`
      // is `INSERT OR IGNORE` (see its own comment above), so a same-second key collision within this
      // batch can still mean fewer rows landed than `next` describes even with nothing left to trim
      // them back down on purpose.
      const kept = new Set((selectAll.all() as FightRow[]).map((f) => f.id));
      const survived = next.filter((f) => kept.has(f.id));
      const refreshed = survived.filter((f) => matched.has(f.id)).length;
      const outcome: RederiveOutcome = {
        refreshed,
        added: survived.length - refreshed,
        superseded: replaced.length - matched.size,
        unsourced,
        trimmed: next.length - survived.length,
      };
      log.debug("re-derived fights", { logFile: path.basename(logFile), ...outcome });
      return outcome;
    },

    startSession(at) {
      // Keyed by the login's timestamp, not a fresh id: the same line read twice (a replayed
      // gap, a re-imported log) must mean the same sitting, or one evening becomes two.
      const next = `login:${at}`;
      if (next === session) return;
      log.debug("new play session", { at });
      session = next;
    },

    sessions: () => reportsCache.get().sessions,

    // `WHERE sessionId = ?`, not a full-table filter in JS: one sitting is a small, bounded slice of
    // a table with no cap left to bound the *whole* scan at (ADR 0243) — the same reasoning
    // `kill-log.ts`'s `kills(zone)` pushes its own filter down for.
    fights: (id) =>
      (selectBySession.all(id) as FightRow[]).map(rowToFight).map(labelled).sort(byNewest),

    // Filters `reportsCache`'s own `searchIndex` (ADR 0252, extending ADR 0247) instead of running a
    // fresh full-table scan + JSON-parse + relabel on every keystroke — `DamageHistory.tsx` asks
    // this on every one, with no debounce. `searchIndex` already carries the recomputed-on-read
    // label `labelled()` used to apply here, and is already sorted newest-first.
    search(term, limit = SEARCH_LIMIT) {
      const matches = reportsCache.get().searchIndex.filter((f) => fightMatches(f, term));
      return { fights: matches.slice(0, limit), total: matches.length };
    },

    // Grouped by **place**, not by the string each fight stored — a camp played at two difficulties
    // (ADR 0083) doesn't read as two separate, each-half-as-good camps. Computed alongside
    // `bests()`/`sessions()` in one shared background pass; see `reportsCache`, above.
    zones: () => reportsCache.get().zones,

    // Keyed by the label the *list* shows (recomputed, like `fights()`/`search()`), so the ★ flag
    // can't be looking up an opponent under a name nothing else uses any more.
    bests: () => reportsCache.get().bests,

    sources() {
      // Newest first, so a re-reading does the log you are actually playing before the old ones.
      const seen = new Map<string, string>();
      for (const f of (selectAll.all() as FightRow[]).map(rowToFight).sort(byNewest)) {
        if (!f.logFile) continue;
        const key = path.basename(f.logFile).toLowerCase();
        if (!seen.has(key)) seen.set(key, f.logFile);
      }
      return [...seen.values()];
    },

    clear() {
      deleteAll.run();
      saver.flush();
      reportsCache.markChanged();
    },

    flush() {
      saver.flush();
    },

    onCombatReportsChanged(cb) {
      reportsCache.onRefreshed(cb);
    },

    // `stats` isn't listed: it's a nested breakdown, not a scalar, and this editor only ever
    // touches one field at a time (see `electron/admin.ts`'s header on why). `key` and `logFile`
    // are absent too — they're what `rederive` matches a replayed fight back to this row by.
    admin: createSqlAdminStore<FightAdminRow>("Fights", {
      list: () => (selectAll.all() as FightRow[]).map(toAdminRow),
      idOf: (r) => r.id,
      summaryOf: (r) => `${r.label} — ${r.zone ?? "no zone"} (${r.startedAt})`,
      editable: ["zone", "label", "sessionId", "unsourced"],
      auditOf: (r) => (r.adminAudit ? (JSON.parse(r.adminAudit) as AdminAudit) : undefined),
      applyPatch: (id, field, value, audit) => {
        // `field` is always a member of `editable` by the time `createSqlAdminStore.patch` calls
        // this — safe to interpolate since it can only ever be one of this store's own fixed column
        // names, never arbitrary input. `unsourced` needs `coerceBooleanAdminPatch` (`./admin`) — see
        // its own doc for why a fight where it's still `null` needs re-coercing here.
        const bound = coerceBooleanAdminPatch(BOOLEAN_FIELDS, field, value);
        db.prepare(`UPDATE combat_fights SET ${field} = ? WHERE id = ?`).run(bound as AdminScalar, id);
        updateAudit.run(JSON.stringify(audit), id);
      },
      // A deleted row's key isn't remembered anywhere (there is no permanent key registry here,
      // unlike kill-log's — see the module doc), so removing a fight by hand and re-reading the
      // same log would refile it. That already matched the pre-SQLite behaviour: `keys` was never
      // more permanent than the array itself.
      removeRow: (id) => deleteById.run(id),
      // `createArrayAdminStore`'s `save` was mandatory, so the old array-backed admin re-stamped the
      // file on every edit or delete, matching the module doc's "rewritten... on every mutation
      // exactly as before" — `createSqlAdminStore`'s `onChanged` is optional, and was missed here.
      onChanged: () => {
        saver.save();
        reportsCache.markChanged();
      },
      // `stores()` (`electron/admin.ts`) calls this on every admin-panel open *and* every
      // `app.onDataChanged` broadcast the admin window is listening for while it's open — a
      // `list()`-based count would mean a full-table scan on both, and `combat_fights` has had no cap
      // to bound that scan at since ADR 0243, so this stays a `COUNT(*)` the same as the other three.
      counts: () => ({
        total: (countFights.get() as { n: number }).n,
        edited: (countEditedFights.get() as { n: number }).n,
      }),
    }),
  };
}

/**
 * Fold a pre-ADR-0232 `combat-history.json` into the new table, once. Unlike the other ledgers'
 * migrations, the file is **not** renamed away afterward — it goes on existing as a provenance-only
 * stub, because `data-health.ts` still reads its `provenance` field directly off disk (see the
 * module doc). Guarded by whether the file still carries a `fights` array at all, not by whether the
 * new table is empty: a stub (already migrated) has no such array, so this can't re-run on it, and a
 * player who has since cleared the history for real doesn't get it silently repopulated.
 */
function migrateFromLegacyJson(db: Database, userDataDir: string, file: string): void {
  if (!fs.existsSync(file)) return;
  const parsed = readJson<{ fights?: StoredFight[]; provenance?: DataStamp }>(file, {});
  if (!Array.isArray(parsed.fights)) return; // already a stub, or nothing was ever stored
  const fights = parsed.fights;

  const insertFight = db.prepare(`
    INSERT OR IGNORE INTO combat_fights (id, key, sessionId, label, zone, logFile, startedAt, endedAt, unsourced, statsJson)
    VALUES (@id, @key, @sessionId, @label, @zone, @logFile, @startedAt, @endedAt, @unsourced, @statsJson)
  `);

  const run = db.transaction(() => {
    for (const f of fights) insertFight.run(paramsOf(f));
  });
  run();

  // Carry the legacy stamp forward exactly as it was, rather than re-stamping at the current
  // revision: moving storage engines doesn't re-derive anything through today's rules, so a stamp
  // that was stale before migrating must stay stale, or an unattended re-read still owed would
  // silently stop happening. No stamp at all (a very old, pre-provenance file) gets a fresh one at
  // the current revision, the same as a first-ever write from this store would.
  if (parsed.provenance) fs.writeFileSync(file, JSON.stringify({ provenance: parsed.provenance }));
  else writeJson(file, {}, { concern: "combat-history" });
  log.info("migrated combat-history.json into eqlist.db", { fights: fights.length });
}
