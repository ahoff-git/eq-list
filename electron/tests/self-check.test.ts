/**
 * Tests for the setup check — the chain rule
 * ([src/shared/self-check.ts](../../src/shared/self-check.ts)) and the probes that look at the world
 * ([electron/self-check.ts](../self-check.ts)).
 *
 * The chain half is tested against a made-up three-step table rather than the real one, so the rule
 * stays pinned while the catalogue is free to grow — a test that has to be edited every time a check
 * is added would be renamed "the number of checks" within a month.
 *
 * The probe half touches a real temp folder, for the same reason the store tests do: every claim
 * here is about the disk (a folder that isn't there, a log with no timestamps, a file nothing has
 * written to for a day), and none of it is provable against a mock of `fs`. The network and the
 * windows are injected, so nothing here reaches either.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  problemCount,
  reportText,
  runChecks,
  summarize,
  worstStatus,
  type CheckResult,
  type CheckStep,
} from "../../src/shared/self-check";
import { selfCheck, type SelfCheckDeps } from "../self-check";
import type { Settings, ShoppingList, WatcherStatus } from "../../src/shared/types";

// ── the chain rule ────────────────────────────────────────────────────────────

const CHAIN: CheckStep[] = [
  { id: "first", label: "The first thing", matters: "" },
  { id: "second", label: "The second thing", matters: "", needs: "first" },
  { id: "third", label: "The third thing", matters: "", needs: "second" },
];

const outcome = (status: "pass" | "warn" | "fail") => () => ({ status, detail: status });

test("a failed step skips everything downstream of it, naming what they're waiting on", async () => {
  const results = await runChecks(
    { first: outcome("fail"), second: outcome("pass"), third: outcome("pass") },
    CHAIN,
  );
  assert.deepEqual(results.map((r) => r.status), ["fail", "skip", "skip"]);
  // The whole point: a skipped row points at the *cause*, so nine faults don't bury the one.
  assert.match(results[1].detail, /The first thing/);
  // And a skip propagates — the third never ran either, though its own prerequisite merely skipped.
  assert.match(results[2].detail, /The second thing/);
});

test("a warning does not block what depends on it", () => {
  // A warn means "working, but worth knowing" — treating it as a blocker would hide real faults
  // behind an advisory, which is the opposite of the point.
  return runChecks({ first: outcome("warn"), second: outcome("fail"), third: outcome("pass") }, CHAIN).then(
    (results) => assert.deepEqual(results.map((r) => r.status), ["warn", "fail", "skip"]),
  );
});

test("a probe that throws is a failure carrying the error, not an exception out of the run", async () => {
  const results = await runChecks(
    {
      first: () => {
        throw new Error("disk on fire");
      },
    },
    CHAIN,
  );
  assert.equal(results[0].status, "fail");
  assert.match(results[0].detail, /disk on fire/);
  // The button is pressed when things are already broken; returning nothing would be the one
  // outcome with no diagnostic value at all.
  assert.equal(results.length, 3);
});

test("a step with no probe says so rather than passing quietly", async () => {
  const results = await runChecks({}, CHAIN);
  assert.equal(results[0].status, "fail");
  assert.match(results[0].detail, /Nothing knows how to check this/);
});

test("the verdict names the first problem in chain order, not the worst", async () => {
  // Chain order is causal order: the warn came first, so it's the thing to look at — but a fail
  // anywhere still outranks a warn, because it's what's actually stopping the app.
  const warned = await runChecks({ first: outcome("warn"), second: outcome("warn"), third: outcome("pass") }, CHAIN);
  assert.equal(summarize(warned).status, "warn");
  assert.match(summarize(warned).headline, /The first thing/);

  const broken = await runChecks({ first: outcome("warn"), second: outcome("fail"), third: outcome("pass") }, CHAIN);
  assert.equal(summarize(broken).status, "fail");
  assert.match(summarize(broken).headline, /The second thing/);
  assert.equal(worstStatus(broken), "fail");
  assert.equal(problemCount(broken), 2); // the warn and the fail; the skip is neither
});

test("the pasteable report carries every row and its advice", async () => {
  const results: CheckResult[] = [
    { step: CHAIN[0], status: "fail", detail: "nothing there", fix: "put something there" },
    { step: CHAIN[1], status: "skip", detail: "waiting" },
  ];
  const text = reportText(results, "a moment ago");
  assert.match(text, /a moment ago/);
  assert.match(text, /The first thing: nothing there/);
  // The advice matters in a bug report: it's what the reporter has most likely already tried.
  assert.match(text, /put something there/);
  assert.match(text, /The second thing: waiting/);
});

// ── the probes ────────────────────────────────────────────────────────────────

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-check-"));
}

const LINE = "[Mon Aug 18 21:14:03 2025] You have slain a giant rat!";

/** A settings object with only the fields the checks read — the rest never reach a probe. */
function settings(over: Partial<Settings> = {}): Settings {
  return {
    logDir: "",
    activeLogFile: "",
    castAlerts: { enabled: true, watches: [{ id: "a", spell: "Fear", enabled: true }] },
    ...over,
  } as unknown as Settings;
}

