/**
 * faction-dump.ts — the followed character's `/outputfile faction` dump, as faction corrections.
 *
 * The game's own number for every faction is exactly what a typed correction asks the player for
 * (`faction-corrections.ts`), so a dump is read as one — stated at the moment the file was written,
 * offset against what the ledger had seen *by then*, so hits logged since keep counting on top. See
 * `factionDumpCorrections` in `src/shared/faction/faction-correction.ts`.
 *
 * Read on demand rather than stored: the game keeps the file, and a newer dump simply replaces it.
 */
import { createLogger } from "../src/shared/logging";
import { logStamp } from "../src/shared/log-clock";
import { parseFactionDump } from "../src/shared/game-export-dumps";
import { factionDumpCorrections } from "../src/shared/faction/faction-correction";
import type { FactionCorrection, FactionStanding } from "../src/shared/types";
import { readExport } from "./game-exports";

const log = createLogger("faction-dump");

/** What `faction-log.ts` offers that this needs: total net, and net from an instant on. */
export interface FactionLedgerView {
  standings(): FactionStanding[];
  standingsSince(sinceIso: string): FactionStanding[];
}

/** Corrections from the newest faction dump for `logFile`'s character, or none when there isn't one. */
export function readFactionDumpCorrections(logFile: string | undefined, ledger: FactionLedgerView): Record<string, FactionCorrection> {
  const dump = readExport(logFile, "faction");
  if (!dump) return {};
  const rows = parseFactionDump(dump.text);
  // The ledger stamps hits in the log's local time, so "since the dump" has to be asked that way.
  const since = new Map(ledger.standingsSince(logStamp(dump.writtenAt)).map((s) => [s.faction, s.net]));
  const total = new Map(ledger.standings().map((s) => [s.faction, s.net]));
  log.debug("faction dump read", { file: dump.fileName, factions: rows.length });
  return factionDumpCorrections(rows, new Date(dump.writtenAt).toISOString(), (f) => (total.get(f) ?? 0) - (since.get(f) ?? 0));
}
