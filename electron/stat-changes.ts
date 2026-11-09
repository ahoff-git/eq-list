/**
 * stat-changes.ts — the journal of things the log says happened to your character that move your stats.
 *
 * A stats read (`stats-page.ts`) goes stale when the character changes underneath it
 * ([ADR 0369](../specs/decisions/0369-a-stale-stats-read-says-so.md)), and two of the four ways it can are
 * written in the log and nowhere else: a **level** ("Welcome to level 32!") and an **ability** bought
 * ("You have gained the ability …"). Whether a given ability matters is `stat-buffs.ts`'s call, and it is
 * made on the way **in**: a real log spends 152 ability lines on 55 abilities, 88 of them free upgrades and
 * the toggles of an aura flipping on and off, and journaled they would push the levels out of a list of 80.
 *
 * It lives in the main process, and on disk, for the reason `hp-estimate.ts` does: the log is read again on
 * a catch-up, so a level gained while the app was closed arrives with its own timestamp on the next launch
 * — and a renderer that only sees what happened while it was open would miss exactly those. The pure rules
 * (idempotence, order, the cap) are `stats-drift.ts`'s; this holds the list, persists it and says when it
 * changed.
 */
import path from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import { abilityMovesStats } from "../src/shared/buffs/stat-buffs";
import { JOURNAL_LIMIT, hasChange, noteChange, type StatChange } from "../src/shared/items/stats-drift";
import type { AbilityEvent, LevelEvent } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("stat-changes");

const WRITE_DEBOUNCE_MS = 1_000;

export interface StatChanges {
  noteLevel(event: LevelEvent): void;
  noteAbility(event: AbilityEvent): void;
  /** Everything kept, oldest first. */
  all(): StatChange[];
  /** Write now — for quitting. */
  flush(): void;
  /** Fires when the journal actually changed — not for a line read a second time. */
  onChange(cb: (changes: StatChange[]) => void): void;
}

/** A journal entry as it should be: anything that isn't one is dropped, so a hand-edited file can't break the page. */
function valid(raw: unknown): StatChange | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) return null;
  if (r.kind === "level") return { at: r.at, kind: "level", ...(typeof r.level === "number" && { level: r.level }) };
  if (r.kind === "ability" && typeof r.name === "string") return { at: r.at, kind: "ability", name: r.name, ...(typeof r.rank === "number" && { rank: r.rank }) };
  return null;
}

export function createStatChanges(userDataDir: string): StatChanges {
  const file = path.join(userDataDir, "stat-changes.json");
  const bus = new EventEmitter();
  let journal: StatChange[] = readJson<unknown[]>(file, [])
    .map(valid)
    .filter((c): c is StatChange => !!c)
    .slice(-JOURNAL_LIMIT.changes);
  const saver = createSaver(file, "stat changes", () => journal, WRITE_DEBOUNCE_MS);

  function note(change: StatChange): void {
    if (hasChange(journal, change)) return;
    journal = noteChange(journal, change);
    log.debug("stat change", change);
    saver.save();
    bus.emit("change", journal);
  }

  return {
    noteLevel: (event) => note({ at: event.at, kind: "level", ...(event.level !== undefined && { level: event.level }) }),
    noteAbility: (event) => {
      if (abilityMovesStats(event.name)) note({ at: event.at, kind: "ability", name: event.name, ...(event.rank !== undefined && { rank: event.rank }) });
    },
    all: () => [...journal],
    flush: () => saver.flush(),
    onChange: (cb) => void bus.on("change", cb),
  };
}
