/**
 * Tests for the combat-history store. Like the log-watcher tests these touch the real
 * filesystem (a temp userData dir), because persisting and reloading *is* the feature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createCombatHistory, COMBAT_HISTORY_MIGRATIONS, type CombatHistory } from "../combat-history";
import { openAppDatabase } from "../sqlite-store";
import type { CombatantStat, DamageCell, DamageKind, FightStats } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-hist-"));
}

/** A history over a real file — several tests below reuse the same `dir` across more than one
 *  construction to simulate a restart, which an in-memory database can't demonstrate. */
function freshHistory(dir: string, sessionId?: string): CombatHistory {
  const db = openAppDatabase(dir, COMBAT_HISTORY_MIGRATIONS);
  return createCombatHistory(db, dir, sessionId);
}

function combatant(name: string, dealt: number, mine = false): CombatantStat {
  return {
    name,
    dealt,
    taken: 0,
    healed: 0,
    hits: 1,
    misses: 0,
    crits: 0,
    maxHit: dealt,
    activeSec: 1,
    dps: dealt,
    mine,
    byStance: [],
    byType: [],
    bySpell: [],
    specials: [],
  };
}

/** A combatant that took damage rather than dealing it — what a fight is named after. */
function hurt(name: string, taken: number): CombatantStat {
  return { ...combatant(name, 0), taken };
}

/** One damage cell, for the fights whose label depends on who hit whom. */
function cell(target: string, attacker: string, kind: DamageKind, source: string, damage: number): DamageCell {
  return { target, attacker, kind, source, damage, hits: 1, ticks: 0, misses: 0, crits: 0, maxHit: damage };
}

/** A fight at minute `min`, where you dealt `yours` and the mob dealt `theirs`. */
function fight(min: number, yours: number, theirs: number, mob = "a coyote", extra: Partial<FightStats> = {}): FightStats {
  // Minutes past 01:00, rolling into hours — a fight is keyed by its timestamps now, so two
  // fights in a test have to happen at different times, as two fights in a log do.
  const stamp = (m: number) =>
    `2026-07-29T${String(1 + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00.000Z`;
  return {
    startedAt: stamp(min),
    endedAt: stamp(min),
    durationSec: 10,
    spanSec: 10,
    totalDealt: yours + theirs,
    yourDealt: yours,
    yourTaken: theirs,
    byCombatant: [combatant("You", yours, true), combatant(mob, theirs)],
    spells: [],
    byMob: [],
    kills: 1,
    xpPct: 1,
    xpGains: 1,
    soloXp: 1,
    partyXp: 0,
    copper: 0,
    soldCopper: 0,
    yourPerSec: [],
    deaths: [],
    invocations: [],
    ...extra,
  };
}

// ── re-deriving a log file's fights (ADR 0128) ──
/** The epoch-ms span a `fight(min, …)` sits in, widened, so `rederive` counts it as covered. */
const covering = (fromMin: number, toMin: number) => ({
  from: Date.parse(fight(fromMin, 0, 0).startedAt) - 1000,
  to: Date.parse(fight(toMin, 0, 0).endedAt) + 1000,
});

const LOG = "C:/EQ/Logs/eqlog_Kainos_qeynos.txt";

test("re-reading a log replaces a stored fight's figures and leaves its filing alone", () => {
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), "Qeynos Hills", LOG);
  const before = h.search("").fights[0];

  // The same fight, read by a parser that can now see another 40 damage of your DoT ticks.
  const out = h.rederive(LOG, [{ stats: fight(1, 140, 20), zone: "Qeynos Hills" }], covering(1, 1));
  assert.deepEqual(out, { refreshed: 1, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });

  const after = h.search("").fights[0];
  assert.equal(after.stats.yourDealt, 140); // the figure is re-derived…
  assert.equal(after.id, before.id); // …and everything about where it sits survives
  assert.equal(after.sessionId, "run:live");
  assert.equal(after.zone, "Qeynos Hills");
  assert.equal(h.search("").total, 1); // one fight, not two
});

