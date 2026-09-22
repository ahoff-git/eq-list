/**
 * kill-log.ts — what died, where it happened, and how much to believe any of it.
 *
 * A heatmap can only be as accurate as the player is: EQ logs a position **only when you
 * type `/loc`**, so a kill's location is always inferred from the last fix. That's exact at
 * a static camp and a guess the moment you move — so rather than pretend, every kill is
 * stored with the evidence behind it and a confidence figure derived from it:
 *
 *   - the fix used, and **how old it was** when the kill landed;
 *   - the fix before it, giving distance, elapsed time and an **implied speed** — a player
 *     who was demonstrably moving was probably not where the last fix said;
 *   - a **dead-reckoned** guess when both fixes are known: the same course and speed,
 *     carried forward for the age of the fix. Flagged as a guess, because it is one.
 *
 * The log reports every death in earshot, not just yours, so each record also carries
 * **who killed it**. Other people's kills are worth keeping — they are still evidence that
 * the thing spawns here — but they are marked, because counting them as yours would quietly
 * wreck every drop rate: you never looted those corpses.
 *
 * Deliberately generous: everything that went into the guess is recorded, so the display
 * can be reworked — plot only what's trustworthy, fade by confidence, or show the drift —
 * without having to collect it all again.
 *
 * ## Backed by SQLite, and no longer capped either
 *
 * ([ADR 0232](../specs/decisions/0232-a-ledger-that-outlives-its-cap-is-a-database.md), following
 * `faction-log.ts`'s and `loot-log.ts`'s migration; the `MAX_KILLS` cap itself came off a release
 * later than those two, in [ADR 0243](../specs/decisions/0243-remove-the-remaining-storage-caps.md).)
 * The cap was never an artifact of an array needing to fit in memory — it was a deliberately bounded
 * window a heatmap seemed to want, "many evenings" of raw detail, with the *knowledge* (drop rates,
 * roam areas) already kept forever regardless via `mob_observations_frozen`
 * ([ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)). SQLite removes the
 * reason that bound existed: `kill_records` now keeps every kill forever, the same as
 * `faction_hits`/`loot_records`, and what used to be the cap's *other* job — keeping a query cheap —
 * is now each query's own — `kills(zone?)` and `recentCandidates` (below) bound what they fetch
 * instead of relying on the whole table staying small. `retire()`/`mob_observations_frozen` didn't go
 * anywhere: `clear("records")` still uses them to fold what the held detail taught into permanent
 * knowledge before forgetting it, same as always — only the automatic *insert-time* eviction that used
 * to feed them is gone.
 *
 * What the SQLite move separately removes is the three permanent dedup-key **Sets**
 * (`killKeys`/`lootKeys`/`coinKeys`) — kept forever independent of the cap since ADR 0207, which meant
 * every single `save()` re-serialized the *entire* accumulated history of keys into one JSON array.
 * `kill_seen_keys`/`loot_seen_keys`/`coin_seen_keys` are the same permanent identity, as ordinary
 * indexed tables instead: an append is one row, not a rewrite of everything ever seen.
 *
 * ## Identity survives longer than the record does
 *
 * [ADR 0033](../specs/decisions/0033-eating-a-log-is-idempotent.md) promises that re-reading
 * a log — by hand, or unattended after a release bumps a revision
 * ([ADR 0129](../specs/decisions/0129-a-release-can-ask-for-a-re-read.md)) — records each real
 * event once. That promise used to live entirely on the *held* records: a kill's dedup key was
 * indexed while `kills` held it and forgotten the moment it retired into an aggregate — automatically
 * once it aged past the since-removed `MAX_KILLS` cap, or (still today) explicitly, via
 * `clear("records")`. A `MobObservation` has no line identity to re-derive a key from, so a log
 * re-read after that point recognised nothing and recorded, then retired, the same history a
 * second time — a month of real play is tens of thousands of kills, so for a long-lived
 * character this was most of what a re-read would ever touch
 * ([ADR 0207](../specs/decisions/0207-a-retired-kill-still-remembers-its-own-line.md)).
 *
 * Every kill/loot/coin key this log has ever recorded is kept **forever**, independent of which
 * records currently sit in `kill_records` — see `kill_seen_keys` et al. below.
 *
 * ## `kill-log.json` still exists, but only as a provenance stamp
 *
 * `data-health.ts` and `log-reread.ts`'s unattended-re-read mechanism (ADR 0129) read this file's
 * `provenance` field directly off disk, independent of this store. The file goes on existing as a
 * tiny stub carrying nothing but the stamp, rewritten (still debounced, still through
 * `json-store.ts`) on every mutation — a migrated-away file would read as `state: "absent"` forever,
 * quietly disabling the self-healing re-read for this concern.
 *
 * ## Same second, different mob
 *
 * EQ's timestamp is one-second resolution, and an area spell can kill — or loot — more than one
 * same-named thing inside it. A key built from nothing but the timestamp, the name and who did it
 * collides for two *genuinely different* real events exactly as easily as for a genuine replay,
 * and until ADR 0207 collided the same way: the second one was silently dropped, undercounting the
 * kill and misattributing its corpse's loot onto the survivor. Both `killKey` and `lootKey` carry
 * an ordinal — **which occurrence of this exact signature this is** — so two real simultaneous
 * events get two rows, while a true replay still lands on the same ordinals it did the first time.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import { createLogger } from "../src/shared/logging";
import { createNameRegistry } from "../src/shared/name-registry";
import { isYours } from "../src/shared/combat-parser";
import { observeMobs, sumObservations, withAreas, type MobObservation } from "../src/shared/mob-stats";
import { samePlace } from "../src/shared/zones/place";
import type { AdminAudit, AdminScalar } from "../src/shared/admin";
import type { DataStamp } from "../src/shared/data-provenance";
import type { ForgetScope, CoinEvent, KillRecord, LocEvent, LootEvent } from "../src/shared/types";
import { createSaver, readJson, writeJson } from "./json-store";
import { round } from "../src/shared/numbers";
import { DEFAULT_LIMIT, type Migration } from "./sqlite-store";
import { coerceBooleanAdminPatch, createSqlAdminStore, triNull, type AdminStore } from "./admin";
import { createBackgroundCache } from "./background-cache";
import {
  computeObservations,
  rowToFrozenObservation,
  rowToRecord,
  type FrozenObservationRow,
  type KillRow,
} from "./kill-observations";

const log = createLogger("kill-log");

/** Kills arrive in bursts; coalesce the provenance-stamp writes the same way the old full-file
 *  saver did. */
const WRITE_DEBOUNCE_MS = 3000;

/** A fix this fresh is treated as exact — you can't have gone far. */
const FRESH_SEC = 10;

/** Past this, the position isn't worth trusting: recorded, but not to be plotted as fact. */
const TRUST_HORIZON_SEC = 60;

/**
 * Movement below this between two fixes reads as standing still. `/loc` is only ever typed
 * by hand, so two fixes a few units apart mean a player who shuffled at their camp, not one
 * who travelled — and a camped player's position is exactly what a heatmap wants to trust.
 */
const STILL_UNITS = 5;

