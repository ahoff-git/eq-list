/**
 * game-exports.ts — the game's own `/outputfile` dumps, and how old each one is.
 *
 * EverQuest will write a character's bags, bank, depot, hoard, spellbook and more to a file on
 * command, but **only** on command — nothing in the log says when, and nothing triggers one for you.
 * So the honest thing an app can do is say how long ago each was taken and nudge the player to take
 * it again, which is all this module decides. Reading the dumps is a later job (see `specs/todo.md`).
 *
 * Files land beside the `Logs` folder as `<Character>_<server>-<Type>.txt`, the same
 * `<Character>_<server>` pair the log is named after (`eqlog_<Character>_<server>.txt`), so the log we
 * already follow says which dumps are this character's.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface GameExportCommand {
  /** What the player types — copied verbatim. */
  command: string;
  /** Short name on the button. */
  label: string;
  /** What the dump holds, for the hover. */
  what: string;
  /**
   * A word in the file's `<Type>`, lower-cased, matched as the **start of any `-`-separated part** of
   * it. The EQL client puts a class code in some of them and pluralises others — a faction dump is
   * `<Char>_<server>-WIZ-Factions.txt` — so `faction` has to find `factions` after a `wiz-`.
   */
  fileType: string;
  /**
   * How long until this dump reads as plainly out of date (fully red). Halfway is yellow. Set by
   * how fast the thing it records changes: bags change every session, a house almost never.
   */
  staleAfterMs: number;
  /** Column names for a dump the game writes without a header line (the spellbook). */
  columns?: readonly string[];
  /** What an empty dump means, where "nothing" is an answer rather than a failure. */
  emptyText?: string;
}

export const GAME_EXPORT_COMMANDS: readonly GameExportCommand[] = [
  {
    command: "/outputfile inventory",
    label: "Inventory",
    what: "Worn gear, bags, bank, shared bank, key rings — plus the Tradeskill Depot if it's loaded and the Dragon's Hoard if its window is open",
    fileType: "inventory",
    staleAfterMs: 12 * HOUR,
  },
  {
    command: "/outputfile guildbank",
    label: "Guild bank",
    what: "The guild bank (not part of the inventory dump)",
    fileType: "guildbank",
    staleAfterMs: 3 * DAY,
  },
  {
    command: "/outputfile realestate",
    label: "Real estate",
    what: "Your housing and what's placed in it",
    fileType: "realestate",
    staleAfterMs: 30 * DAY,
    emptyText: "No real estate on this character.",
  },
  {
    command: "/outputfile spellbook",
    label: "Spellbook",
    what: "Every spell and combat ability you have scribed",
    fileType: "spellbook",
    staleAfterMs: 7 * DAY,
    columns: ["Level", "Spell"],
  },
  {
    command: "/outputfile missingspells",
    label: "Missing spells",
    what: "Spells and abilities your class could have at your level but you haven't scribed",
    fileType: "missingspells",
    staleAfterMs: 7 * DAY,
    emptyText: "Nothing missing: you have every spell your class can scribe at your level.",
  },
  {
    command: "/outputfile faction",
    label: "Faction",
    what: "Your standing with every faction",
    fileType: "faction",
    staleAfterMs: 3 * DAY,
  },
  {
    command: "/outputfile achievements",
    label: "Achievements",
    what: "Complete, open and locked achievements",
    fileType: "achievements",
    staleAfterMs: 7 * DAY,
  },
];

/**
 * The tradeskills `/outputfile recipes` takes, as the keyword it takes and the name a button shows.
 * One dump each: the EQL client refuses `recipes all`, which Live documents as "every skill". The
 * list is the client's own usage line (`Usage: /outputfile recipes [alchemy | baking | …]`).
 */