test("re-deriving twice lands the same thing — idempotent in the sense that matters", () => {
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  const derived = [{ stats: fight(1, 140, 20) }];
  h.rederive(LOG, derived, covering(1, 1));
  const out = h.rederive(LOG, derived, covering(1, 1));
  assert.deepEqual(out, { refreshed: 1, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });
  assert.equal(h.search("").total, 1);
  assert.equal(h.search("").fights[0].stats.yourDealt, 140);
});

test("a rule that moves a boundary supersedes the fight it replaces rather than doubling it", () => {
  // Two stored pulls; today's parser reads a line that used to fall on the floor and sees one fight.
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.add(fight(2, 60, 10), null, LOG);
  const merged = fight(1, 160, 30, "a coyote", { endedAt: fight(2, 0, 0).endedAt });

  const out = h.rederive(LOG, [{ stats: merged }], covering(1, 2));
  assert.deepEqual(out, { refreshed: 0, added: 1, superseded: 2, unsourced: 0, trimmed: 0 });
  const kept = h.search("").fights;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].stats.yourDealt, 160);
  assert.equal(kept[0].sessionId, "run:live"); // inherited, not invented
});

test("two genuinely different fights that land on the same log-second don't crash a re-derive", () => {
  // EQ's own timestamp is one-second resolution (the same fact `kill-log.ts` documents for its own
  // key collisions) — two short, back-to-back pulls that both start and end within the same logged
  // second produce the *same* `(file, startedAt, endedAt)` identity `combat_fights.key` is unique on,
  // even though they're two real, distinct fights against different mobs. Before this was guarded
  // against, the second one threw `UNIQUE constraint failed` from inside `rederive`'s own
  // transaction — rolling back every other, unrelated fight the same re-derive was about to refresh.
  const h = freshHistory(tempDir(), "run:live");
  const derived = [
    { stats: fight(5, 100, 20, "a gnoll") },
    { stats: fight(5, 50, 10, "Zebra Fang") },
  ];
  // A plain call that throws fails this test on its own — no `assert.doesNotThrow` needed.
  const out = h.rederive(LOG, derived, covering(5, 5));
  // The first of the colliding pair wins, the second is dropped before it's ever counted as
  // anything — not silently held as a second row under one identity, and not reported as "trimmed"
  // either, since it was never a real candidate to survive in the first place.
  const kept = h.search("").fights;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].label, "a gnoll", "the first of the pair, not the second, is the one kept");
  assert.deepEqual(out, { refreshed: 0, added: 1, superseded: 0, unsourced: 0, trimmed: 0 });

  // Re-deriving the exact same colliding pair again must still land on one row, not lose track of
  // which one is "prior" and double-match both derived entries onto it.
  const again = h.rederive(LOG, derived, covering(5, 5));
  assert.equal(h.search("").fights.length, 1);
  assert.deepEqual(again, { refreshed: 1, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });
});

test("a fight the file can no longer account for is kept and says so", () => {
  // The log rotated: the file now starts at minute 10, and the fight at minute 1 has no source.
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.add(fight(11, 70, 5), null, LOG);

  const out = h.rederive(LOG, [{ stats: fight(11, 70, 5) }], covering(10, 12));
  assert.deepEqual(out, { refreshed: 1, added: 0, superseded: 0, unsourced: 1, trimmed: 0 });
  const byStart = h.search("").fights.sort((a, b) => a.stats.startedAt.localeCompare(b.stats.startedAt));
  assert.equal(byStart.length, 2); // kept, not dropped
  assert.equal(byStart[0].unsourced, true);
  assert.equal(byStart[1].unsourced, undefined); // this one was just read from the file
});

