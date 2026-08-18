/**
 * self-check.ts — the looking half of the setup check: one probe per step of the chain in
 * [src/shared/self-check.ts](../src/shared/self-check.ts), which owns the steps, the skip rule and
 * the wording of the verdict.
 *
 * Everything that needs a filesystem, a network or a window lives here, and **nothing here decides
 * anything about presentation** — a probe reports what it found and what it thinks is worth doing,
 * and the runner next door works out which rows are consequences of which.
 *
 * Two rules the probes keep to, both learned from `data-health.ts` next door:
 *
 *   - **Read, never write.** The one exception is deliberate and is itself a check: `data-folder`
 *     writes a probe file precisely because "can this folder be written to?" has no other honest
 *     answer, and it removes it again.
 *   - **Say what was found, on a pass too.** "Following eqlog_Kainos_pq.proj.txt" is the sentence
 *     that solves the case where the app is happily watching a character you aren't playing —
 *     a green row nobody would have thought to ask for.
 *
 * Everything the probes need is injected, so the whole file is testable against a temp folder with
 * no Electron and no network (see `tests/self-check.test.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import { characterFromLogFile, parseLogText } from "../src/shared/log-parser";
import { parseSplitLine } from "../src/shared/parse-line";
import { count } from "../src/shared/format";
import { runChecks, type CheckOutcome, type CheckProbe, type CheckResult } from "../src/shared/self-check";
import { createLogger } from "../src/shared/logging";
import { findMapsDir } from "./eq-maps";
import { readLogTail } from "./log-tail";
import type { Settings, ShoppingList, WatcherStatus } from "../src/shared/types";

const log = createLogger("self-check");

/**
 * How much of the log to look at for the two "can we read it?" steps.
 *
 * Far smaller than the tail a *rule* is tested against (`TAIL_STEPS` starts at 512 KB): those
 * questions are "has this ever happened?", which wants as much log as you can bear, while this one
 * is "is this file the shape we think it is?", which the last few hundred lines settle completely.
 * The button should feel instant, and this is the only step that reads bulk.
 */
const SAMPLE_BYTES = 64 * 1024;

/** Over this and the log looks abandoned rather than live — see the `log-fresh` probe. */
const FRESH_MS = 5 * 60 * 1000;

/** What a probe needs to look at the world. All injected, so none of this needs Electron to test. */
export interface SelfCheckDeps {
  getSettings: () => Settings;
  getList: () => ShoppingList;
  /** What the live watcher says about itself — the one step we can't work out from the disk. */
  watcherStatus: () => WatcherStatus;
  /** The app's own data folder: settings, the list, and everything learned from the log. */
  userDataDir: string;
  /** Is the transparent alert overlay up? A window question, so its owner answers it. */
  alertOverlayUp: () => boolean;
  /** Can we reach the wiki, and how quickly? Injected so a test never touches the network. */
  pingWiki: () => Promise<{ ok: boolean; detail: string }>;
  /** Now, in ms. Injectable so a test can age a file deterministically. */
  now?: () => number;
}

/** Run every check and report each step. See `runChecks` for what a skipped step means. */
export async function selfCheck(deps: SelfCheckDeps): Promise<CheckResult[]> {
  const results = await runChecks(probes(deps));
  const bad = results.filter((r) => r.status === "fail" || r.status === "warn");
  log.debug("setup check", { problems: bad.map((r) => `${r.step.id}: ${r.detail}`) });
  return results;
}

const pass = (detail: string): CheckOutcome => ({ status: "pass", detail });
const warn = (detail: string, fix?: string): CheckOutcome => ({ status: "warn", detail, fix });
const fail = (detail: string, fix?: string): CheckOutcome => ({ status: "fail", detail, fix });

