/**
 * replay-log.mjs — simulate an EverQuest log for testing without playing.
 *
 * Streams lines from a source log into a target eqlog_*.txt one at a time,
 * restamping each with the current time so they look live. Point the app's Log
 * folder (Settings → Browse) at the target directory and the watcher will follow
 * the file exactly as if the game were writing it — loot lines light up the list.
 *
 * Usage:
 *   npm run sim                       # replay fixtures/sample-eqlog.txt
 *   npm run sim -- --loop             # loop forever
 *   npm run sim -- --loot-only        # only lines that look like loot
 *   npm run sim -- --interval 500     # ms between lines (default 1500)
 *   npm run sim -- --jitter 400       # add up to N ms of random delay
 *   npm run sim -- --from "C:\\path\\eqlog_You_server.txt"   # replay a real log
 *   npm run sim -- --to "C:\\path\\to\\Logs"                 # target dir or .txt file
 *   npm run sim -- --keep-timestamps  # don't restamp lines
 *   npm run sim -- --relative         # restamp, but keep the original gaps between lines
 *   npm run sim -- --append           # append instead of starting fresh
 *
 * **Replaying anything the app measures in *time* wants `--relative`.** The default stamps every
 * line with the moment it is written, so a log whose lines are minutes apart arrives with all of
 * them inside the same second. That is fine for loot — an item dropped is an item dropped — and
 * silently wrong for everything that reads a *duration*: a spawn timer learns from the gap between
 * two kills, so a default replay taught it nothing and the feature simply looked broken. Fight
 * lengths, the loot-to-corpse window and a position fix's age are all measured the same way.
 *
 * `--relative` keeps each line's offset from the one before and anchors the run so it *ends* now.
 * The app reads the stamp on the line rather than the clock it was written at, so the gaps can be
 * hours while the file is written in seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, flag, helpIfAsked, opt } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

const from = String(opt("from", path.join(ROOT, "fixtures", "sample-eqlog.txt")));
const toRaw = String(opt("to", path.join(ROOT, "replay-logs")));
const interval = Number(opt("interval", 1500));
const jitter = Number(opt("jitter", 0));
const loop = flag("loop");
const lootOnly = flag("loot-only");
const keepTs = flag("keep-timestamps");
const relative = flag("relative");
const append = flag("append");

// A .txt path is used as-is; anything else is treated as a directory.
const target = toRaw.toLowerCase().endsWith(".txt") ? toRaw : path.join(toRaw, "eqlog_Replay_test.txt");

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

/** EQ's timestamp format, e.g. "[Mon Jul  7 19:02:11 2026]" (space-padded day). */
function eqStamp(d = new Date()) {
  const day = String(d.getDate()).padStart(2, " ");
  return `[${DOW[d.getDay()]} ${MON[d.getMonth()]} ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}]`;
}
const stripStamp = (line) => line.replace(/^\[[^\]]*\]\s?/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MONTH_NO = Object.fromEntries(MON.map((m, i) => [m, i]));
const STAMP_RE = /^\[\w{3} (\w{3}) ([ \d]?\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})\]/;

/** The moment a source line claims, or null when it carries no readable stamp. */
function sourceTime(line) {
  const m = line.match(STAMP_RE);
  if (!m) return null;
  const month = MONTH_NO[m[1]];
  if (month === undefined) return null;
  return new Date(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).getTime();
}

/**
 * The stamp each line should carry when the source's own spacing is being kept.
 *
 * Anchored so the **last** line lands now: replaying an evening should leave the app looking like
 * you have just finished playing it, not like you are about to start — and it keeps every line in
 * the past, which is where a log's lines are. A line the source didn't stamp inherits the one
 * before it, since a continuation belongs to the moment its own line did.
 */
function relativeTimes(lines) {
  const times = lines.map(sourceTime);
  const known = times.filter((t) => t !== null);
  if (!known.length) return lines.map(() => Date.now());
  const offset = Date.now() - known[known.length - 1];
  let previous = known[0];
  return times.map((t) => {
    if (t !== null) previous = t;
    return previous + offset;
  });
}

function loadLines() {
  const all = fs.readFileSync(from, "utf8").split(/\r?\n/).filter((l) => l.trim().length);
  return lootOnly ? all.filter((l) => /looted/i.test(l)) : all;
}

let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
  console.log("\n[replay] stopped.");
  process.exit(0);
});

async function main() {
  const lines = loadLines();
  if (!lines.length) {
    console.error(`[replay] no lines to replay from ${from}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!append) fs.writeFileSync(target, "");

  console.log(`[replay] from : ${from}`);
  console.log(`[replay] to   : ${target}`);
  console.log(`[replay] Point the app's Log folder at:  ${path.dirname(target)}`);
  const stamping = keepTs ? "original stamps" : relative ? "restamped, gaps kept" : "restamped to now";
  console.log(
    `[replay] ${lines.length} lines · ${interval}ms${jitter ? ` +${jitter}ms jitter` : ""}${loop ? " · looping" : ""} · ${stamping}`,
  );
  // Said out loud rather than left to be discovered: a replay that collapses every gap teaches
  // anything time-based nothing at all, and the symptom is a feature that looks broken rather than
  // an error anyone could search for.
  console.log(
    !keepTs && !relative
      ? "[replay] note: every line is stamped 'now' — pass --relative to keep the gaps between them\n"
      : "",
  );

  do {
    // Recomputed per pass, so a looping replay keeps landing "just now" rather than drifting one
    // whole run further into the past each time round.
    const stamps = relative ? relativeTimes(lines) : null;
    for (const [i, line] of lines.entries()) {
      if (stopped) return;
      const out = keepTs ? line : `${eqStamp(stamps ? new Date(stamps[i]) : new Date())} ${stripStamp(line)}`;
      fs.appendFileSync(target, `${out}\n`);
      console.log("→", out);
      await sleep(interval + (jitter ? Math.floor(Math.random() * jitter) : 0));
    }
  } while (loop && !stopped);

  console.log("\n[replay] done.");
}

main().catch((e) => {
  console.error("[replay] error:", e.message);
  process.exit(1);
});
