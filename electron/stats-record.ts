/**
 * stats-record.ts — the kept record of your stats read, on disk (`stats-record.json` in userData).
 *
 * What a stats read said (`src/shared/items/stats-record.ts`) lives here, in the main process, for the reasons
 * the other durable records do: a renderer's `localStorage` belongs to an *origin* (`app://local` packaged,
 * `http://localhost:3000` in development), so a record kept there is one build's and not the player's — and the
 * peer share (`shareSources`) is built in this process, so the record has to be here to be offered. The loadout
 * builder writes it when a read is applied or answered; the page asks for it at launch, so figures awaiting a
 * yes survive a restart, and the peer room can be offered the figures the game showed.
 *
 * It only holds the record. What a record may be is `readStatsRecord`'s call, on the way in from the disk and
 * from the renderer alike.
 */
import path from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import { readStatsRecord, shareableStats, type StatsRecord } from "../src/shared/items/stats-record";
import { createSaver, readJson } from "./json-store";

const log = createLogger("stats-record");

const WRITE_DEBOUNCE_MS = 1_000;

export interface StatsRecordStore {
  /** The record held, or null before any read. */
  get(): StatsRecord | null;
  /** Keep this record (checked first — a renderer is not trusted to send a well-formed one). Null forgets it. */
  set(record: unknown): StatsRecord | null;
  /** What the peer room is offered: the record without the figures still awaiting a yes — one row, or none. */
  shareRows(): unknown[];
  /** Write now — for quitting. */
  flush(): void;
  /** Fires when the record actually changed. */
  onChange(cb: (record: StatsRecord | null) => void): void;
}

export function createStatsRecord(userDataDir: string): StatsRecordStore {
  const file = path.join(userDataDir, "stats-record.json");
  const bus = new EventEmitter();
  let record: StatsRecord | null = readStatsRecord(readJson<unknown>(file, null));
  const saver = createSaver(file, "stats record", () => record, WRITE_DEBOUNCE_MS);

  return {
    get: () => record,
    set(next) {
      const checked = next === null ? null : readStatsRecord(next);
      // A bad record from the renderer is refused, not turned into "forget": only an explicit null forgets.
      if (next !== null && !checked) return record;
      if (JSON.stringify(checked) === JSON.stringify(record)) return record;
      record = checked;
      log.debug("stats record", record);
      saver.save();
      bus.emit("change", record);
      return record;
    },
    shareRows: () => (record ? [shareableStats(record)] : []),
    flush: () => saver.flush(),
    onChange: (cb) => void bus.on("change", cb),
  };
}