test("the admin panel shows unsourced as a real boolean, not a raw 0/1", () => {
  // `unsourced` is stored as a SQLite integer (`combat_fights` has no boolean column type), but the
  // hidden admin panel's field-typing infers a field's type from its live JS value — a raw `0`/`1`
  // reads as "number", which would put a plain number box where the true/false toggle this field
  // showed before this store moved off a plain JS array.
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.add(fight(11, 70, 5), null, LOG);
  h.rederive(LOG, [{ stats: fight(11, 70, 5) }], covering(10, 12)); // marks the minute-1 fight unsourced

  const marked = h.admin.list().find((r) => r.summary.includes(String(fight(1, 100, 20).startedAt)))!;
  assert.deepEqual(marked.fields.find((f) => f.key === "unsourced"), {
    key: "unsourced",
    value: true,
    type: "boolean",
  });

  // A patch round-trips as a real boolean too, not a stray "true"/"false" string or a bare 1/0.
  assert.deepEqual(h.admin.patch(marked.id, "unsourced", "false"), { ok: true });
  const after = h.admin.list().find((r) => r.id === marked.id)!;
  assert.equal(after.fields.find((f) => f.key === "unsourced")?.value, false);
  assert.equal(h.search("").fights.find((f) => f.id === marked.id)?.unsourced, undefined);
});

test("setting a never-marked 'unsourced' to 'false' via admin doesn't read back as true", () => {
  // The field-typing that makes `unsourced` show as a true/false toggle (`adminFieldType`,
  // `src/shared/admin.ts`) infers a field's type from its *current* value — a fight that's never
  // been marked unsourced (the default for nearly every fight; only `rederive` ever sets it) reads
  // as "null" type, not "boolean", so `coerceAdminValue` falls through to its free-text branch and
  // hands back the literal STRING "false" instead of the boolean `false`. Left uncorrected, that
  // string binds into the `INTEGER` column as text, and reading it back (`!!"false"`) says `true`.
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  const [record] = h.admin.list();
  assert.equal(record.fields.find((f) => f.key === "unsourced")?.value, null, "never marked");

  assert.deepEqual(h.admin.patch(record.id, "unsourced", "false"), { ok: true });
  const after = h.admin.list()[0];
  assert.equal(after.fields.find((f) => f.key === "unsourced")?.value, false, "not true");
  assert.equal(h.search("").fights.find((f) => f.id === record.id)?.unsourced, undefined);
});

test("a fight newer than what we read is left alone, not marked", () => {
  // The file goes on growing, and the live watcher files fights while a re-reading is in progress.
  // Newer than what we read is not the same as older than what survives.
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(5, 100, 20), null, LOG);
  h.add(fight(30, 70, 5), null, LOG); // filed live, after the read below had finished

  const out = h.rederive(LOG, [{ stats: fight(5, 140, 20) }], covering(1, 10));
  assert.deepEqual(out, { refreshed: 1, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });
  const later = h.search("").fights.find((f) => f.stats.yourDealt === 70)!;
  assert.equal(later.unsourced, undefined); // no ⚑ on the pull you just finished
  assert.equal(h.search("").total, 2); // and it wasn't superseded either
});

test("reading the source again clears an unsourced mark", () => {
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.rederive(LOG, [], covering(10, 12)); // out of reach: flagged
  assert.equal(h.search("").fights[0].unsourced, true);
  h.rederive(LOG, [{ stats: fight(1, 100, 20) }], covering(1, 1)); // and back in reach
  assert.equal(h.search("").fights[0].unsourced, undefined);
});

test("another character's log is not re-derived by reading yours", () => {
  const other = "C:/EQ/Logs/eqlog_Someone_qeynos.txt";
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.add(fight(1, 55, 5), null, other); // same minute, different log — a different fight

  const out = h.rederive(LOG, [{ stats: fight(1, 140, 20) }], covering(1, 1));
  assert.deepEqual(out, { refreshed: 1, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });
  const theirs = h.search("").fights.find((f) => f.logFile === other)!;
  assert.equal(theirs.stats.yourDealt, 55); // untouched, and not marked unsourced either
  assert.equal(theirs.unsourced, undefined);
});

