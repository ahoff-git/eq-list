/**
 * achievement-library.ts — the achievements the app ships with (ADR 0212, extended by ADR 0214
 * and ADR 0215).
 *
 * Definitions only, never progress: a stock achievement lives here, in code, and is never written
 * into `achievements.json` — only what the player has *done* toward one is saved. One entry,
 * **Grand Tour**, is *generated* rather than authored: one `"zone"` criterion per name in
 * `CURATED_ZONES` (`zones/gazetteer.ts`), the same canonical, difficulty-folded zone list the map
 * and travel graph already treat as one-name-per-real-place (ADR 0059).
 *
 * Every other criterion here is built from a real, checked source rather than assumed wording — this
 * game diverges from classic EverQuest more than it first looks (RunnyEye Citadel is a goblin
 * warren here, not the gnoll dungeon an older game ships under the same name), so guessing from
 * general EQ knowledge would have shipped at least two of these wrong:
 *  - Death and fall-damage wording: a real captured log (`log-watching`'s own documented grammar).
 *  - The Resurrection and Mesmerization spell families, and Feign Death: the player's own installed
 *    `spells_us.txt` (ADR 0080) plus real `You begin casting …` lines confirmed from a live log.
 *  - RunnyEye Citadel's named-mob roster and King Xorbb's exact name and zone: the cached wiki
 *    pages already shipped in this repo (`public/data/wiki-cache`).
 *  - "hill giant" and "spider" as real, currently-killed mob names: a live install's own
 *    `mob-knowledge.json`.
 *  - **The game ships its own achievement system** (`"You have completed achievement: <name>!"`,
 *    confirmed from a real log — dozens of them, from zone "Traveler" awards to tradeskill mastery
 *    at `"<Skill> (50)"`) — a gift for a meta-achievement, and a source for "Rat Killer" and "Eight
 *    Legs Are Better Than One", both borrowed by name from the game's own achievement list as a
 *    nod, the same way `gnollguard.com`'s community achievement tracker documents them.
 *  - The player's own faction-standing lines (`"…could not possibly get any worse/better."`) — also
 *    confirmed from a real log, and (bonus) the exact line `specs/todo.md`'s faction-tracking item
 *    has been waiting on.
 *  - Which factions each race unlock needs Ally standing with, and every playable race's own mob
 *    density: `eqlforge.com`'s race-unlock guide, cross-checked against the same real log's faction
 *    list before trusting any of it (its High Elf/Wood Elf row turned out to be a likely copy-paste
 *    of each other, confirmed by neither appearing in the real faction list — both are left out
 *    rather than shipped on a guess) — and `mob-races.generated.ts` (ADR 0215) for "kill 50 of a
 *    race", built from the wiki's own mob stat cards rather than guessed from common names the way
 *    "hill giant"/"spider" could be — most humanoid trash doesn't spell its race out in the name.
 *  - The full 16-class roster (confirmed from mob-page `Class:` trainers across the wiki cache,
 *    "Level 50 with all classes" — no reliable log signal exists for *which* class a character is
 *    playing across a session, so every criterion here is `"manual"` by design, not a shortcut.
 */
import { CURATED_ZONES } from "./zones/gazetteer";
import type { AchievementCriterion, AchievementDefinition } from "./types";

function zoneCriteria(): AchievementCriterion[] {
  return CURATED_ZONES.map((z) => ({ id: `zone:${z.name}`, label: z.name, kind: "zone", zone: z.name }));
}

/** "Kill 50 of race X" — matched by `mob-races.ts` against the log's own parsed kill, not by text
 *  (ADR 0215): most humanoid trash never spells its race out the way "hill giant" does. */
function raceKillCriterion(id: string, race: string, atLeast = 50): AchievementCriterion {
  return { id, label: `Kill ${atLeast} ${race}`, kind: "raceKill", race, count: { atLeast } };
}

/** "Your faction standing with <faction> could not possibly get any better." — the Ally ceiling,
 *  confirmed from a real log, mirroring the floor line ADR 0212's "Persona Non Grata" already uses. */
function allyCriterion(id: string, faction: string): AchievementCriterion {
  return {
    id,
    label: faction,
    kind: "watch",
    watch: { spell: `Your faction standing with ${faction} could not possibly get any better.`, onLine: true },
  };
}