/**
 * How long after a kill a drop is still taken to have come from that corpse. The log puts
 * the loot lines immediately after, and looting a corpse you killed a minute ago is normal,
 * so this is generous — but it's matched by name too, which does the real work.
 */
const LOOT_WINDOW_MS = 120_000;

/**
 * How close behind an item line a coin line still counts as the same looting action. Coin and
 * items come off a corpse together, so this is deliberately tight — past it, the coin is from
 * a later corpse and the item line says nothing about it.
 */
const COIN_FOLLOWS_LOOT_MS = 10_000;

/**
 * `drainTouched`'s own cap — see its call site. Well clear of ordinary live combat (a coalesce
 * window would need hundreds of kills/loots/coins inside ~500ms to reach it) and well under
 * SQLite's own bound on how many `?` a query may bind, so `byIds` never gets asked to.
 */
const TOUCHED_CAP = 500;


export const KILL_LOG_MIGRATIONS: readonly Migration[] = [
  {
    version: 3,
    label: "kill_records",
    up(db) {
      db.exec(`
        CREATE TABLE kill_records (
          id TEXT PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          logId INTEGER NOT NULL,
          at TEXT NOT NULL,
          mob TEXT NOT NULL,
          killer TEXT,
          mine INTEGER,
          sharedBy TEXT,
          named INTEGER,
          killerNamed INTEGER,
          zone TEXT,
          y REAL,
          x REAL,
          fixAgeSec REAL,
          prevY REAL,
          prevX REAL,
          movedUnits REAL,
          movedSec REAL,
          speed REAL,
          guessedY REAL,
          guessedX REAL,
          confidence REAL NOT NULL,
          dropsJson TEXT,
          dropsKeyed INTEGER NOT NULL DEFAULT 0,
          coin INTEGER,
          adminAudit TEXT
        );
        CREATE INDEX kill_records_at_idx ON kill_records(at);

        CREATE TABLE kill_seen_keys (key TEXT PRIMARY KEY, base TEXT NOT NULL);
        CREATE INDEX kill_seen_keys_base_idx ON kill_seen_keys(base);

        CREATE TABLE loot_seen_keys (key TEXT PRIMARY KEY, base TEXT NOT NULL);
        CREATE INDEX loot_seen_keys_base_idx ON loot_seen_keys(base);

        CREATE TABLE coin_seen_keys (key TEXT PRIMARY KEY);

        CREATE TABLE mob_observations_frozen (
          key TEXT PRIMARY KEY,
          mob TEXT NOT NULL,
          zone TEXT NOT NULL,
          kills INTEGER NOT NULL,
          dropsJson TEXT NOT NULL,
          copper INTEGER,
          areasJson TEXT NOT NULL,
          lastAt TEXT NOT NULL,
          by TEXT,
          byId TEXT
        );
      `);
    },
  },
  {
    version: 6,
    label: "kill_records_zone_idx",
    up(db) {
      // `kills(zone)` (ADR 0243) resolves a place to its raw logged spellings and pushes them into a
      // `zone IN (...)` clause instead of decoding and filtering every held kill in JS — cheap only
      // with an index behind it, now that the table it scans has no cap left to bound its growth.
      db.exec(`CREATE INDEX kill_records_zone_idx ON kill_records(zone);`);
    },
  },
];

export interface KillLog {
  /** Your character's name, so your own kills — and your pet's death — can be told apart. */
  setPlayer(name: string): void;
  /**
   * Say that what follows may be a **replay** — a log read from the top, which can legitimately
   * re-encounter a line already recorded. Live-watching never calls this, because it never
   * replays: every line it sees is, by construction, arriving for the first time. Call it once
   * before digesting a whole file, not per line — see `record`/`noteLoot` and
   * [ADR 0207](../specs/decisions/0207-a-retired-kill-still-remembers-its-own-line.md).
   */
  startReplay(): void;
  /** A `/loc` line, and the zone it was taken in. */
  noteLoc(loc: LocEvent, zone: string | null): void;
  /**
   * A kill, placed at the best guess available and scored for how good that guess is. Returns
   * whether it was newly recorded — `false` when the same log line was already seen (a re-import,
   * or a log eaten after it was watched live), so an importer can count only what it actually added.
   */
  record(
    mob: string,
    killer: string,
    zone: string | null,
    at: string,
    logId: number,
    named?: boolean,
    killerNamed?: boolean,
  ): boolean;
  /** A drop, attached to the kill it most likely came from (by corpse and time). Returns whether
   *  it was newly attached — `false` if this loot line was already folded in. */
  noteLoot(event: LootEvent): boolean;
  /**
   * Coin taken off a corpse, attached to the kill it came from. Returns whether it was newly
   * attached — `false` when the line was already folded in, or when no corpse can claim it.
   * Only `from: "corpse"` coin belongs here; an auto-sold item's is the item's, not the mob's.
   */
  noteCoin(event: CoinEvent): boolean;
  /**
   * Kill records, newest first. Given a `zone`, every one this place has ever recorded — narrowed
   * server-side to every raw spelling that folds to it (ADR 0083/0075), matching what a heatmap
   * wants: complete detail for the one camp it's drawing. With none, a bounded recent window instead
   * (`DEFAULT_LIMIT`) — the one caller that asks unscoped only wants "recently", not "ever"
   * (ADR 0243). `observations()` is what covers everything ever killed, at every camp, regardless.
   */
  kills(zone?: string): KillRecord[];
  /**
   * Full records for exactly these ids — a `SELECT ... WHERE id IN (...)` against `kill_records`'
   * own primary key. The point-lookup half of `kills(zone)`'s incremental refresh path
   * ([ADR 0253](../specs/decisions/0253-the-map-window-patches-in-only-touched-kills.md)):
   * `useKills` calls this with whatever `drainTouched()` last handed back, instead of refetching a
   * whole camp's history for a handful of changed rows.
   */
  byIds(ids: string[]): KillRecord[];
  /**
   * Ids `record`/`noteLoot`/`noteCoin` touched since the last call, then forgotten. `main.ts`'s
   * coalesced `killsChanged` broadcast drains this once per notice and sends the ids along; every
   * *other* `killsChanged` broadcast (an admin edit, `clear`, a log re-read) still sends none, which
   * stays the existing "assume everything changed, refetch fully" signal those bulk operations
   * already relied on — this only names what changed for the high-frequency live path.
   */
  drainTouched(): string[];
  /**
   * Everything your kills have taught, per mob and zone: every record `kill_records` still holds
   * **plus** whatever a past `clear("records")` already folded into permanent knowledge before
   * forgetting the detail behind it
   * ([ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)). This — not
   * `kills()` — is the one place that reaches every kill ever recorded regardless of zone, so a drop
   * rate or a roam area is never missing a camp `kills()`'s own default limit left out.
   */
  observations(): MobObservation[];
  /**
   * Fires once a *background* recompute of `observations()` actually lands a fresher answer (ADR
   * 0246) — never on every call, and never for a merely-synchronous one. `main.ts` wires this the
   * same way every other tracker's `onChanged` is wired: broadcast `killsChanged` again, so a
   * window whose read already fell back to the last-known-good value gets a chance to see the
   * fresher one land a moment later. One listener, like every other tracker's `onChanged` here.
   */
  onObservationsChanged(cb: () => void): void;
  /**
   * How many times the records have changed this run. Cheap by contract — it reads a counter and
   * touches no record — so a caller can ask it on a timer to find out whether a re-derivation is
   * worth paying for.
   */
  version(): number;
  /**
   * Forget the kill records. **Observations survive by default** (ADR 0056): they are every drop
   * rate and roam area you have ever learned, they took months of play to gather, and they cannot
   * be rebuilt from a log you no longer have. Only `"everything"` — a second, explicit answer —
   * takes them too.
   */
  clear(scope?: ForgetScope): void;
  /** No pending write ever outlives this call — every write here is already synchronous, so this
   *  is kept only so a caller that flushed the old debounced JSON writer still has something to call. */
  flush(): void;
  /** The hidden admin panel's view of these records — see `electron/admin.ts`. */
  admin: AdminStore;
}