/** One probe per step id. Split out so the table of what's checked reads in one screen. */
function probes(deps: SelfCheckDeps): Record<string, CheckProbe> {
  const now = deps.now ?? Date.now;
  /** The folder as configured, trimmed — every log probe starts from it. */
  const logDir = () => deps.getSettings().logDir.trim();
  /**
   * The file the checks below should be talking about: whatever the watcher actually settled on,
   * or — before it has — the one we'd resolve ourselves. Asking the watcher matters: if it is
   * following a different file than we'd pick, that disagreement is the bug being hunted, and the
   * rows should describe the file the app is really reading.
   */
  const target = () => deps.watcherStatus().file || resolveTarget(logDir(), deps.getSettings().activeLogFile);

  return {
    "log-folder": () => {
      const dir = logDir();
      if (!dir) {
        return fail("No folder is set.", "Settings → EverQuest log folder → Browse…, and pick the Logs folder inside your EverQuest install.");
      }
      if (!isDir(dir)) {
        return fail(`Not a folder we can open: ${dir}`, "Check the path — the default is inside the EverQuest install, under Logs.");
      }
      try {
        fs.readdirSync(dir);
      } catch (err) {
        return fail(`${dir} can't be listed: ${String(err)}`, "Usually a permissions problem — try running the app as the same user that runs EverQuest.");
      }
      return pass(dir);
    },

    "log-files": () => {
      const dir = logDir();
      // A **pinned** file is a log to watch whatever it's called: the watcher follows the path it's
      // given without caring about the name (a renamed log, one copied off another machine), so
      // asking only about `eqlog_*.txt` would report "no log here" over a setup that works — a
      // diagnostic inventing a fault, which is worse than one that stays quiet.
      const pinned = deps.getSettings().activeLogFile.trim();
      if (pinned) {
        const file = resolveTarget(dir, pinned);
        if (file) return pass(`${path.basename(file)} — the file you pinned in Settings.`);
        // Which one is missing is `log-file`'s question. This step only wants to know whether the
        // folder holds anything else to fall back on, so it answers on the folder's own contents.
      }
      const logs = eqLogsIn(dir);
      if (logs.length) return pass(`${count(logs.length, "log")} — ${logs.slice(0, 3).map((f) => path.basename(f)).join(", ")}${logs.length > 3 ? ", …" : ""}`);
      // The folder is real and readable (this step needs `log-folder`), so this is nearly always the
      // one thing the game itself has to be told, and it is per character rather than per account.
      const others = countFiles(dir);
      return fail(
        others ? `No eqlog_*.txt here, though the folder holds ${count(others, "other file")}.` : "The folder is empty.",
        "In game, type /log on. EverQuest writes eqlog_<Character>_<server>.txt from that moment, and the setting is remembered per character.",
      );
    },

    "log-file": () => {
      const pinned = deps.getSettings().activeLogFile.trim();
      const file = target();
      if (pinned && !file) {
        return fail(
          `The file you pinned isn't in the folder: ${pinned}`,
          "Clear “Specific log file” in Settings to follow whichever log was written most recently.",
        );
      }
      if (!file) return fail("Couldn't settle on a log file.", "Clear “Specific log file” in Settings to follow the newest one.");
      const named = path.basename(file);
      return pass(pinned ? `${named} — the file you pinned.` : `${named} — the most recently written, chosen automatically.`);
    },

    watching: () => {
      const status = deps.watcherStatus();
      if (status.error) return fail(status.error, "Fix the folder or file above; the watcher retries on its own once the setting changes.");
      if (!status.watching) return fail("The watcher isn't running.", "Change the log folder in Settings (or restart the app) to start it again.");
      return pass(`Following ${path.basename(status.file ?? "")}, reading each new line as it's written.`);
    },

    "log-fresh": () => {
      const file = target();
      const age = file ? now() - modifiedAt(file) : NaN;
      if (!Number.isFinite(age)) return warn("Couldn't read when the file was last written.");
      if (age <= FRESH_MS) return pass(`Last written ${ago(age)} — the game is logging.`);
      // Not a failure: checking this while you're at the desktop rather than in game is an ordinary
      // thing to do, and the app is working perfectly in that case. The wording carries the "if".
      return warn(
        `Last written ${ago(age)}.`,
        "If you're in game right now, logging is off for this character — type /log on. Otherwise this is just how long ago you last played.",
      );
    },

    "log-lines": () => {
      const file = target();
      const tail = readLogTail(file, SAMPLE_BYTES);
      if (!tail.text.trim()) return warn("The file is empty — nothing has been logged into it yet.", "Type /log on in game, then say something or swing at something.");
      const raw = tail.text.split(/\r?\n/).filter((l) => l.trim()).length;
      const lines = parseLogText(tail.text);
      if (!lines.length) {
        return fail(
          `None of the last ${count(raw, "line")} carries an EverQuest timestamp.`,
          "This doesn't look like an EQ log. Check that the folder is EverQuest's own Logs folder rather than another game's.",
        );
      }
      return pass(`Read ${lines.length} of the last ${count(raw, "line")}.`);
    },

    "log-events": () => {
      const lines = parseLogText(readLogTail(target(), SAMPLE_BYTES).text);
      const events = lines.filter((line) => parseSplitLine(line) !== null).length;
      if (!events) {
        return warn(
          `Nothing in the last ${count(lines.length, "line")} was an event the app models.`,
          "Ordinary if you've only been chatting. Kill something or loot something and check again — if it still says this, the debug log (tray icon → open log) will say what the lines look like.",
        );
      }
      return pass(`${events} of the last ${count(lines.length, "line")} were events we act on — kills, loot, casts, zoning.`);
    },

    character: () => {
      const name = characterFromLogFile(target() ?? undefined);
      if (!name) {
        return warn(
          "Couldn't read a character name from the log's filename.",
          "The app expects EverQuest's own eqlog_<Character>_<server>.txt name — a renamed file still parses, but your kills and records won't be marked as yours.",
        );
      }
      return pass(`${name}, from the log's filename.`);
    },

    "data-folder": () => {
      const probe = path.join(deps.userDataDir, ".self-check");
      try {
        fs.writeFileSync(probe, "ok");
        fs.unlinkSync(probe);
      } catch (err) {
        return fail(
          `${deps.userDataDir} can't be written to: ${String(err)}`,
          "Nothing the app learns will survive a restart until this is writable — check antivirus or folder permissions.",
        );
      }
      return pass(`${deps.userDataDir} — writable.`);
    },

    wiki: async () => {
      const { ok, detail } = await deps.pingWiki();
      if (ok) return pass(detail);
      return warn(
        detail,
        "Search and adding items from the wiki won't work until it's reachable. Watching your log, the meter and your alerts all carry on without it.",
      );
    },

    maps: () => {
      const dir = findMapsDir(logDir());
      if (!dir) {
        return warn(
          "No maps folder found beside your Logs folder.",
          "The map window and travel routes read EverQuest's own map files. Nothing else needs them.",
        );
      }
      return pass(dir);
    },

    alerts: () => {
      const alerts = deps.getSettings().castAlerts;
      // A deliberate "off" still shows amber rather than green, because this panel is read when
      // something *isn't happening*, and "you switched them off" is the most useful sentence it can
      // say. Same argument as the data panel showing every row rather than only the unhappy ones.
      if (!alerts.enabled) return warn("Alerts are switched off, so nothing will pop.", "Alerts tab → enable them.");
      if (!deps.alertOverlayUp()) {
        return fail(
          "The alert overlay window isn't up, so an alert has nowhere to draw.",
          "Restart the app. If it comes back, the debug log (tray icon → open log) will say what failed to open.",
        );
      }
      const live = alerts.watches.filter((w) => w.enabled).length;
      if (!live) return warn("Alerts are on, but no rule is enabled.", "Alerts tab → switch on a rule, or add one.");
      return pass(`On, with ${count(live, "rule")} enabled, drawn on the overlay.`);
    },

    list: () => {
      const entries = deps.getList().entries;
      if (!entries.length) {
        return warn(
          "Your shopping list is empty, so no drop can match it.",
          "Search tab → find an item, quest or recipe and add it. Everything else — the meter, kills, alerts — works without a list.",
        );
      }
      const mobs = entries.filter((e) => e.kind === "mob").length;
      return pass(`${count(entries.length - mobs, "item")} to look for${mobs ? `, and ${count(mobs, "mob")} to hunt` : ""}.`);
    },
  };
}

