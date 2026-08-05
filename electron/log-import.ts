/**
 * log-import.ts — "eat" a log file: digest a whole EverQuest log into the kill log (which
 * feeds mob knowledge — observed drop rates and roam areas) **and into combat history**, without
 * ever tailing it live.
 *
 * It replays the file through the same pure parser the watcher uses and drives the kill log
 * with the same kill / loot / loc / zone sequence `main.ts` feeds from live events. All the
 * kill-log time math keys off the log's own timestamps (fix age, the loot-to-corpse window),
 * so a fast replay lands the same results as watching the log in real time.
 *
 * Fights go through a **tracker of its own**, not the live one: an old evening's damage belongs
 * in history, and folding it into "this session" would be a lie. That tracker files fights the
 * same way the live path does — `onFightEnd` → history — under the sitting the log says they
 * happened in ([ADR 0054](../specs/decisions/0054-a-sitting-is-a-login.md)), so an eaten log
 * fills the History tab with the same evenings you'd have seen had the app been running.
 */
import fs from "node:fs";
import { parseLine, type ParsedEvent } from "../src/shared/parse-line";
import { characterFromLogFile } from "../src/shared/log-parser";
import { createCombatStats } from "./combat-stats";
import { loginSession } from "./combat-history";
import type { CombatHistory } from "./combat-history";
import type { KillLog } from "./kill-log";
import type { LootLog } from "./loot-log";
import type { CombatEvent } from "../src/shared/types";

export interface LogImportResult {
  /** Lines read from the file. */
  lines: number;
  /**
   * Kills **newly** recorded (your own and, as spawn evidence, others' in earshot). Lines already
   * known — because the log was eaten before, or watched live — are deduped and not counted, so
   * re-eating a log reports 0.
   */
  kills: number;
  /** Drops **newly** attributed to a corpse (already-folded loot lines are deduped, not counted). */
  drops: number;
  /** Coin **newly** attributed to a corpse, in copper (deduped the same way). */
  coin: number;
  /** Fights **newly** filed into history (a fight already stored — watched live, or eaten before — doesn't count). */
  fights: number;
  /** Play sittings the log's login lines marked out. */
  sessions: number;
  /** Drops **newly** added to the loot feed (and so to the prices derived from it). */
  loot: number;
}

/** The combat kinds the tracker takes — the same set the watcher feeds it live. */
const COMBAT_KINDS = new Set([
  "damage",
  "miss",
  "heal",
  "cast",
  "spell-outcome",
  "death",
  "buff-faded",
  "stance",
  "invocation",
]);

const isCombat = (event: ParsedEvent): event is CombatEvent => COMBAT_KINDS.has(event.kind);

/**
 * Digest `file` into every store that can take it — the kill log, and whichever of `history` and
 * `lootLog` the caller hands over. It's a **catch-up**: the aim is that eating a log leaves the
 * app in the state it would have reached had it been running, so anything the log can teach
 * should land.
 *
 * What deliberately doesn't (ADR 0055): the **live meter** (an old evening isn't this session),
 * **experience and health** (they describe the character *now*, and an old log describes a weaker,
 * earlier one — `xp-progress` and `hp-estimate` would be rewound by it), and the **shopping list**
 * (its counts are a to-do the player curates, not a record; crediting a fortnight-old drop against
 * what you still need would silently mark items you long since handed in).
 *
 * The caller sets the kill log's player to this log's character first (so your own kills, and your
 * pet's death, are told apart correctly); the fight tracker takes the same name from the filename.
 */
export function importLog(
  file: string,
  killLog: KillLog,
  history?: CombatHistory,
  lootLog?: LootLog,
): LogImportResult {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let zone: string | null = null;
  let logId = 0;
  let kills = 0;
  let drops = 0;
  let coin = 0;
  let fights = 0;
  let sessions = 0;
  let loot = 0;

  // A tracker of its own, so nothing here touches the live meter. It's fed the same events
  // `main.ts` feeds the live one, which is what makes an eaten fight indistinguishable from a
  // watched one — including its spells, its deaths and its per-mob rates.
  const combat = history ? createCombatStats() : null;
  // Fights before the log's first login line belong to whatever sitting was already in progress;
  // they're filed under the file itself rather than borrowing the *live* session's id.
  let session = `file:${file}`;
  combat?.setPlayer(characterFromLogFile(file) ?? "");
  combat?.onFightEnd((fight) => {
    if (history?.add(fight, combat.zone(), file, session)) fights++;
  });

  for (const raw of lines) {
    // Negative ids mark these as imported, so a KillRecord.logId can't collide with a line
    // number from this run's live tailing.
    const event = parseLine(raw, --logId);
    if (!event) continue;
    switch (event.kind) {
      case "zone":
        zone = event.zone;
        combat?.setZone(event.zone);
        break;
      case "loc":
        killLog.noteLoc(event, zone);
        break;
      case "loot":
        if (killLog.noteLoot(event)) drops++;
        combat?.recordSale(event); // an auto-sell is the only line that prices an item
        // The feed is keyed by its log line, so a drop already in it (watched live, or a previous
        // helping) is skipped rather than doubled — `add` says whether it landed.
        if (lootLog?.add(event)) loot++;
        break;
      case "kill":
        if (killLog.record(event.target, event.killer, zone, event.at, event.logId)) kills++;
        combat?.recordKill(event.target, event.at);
        break;
      case "coin":
        // Coin off a corpse belongs to the mob that paid it, and that's learned knowledge like a
        // drop rate — so it's digested. An auto-sold item's coin isn't a mob's; `noteCoin` drops it.
        if (killLog.noteCoin(event)) coin += event.copper;
        combat?.recordCoin(event);
        break;
      case "xp":
        combat?.recordXp(event);
        break;
      case "login":
        // Close the sitting that just ended before the id changes, so its last fight files under
        // it — the same order `main.ts` uses on a live login.
        combat?.reset();
        session = loginSession(event.at);
        sessions++;
        break;
      default:
        if (isCombat(event)) combat?.record(event);
    }
  }
  combat?.flush(); // the log ended mid-sitting; its last fight is still a fight
  return { lines: lines.length, kills, drops, coin, fights, sessions, loot };
}