function deps(over: Partial<SelfCheckDeps> = {}): SelfCheckDeps {
  return {
    getSettings: settings,
    getList: (): ShoppingList => ({ entries: [], questRuns: {} }),
    watcherStatus: (): WatcherStatus => ({ watching: false }),
    userDataDir: tempDir(),
    alertOverlayUp: () => true,
    pingWiki: async () => ({ ok: true, detail: "answered" }),
    ...over,
  };
}

/** One step's row out of a whole run, by id. */
function row(results: CheckResult[], id: string): CheckResult {
  const found = results.find((r) => r.step.id === id);
  assert.ok(found, `no row for ${id}`);
  return found;
}

test("no log folder set: that row fails, and the whole log chain below it is skipped", async () => {
  const results = await selfCheck(deps());
  assert.equal(row(results, "log-folder").status, "fail");
  for (const id of ["log-files", "log-file", "watching", "log-fresh", "log-lines", "log-events"]) {
    assert.equal(row(results, id).status, "skip", id);
  }
  // The independent checks still run — they're not downstream of the log at all.
  assert.equal(row(results, "data-folder").status, "pass");
  assert.equal(row(results, "wiki").status, "pass");
});

test("a folder with no eqlog in it fails with the one instruction that fixes it", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "notes.txt"), "hello");
  const results = await selfCheck(deps({ getSettings: () => settings({ logDir: dir }) }));
  assert.equal(row(results, "log-folder").status, "pass");
  const files = row(results, "log-files");
  assert.equal(files.status, "fail");
  // The folder is real, so the answer is nearly always "the game was never told to log".
  assert.match(files.fix ?? "", /\/log on/);
  assert.match(files.detail, /other file/); // says the folder isn't empty — i.e. probably the wrong folder
});

test("a pinned log counts as a log to watch whatever it's called", async () => {
  // The watcher follows the path it's given without caring about the name — a renamed log, one
  // copied off another machine — so asking only about eqlog_*.txt would report "no log here" over a
  // setup that works. A diagnostic that invents a fault is worse than one that stays quiet.
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "last-night.txt"), `${LINE}
`);
  const results = await selfCheck(
    deps({ getSettings: () => settings({ logDir: dir, activeLogFile: "last-night.txt" }) }),
  );
  const there = row(results, "log-files");
  assert.equal(there.status, "pass");
  assert.match(there.detail, /last-night\.txt/);
  assert.equal(row(results, "log-file").status, "pass");
});

test("a pinned log file that isn't there is told apart from having no logs at all", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "eqlog_Kainos_pq.txt"), `${LINE}\n`);
  const results = await selfCheck(
    deps({ getSettings: () => settings({ logDir: dir, activeLogFile: "eqlog_Gone_pq.txt" }) }),
  );
  assert.equal(row(results, "log-files").status, "pass"); // there IS a log here
  const chosen = row(results, "log-file");
  assert.equal(chosen.status, "fail");
  assert.match(chosen.fix ?? "", /Specific log file/);
});

test("a live log reads through: the file, its character, its lines and its events", async () => {
  const dir = tempDir();
  const file = path.join(dir, "eqlog_Kainos_pq.proj.txt");
  fs.writeFileSync(file, `${LINE}\n[Mon Aug 18 21:14:04 2025] You say, 'hi'\n`);
  const results = await selfCheck(
    deps({
      getSettings: () => settings({ logDir: dir }),
      watcherStatus: () => ({ watching: true, file }),
    }),
  );
  assert.equal(row(results, "log-file").status, "pass");
  assert.equal(row(results, "watching").status, "pass");
  assert.equal(row(results, "log-fresh").status, "pass");
  assert.equal(row(results, "log-lines").status, "pass");
  assert.equal(row(results, "log-events").status, "pass");
  // The green row that solves the "it's watching the wrong character" case on its own.
  assert.match(row(results, "character").detail, /Kainos/);
});

