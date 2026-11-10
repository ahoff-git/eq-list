/**
 * processes.mjs — asking Windows about processes, and ending exactly the ones the suite started.
 *
 * Two rules, both learned the hard way. **Never end a process by matching a flag in its command
 * line** (`remote-debugging-port` and the like): the shell running this very command carries that text
 * too, and a sweep once killed the tool's own shell. Every kill here is by an exact PID the suite was
 * handed when it launched the thing. And **nothing under `node_modules\electron\` is ours by default**
 * — the player may be running their own dev instance of this repo — so "is anything of mine left?" is
 * answered by the scratch folder a process was started with, which only this run's processes carry.
 *
 * Windows-only (PowerShell and CIM). Elsewhere the queries answer "nothing", and the checks that need
 * more than that say so rather than pretending.
 */
import { spawnSync } from "node:child_process";

export const onWindows = process.platform === "win32";

function powershell(script) {
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  return run.stdout.trim();
}

function asArray(json) {
  if (!json) return [];
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Every `electron.exe` process: `{ pid, commandLine }`. */
export function electronProcesses() {
  if (!onWindows) return [];
  const json = powershell(
    "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | " +
      "ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; commandLine = [string]$_.CommandLine } })",
  );
  return asArray(json);
}

/**
 * The `electron.exe` processes whose command line mentions `marker` — a path unique to this run's
 * scratch folder. Chromium passes `--user-data-dir` to every child it starts, so the browser, renderer
 * and GPU processes all carry it.
 */
export const electronProcessesFor = (marker) => electronProcesses().filter((p) => p.commandLine.includes(marker));

/** `{ pid, commandLine }` of whatever is listening on `port`, or `null`. */
export function listenerOf(port) {
  if (!onWindows) return null;
  const json = powershell(
    `$c = Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      "if ($c) { $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$($c.OwningProcess)\"; " +
      "ConvertTo-Json -Compress -InputObject @([pscustomobject]@{ pid = [int]$c.OwningProcess; commandLine = [string]$p.CommandLine }) }",
  );
  return asArray(json)[0] ?? null;
}

/** End one process and everything it started. `taskkill /T` follows the tree, so no child lingers. */
export function killTree(pid) {
  if (!onWindows) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    return;
  }
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
}

/** Whether a process with this PID is still running. */
export function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
