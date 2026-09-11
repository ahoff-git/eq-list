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
 *   - a record that has an **ordinary** zone is never touched (nothing to fix, and overwriting the
 *     log's own wording with our reading of it is precisely what ADR 0083 forbids) — the one
 *     exception is a zone `classifyZoneLine` has confirmed isn't one at all, covered below;
 *   - only the `zone` is filled — never a position, a confidence or a count;
 *   - where two logs (two characters) disagree about where you were, the record is **left alone**;
 *   - it is idempotent, and versioned in the file so it doesn't re-read the logs every launch.
 *
 * **The second migration converts alert rules** written before a watch became a rule
 * ([ADR 0084](../specs/decisions/0084-a-watch-is-a-rule-not-a-substring.md)) — see
 * `upgradeAlertRules` below. It is a different file with its own schema, and unlike the first it is
 * not repairing anything: an un-migrated settings file works exactly as it always did.
 *
 * **A later migration corrects a zone that was never a zone.** The client reuses "You have
 * entered …" for a restriction notice — "You have entered an area where levitation effects do not
 * function." — which read, before `classifyZoneLine` (`zones/place.ts`) existed, exactly like an
 * arrival. That is not the disagreement ADR 0083 protects against: the rule there is about *never
 * overwriting one true fact with our own reading of it*, and a restriction notice was never a zone
 * name to begin with — it is a parsing defect, not an interpretation. `zones/place.ts`'s
 * `NOT_A_ZONE` names the confirmed cases; everything below that touches a zone checks a record
 * against it before touching anything, and only ever replaces a *confirmed-wrong* value — an
 * ordinary recorded zone, agreed or disputed, is still never touched.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { splitLine } from "../src/shared/log-parser";
import { parseSplitLine } from "../src/shared/parse-line";
import { upgradeWatches } from "../src/shared/watch-upgrade";
import { BUILT_IN_STYLES } from "../src/shared/alert-styles";
import { classifyZoneLine } from "../src/shared/zones/place";
import { timerInPlace } from "../src/shared/spawn-timers";
import type { CastAlertSettings, HighScore, KillRecord, LootRecord, StoredFight } from "../src/shared/types";
import type { MobObservation } from "../src/shared/mob-stats";
import { readJson, writeJson } from "./json-store";
import { contributorName, legacyContributorId } from "../src/shared/contributors";

const log = createLogger("migrations");

/**
 * The schema the stored kill log is at. Bump when a new migration needs to run once; the number is
 * written into the file, so a store already at this version is left completely alone.
 */
const KILL_LOG_SCHEMA = 3;

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

/**
 * Version for `repairBadZones` below, which sweeps the four stores that don't already carry a
 * `schema` field of their own — `loot-log.json`, `combat-history.json`, `high-scores.json` and
 * `spawn-timers.json`. Kept in a small file of its own (`data-repairs.json`) rather than inside one
 * of the four: none of their own schema numbers are about zones, so borrowing one would misdate
 * what that store actually tracks, and a marker split across four files could disagree about
 * whether the sweep had run. Bump it again if `NOT_A_ZONE` (`zones/place.ts`) grows and the sweep
 * is worth re-running against what it's since learned.
 */
const ZONE_REPAIR_VERSION = 1;

interface StoredRepairs {
  zoneRepair?: number;
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
  try {
    seedBuiltInStyles(userDataDir);
  } catch (err) {
    log.error("built-in style seeding failed; settings left untouched", err);
  }
  try {
    keyKnowledgeByContributor(userDataDir);
  } catch (err) {
    log.error("contributor re-keying failed; pooled knowledge left untouched", err);
  }
  try {
    repairBadZones(userDataDir, logDir);
  } catch (err) {
    log.error("zone repair failed; data left untouched", err);
  }
}

/**
 * Re-key pooled observations from the display name they were filed under to a contributor id.
 *
 * The old file was `{ peers: { "Bob": [...] } }` — a name as a primary key, which is the thing
 * `contributors.ts` exists to stop. The obvious alternative was to drop the file and let the pool
 * refill, and it's the wrong one: those tallies are other people's kills, we were never the source,
 * and nothing can rebuild them (`DATA_CONCERNS.peer-knowledge` calls that out as unrecoverable).
 *
 * So they are kept, under `name:bob` — an id that is honest about what it is. It says "whoever was
 * calling themselves Bob", which is exactly as much as the old file ever knew, and it stops being
 * used the moment that peer reports again under a real id: their new report files under the new key
 * and the legacy row simply stops growing. That is a duplicate for as long as it lasts, and it's
 * the right way to be wrong here — the alternative is throwing away months of somebody's kills to
 * avoid double-counting a sample the reader can see the provenance of either way.
 *
 * `seenAt` is left **empty** rather than stamped with now: we have no idea when those reports
 * arrived, and "just now" is a lie that would make a year-old tally look live.
 */
function keyKnowledgeByContributor(userDataDir: string): void {
  const file = path.join(userDataDir, "mob-knowledge.json");
  if (!fs.existsSync(file)) return;
  const stored = JSON.parse(fs.readFileSync(file, "utf8")) as {
    peers?: Record<string, MobObservation[]>;
    contributors?: Record<string, unknown>;
  };
  // Already re-keyed (or written by this build in the first place): nothing to do, every launch.
  if (!stored.peers || stored.contributors) return;

  const contributors: Record<string, { name: string; seenAt: string; data: MobObservation[] }> = {};
  for (const [name, data] of Object.entries(stored.peers)) {
    if (!Array.isArray(data) || !name.trim()) continue;
    contributors[legacyContributorId(name)] = { name: contributorName(name), seenAt: "", data };
  }
  writeJson(file, { contributors }, { what: "mob knowledge", concern: "peer-knowledge" });
  log.info("pooled knowledge re-keyed by contributor", { contributors: Object.keys(contributors).length });
}

/**
 * Add any shipped look a settings file predates — the **Record** and **Spawn timer** styles.
 *
 * A defaults merge can't do this and shouldn't try: `deepMerge` replaces an array wholesale, which
 * is the right answer for a list the player curates (a style they deleted must stay deleted) and
 * the wrong one for a list the app also contributes to. So the two are reconciled here, by **id**:
 * a built-in that isn't there is appended, and one that is — edited, renamed, whatever — is left
 * exactly as the player left it.
 *
 * Deliberately **not** schema-gated. It runs every launch and is a no-op every time after the
 * first, because the question it asks ("is this id present?") is the answer itself; a version stamp
 * would only add a way for a *later* built-in to be skipped for someone already stamped.
 *
 * A style the player has deleted comes back, which is the one cost. It is the right way to be wrong:
 * a duplicate is one click to remove, where a missing look is a feature that quietly looks broken —
 * and anything wearing that id falls through to the alert defaults in the meantime rather than
 * failing.
 */
function seedBuiltInStyles(userDataDir: string): void {
  const file = path.join(userDataDir, "settings.json");
  let stored: StoredSettings | undefined;
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8")) as StoredSettings;
  } catch (err) {
    // No settings yet: the defaults already carry them, so there is nothing to add and nothing to say.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("settings won't parse; leaving them exactly as they are", file, String(err));
    }
    return;
  }
  const styles = stored.castAlerts?.styles;
  if (!styles) return; // never saved a style list — the defaults supply the built-ins whole
  const missing = BUILT_IN_STYLES.filter((b) => !styles.some((s) => s.id === b.id));
  if (!missing.length) return;
  const next: StoredSettings = {
    ...stored,
    castAlerts: { ...stored.castAlerts, styles: [...styles, ...missing] } as CastAlertSettings,
  };
  stamped(file, next, "settings");
  log.debug("added built-in styles", missing.map((m) => m.name));
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

