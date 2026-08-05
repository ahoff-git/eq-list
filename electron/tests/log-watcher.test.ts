/**
 * Integration tests for the log watcher. Unlike the pure log-parser tests, these
 * exercise the real filesystem tailing: they write to a temp eqlog, run the
 * watcher, and assert loot events arrive. They cover the behaviors that can't be
 * unit-tested — reading only newly-appended lines, and resetting on truncation.
 *
 * The watcher polls every 500ms, so these use short real-time waits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogWatcher } from "../log-watcher";
import { createLogCursor } from "../log-cursor";
import type { LocEvent, LogLine, LootEvent } from "../../src/shared/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Generous by default: these tests poll real files on a 500ms tick while the rest of the suite runs
// alongside them, and a timeout here means "too slow", not "wrong" — every wait is followed by the
// assertion that actually decides the test.
async function waitFor(pred: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error("timed out waiting for condition");
}

function tempLogDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-watch-"));
}

/**
 * Append, and make sure this log really is the most recently written one in its folder.
 *
 * Auto mode follows the newest mtime, and Windows file times move in ~16ms steps: two logs written
 * within the same step share an mtime exactly, leaving `resolveTarget`'s sort to fall back on
 * readdir order — so a test that swaps characters quickly kept following the first log and timed
 * out. Stamping this file clear of the others states what the scenario is actually about: this
 * character is the one being played now.
 */
function appendAsNewest(file: string, line: string): void {
  fs.appendFileSync(file, line);
  const dir = path.dirname(file);
  const others = fs.readdirSync(dir).map((f) => fs.statSync(path.join(dir, f)).mtimeMs);
  const at = new Date(Math.max(Date.now(), ...others) + 1000);
  fs.utimesSync(file, at, at);
}

const LOOT = "--You have looted a Bone Chips from a decaying skeleton's corpse.--";
const stamp = (msg: string) => `[Mon Jul 20 19:03:45 2026] ${msg}`;

test("emits loot for lines appended after start, ignoring backlog and chatter", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  // Pre-existing content must NOT be replayed — we only want new drops.
  fs.writeFileSync(file, stamp("--You have looted a Backlog Item from a rat's corpse.--") + "\n");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700); // let the watcher anchor at end-of-file
    fs.appendFileSync(file, stamp("You say, 'Hail, a guard'") + "\n"); // chatter → ignored
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].item, "Bone Chips");
    assert.equal(events[0].source, "decaying skeleton");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A party invite is a line no parser owns, so the only way to alert on one is to see the line
