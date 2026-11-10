/**
 * sweep.mjs — visit every section and every view of the running app, and report what went wrong.
 *
 * One launch, on a profile with data in it (a copy of the player's own, or a fixture the suite feeds
 * through the log), walks the **real** navigation table (`AREAS`, compiled from `src/shared/chrome`) so
 * a new section is swept the day it is added. At every step it listens for console errors and
 * uncaught exceptions, looks for a crash boundary and for values that never computed (`NaN` on
 * screen), and — where the manual checklist names a table — asserts the table behaves (grid-checks.mjs).
 *
 * It returns several results rather than one, because "the pager is missing on Items" and "something
 * threw in Now → Buffs" are different failures and a run should say which one it was.
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "../../lib/cli.mjs";
import { attachMain } from "../lib/app-session.mjs";
import { sleep, until, withTimeout } from "../lib/cdp.mjs";
import { AREAS, SECTION_NAMES } from "../lib/chrome.mjs";
import { injectBrokenText, injectConsoleError, injectCrashBoundary, injectException } from "../lib/faults.mjs";
import { brokenTextLines, findingsFromMainLog } from "../lib/findings.mjs";
import { launchApp, reapProfile } from "../lib/instance.mjs";
import { log } from "../lib/log.mjs";
import { factionHitTexts, sampleTexts, stampLines } from "../lib/log-lines.mjs";
import { readBlockedFetches } from "../lib/net-guard.mjs";
import { fail } from "../lib/report.mjs";
import { checkGrid } from "./grid-checks.mjs";
import { expectationsAt } from "./grid-expectations.mjs";
import { planWalk, sweepResults } from "./sweep-report.mjs";

/** A view list is capped: a section with a dozen toggles is not a reason for the sweep to take a minute. */
const MAX_VIEWS = 14;
const STEP_BUDGET_MS = 90_000;
/** Enough faction hits that the Hits grid has a second page at the biggest default page size (50). */
const FACTION_HITS_WANTED = 60;
const CANARY_TRIES = 8;

/** How many faction hits the ledger holds — what the Hits grid has to page through. */
const hitsTotal = (page) =>
  page.evaluate("window.eql.faction.hitsPage({ offset: 0, limit: 1, sortField: 'at', sortDesc: true }).then((r) => r.total)");

/** One faction hit, stamped now, appended to the character's log. */
const appendCanary = (profile) => fs.appendFileSync(profile.logFile, `${stampLines(factionHitTexts(1), new Date())[0]}\n`);

/**
 * Wait until the app is really following the log. Lines appended in the first seconds after a launch are
 * never read, however long the app runs (a cold fixture profile: a 123-line batch written four seconds in
 * left the ledgers empty, while one line written nine seconds in was filed) — they land before the watcher
 * has pinned its position and count as history. So a lone faction hit is appended until the app files one,
 * and only then is the real batch written. A hit takes a few seconds to file by design (the cause is held
 * for a short window, ADR 0224), which is why each try waits that long. Returns how many tries it took.
 */
async function waitUntilFollowing(page, profile) {
  const before = await hitsTotal(page);
  for (let attempt = 1; attempt <= CANARY_TRIES; attempt++) {
    appendCanary(profile);
    const filed = await until(async () => (await hitsTotal(page)) > before, { timeoutMs: 8000, everyMs: 300, label: "a canary hit" }).then(
      () => true,
      () => false,
    );
    if (filed) return attempt;
    await sleep(1000);
  }
  throw new Error(`the app filed none of ${CANARY_TRIES} faction hits appended to its log, one at a time — it is not following the log`);
}

/**
 * Give a profile something to show, by appending to the character's log — the app follows it as the game
 * writes it. Always the sample evening (kills, loot, coin, sales): it is what puts a *current* session on
 * the Session tab, which even a copy of real history lacks. A fixture profile has no faction hits either,
 * so it gets a batch; a copy of real data (plenty of hits) gets only what it lacks.
 */
async function arrangeData(page, profile) {
  const tries = await waitUntilFollowing(page, profile);
  const before = await hitsTotal(page);
  const needed = Math.max(0, FACTION_HITS_WANTED - before);
  const texts = [
    ...sampleTexts(fs.readFileSync(path.join(ROOT, "fixtures", "sample-eqlog.txt"), "utf8")),
    ...factionHitTexts(needed),
  ];
  // Stamped to end a few seconds ago: the app reads the stamp on the line, and a future one is not news yet.
  fs.appendFileSync(profile.logFile, `${stampLines(texts, new Date(Date.now() - (texts.length + 5) * 1000)).join("\n")}\n`);
  if (needed) {
    await until(async () => (await hitsTotal(page)) >= before + needed, {
      timeoutMs: 40_000,
      everyMs: 500,
      label: "the app to file the appended faction hits",
    });
  }
  await sleep(1500);
  return `appended ${texts.length} log lines (${needed} faction hits; the app followed the log on try ${tries})`;
}

