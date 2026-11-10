/**
 * achievement-library.ts — the achievements the app ships with (ADR 0212, extended by ADR 0214,
 * trimmed by ADR 0383).
 *
 * Definitions only, never progress: a stock achievement lives here, in code, and is never written
 * into `achievements.json` — only what the player has *done* toward one is saved.
 *
 * **Nothing here duplicates what the game already awards.** EverQuest Legends ships its own
 * achievement system (`"You have completed achievement: <name>!"`, and the Achievements window /
 * `/outputfile achievements` dump this app reads): zone Travelers and Explorers, Race / Class / Deity
 * unlocks, level milestones, tradeskill tiers, Slayer kill counts by race and creature family, and
 * per-zone Hunters. The app once shipped 24 achievements the game also awards (a zone tour, "kill 50
 * erudites", "Ally with the Qeynos factions", Rat Killer) and the player saw every one twice — once
 * from the game, once from us — on a different count. What is left is what the game has no equivalent for: the
 * scoreboard (a 500-damage hit, a five-minute fight), things you can only do by being silly (die, feign
 * death, mesmerize, rez), burning a faction to the floor, and the honor-system boxes. Before adding one,
 * look it up in the game's own list (`Kainos_<server>-Achievements.txt`) first.
 *
 * Every criterion here is built from a real, checked source rather than assumed wording — this
 * game diverges from classic EverQuest more than it first looks, so guessing from general EQ
 * knowledge would have shipped wrong ones:
 *  - Death wording and the level-up line: a real captured log (`log-watching`'s own documented grammar).
 *  - The Resurrection and Mesmerization spell families, and Feign Death: the player's own installed
 *    `spells_us.txt` (ADR 0080) plus real `You begin casting …` lines confirmed from a live log.
 *  - The player's own faction-standing lines (`"…could not possibly get any worse."`) — also
 *    confirmed from a real log.
 *  - The full 16-class roster (confirmed from mob-page `Class:` trainers across the wiki cache,
 *    "Level 50 with all classes" — no reliable log signal exists for *which* class a character is
 *    playing across a session, so every criterion there is `"manual"` by design, not a shortcut.
 *
 * **A line criterion is read from the start of the line** (`systemLine`), never as a substring of
 * it. The log also writes every other player's chat, and a guildmate typing "Welcome to level 50!"
 * (verbatim from a real log: `Ramada tells General1:2, 'You have gained a level! Welcome to level
 * 50! woohoo!'`) completed a level achievement that was never theirs to complete.
 */
import { CLASS_NAMES } from "../class-names";
import type { AchievementDefinition, AchievementWatch, WatchCondition } from "../types";

/**
 * A raw-line watch that holds only when the line **begins** with `starts` — and, when `ends` is
 * given, finishes with it. The game's own sentences ("You have slain a rat!") start with the thing
 * they say; chat that merely quotes one starts with a speaker ("Bob tells the guild, '…'"), so
 * anchoring is what tells them apart.
 *
 * Uses the `starts`/`ends` operators rather than a regex: they are the same case-insensitive
 * comparisons every watch already has, and need no ReDoS check (ADR 0203). The trigger text is left
 * blank on purpose — a watch with conditions and no trigger is a first-class shape (`conditionsHold`).
 */
function systemLine(starts: string, ends?: string): AchievementWatch {
  const conditions: WatchCondition[] = [{ field: "line", op: "starts", text: starts }];
  if (ends) conditions.push({ field: "line", op: "ends", text: ends });
  return { spell: "", onLine: true, conditions };
}