// itself. Every timestamped line comes through, parsed or not; a line without a timestamp is not
// a log line at all.
test("every timestamped line is offered raw, whether or not a parser claims it", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, "");

  const watcher = createLogWatcher();
  const lines: LogLine[] = [];
  const loot: LootEvent[] = [];
  watcher.onLine((l) => lines.push(l));
  watcher.onLoot((e) => loot.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.appendFileSync(file, stamp("BunnySlayer invites you to a party.") + "\n");
    fs.appendFileSync(file, stamp(LOOT) + "\n"); // a line that IS parsed still comes through raw
    fs.appendFileSync(file, "not a log line at all\n");
    await waitFor(() => lines.length >= 2);
    assert.deepEqual(
      lines.map((l) => l.message),
      ["BunnySlayer invites you to a party.", LOOT],
    );
    assert.equal(loot.length, 1); // and the typed event still arrives as before
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a log that appears after watching starts, from the top (the sim case)", async () => {
  const dir = tempLogDir();
  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, ""); // empty dir — no target yet

  try {
    await sleep(700);
    // A fresh session log appears with content already written (like `npm run sim`).
    fs.writeFileSync(path.join(dir, "eqlog_New_test.txt"), stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    assert.equal(events[0].item, "Bone Chips");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Switching to a character you haven't played since launch used to replay their whole log as
// if it were happening now — 120 phantom kills in a measured run, plus re-counted experience,
// re-matched loot and an alert for every spell they were ever cast at.
test("switching to a log that already existed does not replay its history", async () => {
  const dir = tempLogDir();
  const idle = path.join(dir, "eqlog_Idle_test.txt");
  const active = path.join(dir, "eqlog_Active_test.txt");
  // Both characters have a past, and the active one was written most recently.
  fs.writeFileSync(idle, stamp("--You have looted a Ancient History from a rat's corpse.--") + "\n");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(idle, old, old);
  fs.writeFileSync(active, stamp("--You have looted a Also History from a rat's corpse.--") + "\n");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    assert.equal(events.length, 0, "neither log's history should be replayed at startup");

    // The player switches characters: the idle log starts being written again.
    appendAsNewest(idle, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    await sleep(700); // let a replay show up, if it were going to

    assert.deepEqual(
      events.map((e) => e.item),
      ["Bone Chips"],
      "only the newly written line, not the whole file",
    );
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Two characters in one sitting swap which eqlog is newest. Coming back to the first one used
// to re-read it from the top, replaying every kill, drop and fight in it a second time.
test("switching characters and back does not replay the first log", async () => {
  const dir = tempLogDir();
  const first = path.join(dir, "eqlog_First_test.txt");
  const second = path.join(dir, "eqlog_Second_test.txt");
  fs.writeFileSync(first, "");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.appendFileSync(first, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);

    // Play the second character: its log is now the most recently written.
    fs.writeFileSync(second, stamp("--You have looted a Rat Ear from a rat's corpse.--") + "\n");
    await waitFor(() => events.length >= 2);
    assert.equal(events[1].item, "Rat Ear");

    // Back to the first: writing to it makes it newest again. Only the new line should arrive.
    appendAsNewest(first, stamp("--You have looted a Snake Fang from a snake's corpse.--") + "\n");
    await waitFor(() => events.length >= 3);
    await sleep(700); // give a replay time to show up, if it were going to

    assert.deepEqual(
      events.map((e) => e.item),
      ["Bone Chips", "Rat Ear", "Snake Fang"],
    );
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Anchoring at end-of-file is right for events and wrong for state: starting the app mid-session
// left it not knowing which zone the player was standing in. `catchUpState` decides what counts as
// state; these cover the wiring — that it runs where a log is about to be skipped, and only there.
test("starting on an existing log recovers the zone it will not replay", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(
    file,
    [
      stamp("You have entered Greater Faydark."),
      stamp("--You have looted a Ancient History from a rat's corpse.--"),
      stamp("Your Location is 400.00, -300.00, 15.00"),
      "",
    ].join("\n"),
  );

  const watcher = createLogWatcher();
  const zones: string[] = [];
  const locs: LocEvent[] = [];
  const loot: LootEvent[] = [];
  watcher.onZone((e) => zones.push(e.zone));
  watcher.onLoc((e) => locs.push(e));
  watcher.onLoot((e) => loot.push(e));
  watcher.start(dir, "");

  try {
    await waitFor(() => zones.length >= 1);
    assert.deepEqual(zones, ["Greater Faydark"]);
    assert.deepEqual([locs[0]?.y, locs[0]?.x, locs[0]?.z], [400, -300, 15]);
    await sleep(700); // let a replay show up, if it were going to
    assert.equal(loot.length, 0, "state is recovered; history is still not replayed");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("switching to a character who was already logged in recovers their zone", async () => {
  const dir = tempLogDir();
  const idle = path.join(dir, "eqlog_Idle_test.txt");
  const active = path.join(dir, "eqlog_Active_test.txt");
  fs.writeFileSync(idle, stamp("You have entered Clan Crushbone.") + "\n");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(idle, old, old);
  fs.writeFileSync(active, stamp("You have entered Greater Faydark.") + "\n");

  const watcher = createLogWatcher();
  const zones: string[] = [];
  watcher.onZone((e) => zones.push(e.zone));
  watcher.start(dir, "");

  try {
    await waitFor(() => zones.length >= 1);
    assert.deepEqual(zones, ["Greater Faydark"], "the character being played");

    // The player swaps to the idle character, whose log resumes from where it was pinned — so the
    // zone they're standing in is behind that point, and only catch-up can find it.
    appendAsNewest(idle, stamp("You say, 'Hail, a guard'") + "\n");
    await waitFor(() => zones.length >= 2);
    assert.deepEqual(zones, ["Greater Faydark", "Clan Crushbone"]);
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a log that appears after start is read whole, so its zone is not reported twice", async () => {
  const dir = tempLogDir();
  const watcher = createLogWatcher();
  const zones: string[] = [];
  watcher.onZone((e) => zones.push(e.zone));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.writeFileSync(path.join(dir, "eqlog_New_test.txt"), stamp("You have entered Befallen.") + "\n");
    await waitFor(() => zones.length >= 1);
    await sleep(700);
    assert.deepEqual(zones, ["Befallen"]);
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The app's state used to depend on when it was launched: anything logged while it was closed was
// skipped for good, so a restart lost kills, drops and experience that really happened. A remembered
// read position makes the gap news rather than history — read once, on the next start.
test("a restart reads what was logged while the app was closed, exactly once", async () => {
  const dir = tempLogDir();
  const data = tempLogDir(); // stands in for userData
  const cursor = createLogCursor(data);
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, stamp("--You have looted a Ancient History from a rat's corpse.--") + "\n");

  const first = createLogWatcher(cursor);
  const before: LootEvent[] = [];
  first.onLoot((e) => before.push(e));
  first.start(dir, "");

  const after: LootEvent[] = [];
  let second: ReturnType<typeof createLogWatcher> | null = null;
  try {
    await sleep(700);
    assert.equal(before.length, 0, "a log we've never read is still pinned at its end");
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => before.length >= 1);

    first.stop(); // the app quits
    fs.appendFileSync(file, stamp("--You have looted a While Closed from a rat's corpse.--") + "\n");

    second = createLogWatcher(cursor); // ...and reopens
    second.onLoot((e) => after.push(e));
    second.start(dir, "");
    await waitFor(() => after.length >= 1);
    await sleep(700); // let a duplicate show up, if it were going to

    assert.deepEqual(
      after.map((e) => e.item),
      ["While Closed"],
      "the gap, and nothing either side of it",
    );
  } finally {
    first.stop();
    second?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("a restart with nothing logged in between reads nothing", async () => {
  const dir = tempLogDir();
  const data = tempLogDir();
  const cursor = createLogCursor(data);
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, "");

  const first = createLogWatcher(cursor);
  const before: LootEvent[] = [];
  first.onLoot((e) => before.push(e));
  first.start(dir, "");

  const after: LootEvent[] = [];
  let second: ReturnType<typeof createLogWatcher> | null = null;
  try {
    await sleep(700);
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => before.length >= 1);
    first.stop();

    second = createLogWatcher(cursor);
    second.onLoot((e) => after.push(e));
    second.start(dir, "");
    await sleep(900);
    assert.deepEqual(after, [], "nothing was written, so there is nothing to catch up on");
  } finally {
    first.stop();
    second?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("a log replaced while the app was closed is read from the top, not skipped", async () => {
  // Archive your log between sessions and the remembered position is past the end of the new file.
  // Everything in it is then unread, so it's all news — and the state catch-up has to look inside
  // the *new* file rather than trusting the old position.
  const dir = tempLogDir();
  const data = tempLogDir();
  const cursor = createLogCursor(data);
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, stamp("--You have looted a Ancient History from a rat's corpse.--").repeat(50) + "\n");

  const first = createLogWatcher(cursor);
  first.start(dir, "");
  const loot: LootEvent[] = [];
  const zones: string[] = [];
  let second: ReturnType<typeof createLogWatcher> | null = null;
  try {
    await sleep(700);
    first.stop();
    // A fresh, much shorter log takes its place.
    fs.writeFileSync(
      file,
      [stamp("You have entered Befallen."), stamp(LOOT), ""].join("\n"),
    );

    second = createLogWatcher(cursor);
    second.onLoot((e) => loot.push(e));
    second.onZone((e) => zones.push(e.zone));
    second.start(dir, "");
    await waitFor(() => loot.length >= 1);
    await sleep(700);
    assert.deepEqual(
      loot.map((e) => e.item),
      ["Bone Chips"],
      "the new file's content, once",
    );
    assert.deepEqual(zones, ["Befallen"]);
  } finally {
    first.stop();
    second?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("the gap is reported, with how stale it is", async () => {
  // `main.ts` uses this to decide whether the live meter carries on or last night's fights belong
  // to history — the timestamp is the log's own, not the wall clock.
  const dir = tempLogDir();
  const data = tempLogDir();
  const cursor = createLogCursor(data);
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, "");

  const first = createLogWatcher(cursor);
  first.start(dir, "");
  const caught: { bytes: number; lastAt?: string }[] = [];
  let second: ReturnType<typeof createLogWatcher> | null = null;
  try {
    await sleep(700);
    first.stop();
    fs.appendFileSync(file, stamp(LOOT) + "\n");

    second = createLogWatcher(cursor);
    second.onCaughtUp((info) => caught.push(info));
    second.start(dir, "");
    await waitFor(() => caught.length >= 1);
    assert.equal(caught.length, 1, "reported once per start");
    assert.ok(caught[0].bytes > 0);
    assert.equal(new Date(caught[0].lastAt!).getHours(), 19); // the log line's own 19:03:45
  } finally {
    first.stop();
    second?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("an empty catch-up is still reported", async () => {
  const dir = tempLogDir();
  const watcher = createLogWatcher();
  const caught: { bytes: number }[] = [];
  watcher.onCaughtUp((info) => caught.push(info));
  fs.writeFileSync(path.join(dir, "eqlog_Tester_test.txt"), stamp(LOOT) + "\n");
  watcher.start(dir, "");
  try {
    await waitFor(() => caught.length >= 1);
    assert.deepEqual(
      caught.map((c) => c.bytes),
      [0],
      "no gap to read, and the caller shouldn't have to wonder whether one is coming",
    );
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resumes after the log is truncated / rotated", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, "");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);

    // Truncate + write fresh content, as a new game session would.
    fs.writeFileSync(file, stamp("--You have looted a Fire Beetle Eye from a fire beetle's corpse.--") + "\n");
    await waitFor(() => events.length >= 2);
    assert.equal(events[1].item, "Fire Beetle Eye");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Catch-up widens its read until it finds a zone line, and a log can be long enough to outrun even
 * the widest window. That case used to fall out of the loop and emit *nothing* — throwing away a
 * `/loc` it had already read, while the same reading on a small log was emitted happily. A position
 * with no zone line before it still says where you are (`catchUpState`), so it's the best answer
 * available and losing it leaves the map with no dot at all.
 */
test("a log too long to find a zone line in still reports the position it found", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Marathon_test.txt");
  // The zone line goes first and is then buried under more than the widest catch-up window (4MB),
  // so no pass can reach it. The `/loc` sits at the very end, well inside the narrowest pass.
  const filler = stamp("You say, 'Hail, a guard'") + "\n";
  fs.writeFileSync(
    file,
    stamp("You have entered Greater Faydark.") +
      "\n" +
      filler.repeat(Math.ceil((5 * 1024 * 1024) / filler.length)) +
      stamp("Your Location is 111.00, 222.00, 33.00") +
      "\n",
  );
  assert.ok(fs.statSync(file).size > 4 * 1024 * 1024, "the log has to outrun the widest window");

  const watcher = createLogWatcher();
  const zones: string[] = [];
  const locs: LocEvent[] = [];
  watcher.onZone((e) => zones.push(e.zone));
  watcher.onLoc((e) => locs.push(e));
  watcher.start(dir, "");

  try {
    await waitFor(() => locs.length >= 1);
    assert.deepEqual([locs[0].y, locs[0].x, locs[0].z], [111, 222, 33], "the position is not discarded");
    assert.deepEqual(zones, [], "and no zone is invented for it — we genuinely never found one");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