test("the same log under a different path or capitalisation is the same log", () => {
  const h = freshHistory(tempDir(), "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  const out = h.rederive("D:/backup/EQLOG_Kainos_qeynos.TXT", [], covering(10, 12));
  assert.equal(out.unsourced, 1); // recognised as ours, so it got the mark
});

test("a re-derived fight survives a restart with its new figures", () => {
  const dir = tempDir();
  const h = freshHistory(dir, "run:live");
  h.add(fight(1, 100, 20), null, LOG);
  h.rederive(LOG, [{ stats: fight(1, 140, 20) }], covering(1, 1));
  h.flush();

  const reopened = freshHistory(dir, "run:later");
  assert.equal(reopened.search("").total, 1);
  assert.equal(reopened.search("").fights[0].stats.yourDealt, 140);
  // And it still dedupes: the key was re-indexed, so a live path filing it again is refused.
  assert.equal(reopened.add(fight(1, 140, 20), null, LOG), false);
});

test("re-reading a log longer than the old cap used to hold now derives every fight in it", () => {
  // `MAX_FIGHTS` (1000) is gone (ADR 0243) — a log with more fights than that no longer gets any of
  // them trimmed back, and re-reading the same file a second time refreshes the same ones rather
  // than claiming to add anything new.
  const h = freshHistory(tempDir(), "run:live");
  const many = Array.from({ length: 1005 }, (_, i) => ({ stats: fight(i, 10 + i, 1) }));
  const first = h.rederive(LOG, many, covering(0, 1004));
  assert.equal(first.added, 1005, "every fight in the log, not just the old cap's worth");
  assert.equal(first.trimmed, 0);

  const again = h.rederive(LOG, many, covering(0, 1004));
  assert.deepEqual(again, { refreshed: 1005, added: 0, superseded: 0, unsourced: 0, trimmed: 0 });
  assert.equal(h.search("").total, 1005, "and the list didn't shrink");
});

test("fights are grouped into the session that recorded them", () => {
  const h = freshHistory(tempDir(), "session-a");
  h.add(fight(1, 100, 20));
  h.add(fight(2, 50, 10));

  const sessions = h.sessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, "session-a");
  assert.equal(sessions[0].fights, 2);
  assert.equal(sessions[0].yourDealt, 150);
  assert.equal(sessions[0].yourTaken, 30);
  assert.equal(sessions[0].totalDealt, 180);
  assert.equal(sessions[0].combatSec, 20);
});

test("a session spans its first and last fight", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(5, 1, 1));
  h.add(fight(9, 1, 1));
  const [s] = h.sessions();
  assert.match(s.startedAt, /01:05/);
  assert.match(s.endedAt, /01:09/);
});

test("a fight is labelled with the thing you were fighting", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 100, 20, "Minotaur Lord"));
  assert.equal(h.fights("s")[0].label, "Minotaur Lord");
});

test("in a group the fight is named after the mob, not the group-mate out-damaging you", () => {
  const h = freshHistory(tempDir(), "s");
  // BunnySlayer out-damages everything in the room, which is exactly why "the biggest dealer that
  // isn't mine" used to title the fight after them. What *we* damaged is the coyote.
  h.add(
    fight(1, 100, 20, "a coyote", {
      byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400), combatant("a coyote", 20)],
      damageCells: [
        cell("a coyote", "You", "Melee", "Slash", 100),
        cell("a coyote", "BunnySlayer", "Melee", "Slash", 400),
        cell("You", "a coyote", "Melee", "Bite", 20),
      ],
    }),
  );
  assert.equal(h.fights("s")[0].label, "a coyote");
});