/** One race-unlock achievement: Ally standing with every faction that unlock requires. */
function raceUnlockAchievement(id: string, title: string, race: string, factions: string[]): AchievementDefinition {
  return {
    id,
    title,
    description: `Reach Ally standing with every faction the ${race} unlock requires.`,
    category: "Faction",
    isOfficial: true,
    criteria: factions.map((f) => allyCriterion(`ally:${f}`, f)),
  };
}

const CLASSES = [
  "Warrior", "Cleric", "Paladin", "Ranger", "Shadow Knight", "Druid", "Monk", "Bard",
  "Rogue", "Shaman", "Necromancer", "Wizard", "Magician", "Enchanter", "Beastlord", "Berserker",
] as const;

/** `"You have slain <name>!"` — the player's own kill credit, never `"<name> has been slain by
 *  <killer>!"`, which the log uses for a kill it's telling a bystander about (ADR 0214: an
 *  achievement is about what *you* did, not what happened nearby). */
function killCriterion(id: string, name: string): AchievementCriterion {
  return { id, label: name, kind: "watch", watch: { spell: `You have slain ${name}`, onLine: true } };
}

export const STOCK_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "stock:grand-tour",
    title: "Grand Tour",
    description: "Set foot in every zone the app knows about.",
    category: "Exploration",
    isOfficial: true,
    criteria: zoneCriteria(),
  },
  {
    id: "stock:first-blood",
    title: "First Blood",
    description: "Get your first kill.",
    category: "Combat",
    isOfficial: true,
    criteria: [
      { id: "kill", label: "Slay something", kind: "watch", watch: { spell: "You have slain", onLine: true } },
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
    criteria: [
      { id: "die", label: "Get yourself killed", kind: "watch", watch: { spell: "You have been slain by", onLine: true } },
    ],
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

  // ── real ───────────────────────────────────────────────────────────────────
  {
    id: "stock:runnyeye-cleared",
    title: "Citadel Cleared",
    description: "Kill every named mob in RunnyEye Citadel.",
    category: "Zone Clear",
    isOfficial: true,
    criteria: [
      killCriterion("borxx", "Borxx"),
      killCriterion("sludge-dankmire", "Sludge Dankmire"),
      killCriterion("goblin-king", "The Goblin King"),
      killCriterion("goblin-elite-guard", "Goblin Elite Guard"),
      killCriterion("goblin-warlord", "Goblin Warlord"),
    ],
  },
  {
    id: "stock:king-xorbb",
    title: "Royal Execution",
    description: "Kill King Xorbb, in the Gorge of King Xorbb.",
    category: "Named",
    isOfficial: true,
    criteria: [killCriterion("xorbb", "King Xorbb")],
  },
  {
    id: "stock:hill-giants",
    title: "Beanstalk Problem",
    description: "Kill 25 hill giants.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [
      {
        id: "hill-giants",
        label: "Kill 25 hill giants",
        kind: "count",
        watch: { spell: "hill giant", conditions: [{ field: "line", op: "contains", text: "You have slain" }], onLine: true },
        count: { atLeast: 25 },
      },
    ],
  },
  {
    id: "stock:spiders",
    title: "Eight Legs Are Better Than One",
    description: "Kill 20 spiders. (A nod to the game's own Slayer achievement of the same name.)",
    category: "Kill Count",
    isOfficial: true,
    criteria: [
      {
        id: "spiders",
        label: "Kill 20 spiders",
        kind: "count",
        watch: { spell: "spider", conditions: [{ field: "line", op: "contains", text: "You have slain" }], onLine: true },
        count: { atLeast: 20 },
      },
    ],
  },

  // ── more silly ───────────────────────────────────────────────────────────────
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
        watch: { spell: "could not possibly get any worse", onLine: true },
      },
    ],
  },

  // ── more real ──────────────────────────────────────────────────────────────
  {
    id: "stock:level-60",
    title: "The Long Road",
    description: "Reach level 60.",
    category: "Progression",
    isOfficial: true,
    criteria: [
      { id: "level-60", label: "Reach level 60", kind: "watch", watch: { spell: "Welcome to level 60!", onLine: true } },
    ],
  },
  {
    id: "stock:tradeskill-mastery",
    title: "Craftmaster",
    description: "Max out any one tradeskill.",
    category: "Tradeskill",
    isOfficial: true,
    criteria: [
      {
        id: "mastery",
        label: "Max out a tradeskill",
        kind: "watch",
        watch: {
          spell: "",
          onLine: true,
          conditions: [{ field: "line", op: "regex", text: "You have completed achievement: [A-Za-z' ]+\\(50\\)" }],
        },
      },
    ],
  },
  {
    id: "stock:achievement-hunter",
    title: "Achievement Hunter",
    description: "Complete 10 of the game's own achievements.",
    category: "Meta",
    isOfficial: true,
    criteria: [
      {
        id: "hunter",
        label: "Complete 10 in-game achievements",
        kind: "count",
        watch: { spell: "You have completed achievement:", onLine: true },
        count: { atLeast: 10 },
      },
    ],
  },
  {
    id: "stock:rat-killer",
    title: "Rat Killer",
    description: "Complete the game's own \"Rat Killer\" achievement — the classic EverQuest joke, alive and well here too.",
    category: "Meta",
    isOfficial: true,
    criteria: [
      {
        id: "rat-killer",
        label: "Complete \"Rat Killer\"",
        kind: "watch",
        watch: { spell: "You have completed achievement: Rat Killer", onLine: true },
      },
    ],
  },

  // ── progression ────────────────────────────────────────────────────────────
  {
    id: "stock:level-50",
    title: "Half Century",
    description: "Reach level 50.",
    category: "Progression",
    isOfficial: true,
    criteria: [
      { id: "level-50", label: "Reach level 50", kind: "watch", watch: { spell: "Welcome to level 50!", onLine: true } },
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
    criteria: CLASSES.map((cls) => ({ id: `class:${cls}`, label: `${cls} to level 50`, kind: "manual" })),
  },

  // ── race-kill counts (ADR 0215) ──────────────────────────────────────────────
  {
    id: "stock:kill-human",
    title: "Nothing Personal",
    description: "Kill 50 humans.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("humans", "Human")],
  },
  {
    id: "stock:kill-dark-elf",
    title: "No Love Lost",
    description: "Kill 50 dark elves.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("dark-elves", "Dark Elf")],
  },
  {
    id: "stock:kill-erudite",
    title: "Anti-Intellectualism",
    description: "Kill 50 erudites.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("erudites", "Erudite")],
  },
  {
    id: "stock:kill-dwarf",
    title: "Short Fuse",
    description: "Kill 50 dwarves.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("dwarves", "Dwarf")],
  },
  {
    id: "stock:kill-gnome",
    title: "Big Trouble",
    description: "Kill 50 gnomes.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("gnomes", "Gnome")],
  },
  {
    id: "stock:kill-troll",
    title: "Troll Toll",
    description: "Kill 50 trolls.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("trolls", "Troll")],
  },
  {
    id: "stock:kill-ogre",
    title: "Ogre Achiever",
    description: "Kill 50 ogres.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("ogres", "Ogre")],
  },
  {
    id: "stock:kill-iksar",
    title: "Scaled Back",
    description: "Kill 50 Iksar.",
    category: "Kill Count",
    isOfficial: true,
    criteria: [raceKillCriterion("iksar", "Iksar")],
  },

  // ── race-unlock factions (ADR 0212's Ally-standing line, cross-checked per race) ─────────────
  raceUnlockAchievement("stock:ally-barbarian", "Friend of the Barbarians", "Barbarian", [
    "Rogues of the White Rose",
    "Wolves of the North",
    "Merchants of Halas",
  ]),
  raceUnlockAchievement("stock:ally-dwarf", "Friend of the Dwarves", "Dwarf", [
    "Storm Guard",
    "Merchants of Kaladim",
    "Kazon Stormhammer",
  ]),
  raceUnlockAchievement("stock:ally-erudite", "Friend of the Erudites", "Erudite", [
    "Deepwater Knights",
    "High Council of Erudin",
    "Heretics",
  ]),
  raceUnlockAchievement("stock:ally-gnome", "Friend of the Gnomes", "Gnome", [
    "King Ak'Anon",
    "Gem Choppers",
    "Eldritch Collective",
  ]),
  raceUnlockAchievement("stock:ally-halfling", "Friend of the Halflings", "Halfling", [
    "Guardians of the Vale",
    "Merchants of Rivervale",
    "Priests of Mischief",
  ]),
  raceUnlockAchievement("stock:ally-qeynos", "Friend of Qeynos", "Human (Qeynos)", [
    "Merchants of Qeynos",
    "Guards of Qeynos",
    "Corrupt Qeynos Guards",
  ]),
  raceUnlockAchievement("stock:ally-iksar", "Friend of the Iksar", "Iksar", ["New Sebilisian Expedition"]),
];