/** Distance in EQ units between two points (the map's own coordinate space). */
function distance(a: { y: number; x: number }, b: { y: number; x: number }): number {
  return Math.round(Math.hypot(a.y - b.y, a.x - b.x));
}

/**
 * The base signature a kill's key is built from — the log line behind it, NUL-joined so a name
 * can't forge a key. Two reads of the same line (a re-import, or a log eaten after it was watched
 * live) yield the same signature, which is what lets the log recognise each real kill.
 *
 * Not the final key on its own: see `ordinalFor` for why.
 */
function baseKillKey(at: string, mob: string, killer: string): string {
  return `${at}\0${mob.toLowerCase()}\0${killer.toLowerCase()}`;
}

/** The same idea for a loot line's signature. */
function baseLootKey(at: string, item: string, source: string): string {
  return `${at}\0${item.toLowerCase()}\0${source.toLowerCase()}`;
}

/**
 * The stable identity of a kill — its signature plus which occurrence of it this is. `ordinal` is
 * almost always `0`; see `ordinalFor` for the one case it isn't.
 */
function killKey(at: string, mob: string, killer: string, ordinal: number): string {
  return `${baseKillKey(at, mob, killer)}#${ordinal}`;
}

/** The same idea for a loot line, so re-reading it doesn't add the drop to a corpse twice. */
function lootKey(at: string, item: string, source: string, ordinal: number): string {
  return `${baseLootKey(at, item, source)}#${ordinal}`;
}

/**
 * Which ordinal this occurrence of `base` should take — or `null`, meaning it already has one and
 * this call is a duplicate.
 *
 * **Not replaying (`pass` is `null`)**: always the next ordinal not yet on permanent record.
 * Correct because a live call is, by construction, a genuinely new occurrence — the log-watcher
 * never revisits a byte it has already consumed — so "not yet recorded" and "new" mean the same
 * thing.
 *
 * **Replaying**: the same file can legitimately be read more than once (twice by hand, or once
 * live and once on an eaten log later — ADR 0033's own examples), so "not yet recorded" no longer
 * proves anything: a second pass hasn't recorded *anything* at its own start. What it can trust
 * instead is **which occurrence of `base` this is within the current pass** — `pass`, reset once
 * per replay by `startReplay` — compared against how many are already on permanent record. The Kth
 * occurrence this pass is new only once fewer than K are already recorded; otherwise a prior pass
 * already accounted for it.
 */
function ordinalFor(base: string, recordedCount: (base: string) => number, pass: Map<string, number> | null): number | null {
  const already = recordedCount(base);
  if (!pass) return already;
  const occurrence = (pass.get(base) ?? 0) + 1;
  pass.set(base, occurrence);
  return occurrence <= already ? null : already;
}

/**
 * And for a coin line. It names no item or source — the log says only how much and that it
 * came off "the corpse" — so the timestamp and the amount are the whole identity available.
 * Two identical amounts in the same second would collapse into one, which is the right way
 * to be wrong: under-counting coin is a smaller lie than doubling it on every re-import.
 */
function coinKey(at: string, copper: number): string {
  return `${at}\0coin\0${copper}`;
}

// `KillRow`/`rowToRecord`/`FrozenObservationRow`/`rowToFrozenObservation` live in
// `kill-observations.ts` now — that module needs them dependency-free (no import back onto this
// file) so a background worker can read them without pulling in `createKillLog` and everything it
// closes over. See its own header.

function boolCol(v: boolean | undefined): number | null {
  return v === undefined ? null : v ? 1 : 0;
}

/**
 * `KillRow` with its three genuinely-boolean columns restored to real booleans, for the admin panel
 * only. `admin.ts`'s generic field-typing (`adminFieldType`) infers a field's type from whatever its
 * live JS value actually is — a raw SQLite integer column reads back as `number`, not `boolean` — so
 * without this, `named`/`killerNamed`/`mine` would show in the hidden admin panel as a plain number
 * box accepting any integer, rather than the `true`/`false` toggle every other boolean field in the
 * app gets (and the one these three showed before this store moved off a plain JS array).
 */
type KillAdminRow = Omit<KillRow, "named" | "killerNamed" | "mine"> & {
  named: boolean | null;
  killerNamed: boolean | null;
  mine: boolean | null;
};
function toAdminRow(r: KillRow): KillAdminRow {
  return { ...r, named: triNull(r.named), killerNamed: triNull(r.killerNamed), mine: triNull(r.mine) };
}

/** Which admin-editable columns are genuinely boolean — see `applyPatch`'s own comment on why this
 *  has to be re-checked there too, not just in `toAdminRow`. */
const BOOLEAN_FIELDS = new Set(["named", "killerNamed", "mine"]);

