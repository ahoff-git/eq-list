/**
 * data-health.ts — reads back what the stores stamped, so the app can say which of them the rules
 * have moved on from.
 *
 * The writing half is one line in `json-store.ts` and one word per store; this is the reading half,
 * and it is deliberately the *only* place that opens a store file it doesn't own. Two properties make
 * that safe, and both are the point rather than caution for its own sake:
 *
 *   - it reads **nothing but the stamp**. Not the fights, not the kills — a report about a thousand
 *     fights must not cost a thousand fights' worth of parsing, and a reader that only wants one
 *     small field has no business deserializing the rest.
 *   - it **never writes**. Every remedy is somebody's decision (`DataRemedy` says whose), so the worst
 *     this module can do is describe the situation wrongly.
 *
 * The concern table itself — what exists, what revision it's at, and what to do — is pure and shared
 * in [data-provenance.ts](../src/shared/data-provenance.ts), because the panel needs the same
 * vocabulary to render it.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { DATA_CONCERNS, dataState, type DataReportRow, type DataStamp } from "../src/shared/data-provenance";

const log = createLogger("data-health");

/**
 * How much of a store's file to read looking for its stamp.
 *
 * `provenance` is a handful of bytes and `combat-history.json` is megabytes, so the whole file is
 * emphatically not worth reading to find it. What makes a windowed read *correct* rather than a gamble
 * is that `writeJson` writes the stamp **first**: `JSON.stringify` emits keys in insertion order, so
 * the stamp is always within the first few hundred bytes. Both halves of that pact are commented and
 * one test pins it — it was got wrong first time round, and the symptom was every large store
 * declaring itself stale for ever.
 *
 * A window rather than a fixed prefix because `pretty` stores indent, and the failure mode is benign
 * anyway: not finding a stamp reads as *no stamp*, which is a state this already handles honestly
 * (see `DataConcern.unstamped`).
 */
const STAMP_WINDOW_BYTES = 64 * 1024;

/** The stamp `file` carries, or undefined for a file with none — or none we could find cheaply. */
function readStamp(file: string): DataStamp | undefined {
  let head: string;
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(STAMP_WINDOW_BYTES);
      const read = fs.readSync(fd, buf, 0, STAMP_WINDOW_BYTES, 0);
      head = buf.subarray(0, read).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined; // no file: the caller reports `absent`, which is not a fault
  }
  // Matched rather than parsed: the window is very likely a *truncated* JSON document, so
  // `JSON.parse` on it would fail for every store big enough to matter.
  const found = /"provenance"\s*:\s*(\{[^}]*\})/.exec(head);
  if (!found) return undefined;
  try {
    const stamp = JSON.parse(found[1]) as DataStamp;
    return typeof stamp.revision === "number" ? stamp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where every body of stored data stands. Read on demand — a store's stamp only changes when the store
 * is written, and nothing here is worth watching for.
 *
 * A concern with no `file` (a dataset built by a script and committed to the repo) has no stamp to
 * read, so it reports against its own `unstamped` default: usually `current`, which is honest — its age
 * is the repo's rather than yours, and what the panel gives you for it is the command, not a verdict.
 */
export function dataReport(userDataDir: string): DataReportRow[] {
  const rows = DATA_CONCERNS.map((concern) => {
    if (!concern.file) return { concern, state: dataState(concern, undefined) };
    // A trailing slash means a directory of files (the wiki mirror), which carries no single stamp;
    // its presence is all this can honestly report.
    const target = path.join(userDataDir, concern.file);
    const present = fs.existsSync(target);
    const stamp = present && !concern.file.endsWith("/") ? readStamp(target) : undefined;
    return { concern, state: dataState(concern, stamp, present), stamp };
  });
  const stale = rows.filter((r) => r.state === "stale").map((r) => r.concern.id);
  const ahead = rows.filter((r) => r.state === "ahead").map((r) => r.concern.id);
  if (stale.length || ahead.length) log.debug("stored data needs attention", { stale, ahead });
  return rows;
}
