/**
 * migrations.ts — one-time repairs to data already on disk, run once at startup.
 *
 * The rule this exists to serve: **stored data carries the in-game zone name and nothing derived**
 * ([ADR 0083](../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). A migration
 * here never *reinterprets* a stored value — that would be the same mistake as writing a conclusion in
 * the first place, one release later. It only ever fills in a fact the log states and the store lacks,
 * and it reads that fact from the log itself.
 *
 * **What the first migration repairs.** A kill recorded before the log had said which zone you were in
 * is stored with no zone at all (`log-watcher`'s catch-up finds a `/loc` but no zone line, and
 * [ADR 0060](../specs/decisions/0060-a-position-belongs-to-the-zone-it-was-taken-in.md) is deliberately
 * strict about not guessing one). A kill with no zone is then skipped by `observeMobs` entirely, so it
 * counts towards **no** drop rate, **no** roam area and appears on **no** heatmap. On the author's real
 * log that was 338 of 2947 records — 11% of an evening's work, invisible.
 *
 * The log knows. Its `You have entered …` lines are a timeline, and every kill has a timestamp, so
 * where the app was merely late to learn the zone, the file can still say it. Measured against that
 * real log: all 338 gaps placed, and — the check that makes it trustworthy rather than plausible —
 * **2609 records that already had a zone agreed with the timeline exactly, none disagreed**. It is the
 * same source the watcher read, replayed.
 *
 * Deliberately narrow:
 *   - a record that **has** a zone is never touched (nothing to fix, and overwriting the log's own
 *     wording with our reading of it is precisely what ADR 0083 forbids);
 *   - only the `zone` is filled — never a position, a confidence or a count;
 *   - where two logs (two characters) disagree about where you were, the record is **left alone**;
 *   - it is idempotent, and versioned in the file so it doesn't re-read the logs every launch.
 *
 * **The second migration converts alert rules** written before a watch became a rule
 * ([ADR 0084](../specs/decisions/0084-a-watch-is-a-rule-not-a-substring.md)) — see
 * `upgradeAlertRules` below. It is a different file with its own schema, and unlike the first it is
 * not repairing anything: an un-migrated settings file works exactly as it always did.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { splitLine } from "../src/shared/log-parser";
import { parseSplitLine } from "../src/shared/parse-line";
import { upgradeWatches } from "../src/shared/watch-upgrade";
import type { CastAlertSettings, KillRecord } from "../src/shared/types";
import type { MobObservation } from "../src/shared/mob-stats";
import { writeJson } from "./json-store";

const log = createLogger("migrations");

/**
 * The schema the stored kill log is at. Bump when a new migration needs to run once; the number is
 * written into the file, so a store already at this version is left completely alone.
 */
const KILL_LOG_SCHEMA = 2;

/** Only files shaped like an EverQuest log — one per character, as the game names them. */
const LOG_FILE = /^eqlog_.*\.txt$/i;

/**
 * The one line we care about, cheap-tested before anything is parsed. A migration reads whole logs
 * (15 MB on a real install), and the parser is far too much work to run on 195,000 lines to find 87
 * zone lines.
 */
const ZONE_LINE = "You have entered";

interface StoredKillLog {
  schema?: number;
  kills?: KillRecord[];
  retired?: MobObservation[];
}

/** Where the log says you were, as a list of "from this moment, this zone" in log order. */
interface ZoneTimeline {
  file: string;
  entries: { at: string; zone: string }[];
  firstAt?: string;
  lastAt?: string;
}

/**
 * Run whatever one-time repairs the stored data needs. Call **before** the stores are constructed, so
 * they read the repaired file; it does nothing at all when the schema is current, which is every
 * launch but one.
 *
 * Never throws: a migration that can't run leaves the data exactly as it was, which is always a
 * working state — the zone-less records simply stay unplaced, as they have been all along.
 */
export function runMigrations(userDataDir: string, logDir: string | undefined): void {
  try {
    fillMissingKillZones(userDataDir, logDir);
  } catch (err) {
    log.error("migration failed; data left untouched", err);
  }
  try {
    upgradeAlertRules(userDataDir);
  } catch (err) {
    log.error("alert-rule upgrade failed; settings left untouched", err);
  }
}

