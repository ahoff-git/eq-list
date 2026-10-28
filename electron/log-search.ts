/**
 * log-search.ts — run a log search (`src/shared/log-search.ts`) over the whole watched file.
 *
 * Streamed, not read whole: a real log is 70MB and growing, and `readline` over a stream yields to
 * the event loop between chunks, so the app keeps tailing and answering while a search runs.
 *
 * **Only the newest search runs to the end.** A search box asks again on every pause in typing, and
 * a scan of the whole file that nobody will read is wasted work, so each call takes a ticket and a
 * scan that sees a newer ticket stops where it is and says so (`superseded`). Tickets are per
 * `asker` (a window), so one window's search never cuts short another's.
 *
 * `readLogLines` reads a run of the same file by line number — a hit opened in context. It streams
 * from the top too (a line number is all a hit carries, and a log has no index of them), but stops
 * at the last line it wants.
 */
import fs from "node:fs";
import readline from "node:readline";
import { createLogSearch, createLogWindow } from "../src/shared/log-search";
import { createLogger } from "../src/shared/logging";
import type { LogLines, LogSearchOptions, LogSearchResult } from "../src/shared/types";

const log = createLogger("log-search");

/** The newest ticket each asker has taken. */
const latest = new Map<string | number, number>();
let tickets = 0;

export async function searchLogFile(
  file: string | undefined,
  query: string,
  options: LogSearchOptions = {},
  asker: string | number = "",
): Promise<LogSearchResult> {
  const ticket = ++tickets;
  latest.set(asker, ticket);
  if (!file) return { total: 0, hits: [] };
  const search = createLogSearch(query, options);
  const started = Date.now();
  let superseded = false;
  const lines = await eachLine(file, (raw, line) => {
    if (latest.get(asker) !== ticket) {
      superseded = true;
      return false;
    }
    search.feed(raw, line);
    return true;
  });
  if (superseded) return { file, total: 0, hits: [], superseded: true };
  // No game installed, a log deleted mid-session — an empty answer, as `readLogTail` gives.
  if (lines === undefined) return { file, total: 0, hits: [] };
  const result = search.result();
  log.debug("searched", { query, lines, total: result.total, ms: Date.now() - started });
  return { file, ...result };
}

/** Lines `from`..`to` of `file`, oldest first (`createLogWindow`); an unreadable file is no lines. */
export async function readLogLines(file: string | undefined, from: number, to: number): Promise<LogLines> {
  if (!file) return { lines: [], end: true };
  const span = createLogWindow(from, to);
  const read = await eachLine(file, (raw, line) => {
    span.feed(raw, line);
    return !span.full(line);
  });
  if (read === undefined) return { file, lines: [], end: true };
  return { file, ...span.result() };
}

/**
 * Stream `file` a line at a time to `visit` (1-based numbers) until it returns false or the file
 * ends. Returns how many lines it read, or undefined when the file couldn't be read.
 */
async function eachLine(file: string, visit: (raw: string, line: number) => boolean): Promise<number | undefined> {
  let line = 0;
  const input = fs.createReadStream(file, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const raw of lines) {
      if (!visit(raw, ++line)) break;
    }
    return line;
  } catch (err) {
    log.debug("no log to read", { file, err: String(err) });
    return undefined;
  } finally {
    lines.close();
    input.destroy(); // closing the reader leaves the file open; this lets it go
  }
}
