/**
 * renderer.mjs — the Next dev server the isolated app loads its windows from.
 *
 * The suite reuses a dev server that is already serving *this* renderer (the player's own
 * `npm run dev`, say) and leaves it running; otherwise it starts one and stops it afterwards. "Serving
 * this renderer" is a check on the page's title, not on the port answering: a stale server from an
 * earlier session still answers, with 404s, and pointing a window at one is an invisible window.
 *
 * A caution that belongs here: never run `npm run build:next` while a dev server is up. The build
 * replaces the chunks the server hands out, and every window then renders unstyled and unhydrated.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { ROOT } from "../../lib/cli.mjs";
import { sleep, until } from "./cdp.mjs";
import { log } from "./log.mjs";
import { killTree, listenerOf } from "./processes.mjs";

const DEFAULT_PORT = 3123;
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

/** What `src/app/layout.tsx` puts in the title; the same mark `dev-electron.mjs` uses to know it is talking to our renderer. */
const RENDERER_MARK = "<title>EQ List</title>";

/** The routes the app opens windows on. Compiled once up front so the first launch is not the slow one. */
const ROUTES = ["", "alert/", "map/"];

/** Compiling a route for the first time can take a minute on a cold `.next`. */
const COMPILE_TIMEOUT_MS = 150_000;

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "localhost", port });
    socket.setTimeout(800);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

async function servesOurRenderer(origin, timeoutMs) {
  try {
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(timeoutMs) });
    return (await response.text()).includes(RENDERER_MARK);
  } catch {
    return false;
  }
}

async function firstFreePort(from) {
  for (let port = from; port < from + 20; port++) if (!(await isListening(port))) return port;
  throw new Error(`no free port in ${from}-${from + 19} for the dev server`);
}

/**
 * Make sure a renderer is being served; returns `{ url, started, stop }`. `stop()` ends only a server
 * this call started.
 */
export async function ensureRenderer({ url, logFile }) {
  if (url) {
    if (!(await servesOurRenderer(url, 20_000))) throw new Error(`${url} is not serving the EQ List renderer`);
    return { url, started: false, stop: async () => {} };
  }

  let port = DEFAULT_PORT;
  if (await isListening(port)) {
    const origin = `http://localhost:${port}`;
    if (await servesOurRenderer(origin, COMPILE_TIMEOUT_MS)) {
      log.debug("reusing the dev server already on", port);
      return { url: origin, started: false, stop: async () => {} };
    }
    port = await firstFreePort(port + 1); // something else owns the usual port: go round it
  }

  const origin = `http://localhost:${port}`;
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", out, out],
  });
  fs.closeSync(out);
  let exited = false;
  child.once("exit", () => (exited = true));
  log.debug("started the dev server", { port, pid: child.pid });

  const stop = async () => {
    killTree(child.pid);
    // `next dev` starts its server as a child, which can outlive the launcher on Windows. Anything
    // still listening on our port is stopped only if it is demonstrably this repo's own server.
    await sleep(500);
    const holder = listenerOf(port);
    if (holder && holder.commandLine.includes("start-server.js") && holder.commandLine.includes(ROOT)) killTree(holder.pid);
  };

  try {
    await until(() => isListening(port), {
      timeoutMs: 60_000,
      label: `the dev server to listen on ${port}`,
      giveUp: () => (exited ? `it exited first — see ${logFile}` : undefined),
    });
    for (const route of ROUTES) {
      const page = await fetch(`${origin}/${route}`, { signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS) });
      if (route === "" && !(await page.text()).includes(RENDERER_MARK)) throw new Error(`${origin} is not serving the EQ List renderer — see ${logFile}`);
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return { url: origin, started: true, stop };
}