/**
 * The schema the settings file is at. Separate from the kill log's: they're different files with
 * different histories, and one bump must not make the other's migration re-run.
 */
const SETTINGS_SCHEMA = 1;

interface StoredSettings {
  schema?: number;
  castAlerts?: CastAlertSettings;
}

/**
 * Bring alert rules written by an older build up to the current model, once.
 *
 * The conversion itself is pure and lives in
 * [watch-upgrade.ts](../src/shared/watch-upgrade.ts) — what it does and why is documented there. This
 * is the file handling around it, and it is deliberately timid: a settings file that won't parse is
 * left exactly as it is, an upgrade that changes nothing still stamps the schema so it never runs
 * again, and the file is copied aside before it's rewritten.
 *
 * Nothing here is a rescue — an un-migrated file works fine, because every field the model grew is
 * optional. It makes the implicit explicit so the panel can *show* a rule rather than translate it.
 */
function upgradeAlertRules(userDataDir: string): void {
  const file = path.join(userDataDir, "settings.json");
  let stored: StoredSettings | undefined;
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8")) as StoredSettings;
  } catch (err) {
    // No settings yet is the ordinary first-launch case and needs no note; anything else does, and
    // either way we must not write. Defaults are the current model already.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("settings won't parse; leaving them exactly as they are", file, String(err));
    }
    return;
  }
  if ((stored.schema ?? 0) >= SETTINGS_SCHEMA) return;
  if (!stored.castAlerts?.watches?.length) {
    // Nothing to convert. Stamp anyway: the answer won't change, and re-reading every launch to
    // find that out is the cost this schema exists to avoid.
    stamped(file, { ...stored, schema: SETTINGS_SCHEMA }, "settings");
    return;
  }

  const { settings, report, changed } = upgradeWatches(stored.castAlerts);
  if (!changed) {
    stamped(file, { ...stored, schema: SETTINGS_SCHEMA }, "settings");
    return;
  }
  const backup = path.join(userDataDir, `settings.pre-schema-${SETTINGS_SCHEMA}.json`);
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  } catch (err) {
    log.error("could not back up settings", err);
  }
  stamped(file, { ...stored, schema: SETTINGS_SCHEMA, castAlerts: settings }, "settings");
  log.debug("upgraded alert rules", { ...report, rules: settings.watches.length });
}

function fillMissingKillZones(userDataDir: string, logDir: string | undefined): void {
  const file = path.join(userDataDir, "kill-log.json");
  const stored = readStore(file);
  if (!stored) return; // nothing there, or something we must not write over — see `readStore`
  if ((stored.schema ?? 1) >= KILL_LOG_SCHEMA) return;
  const kills = stored.kills ?? [];
  const unplaced = kills.filter((k) => !k.zone && k.at);

  // Nothing to repair: stamp the schema so the logs are never read for this again.
  if (!unplaced.length) {
    stamp(file, stored, { filled: 0, left: 0 });
    return;
  }
  if (!logDir) {
    log.debug("migration deferred: no log folder set", { unplaced: unplaced.length });
    return; // no stamp — try again once the user points us at their logs
  }

  const timelines = readZoneTimelines(logDir);
  if (!timelines.length) {
    log.debug("migration deferred: no logs found", { logDir, unplaced: unplaced.length });
    return;
  }

  let filled = 0;
  const byZone = new Map<string, number>();
  for (const kill of unplaced) {
    // Every log that can speak for this moment. More than one answer means two characters were
    // logged in and we can't tell which log this kill came from — so we don't choose.
    const answers = [...new Set(timelines.map((t) => zoneAt(t, kill.at)).filter((z): z is string => !!z))];
    if (answers.length !== 1) continue;
    kill.zone = answers[0];
    filled++;
    byZone.set(answers[0], (byZone.get(answers[0]) ?? 0) + 1);
  }

  const left = unplaced.length - filled;
  if (filled) {
    // Kept beside the live file rather than overwritten in place: space is cheap, and a repair that
    // turns out to be wrong should cost a file copy to undo, not an evening's kills.
    backUp(file, userDataDir);
    stored.kills = kills;
  }
  stamp(file, stored, { filled, left });
  log.debug("filled in zones the log stated", {
    filled,
    left,
    records: kills.length,
    zones: Object.fromEntries(byZone),
  });
}

