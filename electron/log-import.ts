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
 *
 * Fights are also the one thing here that a **second** helping changes. Kills and drops are keyed by
 * their line and skipped on sight ([ADR 0033](../specs/decisions/0033-eating-a-log-is-idempotent.md)),
 * because each is a count and counting one twice corrupts a rate. A fight is not a count — it is a
 * derived summary — so eating a log again **re-derives** the fights it already holds rather than
 * refusing them ([ADR 0128](../specs/decisions/0128-a-fight-is-re-derived-not-refused.md)). That is
 * what makes "digest the log again" the remedy `data-provenance.ts` has always advertised for a
 * stale `combat-history`, instead of a no-op.
 */
import fs from "node:fs";
import { isCombatEvent, parseLine } from "../src/shared/parse-line";
import { characterFromLogFile } from "../src/shared/log-parser";
import { createCombatStats } from "./combat-stats";
import { loginSession } from "./combat-history";
import type { DerivedFight, LogImportResult as SharedImportResult } from "../src/shared/types";
import type { CombatHistory } from "./combat-history";
import type { KillLog } from "./kill-log";
import type { LootLog } from "./loot-log";

/**
 * What one helping came to. The **same shape the renderer reads**, minus the file name the IPC adds
 * on the way out — declared there rather than a second time here, because two copies of a result
 * shape drift and then one of them silently stops reporting a field.
 */
export type LogImportResult = Omit<SharedImportResult, "file">;

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
/**
 * Digest one log with the kill log named for **that** log's character, and the live one put back
 * afterwards. The naming matters: the kill log tells your own kills from a stranger's by character
 * name, and a pet's death from a mob you farm, so digesting somebody else's evening under the live
 * character's name would file their kills as yours.
 *
 * Here rather than at each call site because there are now two — the button in Settings and the
 * unattended re-reading a stale store triggers
 * ([ADR 0129](../specs/decisions/0129-a-release-can-ask-for-a-re-read.md)) — and a dance one of them
 * forgot is the kind of bug nothing would report.
 */
export function digestLog(
  file: string,
  live: string,
  killLog: KillLog,
  history?: CombatHistory,
  lootLog?: LootLog,
): LogImportResult {
  try {
    killLog.setPlayer(characterFromLogFile(file) ?? "");
    return importLog(file, killLog, history, lootLog);
  } finally {
    killLog.setPlayer(live);
  }
}

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
  /**
   * The sitting each fight falls in, from the log's own login lines. Left **undefined** until one
   * turns up: a fight before the file's first login belongs to whatever sitting was already in
   * progress, and only the history knows what that was called (see `CombatHistory.rederive`).
   */
  let session: string | undefined;
  combat?.setPlayer(characterFromLogFile(file) ?? "");
  /**
   * Collected rather than filed one at a time, because the history replaces a log file's fights as a
   * **set**: a rule that makes a new line readable can move a boundary, so which stored fight a
   * derived one answers to is only knowable once they're all in hand (ADR 0128).
   */
  const derived: DerivedFight[] = [];
  combat?.onFightEnd((fight) => void derived.push({ stats: fight, zone: combat.zone(), sessionId: session }));
  /** The span the file actually accounts for, first parsed event to last — `rederive`'s `covers`. */
  let firstAt = 0;
  let lastAt = 0;

  for (const raw of lines) {
    // Negative ids mark these as imported, so a KillRecord.logId can't collide with a line
    // number from this run's live tailing.
    const event = parseLine(raw, --logId);
    if (!event) continue;
    const at = Date.parse(event.at);
    if (at) {
      if (!firstAt) firstAt = at;
      lastAt = at;
    }
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
        if (killLog.record(event.target, event.killer, zone, event.at, event.logId, event.named, event.killerNamed)) kills++;
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
      case "party":
        // The group as it was that evening, so an eaten log's fights are scoped the same way a
        // watched one's are (ADR 0067).
        combat?.recordParty(event);
        break;
      case "login":
        // Close the sitting that just ended before the id changes, so its last fight files under
        // it — the same order `main.ts` uses on a live login.
        combat?.reset();
        session = loginSession(event.at);
        sessions++;
        break;
      default:
        if (isCombatEvent(event)) combat?.record(event);
    }
  }
  combat?.flush(); // the log ended mid-sitting; its last fight is still a fight
  // One handover, at the end: the whole file's fights, against the span the file covers.
  const outcome =
    history && firstAt
      ? history.rederive(file, derived, { from: firstAt, to: lastAt })
      : { refreshed: 0, added: 0, superseded: 0, unsourced: 0, trimmed: 0 };
  fights = outcome.added;
  return {
    lines: lines.length,
    kills,
    drops,
    coin,
    fights,
    sessions,
    loot,
    refreshed: outcome.refreshed,
    superseded: outcome.superseded,
    unsourced: outcome.unsourced,
    trimmed: outcome.trimmed,
  };
}
