/**
 * stores.mjs — changing the app's JSON stores through its real API, and finding out what survived.
 *
 * The stores keep a change in memory and write it a moment later (0.4 s for panel settings, 2 s for
 * achievements and the game clock). Quitting, or Windows ending the session, has to bring that write
 * forward ([ADR 0379](../../../specs/decisions/0379-quitting-writes-every-pending-save.md)); the way to
 * find out whether it does is to change one thing in each store, end the app *inside* the debounce
 * window, start it again, and ask. Both the quit probe and the session-end probe share this.
 *
 * The three stores are the ones the ADR measured: the achievements and the panel settings were the two
 * the old hand-written quit list forgot, and the game clock was on it (the control).
 */
import fs from "node:fs";
import path from "node:path";

import { pass, fail } from "../lib/report.mjs";

/** The shortest debounce among the three, in ms: a probe that ends the app later than this proves nothing. */
export const SHORTEST_DEBOUNCE_MS = 400;

/**
 * A manual criterion to tick — one on an achievement with several criteria, so ticking it cannot complete
 * the achievement and fire a celebration banner over the player's screen. Falls back to any manual one.
 */
export function pickManualCriterion(view) {
  const definitions = (view?.achievements ?? []).map((running) => running.definition ?? running);
  const manual = (def) => (def.criteria ?? []).filter((c) => c.kind === "manual");
  const candidates = definitions.filter((def) => manual(def).length > 0);
  const chosen = candidates.find((def) => def.criteria.length > 1) ?? candidates[0];
  return chosen ? { achievementId: chosen.id, criterionId: manual(chosen)[0].id } : undefined;
}

/** What the probe will change, made unique per probe so a leftover from an earlier run cannot pass for this one. */
export const planChanges = (tag, achievement) => ({
  achievement,
  settingKey: `smoke.${tag}`,
  settingValue: `pending-at-${tag}`,
  alarmMinute: 481,
  alarmMessage: `smoke ${tag}`,
});

/**
 * Make the three changes, in the order that leaves the *shortest* debounce for last, so the clock for the
 * 400 ms store starts as late as it can. One evaluate, so the changes are as close together as they can be.
 */
export function applyChanges(page, changes) {
  const { achievement, settingKey, settingValue, alarmMinute, alarmMessage } = changes;
  return page.evaluate(`(async () => {
    await window.eql.achievements.setManual(${JSON.stringify(achievement.achievementId)}, ${JSON.stringify(achievement.criterionId)}, true);
    await window.eql.gameClock.add(${alarmMinute}, ${JSON.stringify(alarmMessage)});
    await window.eql.ui.set(${JSON.stringify(settingKey)}, ${JSON.stringify(settingValue)});
    return true;
  })()`);
}

/** Ask the app, through the same API the window uses, which of the three changes it still has. */
export async function readBack(page, changes) {
  const { achievement, settingKey, settingValue, alarmMinute, alarmMessage } = changes;
  const raw = await page.evaluate(`(async () => {
    const view = await window.eql.achievements.view();
    const running = view.achievements.find((r) => r.definition.id === ${JSON.stringify(achievement.achievementId)});
    const settings = await window.eql.ui.all();
    const clock = await window.eql.gameClock.view();
    return JSON.stringify({
      achievement: Boolean(running && running.done.includes(${JSON.stringify(achievement.criterionId)})),
      setting: settings[${JSON.stringify(settingKey)}] === ${JSON.stringify(settingValue)},
      alarm: clock.alarms.some((a) => a.minute === ${alarmMinute} && a.message === ${JSON.stringify(alarmMessage)}),
    });
  })()`);
  return JSON.parse(raw);
}

/** The store files as they are on disk, for the evidence of a failure: which exist and how big. */
export function storeFilesOnDisk(userData) {
  return ["achievements.json", "ui-state.json", "game-clock.json"].map((name) => {
    const file = path.join(userData, name);
    return fs.existsSync(file) ? `${name}: ${fs.statSync(file).size} bytes` : `${name}: not on disk`;
  });
}

const LABELS = { achievement: "achievement (2 s debounce)", setting: "panel setting (0.4 s debounce)", alarm: "game-clock alarm (2 s debounce)" };

/** Survived or lost, per store, as one result. `how` says what ended the app. */
export function judgeSurvival(name, survived, { how, elapsedMs, disk }) {
  const lost = Object.keys(LABELS).filter((key) => !survived[key]);
  const evidence = [
    ...Object.entries(LABELS).map(([key, label]) => `${survived[key] ? "kept" : "LOST"}  ${label}`),
    `ended ${elapsedMs} ms after the last change, by ${how}`,
    ...(elapsedMs >= SHORTEST_DEBOUNCE_MS ? [`that is past the 0.4 s debounce, so the panel setting's own timer may already have written it`] : []),
    ...(lost.length ? disk : []),
  ];
  return lost.length
    ? fail(name, `lost ${lost.map((k) => LABELS[k].split(" (")[0]).join(", ")} across ${how}`, evidence)
    : pass(name, `all three kept across ${how}`, evidence);
}