/**
 * The stored kill log — or **nothing at all** when there is no file, and when there is one that won't
 * parse.
 *
 * Deliberately not `readJson`, whose fallback answers "empty" for a corrupt file. That's right for a
 * store that can start fresh and quite wrong here: this function's caller goes on to *write*, and
 * stamping a schema over an unreadable file would replace an evening's kills that a person could
 * otherwise have opened in an editor and rescued. A migration is the last code that should destroy
 * something it doesn't understand.
 */
function readStore(file: string): StoredKillLog | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined; // no kill log yet — nothing old to repair, and nothing to write
  }
  try {
    return JSON.parse(text) as StoredKillLog;
  } catch (err) {
    log.warn("kill log won't parse; leaving it exactly as it is", file, String(err));
    return undefined;
  }
}

/** Write the schema (and the repair, if there was one) atomically — `writeJson` renames into place. */
function stamp(file: string, stored: StoredKillLog, counts: { filled: number; left: number }): void {
  stored.schema = KILL_LOG_SCHEMA;
  if (stamped(file, stored, "kill log")) log.debug("kill log at schema", KILL_LOG_SCHEMA, counts);
}

/**
 * Write a migrated file, atomically, or say so and leave it alone. A failed write is not a crisis:
 * the schema goes unstamped, so the same migration is simply tried again next launch.
 */
function stamped(file: string, value: unknown, what: string): boolean {
  if (writeJson(file, value, { what: `${what} (migration)` })) return true;
  log.error(`could not write the migrated ${what}; it will be tried again next launch`);
  return false;
}

/** A copy of the file as it was, once, named for the schema it was written at. */
function backUp(file: string, userDataDir: string): void {
  const backup = path.join(userDataDir, `kill-log.pre-schema-${KILL_LOG_SCHEMA}.json`);
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  } catch (err) {
    log.error("could not back up the kill log", err);
  }
}

/**
 * Read each log's zone lines into a timeline. Only the zone lines: the guard above means a 15 MB file
 * costs one read and a substring test per line rather than a full parse.
 */
function readZoneTimelines(logDir: string): ZoneTimeline[] {
  let names: string[];
  try {
    names = fs.readdirSync(logDir).filter((n) => LOG_FILE.test(n));
  } catch (err) {
    log.debug("log folder unreadable", { logDir, err: String(err) });
    return [];
  }

  const timelines: ZoneTimeline[] = [];
  for (const name of names) {
    const full = path.join(logDir, name);
    let text: string;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch (err) {
      log.debug("log unreadable, skipped", { file: name, err: String(err) });
      continue;
    }
    const timeline: ZoneTimeline = { file: name, entries: [] };
    for (const raw of text.split(/\r?\n/)) {
      // The timestamp bounds the log's span, so every line is timed — but only a zone line is parsed.
      const split = splitLine(raw, 0);
      if (!split) continue;
      timeline.firstAt ??= split.at;
      timeline.lastAt = split.at;
      if (!raw.includes(ZONE_LINE)) continue;
      const event = parseSplitLine(split);
      if (event?.kind === "zone") timeline.entries.push({ at: event.at, zone: event.zone });
    }
    if (timeline.entries.length) timelines.push(timeline);
    log.debug("read a log's zones", { file: name, zoneLines: timeline.entries.length, from: timeline.firstAt, to: timeline.lastAt });
  }
  return timelines;
}

/**
 * The zone this log says you were in at `at` — the last zone line at or before it, and `undefined`
 * when the log can't say: outside its span, or before it had ever named a zone. Both are honest
 * silences, and the caller leaves such a record unplaced.
 */
function zoneAt(timeline: ZoneTimeline, at: string): string | undefined {
  if (!timeline.firstAt || !timeline.lastAt) return undefined;
  if (at < timeline.firstAt || at > timeline.lastAt) return undefined;
  let zone: string | undefined;
  for (const entry of timeline.entries) {
    if (entry.at > at) break;
    zone = entry.zone;
  }
  return zone;
}
