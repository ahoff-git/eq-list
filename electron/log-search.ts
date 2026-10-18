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
 */
import fs from "node:fs";
import readline from "node:readline";
import { createLogSearch } from "../src/shared/log-search";
import { createLogger } from "../src/shared/logging";
import type { LogSearchOptions, LogSearchResult } from "../src/shared/types";

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
  let line = 0;
  try {
    const input = fs.createReadStream(file, "utf8");
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const raw of lines) {
      if (latest.get(asker) !== ticket) {
        lines.close();
        input.destroy(); // closing the reader leaves the file open; this lets it go
        return { file, total: 0, hits: [], superseded: true };
      }
      search.feed(raw, ++line);
    }
  } catch (err) {
    // No game installed, a log deleted mid-session — an empty answer, as `readLogTail` gives.
    log.debug("no log to search", { file, err: String(err) });
    return { file, total: 0, hits: [] };
  }
  const result = search.result();
  log.debug("searched", { query, lines: line, total: result.total, ms: Date.now() - started });
  return { file, ...result };
}
