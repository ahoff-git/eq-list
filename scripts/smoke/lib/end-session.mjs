/**
 * end-session.mjs — driving `end-session.ps1`: Windows' own "the session is ending" message to one process.
 *
 * Two steps, so the caller owns the timing. `prepareSessionEnd(pid)` compiles the helper and finds the
 * process's windows (slow, about a second); `go()` then sends `WM_ENDSESSION` to each and ends the
 * process (fast). The caller makes its changes *between* the two, which keeps the gap from the last
 * change to the end inside the stores' debounce windows — the whole point of the probe.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withTimeout } from "./cdp.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "end-session.ps1");

/** Lines of text arriving on a stream, as an async queue the caller can wait on. */
function lineReader(stream) {
  let buffer = "";
  const lines = [];
  const waiting = [];
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, at).trim());
      buffer = buffer.slice(at + 1);
    }
    while (waiting.length && lines.length) waiting.shift()(lines.shift());
  });
  return () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve) => waiting.push(resolve)));
}

export async function prepareSessionEnd(pid) {
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-ProcessId", String(pid)], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const next = lineReader(child.stdout);
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));

  const ready = await withTimeout(next(), 30_000, "end-session.ps1 to find the windows").catch((error) => {
    child.kill();
    throw new Error(`${error.message}${stderr ? ` — ${stderr.trim().slice(0, 300)}` : ""}`);
  });
  const windows = Number(/^ready (\d+)$/.exec(ready)?.[1]);
  if (!Number.isInteger(windows)) throw new Error(`end-session.ps1 said "${ready}" instead of "ready <n>"${stderr ? ` — ${stderr.trim().slice(0, 300)}` : ""}`);

  return {
    windows,
    /** Send WM_ENDSESSION to every window and end the process. Resolves once the helper has finished. */
    async go() {
      child.stdin.write("go\n");
      await withTimeout(exited, 20_000, "end-session.ps1 to finish");
    },
    /** Let the helper go without sending anything (the fault case, or a run that is being abandoned). */
    abort() {
      child.kill();
    },
  };
}
