/**
 * ipc-fuzz.mjs — feed the app's own IPC hostile arguments and ask, after every call, "is main still there?"
 *
 * Every function on `window.eql` is the renderer's door into the main process. One call with a 2 MB
 * search string once pinned main at 100% CPU for half an hour ([ADR 0378](../../../specs/decisions/0378-a-typed-search-is-capped-before-it-searches.md)),
 * and nothing else in the suite could have said so: unit tests call the functions with sensible
 * arguments, and a sweep clicks what the UI offers. This calls what the UI would never send.
 *
 * "Still there" is `GET /json/version` on the app's debugging port, answered by the main process: a
 * main that is busy or frozen does not answer, a busy *renderer* does not matter. A call is made, the
 * answer is timed, and a main that does not come back is a failure naming the call that did it.
 *
 * Side-effect functions are left alone (`SKIPPED`, each with its reason): this runs on a scratch profile,
 * so writing junk into it is fine, but opening a window over the player's game, a native dialog nobody
 * can answer, or the peer room is not.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attachMain } from "../lib/app-session.mjs";
import { sleep } from "../lib/cdp.mjs";
import { launchApp, reapProfile } from "../lib/instance.mjs";
import { fail, pass } from "../lib/report.mjs";
import { ARG_SHAPES, callExpression, fuzzTargets } from "./fuzz-plan.mjs";

const SUSPEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "suspend.ps1");

/** Every function path on `window.eql`, walked in the page. */
function functionPathsInPage() {
  const paths = [];
  const walk = (object, prefix, depth) => {
    if (!object || depth > 3) return;
    for (const key of Object.keys(object)) {
      const value = object[key];
      const dotted = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "function") paths.push(dotted);
      else if (value && typeof value === "object") walk(value, dotted, depth + 1);
    }
  };
  walk(window.eql, "", 0);
  return paths;
}

const CALL_TIMEOUT_MS = 1200;
/** Main answering slower than this is noted; failing to answer at all within `HUNG_AFTER_MS` is the failure. */
const SLOW_MS = 700;
const HUNG_AFTER_MS = 3000;
const DEADLINE_MS = 5 * 60_000;
/** The fault freezes main this far in, so the failure has real calls on both sides of it. */
const FREEZE_AFTER_CALLS = 40;

/** How long main took to answer, or `null` if it did not within `HUNG_AFTER_MS` (twice, a few seconds apart). */
async function mainAnswerTime(app) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    if (await app.alive(HUNG_AFTER_MS)) return Date.now() - started;
    await sleep(2500);
  }
  return null;
}

export async function ipcFuzzCheck(env) {
  const name = "ipc-fuzz";
  const profile = env.profile("fuzz", { withHistory: true });
  let app;
  try {
    app = await launchApp({ profile, rendererUrl: env.rendererUrl, appDir: env.appDir, label: "fuzz" });
    const session = await attachMain(app);
    const { targets, left } = fuzzTargets(await session.driver.run(functionPathsInPage));

    const started = Date.now();
    let calls = 0;
    let rejected = 0;
    const slow = [];
    for (const target of targets) {
      for (const [label, args] of ARG_SHAPES) {
        if (Date.now() - started > DEADLINE_MS) {
          return pass(name, `stopped at the ${DEADLINE_MS / 60000}-minute budget after ${calls} calls; main never hung`, [`${targets.length} functions, ${left.length} skipped`]);
        }
        if (env.faults.has("hang-main") && calls === FREEZE_AFTER_CALLS) spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SUSPEND, "-ProcessId", String(app.pid)], { windowsHide: true });
        const outcome = await session.page
          .evaluate(callExpression(target, args, CALL_TIMEOUT_MS), { timeoutMs: CALL_TIMEOUT_MS + 2500 })
          .catch(() => "no answer");
        calls += 1;
        if (outcome === "rejected") rejected += 1;
        const took = await mainAnswerTime(app);
        if (took === null) {
          return fail(name, `main stopped answering after ${target}(${label})`, [
            `call ${calls} of ${targets.length * ARG_SHAPES.length}; the page's call ended "${outcome}"`,
            `no answer on the debugging port for ${HUNG_AFTER_MS} ms, twice`,
          ]);
        }
        if (took > SLOW_MS) slow.push(`${target}(${label}): main took ${took} ms to answer afterwards`);
      }
    }
    return pass(name, `${calls} calls to ${targets.length} functions; main answered after every one`, [
      `${ARG_SHAPES.length} hostile shapes each: ${ARG_SHAPES.map(([label]) => label).join(", ")}`,
      `${rejected} rejected cleanly; ${slow.length} slow (> ${SLOW_MS} ms)`,
      ...slow.slice(0, 5),
      `skipped ${left.length} with side effects: ${[...new Set(left.map((l) => l.why))].join("; ")}`,
    ]);
  } finally {
    if (app?.isRunning()) await app.kill();
    await reapProfile(profile);
  }
}