export function createKillLog(db: Database, userDataDir: string): KillLog {
  const file = path.join(userDataDir, "kill-log.json");
  migrateFromLegacyJson(db, userDataDir, file);
  // Carries **only** the provenance stamp now — see the module doc.
  const saver = createSaver(file, "kill log", () => ({}), WRITE_DEBOUNCE_MS, { concern: "kill-log" });

  const insertKill = db.prepare(`
    INSERT INTO kill_records
      (id, key, logId, at, mob, killer, mine, sharedBy, named, killerNamed, zone,
       y, x, fixAgeSec, prevY, prevX, movedUnits, movedSec, speed, guessedY, guessedX,
       confidence, dropsJson, dropsKeyed, coin)
    VALUES
      (@id, @key, @logId, @at, @mob, @killer, @mine, @sharedBy, @named, @killerNamed, @zone,
       @y, @x, @fixAgeSec, @prevY, @prevX, @movedUnits, @movedSec, @speed, @guessedY, @guessedX,
       @confidence, @dropsJson, @dropsKeyed, @coin)
  `);
  const selectAll = db.prepare(`SELECT * FROM kill_records ORDER BY rowid DESC`);
  const selectRecentKills = db.prepare(`SELECT * FROM kill_records ORDER BY rowid DESC LIMIT ?`);
  const selectDistinctKillZones = db.prepare(`SELECT DISTINCT zone FROM kill_records WHERE zone IS NOT NULL`);
  // ORDER BY matters here (see `createNameRegistry`'s first-seen-wins rule below): without it,
  // SQLite's own DISTINCT row order is implementation-defined rather than newest-first, and which
  // spelling of a mob wins as canonical after a restart would drift with the query plan instead of
  // staying pinned to the most recent kill record, same as before this store moved to SQLite.
  const selectDistinctMobs = db.prepare(`SELECT DISTINCT mob FROM kill_records ORDER BY rowid DESC`);
  const countKills = db.prepare(`SELECT COUNT(*) as n FROM kill_records`);
  const countEditedKills = db.prepare(`SELECT COUNT(*) as n FROM kill_records WHERE adminAudit IS NOT NULL`);
  const deleteKillById = db.prepare(`DELETE FROM kill_records WHERE id = ?`);
  const deleteAllKills = db.prepare(`DELETE FROM kill_records`);
  const updateDrops = db.prepare(`UPDATE kill_records SET dropsJson = ?, dropsKeyed = 1 WHERE id = ?`);
  const updateCoin = db.prepare(`UPDATE kill_records SET coin = ? WHERE id = ?`);
  const selectById = db.prepare(`SELECT * FROM kill_records WHERE id = ?`);
  const selectMineByMob = db.prepare(`SELECT id, mob FROM kill_records`);
  const updateAudit = db.prepare(`UPDATE kill_records SET adminAudit = ? WHERE id = ?`);

  const insertKillSeen = db.prepare(`INSERT OR IGNORE INTO kill_seen_keys (key, base) VALUES (?, ?)`);
  const countKillSeen = db.prepare(`SELECT COUNT(*) as n FROM kill_seen_keys WHERE base = ?`);
  const insertLootSeen = db.prepare(`INSERT OR IGNORE INTO loot_seen_keys (key, base) VALUES (?, ?)`);
  const countLootSeen = db.prepare(`SELECT COUNT(*) as n FROM loot_seen_keys WHERE base = ?`);
  const insertCoinSeen = db.prepare(`INSERT OR IGNORE INTO coin_seen_keys (key) VALUES (?)`);
  const hasCoinSeen = db.prepare(`SELECT 1 FROM coin_seen_keys WHERE key = ?`);
  const deleteAllSeenKeys = db.transaction(() => {
    db.prepare(`DELETE FROM kill_seen_keys`).run();
    db.prepare(`DELETE FROM loot_seen_keys`).run();
    db.prepare(`DELETE FROM coin_seen_keys`).run();
  });

  const selectFrozen = db.prepare(`SELECT * FROM mob_observations_frozen`);
  const upsertFrozen = db.prepare(`
    INSERT INTO mob_observations_frozen (key, mob, zone, kills, dropsJson, copper, areasJson, lastAt, by, byId)
    VALUES (@key, @mob, @zone, @kills, @dropsJson, @copper, @areasJson, @lastAt, @by, @byId)
    ON CONFLICT(key) DO UPDATE SET
      kills = excluded.kills, dropsJson = excluded.dropsJson, copper = excluded.copper,
      areasJson = excluded.areasJson, lastAt = excluded.lastAt, by = excluded.by, byId = excluded.byId
  `);
  const deleteAllFrozen = db.prepare(`DELETE FROM mob_observations_frozen`);

  function recordedKillCount(base: string): number {
    return (countKillSeen.get(base) as { n: number }).n;
  }
  function recordedLootCount(base: string): number {
    return (countLootSeen.get(base) as { n: number }).n;
  }

  function frozenObservations(): MobObservation[] {
    return (selectFrozen.all() as FrozenObservationRow[]).map(rowToFrozenObservation);
  }

  function freezeObservations(obs: readonly MobObservation[]): void {
    for (const o of obs) {
      const withA = withAreas(o);
      upsertFrozen.run({
        key: `${o.mob.toLowerCase()}|${o.zone}`,
        mob: o.mob,
        zone: o.zone,
        kills: o.kills,
        dropsJson: JSON.stringify(o.drops),
        copper: o.copper ?? null,
        areasJson: JSON.stringify(withA.areas),
        lastAt: o.lastAt,
        by: o.by ?? null,
        byId: o.byId ?? null,
      });
    }
  }

  /** A record is leaving the log. Fold what it taught into the frozen observations first — its
   *  kill counts towards the mob's drop rate whether or not we still hold the row it came from,
   *  and its position is part of where that mob lives. */
  function retire(leaving: KillRecord[]): void {
    if (!leaving.length) return;
    const merged = sumObservations(frozenObservations(), observeMobs(leaving));
    freezeObservations(merged);
    log.debug("retired", leaving.length, "kill records into", merged.length, "observations");
  }

  /** How many times the records have changed, for a reader that would otherwise have to
   *  re-derive them to find out (`peer-share.ts`'s `ShareSource`). In memory and never
   *  persisted — it exists to answer "has this changed since you last asked", a question
   *  that only has meaning within one run. */
  let version = 0;

  // `observations()` used to recompute a full-table scan + fold on every read — cheap once ADR
  // 0245 fixed `clusterAreas`'s own blowup, but still real, and it ran on the thread every
  // window's IPC shares, on every single kill. `createBackgroundCache` (ADR 0247, generalizing
  // ADR 0246's original one-off) keeps that off the main thread instead, while keeping
  // `observations()` exactly as synchronous and correct as it always was — see its own module doc
  // for the contract, and why `dbFile: null` for an in-memory database (every test in this file)
  // is the right answer rather than a special case.
  const observationsCache = createBackgroundCache<MobObservation[]>({
    label: "kill observations",
    computeSync: () => computeObservations(db),
    dbFile: db.memory ? null : db.name,
    modulePath: path.join(__dirname, "kill-observations.js"),
    exportName: "computeObservations",
  });

  function bump(): void {
    version++;
    saver.save(); // re-stamps provenance — see the module doc on why this file still exists
    observationsCache.markChanged();
  }

  /** Ids `record`/`noteLoot`/`noteCoin` touched since the last `drainTouched()` call — what lets
   *  `main.ts`'s coalesced `killsChanged` broadcast name exactly what changed instead of "something
   *  did", so `useKills` can patch those rows in rather than refetch a whole camp's history (ADR
   *  0253). Bounded by live combat during ordinary play — but `log-import.ts`'s bulk import calls
   *  `record`/`noteLoot`/`noteCoin` per line too, and its own broadcast (`CH.killsChanged` sent
   *  directly with no ids, bypassing `main.ts`'s coalesce) never drains this, so a big import
   *  followed much later by one live kill could otherwise hand `drainTouched()` a years-old backlog.
   *  `TOUCHED_CAP` is `drainTouched`'s own answer to that — see it there. */
  let touched: string[] = [];

  function touch(id: string): void {
    touched.push(id);
    bump();
  }

  let player = "";
  /** The last two position fixes, newest first, each tagged with the zone it was taken in —
   *  a fix from the zone you just left says nothing about where you are now. */
  let fixes: { y: number; x: number; at: number; zone: string | null }[] = [];
  /** The corpse an item was last taken from, and when. It's the best evidence available for
   *  where a coin line's money came from — see `noteCoin`. Deliberately doesn't cache `mine`:
   *  `noteCoin` re-reads the row fresh at check time, so an admin edit to `mine` made between the
   *  drop attaching and the coin line landing is seen, the same way it would be if this held a live
   *  reference to the row the way the old array-backed store's `lastLooted.kill` did. */
  let lastLooted: { killId: string; at: number } | null = null;
  /** One spelling per mob. Seeded from what's already stored so the canonical name survives
   *  a restart — otherwise the spelling the file uses and the spelling this session picks
   *  could differ, and the same mob would show up twice. */
  const { canon } = createNameRegistry((selectDistinctMobs.all() as { mob: string }[]).map((r) => r.mob));
  /** `null` outside a replay — see `startReplay` and `ordinalFor`. */
  let replayKills: Map<string, number> | null = null;
  let replayLoot: Map<string, number> | null = null;

  /** You or anything of yours, against the current `player` — `isYours` is shared with the
   *  damage meter so the two can't disagree about what counts as yours. */
  const isMine = (name: string): boolean => isYours(name, player);

  /**
   * Kill records within `LOOT_WINDOW_MS` of `atMs`, newest first — what `noteLoot`/`noteCoin` scan
   * for a corpse to credit. Filtered in JS rather than a SQL `WHERE at >= ?`: the app's own
   * timestamps carry no zone offset (`stamp()`-style local time), and computing a cutoff with
   * `Date#toISOString()` (always UTC) would compare mismatched clocks the instant the machine
   * isn't in UTC — exactly the bug this replaces.
   *
   * `selectAll.iterate()`, not `.all()`: `kill_records` has no cap any more (ADR 0243), so a corpse
   * from an hour into a busy session no longer guarantees the match sits near the front of a small
   * table — `.iterate()` pulls one row at a time off SQLite's own cursor, so the `break` below stops
   * the underlying scan the moment it's past the window instead of first materializing every row the
   * table has ever held into JS objects just to walk away from most of them.
   */
  function recentCandidates(atMs: number): KillRow[] {
    const out: KillRow[] = [];
    for (const row of selectAll.iterate() as IterableIterator<KillRow>) {
      const killAt = Date.parse(row.at);
      if (Number.isNaN(killAt)) continue; // a bad timestamp shouldn't end the search
      if (atMs - killAt > LOOT_WINDOW_MS) break; // older than the window: so is everything past it
      out.push(row);
    }
    return out;
  }

  /** Fold a loot line into a corpse: record the item, so a replay is a no-op. `at` is the *loot
   *  line's* own timestamp, not the kill's — it's what a coin line moments later is measured
   *  against, and the kill could have happened long before this corpse was actually looted. */
  function attachDrop(row: KillRow, item: string, at: number): void {
    const drops: string[] = row.dropsJson ? JSON.parse(row.dropsJson) : [];
    drops.push(item);
    updateDrops.run(JSON.stringify(drops), row.id);
    lastLooted = { killId: row.id, at };
    touch(row.id);
  }

  /** The same for coin: added to whatever this corpse has already paid out. */
  function attachCoin(killId: string, prevCoin: number | null, copper: number): void {
    updateCoin.run((prevCoin ?? 0) + copper, killId);
    touch(killId);
  }

  return {
    setPlayer(name) {
      player = name.trim();
      if (!player) return;
      // Now that we know who you are, records that were only ever your pet dying can go.
      // They were filed before the killer was captured and read as mobs you farm — one with
      // an observed drop rate of nothing, dragging down a camp report it was never part of.
      const dropped = (selectMineByMob.all() as { id: string; mob: string }[]).filter((r) => isMine(r.mob));
      if (!dropped.length) return;
      log.debug("dropped", dropped.length, "of your own deaths from the kill log");
      const drop = db.transaction(() => {
        for (const r of dropped) deleteKillById.run(r.id);
      });
      drop();
      lastLooted = null; // it may point at one of the records just dropped
      // Their keys stay — see the module doc. `isMine(mob)` below refuses the same line again
      // regardless, once `player` is set, so nothing is lost by no longer forgetting them.
      bump();
    },

    startReplay() {
      replayKills = new Map();
      replayLoot = new Map();
    },

    noteLoc(loc, zone) {
      const at = Date.parse(loc.at);
      if (Number.isNaN(at)) return;
      fixes = [{ y: loc.y, x: loc.x, at, zone }, ...fixes].slice(0, 2);
    },

    record(rawMob, killer, zone, atIso, logId, named, killerNamed) {
      const at = Date.parse(atIso);
      if (Number.isNaN(at)) return false;
      const mob = canon(rawMob);
      // "Kainos`s warder has been slain by a kobold!" reads as a kill to the line parser,
      // but your own pet dying is not something you killed — and left in, it becomes a mob
      // you appear to farm, complete with an observed drop rate of nothing.
      if (isMine(mob)) return false;

      // The same log line read twice — a re-import, or a log eaten after it was watched live —
      // must record one kill, not two, while a genuinely different kill sharing this exact second,
      // mob and killer still gets its own row. `ordinalFor` is what tells them apart; `null` means
      // this exact occurrence is already on record.
      const base = baseKillKey(atIso, mob, killer);
      const ordinal = ordinalFor(base, recordedKillCount, replayKills);
      if (ordinal === null) return false;
      const key = killKey(atIso, mob, killer, ordinal);

      // Only fixes from this zone can place this kill: zoning teleports you, so the last
      // `/loc` from the zone you left is not a stale position, it's a wrong one.
      const usable = fixes.filter((f) => f.zone === zone);
      const [fix, prev] = usable;

      // No fix at all: still worth recording that the kill happened, with no position.
      const ageSec = fix ? Math.max(0, Math.round((at - fix.at) / 1000)) : undefined;
      const movedSec = fix && prev ? Math.max(0, Math.round((fix.at - prev.at) / 1000)) : undefined;
      const movedUnits = fix && prev ? distance(fix, prev) : undefined;
      const speed = movedSec && movedUnits !== undefined ? Math.round(movedUnits / movedSec) : undefined;

      // Dead reckoning: same course and speed, carried on for as long as the fix is old.
      // Only offered when there's a course to extend and the player was actually moving.
      const moved = movedUnits !== undefined && movedUnits > STILL_UNITS;
      const guessed =
        fix && prev && ageSec !== undefined && movedSec && moved
          ? {
              y: Math.round(fix.y + ((fix.y - prev.y) / movedSec) * ageSec),
              x: Math.round(fix.x + ((fix.x - prev.x) / movedSec) * ageSec),
            }
          : undefined;

      const record: KillRecord = {
        id: randomUUID(),
        logId,
        at: atIso,
        mob,
        killer,
        key,
        mine: isMine(killer),
        named,
        killerNamed,
        zone: zone ?? undefined,
        y: fix?.y,
        x: fix?.x,
        fixAgeSec: ageSec,
        prevY: prev?.y,
        prevX: prev?.x,
        movedUnits,
        movedSec,
        speed,
        guessedY: guessed?.y,
        guessedX: guessed?.x,
        confidence: confidenceFor(ageSec, moved, isMine(killer)),
      };

      const insert = db.transaction(() => {
        insertKill.run({
          id: record.id,
          key: record.key,
          logId: record.logId,
          at: record.at,
          mob: record.mob,
          killer: record.killer ?? null,
          mine: boolCol(record.mine),
          sharedBy: null,
          named: boolCol(record.named),
          killerNamed: boolCol(record.killerNamed),
          zone: record.zone ?? null,
          y: record.y ?? null,
          x: record.x ?? null,
          fixAgeSec: record.fixAgeSec ?? null,
          prevY: record.prevY ?? null,
          prevX: record.prevX ?? null,
          movedUnits: record.movedUnits ?? null,
          movedSec: record.movedSec ?? null,
          speed: record.speed ?? null,
          guessedY: record.guessedY ?? null,
          guessedX: record.guessedX ?? null,
          confidence: record.confidence,
          dropsJson: null,
          dropsKeyed: 0,
          coin: null,
        });
        insertKillSeen.run(key, base);
      });
      insert();
      touch(record.id);
      return true;
    },

    noteLoot(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || !event.source) return false;
      const source = event.source.toLowerCase();
      // The same loot line read twice must not add the drop twice, while two corpses genuinely
      // dropping the identical item in the identical second must both count — the same
      // signature-plus-ordinal question `record` asks, recognised before any corpse-matching.
      const base = baseLootKey(event.at, event.item, source);
      const ordinal = ordinalFor(base, recordedLootCount, replayLoot);
      if (ordinal === null) return false;
      const key = lootKey(event.at, event.item, source, ordinal);

      // Corpses linger and are looted in any order, so which one an item came from is a
      // guess whenever the same mob died more than once nearby. Prefer the newest corpse
      // that isn't already holding this item: two identical items and two corpses is far
      // more likely one each than both from one — and piling every drop onto the newest
      // kill would leave its neighbours looking like they dropped nothing, which is what
      // an observed drop rate is built from.
      const candidates = recentCandidates(at);

      let fallback: KillRow | null = null;
      for (const row of candidates) {
        if (row.mob.toLowerCase() !== source) continue;
        const drops: string[] = row.dropsJson ? JSON.parse(row.dropsJson) : [];
        if (!fallback) fallback = row;
        if (drops.includes(event.item)) continue;
        attachDrop(row, event.item, at);
        insertLootSeen.run(key, base);
        return true;
      }
      // Every candidate corpse already holds one. For a corpse whose drops we've been keying that
      // means a genuine second drop; for one recorded before keying (`dropsKeyed` never set) it's
      // far more likely this same line replayed — so don't inflate the rate, just remember we've
      // seen it.
      if (fallback) {
        if (fallback.dropsKeyed) {
          attachDrop(fallback, event.item, at);
          insertLootSeen.run(key, base);
          return true;
        }
        insertLootSeen.run(key, base);
      }
      return false;
    },

    /**
     * Coin off a corpse. Harder to place than an item, because the line names nothing —
     * "You receive 3 gold from the corpse." — so there's no name to match on and the guess
     * has to come from what the log was doing at the time.
     *
     * Two signals, best first. **The corpse you were just looting**: coin arrives as part of
     * one looting action, so an item line moments earlier names the corpse the money came
     * from, and that beats any timing argument. Failing that, **the newest kill of yours in
     * the window** — the same reasoning as a drop, minus the name check that normally does
     * the real work, so it's the weaker answer and only used when there's nothing better.
     *
     * Strangers' corpses are never candidates: you didn't loot them, and crediting a mob with
     * money you never took would inflate exactly the figure this exists to get right.
     */
    noteCoin(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || event.from !== "corpse" || event.copper <= 0) return false;
      const key = coinKey(event.at, event.copper);
      if (hasCoinSeen.get(key)) return false;

      if (lastLooted && at - lastLooted.at <= COIN_FOLLOWS_LOOT_MS && at >= lastLooted.at) {
        const row = selectById.get(lastLooted.killId) as KillRow | undefined;
        // `mine === 0` — a stranger's corpse — read fresh off the row rather than cached at attach
        // time, so an admin edit to `mine` in between is honored the same way the old array-backed
        // store's live object reference would have made it.
        if (row && row.mine !== 0) {
          attachCoin(row.id, row.coin, event.copper);
          insertCoinSeen.run(key);
          return true;
        }
      }
      const candidates = recentCandidates(at);
      for (const row of candidates) {
        if (row.mine === 0) continue; // `mine === false` — a stranger's corpse is never a candidate
        attachCoin(row.id, row.coin, event.copper);
        insertCoinSeen.run(key);
        return true;
      }
      return false;
    },

    // Asked by **place**, answered from records that each keep the log's own wording (ADR 0083).
    // One Steamfont is drawn by one map file, and the kills that happened there belong on it whichever
    // difficulty the door was set to (ADR 0059); the name asked with is usually a map pack's label
    // rather than the log's, so it may also be a letter out (ADR 0075). All of that lives in
    // `samePlace` — the record is never rewritten, and the question is never guessed at twice.
    //
    // A given zone reaches the **whole** ledger, resolved to its raw logged spellings server-side
    // (`SELECT DISTINCT zone`, folded through `samePlace` — the small, bounded set of camps a
    // character has ever recorded, not every kill) and pushed into a `zone IN (...)` clause: a
    // heatmap wants every kill this camp has ever produced, and `kill_records` has no cap left to
    // bound that at (ADR 0243). With no zone, `DEFAULT_LIMIT` recent kills instead — the one caller
    // that asks unscoped (`SpawnPanel`'s "recent camps") only wants a recent window, not the whole
    // history, and fetching it all just to look at the front of it would cost real time for nothing
    // a caller ever uses.
    kills(zone) {
      if (!zone) return (selectRecentKills.all(DEFAULT_LIMIT) as KillRow[]).map(rowToRecord);
      const rawZones = (selectDistinctKillZones.all() as { zone: string }[])
        .map((r) => r.zone)
        .filter((z) => samePlace(z, zone));
      if (!rawZones.length) return []; // nothing recorded ever names this place
      const where = rawZones.map(() => "?").join(", ");
      return (
        db.prepare(`SELECT * FROM kill_records WHERE zone IN (${where}) ORDER BY rowid DESC`).all(...rawZones) as KillRow[]
      ).map(rowToRecord);
    },

    byIds(ids) {
      if (!ids.length) return [];
      const where = ids.map(() => "?").join(", ");
      return (db.prepare(`SELECT * FROM kill_records WHERE id IN (${where})`).all(...ids) as KillRow[]).map(
        rowToRecord,
      );
    },

    drainTouched() {
      const ids = touched;
      touched = [];
      // A busy corpse touches its own kill row several times over (the kill itself, then a drop or
      // two, then coin) — deduped before the cap so a loot-heavy pull's repeat touches of the same
      // few ids can't spuriously trip it.
      const unique = [...new Set(ids)];
      // Past this many, naming them individually has stopped being the cheap option: SQLite's own
      // bound on how many `?` a single query may bind is finite, and `byIds` would be the one to
      // hit it. `[]` reads to every existing caller (`useKills`'s `!ids?.length`) as "reload
      // everything" — the correct answer for a backlog this size regardless of where it came from
      // (a big import that never got drained, in practice, since ordinary live combat never
      // approaches this in one coalesce window).
      return unique.length > TOUCHED_CAP ? [] : unique;
    },

    observations: () => observationsCache.get(),

    onObservationsChanged(cb) {
      observationsCache.onRefreshed(cb);
    },

    version: () => version,

    clear(scope = "records") {
      // Retire the records on the way out — otherwise "clear the records, keep what I've learned"
      // would still lose everything the records currently held taught, which is all of it now that
      // nothing retires automatically as it's recorded (ADR 0243).
      if (scope === "records") {
        // `.reverse()`: same reasoning as `observations()` — `retire` folds these through
        // `observeMobs`'s `clusterAreas`, whose greedy nearest-pair merge can pick a different pair
        // on a genuine distance tie depending on input order, and the old array-backed store always
        // fed this from its own oldest-first array.
        retire((selectAll.all() as KillRow[]).reverse().map(rowToRecord));
        // The keys stay: `mob_observations_frozen` just absorbed these records' counts, and a
        // re-eaten log must still recognise them as already accounted for, or "clear records, keep
        // what I've learned" would double them the moment the same log crossed this app again.
        deleteAllKills.run();
      } else {
        deleteAllFrozen.run();
        deleteAllKills.run();
        // A full wipe is the one time nothing is left to protect, so this is also the one time
        // starting fresh means forgetting every key too.
        deleteAllSeenKeys();
      }
      // The fixes describe where the cleared kills happened; keeping them would place the
      // next kill using evidence the player just asked us to forget.
      fixes = [];
      lastLooted = null; // it points at a record that no longer exists
      bump();
      saver.flush();
    },

    flush() {
      saver.flush();
    },

    // `id`/`key`/`dropsJson`/`dropsKeyed` are absent because they're identity a patch must never
    // touch (ADR 0033's dedup depends on them) — and so, for the same reason, are `mob` and
    // `killer`: `kill_seen_keys` dedupes on exactly those two plus `at`, outside this store's
    // view, so editing either here would leave that table keyed to a mob/killer the record no
    // longer says. `zone` — the field this panel exists for — carries no such key anywhere.
    admin: createSqlAdminStore<KillAdminRow>("Kills", {
      list: () => (selectAll.all() as KillRow[]).map(toAdminRow),
      idOf: (r) => r.id,
      summaryOf: (r) => `${r.mob} — ${r.zone ?? "no zone"} (${r.at})`,
      editable: ["zone", "y", "x", "confidence", "named", "killerNamed", "mine"],
      auditOf: (r) => (r.adminAudit ? (JSON.parse(r.adminAudit) as AdminAudit) : undefined),
      applyPatch: (id, field, value, audit) => {
        // `field` is always a member of `editable` by the time `createSqlAdminStore.patch` calls
        // this — safe to interpolate since it can only ever be one of this store's own fixed column
        // names, never arbitrary input. `named`/`killerNamed`/`mine` need `coerceBooleanAdminPatch`
        // (`./admin`) — see its own doc for why a row where one is still `null` needs re-coercing here.
        const bound = coerceBooleanAdminPatch(BOOLEAN_FIELDS, field, value);
        db.prepare(`UPDATE kill_records SET ${field} = ? WHERE id = ?`).run(bound as AdminScalar, id);
        updateAudit.run(JSON.stringify(audit), id);
      },
      // Removed outright, not just uneditable: unlike a bad `zone`, a whole misrecorded kill has
      // nothing worth keeping. `kill_seen_keys` is left alone on purpose (same reasoning as
      // `clear`'s own comment above) — a deleted row staying deduped means replaying the same log
      // can't quietly bring it back.
      removeRow: (id) => deleteKillById.run(id),
      onChanged: bump,
      // `stores()` (`electron/admin.ts`) calls this on every admin-panel open *and* every
      // `app.onDataChanged` broadcast the admin window is listening for while it's open — a
      // `list()`-based count would mean a full-table scan on both, and `kill_records` has had no cap
      // to bound that scan at since ADR 0243, so this stays a `COUNT(*)` the same as the other three.
      counts: () => ({
        total: (countKills.get() as { n: number }).n,
        edited: (countEditedKills.get() as { n: number }).n,
      }),
    }),
  };
}