test("a fight stored under the old label rule is renamed on read, not left as it was filed", () => {
  const dir = tempDir();
  const a = freshHistory(dir, "s");
  a.add(fight(1, 100, 20, "a coyote", { byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400)] }));
  a.flush();
  // Hand-edit the stored row to the label the old rule would have written, as a real history's
  // `combat_fights` table has for fights filed before ADR 0021's "re-derive on read" existed.
  const db = new Database(path.join(dir, "eqlist.db"));
  db.prepare(`UPDATE combat_fights SET label = 'BunnySlayer'`).run();
  db.close();

  // No cells on that fight either, so the fallback has to carry it: whatever took the most damage.
  const b = freshHistory(dir, "s2");
  assert.equal(b.fights("s")[0].label, "BunnySlayer"); // nothing took damage, so the dealer stands
  // With a victim on record, the same read names it instead.
  const c = freshHistory(tempDir(), "s");
  c.add(
    fight(1, 100, 20, "a coyote", {
      byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400), hurt("a coyote", 500)],
    }),
  );
  assert.equal(c.fights("s")[0].label, "a coyote");
});

test("a login starts a new play session, and the same login twice is still one", () => {
  const h = freshHistory(tempDir(), "run:1");
  h.add(fight(1, 10, 1, "before"));
  h.startSession("2026-07-29T20:00:00");
  h.add(fight(2, 10, 1, "after"));
  // The gap between two runs of the app gets replayed, so the same line can arrive twice.
  h.startSession("2026-07-29T20:00:00");
  h.add(fight(3, 10, 1, "later that evening"));

  const sessions = h.sessions();
  assert.equal(sessions.length, 2, "one session per login, not per app run");
  assert.deepEqual(
    h.fights("login:2026-07-29T20:00:00").map((f) => f.label),
    ["later that evening", "after"],
  );
  assert.deepEqual(
    h.fights("run:1").map((f) => f.label),
    ["before"],
  );
});

test("the same fight is filed once, however it arrives", () => {
  const dir = tempDir();
  const h = freshHistory(dir, "s");
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), true);
  // Eating a log you already watched replays the very same fight: same file, same timestamps.
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), false);
  // The path can differ (a copy of the log, a mapped drive); the file's name still names it.
  assert.equal(h.add(fight(1, 100, 20), null, "D:/backup/eqlog_Kainos_qeynos.txt"), false);
  // Another character's log genuinely records a different side of the same minutes.
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Bunnyslayer_qeynos.txt"), true);
  assert.equal(h.fights("s").length, 2);
  h.flush();

  // And it survives a restart: the keys are rebuilt from what's on disk.
  const reopened = freshHistory(dir, "s2");
  assert.equal(reopened.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), false);
});

test("a fight stored before keying still dedupes against a later import", () => {
  // A legacy `combat-history.json` from before a fight carried its own `key` at all — the migration
  // has to backfill one (the same fallback `fightKey(f.stats, f.logFile)` computed at read time
  // before ADR 0232), or a fight filed under the old shape would never dedupe again.
  const dir = tempDir();
  const stats = fight(3, 50, 5);
  fs.writeFileSync(
    path.join(dir, "combat-history.json"),
    JSON.stringify({
      fights: [{ id: "x", sessionId: "s", label: "a coyote", logFile: "/logs/eqlog_Kainos_qeynos.txt", stats }],
    }),
  );

  const reopened = freshHistory(dir, "s2");
  assert.equal(reopened.add(stats, null, "/logs/eqlog_Kainos_qeynos.txt"), false);
});

test("a fight is filed under the session it's given, not the one in progress", () => {
  const h = freshHistory(tempDir(), "run:live");
  // What eating a log does: each sitting it finds is named on the call, so the live session the
  // app is in the middle of isn't disturbed.
  h.add(fight(1, 10, 1, "eaten"), null, "/logs/old.txt", "login:2026-07-01T20:00:00");
  h.add(fight(2, 10, 1, "live"));
  assert.deepEqual(
    h.sessions().map((s) => s.sessionId).sort(),
    ["login:2026-07-01T20:00:00", "run:live"],
  );
  assert.deepEqual(h.fights("login:2026-07-01T20:00:00").map((f) => f.label), ["eaten"]);
});