/** Missing, or confirmed to name an effect rather than a place — either way worth a second look. */
function needsZoneRepair(zone: string | undefined): boolean {
  return !zone || classifyZoneLine(zone) === "blacklisted";
}

/**
 * Re-derive one timestamp's zone from the logs — the rule every repair in this file follows: only
 * when exactly one character's log can say, and only ever filling in a fact the log states.
 * `undefined` when it can't be placed, which a caller treats as "leave unplaced" for a gap and
 * "can no longer say" for a confirmed-wrong value — better than confidently wrong either way.
 */
function repairedZone(timelines: ZoneTimeline[], at: string): string | undefined {
  const answers = [...new Set(timelines.map((t) => zoneAt(t, at)).filter((z): z is string => !!z))];
  return answers.length === 1 ? answers[0] : undefined;
}

/**
 * Repair or clear `.zone` across a batch already filtered by `needsZoneRepair` — the one loop kills,
 * loot, fights and scores all want: resolve it from the logs where they can, and clear a *confirmed*
 * wrong value where they can't (a merely-missing one is left as it was — there was nothing to lose).
 * `wasBad` is exactly `needsZoneRepair`'s blacklisted case, since a missing zone is already falsy.
 */
function repairZoneField<T extends { zone?: string }>(
  items: T[],
  at: (item: T) => string,
  timelines: ZoneTimeline[],
): { filled: number; cleared: number } {
  let filled = 0;
  let cleared = 0;
  for (const item of items) {
    const wasBad = !!item.zone;
    const fixed = repairedZone(timelines, at(item));
    if (fixed) {
      item.zone = fixed;
      filled++;
    } else if (wasBad) {
      item.zone = undefined;
      cleared++;
    }
  }
  return { filled, cleared };
}

