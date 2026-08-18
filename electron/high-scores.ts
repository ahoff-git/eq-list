/**
 * high-scores.ts — the scoreboard: what your best ever was, and when to make a noise about it.
 *
 * The catalog and every comparison are pure and next door in
 * [src/shared/high-scores.ts](../src/shared/high-scores.ts). This is the half that needs memory,
 * which is to say the half where the interesting decisions are — because "did this beat the record"
 * is arithmetic, and **"is this worth a banner"** is not. Four rules, none of them obvious, and each
 * of them a bug if it's missing:
 *
 *   1. **A board belongs to a character.** The log file names them, and a level 50's biggest hit is
 *      not a bar a fresh alt should be measured against — one shared board would mean a new
 *      character has nothing to chase and an old one silently competing with it. Every character's
 *      board is kept in the one file, keyed by name, so switching back finds yours intact.
 *   2. **The first score in a category sets the bar, silently.** On an empty board *everything* is a
 *      record, so celebrating them would put eight banners on screen during your first fight and
 *      teach you to ignore them. A score with nothing to beat isn't news; `previous` being absent is
 *      how the board says so afterwards.
 *   3. **Old news is filed, never announced.** Everything logged while the app was shut is replayed
 *      through the live path at launch ([ADR 0044](../specs/decisions/0044-the-log-position-outlives-the-app.md)),
 *      and so is a log you deliberately eat. Those records are real and belong on the board; a
 *      banner for a hit you landed last Tuesday is a lie about the present. Hence `setQuiet`.
 *   4. **A running counter announces the crossing, then shuts up.** A kill streak beats its own
 *      record on *every* kill once it holds it, so the naive rule would chant at you for an hour.
 *      The record keeps climbing; only the moment it took the lead is spoken.
 *
 * A fifth thing worth saying: the board is **seeded from fights already on disk** the first time it
 * meets a character (`backfill`). A scoreboard that starts empty is a scoreboard whose first dozen
 * records are all rule 2 — set silently, beating nothing, and therefore no fun at all. Reading the
 * history you already have means the very first live record has something real to clear.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { characterFromLogFile } from "../src/shared/log-parser";
import { beats, fightCandidates, scoreOrder } from "../src/shared/high-scores";
import type { HighScore, ScoreBoard, ScoreCandidate, StoredFight } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("high-scores");

/** Records change rarely and in bursts (a fight's worth at once); coalesce the writes. */
const WRITE_DEBOUNCE_MS = 2000;

/** One character's board as it sits on disk — records by category id, plus the live streak. */
interface StoredBoard {
  scores: Record<string, HighScore>;
  /** Kills since the last death. Persisted, because a restart mid-camp didn't break the streak. */
  streak: number;
  /** Past fights have been read into this board — see rule 5. Once per character, ever. */
  seeded?: boolean;
}

interface StoredScores {
  /** By lowercased character name, so the log's capitalisation can't split one board in two. */
  characters: Record<string, StoredBoard>;
}

export interface HighScoreKeeper {
  /**
   * Whose records these are, from the log file's own name. An unknown character (no log yet) keeps
   * a board too, so nothing is lost before the watcher has reported in — it's just nameless.
   */
  setPlayer(name: string): void;
  /**
   * Whether what's arriving is **news**. Off while a gap is being replayed or a log is being eaten:
   * the records still land, but nothing is announced (rule 3).
   */
  setQuiet(quiet: boolean): void;
  /** Offer candidates from a live event or a finished fight; announces whatever it takes. */
  offer(candidates: ScoreCandidate[], zone?: string | null): void;
  /** A kill: the streak grows, and may cross its record (rule 4). */
  noteKill(at: string, zone?: string | null): void;
  /** Your death: the streak is over, and the next crossing is news again. */
  noteDeath(): void;
  /**
   * Read past fights into this character's board, **once ever** — rule 5's seeding. Cheap to call on
   * every log-file change, because the second call does nothing.
   */
  seed(fights: StoredFight[]): void;
  /**
   * Read past fights in again, guard and all bypassed — for a log you just **ate**, whose fights are
   * new to the history and therefore new to the board. Silent, and safe to hand fights it has
   * already seen: a score that ties its own record doesn't beat it.
   */
  absorb(fights: StoredFight[]): void;
  /** The current character's board, in display order. */
  board(): ScoreBoard;
  /** Called with each record as it falls — only the ones worth announcing. */
  onRecord(cb: (record: HighScore) => void): void;
  /** Forget the current character's board. Everyone else's is untouched. */
  clear(): ScoreBoard;
  flush(): void;
}

