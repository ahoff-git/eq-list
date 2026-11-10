/**
 * instance.mjs — launching an isolated copy of the desktop app, and ending it again.
 *
 * Everything that makes a second instance safe to run beside the player's own is here:
 *   --user-data-dir     a scratch folder. The single-instance lock is keyed on it, so this neither
 *                       collides with the running "EQ List" nor silently quits (a second launch on the
 *                       *same* userData exits with no output, which reads like a pass).
 *   EQL_DEV / EQL_DEV_URL  the renderer comes from the dev server, and the instance does not write the
 *                       web snapshot into `public/data`.
 *   --host-resolver-rules  the renderer cannot reach any host but this machine.
 *   no-network.cjs      the same for the main process, whose `fetch` that flag does not govern.
 *   ELECTRON_RUN_AS_NODE removed (`electronEnv`): with it set, `electron .` is plain Node and dies on
 *                       its first Electron call with an error that reads like a code bug.
 *
 * It only ever ends the processes it started, by PID (see processes.mjs).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

import { ROOT, electronEnv } from "../../lib/cli.mjs";
import { connect, fetchJson, sleep, until } from "./cdp.mjs";
import { log } from "./log.mjs";
import { electronProcessesFor, killTree } from "./processes.mjs";
import { parseActivePort, pickPage } from "./targets.mjs";

const HOST_RULES = "MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1";
const NO_NETWORK = path.join(path.dirname(fileURLToPath(import.meta.url)), "no-network.cjs").replace(/\\/g, "/");

/** First launch compiles the renderer on demand under `next dev`, which can take a while. */
const READY_TIMEOUT_MS = 180_000;
const QUIT_TIMEOUT_MS = 25_000;

/**
 * "The control window is up": the preload API is there and the area tabs are all enabled. The second
 * half matters — `useCapabilities` starts with every capability off and sets the real ones in an
 * effect after mount, so a window that has only just painted shows its log-fed areas greyed out.
 */
const HYDRATED = `(() => {
  const areas = [...document.querySelectorAll(".app > .tabs > button.tab")];
  return Boolean(window.eql) && areas.length > 0 && areas.every((b) => !b.disabled);
})()`;

/** Instances still running, so an aborted run can end them all. */
const running = new Set();

/**
 * Start the app on `profile` (from profile.mjs) and wait until its control window has hydrated.
 *
 *   appDir   the folder holding the app to run — the repo by default, or an older build (app-rev.mjs)
 *   label    names this launch's log files, so a profile launched twice keeps both
 */
export async function launchApp({ profile, rendererUrl, appDir = ROOT, label = "run" }) {
  const activePortFile = path.join(profile.userData, "DevToolsActivePort");
  fs.rmSync(activePortFile, { force: true });

  const outFile = path.join(profile.home, `electron-${label}.log`);
  const netLog = path.join(profile.home, `blocked-fetches-${label}.txt`);
  const out = fs.openSync(outFile, "a");
  const nodeOptions = [process.env.NODE_OPTIONS, `--require "${NO_NETWORK}"`].filter(Boolean).join(" ");

  const child = spawn(
    electronPath,
    [appDir, `--user-data-dir=${profile.userData}`, "--remote-debugging-port=0", `--host-resolver-rules=${HOST_RULES}`],
    {
      cwd: ROOT,
      env: { ...electronEnv(), EQL_DEV: "1", EQL_DEV_URL: rendererUrl, EQL_SMOKE_NETLOG: netLog, NODE_OPTIONS: nodeOptions },
      stdio: ["ignore", out, out],
    },
  );
  fs.closeSync(out);

  let exitCode;
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve((exitCode = code ?? signal ?? "unknown"))));
  log.debug("launched", { pid: child.pid, label, userData: profile.userData });

  const active = await until(() => parseActivePort(fs.readFileSync(activePortFile, "utf8")), {
    timeoutMs: 30_000,
    label: "the app's debugging port",
    giveUp: () => (exitCode === undefined ? undefined : `the app exited (${exitCode}) first — see ${outFile}`),
  });

  const httpBase = `http://127.0.0.1:${active.port}`;
  const instance = {
    label,
    profile,
    pid: child.pid,
    httpBase,
    outFile,
    netLog,
    rendererUrl,
    exited,
    isRunning: () => exitCode === undefined,
    /** Is the main process answering? Browser-level, so a hung renderer does not read as a hung app. */
    alive: (timeoutMs = 3000) => fetchJson(`${httpBase}/json/version`, timeoutMs).then(() => true, () => false),
    targets: () => fetchJson(`${httpBase}/json`),
    /** A session on the window at `route` (`""` = control window), waiting for it to exist. */
    async page(route = "", timeoutMs = 60_000) {
      const target = await until(async () => pickPage(await instance.targets(), rendererUrl, route), {
        timeoutMs,
        label: `the /${route} window`,
      });
      return connect(target.webSocketDebuggerUrl);
    },
    /** A session on the browser itself (quitting) rather than on a page. */
    browser: () => connect(`ws://127.0.0.1:${active.port}${active.path}`),
    /** Ask the app to quit the way a player closing it would. Falls back to ending the tree if it does not. */
    async quit() {
      const browser = await instance.browser();
      browser.send("Browser.close").catch(() => {}); // the app dying is the answer, not an error
      const outcome = await Promise.race([exited, sleep(QUIT_TIMEOUT_MS).then(() => "timeout")]);
      if (outcome === "timeout") {
        killTree(child.pid);
        await exited;
        running.delete(instance);
        return { graceful: false };
      }
      running.delete(instance);
      return { graceful: true, code: outcome };
    },
    /** End it without any chance to save — the thing a crash or a power cut does. */
    async kill() {
      killTree(child.pid);
      await exited;
      running.delete(instance);
    },
  };
  running.add(instance);

  try {
    const page = await instance.page("", READY_TIMEOUT_MS);
    await until(() => page.evaluate(HYDRATED), {
      timeoutMs: READY_TIMEOUT_MS,
      everyMs: 500,
      label: "the control window to hydrate",
      giveUp: () => (instance.isRunning() ? undefined : "the app exited first"),
    });
    page.close();
  } catch (error) {
    await instance.kill();
    throw error;
  }
  return instance;
}

/** End every instance still running — for the end of a run, a failed run, and Ctrl-C. */
export async function killAll() {
  for (const instance of [...running]) await instance.kill();
}

/**
 * Anything of this profile's still running, as `{ pid, commandLine }`. The profile's folder is in the
 * command line of every process the app started, and is unique to this run.
 */
export const leftoversOf = (profile) => electronProcessesFor(profile.home);

/** Wait for a profile's processes to be gone (after a kill, children take a moment), ending stragglers by PID. */
export async function reapProfile(profile, { timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let left = leftoversOf(profile);
  while (left.length && Date.now() < deadline) {
    await sleep(300);
    left = leftoversOf(profile);
  }
  for (const straggler of left) killTree(straggler.pid);
  return left;
}
