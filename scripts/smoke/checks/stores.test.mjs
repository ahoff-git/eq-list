import { test } from "node:test";
import assert from "node:assert/strict";

import { judgeSurvival, pickManualCriterion, planChanges } from "./stores.mjs";

const running = (id, ...kinds) => ({ definition: { id, criteria: kinds.map((kind, i) => ({ id: `${id}-${i}`, kind })) } });

test("a manual criterion on an achievement with several criteria is preferred, so ticking it cannot complete one", () => {
  const view = { achievements: [running("only-manual", "manual"), running("many", "watch", "manual"), running("none", "watch")] };
  assert.deepEqual(pickManualCriterion(view), { achievementId: "many", criterionId: "many-1" });
});

test("failing that, any manual criterion will do", () => {
  assert.deepEqual(pickManualCriterion({ achievements: [running("a", "watch"), running("b", "manual")] }), { achievementId: "b", criterionId: "b-0" });
});

test("a build with no manual criterion at all has nothing to tick", () => {
  assert.equal(pickManualCriterion({ achievements: [running("a", "watch")] }), undefined);
  assert.equal(pickManualCriterion({ achievements: [] }), undefined);
  assert.equal(pickManualCriterion(undefined), undefined);
});

test("a bare definition list is read the same as a running one", () => {
  assert.equal(pickManualCriterion({ achievements: [{ id: "x", criteria: [{ id: "c", kind: "manual" }] }] }).achievementId, "x");
});

test("each probe plans changes of its own, so one run's leftovers cannot pass for another's", () => {
  const a = planChanges("quit", { achievementId: "a", criterionId: "c" });
  const b = planChanges("session", { achievementId: "a", criterionId: "c" });
  assert.notEqual(a.settingKey, b.settingKey);
  assert.notEqual(a.alarmMessage, b.alarmMessage);
});

const disk = ["achievements.json: not on disk"];

test("all three kept is a pass", () => {
  const r = judgeSurvival("persistence", { achievement: true, setting: true, alarm: true }, { how: "a quit", elapsedMs: 80, disk });
  assert.equal(r.status, "pass");
});

test("any store lost is a failure that names it, and shows the files on disk", () => {
  const r = judgeSurvival("persistence", { achievement: false, setting: false, alarm: true }, { how: "a quit", elapsedMs: 80, disk });
  assert.equal(r.status, "fail");
  assert.match(r.summary, /lost achievement, panel setting/);
  assert.match(r.evidence.join("\n"), /LOST {2}achievement/);
  assert.match(r.evidence.join("\n"), /achievements\.json: not on disk/);
});

test("a late end is said so, since the shortest debounce may already have fired", () => {
  const r = judgeSurvival("persistence", { achievement: true, setting: true, alarm: true }, { how: "a quit", elapsedMs: 900, disk });
  assert.match(r.evidence.join("\n"), /may already have written/);
});
