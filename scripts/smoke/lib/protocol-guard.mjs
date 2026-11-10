/**
 * protocol-guard.mjs — leaving the player's `eqlist://` link handler as the run found it.
 *
 * The app calls `app.setAsDefaultProtocolClient("eqlist")` at startup. For the player's installed copy that
 * is right; for an *unpackaged* instance, which is what every smoke launch is, it quietly **replaces** the
 * registered handler (`HKCU\Software\Classes\eqlist`) with `node_modules\electron\dist\electron.exe "%1"`,
 * and an `eqlist://` link in a browser then starts a bare Electron with no app. It survives the run, so a
 * suite that launches the app has to put the key back — and does, whatever the run's outcome.
 *
 * Windows-only; elsewhere there is nothing registered this way and every call is a no-op.
 */
import { spawnSync } from "node:child_process";

const KEY = "Software\\Classes\\eqlist";
const COMMAND_KEY = `${KEY}\\shell\\open\\command`;

function powershell(script) {
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  return run.status === 0 ? run.stdout.trim() : undefined;
}

/** What to do given the handler `before` the run and `after` it: nothing, put the old command back, or remove what the run created. */
export function planRestore(before, after) {
  if (before === after) return "unchanged";
  return before === null ? "remove" : "restore";
}

/** The registered command (`"…\EQ List.exe" "%1"`), or `null` when no handler is registered, or `undefined` off Windows. */
export function readProtocolCommand() {
  if (process.platform !== "win32") return undefined;
  const out = powershell(
    `$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('${COMMAND_KEY}'); if ($k) { $k.GetValue('') } else { '<none>' }`,
  );
  if (out === undefined) return undefined;
  return out === "<none>" ? null : out;
}

/** Put the handler back as it was before the run. Returns what it did: "unchanged", "restored" or "removed". */
export function restoreProtocolCommand(before) {
  if (before === undefined) return "unchanged";
  const plan = planRestore(before, readProtocolCommand());
  if (plan === "restore") {
    const value = before.replace(/'/g, "''");
    powershell(`Set-ItemProperty -LiteralPath 'HKCU:\\${COMMAND_KEY}' -Name '(default)' -Value '${value}'`);
  } else if (plan === "remove") {
    powershell(`Remove-Item -LiteralPath 'HKCU:\\${KEY}' -Recurse -Force`);
  }
  return plan === "restore" ? "restored" : plan === "remove" ? "removed" : "unchanged";
}