/** The 🗺 button opens the map window; give it a moment to load, then listen to it too. */
async function visitMapWindow(app, collector, driver) {
  collector.step("Map window");
  const clicked = await driver.run(() => {
    const button = document.querySelector('button.wc[title="Open the map"]');
    button?.click();
    return Boolean(button);
  });
  if (!clicked) return "no 🗺 button in the title bar";
  const map = await app.page("map", 30_000);
  await collector.attach(map, "map");
  await sleep(4000);
  map.close();
  return "opened";
}

/** The sweep proper: returns what it saw, leaving classification and reporting to the caller. */
async function walk({ app, faults, collector, driver }) {
  const seen = { problems: [], steps: 0, views: 0, text: [], grids: [], timings: [] };

  const look = async (label, section, view) => {
    const crash = await driver.crash();
    if (crash) seen.problems.push(`${label}: a crash boundary is showing — ${crash}`);
    for (const line of brokenTextLines(await driver.text())) seen.text.push({ source: "text", text: line, where: label });
    for (const expectation of expectationsAt(section, view)) {
      collector.step(`${label} · ${expectation.id}`);
      for (const r of await checkGrid(driver, expectation, faults)) seen.grids.push({ ...r, grid: expectation.id });
    }
  };

  const injectFaults = async () => {
    if (faults.has("console-error")) await injectConsoleError(driver);
    if (faults.has("exception")) await injectException(driver);
    if (faults.has("broken-text")) await injectBrokenText(driver);
    if (faults.has("crash-shown")) await injectCrashBoundary(driver);
    await sleep(400);
  };

  const visit = async (step) => {
    const outcome = await driver.goTo(step.a, step.s);
    if (outcome !== "clicked") {
      seen.problems.push(`${step.label}: could not open it (${outcome})`);
      return;
    }
    seen.steps += 1;
    if (step.area === "character" && step.section === "faction") await injectFaults();
    await look(step.label, step.section, null);
    for (const view of (await driver.views()).slice(0, MAX_VIEWS)) {
      collector.step(`${step.label} → ${view}`);
      if (!(await driver.openView(view))) continue; // a toggle that only exists in another view
      seen.views += 1;
      await look(`${step.label} → ${view}`, step.section, view);
    }
  };

  for (const step of planWalk(AREAS, SECTION_NAMES)) {
    collector.step(step.label);
    log.debug("sweep →", step.label);
    const started = Date.now();
    try {
      await withTimeout(visit(step), STEP_BUDGET_MS, step.label);
    } catch (error) {
      seen.problems.push(`${step.label}: ${error.message}`);
    }
    seen.timings.push({ label: step.label, ms: Date.now() - started });
  }
  try {
    const outcome = await visitMapWindow(app, collector, driver);
    if (outcome !== "opened") seen.problems.push(`Map window: ${outcome}`);
  } catch (error) {
    seen.problems.push(`Map window: ${error.message}`);
  }
  return seen;
}

/** The launch-walk-quit cycle on one profile. Returns results; its own cleanup runs whatever happens. */
export async function sweepChecks(env) {
  const profile = env.profile("sweep", { withHistory: true });
  let app;
  try {
    app = await launchApp({ profile, rendererUrl: env.rendererUrl, appDir: env.appDir, label: "sweep" });
    const session = await attachMain(app);
    const how = `${profile.mode} profile; ${await arrangeData(session.page, profile)}`;
    const seen = await walk({ app, faults: env.faults, collector: session.collector, driver: session.driver });
    session.close();
    const quit = await app.quit();

    const mainLog = path.join(profile.userData, "eqlist-debug.log");
    const fromMain = fs.existsSync(mainLog) ? findingsFromMainLog(fs.readFileSync(mainLog, "utf8")).map((f) => ({ ...f, where: "main process log" })) : [];
    const results = sweepResults({ seen, findings: [...session.collector.findings, ...fromMain], how, blocked: readBlockedFetches(app.netLog) });
    if (!quit.graceful) results.push(fail("sweep: quits cleanly", "the app did not exit after Browser.close and had to be ended"));
    return results;
  } finally {
    if (app?.isRunning()) await app.kill();
    await reapProfile(profile);
  }
}
