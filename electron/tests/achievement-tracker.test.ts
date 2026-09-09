/**
 * Tests for the holder: checking off a stock or custom achievement's criteria from a combat event, a
 * raw line, a zone arrival or a fallen record, banners for each criterion and for completion, and the
 * manual override that can tick — or reopen — any of them regardless of kind (ADR 0212).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAchievementTracker, type AchievementTracker } from "../achievement-tracker";
import { BUILT_IN_STYLES } from "../../src/shared/alert-styles";
import { CURATED_ZONES } from "../../src/shared/zones/gazetteer";
import type { CastAlertEvent, CastAlertSettings, CombatEvent, HighScore, LogLine } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-achievements-"));

const settings = (enabled = true) =>
  ({ enabled, includeSelf: false, color: "#e5534b", position: "top", styles: [...BUILT_IN_STYLES] }) as unknown as CastAlertSettings;

function line(message: string, atSec: number): LogLine {
  return { message, at: new Date(T0 + atSec * 1000).toISOString(), raw: message, logId: atSec };
}

function cast(caster: string, spell: string, atSec: number): CombatEvent {
  return { kind: "cast", caster, spell, at: new Date(T0 + atSec * 1000).toISOString(), raw: "", logId: atSec };
}

interface Harness {
  tracker: AchievementTracker;
  raised: CastAlertEvent[];
  dir: string;
}

function harness(options: { settings?: CastAlertSettings; dir?: string; zone?: string | null } = {}): Harness {
  const raised: CastAlertEvent[] = [];
  const dir = options.dir ?? tempDir();
  const tracker = createAchievementTracker({
    userDataDir: dir,
    getSettings: () => options.settings ?? settings(),
    getZone: () => options.zone ?? null,
    raise: (a) => raised.push(a),
    now: () => T0,
  });
  return { tracker, raised, dir };
}

test("a stock achievement's manual criterion completes it and raises a completion banner", () => {
  const { tracker, raised } = harness();
  const before = tracker.view().achievements.find((a) => a.definition.id === "stock:say-hello")!;
  assert.equal(before.done.length, 0);

  tracker.setManual("stock:say-hello", "hello", true);

  const after = tracker.view().achievements.find((a) => a.definition.id === "stock:say-hello")!;
  assert.deepEqual(after.done, ["hello"]);
  assert.ok(after.completedAt);
  assert.equal(raised.length, 1);
  assert.equal(raised[0].event, "achievement");
  assert.equal(raised[0].achievement?.kind, "completed");
  assert.equal(raised[0].achievement?.title, "Say Hello");
});

test("unticking a completed criterion reopens the achievement, and re-ticking celebrates again", () => {
  const { tracker, raised } = harness();
  tracker.setManual("stock:say-hello", "hello", true);
  assert.equal(raised.length, 1);

  tracker.setManual("stock:say-hello", "hello", false);
  const reopened = tracker.view().achievements.find((a) => a.definition.id === "stock:say-hello")!;
  assert.equal(reopened.done.length, 0);
  assert.equal(reopened.completedAt, undefined);
  assert.equal(raised.length, 1); // reopening itself is not news

  tracker.setManual("stock:say-hello", "hello", true);
  assert.equal(raised.length, 2);
  assert.equal(raised[1].achievement?.kind, "completed");
});

test("setManual ignores an unknown achievement or criterion id", () => {
  const { tracker, raised } = harness();
  tracker.setManual("nope", "hello", true);
  tracker.setManual("stock:say-hello", "nope", true);
  assert.equal(raised.length, 0);
});

test("a raw log line completes a watch criterion and banners it", () => {
  const { tracker, raised } = harness();
  tracker.line(line("You have slain a rat.", 1));
  const first = tracker.view().achievements.find((a) => a.definition.id === "stock:first-blood")!;
  assert.equal(first.done.length, 1);
  assert.equal(raised.length, 1);
  assert.equal(raised[0].achievement?.kind, "completed"); // one criterion, so done === finished
  assert.equal(raised[0].achievement?.title, "First Blood");
});

test("a line that doesn't contain the trigger leaves the criterion untouched", () => {
  const { tracker, raised } = harness();
  tracker.line(line("a rat hits you for 3 points of damage.", 1));
  const first = tracker.view().achievements.find((a) => a.definition.id === "stock:first-blood")!;
  assert.equal(first.done.length, 0);
  assert.equal(raised.length, 0);
});

test("a fallen high score completes a threshold criterion, and a lower one doesn't", () => {
  const { tracker, raised } = harness();
  const record = (value: number): HighScore => ({ categoryId: "biggest-hit", value, at: new Date(T0).toISOString(), beaten: 1 });

  tracker.record(record(499));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:now-were-talking")!.done.length, 0);
  assert.equal(raised.length, 0);

  tracker.record(record(500));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:now-were-talking")!.done.length, 1);
  assert.equal(raised.length, 1);
});

test("a zone criterion is folded, so a difficulty variant of a known zone still checks it off", () => {
  const zoneName = CURATED_ZONES[0].name;
  const { tracker, raised } = harness();
  tracker.zone(`${zoneName} 2 (Adaptive)`);
  const tour = tracker.view().achievements.find((a) => a.definition.id === "stock:grand-tour")!;
  assert.equal(tour.done.length, 1);
  // Grand Tour has many criteria, so one zone is progress, not completion.
  assert.equal(raised.length, 1);
  assert.equal(raised[0].achievement?.kind, "criterion");
  assert.equal(raised[0].achievement?.criterionLabel, zoneName);
});

test("an unrecognised zone name checks off nothing", () => {
  const { tracker, raised } = harness();
  tracker.zone("Not A Real Place At All");
  const tour = tracker.view().achievements.find((a) => a.definition.id === "stock:grand-tour")!;
  assert.equal(tour.done.length, 0);
  assert.equal(raised.length, 0);
});

test("create refuses a blank title or an achievement with no usable criteria", () => {
  const { tracker } = harness();
  assert.equal(tracker.create({ title: "  ", criteria: [{ label: "a" }] }), null);
  assert.equal(tracker.create({ title: "Real Title", criteria: [{ label: "  " }] }), null);
});

test("a custom achievement's manual criteria work exactly like a stock one's", () => {
  const { tracker, raised } = harness();
  const def = tracker.create({ title: "My Own Thing", criteria: [{ label: "Step one" }, { label: "Step two" }] });
  assert.ok(def);
  assert.equal(def!.isOfficial, false);
  assert.equal(def!.criteria.length, 2);

  tracker.setManual(def!.id, def!.criteria[0].id, true);
  assert.equal(raised[0].achievement?.kind, "criterion");
  tracker.setManual(def!.id, def!.criteria[1].id, true);
  assert.equal(raised[1].achievement?.kind, "completed");
});

test("a custom achievement's line trigger becomes a watch criterion, regex included", () => {
  const { tracker } = harness();
  const def = tracker.create({
    title: "Regex Achievement",
    criteria: [{ label: "Say the word", trigger: { text: "you (win|lose)", regex: true } }],
  });
  tracker.line(line("You win!", 1));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === def!.id)!.done.length, 1);
});

test("deleteCustom removes a custom achievement and its progress, but refuses a stock id", () => {
  const { tracker } = harness();
  const def = tracker.create({ title: "Throwaway", criteria: [{ label: "a" }] })!;
  tracker.setManual(def.id, def.criteria[0].id, true);

  tracker.deleteCustom("stock:say-hello");
  assert.ok(tracker.view().achievements.some((a) => a.definition.id === "stock:say-hello"));

  tracker.deleteCustom(def.id);
  assert.ok(!tracker.view().achievements.some((a) => a.definition.id === def.id));
});

test("progress survives a restart: a fresh tracker over the same directory reads it back", () => {
  const dir = tempDir();
  const first = harness({ dir });
  first.tracker.setManual("stock:say-hello", "hello", true);
  first.tracker.flush();

  const second = harness({ dir });
  const restored = second.tracker.view().achievements.find((a) => a.definition.id === "stock:say-hello")!;
  assert.deepEqual(restored.done, ["hello"]);
});

test("alerts.enabled === false silences every achievement banner, though progress still lands", () => {
  const { tracker, raised } = harness({ settings: settings(false) });
  tracker.setManual("stock:say-hello", "hello", true);
  assert.equal(raised.length, 0);
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:say-hello")!.done.length, 1);
});

// ── ADR 0214: self-scoped casts, counted criteria, and the new stock achievements ──────────────

test("a mob's cast never completes a cast-based achievement, even one an ordinary alert rule would fire on", () => {
  const { tracker, raised } = harness();
  tracker.combat(cast("a shade", "Resurrection", 1));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:rez")!.done.length, 0);
  assert.equal(raised.length, 0);
});

test("the player's own cast of a resurrection spell completes it, regardless of the global includeSelf alert setting", () => {
  const { tracker, raised } = harness({ settings: settings(true) }); // settings() sets includeSelf: false
  tracker.combat(cast("You", "Resurrection", 1));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:rez")!.done.length, 1);
  assert.equal(raised[0]?.achievement?.kind, "completed");
});

test("dying completes the silly \"Oops\" achievement from the player's own death line only", () => {
  const { tracker } = harness();
  tracker.line(line("a rat has been slain by Bob!", 1)); // a bystander's kill — not the player's death
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:die")!.done.length, 0);
  tracker.line(line("You have been slain by a rat!", 2));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:die")!.done.length, 1);
});

test("a named-mob kill-line criterion fires on the player's own kill credit", () => {
  const { tracker } = harness();
  tracker.line(line("You have slain King Xorbb!", 1));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === "stock:king-xorbb")!.done.length, 1);
});

test("a \"count\" criterion tallies each match, banners progress below its goal, and completes at the threshold", () => {
  const { tracker, raised } = harness();
  // "You have slain a hill giant!" also satisfies the independent "First Blood" achievement on its
  // first occurrence — banners for this test only care about "Beanstalk Problem"'s own.
  const own = () => raised.filter((a) => a.achievement?.title === "Beanstalk Problem");

  for (let i = 1; i <= 24; i++) tracker.line(line("You have slain a hill giant!", i));
  const before = tracker.view().achievements.find((a) => a.definition.id === "stock:hill-giants")!;
  assert.equal(before.done.length, 0);
  assert.equal(before.tally["hill-giants"], 24);
  assert.equal(own().length, 24);
  assert.equal(own()[0].achievement?.tally, 1);
  assert.equal(own()[0].achievement?.tallyGoal, 25);
  assert.equal(own()[23].achievement?.tally, 24);

  tracker.line(line("You have slain a hill giant!", 25));
  const after = tracker.view().achievements.find((a) => a.definition.id === "stock:hill-giants")!;
  assert.equal(after.done.length, 1);
  assert.equal(own().length, 25);
  assert.equal(own()[24].achievement?.kind, "completed");
  assert.equal(own()[24].achievement?.tally, undefined); // the completion banner, not a tally one
});

test("a \"count\" criterion's variant mobs count too, generously, the same way a farming goal's mob target does", () => {
  const { tracker } = harness();
  tracker.line(line("You have slain a corrupted hill giant!", 1));
  tracker.line(line("You have slain a tainted hill giant!", 2));
  assert.equal(
    tracker.view().achievements.find((a) => a.definition.id === "stock:hill-giants")!.tally["hill-giants"],
    2,
  );
});

test("a wizard-created cast criterion is self-scoped exactly like a stock one", () => {
  const { tracker, raised } = harness();
  const def = tracker.create({
    title: "My Own Rez",
    criteria: [{ label: "Cast a heal", trigger: { text: "Heal", onCast: true } }],
  })!;
  tracker.combat(cast("a shade", "Superior Healing", 1));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === def.id)!.done.length, 0);
  tracker.combat(cast("You", "Superior Healing", 2));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === def.id)!.done.length, 1);
  assert.equal(raised.at(-1)?.achievement?.kind, "completed");
});

test("a wizard-created criterion with a count > 1 becomes a tallying \"count\" criterion", () => {
  const { tracker } = harness();
  const def = tracker.create({
    title: "Rat Slayer",
    criteria: [{ label: "Kill rats", trigger: { text: "You have slain a rat", count: 3 } }],
  })!;
  assert.equal(def.criteria[0].kind, "count");
  tracker.line(line("You have slain a rat!", 1));
  tracker.line(line("You have slain a rat!", 2));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === def.id)!.done.length, 0);
  tracker.line(line("You have slain a rat!", 3));
  assert.equal(tracker.view().achievements.find((a) => a.definition.id === def.id)!.done.length, 1);
});

test("progress and tallies both survive a restart", () => {
  const dir = tempDir();
  const first = harness({ dir });
  for (let i = 1; i <= 10; i++) first.tracker.line(line("You have slain a hill giant!", i));
  first.tracker.flush();

  const second = harness({ dir });
  const restored = second.tracker.view().achievements.find((a) => a.definition.id === "stock:hill-giants")!;
  assert.equal(restored.tally["hill-giants"], 10);
  assert.equal(restored.done.length, 0);
});
