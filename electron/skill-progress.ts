/**
 * skill-progress.ts — your tradeskills, read from your log: current values and your own rate.
 *
 * The live watcher only reads what's new (a never-seen log is pinned at its end, ADR 0030), and a
 * skill is *state*, not news: Blacksmithing 60 from three weeks ago is still your Blacksmithing. So
 * the active log's history is read once for the two line types this needs — in the background, a
 * chunk per turn of the event loop — and kept up from there.
 *
 * **Each line is read once, by byte position.** A skill-up and the combine that earned it usually
 * share a second, so a timestamp can't tell a repeat from a neighbour. What's stored is exactly "this
 * file, read up to byte N"; the next start reads on from N. Live events go into a working copy on top
 * of it, and only those newer than the scan's last line — which the next start's scan will read for
 * real, from N, so the stored copy never counts one twice.
 *
 * The reading is `skill-progress.ts`'s in `src/shared` (pure, tested); this file only feeds it lines.
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import { characterFromLogFile, parseCombine, parseSkillUp, splitLine } from "../src/shared/log-parser";
import {
  LOG_TRADESKILLS,
  emptyProgress,
  noteEvent,
  type SkillProgress,
  type SkillProgressView,
} from "../src/shared/tradeskills/skill-progress";
import { emptyCraftingLog, noteCraft, summarizeCrafting, type CraftingLog } from "../src/shared/tradeskills/crafting-log";
import type { CombineEvent, SkillUpEvent } from "../src/shared/types";
import { readJson, writeJson } from "./json-store";

const log = createLogger("skill-progress");

/** How much of a log one turn of the event loop reads. */
const CHUNK_BYTES = 4 * 1024 * 1024;

/** One log file, read up to `scannedTo`. */
interface FileScan {
  scannedTo: number;
  /** The last line's timestamp the scan took in — live events at or before it were scanned. */
  through: string;
  progress: SkillProgress;
  /** Every combine, for the crafting log (`crafting-log.ts`). Missing on a scan stored before the log
   *  existed — which is read again from the top, so the log has the whole history too. */
  crafting?: CraftingLog;
}

export interface SkillProgressTracker {
  /** The active character's progress. */
  view(): SkillProgressView;
  /** The watcher moved to this log (or none): read its history, then follow it. */
  setFile(file: string | undefined): void;
  /** A skill-up or combine the live watcher read. */
  note(e: SkillUpEvent | CombineEvent): void;
  onChange(cb: (view: SkillProgressView) => void): void;
}

/** The only lines this reads — checked before a line is split, since a log is mostly combat. */
const MAY_MATTER = /better at|fashion/;

export function createSkillProgress(userDataDir: string): SkillProgressTracker {
  const storeFile = path.join(userDataDir, "skill-progress.json");
  const stored: Record<string, FileScan> = readJson(storeFile, {});
  const bus = new EventEmitter();
  let file: string | undefined;
  let live: SkillProgress = emptyProgress();
  let liveCrafting: CraftingLog = emptyCraftingLog();
  let scanning = false;
  /** Events the watcher read while the scan was still running, replayed once it ends. */
  let queued: (SkillUpEvent | CombineEvent)[] = [];
  /** Bumped per `setFile`, so a scan of a log we've since moved off stops quietly. */
  let generation = 0;

  const key = (f: string) => path.resolve(f).toLowerCase();
  const clone = <T>(p: T): T => JSON.parse(JSON.stringify(p));

  function view(): SkillProgressView {
    const skills = Object.fromEntries(Object.entries(live.skills).filter(([s]) => LOG_TRADESKILLS.has(s)));
    return { character: characterFromLogFile(file) ?? "", skills, rates: live.rates, scanning, crafting: summarizeCrafting(liveCrafting) };
  }
  const changed = () => bus.emit("change", view());

  async function scan(target: string, gen: number): Promise<void> {
    const k = key(target);
    let entry = stored[k];
    let size: number;
    try {
      size = fs.statSync(target).size;
    } catch {
      return;
    }
    // Shorter than we read it means it was rotated or rewritten: start over.
    if (!entry || size < entry.scannedTo || !entry.crafting) {
      entry = { scannedTo: 0, through: "", progress: emptyProgress(), crafting: emptyCraftingLog() };
    }
    const crafting = entry.crafting ?? emptyCraftingLog();
    let pos = entry.scannedTo;
    let carry = "";
    let lines = 0;
    const fd = await fs.promises.open(target, "r");
    try {
      while (pos < size) {
        if (gen !== generation) return; // moved to another log mid-read
        const len = Math.min(CHUNK_BYTES, size - pos);
        const buf = Buffer.alloc(len);
        const { bytesRead } = await fd.read(buf, 0, len, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const parts = (carry + buf.toString("latin1", 0, bytesRead)).split(/\r?\n/);
        carry = parts.pop() ?? "";
        for (const raw of parts) {
          if (!MAY_MATTER.test(raw)) continue;
          const line = splitLine(raw, 0);
          const e = line && (parseSkillUp(line) ?? parseCombine(line));
          if (!e) continue;
          noteCraft(crafting, e, entry.progress.skills); // before `noteEvent`: it wants the skills as they were
          noteEvent(entry.progress, e);
          entry.through = e.at;
          lines++;
        }
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      await fd.close();
    }
    // A trailing partial line is left for next time: it ends at `pos - carry` bytes.
    entry.scannedTo = pos - Buffer.byteLength(carry, "latin1");
    stored[k] = entry;
    writeJson(storeFile, stored, { what: "skill progress" });
    log.debug("scanned", { file: target, lines, to: entry.scannedTo });
    if (gen !== generation) return;
    live = clone(entry.progress);
    liveCrafting = clone(crafting);
    scanning = false;
    const waiting = queued;
    queued = [];
    for (const e of waiting) apply(e);
    changed();
  }

  function apply(e: SkillUpEvent | CombineEvent): boolean {
    const through = file ? stored[key(file)]?.through : undefined;
    if (through && e.at <= through) return false;
    const records = liveCrafting.records.length;
    noteCraft(liveCrafting, e, live.skills);
    // A combine changes nothing about your skill, but it is a new line in the crafting log.
    return noteEvent(live, e) || liveCrafting.records.length !== records;
  }

  return {
    view,
    setFile(next) {
      if (next && file && key(next) === key(file)) return;
      file = next;
      generation++;
      queued = [];
      live = next && stored[key(next)] ? clone(stored[key(next)].progress) : emptyProgress();
      liveCrafting = next && stored[key(next)]?.crafting ? clone(stored[key(next)].crafting!) : emptyCraftingLog();
      scanning = !!next;
      changed();
      if (!next) return;
      const gen = generation;
      void scan(next, gen).catch((e) => {
        log.warn("couldn't read the log's skill history", (e as Error).message);
        if (gen === generation) {
          scanning = false;
          changed();
        }
      });
    },
    note(e) {
      if (scanning) {
        queued.push(e);
        return;
      }
      if (apply(e)) changed();
    },
    onChange: (cb) => void bus.on("change", cb),
  };
}