test("fights come back newest first", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 1, 1, "first"));
  h.add(fight(2, 1, 1, "second"));
  assert.deepEqual(
    h.fights("s").map((f) => f.label),
    ["second", "first"],
  );
});

test("only the asked-for session's fights come back", () => {
  const dir = tempDir();
  const a = freshHistory(dir, "session-a");
  a.add(fight(1, 1, 1, "from-a"));
  a.flush();
  // A second run of the app is a new session, reading the same file.
  const b = freshHistory(dir, "session-b");
  b.add(fight(2, 1, 1, "from-b"));

  assert.equal(b.sessions().length, 2);
  assert.deepEqual(
    b.fights("session-a").map((f) => f.label),
    ["from-a"],
  );
  assert.deepEqual(
    b.fights("session-b").map((f) => f.label),
    ["from-b"],
  );
});

test("history survives a restart", () => {
  const dir = tempDir();
  const first = freshHistory(dir, "s");
  first.add(fight(1, 42, 7));
  first.flush();

  const reopened = freshHistory(dir, "s2");
  const [session] = reopened.sessions();
  assert.equal(session.sessionId, "s");
  assert.equal(session.yourDealt, 42);
});

test("combat_fights keeps every fight forever — recording well past the old cap drops nothing", () => {
  const h = freshHistory(tempDir(), "s");
  // A minute apart each, because a fight is identified by when it happened.
  const OVER_OLD_CAP = 1005; // more than the removed MAX_FIGHTS (1000)
  for (let i = 0; i < OVER_OLD_CAP; i++) h.add(fight(i, i, 0, `fight-${i}`));

  const fights = h.fights("s");
  assert.equal(fights.length, OVER_OLD_CAP, "nothing was dropped, however many fights piled up");
  assert.equal(fights[0].label, "fight-1004", "newest first");
  assert.equal(fights.at(-1)!.label, "fight-0", "the very first fight is still on record");
});

test("searching finds fights by mob and by zone, across sessions", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 10, 1, "Minotaur Lord"), "Steamfont Mountains");
  h.add(fight(2, 10, 1, "a coyote"), "Steamfont Mountains");
  h.startSession("2026-07-29T21:00:00");
  h.add(fight(3, 10, 1, "a minotaur guard"), "Steamfont Mountains");
  h.add(fight(4, 10, 1, "a rat"), "Ak'Anon");

  // By mob, case-insensitively, however many sittings it spans — newest first.
  assert.deepEqual(h.search("minotaur").fights.map((f) => f.label), ["a minotaur guard", "Minotaur Lord"]);
  // By zone, for the fights whose names have nothing in common.
  assert.equal(h.search("ak'anon").total, 1);
  assert.equal(h.search("steamfont").total, 3);
  // Every word has to match, in either field — which is what makes "mob + where" one search.
  assert.deepEqual(h.search("coyote steam").fights.map((f) => f.label), ["a coyote"]);
  assert.equal(h.search("coyote akanon").total, 0);
  // A fight with no zone on record is matched on its name alone, not dropped.
  const noZone = freshHistory(tempDir(), "s");
  noZone.add(fight(1, 10, 1, "a coyote"));
  assert.equal(noZone.search("coyote").total, 1);
});

test("a search sends back the newest matches and says how many it left out", () => {
  const h = freshHistory(tempDir(), "s");
  for (let i = 0; i < 120; i++) h.add(fight(i, i, 0, `a coyote ${i}`));

  const capped = h.search("coyote", 10);
  assert.equal(capped.total, 120, "the count is every match, not the slice");
  assert.equal(capped.fights.length, 10);
  assert.equal(capped.fights[0].label, "a coyote 119"); // newest, as the list shows them
  // Under the cap, the two agree.
  const few = h.search(" coyote 100 ", 10);
  assert.deepEqual(few.fights.map((f) => f.label), ["a coyote 100"]);
  assert.equal(few.total, 1);
});