test("a log nobody has written to for a day warns, and says the `if` out loud", async () => {
  const dir = tempDir();
  const file = path.join(dir, "eqlog_Kainos_pq.txt");
  fs.writeFileSync(file, `${LINE}\n`);
  const results = await selfCheck(
    deps({
      getSettings: () => settings({ logDir: dir }),
      watcherStatus: () => ({ watching: true, file }),
      now: () => Date.now() + 24 * 60 * 60 * 1000,
    }),
  );
  const fresh = row(results, "log-fresh");
  // Never a failure: checking this from the desktop rather than in game is an ordinary thing to do,
  // and the app is working perfectly in that case.
  assert.equal(fresh.status, "warn");
  assert.match(fresh.detail, /hours? ago|day ago/);
  assert.match(fresh.fix ?? "", /\/log on/);
});

test("a file that isn't an EQ log fails on its lines, and the event step waits rather than piling on", async () => {
  const dir = tempDir();
  const file = path.join(dir, "eqlog_Kainos_pq.txt");
  fs.writeFileSync(file, "just some text\nwith no timestamps at all\n");
  const results = await selfCheck(
    deps({ getSettings: () => settings({ logDir: dir }), watcherStatus: () => ({ watching: true, file }) }),
  );
  const lines = row(results, "log-lines");
  assert.equal(lines.status, "fail");
  assert.match(lines.detail, /timestamp/);
  assert.equal(row(results, "log-events").status, "skip");
});

test("a log of nothing but chat is a warning, not a fault", async () => {
  const dir = tempDir();
  const file = path.join(dir, "eqlog_Kainos_pq.txt");
  fs.writeFileSync(file, "[Mon Aug 18 21:14:04 2025] Grubble tells the guild, 'anyone for LGuk'\n");
  const results = await selfCheck(
    deps({ getSettings: () => settings({ logDir: dir }), watcherStatus: () => ({ watching: true, file }) }),
  );
  assert.equal(row(results, "log-lines").status, "pass");
  assert.equal(row(results, "log-events").status, "warn");
});

test("the watcher's own error is quoted rather than re-derived", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "eqlog_Kainos_pq.txt"), `${LINE}\n`);
  const results = await selfCheck(
    deps({
      getSettings: () => settings({ logDir: dir }),
      watcherStatus: () => ({ watching: false, error: "Log folder not found: D:\\gone" }),
    }),
  );
  assert.equal(row(results, "watching").detail, "Log folder not found: D:\\gone");
  assert.equal(row(results, "log-fresh").status, "skip");
});

test("an unwritable data folder fails, because nothing learned would survive a restart", async () => {
  const results = await selfCheck(deps({ userDataDir: path.join(tempDir(), "nope", "deeper") }));
  assert.equal(row(results, "data-folder").status, "fail");
});

test("an unreachable wiki warns and says what still works without it", async () => {
  const results = await selfCheck(deps({ pingWiki: async () => ({ ok: false, detail: "no answer" }) }));
  const wiki = row(results, "wiki");
  assert.equal(wiki.status, "warn");
  assert.match(wiki.fix ?? "", /log/i);
});

test("alerts report the three ways they can fail to reach the screen", async () => {
  const off = await selfCheck(
    deps({ getSettings: () => settings({ castAlerts: { enabled: false, watches: [] } as unknown as Settings["castAlerts"] }) }),
  );
  // A deliberate "off" is still amber: this panel is read when something isn't happening, and
  // "you switched them off" is the most useful sentence it can say.
  assert.equal(row(off, "alerts").status, "warn");

  const noWindow = await selfCheck(deps({ alertOverlayUp: () => false }));
  assert.equal(row(noWindow, "alerts").status, "fail");

  const noRules = await selfCheck(
    deps({ getSettings: () => settings({ castAlerts: { enabled: true, watches: [] } as unknown as Settings["castAlerts"] }) }),
  );
  assert.equal(row(noRules, "alerts").status, "warn");

  assert.equal(row(await selfCheck(deps()), "alerts").status, "pass");
});

test("an empty shopping list warns without implying the app is broken", async () => {
  const empty = row(await selfCheck(deps()), "list");
  assert.equal(empty.status, "warn");
  assert.match(empty.fix ?? "", /works without a list/);

  const stocked = await selfCheck(
    deps({
      getList: () => ({
        entries: [
          { id: "1", name: "Bat Wing", needed: 1, obtained: 0, addedAt: "" },
          { id: "2", name: "Ghoul Lord", kind: "mob", needed: 1, obtained: 0, addedAt: "" },
        ],
        questRuns: {},
      }),
    }),
  );
  const listed = row(stocked, "list");
  assert.equal(listed.status, "pass");
  // A mob is a thing you hunt, not a thing that drops (ADR 0098) — so it's counted apart.
  assert.match(listed.detail, /1 item.*1 mob/);
});