export function createHighScores(userDataDir: string): HighScoreKeeper {
  const file = path.join(userDataDir, "high-scores.json");
  const data: StoredScores = read();
  const saver = createSaver(file, "high scores", () => data, WRITE_DEBOUNCE_MS, { concern: "high-scores" });
  const listeners: ((record: HighScore) => void)[] = [];

  let character = "";
  let quiet = false;
  /**
   * Whether the streak *currently running* has already been announced. Rule 4's whole state: set
   * when a streak takes the record, cleared by death, and by nothing else.
   */
  let streakAnnounced = false;

  function read(): StoredScores {
    const parsed = readJson<Partial<StoredScores>>(file, {});
    return { characters: parsed.characters ?? {} };
  }

  /** This character's board, made on demand — asking about a character is enough to give them one. */
  function mine(): StoredBoard {
    const key = character.toLowerCase();
    const found = data.characters[key];
    if (found) {
      if (!found.scores) found.scores = {}; // a file written by hand, or by an older shape
      return found;
    }
    const fresh: StoredBoard = { scores: {}, streak: 0 };
    data.characters[key] = fresh;
    return fresh;
  }

  /**
   * Take a candidate if it beats what's there, and announce it if that's news.
   *
   * Returns whether it **spoke** — not whether it took the record, which is a different question and
   * conflating the two is what rule 4 needs to be able to tell apart: a streak's first record is
   * taken *and* silent (rule 2), and if that counted as having spoken, the crossing a kill later
   * would be swallowed as a repeat of something never said.
   *
   * `silent` is rule 4's own exception — a caller that knows this particular improvement isn't news.
   * Rule 2 (nothing to beat) is decided here instead, because it's a property of the board rather
   * than of the caller.
   */
  function claim(candidate: ScoreCandidate, zone: string | null | undefined, silent = false): boolean {
    const board = mine();
    const current = board.scores[candidate.categoryId];
    if (!beats(candidate, current)) return false;

    const record: HighScore = {
      categoryId: candidate.categoryId,
      value: candidate.value,
      at: candidate.at,
      detail: candidate.detail,
      zone: zone ?? undefined,
      previous: current?.value,
      beaten: (current?.beaten ?? 0) + 1,
    };
    board.scores[candidate.categoryId] = record;
    saver.save();

    // Rule 2: a first score has nothing to beat, so it's a bar being set rather than cleared.
    // Rule 3: replayed or imported history is filed, not announced.
    if (silent || quiet || current === undefined) return false;
    log.debug("new record", { category: record.categoryId, value: record.value, previous: record.previous });
    for (const cb of listeners) cb(record);
    return true;
  }

  /**
   * Fold a batch of stored fights into this character's board, silently.
   *
   * **Only this character's fights.** A stored fight names the log it came from and the log names the
   * character (ADR 0033's keying reads the same field), so a fight we can't attribute is left out
   * rather than credited to whoever happens to be logged in now — which is the whole point of rule 1
   * and the one way a shared board could sneak back in.
   *
   * Oldest first, so `previous` and `beaten` tell the true story of how the board was built up
   * instead of one arbitrary fight appearing to have beaten everything at once.
   */
  function absorb(fights: StoredFight[], why: string): void {
    if (!character) return; // nobody to credit them to
    const ours = fights.filter(
      (f) => (characterFromLogFile(f.logFile ?? "") ?? "").toLowerCase() === character.toLowerCase(),
    );
    const ordered = [...ours].sort((a, b) => a.stats.startedAt.localeCompare(b.stats.startedAt));
    for (const fight of ordered) {
      // Silent throughout: this is history, and rule 3 holds for it whether or not we're muted.
      for (const candidate of fightCandidates(fight.stats)) claim(candidate, fight.zone, true);
    }
    saver.save();
    log.debug(why, { character, fights: ordered.length, of: fights.length });
  }

  /** The board as a caller sees it: records in display order, plus the live streak. */
  function snapshot(): ScoreBoard {
    const board = mine();
    return {
      character,
      scores: Object.values(board.scores).sort(
        (a, b) => scoreOrder(a.categoryId) - scoreOrder(b.categoryId) || a.categoryId.localeCompare(b.categoryId),
      ),
      streak: board.streak,
      seeded: !!board.seeded,
    };
  }

  return {
    setPlayer(name) {
      const next = name.trim();
      if (next === character) return;
      character = next;
      // A different character is a different streak; theirs is whatever their board remembers.
      streakAnnounced = false;
      log.debug("board for", { character: character || "(unnamed)" });
    },

    setQuiet(next) {
      quiet = next;
    },

    offer(candidates, zone) {
      for (const candidate of candidates) claim(candidate, zone);
    },

    noteKill(at, zone) {
      const board = mine();
      board.streak += 1;
      saver.save();
      const candidate: ScoreCandidate = {
        categoryId: "kill-streak",
        value: board.streak,
        at,
        detail: `${board.streak} kills without dying`,
      };
      // Rule 4: the streak that already holds the record beats it again every kill, so only the
      // crossing speaks. Everything after it is a quiet raise of a bar this streak already owns —
      // and the flag turns on when it **spoke**, not when it took the record, or a streak whose first
      // record was the silent bar-setting would never get its crossing announced.
      if (claim(candidate, zone, streakAnnounced)) streakAnnounced = true;
    },

    noteDeath() {
      const board = mine();
      if (board.streak) log.debug("streak ended", { at: board.streak });
      board.streak = 0;
      streakAnnounced = false;
      saver.save();
    },

    seed(fights) {
      const board = mine();
      if (board.seeded) return;
      board.seeded = true;
      absorb(fights, "seeded board from history");
    },

    absorb: (fights) => absorb(fights, "read fights into board"),

    board: snapshot,

    onRecord(cb) {
      listeners.push(cb);
    },

    clear() {
      // Cleared, not deleted: the board is re-seeded from history the moment it's asked for
      // otherwise, and "forget my records" plainly doesn't mean "put most of them straight back".
      data.characters[character.toLowerCase()] = { scores: {}, streak: 0, seeded: true };
      streakAnnounced = false;
      saver.flush();
      return snapshot();
    },

    flush() {
      saver.flush();
    },
  };
}