test("zones aggregate every recorded fight, best experience rate first", () => {
  const h = freshHistory(tempDir(), "s");
  // Two fights in a good camp, one in a slow one.
  h.add(fight(1, 100, 10, "a coyote", { durationSec: 60, kills: 2, xpPct: 2 }), "Steamfont Mountains");
  h.add(fight(2, 100, 10, "a coyote", { durationSec: 60, kills: 2, xpPct: 2 }), "Steamfont Mountains");
  h.add(fight(3, 100, 10, "a rat", { durationSec: 120, kills: 1, xpPct: 0.5 }), "Ak'Anon");

  const [best, worst] = h.zones();
  assert.equal(best.zone, "Steamfont Mountains");
  assert.equal(best.fights, 2);
  assert.equal(best.kills, 4);
  assert.equal(best.xpPct, 4);
  assert.equal(best.xpPerMin, 2); // 4% over 2 minutes of combat
  assert.equal(best.dps, 1.7); // 200 damage over 120s
  assert.equal(worst.zone, "Ak'Anon");
  assert.equal(worst.xpPerMin, 0.25);
});

test("one camp is one row, whatever the log called the zone that evening", () => {
  // The fights keep the log's own wording — difficulty, ruleset, the pack's spelling — and the report
  // groups them by **place** when it's read (ADR 0083). Split, a camp played at two difficulties reads
  // as two rows that each look half as good as the evening actually was.
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 100, 10, "a rat", { durationSec: 60, kills: 2, xpPct: 2 }), "Toxxulia Forest");
  h.add(fight(2, 100, 10, "a rat", { durationSec: 60, kills: 2, xpPct: 2 }), "The Toxxulia Forest 3 (Adaptive)");
  h.add(fight(3, 100, 10, "a rat", { durationSec: 60, kills: 2, xpPct: 2 }), "Toxulia Forest");

  const zones = h.zones();
  assert.equal(zones.length, 1, `three wordings of one camp: ${zones.map((z) => z.zone).join(", ")}`);
  assert.equal(zones[0].zone, "Toxxulia Forest", "labelled by the mapping table");
  assert.equal(zones[0].fights, 3);
  assert.equal(zones[0].kills, 6);
  // The fight rows themselves are untouched, so a later, better table can be pointed at them again.
  assert.deepEqual(
    h.search("rat", 10).fights.map((f) => f.zone).sort(),
    ["The Toxxulia Forest 3 (Adaptive)", "Toxulia Forest", "Toxxulia Forest"],
  );
});

test("a fight with no known zone is left out of the zone report", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 10, 1)); // the log hadn't told us a zone yet
  assert.deepEqual(h.zones(), []);
});

test("bests keep your top DPS per opponent", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 100, 5, "Minotaur Lord", { durationSec: 10 })); // 10/s
  h.add(fight(2, 300, 5, "Minotaur Lord", { durationSec: 10 })); // 30/s ← best
  h.add(fight(3, 50, 5, "Minotaur Lord", { durationSec: 10 })); // 5/s
  h.add(fight(4, 60, 5, "a coyote", { durationSec: 10 }));

  const bests = h.bests();
  assert.equal(bests.length, 2);
  const lord = bests.find((b) => b.label === "Minotaur Lord")!;
  assert.equal(lord.dps, 30);
  assert.equal(lord.yourDealt, 300);
});

test("clear empties the store on disk too", () => {
  const dir = tempDir();
  const h = freshHistory(dir, "s");
  h.add(fight(1, 1, 1));
  h.clear();
  assert.deepEqual(h.sessions(), []);
  assert.deepEqual(freshHistory(dir, "s2").sessions(), []);
});

test("an unreadable history file is not a hard failure", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "combat-history.json"), "{not json");
  const h = freshHistory(dir, "s");
  assert.deepEqual(h.sessions(), []);
  h.add(fight(1, 5, 0)); // and it still records from there
  assert.equal(h.sessions()[0].yourDealt, 5);
});

