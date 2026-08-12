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
 *   npm run sim -- --append           # append instead of starting fresh
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
  console.log(`[replay] ${lines.length} lines · ${interval}ms${jitter ? ` +${jitter}ms jitter` : ""}${loop ? " · looping" : ""}\n`);

  do {
    for (const line of lines) {
      if (stopped) return;
      const out = keepTs ? line : `${eqStamp()} ${stripStamp(line)}`;
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