const RECIPE_SKILLS: readonly { keyword: string; label: string }[] = [
  { keyword: "alchemy", label: "Alchemy" },
  { keyword: "baking", label: "Baking" },
  { keyword: "blacksmithing", label: "Blacksmithing" },
  { keyword: "brewing", label: "Brewing" },
  { keyword: "fishing", label: "Fishing" },
  { keyword: "fletching", label: "Fletching" },
  { keyword: "jewelcrafting", label: "Jewelcrafting" },
  { keyword: "poisonmaking", label: "Poison making" },
  { keyword: "pottery", label: "Pottery" },
  { keyword: "research", label: "Research" },
  { keyword: "tailoring", label: "Tailoring" },
  { keyword: "tinkering", label: "Tinkering" },
];

/**
 * One command per tradeskill. Matched on the skill word alone: no other dump's name has a
 * tradeskill in it, and we haven't yet seen what the client calls a recipe file, so asking for
 * `recipes` as well would risk never matching.
 */
export const RECIPE_EXPORT_COMMANDS: readonly GameExportCommand[] = RECIPE_SKILLS.map(({ keyword, label }) => ({
  command: `/outputfile recipes ${keyword}`,
  label,
  what: `${label} recipes you know that count toward going past the skill's cap`,
  fileType: keyword,
  staleAfterMs: 7 * DAY,
}));

/**
 * `"<Character>_<server>-"` — the start of every dump file belonging to the character whose log
 * this is — or null for a log not named the game's way (a renamed file names no one).
 */
export function exportFilePrefix(logFile?: string): string | null {
  if (!logFile) return null;
  const base = logFile.split(/[\\/]/).pop() ?? logFile;
  const m = base.match(/^eqlog_(.+)\.txt$/i);
  return m ? `${m[1]}-` : null;
}

/** The lower-cased `<Type>` of a dump file for this prefix, or null when the file isn't one. */
export function exportFileType(fileName: string, prefix: string): string | null {
  const lower = fileName.toLowerCase();
  if (!lower.startsWith(prefix.toLowerCase()) || !lower.endsWith(".txt")) return null;
  const type = lower.slice(prefix.length, -".txt".length);
  return type || null;
}

/** When each dump type was last written (ms since epoch), keyed by lower-cased `<Type>`. */
export type GameExportTimes = Record<string, number>;

/** Every command the tab offers, recipes included — one list for lookups by `fileType`. */
export const ALL_EXPORT_COMMANDS: readonly GameExportCommand[] = [...GAME_EXPORT_COMMANDS, ...RECIPE_EXPORT_COMMANDS];

/** The command whose dumps carry this `fileType`, or undefined — main checks a renderer's ask with it. */
export function exportCommandFor(fileType: string): GameExportCommand | undefined {
  return ALL_EXPORT_COMMANDS.find((c) => c.fileType === fileType);
}

/** Whether a dump's lower-cased `<Type>` (`wiz-factions`) is one of this command's. */
export function exportTypeMatches(cmd: GameExportCommand, type: string): boolean {
  return type.split("-").some((part) => part.startsWith(cmd.fileType));
}

/** The newest write among this command's files, or undefined when it has never been run. */
export function lastExportedAt(cmd: GameExportCommand, times: GameExportTimes): number | undefined {
  let newest: number | undefined;
  for (const [type, at] of Object.entries(times)) {
    if (exportTypeMatches(cmd, type) && (newest === undefined || at > newest)) newest = at;
  }
  return newest;
}

/**
 * How stale a dump is, 0 (just taken) to 1 (fully red), or null when there is none at all.
 * Continuous rather than banded, so the colour drifts instead of jumping — a nudge, not an alarm.
 */
export function exportStaleness(cmd: GameExportCommand, writtenAt: number | undefined, now: number): number | null {
  if (writtenAt === undefined) return null;
  const age = Math.max(0, now - writtenAt);
  return Math.min(1, age / cmd.staleAfterMs);
}

/** An age at the coarseness a reminder wants — `just now`, `40m ago`, `5h ago`, `3d ago`. */
export function exportAgeText(ageMs: number): string {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