export const STOCK_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "stock:first-blood",
    title: "First Blood",
    description: "Get your first kill.",
    category: "Combat",
    isOfficial: true,
    criteria: [
      // `"You have slain <name>!"` is the player's own kill credit; `"<name> has been slain by
      // <killer>!"` is a bystander's, and neither starts like the other (ADR 0214).
      { id: "kill", label: "Slay something", kind: "watch", watch: systemLine("You have slain ") },
    ],
  },
  {
    id: "stock:now-were-talking",
    title: "Now We're Talking",
    description: "Land a single hit for 500 damage or more, however it was delivered.",
    category: "Combat",
    isOfficial: true,
    criteria: [
      {
        id: "hit",
        label: "Land a 500+ hit",
        kind: "highscore",
        highscore: { categoryId: "biggest-hit", atLeast: 500 },
      },
    ],
  },
  {
    id: "stock:marathon",
    title: "Marathon",
    description: "Survive a single fight lasting five minutes or more.",
    category: "Combat",
    isOfficial: true,
    criteria: [
      {
        id: "fight",
        label: "Fight for 5 minutes straight",
        kind: "highscore",
        highscore: { categoryId: "longest-fight", atLeast: 300 },
      },
    ],
  },
  {
    id: "stock:say-hello",
    title: "Say Hello",
    description: "Greet someone in /ooc. The log can't prove this one — tick it off yourself.",
    category: "Social",
    isOfficial: true,
    criteria: [{ id: "hello", label: "Say hello in /ooc", kind: "manual" }],
  },

  // ── silly ──────────────────────────────────────────────────────────────────
  {
    id: "stock:die",
    title: "Oops",
    description: "Die. It happens to everyone eventually.",
    category: "Misadventure",
    isOfficial: true,
    criteria: [{ id: "die", label: "Get yourself killed", kind: "watch", watch: systemLine("You have been slain by ") }],
  },
  {
    id: "stock:drown",
    title: "Glub Glub",
    description: "Drown. There's no confirmed log line for this one on this server, so it's on the honor system.",
    category: "Misadventure",
    isOfficial: true,
    criteria: [{ id: "drown", label: "Forget to hold your breath", kind: "manual" }],
  },
  {
    id: "stock:fall",
    title: "Gravity Wins",
    description:
      "Die from fall damage. The log confirms \"YOU were injured by falling.\" when you take the damage, but " +
      "not what actually finishes you off, so this one's self-reported too.",
    category: "Misadventure",
    isOfficial: true,
    criteria: [{ id: "fall", label: "Misjudge a ledge fatally", kind: "manual" }],
  },
  {
    id: "stock:rez",
    title: "Good as New",
    description: "Cast a resurrection spell on someone.",
    category: "Social",
    isOfficial: true,
    criteria: [
      {
        id: "rez",
        label: "Cast a Resurrection spell",
        kind: "watch",
        watch: { spell: "Resurrect", onCast: true },
      },
    ],
  },
  {
    id: "stock:feign",
    title: "Playing Possum",
    description: "Cast Feign Death.",
    category: "Misadventure",
    isOfficial: true,
    criteria: [{ id: "feign", label: "Cast Feign Death", kind: "watch", watch: { spell: "Feign Death", onCast: true } }],
  },
  {
    id: "stock:mez",
    title: "Say Goodnight",
    description: "Cast a mesmerize spell.",
    category: "Combat",
    isOfficial: true,
    criteria: [
      // Substring "Mesmeri" catches Mesmerize, Mesmerization and every ranked/named variant
      // (spells_us.txt, ADR 0080) — and stays self-scoped regardless (ADR 0214), so it's harmless
      // that a handful of those variants are actually mob-only spells the player could never cast.
      { id: "mez", label: "Cast a mesmerize spell", kind: "watch", watch: { spell: "Mesmeri", onCast: true } },
    ],
  },
  {
    id: "stock:faction-enemy",
    title: "Persona Non Grata",
    description: "Burn a faction all the way to rock bottom.",
    category: "Misadventure",
    isOfficial: true,
    criteria: [
      {
        id: "hated",
        label: "Make a faction hate you as much as it possibly can",
        kind: "watch",
        // The floor line is the game's own sentence about *your* standing, so it starts "Your
        // faction standing with" — chat that quotes it doesn't.
        watch: systemLine("Your faction standing with ", "could not possibly get any worse."),
      },
    ],
  },

  // ── progression ────────────────────────────────────────────────────────────
  {
    id: "stock:level-60",
    title: "The Long Road",
    description: "Reach level 60.",
    category: "Progression",
    isOfficial: true,
    // The game's own list stops at "Level 50", so there is no in-game twin to defer to here.
    criteria: [
      {
        id: "level-60",
        label: "Reach level 60",
        kind: "watch",
        watch: systemLine("You have gained a level! Welcome to level 60!"),
      },
    ],
  },
  {
    id: "stock:level-50-all-classes",
    title: "Renaissance Adventurer",
    description:
      "Reach level 50 with a character of every class. No log line says which class a character is " +
      "playing (only, occasionally, which it *isn't* — a rejected class-guild entry), so every box " +
      "here is on the honor system.",
    category: "Progression",
    isOfficial: true,
    criteria: CLASS_NAMES.map((cls) => ({ id: `class:${cls}`, label: `${cls} to level 50`, kind: "manual" })),
  },
];