/**
 * How much to believe a kill's position, 0–1.
 *
 * Age is the main term: exact while the fix is fresh, sliding to nothing by the trust
 * horizon. Movement is the second: a player who covered ground between their last two
 * fixes was probably not standing where the newer one says, so the score is halved —
 * whereas one who hadn't moved at all is credible even with an older fix, which is exactly
 * the camp case a heatmap is for.
 *
 * Someone else's kill is halved for the same reason: your `/loc` is evidence about where
 * *you* were standing, and the stranger who killed it was somewhere else in earshot. Still
 * worth plotting off a good fix — the mob was nearby — but never as well placed as your own.
 */
function confidenceFor(ageSec?: number, moved?: boolean, mine = true): number {
  if (ageSec === undefined) return 0;
  const byAge = ageSec <= FRESH_SEC ? 1 : Math.max(0, 1 - (ageSec - FRESH_SEC) / (TRUST_HORIZON_SEC - FRESH_SEC));
  const penalty = (moved ? 0.5 : 1) * (mine ? 1 : 0.5);
  return round(byAge * penalty, 2);
}

/**
 * Fold a pre-ADR-0232 `kill-log.json` into the new tables, once — the same shape `faction-log.ts`/
 * `loot-log.ts` use, including that the file isn't renamed away afterward: it goes on existing as a
 * provenance-only stub (see the module doc). `migrations.ts`'s own `schema` field is left alone if
 * present; this store never reads it, and `fillMissingKillZones` treats a stub (no `kills` array) as
 * nothing left to repair on its own. Guarded by whether the file still carries a `kills` array at
 * all, not by whether the new tables are empty: a stub has no such array, so this can't re-run on
 * it, and a player who has since cleared the ledger for real doesn't get it silently repopulated.
 *
 * Legacy `dropKeys`/`coinKeys`/`seenKillKeys` etc. are folded into the new schema's own shape: a
 * drop's key is backfilled when missing (mirroring the in-place migration this file used to do at
 * every launch), and **whether `dropKeys` was ever present at all** survives as `dropsKeyed` — the
 * one bit `noteLoot`'s pre-keying fallback still reads.
 *
 * **`seenKillKeys`/`seenLootKeys`/`seenCoinKeys` are migrated too, separately from `kills`.** These
 * are ADR 0207's whole point: the permanent identity of *every* kill/loot/coin line this log has
 * ever recorded, independent of whether the record it came from still sits in `kills` or already
 * retired past the `MAX_KILLS` cap into `retired`. A record that retired before this migration ran
 * left no trace in `kills` at all — only in these three arrays — so reconstructing keys solely from
 * `kills` (as an earlier version of this migration did) silently dropped the permanent identity of
 * everything that had ever aged out, and reintroduced exactly the double-count-on-replay bug ADR
 * 0207 fixed: an unattended re-read (ADR 0129) after migrating would recognise none of that history
 * and record — then re-retire — it a second time.
 */
