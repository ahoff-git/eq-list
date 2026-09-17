/**
 * sqlite-store.ts — the one SQLite database every ledger that outgrows a JSON array shares
 * (ADR 0232), the way `json-store.ts` is the one reader/writer every JSON store shares.
 *
 * A single file (`eqlist.db` in `userData`) rather than one per store: a store that wants a table
 * just adds one, and `PRAGMA user_version` is enough to track every migration from every store in
 * one strictly-increasing sequence — the same "claim the next number when you write the migration,
 * not when the work is finished" rule `specs/decisions/README.md` already asks of ADRs, so two
 * stores landing migrations the same week can't silently claim the same version.
 *
 * WAL mode: a store's reads (a render's worth of queries) and its writes (a hit landing, a clear)
 * never need to block each other the way the default rollback journal would.
 *
 * ## A reminder for whoever adds the next query
 *
 * None of these tables cap what they keep any more (ADR 0232, ADR 0243) — every ledger here answers
 * "forever" to "how much do you hold", so a query's own cost is the only thing standing between a
 * feature and a full table scan once a character has played long enough. Before adding a `WHERE`,
 * `ORDER BY` or `GROUP BY` against a real column on one of these tables, check `EXPLAIN QUERY PLAN`
 * against it (or at minimum, check whether an index already covers it) rather than assuming one
 * does — and when a new access pattern doesn't have one, add the index in the same migration that
 * adds the query, the way `loot_records_source_zone_idx`/`kill_records_zone_idx`/
 * `combat_fights_sessionId_idx` did. This won't stay accurate forever as more features and filters
 * land on these tables — that's the point of writing it down here rather than trusting memory.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createLogger } from "../src/shared/logging";

const log = createLogger("sqlite-store");

/**
 * The "nothing is filtering, so keep it cheap" fetch size every ledger's `recent`/unscoped view
 * defaults to — enough for a typical evening without pulling a whole (now-uncapped) table over IPC
 * on every mount. One shared constant rather than a same-valued copy per store, so the tradeoff it
 * encodes only has to be reconsidered in one place.
 */
export const DEFAULT_LIMIT = 200;

export interface Migration {
  /** Strictly increasing across every store that shares this database — never reused, per the
   *  header. */
  version: number;
  /** What this migration is for, so a failure or a slow run names something a person recognizes. */
  label: string;
  up: (db: Database.Database) => void;
}

/**
 * Open (or create) the app's shared database and bring its schema up to date.
 *
 * `migrations` is the combined list from every store that uses this database — `main.ts` collects
 * them, since it's already the one place that constructs every store. A pending migration runs
 * inside its own transaction, so a failure partway through never leaves `user_version` claiming a
 * migration that didn't finish.
 */
export function openAppDatabase(userDataDir: string, migrations: readonly Migration[]): Database.Database {
  fs.mkdirSync(userDataDir, { recursive: true });
  const file = path.join(userDataDir, "eqlist.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db, migrations);
  return db;
}

/**
 * Escapes `%`, `_` and the escape character itself, so a caller-supplied `LIKE` value is matched
 * literally — without this, a player searching for a literal "%" or "_" would hit SQL's own wildcard
 * instead of the character they typed. Pair with `ESCAPE '\'` on the `LIKE` itself.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function migrate(db: Database.Database, migrations: readonly Migration[]): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  const pending = [...migrations].filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    const run = db.transaction(() => {
      m.up(db);
      // Interpolated rather than bound: SQLite's own `PRAGMA` statements don't accept `?` parameters,
      // and `m.version` is a migration's own compile-time-declared number, never external input.
      db.pragma(`user_version = ${m.version}`);
    });
    run();
    log.debug("migrated", { version: m.version, label: m.label });
  }
}
