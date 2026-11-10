/**
 * persistence.mjs — change three stores through the real API, quit at once, start again, ask.
 *
 * The quit probe for [ADR 0379](../../../specs/decisions/0379-quitting-writes-every-pending-save.md): the
 * stores write a moment after a change, so a player who closes the app right after a click depends on
 * quitting bringing that write forward. The changes are made, the app is quit through `Browser.close`
 * inside the shortest debounce, and a second launch on the *same* userData reports what it still has.
 *
 * `--inject-fault skip-flush` ends the app with no chance to save instead, which must lose all three —
 * the proof that "all kept" can be told from "all lost".
 */
import { attachMain } from "../lib/app-session.mjs";
import { launchApp, reapProfile } from "../lib/instance.mjs";
import { fail, skip } from "../lib/report.mjs";
import { applyChanges, judgeSurvival, pickManualCriterion, planChanges, readBack, storeFilesOnDisk } from "./stores.mjs";

const NAME = "persistence: quit";

export async function persistenceCheck(env) {
  const profile = env.profile("persist", { withHistory: false });
  let first;
  let second;
  try {
    first = await launchApp({ profile, rendererUrl: env.rendererUrl, appDir: env.appDir, label: "first" });
    const before = await attachMain(first);
    const achievement = pickManualCriterion(JSON.parse(await before.page.evaluate("window.eql.achievements.view().then(JSON.stringify)")));
    if (!achievement) return skip(NAME, "this build has no manual achievement criterion to tick");
    const changes = planChanges("quit", achievement);

    await applyChanges(before.page, changes);
    const changedAt = Date.now();
    before.close();
    let how = "a quit (Browser.close)";
    if (env.faults.has("skip-flush")) {
      how = "being ended with no chance to save (fault: skip-flush)";
      await first.kill();
    } else {
      const quit = await first.quit();
      if (!quit.graceful) return fail(NAME, "the app did not exit after a quit and had to be ended", [`launch log: ${first.outFile}`]);
    }
    const elapsedMs = Date.now() - changedAt;
    const disk = storeFilesOnDisk(profile.userData);

    second = await launchApp({ profile, rendererUrl: env.rendererUrl, appDir: env.appDir, label: "second" });
    const after = await attachMain(second);
    const survived = await readBack(after.page, changes);
    after.close();
    await second.quit();
    return judgeSurvival(NAME, survived, { how, elapsedMs, disk });
  } finally {
    for (const app of [first, second]) if (app?.isRunning()) await app.kill();
    await reapProfile(profile);
  }
}