function migrateFromLegacyJson(db: Database, userDataDir: string, file: string): void {
  if (!fs.existsSync(file)) return;
  const parsed = readJson<{
    kills?: (KillRecord & { dropKeys?: string[]; coinKeys?: string[] })[];
    retired?: MobObservation[];
    seenKillKeys?: string[];
    seenLootKeys?: string[];
    seenCoinKeys?: string[];
    provenance?: DataStamp;
  }>(file, {});
  if (!Array.isArray(parsed.kills)) return; // already a stub, or nothing was ever stored
  const kills = parsed.kills;
  const retired = (Array.isArray(parsed.retired) ? parsed.retired : []).map(withAreas);
  // A file predating ADR 0207 has no permanent key set at all — the same "best-effort from whatever
  // held records still carry" fallback that ADR describes ("a kill retired before this shipped has
  // no key left to recover"). Once that ADR shipped, `seenKillKeys` is itself the authoritative,
  // permanent set — a strict superset of anything a currently-held record's own `key` field says,
  // since it also covers everything that already retired. Mirrors the original JSON store's own
  // `seeding` flag exactly (`!stored.seenKillKeys`), so the same file migrates the same way either
  // path it takes.
  const seeding = !parsed.seenKillKeys;
  const stripOrdinal = (key: string): string => key.replace(/#\d+$/, "");

  const insertKill = db.prepare(`
    INSERT OR IGNORE INTO kill_records
      (id, key, logId, at, mob, killer, mine, sharedBy, named, killerNamed, zone,
       y, x, fixAgeSec, prevY, prevX, movedUnits, movedSec, speed, guessedY, guessedX,
       confidence, dropsJson, dropsKeyed, coin)
    VALUES
      (@id, @key, @logId, @at, @mob, @killer, @mine, @sharedBy, @named, @killerNamed, @zone,
       @y, @x, @fixAgeSec, @prevY, @prevX, @movedUnits, @movedSec, @speed, @guessedY, @guessedX,
       @confidence, @dropsJson, @dropsKeyed, @coin)
  `);
  const insertKillSeen = db.prepare(`INSERT OR IGNORE INTO kill_seen_keys (key, base) VALUES (?, ?)`);
  const insertLootSeen = db.prepare(`INSERT OR IGNORE INTO loot_seen_keys (key, base) VALUES (?, ?)`);
  const insertCoinSeen = db.prepare(`INSERT OR IGNORE INTO coin_seen_keys (key) VALUES (?)`);
  const upsertFrozen = db.prepare(`
    INSERT INTO mob_observations_frozen (key, mob, zone, kills, dropsJson, copper, areasJson, lastAt, by, byId)
    VALUES (@key, @mob, @zone, @kills, @dropsJson, @copper, @areasJson, @lastAt, @by, @byId)
    ON CONFLICT(key) DO UPDATE SET
      kills = excluded.kills, dropsJson = excluded.dropsJson, copper = excluded.copper,
      areasJson = excluded.areasJson, lastAt = excluded.lastAt, by = excluded.by, byId = excluded.byId
  `);

  const seenKillBase = new Map<string, number>();
  const seenLootBase = new Map<string, number>();

  const run = db.transaction(() => {
    for (const k of kills) {
      // A key already shaped `base#N` is kept verbatim; anything else (pre-ADR-0207 data) gets a
      // fresh one, the same as the in-place migration this file used to run at every launch.
      const killBase = baseKillKey(k.at, k.mob, k.killer ?? "");
      let key = k.key && /#\d+$/.test(k.key) ? k.key : undefined;
      if (!key) {
        const ordinal = seenKillBase.get(killBase) ?? 0;
        key = killKey(k.at, k.mob, k.killer ?? "", ordinal);
      }
      seenKillBase.set(killBase, (seenKillBase.get(killBase) ?? 0) + 1);

      const dropsKeyed = k.dropKeys !== undefined;
      insertKill.run({
        id: k.id,
        key,
        logId: k.logId,
        at: k.at,
        mob: k.mob,
        killer: k.killer ?? null,
        mine: boolCol(k.mine),
        sharedBy: k.sharedBy ?? null,
        named: boolCol(k.named),
        killerNamed: boolCol(k.killerNamed),
        zone: k.zone ?? null,
        y: k.y ?? null,
        x: k.x ?? null,
        fixAgeSec: k.fixAgeSec ?? null,
        prevY: k.prevY ?? null,
        prevX: k.prevX ?? null,
        movedUnits: k.movedUnits ?? null,
        movedSec: k.movedSec ?? null,
        speed: k.speed ?? null,
        guessedY: k.guessedY ?? null,
        guessedX: k.guessedX ?? null,
        confidence: k.confidence,
        dropsJson: k.drops?.length ? JSON.stringify(k.drops) : null,
        dropsKeyed: dropsKeyed ? 1 : 0,
        coin: k.coin ?? null,
      });
      // Only inserted here while seeding (no authoritative set exists yet) — once `seenKillKeys` is
      // present it already carries this exact key (every `record()` call adds to both at once), and
      // re-deriving `base` from a possibly-pre-ordinal key here could disagree with what that set says.
      if (seeding) insertKillSeen.run(key, killBase);

      // Only a record that was ever through the keyed path gets its drops' identity remembered —
      // one with drops but no `dropKeys` at all predates keying, and its drops stay nameless on
      // purpose (see the module doc; `noteLoot`'s fallback is what still protects it from a replay).
      if (dropsKeyed) {
        for (const item of k.drops ?? []) {
          const lootBase = baseLootKey(k.at, item, k.mob);
          const existing = (k.dropKeys ?? []).find((dk) => dk.startsWith(lootBase) && /#\d+$/.test(dk));
          const ordinal = seenLootBase.get(lootBase) ?? 0;
          const lkey = existing ?? lootKey(k.at, item, k.mob, ordinal);
          seenLootBase.set(lootBase, (seenLootBase.get(lootBase) ?? 0) + 1);
          // A key already shaped `base#N` is `seenLootKeys`' own canonical form and is migrated from
          // there instead, below; only a bare pre-ADR-0207 `dropKeys` entry (no ordinal at all) needs
          // inserting from here, in either mode, since `seenLootKeys` never held that un-suffixed form.
          if (seeding || !existing) insertLootSeen.run(lkey, lootBase);
        }
      }
      if (seeding) for (const ck of k.coinKeys ?? []) insertCoinSeen.run(ck);
    }
    for (const o of retired) {
      upsertFrozen.run({
        key: `${o.mob.toLowerCase()}|${o.zone}`,
        mob: o.mob,
        zone: o.zone,
        kills: o.kills,
        dropsJson: JSON.stringify(o.drops),
        copper: o.copper ?? null,
        areasJson: JSON.stringify(o.areas ?? []),
        lastAt: o.lastAt,
        by: o.by ?? null,
        byId: o.byId ?? null,
      });
    }

    // The permanent identity ADR 0207 promises — every key ever recorded, independent of whether its
    // record still sits in `kills` (just migrated above) or already retired past the cap. This is
    // what actually protects the history `kills` alone cannot recover.
    if (!seeding) {
      for (const k of parsed.seenKillKeys ?? []) insertKillSeen.run(k, stripOrdinal(k));
      for (const k of parsed.seenLootKeys ?? []) insertLootSeen.run(k, stripOrdinal(k));
      for (const k of parsed.seenCoinKeys ?? []) insertCoinSeen.run(k);
    }
  });
  run();

  if (parsed.provenance) fs.writeFileSync(file, JSON.stringify({ provenance: parsed.provenance }));
  else writeJson(file, {}, { concern: "kill-log" });
  log.info("migrated kill-log.json into eqlist.db", { kills: kills.length, retired: retired.length });
}