// ── the small filesystem questions ────────────────────────────────────────────

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Every eqlog_*.txt in a folder, newest first — the same shape the watcher looks for. */
function eqLogsIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^eqlog_.*\.txt$/i.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => modifiedAt(b) - modifiedAt(a));
  } catch {
    return [];
  }
}

/** How many files of any kind — so "no logs here" can say whether the folder is empty or wrong. */
function countFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).length;
  } catch {
    return 0;
  }
}

function modifiedAt(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return NaN;
  }
}

/**
 * The log we'd follow: the pinned one if it's there, else the most recently written.
 *
 * Deliberately the same rule as `log-watcher.ts`'s own `resolveTarget`, and deliberately not shared
 * with it — this one is only ever reached **before** the watcher has an answer of its own, and
 * copying nine lines is cheaper than exporting a private decision from the watcher and having two
 * callers who can disagree about what it means.
 */
function resolveTarget(dir: string, pinned: string): string | undefined {
  if (pinned) {
    const p = path.isAbsolute(pinned) ? pinned : path.join(dir, pinned);
    return fs.existsSync(p) ? p : undefined;
  }
  return eqLogsIn(dir)[0];
}

/** A rough age in words — "just now", "4 minutes ago", "3 hours ago", "2 days ago". */
function ago(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 30) return "just now";
  if (sec < 90) return "about a minute ago";
  const min = Math.round(sec / 60);
  if (min < 60) return `${count(min, "minute")} ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${count(hours, "hour")} ago`;
  return `${count(Math.round(hours / 24), "day")} ago`;
}