function fillMissingKillZones(userDataDir: string, logDir: string | undefined): void {
  const file = path.join(userDataDir, "kill-log.json");
  const stored = readStore(file);
  if (!stored) return; // nothing there, or something we must not write over — see `readStore`
  if ((stored.schema ?? 1) >= KILL_LOG_SCHEMA) return;
  const kills = stored.kills ?? [];
  const candidates = kills.filter((k) => needsZoneRepair(k.zone) && k.at);
  // Retired kills survive only as a per-mob-per-zone tally (ADR 0056) — there's no instant left to
  // re-derive, so a bucket filed under a confirmed-wrong zone can't be split back to a real one. It
  // is discarded rather than kept lying under a place that never existed.
  const retired = stored.retired ?? [];
  const badRetired = retired.filter((o) => classifyZoneLine(o.zone) === "blacklisted");

  // Nothing to repair: stamp the schema so the logs are never read for this again.
  if (!candidates.length && !badRetired.length) {
    stamp(file, stored, { filled: 0, cleared: 0, left: 0, forgotten: 0 });
    return;
  }
  if (!logDir) {
    log.debug("migration deferred: no log folder set", { candidates: candidates.length });
    return; // no stamp — try again once the user points us at their logs
  }

  const timelines = readZoneTimelines(logDir);
  if (!timelines.length) {
    log.debug("migration deferred: no logs found", { logDir, candidates: candidates.length });
    return;
  }

  const { filled, cleared } = repairZoneField(candidates, (k) => k.at, timelines);

  const left = candidates.length - filled - cleared;
  if (filled || cleared || badRetired.length) {
    // Kept beside the live file rather than overwritten in place: space is cheap, and a repair that
    // turns out to be wrong should cost a file copy to undo, not an evening's kills.
    backUp(file, userDataDir);
    stored.kills = kills;
    if (badRetired.length) stored.retired = retired.filter((o) => classifyZoneLine(o.zone) !== "blacklisted");
  }
  stamp(file, stored, { filled, cleared, left, forgotten: badRetired.length });
  log.debug("corrected kill-log zones", { filled, cleared, left, forgotten: badRetired.length, records: kills.length });
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
function stamp(file: string, stored: StoredKillLog, counts: Record<string, number>): void {
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

/**
 * The fields of `spawn-timers.json` this sweep touches — see `electron/spawn-tracker.ts`'s own
 * `Stored` for the file's full shape. Every other field (`provenance`, anything a newer build
 * added) rides along untouched: this reads the file once, mutates it in place and writes the same
 * object back, so a field this interface doesn't name is simply never looked at.
 */
interface StoredSpawnZones {
  lastZone?: Record<string, string>;
  stated?: Record<string, unknown>;
  relearned?: Record<string, unknown>;
  lead?: Record<string, unknown>;
  notify?: Record<string, unknown>;
  armed?: Record<string, unknown>;
  seen?: Record<string, unknown>;
  floor?: Record<string, unknown>;
  droppedGaps?: Record<string, unknown>;
  added?: Record<string, unknown>;
  queue?: Record<string, unknown>;
  repeat?: Record<string, unknown>;
  styleId?: Record<string, unknown>;
  onScreen?: Record<string, unknown>;
  timers?: { key: string }[];
}

/**
 * Every field keyed `mobKey|placeKey` (`timerKey`, `src/shared/spawn-timers.ts`) rather than by mob
 * alone — `said` is deliberately absent, since it's keyed by mob only and names no place at all.
 */
const TIMER_KEYED_FIELDS = [
  "stated", "relearned", "lead", "notify", "armed", "seen", "floor", "droppedGaps",
  "added", "queue", "repeat", "styleId", "onScreen",
] as const satisfies readonly (keyof StoredSpawnZones)[];

/**
 * Forget one confirmed-fake camp. A countdown's identity **is** its place — there's no "unplaced
 * timer" the way a kill or a drop can be unplaced — so where the migrations above repair or clear a
 * field, this can only ever discard: every row keyed to `place`, and the place itself out of
 * `lastZone`. Returns how many rows went, for the log line.
 */
function purgePlace(spawn: StoredSpawnZones, place: string): number {
  let removed = 0;
  for (const field of TIMER_KEYED_FIELDS) {
    const record = spawn[field];
    if (!record) continue;
    for (const key of Object.keys(record)) {
      if (timerInPlace(key, place)) {
        delete record[key];
        removed++;
      }
    }
  }
  if (spawn.timers) {
    const before = spawn.timers.length;
    spawn.timers = spawn.timers.filter((t) => !timerInPlace(t.key, place));
    removed += before - spawn.timers.length;
  }
  if (spawn.lastZone) delete spawn.lastZone[place];
  return removed;
}

/**
 * The one-time sweep for the four stores that don't carry a `schema` of their own — see
 * `ZONE_REPAIR_VERSION`. Loot, fights and personal bests get the same repair-or-clear treatment as
 * `fillMissingKillZones` gives kills; a spawn timer, which has no "unplaced" state to fall back to,
 * is simply forgotten (`purgePlace`).
 *
 * A missing `logDir` still runs the sweep — unlike `fillMissingKillZones`, which defers so a
 * *missing* zone can wait for logs to become resolvable. A confirmed-wrong zone has no such upside
 * to waiting for: without logs every candidate below simply clears or is forgotten outright, which
 * is strictly better than leaving a sentence that was never a place sitting in the data.
 */
function repairBadZones(userDataDir: string, logDir: string | undefined): void {
  const stateFile = path.join(userDataDir, "data-repairs.json");
  const state = readJson<StoredRepairs>(stateFile, {});
  if ((state.zoneRepair ?? 0) >= ZONE_REPAIR_VERSION) return;

  const lootFile = path.join(userDataDir, "loot-log.json");
  const loot = readJson<{ loot?: LootRecord[] }>(lootFile, {});
  const lootCandidates = (loot.loot ?? []).filter((r) => needsZoneRepair(r.zone) && r.at);

  const historyFile = path.join(userDataDir, "combat-history.json");
  const history = readJson<{ fights?: StoredFight[] }>(historyFile, {});
  const fightCandidates = (history.fights ?? []).filter((f) => needsZoneRepair(f.zone) && f.stats?.startedAt);

  const scoresFile = path.join(userDataDir, "high-scores.json");
  const scores = readJson<{ characters?: Record<string, { scores?: Record<string, HighScore> }> }>(scoresFile, {});
  const scoreCandidates = Object.values(scores.characters ?? {}).flatMap((board) =>
    Object.values(board.scores ?? {}).filter((hs) => needsZoneRepair(hs.zone) && hs.at),
  );

  const spawnFile = path.join(userDataDir, "spawn-timers.json");
  const spawn = readJson<StoredSpawnZones>(spawnFile, {});
  const badPlaces = Object.entries(spawn.lastZone ?? {})
    .filter(([, zone]) => classifyZoneLine(zone) === "blacklisted")
    .map(([place]) => place);

  if (!lootCandidates.length && !fightCandidates.length && !scoreCandidates.length && !badPlaces.length) {
    stamped(stateFile, { zoneRepair: ZONE_REPAIR_VERSION }, "zone repair state");
    return;
  }

  const timelines = logDir ? readZoneTimelines(logDir) : [];
  const { filled: lootFilled, cleared: lootCleared } = repairZoneField(lootCandidates, (r) => r.at, timelines);
  const { filled: fightsFilled, cleared: fightsCleared } = repairZoneField(fightCandidates, (f) => f.stats.startedAt, timelines);
  const { filled: scoresFilled, cleared: scoresCleared } = repairZoneField(scoreCandidates, (hs) => hs.at, timelines);

  let timersForgotten = 0;
  for (const place of badPlaces) timersForgotten += purgePlace(spawn, place);

  if (lootCandidates.length) {
    backUpFile(lootFile, userDataDir, "loot-log");
    writeJson(lootFile, loot, { what: "loot log (migration)" });
  }
  if (fightCandidates.length) {
    backUpFile(historyFile, userDataDir, "combat-history");
    writeJson(historyFile, history, { what: "combat history (migration)" });
  }
  if (scoreCandidates.length) {
    backUpFile(scoresFile, userDataDir, "high-scores");
    writeJson(scoresFile, scores, { what: "high scores (migration)" });
  }
  if (badPlaces.length) {
    backUpFile(spawnFile, userDataDir, "spawn-timers");
    writeJson(spawnFile, spawn, { what: "spawn timers (migration)" });
  }
  stamped(stateFile, { zoneRepair: ZONE_REPAIR_VERSION }, "zone repair state");
  log.debug("corrected zones a restriction notice had faked", {
    loot: { filled: lootFilled, cleared: lootCleared },
    fights: { filled: fightsFilled, cleared: fightsCleared },
    highScores: { filled: scoresFilled, cleared: scoresCleared },
    timersForgotten,
    badPlaces,
  });
}

/** A copy of one migrated file as it was, once — the same promise `backUp` makes for the kill log. */
function backUpFile(file: string, userDataDir: string, label: string): void {
  const backup = path.join(userDataDir, `${label}.pre-zone-repair-${ZONE_REPAIR_VERSION}.json`);
  try {
    if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  } catch (err) {
    log.error(`could not back up ${label}`, err);
  }
}
