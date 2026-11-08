/**
 * stats-read-notice.ts — what to tell the player about a stats grab, in words.
 *
 * A read is mostly good news and occasionally an honest "I'm not sure": a figure the recogniser could only
 * infer, or a row that wasn't in the box. The player needs to know which, because the first is held back
 * (never applied on a guess) and the second is a reason to grab again. Nothing here decides what is applied
 * — that is `confidentValues` — it only says what happened.
 *
 * Pure → a tested black box.
 */
import { statMeta, type StatKey } from "./item-stats";
import type { StatsRead } from "./stats-page";

export interface ReadNotice {
  tone: "good" | "warn" | "bad";
  title: string;
  detail?: string;
}

/** How many names to spell out before "and N more". */
const SPELLED_OUT = 4;

const label = (key: StatKey) => statMeta(key).label;

function listOf(names: readonly string[]): string {
  if (names.length <= SPELLED_OUT) return names.join(", ");
  return `${names.slice(0, SPELLED_OUT).join(", ")} and ${names.length - SPELLED_OUT} more`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What happened, for a toast. `null` is a grab that had no screen to read from. */
export function readNotice(read: StatsRead | null): ReadNotice {
  if (!read) return { tone: "bad", title: "Couldn't read your stats", detail: "There was no screen to read from — try the hotkey again." };
  const found = Object.keys(read.values).length;
  if (found === 0) {
    return {
      tone: "warn",
      title: "No stats found in that box",
      detail: "Drag over the Stats page of the Inventory window — Character Vitals, and Stats and Resists — big enough that the numbers are readable.",
    };
  }
  const sure = found - read.doubtful.length;
  const unsure = read.doubtful.map((key) => `${label(key)} (${read.values[key]}?)`);
  const parts: string[] = [];
  if (unsure.length) parts.push(`Not sure of ${listOf(unsure)} — grab again, or type ${unsure.length === 1 ? "it" : "them"} in ${unsure.length === 1 ? "its" : "their"} box.`);
  if (read.missing.length) parts.push(`Didn't see ${listOf(read.missing.map(label))} — scroll them into the box and grab again.`);
  return {
    tone: parts.length ? "warn" : "good",
    title: sure ? `Read ${plural(sure, "stat")} from your Inventory window` : "Read stats, but wasn't sure of any",
    detail: parts.join(" ") || undefined,
  };
}