test("a pre-ADR-0232 combat-history.json is folded in once; the file survives as a provenance stub", () => {
  const dir = tempDir();
  const legacyFile = path.join(dir, "combat-history.json");
  fs.writeFileSync(
    legacyFile,
    JSON.stringify({
      fights: [
        {
          id: "x",
          key: "eqlog_Kainos_qeynos.txt 2026-07-29T01:01:00.000Z 2026-07-29T01:01:00.000Z",
          sessionId: "s",
          label: "a coyote",
          stats: fight(1, 100, 20),
        },
      ],
      provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" },
    }),
  );

  const h = freshHistory(dir, "s2");
  assert.equal(h.search("").total, 1);
  assert.equal(h.search("").fights[0].stats.yourDealt, 100);
  // The file isn't renamed away: `data-health.ts` still reads its `provenance` field directly off
  // disk (see the module doc), carrying the *legacy* stamp forward exactly as it was — not a fresh
  // "current" one, since moving storage engines re-derives nothing through today's rules.
  assert.equal(fs.existsSync(legacyFile), true);
  const stub = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  assert.deepEqual(stub, { provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" } });

  // Reopening the same directory's database must not double the migrated fight — the stub has no
  // `fights` array left for a second construction to (re-)migrate from.
  const again = freshHistory(dir, "s3");
  assert.equal(again.search("").total, 1, "still just the one migrated fight");
});

/**
 * `zones()`/`bests()`/`sessions()` moved their actual computation to a background worker thread
 * (ADR 0247) — but every test in this file (including this one) always uses a real, file-backed
 * database (see `freshHistory`'s own doc), so this exercises the *real* worker, not a stand-in for
 * it. The synchronous fallback in each of the three means correctness never depends on the worker
 * finishing in time — this just confirms the background half of the shared cache genuinely runs.
 */
test("a background refresh eventually confirms the same reports the synchronous path already gave", async () => {
  const h = freshHistory(tempDir(), "s");
  let changed = 0;
  h.onCombatReportsChanged(() => changed++);

  for (let i = 0; i < 20; i++) h.add(fight(i, 10, 1, "a coyote"), "Steamfont Mountains");

  const immediate = h.zones();
  assert.equal(immediate[0]?.fights, 20, "correct immediately, before any background refresh could possibly have run");

  // Polled, not awaited directly: the worker is a real background thread doing real (if tiny) I/O,
  // not a mocked timer — generous enough to never be flaky, short enough to fail fast if the
  // mechanism is genuinely broken.
  const deadline = Date.now() + 5000;
  while (changed === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(changed > 0, "the background worker never confirmed a refresh within 5s");
  assert.equal(h.zones()[0]?.fights, 20, "the background-confirmed zones() agrees with the synchronous one");
  assert.equal(h.bests()[0]?.yourDealt, 10, "and so does bests(), sharing the same cache");
  assert.equal(h.sessions()[0]?.fights, 20, "and sessions()");
  // search() (ADR 0252) joined the same shared cache as zones()/bests()/sessions() — it should agree
  // with them, not run its own separate scan.
  assert.equal(h.search("coyote").total, 20, "and search(), now reading the same cache");
});

test("search() reflects a fight's label as it reads today, not as it was stored", () => {
  const h = freshHistory(tempDir(), "s");
  h.add(fight(1, 10, 1, "a coyote"), "Steamfont Mountains");
  const stored = h.search("").fights[0];
  assert.equal(stored.label, "a coyote");
  // Same property `search()` always had (`labelFor` recomputed on read, never trusted from the
  // stored column) — now answered from `computeCombatReports`'s `searchIndex` instead of a fresh
  // per-call scan, and it still has to agree.
  assert.equal(h.search("coyote").fights[0].label, "a coyote");
  assert.equal(h.search("nonexistent mob name").total, 0);
});
