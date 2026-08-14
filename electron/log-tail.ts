/**
 * log-tail.ts — the last stretch of the log file, read on demand, as far back as you ask.
 *
 * This is what a rule is tested against (`dryRun` in `watch-check.ts`), and it reads **the file**
 * rather than remembering what went past. The first attempt kept a ring of lines the watcher had
 * emitted since launch, which was wrong in the way that matters: the buffer is empty until you play,
 * so the check answered "nothing logged yet" to somebody sitting down to write a rule about last
 * night — which reads as "your rule matches nothing" and is the opposite of the truth
 * ([ADR 0089](../specs/decisions/0089-a-rule-is-checked-against-the-log-file.md)).
 *
 * **How far back is the caller's choice** (`TAIL_STEPS`). The default is a slice big enough to
 * recognise what you did this evening and small enough to be instant; a rule about something rarer —
 * a named, a raid call, a fade you see twice a week — needs more log, and asking for it is one
 * button. The same widening the watcher does to find a zone line, for the same reason: the right
 * window depends on what you're looking for, and only the reader knows.
 *
 * It hands back **text**, not parsed lines. At the deep end that's tens of thousands of lines, and a
 * structured-clone of that many small objects across the IPC boundary costs far more than the string
 * they came from — while `splitLine` on the far side is the same work the replay was going to do
 * anyway. So: read bytes here, parse where they're used.
 */
import fs from "node:fs";
import { TAIL_STEPS } from "../src/shared/constants";
import { createLogger } from "../src/shared/logging";
import type { LogTail } from "../src/shared/types";

const log = createLogger("log-tail");

const NOTHING: LogTail = { text: "", bytes: 0, whole: true };

/**
 * The last `bytes` of `file`, ending at a line boundary.
 *
 * A file we can't read is an empty answer rather than an error: no game installed, no folder set
 * yet, a log deleted mid-session — all ordinary states, and the caller says which in its own words.
 */
export function readLogTail(file: string | undefined, bytes: number = TAIL_STEPS[0]): LogTail {
  if (!file) return NOTHING;
  const want = Math.max(0, bytes);
  try {
    const size = fs.statSync(file).size;
    if (!size) return NOTHING;
    const from = Math.max(0, size - want);
    const fd = fs.openSync(file, "r");
    let text: string;
    try {
      const buffer = Buffer.alloc(Math.min(want, size));
      const read = fs.readSync(fd, buffer, 0, buffer.length, from);
      // Decode only what was actually read: a short read must not turn its zero-filled tail into NULs.
      text = buffer.subarray(0, read).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    // Starting mid-file almost certainly starts mid-line, and half a sentence would be matched as if
    // it were the whole one. Dropped unless we began at the very start, where the first line is whole.
    const body = from === 0 ? text : text.slice(text.indexOf("\n") + 1);
    return { text: body, bytes: body.length, whole: from === 0 };
  } catch (err) {
    log.debug("no log to read", { file, err: String(err) });
    return NOTHING;
  }
}
