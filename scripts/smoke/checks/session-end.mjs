/**
 * session-end.mjs — the same three changes, but ended the way Windows ends a shutdown.
 *
 * Windows ending the session never emits Electron's `before-quit`; it sends `WM_ENDSESSION` to the
 * windows and ends the process a moment later, and `session-end` on a window is the only event the app
 * gets ([ADR 0379](../../../specs/decisions/0379-quitting-writes-every-pending-save.md)). This probe sends
 * the real message (`SendMessageTimeout(hwnd, 0x16, 1, 0x80000000)`), then ends the process, then starts
 * the app again and asks what it has. Nothing is shut down: the message goes to one process by PID.
 *
 * Ordering is the part that needs care. Compiling the helper takes a second, longer than the stores'
 * debounce timers, so it is done first and the helper waits for a "go"; the changes are made, "go" is
 * sent, and the gap between the last change and the message is a few tens of milliseconds.
 */
import { attachMain } from "../lib/app-session.mjs";
import { prepareSessionEnd } from "../lib/end-session.mjs";
import { launchApp, reapProfile } from "../lib/instance.mjs";
import { onWindows } from "../lib/processes.mjs";
import { fail, skip } from "../lib/report.mjs";
import { applyChanges, judgeSurvival, pickManualCriterion, planChanges, readBack, storeFilesOnDisk } from "./stores.mjs";

const NAME = "persistence: session end";

export async function sessionEndCheck(env) {
  if (!onWindows) return skip(NAME, "WM_ENDSESSION is a Windows message");
  const profile = env.profile("session", { withHistory: false });
  let first;
  let second;
  let helper;
  try {
    first = await launchApp({ profile, rendererUrl: env.rendererUrl, appDir: env.appDir, label: "first" });
    const before = await attachMain(first);
    const achievement = pickManualCriterion(JSON.parse(await before.page.evaluate("window.eql.achievements.view().then(JSON.stringify)")));
    if (!achievement) return skip(NAME, "this build has no manual achievement criterion to tick");
    const changes = planChanges("session", achievement);

    helper = await prepareSessionEnd(first.pid);
    if (helper.windows === 0) return fail(NAME, "found no window to send WM_ENDSESSION to", [`pid ${first.pid} owns no top-level window`]);

    await applyChanges(before.page, changes);
    const changedAt = Date.now();
    before.close();
    let how = `WM_ENDSESSION to ${helper.windows} window${helper.windows === 1 ? "" : "s"}, then the process ended`;
    if (env.faults.has("skip-flush")) {
      how = "being ended with no chance to save (fault: skip-flush)";
      helper.abort();
      await first.kill();
    } else {
      await helper.go();
      await first.exited;
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
    helper?.abort();
    for (const app of [first, second]) if (app?.isRunning()) await app.kill();
    await reapProfile(profile);
  }
}
