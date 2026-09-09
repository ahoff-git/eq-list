/**
 * achievement-library.ts — the achievements the app ships with (ADR 0212, extended by ADR 0214).
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
 *  - The Resurrection spell family: the player's own installed `spells_us.txt` (ADR 0080).
 *  - RunnyEye Citadel's named-mob roster and King Xorbb's exact name and zone: the cached wiki
 *    pages already shipped in this repo (`public/data/wiki-cache`).
 *  - "hill giant" as a real, currently-killed mob name: a live install's own `mob-knowledge.json`.
 */
import { CURATED_ZONES } from "./zones/gazetteer";
import type { AchievementCriterion, AchievementDefinition } from "./types";

function zoneCriteria(): AchievementCriterion[] {
  return CURATED_ZONES.map((z) => ({ id: `zone:${z.name}`, label: z.name, kind: "zone", zone: z.name }));
}

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
];
