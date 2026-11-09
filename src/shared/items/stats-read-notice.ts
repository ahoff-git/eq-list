/**
 * stats-read-notice.ts — what to tell the player about a stats grab, in words.
 *
 * A read is mostly good news and occasionally an honest "I'm not sure": a figure the recogniser could only
 * infer, or a row that wasn't in the box. The player needs to know which, because the first is held back
 * (never applied on a guess) and the second is a reason to grab again. And a grab that found nothing is
 * several different problems that need different fixes — a blank capture, a box too small to read, the
 * wrong tab, the wrong window — so it says which, from what the recogniser did see. Nothing here decides
 * what is applied — that is `confidentValues` — it only says what happened.
 *
 * Pure → a tested black box.
 */
import { statMeta, type StatKey } from "./item-stats";
import { combatFigures } from "./stats-for-combat";
import { sameCharacter } from "./stats-identity";
import type { StatsRead } from "./stats-page";

export interface ReadNotice {
  tone: "good" | "warn" | "bad";
  title: string;
  detail?: string;
}

/** What the notice may need to know that the read itself can't say. */
export interface ReadContext {
  /** The character the app is following (from its log file) — whose plan a read would go into. */
  followed?: string;
}

/** How many names to spell out before "and N more". */
const SPELLED_OUT = 4;

/** A box smaller than this (screen px) can't hold the stats page at any UI scale the game has. */
const READABLE = { width: 260, height: 150 } as const;

const label = (key: StatKey) => statMeta(key).label;

function listOf(names: readonly string[]): string {
  if (names.length <= SPELLED_OUT) return names.join(", ");
  return `${names.slice(0, SPELLED_OUT).join(", ")} and ${names.length - SPELLED_OUT} more`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The name the window shows when it isn't the character the app follows — the one grab that must not be applied
 * at all: another character's HP and resists would be filed as yours. `undefined` when it is yours, when the
 * name couldn't be read, or when there is no one to compare with.
 */
export function wrongCharacter(read: StatsRead | null, followed: string | undefined): string | undefined {
  const name = read?.who?.name;
  return name && followed && !sameCharacter(name, followed) ? name : undefined;
}

/** A grab that found no stats at all: which of the several reasons it was, and what to do about each. */
function nothingFound(read: StatsRead): ReadNotice {
  const { seen } = read;
  if (seen && seen.words === 0) {
    return {
      tone: "warn",
      title: "That box was blank",
      detail: "Nothing readable in it. If the game runs in exclusive fullscreen the capture can come out black — switch it to windowed or borderless, then grab again.",
    };
  }
  if (seen?.width !== undefined && seen.height !== undefined && (seen.width < READABLE.width || seen.height < READABLE.height)) {
    return { tone: "warn", title: "That box is too small to read", detail: "Drag over the whole Inventory window, corner to corner — the numbers are small." };
  }
  if (read.who) {
    return {
      tone: "warn",
      title: "Found the Inventory window, but not its stats",
      detail: "Click the Equipment tab and scroll the stats panel — Character Vitals, and Stats and Resists — into view, then grab again.",
    };
  }
  return {
    tone: "warn",
    title: "No stats found in that box",
    detail: `Open the Inventory window on its Equipment tab and drag over the whole window — it should show Character Vitals and Stats and Resists.${seen?.sample ? ` What I read instead: “${seen.sample}”.` : ""}`,
  };
}

/** What the corner of the window gave: who it was, and what couldn't be settled — or how to include it. */
function identityNotes(read: StatsRead): { problems: string[]; notes: string[] } {
  const who = read.who;
  if (!who) {
    return { problems: [], notes: ["Include the top-right of the window (your name, level and classes) in the box and those are read too."] };
  }
  const problems: string[] = [];
  const notes: string[] = [];
  if (who.unsure.includes("classes")) problems.push(`Couldn't settle your classes${who.saw ? ` (I saw “${who.saw}”)` : ""} — tick them in Class.`);
  if (who.unsure.includes("level")) problems.push("Couldn't settle your level — set it on the level slider.");
  if (who.classes.length || who.level !== undefined) {
    const as = [who.level !== undefined ? `level ${who.level}` : "", who.classes.join(" / ")].filter(Boolean).join(" ");
    notes.push(`You're ${as}.`);
  }
  return { problems, notes };
}

/** What happened, for a toast. `null` is a grab that had no screen to read from. */
export function readNotice(read: StatsRead | null, context: ReadContext = {}): ReadNotice {
  if (!read) return { tone: "bad", title: "Couldn't read your stats", detail: "There was no screen to capture — press the hotkey again." };
  if (read.problem === "engine") {
    return {
      tone: "bad",
      title: "Couldn't read your stats",
      detail: "The text reader failed to start — it downloads its model the first time, so it needs the internet once. Try again, or type the figures in their boxes meanwhile.",
    };
  }
  const other = wrongCharacter(read, context.followed);
  if (other) {
    return {
      tone: "bad",
      title: `That's ${other}'s window, not ${context.followed}'s`,
      detail: `Nothing was applied — the plan is for ${context.followed}. Open ${context.followed}'s Inventory window and grab again.`,
    };
  }
  const found = Object.keys(read.values).length;
  if (found === 0) return nothingFound(read);
  if (read.noisy) {
    return {
      tone: "warn",
      title: "That capture is too rough to trust",
      detail: "Several figures couldn't be read cleanly, or disagreed between two readings, so none is applied on its own. Check them against your game and confirm in the loadout builder — or grab again with the Inventory window bigger (raise the game's UI scale) and uncompressed.",
    };
  }

  const sure = found - read.doubtful.length;
  const unsure = read.doubtful.map((key) => `${label(key)} (${read.values[key]}?)`);
  const problems: string[] = [];
  const notes: string[] = [];
  if (unsure.length) problems.push(`Not sure of ${listOf(unsure)} — check ${unsure.length === 1 ? "it" : "them"} against the game and confirm in the loadout builder, or grab again.`);
  if (read.missing.length) problems.push(`Didn't see ${listOf(read.missing.map(label))} — scroll them into the box and grab again.`);
  const who = identityNotes(read);
  problems.push(...who.problems);
  notes.push(...who.notes);
  const combat = combatFigures(read);
  if (combat.maxHp !== undefined) notes.push(`Max HP${combat.hpRegen !== undefined ? " and regen are" : " is"} set for the Deaths page.`);
  return {
    tone: problems.length ? "warn" : "good",
    title: sure ? `Read ${plural(sure, "stat")} from your Inventory window` : "Read stats, but wasn't sure of any",
    detail: [...problems, ...notes].join(" ") || undefined,
  };
}
