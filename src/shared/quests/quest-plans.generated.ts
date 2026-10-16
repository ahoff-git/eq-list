/**
 * Long, multi-zone quests as plans — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-quest-plans.mjs` (scraped 2026-10-16T07:37:06.084Z). Read it through
 * `quest-plans.ts`, which owns progress, places and era — see
 * [ADR 0300](../../../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md).
 *
 * 30 plans, 732 steps, 253 people.
 */

/** What a step has you do — read off its verb ("Loot", "Give", "Tell", …). */
export type PlanStepKind = "give" | "loot" | "kill" | "talk" | "buy" | "combine" | "ground" | "get" | "quest" | "other";

export interface PlanStep {
  /** How deep the wiki nests it — a sub-step of the one before it is deeper. */
  depth: number;
  kind: PlanStepKind;
  /** The step as the wiki words it, as plain text. */
  text: string;
  /** Items handed in. */
  gives: string[];
  /** Items this step gets you — what the list tracks. */
  gets: string[];
  /** The NPC or mob it's with, by wiki title — placed in `QUEST_PLAN_PEOPLE`. */
  who?: string;
  /** The zone, as linked or stated. Falls back to `who`'s zone when absent. */
  zone?: string;
  /** Part of the zone — a Plane of Sky island. */
  area?: string;
  /** Where, when the step states it. */
  loc?: { y: number; x: number; z?: number };
  /** Other quests it sends you to. */
  quests?: string[];
}

export interface PlanStage {
  title: string;
  /** What to say to start it, where the wiki gives one (the Plane of Sky tests). */
  trigger?: string;
  steps: PlanStep[];
}

export interface QuestPlan {
  quest: string;
  /** The wiki page the plan is read from — its "open on eqlwiki". */
  page: string;
  /** The era the wiki tags the quest with ("Classic", "Epics", "Kunark"). */
  era?: string;
  stages: PlanStage[];
}

/** Someone a plan step is with, and where their own page says they stand. */
export interface PlanPerson {
  name: string;
  zone?: string;
  loc?: { y: number; x: number; z?: number };
  note?: string;
}

export const QUEST_PLANS_SOURCE = { wiki: "https://eqlwiki.com", scrapedAt: "2026-10-16T07:37:06.084Z" };

export const QUEST_PLANS: QuestPlan[] = [
  {
    "quest": "Bard Epic Quest",
    "page": "Bard Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Maestro's Symphony Page 24 Top",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Talk to Konia Swiftfoot in Western Karana (guard tower #4), receive a Torch of Misty",
            "gives": [],
            "gets": [
              "Torch of Misty"
            ],
            "who": "Konia Swiftfoot",
            "zone": "Western Karana"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the torch to Fajio Knejo in Misty Thicket, receive Torch of Ro",
            "gives": [],
            "gets": [
              "Torch of Ro"
            ],
            "who": "Fajio Knejo",
            "zone": "Misty Thicket"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the torch to Andad Filla in South Ro, receive Torch of Rathe",
            "gives": [],
            "gets": [
              "Torch of Rathe"
            ],
            "who": "Andad Filla",
            "zone": "Southern Desert of Ro"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the torch to Misty Tekcihta in Lake Rathetear, receive ring Proof of Speed",
            "gives": [],
            "gets": [
              "Proof of Speed"
            ],
            "who": "Misty Tekcihta",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the ring to Konia Swiftfoot in W Karana, receive Maestro's Symphony Page 24 Top",
            "gives": [],
            "gets": [
              "Maestro's Symphony Page 24 Top"
            ],
            "who": "Konia Swiftfoot",
            "zone": "Western Karana"
          }
        ]
      },
      {
        "title": "Maestro's Symphony Page 24 Bottom",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Ask Baenar Swiftsong in South Karana, “what doll,” receive Solusek Mining Company Invoice",
            "gives": [],
            "gets": [
              "Solusek Mining Company Invoice"
            ],
            "who": "Baenar Swiftsong",
            "zone": "South Karana"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Take the invoice to Marfen Binkdirple in Solusek's Eye, receive Mechanical Doll",
            "gives": [],
            "gets": [
              "Mechanical Doll"
            ],
            "who": "Marfen Binkdirple",
            "zone": "Solusek's Eye"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the doll to Serra in Unrest, receive Note for Baenar",
            "gives": [],
            "gets": [
              "Note for Baenar"
            ],
            "who": "Serra",
            "zone": "Unrest"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the note to Baenar Swiftsong in South Karana, receive a Note to Maligar",
            "gives": [],
            "gets": [
              "Note to Maligar"
            ],
            "who": "Baenar Swiftsong",
            "zone": "South Karana"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the note to Maligar in Western Plains of Karana",
            "gives": [],
            "gets": [],
            "who": "Maligar",
            "zone": "Western Plains of Karana"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [45]Maligar's Enraged Doppleganger, loot his head",
            "gives": [],
            "gets": [],
            "who": "Maligar's Enraged Doppleganger"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Maligar's Head to Baenar Swiftsong, receive Mahlin's Mystical Bongos.",
            "gives": [
              "Maligar's Head"
            ],
            "gets": [
              "Mahlin's Mystical Bongos"
            ],
            "who": "Baenar Swiftsong"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Mahlin's Mystical Bongos to Konia Swiftfoot in Western Karana (guard tower #4), receive Maestro's Symphony Page 24 Bottom",
            "gives": [
              "Mahlin's Mystical Bongos"
            ],
            "gets": [
              "Maestro's Symphony Page 24 Bottom"
            ],
            "who": "Konia Swiftfoot",
            "zone": "Western Karana"
          }
        ]
      },
      {
        "title": "Maestro's Symphony Page 25",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [36]Blackwing in Rathe Mountains, loot Onyx Drake Gut",
            "gives": [],
            "gets": [
              "Onyx Drake Gut"
            ],
            "who": "Blackwing",
            "zone": "Rathe Mountains"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [51]Nezekezena or [47]Phurzikon in Burning Woods, loot Red Wurm Gut",
            "gives": [],
            "gets": [
              "Red Wurm Gut"
            ],
            "who": "Nezekezena",
            "zone": "Burning Woods"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [51]Eldrig the Old in Skyfire Mountains, loot Chromodrac Gut",
            "gives": [],
            "gets": [
              "Chromodrac Gut"
            ],
            "who": "Eldrig the Old",
            "zone": "Skyfire Mountains"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give all the guts to Kelkim Menkia in South Karana, receive Maestro's Symphony Page 25",
            "gives": [],
            "gets": [
              "Maestro's Symphony Page 25"
            ],
            "who": "Kelkim Menkia",
            "zone": "South Karana"
          }
        ]
      },
      {
        "title": "Mystical Lute Head",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "(OPTIONAL) Kill [45]Quag Maelstrom in Ocean of Tears, loot Alluring Horn.",
            "gives": [],
            "gets": [
              "Alluring Horn"
            ],
            "who": "Quag Maelstrom",
            "zone": "Ocean of Tears"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "(OPTIONAL) Give Alluring Horn to Vedico Windwhisper in Butcherblock Mountains, receive a Note to Forpar Fizfla.",
            "gives": [],
            "gets": [
              "Alluring Horn",
              "Note to Forpar Fizfla"
            ],
            "who": "Vedico Windwhisper",
            "zone": "Butcherblock Mountains"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "(OPTIONAL) Give Note to Forpar Fizfla to Forpar Fizfla in Steamfont Mountains.",
            "gives": [],
            "gets": [
              "Note to Forpar Fizfla"
            ],
            "who": "Forpar Fizfla",
            "zone": "Steamfont Mountains"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [53]Phinigel Autropos in Kedge Keep, loot Kedge Backbone",
            "gives": [],
            "gets": [
              "Kedge Backbone"
            ],
            "who": "Phinigel Autropos",
            "zone": "Kedge Keep"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill an [48]Amygdalan warrior in Plane of Fear, loot Amygdalan Tendril",
            "gives": [],
            "gets": [
              "Amygdalan Tendril"
            ],
            "who": "Amygdalan warrior",
            "zone": "Plane of Fear"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill [52]Drolvarg Warlord in Karnor's Castle, loot Petrified Werewolf Skull",
            "gives": [],
            "gets": [
              "Petrified Werewolf Skull"
            ],
            "who": "Drolvarg Warlord",
            "zone": "Karnor's Castle"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Say \"What Components\" to Forpar Fizfla in Steamfont Mountains, Receive Forpar's Note to Himself.",
            "gives": [],
            "gets": [
              "Forpar's Note to Himself"
            ],
            "who": "Forpar Fizfla",
            "zone": "Steamfont Mountains"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Forpar's Note to Himself, Kedge Backbone, Amygdalan Tendril, Petrified Werewolf Skull to Forpar and receive Mystical Lute Head",
            "gives": [
              "Forpar's Note to Himself",
              "Kedge Backbone",
              "Amygdalan Tendril",
              "Petrified Werewolf Skull"
            ],
            "gets": [
              "Mystical Lute Head"
            ],
            "who": "Forpar Fizfla"
          }
        ]
      },
      {
        "title": "Mystical Lute Body",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a red dragon (Lord Nagafen, Zordakalicus Ragefire, Talendor) or Nortlav the Scalekeeper and loot Red Dragon Scales",
            "gives": [],
            "gets": [
              "Red Dragon Scales"
            ],
            "who": "Nortlav the Scalekeeper"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a white dragon (Lady Vox, Gorenaire), loot White Dragon Scales",
            "gives": [],
            "gets": [
              "White Dragon Scales"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give 1 metal bits (smithed), Red Dragon Scales and White Dragon Scales to Forpar, receive Mystical Lute Body",
            "gives": [
              "metal bits",
              "Red Dragon Scales",
              "White Dragon Scales"
            ],
            "gets": [
              "Mystical Lute Body"
            ],
            "who": "Forpar Fizfla"
          }
        ]
      },
      {
        "title": "Undead Dragongut Strings",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give An Undead Bard your Mystical Lute Body. Kill An Undead Bard, upon death he spawns Trakanon (triggered), kill Trakanon (triggered) and loot Undead Dragongut Strings.",
            "gives": [
              "Mystical Lute Body",
              "Undead Dragongut Strings"
            ],
            "gets": [],
            "who": "An Undead Bard"
          }
        ]
      },
      {
        "title": "Mystical Lute",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Mystical Lute Head, Mystical Lute Body and Undead Dragongut Strings to Forpar, receive the Mystical Lute",
            "gives": [
              "Mystical Lute Head",
              "Mystical Lute Body",
              "Undead Dragongut Strings"
            ],
            "gets": [
              "Mystical Lute"
            ],
            "who": "Forpar Fizfla"
          }
        ]
      },
      {
        "title": "Singing Short Sword!",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Maestro's Symphony Page 24 top, Maestro's Symphony Page 24 bottom, Maestro's Symphony Page 25 and Mystical Lute to Baldric Slezaf, receive Singing Short Sword",
            "gives": [
              "Maestro's Symphony Page 24 top",
              "Maestro's Symphony Page 24 bottom",
              "Maestro's Symphony Page 25",
              "Mystical Lute"
            ],
            "gets": [
              "Singing Short Sword"
            ],
            "who": "Baldric Slezaf"
          }
        ]
      }
    ]
  },
  {
    "quest": "Cleric Epic Quest",
    "page": "Cleric Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Orb of Frozen Water",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Lord Bergurgle's Crown from Lord Bergurgle in Lake Rathetear",
            "gives": [],
            "gets": [
              "Lord Bergurgle's Crown"
            ],
            "who": "Lord Bergurgle",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Lord Bergurgle's Crown to Shmendrik Lavawalker in Lake Rathetear to spawn Natasha Whitewater nearby - receive Oil of Fennin Ro (Natasha Whitewater will despawn 5 minutes after spawning in Lake Rathetear unless engaged in combat and after turning in the Damaged Goblin Crown.)",
            "gives": [
              "Lord Bergurgle's Crown"
            ],
            "gets": [
              "Oil of Fennin Ro"
            ],
            "who": "Shmendrik Lavawalker",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 1,
            "kind": "kill",
            "text": "Kill Shmendrik Lavawalker to spawn A Spirit of Flame",
            "gives": [],
            "gets": [],
            "who": "Shmendrik Lavawalker"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Loot Damaged Goblin Crown from A Spirit of Flame (Do not let Natasha Whitewater get the last hit or the corpse will disappear)",
            "gives": [],
            "gets": [
              "Damaged Goblin Crown"
            ],
            "who": "A Spirit of Flame"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Damaged Goblin Crown to Natasha Whitewater -- receive Ornate Sea Shell (Natasha Whitewater will despawn 5 minutes after spawning in Lake Rathetear unless engaged in combat and after turning in the Damaged Goblin Crown.)",
            "gives": [
              "Damaged Goblin Crown"
            ],
            "gets": [
              "Ornate Sea Shell"
            ],
            "who": "Natasha Whitewater"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Ornate Sea Shell to Omat Vastsea in Timorous Deep -- receive Coral Statue of Tarew",
            "gives": [
              "Ornate Sea Shell"
            ],
            "gets": [
              "Coral Statue of Tarew"
            ],
            "who": "Omat Vastsea",
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Coral Statue of Tarew to a Seeker in The Temple of Solusek Ro causing them to become A Plasmatic Priest",
            "gives": [
              "Coral Statue of Tarew"
            ],
            "gets": [],
            "who": "A Seeker",
            "zone": "The Temple of Solusek Ro"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill A Plasmatic Priest in The Temple of Solusek Ro and loot Blood Soaked Plasmatic Priest Robe",
            "gives": [],
            "gets": [
              "Blood Soaked Plasmatic Priest Robe"
            ],
            "who": "A Plasmatic Priest",
            "zone": "The Temple of Solusek Ro"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Blood Soaked Plasmatic Priest Robe to Omat Vastsea –- receive Orb of Frozen Water (This spawns Natasha inside the hut, It is suggested you wait to turn in until you have Lord Gimblox's Signet Ring)",
            "gives": [
              "Blood Soaked Plasmatic Priest Robe"
            ],
            "gets": [
              "Orb of Frozen Water"
            ],
            "who": "Omat Vastsea"
          }
        ]
      },
      {
        "title": "Orb of Clear Water",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Lord Gimblox's Signet Ring from Lord Gimblox in Solusek's Eye",
            "gives": [],
            "gets": [
              "Lord Gimblox's Signet Ring"
            ],
            "who": "Lord Gimblox",
            "zone": "Solusek's Eye"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Lord Gimblox's Signet Ring to Natasha Whitewater in Timorous Deep –- receive Ornate Sea Shell(v2) (This despawns Natasha)",
            "gives": [
              "Lord Gimblox's Signet Ring"
            ],
            "gets": [
              "Ornate Sea Shell"
            ],
            "who": "Natasha Whitewater",
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Ornate Sea Shell(v2) to Naxot Deepwater in Burning Woods - receive Message to Natasha (This spawns Ixiblat Fer)",
            "gives": [
              "Ornate Sea Shell"
            ],
            "gets": [
              "Message to Natasha"
            ],
            "who": "Naxot Deepwater",
            "zone": "Burning Woods"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Loot Sceptre of Ixiblat Fer from Ixiblat Fer in Burning Woods",
            "gives": [],
            "gets": [
              "Sceptre of Ixiblat Fer"
            ],
            "who": "Ixiblat Fer",
            "zone": "Burning Woods"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Singed Scroll from Overking Bathezid in Chardok",
            "gives": [],
            "gets": [
              "Singed Scroll"
            ],
            "who": "Overking Bathezid",
            "zone": "Chardok"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Sceptre of Ixiblat Fer and Singed Scroll to Omat Vastsea -– receive Orb of Clear Water (This spawns Natasha inside the hut)",
            "gives": [
              "Sceptre of Ixiblat Fer",
              "Singed Scroll"
            ],
            "gets": [
              "Orb of Clear Water"
            ],
            "who": "Omat Vastsea"
          }
        ]
      },
      {
        "title": "Orb of Vapor (Classic)",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Message to Natasha (Received when spawning Ixiblat Fer) to Natasha Whitewater in Timorous Deep –- receive Shimmering Pearl* (This does not despawn Natasha)",
            "gives": [
              "Message to Natasha"
            ],
            "gets": [
              "Shimmering Pearl"
            ],
            "who": "Natasha Whitewater",
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Shimmering Pearl to Zordak Ragefire in Nagafen's Lair -- causes him to repop as Zordakalicus Ragefire and attack you - kill and loot Heart of Zordak Ragefire",
            "gives": [
              "Shimmering Pearl"
            ],
            "gets": [
              "Heart of Zordak Ragefire"
            ],
            "who": "Zordak Ragefire",
            "zone": "Nagafen's Lair"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Heart of Zordak Ragefire to Omat Vastsea – receive Orb of Vapor (Do NOT do this until ready to turn all orbs into Jhassad, as this step spawns Jhassad for the final turn in)",
            "gives": [
              "Heart of Zordak Ragefire"
            ],
            "gets": [],
            "who": "Omat Vastsea"
          }
        ]
      },
      {
        "title": "Water Sprinkler of Nem Ankh",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give all three orbs (Frozen Water / Clear Water / Vapor) to Jhassad Oceanson in Timorous Deep -- receive Orb of Triumvirate (This spawns the Avatar of Water in the lake)",
            "gives": [],
            "gets": [],
            "who": "Jhassad Oceanson",
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Orb of Triumvirate to Avatar of Water –- receive Water Sprinkler of Nem Ankh",
            "gives": [],
            "gets": [
              "Water Sprinkler of Nem Ankh"
            ],
            "who": "Avatar of Water"
          }
        ]
      }
    ]
  },
  {
    "quest": "Druid Epic Quest",
    "page": "Druid Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Druid Epic Quest",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Shiny Tin Bowl ( Warning : You must be ready to face Dark Elfs, by starting East Karana part, Nuien trigger Teloa, who trigger Dark Elfs )",
            "gives": [],
            "gets": [
              "Shiny Tin Bowl"
            ]
          },
          {
            "depth": 2,
            "kind": "talk",
            "text": "Speak with Telin Darkforest in Burning Wood and say \"I will take action\" to receive a Worn note.",
            "gives": [],
            "gets": [
              "Worn note"
            ],
            "who": "Telin Darkforest",
            "zone": "Burning Wood"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Spawn Faelin Bloodbriar in Greater Faydark and give her the Worn Note to receive Faelin`s Ring.",
            "gives": [],
            "gets": [
              "Faelin`s Ring"
            ],
            "who": "Faelin Bloodbriar",
            "zone": "Greater Faydark"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Giz X`Tin in Kithicor Forest Faelin`s Ring to receive a Dark Metal Coin.",
            "gives": [],
            "gets": [
              "Dark Metal Coin"
            ],
            "who": "Giz X`Tin",
            "zone": "Kithicor Forest"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Telin Darkforest in Burning Wood the Dark Metal Coin to receive Worn Dark Metal Coin.",
            "gives": [],
            "gets": [
              "Worn Dark Metal Coin"
            ],
            "who": "Telin Darkforest",
            "zone": "Burning Wood"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Althele in East Karana the Worn Dark Metal Coin to receive Braided Grass Amulet.",
            "gives": [],
            "gets": [
              "Braided Grass Amulet"
            ],
            "who": "Althele",
            "zone": "East Karana"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Sionae (-2300, -930 in East Karana) the Braided Grass Amulet. (Amulet is returned)",
            "gives": [],
            "gets": [],
            "who": "Sionae",
            "loc": {
              "y": -2300,
              "x": -930
            }
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Nuien (-3650, 300 in East Karana) the Braided Grass Amulet. (Amulet is returned)",
            "gives": [],
            "gets": [],
            "who": "Nuien",
            "loc": {
              "y": -3650,
              "x": 300
            }
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "CAUTION, THIS STEP SPAWNS AN ENEMY YOU MUST INTERCEPT: Give Teloa (-3800, -2860 in East Karana) the Braided Grass Amulet, spawning the Dark Elf Corruptor and two Dark Elf Reaver at (-700, -1450) Note: They run really fast when spawned, almost SoW fast",
            "gives": [],
            "gets": [],
            "who": "Teloa",
            "loc": {
              "y": -3800,
              "x": -2860
            }
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill the Dark Elf Corruptor, loot Fleshbound Tome.",
            "gives": [],
            "gets": [
              "Fleshbound Tome"
            ],
            "who": "Dark Elf Corruptor"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Althele in East Karana the Fleshbound Tome to receive Earth Stained Note.",
            "gives": [],
            "gets": [
              "Earth Stained Note"
            ],
            "who": "Althele",
            "zone": "East Karana"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Ella Foodcrafter in Misty Thicket the Earth Stained Note to receive a Shiny Tin Bowl.",
            "gives": [],
            "gets": [
              "Shiny Tin Bowl"
            ],
            "who": "Ella Foodcrafter",
            "zone": "Misty Thicket"
          }
        ]
      },
      {
        "title": "Forage the Hardened Mixture",
        "steps": [
          {
            "depth": 2,
            "kind": "other",
            "text": "Forage the following four items:",
            "gives": [],
            "gets": []
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Chilled Tundra Root from Everfrost.",
            "gives": [],
            "gets": [
              "Chilled Tundra Root"
            ],
            "zone": "Everfrost"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Ripened Heartfruit from Greater Faydark.",
            "gives": [],
            "gets": [
              "Ripened Heartfruit"
            ],
            "zone": "Greater Faydark"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Speckled Molded Mushroom from Innothule Swamp.",
            "gives": [],
            "gets": [
              "Speckled Molded Mushroom"
            ],
            "zone": "Innothule Swamp"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Sweetened Mudroot from Misty Thicket.",
            "gives": [],
            "gets": [
              "Sweetened Mudroot"
            ],
            "zone": "Misty Thicket"
          },
          {
            "depth": 2,
            "kind": "combine",
            "text": "Combine all four items in the Shiny Tin Bowl to make a Hardened Mixture.",
            "gives": [
              "Shiny Tin Bowl"
            ],
            "gets": [
              "Hardened Mixture"
            ]
          }
        ]
      },
      {
        "title": "Make a Runecrested Bowl",
        "steps": [
          {
            "depth": 2,
            "kind": "get",
            "text": "Acquire an Ancient Pattern",
            "gives": [],
            "gets": [
              "Ancient Pattern"
            ]
          },
          {
            "depth": 3,
            "kind": "talk",
            "text": "Speak with Alrik Farsight in Timorous Deep and say \"I will take the artifact\" to receive a Crushed Pot.",
            "gives": [],
            "gets": [
              "Crushed Pot"
            ],
            "who": "Alrik Farsight",
            "zone": "Timorous Deep"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Farios Elianos in Felwithe South the Crushed Pot to receive a Grocery List.",
            "gives": [],
            "gets": [
              "Grocery List"
            ],
            "who": "Farios Elianos",
            "zone": "Felwithe"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Merchant Nora in Northern Felwithe the Grocery List to receive a Bag of Provisions.",
            "gives": [],
            "gets": [
              "Bag of Provisions"
            ],
            "who": "Merchant Nora",
            "zone": "Northern Felwithe"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Farios Elianos the Bag of Provisions to receive a Receipt.",
            "gives": [],
            "gets": [
              "Receipt"
            ],
            "who": "Farios Elianos"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Alrik Farsight in Timorous Deep the Receipt to receive an Ancient Pattern.",
            "gives": [],
            "gets": [
              "Ancient Pattern"
            ],
            "who": "Alrik Farsight",
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Acquire some Platinum Speckled Powder",
            "gives": [],
            "gets": [
              "Platinum Speckled Powder"
            ]
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Forage a Rose of Firiona from Firiona Vie.",
            "gives": [],
            "gets": [
              "Rose of Firiona"
            ],
            "zone": "Firiona Vie"
          },
          {
            "depth": 3,
            "kind": "talk",
            "text": "Hail Merdan Fleetfoot in Surefall Glade, ask him \"Who is Niera?\", then hand him the Rose of Firiona to receive a Wood Painting.",
            "gives": [],
            "gets": [
              "Wood Painting"
            ],
            "who": "Merdan Fleetfoot",
            "zone": "Surefall Glade"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give a human skeleton in Frontier Mountains (behind the giant fort) the Wood Painting to receive a Silver Chained Locket.",
            "gives": [],
            "gets": [
              "Silver Chained Locket"
            ],
            "who": "a human skeleton",
            "zone": "Frontier Mountains"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Niera Farbreeze in Surefall Glade the Silver Chained Locket to receive Platinum Speckled Powder.",
            "gives": [],
            "gets": [
              "Platinum Speckled Powder"
            ],
            "who": "Niera Farbreeze",
            "zone": "Surefall Glade"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Acquire some Enchanted Clay",
            "gives": [],
            "gets": [
              "Enchanted Clay"
            ]
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill a black reaver in City of Mist, loot a Jade Reaver.",
            "gives": [],
            "gets": [
              "Jade Reaver"
            ],
            "who": "a black reaver",
            "zone": "City of Mist"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Kinlo Strongarm in North Kaladim the Jade Reaver to receive Enchanted Clay.",
            "gives": [],
            "gets": [
              "Enchanted Clay"
            ],
            "who": "Kinlo Strongarm"
          },
          {
            "depth": 2,
            "kind": "combine",
            "text": "Combine the Ancient Pattern, Platinum Speckled Powder, and Enchanted Clay in a Pottery Wheel to create a Runecrested Bowl.",
            "gives": [
              "Ancient Pattern",
              "Platinum Speckled Powder",
              "Enchanted Clay"
            ],
            "gets": [
              "Runecrested Bowl"
            ]
          }
        ]
      },
      {
        "title": "Trade Stones for an Elaborate Scimitar",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Hardened Mixture and Runecrested Bowl to Ella Foodcrafter in Misty Thicket to receive a Softly Glowing Stone.",
            "gives": [
              "Hardened Mixture",
              "Runecrested Bowl"
            ],
            "gets": [
              "Softly Glowing Stone"
            ],
            "who": "Ella Foodcrafter",
            "zone": "Misty Thicket"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Create a Summoned: Firefly Globe (level 1 Druid spell, NO RENT, only castable at night: 7p - 4a).",
            "gives": [],
            "gets": [
              "Summoned: Firefly Globe"
            ]
          },
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase Scroll of Resurrection (level 49 Cleric spell).",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Venril Sathir Remains in Karnor's Castle the Summoned: Firefly Globe to spawn Spirit of Venril Sathir.",
            "gives": [],
            "gets": [],
            "who": "Venril Sathir Remains",
            "zone": "Karnor's Castle"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Spirit of Venril Sathir in Karnor's Castle the Spell: Resurrection to spawn Venril Sathir.",
            "gives": [],
            "gets": [],
            "who": "Spirit of Venril Sathir",
            "zone": "Karnor's Castle"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Slay Venril Sathir in Karnor's Castle and loot a Pulsing Green Stone.",
            "gives": [],
            "gets": [
              "Pulsing Green Stone"
            ],
            "who": "Venril Sathir"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Foloal Stormforest in Firiona Vie the Pulsing Green Stone and Softly Glowing Stone to receive a Warmly Glowing Stone.",
            "gives": [],
            "gets": [
              "Warmly Glowing Stone"
            ],
            "who": "Foloal Stormforest",
            "zone": "Firiona Vie"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Ella Foodcrafter in Misty Thicket the Warmly Glowing Stone to receive an Elaborate Scimitar.",
            "gives": [],
            "gets": [
              "Elaborate Scimitar"
            ],
            "who": "Ella Foodcrafter",
            "zone": "Misty Thicket"
          }
        ]
      },
      {
        "title": "Cleanse Spirits",
        "steps": [
          {
            "depth": 2,
            "kind": "other",
            "text": "Cleanse the Spirits of Antonica",
            "gives": [],
            "gets": []
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill corrupted wooly mammoth (level 30) in Everfrost Peaks, loot a Chunk of Tundra.",
            "gives": [],
            "gets": [
              "Chunk of Tundra"
            ],
            "who": "corrupted wooly mammoth",
            "zone": "Everfrost Peaks"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill corrupted shaman (level 40) in Lake Rathetear, loot Clean Lakewater.",
            "gives": [],
            "gets": [
              "Clean Lakewater"
            ],
            "who": "corrupted shaman",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill corrupted hill giant (level 40) in Rathe Mountains, loot an Ancient Rock.",
            "gives": [],
            "gets": [
              "Ancient Rock"
            ],
            "who": "corrupted hill giant",
            "zone": "Rathe Mountains"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Withered treant in Northern Karana the Chunk of Tundra, Clean Lakewater and Ancient Rock to receive a Warm Pulsing Treant Heart.",
            "gives": [
              "Chunk of Tundra",
              "Clean Lakewater",
              "Ancient Rock"
            ],
            "gets": [
              "Warm Pulsing Treant Heart"
            ],
            "who": "Withered treant",
            "zone": "Northern Karana"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Yeka Ias in Southern Karana the Warm Pulsing Treant Heart to receive Cleansed Spirit of Antonica.",
            "gives": [],
            "gets": [
              "Cleansed Spirit of Antonica"
            ],
            "who": "Yeka Ias",
            "zone": "Southern Karana"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Cleanse the Spirits of Faydwer",
            "gives": [],
            "gets": []
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Corrupted Seahorse (level 53) in Kedge Keep, loot Kedge Cave Crystals.",
            "gives": [],
            "gets": [
              "Kedge Cave Crystals"
            ],
            "who": "Corrupted Seahorse",
            "zone": "Kedge Keep"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Corrupted seafury cyclops (level 52) in Ocean of Tears, loot Ocean of Tears Seavines.",
            "gives": [],
            "gets": [
              "Ocean of Tears Seavines"
            ],
            "who": "Corrupted seafury cyclops",
            "zone": "Ocean of Tears"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Corrupted brownie (level 51) in Lesser Faydark, loot Green Heartwood Branch.",
            "gives": [],
            "gets": [
              "Green Heartwood Branch"
            ],
            "who": "Corrupted brownie",
            "zone": "Lesser Faydark"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Pained Unicorn in Lesser Faydark the Kedge Cave Crystals, Ocean of Tears Seavines and Green Heartwood Branch to receive Gleaming Unicorn Horn.",
            "gives": [
              "Kedge Cave Crystals",
              "Ocean of Tears Seavines",
              "Green Heartwood Branch"
            ],
            "gets": [
              "Gleaming Unicorn Horn"
            ],
            "who": "Pained Unicorn",
            "zone": "Lesser Faydark"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Silox Azrix in Ak'Anon the Gleaming Unicorn Horn to receieve the Cleansed Spirit of Faydwer.",
            "gives": [
              "Cleansed Spirit of Faydwer"
            ],
            "gets": [],
            "who": "Silox Azrix",
            "zone": "Ak'Anon"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Cleanse the Spirits of Kunark",
            "gives": [],
            "gets": []
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Ulump Pujluk (level 55) in Swamp of No Hope, loot Froglok Essence.",
            "gives": [],
            "gets": [
              "Froglok Essence"
            ],
            "who": "Ulump Pujluk",
            "zone": "Swamp of No Hope"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Corrupted Gorilla (level 47) in Emerald Jungle, loot Green Tree Bark.",
            "gives": [],
            "gets": [
              "Green Tree Bark"
            ],
            "who": "Corrupted Gorilla",
            "zone": "Emerald Jungle"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill the Corrupted barracuda (level 46) in Lake of Ill Omen and loot the Pure Lakewater.",
            "gives": [],
            "gets": [
              "Pure Lakewater"
            ],
            "who": "Corrupted barracuda",
            "zone": "Lake of Ill Omen"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Dolgin Codslayer in Timorous Deep the Froglok Essence (he will hand it back and despawn - 14h respawn) to spawn Faydedar.",
            "gives": [],
            "gets": [],
            "who": "Dolgin Codslayer",
            "zone": "Timorous Deep"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Faydedar in Timorous Deep, loot Pod of Seawater.",
            "gives": [],
            "gets": [
              "Pod of Seawater"
            ],
            "who": "Faydedar",
            "zone": "Timorous Deep"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Give Nekexin Virulence in The Overthere the Froglok Essence, Pod of Seawater, Green Tree Bark and Pure Lakewater to receive Cleansed Spirit of Kunark.",
            "gives": [
              "Froglok Essence",
              "Pod of Seawater",
              "Green Tree Bark",
              "Pure Lakewater"
            ],
            "gets": [
              "Cleansed Spirit of Kunark"
            ],
            "who": "Nekexin Virulence",
            "zone": "The Overthere"
          }
        ]
      },
      {
        "title": "Acquire a Nature Walkers Scimitar!",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Xanuusus in North Karana the Elaborate Scimitar and three cleansed spirits to receive the Nature Walkers Scimitar.",
            "gives": [],
            "gets": [
              "Nature Walkers Scimitar"
            ],
            "who": "Xanuusus",
            "zone": "North Karana"
          }
        ]
      }
    ]
  },
  {
    "quest": "Enchanter Epic Quest",
    "page": "Enchanter Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Jeb's Seal",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Hail Stofo Olan in Erudin (Must be level 50)",
            "gives": [],
            "gets": [],
            "who": "Stofo Olan",
            "zone": "Erudin"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Ink of the Dark",
            "gives": [],
            "gets": [
              "Ink of the Dark"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Get Empty Ink Vial from Reania Jukle in Qeynos Catacombs",
            "gives": [],
            "gets": [
              "Empty Ink Vial"
            ],
            "who": "Reania Jukle",
            "zone": "Qeynos Catacombs"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Charm the a ghoul scribe in Lower Guk. Give him the Empty Ink Vial to get the Ink of the Dark.",
            "gives": [],
            "gets": [
              "Empty Ink Vial",
              "Ink of the Dark"
            ],
            "who": "a ghoul scribe",
            "zone": "Lower Guk"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Mechanical Pen",
            "gives": [],
            "gets": [
              "Mechanical Pen"
            ]
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill the ghoul arch magus in Lower Guk and loot the Shining Metallic Robes.",
            "gives": [],
            "gets": [
              "Shining Metallic Robes"
            ],
            "who": "the ghoul arch magus",
            "zone": "Lower Guk"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Shining Metallic Robes to Rilgor Plegnog in Ak'Anon to get the Mechanical Pen.",
            "gives": [
              "Shining Metallic Robes"
            ],
            "gets": [
              "Mechanical Pen"
            ],
            "who": "Rilgor Plegnog",
            "zone": "Ak'Anon"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "White Paper",
            "gives": [],
            "gets": [
              "White Paper"
            ]
          },
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase a Quill and a Piece of Parchment.",
            "gives": [],
            "gets": [
              "Quill",
              "Piece of Parchment"
            ]
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Quill and the Piece of Parchment to Chrislin Baker in Western Karana to spawn Thrackin Griften. Kill Thrackin Griften and loot a White Paper.",
            "gives": [
              "Quill",
              "Piece of Parchment",
              "White Paper"
            ],
            "gets": [],
            "who": "Chrislin Baker",
            "zone": "Western Karana"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Ink of the Dark, the Mechanical Pen, and the White Paper to Stofo Olan in Erudin to get a Copy of Notes.",
            "gives": [
              "Ink of the Dark",
              "Mechanical Pen",
              "White Paper"
            ],
            "gets": [
              "Copy of Notes"
            ],
            "who": "Stofo Olan",
            "zone": "Erudin"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Copy of Notes to Jeb Lumsed (a sarnak imitator) in Burning Woods to get Jeb's Seal.",
            "gives": [
              "Copy of Notes"
            ],
            "gets": [
              "Jeb's Seal"
            ],
            "zone": "Burning Woods"
          }
        ]
      },
      {
        "title": "1st Piece of Staff -- Test of Illusion",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Vessel Drozlin in Cabilis East and loot the Xolion Rod.",
            "gives": [],
            "gets": [
              "Xolion Rod"
            ],
            "who": "Vessel Drozlin",
            "zone": "Cabilis"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Verina Tomb in Neriak and loot Innoruuk's Word.",
            "gives": [],
            "gets": [
              "Innoruuk's Word"
            ],
            "who": "Verina Tomb",
            "zone": "Neriak"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Obtain the Chalice of Kings.",
            "gives": [],
            "gets": [
              "Chalice of Kings"
            ]
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Prince Selrach Di'zok in Chardok and loot the Head of a Prince.",
            "gives": [],
            "gets": [
              "Head of a Prince"
            ],
            "who": "Prince Selrach Di'zok",
            "zone": "Chardok"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Head of a Prince to Joren Nobleheart in Felwithe to get the Chalice of Kings.",
            "gives": [
              "Head of a Prince"
            ],
            "gets": [
              "Chalice of Kings"
            ],
            "who": "Joren Nobleheart",
            "zone": "Felwithe"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Obtain Snow Blossoms in Oggok.",
            "gives": [],
            "gets": [
              "Snow Blossoms"
            ],
            "zone": "Oggok"
          },
          {
            "depth": 2,
            "kind": "ground",
            "text": "Pick up Large Muddy Sandals.",
            "gives": [],
            "gets": [
              "Large Muddy Sandals"
            ]
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Large Muddy Sandals to Bozlum Blossom to get Scribbled Parchment.",
            "gives": [
              "Large Muddy Sandals"
            ],
            "gets": [
              "Scribbled Parchment"
            ],
            "who": "Bozlum Blossom"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Scribbled Parchment to Brokk Boxtripper to get a Gift to Bozlum.",
            "gives": [
              "Scribbled Parchment"
            ],
            "gets": [
              "Gift to Bozlum"
            ],
            "who": "Brokk Boxtripper"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the gift to Bozlum Blossom to get Snow Blossoms.",
            "gives": [],
            "gets": [
              "Snow Blossoms"
            ],
            "who": "Bozlum Blossom"
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the Chalice of Kings, Xolion Rod, Snow Blossoms and Innoruuk's Word in an Enchanters Sack.",
            "gives": [
              "Chalice of Kings",
              "Xolion Rod",
              "Snow Blossoms",
              "Innoruuk's Word"
            ],
            "gets": [
              "Enchanters Sack"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the combined sack to Modani Qu`Loni in The Overthere to get the 1st Piece of Staff.",
            "gives": [],
            "gets": [
              "1st Piece of Staff"
            ],
            "who": "Modani Qu`Loni",
            "zone": "The Overthere"
          }
        ]
      },
      {
        "title": "2nd Piece of Staff -- Test of Enlightenment",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Cazel in Oasis to get a Spoon",
            "gives": [],
            "gets": [
              "Spoon"
            ],
            "who": "Cazel"
          },
          {
            "depth": 1,
            "kind": "ground",
            "text": "Pick up the The One Key in the Overthere.",
            "gives": [],
            "gets": [
              "The One Key"
            ],
            "zone": "Overthere"
          },
          {
            "depth": 1,
            "kind": "ground",
            "text": "Pick up the Lost Scroll in Dalnir.",
            "gives": [],
            "gets": [
              "Lost Scroll"
            ],
            "zone": "Dalnir"
          },
          {
            "depth": 1,
            "kind": "ground",
            "text": "Pick up the Book of Charm and Sacrifice in Plane of Sky.",
            "gives": [],
            "gets": [
              "Charm and Sacrifice"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the Spoon, the One Key, the Lost Scroll and the Book of Charm and Sacrifice in an Enchanters Sack.",
            "gives": [
              "Spoon",
              "the One Key",
              "Lost Scroll",
              "Charm and Sacrifice"
            ],
            "gets": [
              "Enchanters Sack"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the combined sack to Mizzle Gepple (Clockwork VIIX) in Ak'Anon to get the 2nd Piece of Staff.",
            "gives": [],
            "gets": [
              "2nd Piece of Staff"
            ],
            "who": "Mizzle Gepple",
            "zone": "Ak'Anon"
          }
        ]
      },
      {
        "title": "3rd Piece of Staff -- Test of Charm",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "Obtain the four dull gems from Nadia Starfeast in Firiona Vie.",
            "gives": [],
            "gets": [],
            "who": "Nadia Starfeast",
            "zone": "Firiona Vie"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Charm a Spectral librarian in Kaesora. Give him the Dull Diamond to get the Enchanted Diamond.",
            "gives": [],
            "gets": [
              "Dull Diamond",
              "Enchanted Diamond"
            ],
            "who": "Spectral librarian",
            "zone": "Kaesora"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Upon turn in an aggro Enraged spectral librarian will spawn. It is strongly recommended not to kill this see page for details.",
            "gives": [],
            "gets": [],
            "who": "Enraged spectral librarian"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Charm Felia Goldenwing in Skyfire. Give her the Dull Sapphire to get the Enchanted Sapphire.",
            "gives": [],
            "gets": [
              "Dull Sapphire",
              "Enchanted Sapphire"
            ],
            "who": "Felia Goldenwing",
            "zone": "Skyfire"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Charm the Wraith of Jaxion in the City of Mist. Give him the Dull Ruby to get the Enchanted Ruby.",
            "gives": [],
            "gets": [
              "Dull Ruby",
              "Enchanted Ruby"
            ],
            "who": "Wraith of Jaxion",
            "zone": "City of Mist"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Charm Impaler Tzilug in the Overthere. Give him the Dull Emerald to get the Enchanted Emerald.",
            "gives": [],
            "gets": [
              "Dull Emerald",
              "Enchanted Emerald"
            ],
            "who": "Impaler Tzilug",
            "zone": "Overthere"
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the Enchanted Diamond, Enchanted Sapphire, Enchanted Ruby and Enchanted Emerald in an Enchanters Sack.",
            "gives": [
              "Enchanted Diamond",
              "Enchanted Sapphire",
              "Enchanted Ruby",
              "Enchanted Emerald"
            ],
            "gets": [
              "Enchanters Sack"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the combined sack to Nadia Starfeast in Firiona Vie to get the 3rd Piece of Staff.",
            "gives": [],
            "gets": [
              "3rd Piece of Staff"
            ],
            "who": "Nadia Starfeast",
            "zone": "Firiona Vie"
          }
        ]
      },
      {
        "title": "4th Piece of Staff -- Test of the Phantasm",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill the Wraith of a Shissir in the Plane of Fear and loot Head of the Serpent.",
            "gives": [],
            "gets": [
              "Head of the Serpent"
            ],
            "who": "Wraith of a Shissir",
            "zone": "Plane of Fear"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill the Ghost of Kindle in The Hole and loot the Essence of a Ghost.",
            "gives": [],
            "gets": [
              "Essence of a Ghost"
            ],
            "who": "the Ghost of Kindle",
            "zone": "The Hole"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a forsaken revenant in the Plane of Hate and loot the Essence of a Vampire.",
            "gives": [],
            "gets": [
              "Essence of a Vampire"
            ],
            "who": "a forsaken revenant",
            "zone": "Plane of Hate"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill The Tangrin in the Field of Bone and loot the Sands of the Mystics.",
            "gives": [],
            "gets": [
              "Sands of the Mystics"
            ],
            "who": "The Tangrin",
            "zone": "Field of Bone"
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the Head of the Serpent, Essence of a Ghost, Essence of a Vampire and Sands of the Mystics in an Enchanters Sack.",
            "gives": [
              "Head of the Serpent",
              "Essence of a Ghost",
              "Essence of a Vampire",
              "Sands of the Mystics"
            ],
            "gets": [
              "Enchanters Sack"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the combined sack to Polzin Mrid in The Hole to get the 4th Piece of Staff.",
            "gives": [],
            "gets": [
              "4th Piece of Staff"
            ],
            "who": "Polzin Mrid",
            "zone": "The Hole"
          }
        ]
      },
      {
        "title": "Staff of the Serpent",
        "steps": [
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the four pieces of staff in an Enchanters Sack to make a Bundle of Staves.",
            "gives": [
              "Enchanters Sack"
            ],
            "gets": [
              "Bundle of Staves"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Bundle of Staves to Jeb Lumsed (a sarnak imitator) in Burning Woods to get the Staff of the Serpent!",
            "gives": [
              "Bundle of Staves"
            ],
            "gets": [
              "Staff of the Serpent"
            ],
            "zone": "Burning Woods"
          }
        ]
      }
    ]
  },
  {
    "quest": "Magician Epic Quest",
    "page": "Magician Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "The Beginning (Optional)",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Go find Rykas in Lake Rathetear. Receive Token of Mastery.",
            "gives": [],
            "gets": [
              "Token of Mastery"
            ],
            "who": "Rykas",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Take the Token to Jahsohn Aksot in West Commonlands.",
            "gives": [],
            "gets": [],
            "who": "Jahsohn Aksot",
            "zone": "West Commonlands"
          }
        ]
      },
      {
        "title": "Words of Magi'Kot",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill an enraged dread wolf in Kithicor Forest. Loot Torn Page of Magi`kot pg. 1.",
            "gives": [],
            "gets": [
              "Torn Page of Magi`kot pg. 1"
            ],
            "who": "enraged dread wolf"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Tentacle Terrors in the Estate of Unrest. Loot Torn Page of Magi`kot pg. 2.",
            "gives": [],
            "gets": [
              "Torn Page of Magi`kot pg. 2"
            ],
            "who": "a tentacle terror (Unrest)",
            "zone": "Unrest"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a bloodthirsty ghoul in Lower Guk. Loot Torn Page of Magi`kot pg. 3.",
            "gives": [],
            "gets": [
              "Torn Page of Magi`kot pg. 3"
            ],
            "who": "a bloodthirsty ghoul",
            "zone": "Lower Guk"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Take them to Jahsohn Aksotin West Commonlands. Receive Words of Magi`kot.",
            "gives": [],
            "gets": [
              "Words of Magi`kot"
            ],
            "who": "Jahsohn Aksot",
            "zone": "West Commonlands"
          }
        ]
      },
      {
        "title": "Power of the Elements",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a gypsy dancer in Mistmoore. Loot the Power of Wind.",
            "gives": [],
            "gets": [
              "Power of Wind"
            ],
            "who": "a gypsy dancer",
            "zone": "Mistmoore"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Lava elemental or Blazing Elemental in Solusek's Eye. Loot the Power of Fire.",
            "gives": [],
            "gets": [
              "Power of Fire"
            ],
            "who": "Lava elemental",
            "zone": "Solusek's Eye"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill famished ravener/Hungered Ravener/Gorged Ravener in Kaesora. Loot the Power of Water.",
            "gives": [],
            "gets": [
              "Power of Water"
            ],
            "who": "famished ravener",
            "zone": "Kaesora"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill A Fairy Guard/a faerie guard in Lesser Faydark. Loot Power of Earth.",
            "gives": [],
            "gets": [
              "Power of Earth"
            ],
            "who": "A Fairy Guard",
            "zone": "Lesser Faydark"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give these to Walnan in the Butcherblock Mountains. (You can MQ this step). Receive the Power of the Elements.",
            "gives": [],
            "gets": [
              "Power of the Elements"
            ],
            "who": "Walnan",
            "zone": "Butcherblock Mountains"
          }
        ]
      },
      {
        "title": "Words of Mastery",
        "steps": [
          {
            "depth": 1,
            "kind": "kill",
            "text": "Kill A Magician and A Goblin Magician in Najena or an alligator in Cazic Thule until you have the:",
            "gives": [],
            "gets": [],
            "who": "A Magician",
            "zone": "Najena"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Torn Page of Mastery Earth",
            "gives": [],
            "gets": [
              "Torn Page of Mastery Earth"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Torn Page of Mastery Fire",
            "gives": [],
            "gets": [
              "Torn Page of Mastery Fire"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Torn Page of Mastery Water",
            "gives": [],
            "gets": [
              "Torn Page of Mastery Water"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Torn Page of Mastery Wind.",
            "gives": [],
            "gets": [
              "Torn Page of Mastery Wind"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the torn pages to Akksstaff in Najena. Receive the Words of Mastery.",
            "gives": [],
            "gets": [
              "Words of Mastery"
            ],
            "who": "Akksstaff"
          }
        ]
      },
      {
        "title": "Power of the Orb",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Go back to Rykas in Lake Rathetear. Give him the Words of Magi`kot, the Power of the Elements, and the Words of Mastery. Receive the Power of the Orb.",
            "gives": [],
            "gets": [
              "Words of Magi`kot",
              "Power of the Elements",
              "Words of Mastery",
              "Power of the Orb"
            ],
            "who": "Rykas"
          }
        ]
      },
      {
        "title": "Element of Fire",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Neh'Ashiir in the City of Mist. Loot the Torch of the Elements.",
            "gives": [],
            "gets": [
              "Torch of the Elements"
            ],
            "who": "Neh'Ashiir"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill (in order of difficulty) Gylton, Phurzikon, or Nezekezena in the Burning Woods until one drops a Burning Embers.",
            "gives": [],
            "gets": [
              "Burning Embers"
            ],
            "who": "Gylton"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Undertow in Kedge Keep. Loot the Blazing Wand.",
            "gives": [],
            "gets": [
              "Blazing Wand"
            ],
            "who": "Undertow"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Take Power of the Orb and these items to Jennus Lyklobar in Skyfire Mountains. Receive the Element of Fire.",
            "gives": [],
            "gets": [
              "Power of the Orb",
              "Element of Fire"
            ],
            "who": "Jennus Lyklobar",
            "zone": "Skyfire Mountains"
          }
        ]
      },
      {
        "title": "Element of Earth",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Magi P`Tasa in the Plane of Hate. Loot the Staff of Elemental Mastery: Earth.",
            "gives": [],
            "gets": [
              "Staff of Elemental Mastery: Earth"
            ],
            "who": "Magi P`Tasa",
            "zone": "Plane of Hate"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Slixin Klex in the Burning Wood. Loot Dirt of Underfoot.",
            "gives": [],
            "gets": [
              "Dirt of Underfoot"
            ],
            "who": "Slixin Klex",
            "zone": "Burning Wood"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Quest for Shovel of Ponz.",
            "gives": [],
            "gets": [
              "Shovel of Ponz"
            ]
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Quest for Broom of Trilon.",
            "gives": [],
            "gets": [
              "Broom of Trilon"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Bring these all to Tiblner Milnik in Firiona Vie. Receive Element of Earth.",
            "gives": [],
            "gets": [
              "Element of Earth"
            ],
            "who": "Tiblner Milnik",
            "zone": "Firiona Vie"
          }
        ]
      },
      {
        "title": "Element of Water",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Phinigel Autropos in Kedge Keep. Loot Staff of Elemental Mastery: Water.",
            "gives": [],
            "gets": [
              "Staff of Elemental Mastery: Water"
            ],
            "who": "Phinigel Autropos",
            "zone": "Kedge Keep"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Captain Rottgrime in The Overthere. Loot Tears of Erollisi.",
            "gives": [],
            "gets": [
              "Tears of Erollisi"
            ],
            "who": "Captain Rottgrime",
            "zone": "The Overthere"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Tarbul Earthstrider in East Karana. Loot Rain of Karana.",
            "gives": [],
            "gets": [
              "Rain of Karana"
            ],
            "who": "Tarbul Earthstrider",
            "zone": "East Karana"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Takes the three items to Jinalis Andir in Dagnor's Cauldron and receive the Element of Water.",
            "gives": [],
            "gets": [
              "Element of Water"
            ],
            "who": "Jinalis Andir",
            "zone": "Dagnor's Cauldron"
          }
        ]
      },
      {
        "title": "Element of Wind",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill mobs on the 7th island on the Plane of Sky. Loot the Crown of Elemental Mastery.",
            "gives": [],
            "gets": [
              "Crown of Elemental Mastery"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill mobs in the Hole. Loot the Elemental Binder.",
            "gives": [],
            "gets": [
              "Elemental Binder"
            ],
            "zone": "the Hole"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Quillmane in South Karana. Loot the Pegasus Feather Cloak.",
            "gives": [],
            "gets": [
              "Pegasus Feather Cloak"
            ],
            "who": "Quillmane",
            "zone": "South Karana"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give these items to Kihun Solstin in the Plane of Sky and receive the Element of Wind.",
            "gives": [],
            "gets": [
              "Element of Wind"
            ],
            "who": "Kihun Solstin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Spell Summon Orb",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "Go to the Master of Elements and give him the four Elements. Receive Spell: Summon Orb.",
            "gives": [],
            "gets": [],
            "who": "Master of Elements"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "(If Master of Elements isn't spawned, Hail Kihun Solstin and say \"I want to see the master.\")",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Scribe your spell and summon the Orb of Mastery!",
            "gives": [],
            "gets": [
              "Orb of Mastery"
            ]
          }
        ]
      }
    ]
  },
  {
    "quest": "Monk Epic Quest",
    "page": "Monk Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Kill Brother Zephyl or Brother Qwinn and loot Robe of the Lost Circle OR perform the following sub-quest.",
        "steps": [
          {
            "depth": 2,
            "kind": "quest",
            "text": "Robe of the Lost Circle sub-quest",
            "gives": [],
            "gets": [],
            "quests": [
              "Monks of The Whistling Fist"
            ]
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Obtain Purple Headband via quests.",
            "gives": [],
            "gets": [
              "Purple Headband"
            ]
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Obtain Red Sash of Order via quests.",
            "gives": [],
            "gets": [
              "Red Sash of Order"
            ]
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Targin the Rock in Nagafen's Lair King room to get Code of Zan Fi.",
            "gives": [],
            "gets": [
              "Code of Zan Fi"
            ],
            "who": "Targin the Rock",
            "zone": "Nagafen's Lair"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Kill Raster of Guk in Lower Guk to get The Idol. It should be noted you CANNOT MQ the idol and sash to Brother Zephyl.",
            "gives": [],
            "gets": [
              "The Idol"
            ],
            "who": "Raster of Guk",
            "zone": "Lower Guk"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Turn in Purple Headband and Code of Zan Fi to Brother Qwinn in Southern Karana to get Needle of the Void. This turn-in was successfully multiquested (MQ'd) as of 2024-09-14.",
            "gives": [
              "Purple Headband",
              "Code of Zan Fi"
            ],
            "gets": [
              "Needle of the Void"
            ],
            "who": "Brother Qwinn",
            "zone": "Southern Karana"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Turn in Red Sash of Order and The Idol to Brother Zephyl in Rathe Mountains to get Rare Robe Pattern.",
            "gives": [
              "Red Sash of Order",
              "The Idol"
            ],
            "gets": [
              "Rare Robe Pattern"
            ],
            "who": "Brother Zephyl",
            "zone": "Rathe Mountains"
          },
          {
            "depth": 3,
            "kind": "combine",
            "text": "Combine Shadow Wolf Pelt, Silk Swatch, and Spell: Gather Shadows in sewing kit to make Shadow Silk (Tailoring 36).",
            "gives": [
              "Shadow Wolf Pelt",
              "Silk Swatch"
            ],
            "gets": [
              "Shadow Silk"
            ]
          },
          {
            "depth": 3,
            "kind": "combine",
            "text": "Combine Shadow Silk, Needle of the Void, Rare Robe Pattern, and Song: Jonthan's Whistling Warsong in a sewing kit to make Robe of the Lost Circle (no skill check)",
            "gives": [
              "Shadow Silk",
              "Needle of the Void",
              "Rare Robe Pattern"
            ],
            "gets": [
              "Robe of the Lost Circle"
            ]
          }
        ]
      },
      {
        "title": "Robe of the Whistling Fists sub-quest",
        "steps": [
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill an iksar betrayer in Chardok and loot A Metal Pipe (Fi).",
            "gives": [],
            "gets": [
              "A Metal Pipe"
            ],
            "who": "an iksar betrayer",
            "zone": "Chardok"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill a drolvarg pawbuster in Karnor's Castle and loot A Metal Pipe (Zan).",
            "gives": [],
            "gets": [
              "A Metal Pipe"
            ],
            "who": "a drolvarg pawbuster",
            "zone": "Karnor's Castle"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Turn in the two pipes and Robe of the Lost Circle to Brother Balatin (must not be aggro'd. Charm and sneak both work, pacify does NOT work.) in Dreadlands to receive Robe of the Whistling Fists.",
            "gives": [
              "Robe of the Lost Circle"
            ],
            "gets": [
              "Robe of the Whistling Fists"
            ],
            "who": "Brother Balatin",
            "zone": "Dreadlands"
          }
        ]
      },
      {
        "title": "First Book",
        "steps": [
          {
            "depth": 2,
            "kind": "get",
            "text": "Get an Immortals book from any named mob in Skyfire.",
            "gives": [],
            "gets": [
              "Immortals"
            ],
            "zone": "Skyfire"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Turn in Immortals to Tomekeeper Danl in the Erudin library for Danl's Reference. Do not turn in while Feigned Death. Danl will eat your turn in.",
            "gives": [
              "Immortals"
            ],
            "gets": [
              "Danl's Reference"
            ],
            "who": "Tomekeeper Danl",
            "zone": "Erudin"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Save this until the final turn in so you may keep your robe longer.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Find Lheao in the hidden cove in Timorous Deep. Turn in Danl's Reference and Robe of the Whistling Fists to get Celestial Fists (book).",
            "gives": [],
            "gets": [
              "Danl's Reference",
              "Robe of the Whistling Fists",
              "Celestial Fists (book)"
            ],
            "who": "Lheao",
            "zone": "Timorous Deep"
          }
        ]
      },
      {
        "title": "Fist of Fire",
        "steps": [
          {
            "depth": 2,
            "kind": "loot",
            "text": "Find a fire sprite in Lavastorm Mountains and say \"I challenge Eejag\" to spawn Eejag. Kill Eejag and loot Charred Scale.",
            "gives": [],
            "gets": [
              "Charred Scale"
            ],
            "who": "a fire sprite",
            "zone": "Lavastorm Mountains"
          }
        ]
      },
      {
        "title": "Fist of Air",
        "steps": [
          {
            "depth": 2,
            "kind": "loot",
            "text": "Go to Dojorn's Island (Isle 1.5) in Plane of Sky. Hand Scale to a presence to spawn Gwan. Kill Gwan and loot Breath of Gwan.",
            "gives": [],
            "gets": [
              "Breath of Gwan"
            ],
            "who": "a presence",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Fist of Earth",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand Breath of Gwan in to a sleeping ogre in Mines of Nurga to spawn Trunt. Kill Trunt and loot Trunt's Head (Note: a sleeping ogre must con indifferently, use sneak from behind to turn in).",
            "gives": [
              "Breath of Gwan",
              "Trunt's Head"
            ],
            "gets": [],
            "who": "a sleeping ogre",
            "zone": "Mines of Nurga"
          }
        ]
      },
      {
        "title": "Fist of Water",
        "steps": [
          {
            "depth": 2,
            "kind": "other",
            "text": "OPTIONAL Find dark elf named Deep in underwater caverns of Lake Rathetear and turn in the Head. She will give it back then despawn.",
            "gives": [],
            "gets": [],
            "who": "Deep",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Go to Overthere and locate a monk named Astral Projection (Overthere). Hand him Trunt's Head and receive Eye of Kaiaren.",
            "gives": [],
            "gets": [
              "Trunt's Head",
              "Eye of Kaiaren"
            ],
            "who": "Astral Projection (Overthere)",
            "zone": "Overthere"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "In Lake of Ill Omen (It's not on the platform, but on the shore, loc neg 1900 neg 950), give an Astral Projection (LOIO) the Eye of Kaiaren to spawn Vorash and Deep. Once Vorash dies, Xenevorash will spawn. Kill Xenevorash and loot Demon Fangs.",
            "gives": [],
            "gets": [
              "Eye of Kaiaren",
              "Demon Fangs"
            ],
            "who": "Astral Projection (LOIO)",
            "zone": "Lake of Ill Omen"
          }
        ]
      },
      {
        "title": "Book Conversion (Dealing with Kaiaren):",
        "steps": [
          {
            "depth": 2,
            "kind": "get",
            "text": "SUPER DUPER IMPORTANT: If you are doing/receiving an MQ or you do not have your Demon Fangs in hand and ready, do NOT turn in Celestial Fists (book) to Sane Kaiaran and receive Book of Celestial Fists because Sane Kaiaren will despawn within 30 minutes. If you lose Celestial Fists (book) you can no longer spawn Sane Kaiaren for the final epic turn in and will have to either 1) wait for another monk to spawn Sane Kaiaren or 2) petition for reimbursement and wait a month or more for Sirken's response.",
            "gives": [],
            "gets": [
              "Celestial Fists (book)",
              "Book of Celestial Fists"
            ]
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Celestial Fists (book) to mad Kaiaren at the ruins near Sebilis in Trakanon's Teeth and he hands you back the book, then he punches you in the face - you can either kill him or feign off the aggro.",
            "gives": [
              "Celestial Fists (book)"
            ],
            "gets": [],
            "who": "Kaiaren",
            "zone": "Trakanon's Teeth"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Go to sane Kaiaren, who spawns over by the lake in TT (p305, p2470 in an empty hut) after you hand in Celestial Fists (book) to mad Kaiaren.",
            "gives": [],
            "gets": [
              "Celestial Fists (book)"
            ],
            "who": "Kaiaren"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand Celestial Fists (book) to sane Kaiaren and he hands you back a slightly different book called Book of Celestial Fists.",
            "gives": [
              "Celestial Fists (book)",
              "Book of Celestial Fists"
            ],
            "gets": [],
            "who": "Kaiaren"
          }
        ]
      },
      {
        "title": "Final Turn-in",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Turn in the modified Book of Celestial Fists and Demon Fangs to sane Kaiaren to receive the monk epic, Celestial Fists.",
            "gives": [
              "Book of Celestial Fists",
              "Demon Fangs"
            ],
            "gets": [
              "Celestial Fists"
            ],
            "who": "Kaiaren"
          }
        ]
      }
    ]
  },
  {
    "quest": "Necromancer Epic Quest",
    "page": "Necromancer Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Symbol of the Apprentice",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "(optional) Hail Venenzi Oberzendi in Nektulos Forest",
            "gives": [],
            "gets": [],
            "who": "Venenzi Oberzendi"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "(optional) Hail Kazen Fecae in Lake Rathetear",
            "gives": [],
            "gets": [],
            "who": "Kazen Fecae"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Sir Edwin Motte and loot his Head",
            "gives": [],
            "gets": [],
            "who": "Sir Edwin Motte"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Head to Kazen Fecae for the Symbol of the Apprentice",
            "gives": [],
            "gets": []
          }
        ]
      },
      {
        "title": "Symbol of the Serpent",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Symbol to Venenzi Oberzendi in Nektulos Forest for the Twisted Symbol of the Apprentice",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Najena (NPC) and loot the Flowing Black Robe",
            "gives": [],
            "gets": [
              "Flowing Black Robe"
            ],
            "who": "Najena (NPC)"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Flowing Black Robe to Venenzi for Rolling Stone Moss",
            "gives": [],
            "gets": [
              "Rolling Stone Moss"
            ]
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Head to Lake Rathetear, Give the Rolling Stone Moss and the Twisted Symbol of the Apprentice to Emkel Kabae.",
            "gives": [],
            "gets": [],
            "who": "Emkel Kabae"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Receive Symbol of the Serpent",
            "gives": [],
            "gets": []
          }
        ]
      },
      {
        "title": "Symbol of Testing",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Hail Ssessthrass in Swamp of No Hope and give him the Symbol of the Serpent for the Scaled Symbol of the Serpent",
            "gives": [],
            "gets": [
              "Scaled Symbol of the Serpent"
            ],
            "who": "Ssessthrass",
            "zone": "Swamp of No Hope"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Grand Herbalist Mak`ha/Royal Sarnak Herbalist in Chardok and loot the Manisi Herb",
            "gives": [],
            "gets": [
              "Manisi Herb"
            ],
            "who": "Grand Herbalist Mak`ha",
            "zone": "Chardok"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Manisi Herb and the Scaled Symbol of the Serpent to Ssessthrass for a Refined Mainsi Herb",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Refined Mainsi Herb to Emkel Kabae for the Symbol of Testing",
            "gives": [],
            "gets": [],
            "who": "Emkel Kabae"
          }
        ]
      },
      {
        "title": "Symbol of Insanity",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "OPTIONAL: Give the Symbol of Testing to Kazen Fecae",
            "gives": [],
            "gets": [],
            "who": "Kazen Fecae"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "OR Kill Kazen Fecae (see Kazen's page for more info on the fight)",
            "gives": [],
            "gets": [],
            "who": "Kazen Fecae"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Go to the small inlet east of Emkel and kill a bone golem",
            "gives": [],
            "gets": [],
            "who": "a bone golem"
          },
          {
            "depth": 1,
            "kind": "kill",
            "text": "Kill a failed apprentice",
            "gives": [],
            "gets": [],
            "who": "a failed apprentice"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill A tortured soul and loot the Symbol of Insanity",
            "gives": [],
            "gets": [],
            "who": "A tortured soul"
          }
        ]
      },
      {
        "title": "Gzallk in a Box",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Symbol of Insanity to Drendico Metalbones in Timorous Deep and receive the Journal",
            "gives": [],
            "gets": [],
            "who": "Drendico Metalbones",
            "zone": "Timorous Deep"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Speak to Jzil GSix in Plane of Sky",
            "gives": [],
            "gets": [],
            "who": "Jzil GSix"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill An azarack's and other second isle monsters for the Silver Disc",
            "gives": [],
            "gets": [
              "Silver Disc"
            ],
            "who": "An azarack"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill A gorgalask and other third isle monsters for the Spiroc Feathers",
            "gives": [],
            "gets": [
              "Spiroc Feathers"
            ],
            "who": "A gorgalask"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Keeper of Souls for the Black Silk Cape",
            "gives": [],
            "gets": [
              "Black Silk Cape"
            ],
            "who": "Keeper of Souls"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the items to Jzil GSix for the Cloak of Spiroc Feathers",
            "gives": [],
            "gets": [
              "Cloak of Spiroc Feathers"
            ],
            "who": "Jzil GSix"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Mini-Bosses formerly Innoruuk (God) from Plane of Hate for the Eye of Innoruuk",
            "gives": [],
            "gets": [
              "Eye of Innoruuk"
            ],
            "who": "Innoruuk (God)"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Cazic Thule (God) or the golems from Plane of Fear for the Slime Blood of Cazic Thule",
            "gives": [],
            "gets": [
              "Slime Blood of Cazic Thule"
            ],
            "who": "Cazic Thule (God)"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Cloak of Spiroc Feathers, Eye of Innoruuk, Slime Blood of Cazic Thule, and Journal to Drendico Metalbones and receive the Prepared Regents Box",
            "gives": [
              "Cloak of Spiroc Feathers",
              "Eye of Innoruuk",
              "Slime Blood of Cazic Thule"
            ],
            "gets": [],
            "who": "Drendico Metalbones"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Prepared Regents Box to Kazen for the Tome of Instruction",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Tome of Instruction to Gkzzallk for Gkzzallk in a Box -- See the note below. Do not do this step on someone else's (or your own Guild's) Sky slot without contacting their officers first. This will despawn the island 1 boss AND prevent them from raiding normally until respawn.",
            "gives": [],
            "gets": [
              "Gkzzallk in a Box"
            ],
            "who": "Gkzzallk"
          }
        ]
      },
      {
        "title": "Scythe of the Shadowed Soul",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Gkzzallk in a Box to Kazen Fecae for Scythe of the Shadowed Soul",
            "gives": [
              "Gkzzallk in a Box"
            ],
            "gets": [
              "Scythe of the Shadowed Soul"
            ],
            "who": "Kazen Fecae"
          }
        ]
      }
    ]
  },
  {
    "quest": "Paladin Epic Quest",
    "page": "Paladin Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Fiery Avenger",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Complete quest for The Fiery Avenger, which includes the quest for SoulFire and camping (or questing) Ghoulbane",
            "gives": [],
            "gets": [
              "SoulFire",
              "Ghoulbane"
            ],
            "quests": [
              "The Fiery Avenger"
            ]
          }
        ]
      },
      {
        "title": "Gleaming Crested Breastplate",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Tainted Darksteel Breastplate - thought destroyer in Plane of Hate.",
            "gives": [],
            "gets": [
              "Tainted Darksteel Breastplate"
            ],
            "who": "thought destroyer"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Do the Pure Crystal Quest or in other words Find Jark in North Kaladim. Tell him \"I will get your dinner\". Nella Stonebraids will spawn in the temple area, tell her \"Do you have Jark's Dinner?\" Receive: Cold Plate of Beef and Bread",
            "gives": [],
            "gets": [
              "Cold Plate of Beef and Bread"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Cold Plate of Beef and Bread to Jark Receive: Pure Crystal.",
            "gives": [
              "Cold Plate of Beef and Bread"
            ],
            "gets": [
              "Pure Crystal"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Tainted Darksteel Breastplate and Pure Crystal to Reklon Gnallen in Quellious Temple in Erudin for Gleaming Crested Breastplate.",
            "gives": [
              "Tainted Darksteel Breastplate",
              "Pure Crystal"
            ],
            "gets": [
              "Gleaming Crested Breastplate"
            ],
            "who": "Reklon Gnallen"
          }
        ]
      },
      {
        "title": "Gleaming Crested Sword",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Tainted Darksteel Sword - Keeper of the Tombs, the Hole.",
            "gives": [],
            "gets": [
              "Tainted Darksteel Sword"
            ],
            "who": "Keeper of the Tombs"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Tell a peasant woman in West Freeport at -190, -725 \"I will take it to him.\" Receive: Bucket of Water",
            "gives": [],
            "gets": [
              "Bucket of Water"
            ],
            "zone": "West Freeport",
            "loc": {
              "y": -190,
              "x": -725
            }
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Bucket of Water to Joshua in West Freeport at -245, -710 in the back of the bakery. Receive: Bucket of Pure Water",
            "gives": [
              "Bucket of Water"
            ],
            "gets": [
              "Bucket of Pure Water"
            ],
            "who": "Joshua",
            "zone": "West Freeport",
            "loc": {
              "y": -245,
              "x": -710
            }
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Tainted Darksteel Sword and Bucket of Pure Water to Reklon Gnallen in Quellious Temple in Erudin Recieve: Gleaming Crested Sword.",
            "gives": [
              "Tainted Darksteel Sword",
              "Bucket of Pure Water"
            ],
            "gets": [
              "Gleaming Crested Sword"
            ],
            "who": "Reklon Gnallen"
          }
        ]
      },
      {
        "title": "Gleaming Crested Shield",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Tainted Darksteel Shield - Kirak Vil (56th level), Nektulous Forest.",
            "gives": [],
            "gets": [
              "Tainted Darksteel Shield"
            ],
            "who": "Kirak Vil"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give to Elia the Pure, in Felwithe, for Gleaming Crested Shield.",
            "gives": [],
            "gets": [
              "Gleaming Crested Shield"
            ],
            "who": "Elia the Pure"
          }
        ]
      },
      {
        "title": "Mark of Atonement",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Turn in the three purified items (Gleaming Crested Shield, Gleaming Crested Breastplate, and Gleaming Crested Sword) to Reklon Gnallen for the Mark of Atonement.",
            "gives": [],
            "gets": [
              "Mark of Atonement"
            ],
            "who": "Reklon Gnallen"
          }
        ]
      },
      {
        "title": "Fiery Defender",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Turn in Mark of Atonement and Fiery Avenger to Irak Altil, a wandering skeleton in Plane of Fear to receive your Fiery Defender.",
            "gives": [],
            "gets": [
              "Fiery Defender"
            ],
            "who": "Irak Altil"
          }
        ]
      }
    ]
  },
  {
    "quest": "Ranger Epic Quest",
    "page": "Ranger Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Highlights",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "LOTS of running around and giving people stuff",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Forage:",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Rose of Firiona from Firiona Vie",
            "gives": [],
            "gets": [
              "Rose of Firiona"
            ],
            "zone": "Firiona Vie"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Chilled Tundra Root from Everfrost",
            "gives": [],
            "gets": [
              "Chilled Tundra Root"
            ],
            "zone": "Everfrost"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Ripened Heartfruit from Greater Faydark",
            "gives": [],
            "gets": [
              "Ripened Heartfruit"
            ],
            "zone": "Greater Faydark"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Speckled Molded Mushroom from Innothule Swamp",
            "gives": [],
            "gets": [
              "Speckled Molded Mushroom"
            ],
            "zone": "Innothule Swamp"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Sweetened Mudroot from Misty Thicket",
            "gives": [],
            "gets": [
              "Sweetened Mudroot"
            ],
            "zone": "Misty Thicket"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Spawn and kill a Dark Elf Corruptor (and optionally two Dark Elf Reavers) in East Karana",
            "gives": [],
            "gets": [],
            "who": "Dark Elf Corruptor",
            "zone": "East Karana"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Jade Reaver:",
            "gives": [],
            "gets": [
              "Jade Reaver"
            ]
          },
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase one",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Slay black reavers in City of Mist and loot one",
            "gives": [],
            "gets": [],
            "who": "a black reaver",
            "zone": "City of Mist"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Pulsing Green Stone",
            "gives": [],
            "gets": [
              "Pulsing Green Stone"
            ]
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Slay Venril Sathir (spawned version) in Karnor's Castle and loot one",
            "gives": [],
            "gets": [],
            "who": "Venril Sathir",
            "zone": "Karnor's Castle"
          },
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase a Multi-quested one",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Soulbound Hammer by spawning and killing Jaeil the Insane in The Hole",
            "gives": [],
            "gets": [
              "Soulbound Hammer"
            ],
            "who": "Jaeil the Insane",
            "zone": "The Hole"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Swirling Sphere of Color by slaying essence tamers in Plane of Sky",
            "gives": [],
            "gets": [
              "Swirling Sphere of Color"
            ],
            "who": "an essence tamer",
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Acquire a Shattered Emerald of Corruption from the Plane of Hate \"mini bosses\" (72 hour respawn) or Innoruuk",
            "gives": [],
            "gets": [
              "Shattered Emerald of Corruption"
            ],
            "zone": "Plane of Hate"
          }
        ]
      }
    ]
  },
  {
    "quest": "Rogue Epic Quest",
    "page": "Rogue Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Obtain Stanos' Pouch",
        "steps": [
          {
            "depth": 2,
            "kind": "other",
            "text": "(OPTIONAL) Acquire level 50 (will need assistance from a 50+ rogue if you are not high enough)",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "(OPTIONAL) Go to the Qeynos Aqueducts and find Malka Rale at +380, -210 (spawns at 8PM game time), tell her 'I can help' to receive Stanos' Pouch.",
            "gives": [],
            "gets": [
              "Stanos' Pouch"
            ],
            "who": "Malka Rale",
            "loc": {
              "y": 380,
              "x": -210
            }
          }
        ]
      },
      {
        "title": "Pickpocketing and Travel",
        "steps": [
          {
            "depth": 2,
            "kind": "get",
            "text": "Pickpocket Stained Parchment Top from Founy Jestands in North Kaladim.",
            "gives": [],
            "gets": [
              "Stained Parchment Top"
            ],
            "who": "Founy Jestands",
            "zone": "North Kaladim"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Pickpocket Stained Parchment Bottom from Tani N`Mar in Neriak Third Gate.",
            "gives": [],
            "gets": [
              "Stained Parchment Bottom"
            ],
            "who": "Tani N`Mar",
            "zone": "Neriak Third Gate"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand Stanos' Pouch to Anson Mcbale and say \"I need to see Stanos\" to spawn Stanos Herkanor and then turn both parchment pieces into Stanos in Highpass Hold to receive Combined Parchment.",
            "gives": [
              "Stanos' Pouch"
            ],
            "gets": [
              "Combined Parchment"
            ],
            "who": "Anson Mcbale",
            "zone": "Highpass Hold"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Combined Parchment, 100pp, and 2 unstacked Bottle of Milk to Eldreth in Lake Rathetear. Receive Scribbled Parchment.",
            "gives": [
              "Bottle of Milk"
            ],
            "gets": [
              "Scribbled Parchment"
            ],
            "who": "Eldreth",
            "zone": "Lake Rathetear"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Take Scribbled Parchment to Yendar Starpyre in Steamfont Mountains. Receive Tattered Parchment.",
            "gives": [],
            "gets": [
              "Tattered Parchment"
            ],
            "who": "Yendar Starpyre",
            "zone": "Steamfont Mountains"
          }
        ]
      },
      {
        "title": "Book of Souls",
        "steps": [
          {
            "depth": 2,
            "kind": "ground",
            "text": "Wizard teleport to Plane of Hate, obtain Book of Souls (10 hr ground spawn at -60, +325, 56).",
            "gives": [],
            "gets": [
              "Book of Souls"
            ],
            "zone": "Plane of Hate",
            "loc": {
              "y": -60,
              "x": 325,
              "z": 56
            }
          }
        ]
      },
      {
        "title": "Renux",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Tattered Parchment and Book of Souls to Yendar Starpyre to spawn Renux. Kill Renux Herkanor, loot Translated Parchment and, if it drops, Jagged Diamond Dagger*.",
            "gives": [
              "Tattered Parchment",
              "Book of Souls",
              "Translated Parchment",
              "Jagged Diamond Dagger"
            ],
            "gets": [],
            "who": "Yendar Starpyre"
          }
        ]
      },
      {
        "title": "General V`Ghera",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Return Translated Parchment to Stanos. Receive a Sealed Box from Stanos.",
            "gives": [],
            "gets": [
              "Sealed Box"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Travel to Kithicor Forest, hand in a Sealed Box to any of the Dark Elves to spawn General V`ghera. IMPORTANT: Do not use hide or invisibility / IVU while turning in the box, but do use sneak. Verify that you are sneaking but not hidden and that the mob cons indifferent before turning-in or you may lose your progress!",
            "gives": [],
            "gets": [
              "Sealed Box"
            ],
            "who": "General V`ghera"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill General V`ghera. Loot General's Pouch and, if it drops, Cazic Quill*.",
            "gives": [],
            "gets": [
              "General's Pouch",
              "Cazic Quill"
            ],
            "who": "General V`ghera"
          }
        ]
      },
      {
        "title": "*Auxiliary Questing (if they did not previously drop)",
        "steps": [
          {
            "depth": 2,
            "kind": "get",
            "text": "Cazic Quill",
            "gives": [],
            "gets": [
              "Cazic Quill"
            ]
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Get Robe of the Kedge from Phinigel Autropos in Kedge Keep or a rare drop from Coercer Q`ioul in Kithicor Forest.",
            "gives": [],
            "gets": [
              "Robe of the Kedge"
            ],
            "who": "Phinigel Autropos",
            "zone": "Kedge Keep"
          },
          {
            "depth": 3,
            "kind": "loot",
            "text": "Get Robe of the Ishva from The Ishva Mal in Splitpaw or a rare drop from Coercer Q`ioul in Kithicor Forest.",
            "gives": [],
            "gets": [
              "Robe of the Ishva"
            ],
            "who": "The Ishva Mal",
            "zone": "Splitpaw"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Shining Metallic Robes from Ghoul Archmagus in Lower Guk or a much harder Yendar Starpyre in Steamfont Mountains.",
            "gives": [],
            "gets": [
              "Shining Metallic Robes"
            ],
            "who": "the ghoul arch magus",
            "zone": "Lower Guk"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Robe of the Oracle from Oracle of K`Arnon in Ocean of Tears.",
            "gives": [],
            "gets": [
              "Robe of the Oracle"
            ],
            "who": "Oracle of K`Arnon",
            "zone": "Ocean of Tears"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Turn in all four robes to Vilnius the Small in Western Plains of Karana to receive Cazic Quill.",
            "gives": [],
            "gets": [
              "Cazic Quill"
            ],
            "who": "Vilnius the Small",
            "zone": "Western Plains of Karana"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Jagged Diamond Dagger",
            "gives": [],
            "gets": [
              "Jagged Diamond Dagger"
            ]
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Fleshripper from Solusek kobold king in Nagafen's Lair.",
            "gives": [],
            "gets": [
              "Fleshripper"
            ],
            "who": "Solusek kobold king",
            "zone": "Nagafen's Lair"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Painbringer from Kobold champion in Nagafen's Lair.",
            "gives": [],
            "gets": [
              "Painbringer"
            ],
            "who": "Kobold champion",
            "zone": "Nagafen's Lair"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Mithril Two-Handed Sword from The froglok king in Lower Guk (live side).",
            "gives": [],
            "gets": [
              "Mithril Two-Handed Sword"
            ],
            "who": "The froglok king",
            "zone": "Lower Guk"
          },
          {
            "depth": 3,
            "kind": "get",
            "text": "Get Gigantic Zweihander from Karg Icebear in Everfrost Peaks.",
            "gives": [],
            "gets": [
              "Gigantic Zweihander"
            ],
            "who": "Karg Icebear",
            "zone": "Everfrost Peaks"
          },
          {
            "depth": 3,
            "kind": "give",
            "text": "Turn in all four blades to Vilnius the Small in Western Plains of Karana to receive Jagged Diamond Dagger.",
            "gives": [],
            "gets": [
              "Jagged Diamond Dagger"
            ],
            "who": "Vilnius the Small",
            "zone": "Western Plains of Karana"
          }
        ]
      },
      {
        "title": "Final Turn in",
        "steps": [
          {
            "depth": 2,
            "kind": "give",
            "text": "Turn in General's Pouch, Jagged Diamond Dagger, and Cazic Quill to Stanos Herkanor to receive Ragebringer!",
            "gives": [
              "General's Pouch",
              "Jagged Diamond Dagger",
              "Cazic Quill"
            ],
            "gets": [
              "Ragebringer"
            ],
            "who": "Stanos Herkanor"
          }
        ]
      }
    ]
  },
  {
    "quest": "Shadow Knight Epic Quest",
    "page": "Shadow Knight Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "The Letter to Duriek",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Hail Kurron Ni in Overthere Outpost",
            "gives": [],
            "gets": [],
            "who": "Kurron Ni"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Kurron Ni Darkforge Breastplate, Darkforge Greaves, Darkforge Helm and 900 Platinum. You can get the armor through the Darkforge Armor Quests.",
            "gives": [
              "Darkforge Breastplate",
              "Darkforge Greaves",
              "Darkforge Helm"
            ],
            "gets": [],
            "who": "Kurron Ni",
            "quests": [
              "Darkforge Armor Quests"
            ]
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Kurron Ni and Loot the Letter to Duriek",
            "gives": [],
            "gets": [
              "Letter to Duriek"
            ],
            "who": "Kurron Ni"
          }
        ]
      },
      {
        "title": "The Dusty Tome",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the letter to Duriek Bloodpool in Paineel",
            "gives": [],
            "gets": [],
            "who": "Duriek Bloodpool",
            "zone": "Paineel"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Hail Smaka in Neriak Foreign Quarter",
            "gives": [],
            "gets": [],
            "who": "Smaka"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Smaka 1000 Platinum for a Cough Elixir",
            "gives": [],
            "gets": [
              "Cough Elixir"
            ],
            "who": "Smaka"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Cough Elixir to Duriek",
            "gives": [
              "Cough Elixir"
            ],
            "gets": [],
            "who": "Duriek Bloodpool"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill a ratman guard in The Hole and loot a Dusty Tome",
            "gives": [],
            "gets": [
              "Dusty Tome"
            ],
            "who": "a ratman guard",
            "zone": "The Hole"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Dusty Tome to Duriek",
            "gives": [
              "Dusty Tome"
            ],
            "gets": [],
            "who": "Duriek Bloodpool"
          }
        ]
      },
      {
        "title": "The Corrupted Ghoulbane",
        "steps": [
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill the The froglok shin lord in Ruins of Upper Guk and loot The Ghoulbane",
            "gives": [],
            "gets": [
              "Ghoulbane"
            ],
            "who": "The froglok shin lord",
            "zone": "Upper Guk"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Cazic-Thule and Loot The Soul Leech, Dark Sword of Blood (NOTE: Post Fear Revamp this now drops off Fear Golems Fright, Dread, and Terror)",
            "gives": [],
            "gets": [
              "Soul Leech, Dark Sword of Blood"
            ]
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill monsters in Plane of Sky for the Blade of Abrogation",
            "gives": [],
            "gets": [
              "Blade of Abrogation"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Rharzar in Rathe Mountains for a Drake Spine",
            "gives": [],
            "gets": [
              "Drake Spine"
            ],
            "who": "Rharzar",
            "zone": "Rathe Mountains"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill An ashenbone drakes in Plane of Hate for a Decrepit Hide",
            "gives": [],
            "gets": [
              "Decrepit Hide"
            ],
            "who": "An ashenbone drake",
            "zone": "Plane of Hate"
          },
          {
            "depth": 1,
            "kind": "buy",
            "text": "Buy a Platinum Bar and find an enchanter to make an Enchanted Platinum Bar",
            "gives": [],
            "gets": [
              "Platinum Bar",
              "Enchanted Platinum Bar"
            ]
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Open trade window, click Hide and make sure you con INDIFFERENT STATUS (Hiding is not needed if you have better faction). SUPER IMPORTANT! DO NOT HAND IN ITEMS W/O indifferent status or better. Teydar in the evil guild area of the Qeynos Aqueducts",
            "gives": [],
            "gets": [],
            "who": "Teydar",
            "zone": "Qeynos Aqueducts"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Drake Spine, Decrepit Hide and Enchanted Platinum Bar to Teydar for a Decrepit Sheath",
            "gives": [
              "Drake Spine",
              "Decrepit Hide",
              "Enchanted Platinum Bar"
            ],
            "gets": [
              "Decrepit Sheath"
            ],
            "who": "Teydar"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Go to Duriek. Open trade window, click Hide and make sure you con INDIFFERENT STATUS (Hiding is not needed if you have better faction). SUPER IMPORTANT! DO NOT HAND IN ITEMS W/O indifferent status or better. Give the Ghoulbane, the Soul Leech, Dark Sword of Blood, the Blade of Abrogation and the Decrepit Sheath to Duriek for the Corrupted Ghoulbane.",
            "gives": [],
            "gets": [
              "Ghoulbane",
              "Soul Leech, Dark Sword of Blood",
              "Blade of Abrogation",
              "Decrepit Sheath",
              "Corrupted Ghoulbane"
            ],
            "who": "Duriek Bloodpool"
          }
        ]
      },
      {
        "title": "The Dark Shroud",
        "steps": [
          {
            "depth": 1,
            "kind": "other",
            "text": "(Optional) Hail Lhranc in the City of Mist",
            "gives": [],
            "gets": [],
            "who": "Lhranc",
            "zone": "City of Mist"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "(Optional) Hail Marl Kastane in Kerra Isle and say 'I have the will of innoruuk' and 'What prophecy?' to get a Seal of Kastane",
            "gives": [],
            "gets": [
              "Seal of Kastane"
            ],
            "who": "Marl Kastane"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "(Optional) Hail Gerot Kastane in Paineel and give him the Seal of Kastane to get the Note to Marl",
            "gives": [],
            "gets": [
              "Seal of Kastane",
              "Note to Marl"
            ],
            "who": "Gerot Kastane"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "(Optional) Give the Note to Marl to Marl Kastane",
            "gives": [],
            "gets": [
              "Note to Marl"
            ],
            "who": "Marl Kastane"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Hail Knarthenne Skurl in Toxxulia Forest and say 'what heart of an innocent?' to get a Soulcase",
            "gives": [],
            "gets": [
              "Soulcase"
            ],
            "who": "Knarthenne Skurl",
            "zone": "Toxxulia Forest"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Gather a Cell Key from a mimic (looks like a chest) in the city bank of the Hole",
            "gives": [],
            "gets": [
              "Cell Key"
            ],
            "who": "a mimic",
            "zone": "the Hole"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Cell Key to Caradon (You must be indifferent for this turn-in) - Use \"Hide\" Skill.",
            "gives": [
              "Cell Key"
            ],
            "gets": [],
            "who": "Caradon"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Kyrenna NOT Caradon (if it can be avoided) and Loot Blood of Kyrenna and Heart of Kyrenna",
            "gives": [],
            "gets": [
              "Blood of Kyrenna",
              "Heart of Kyrenna"
            ],
            "who": "Kyrenna"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Blood of Kyrenna to Marl Kastane and receive the Dark Shroud DONT FEIGN DEATH FOR THIS TURN-IN You must be Indifferent for this turn in (use \"Hide\" skill). Make sure to be Hidden for this turn in.",
            "gives": [
              "Blood of Kyrenna"
            ],
            "gets": [
              "Dark Shroud"
            ],
            "who": "Marl Kastane"
          }
        ]
      },
      {
        "title": "Lhranc's Coin",
        "steps": [
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Dark Shroud to the Ghost of Glohnor in the Hole (Make sure to con indiff w/ IVU!)",
            "gives": [
              "Dark Shroud"
            ],
            "gets": [],
            "who": "Ghost of Glohnor",
            "zone": "the Hole"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Mummy of Glohnor and loot the Head of Glohnor and the Glohnor wrappings",
            "gives": [],
            "gets": [
              "Head of Glohnor",
              "Glohnor wrappings"
            ],
            "who": "Mummy of Glohnor"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Head of Glohnor to Gerot Kastane and receive the Head of the Valiant (Make sure to con indifferent w/ hide!)",
            "gives": [
              "Head of Glohnor"
            ],
            "gets": [
              "Head of the Valiant"
            ],
            "who": "Gerot Kastane"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Glohnor wrappings to Marl Kastane and receive the Will of Innoruuk (Make sure to con indifferent w/ hide!)",
            "gives": [
              "Glohnor wrappings"
            ],
            "gets": [
              "Will of Innoruuk"
            ],
            "who": "Marl Kastane"
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine the Heart of Kyrenna with the Soulcase to produce the Heart of the Innocent",
            "gives": [
              "Heart of Kyrenna",
              "Soulcase"
            ],
            "gets": [
              "Heart of the Innocent"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the Corrupted Ghoulbane, the Heart of the Innocent, the Head of the Valiant and the Will of Innoruuk to Lhranc - Make sure you are indifferent to him before you do the hand in, have someone else cast IVU on you before you hit trade. He will respawn with the sword... prepare for a fight. If you wipe in fight, Lhranc won't despawn. Bring at least 2 groups.",
            "gives": [
              "Corrupted Ghoulbane",
              "Heart of the Innocent",
              "Head of the Valiant",
              "Will of Innoruuk"
            ],
            "gets": [],
            "who": "Lhranc"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Lhranc and LOOT Innoruuk's Curse! Gratz!",
            "gives": [],
            "gets": [
              "Innoruuk's Curse"
            ],
            "who": "Lhranc"
          }
        ]
      }
    ]
  },
  {
    "quest": "Shaman Epic Quest",
    "page": "Shaman Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Shaman Epic Quest",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Begin quest by talking to a lesser spirit after killing one of the mobs in RM, OoT, BBM, or FoB, receive Tiny Gem from a Lesser Spirit (do not kill him).",
            "gives": [],
            "gets": [
              "Tiny Gem"
            ],
            "who": "a lesser spirit"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Take gem to North Freeport and give the gem to Bondl Felligan who will lead you to the Jade Tiger and spawn Greater Spirits.",
            "gives": [],
            "gets": [],
            "who": "Bondl Felligan"
          },
          {
            "depth": 1,
            "kind": "talk",
            "text": "Talk to the proper Greater Spirit for your god until you get an Opaque Gem.",
            "gives": [],
            "gets": [
              "Opaque Gem"
            ]
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Test of Patience in Erud’s Crossing, receive a small gem from a Greater Spirit.",
            "gives": [],
            "gets": [],
            "zone": "Erud's_Crossing"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Turn gem into a wandering spirit in West Karana.",
            "gives": [],
            "gets": [],
            "who": "a wandering spirit"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Glaron the Wicked (drops Envy & Woe) and Tabien the Goodly (drops Marr's Promise) in Rathe Mountains.",
            "gives": [],
            "gets": [],
            "who": "Glaron the Wicked",
            "zone": "Rathe Mountains"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Take Envy, Woe, and Marr’s Promise to the Wandering Spirit in West Karana (generally between Qeynos hills and bandit camp in the mountains,) receive Shield of Falsehood and gem in return.",
            "gives": [],
            "gets": [
              "Shield of Falsehood"
            ]
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Take gem to Spirit Sentinel in Emerald Jungle.",
            "gives": [],
            "gets": [],
            "who": "Spirit Sentinel"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Black Dire in Mistmoore (minimum level 5 to zone into Mistmoore), loot Black Dire Pelt.",
            "gives": [],
            "gets": [
              "Black Dire Pelt"
            ],
            "who": "Black Dire"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Turn in pelt to Spirit Sentinel in Emerald Jungle (you need faction for this turn in) Receive Black Fur Boots! Get 6 slot booklet from the spirit.",
            "gives": [],
            "gets": [
              "Black Fur Boots"
            ],
            "who": "Spirit Sentinel"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Collect 6 reports from the City of Mist for booklet. (turn in is KINDLY or better)",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "combine",
            "text": "Combine and turn in completed booklet to Spirit Sentinel in Emerald Jungle.",
            "gives": [],
            "gets": [],
            "who": "Spirit Sentinel"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Lord Ghiosk in the City of Mist and loot the 3 books.",
            "gives": [],
            "gets": [],
            "who": "Lord Ghiosk"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Turn in books to Spirit (in lake) in Emerald Jungle.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "ground",
            "text": "Obtain Icon of the High Scale from the City of Mist (ground spawn in the temple).",
            "gives": [],
            "gets": [
              "Icon of the High Scale"
            ]
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Icon to High Scale Kirn in the Hole, kill him and loot his ring.",
            "gives": [],
            "gets": [],
            "who": "High Scale Kirn"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the ring to Neh`Ashiir in the City of Mist, kill her, loot her diary.",
            "gives": [],
            "gets": [],
            "who": "Neh`Ashiir"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Turn in the diary to Spirit Sentinel in Emerald Jungle.",
            "gives": [],
            "gets": [],
            "who": "Spirit Sentinel"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Go to Fear to kill the Iksar Broodling, loot Child's Tear (random spawn from killing Golems, slay either Dread, Fright, or Terror).",
            "gives": [],
            "gets": [
              "Child's Tear"
            ],
            "who": "Iksar Broodling"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the tear to Lord Rak`Ashiir in City of Mist, kill him and loot his Iksar Scale. YOU NEED ALLY FACTION FOR THIS TURN IN -- JUST NOT MAXED ALLY",
            "gives": [
              "Iksar Scale"
            ],
            "gets": [],
            "who": "Lord Rak`Ashiir"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Take Scale to Spirit Sentinel wolf in Emerald Jungle IN THE POND to receive your epic! YOU NEED MAX ALLY, NOT JUST ALLY",
            "gives": [],
            "gets": [],
            "who": "Spirit Sentinel"
          }
        ]
      }
    ]
  },
  {
    "quest": "Warrior Epic Quest",
    "page": "Warrior Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Jeweled Dragon Head Hilt",
        "steps": [
          {
            "depth": 2,
            "kind": "talk",
            "text": "Hail Kargek Redblade and Wenden Blackhammer in East Freeport",
            "gives": [],
            "gets": [],
            "who": "Kargek Redblade",
            "zone": "Freeport"
          },
          {
            "depth": 2,
            "kind": "ground",
            "text": "Retrieve Unjeweled Dragon Head Hilt from the bottom of Lake Rathetear",
            "gives": [],
            "gets": [
              "Unjeweled Dragon Head Hilt"
            ],
            "zone": "Lake Rathetear"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Unjeweled Dragon Head Hilt, a Diamond, a Jacinth, and a Black Sapphire to Wenden Blackhammer",
            "gives": [
              "Unjeweled Dragon Head Hilt",
              "Diamond",
              "Jacinth",
              "Black Sapphire"
            ],
            "gets": [],
            "who": "Wenden Blackhammer"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Receive the Jeweled Dragon Head Hilt",
            "gives": [],
            "gets": [
              "Jeweled Dragon Head Hilt"
            ]
          }
        ]
      },
      {
        "title": "Finely Crafted Dragon Head Hilt",
        "steps": [
          {
            "depth": 2,
            "kind": "ground",
            "text": "Retrieve Severely Damaged Dragon Head Hilt from the chessboard in Timorous Deep",
            "gives": [],
            "gets": [
              "Severely Damaged Dragon Head Hilt"
            ],
            "zone": "Timorous Deep"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Get a Giant Sized Monocle from A mountain giant patriarch in Dreadlands",
            "gives": [],
            "gets": [
              "Giant Sized Monocle"
            ],
            "who": "A mountain giant patriarch",
            "zone": "Dreadlands"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give the Giant Sized Monocle to Mentrax Mountainbone in Frontier Mountains and receive Rejesiam Ore.",
            "gives": [
              "Giant Sized Monocle"
            ],
            "gets": [
              "Rejesiam Ore"
            ],
            "who": "Mentrax Mountainbone",
            "zone": "Frontier Mountains"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Fright, Dread, or Terror and loot Ball of Everliving Golem in Plane of Fear",
            "gives": [],
            "gets": [
              "Ball of Everliving Golem"
            ],
            "who": "Fright",
            "zone": "Plane of Fear"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Severely Damaged Dragon Head Hilt, Rejesiam Ore, and Ball of Everliving Golem to Wenden Blackhammer (MQable)",
            "gives": [
              "Severely Damaged Dragon Head Hilt",
              "Rejesiam Ore",
              "Ball of Everliving Golem"
            ],
            "gets": [],
            "who": "Wenden Blackhammer"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Receive Finely Crafted Dragon Head Hilt",
            "gives": [],
            "gets": [
              "Finely Crafted Dragon Head Hilt"
            ]
          }
        ]
      },
      {
        "title": "The Blades",
        "steps": [
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase A Keg of Vox Tail Ale from various merchants across Norrath.",
            "gives": [],
            "gets": [
              "Keg of Vox Tail Ale"
            ]
          },
          {
            "depth": 2,
            "kind": "buy",
            "text": "Purchase two(2) Rebreathers from other players, or craft as a Gnome with Tinkering Skill, Trivial 175.",
            "gives": [],
            "gets": [
              "Rebreather"
            ]
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Ice Giants and Loot Block of Permafrost in Permafrost",
            "gives": [],
            "gets": [
              "Block of Permafrost"
            ],
            "zone": "Permafrost"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Block of Permafrost, A Keg of Vox Tail Ale, and the two(2) Rebreathers to Denken Strongpick in Ocean of Tears.",
            "gives": [
              "Block of Permafrost",
              "Keg of Vox Tail Ale",
              "Rebreather"
            ],
            "gets": [],
            "who": "Denken Strongpick",
            "zone": "Ocean of Tears"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "Receive Ancient Sword Blade",
            "gives": [],
            "gets": [
              "Ancient Sword Blade"
            ]
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Queen Velazul Di`zok in Chardok and loot Ancient Blade",
            "gives": [],
            "gets": [
              "Ancient Blade"
            ],
            "who": "Queen Velazul Di`zok",
            "zone": "Chardok"
          }
        ]
      },
      {
        "title": "The Red Scabbard",
        "steps": [
          {
            "depth": 2,
            "kind": "talk",
            "text": "Hail Kargek Redblade and get Wax Sealed Note by saying \"what favor\"",
            "gives": [],
            "gets": [
              "Wax Sealed Note"
            ],
            "who": "Kargek Redblade"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Wax Sealed Note to Oknoggin Stonesmacker in Feerrott and receive Tiny Lute",
            "gives": [
              "Wax Sealed Note"
            ],
            "gets": [
              "Tiny Lute"
            ],
            "who": "Oknoggin Stonesmacker",
            "zone": "Feerrott"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Tiny Lute to Kargek Redblade and receive the book Redblade's Legacy",
            "gives": [
              "Tiny Lute"
            ],
            "gets": [],
            "who": "Kargek Redblade"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give book to Tenal Redblade in East Karana and receive Totem of the Freezing War",
            "gives": [],
            "gets": [
              "Totem of the Freezing War"
            ],
            "who": "Tenal Redblade",
            "zone": "East Karana"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill goblin wizards in Permafrost, loot Heart of Frost",
            "gives": [],
            "gets": [
              "Heart of Frost"
            ],
            "who": "A_goblin_wizard_(Permafrost)",
            "zone": "Permafrost"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Totem of the Freezing War and Heart of Frost to Tenal Redblade and receive Totem of Fiery War",
            "gives": [
              "Totem of the Freezing War",
              "Heart of Frost"
            ],
            "gets": [
              "Totem of Fiery War"
            ],
            "who": "Tenal Redblade"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Lord Nagafen or Ragefire in Nagafen's Lair, Nortlav the Scalekeeper in The Hole or Talendor in Skyfire Mountains and loot Red Dragon Scales",
            "gives": [],
            "gets": [
              "Red Dragon Scales"
            ],
            "who": "Lord Nagafen",
            "zone": "Nagafen's Lair"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Severilous in Emerald Jungle or Hoshkar in Veeshan's Peak and loot Green Dragon Scales",
            "gives": [],
            "gets": [
              "Green Dragon Scales"
            ],
            "who": "Severilous",
            "zone": "Emerald Jungle"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Totem of Fiery War, Red Dragon Scales, and Green Dragon Scales to Tenal Redblade and receive Mark of the Sword",
            "gives": [
              "Totem of Fiery War",
              "Red Dragon Scales",
              "Green Dragon Scales"
            ],
            "gets": [
              "Mark of the Sword"
            ],
            "who": "Tenal Redblade"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Maestro in Plane of Hate and loot Hand of the Maestro",
            "gives": [],
            "gets": [
              "Hand of the Maestro"
            ],
            "who": "Maestro",
            "zone": "Plane of Hate"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Mark of the Sword and Hand of the Maestro to Tenal Redblade and receive Tenal`s note to Kargek",
            "gives": [
              "Mark of the Sword",
              "Hand of the Maestro"
            ],
            "gets": [
              "Tenal`s note to Kargek"
            ],
            "who": "Tenal Redblade"
          },
          {
            "depth": 2,
            "kind": "loot",
            "text": "Kill Spiroc Lord in Plane of Air and Loot Spiroc Wingblade",
            "gives": [],
            "gets": [
              "Spiroc Wingblade"
            ],
            "who": "Spiroc Lord",
            "zone": "Plane of Air"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Give Tenal`s note to Kargek and Spiroc Wingblade to Kargek Redblade and receive Red Scabbard",
            "gives": [
              "Tenal`s note to Kargek",
              "Spiroc Wingblade"
            ],
            "gets": [
              "Red Scabbard"
            ],
            "who": "Kargek Redblade"
          }
        ]
      },
      {
        "title": "Jagged Blade of War/Blades of Strategy and Tactics",
        "steps": [
          {
            "depth": 2,
            "kind": "combine",
            "text": "Combine both hilts and both blades in Red Scabbard to receive the Jagged Blade of War.",
            "gives": [
              "Red Scabbard"
            ],
            "gets": [
              "Jagged Blade of War"
            ]
          }
        ]
      }
    ]
  },
  {
    "quest": "Wizard Epic Quest",
    "page": "Wizard Epic Quest",
    "era": "Epics",
    "stages": [
      {
        "title": "Post-Revamp Checklist",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Talk to Solomen in the Temple of Solusek Ro, receive a note. [OPTIONAL if using Ornate Velium Pendant",
            "gives": [],
            "gets": [],
            "who": "Solomen",
            "zone": "Temple of Solusek Ro"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the note to Camin at the Vasty Deep Inn in Erudin. Hail him, then hand him 1000pp. [OPTIONAL if using Ornate Velium Pendant][NOTE: Doing this part twice is NOT enough faction to get you to indifferent.]",
            "gives": [],
            "gets": [],
            "who": "Camin"
          }
        ]
      },
      {
        "title": "Buy the potion called Ro's Breath from Dargon in Halas, outside the shaman guild (900-1100pp).",
        "steps": [
          {
            "depth": 2,
            "kind": "other",
            "text": "Take the potion to Camin, receive potion back with the charge missing.",
            "gives": [],
            "gets": [],
            "who": "Camin"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the used potion to Dargon, who turns into Arantir Karondor. Hail him and receive the ring (note more than one wizard can hail Arantir after he has been triggered and each receive a ring).",
            "gives": [],
            "gets": [],
            "who": "Dargon"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand Challice the ring in the basement of the Paladin Guild in Felwithe, receive another ring back.",
            "gives": [],
            "gets": [],
            "who": "Challice"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the ring to Dargon/Arantir Karondor. Talk to him of the other wizards and receive Note from Arantir. (Say 'Who is the gnome?' to skip to the end of the conversation)",
            "gives": [],
            "gets": [
              "Note from  Arantir"
            ],
            "who": "Dargon"
          },
          {
            "depth": 2,
            "kind": "talk",
            "text": "Talk to Kandin Firepot in Butcherblock. Hand him Note from Arantir, say \"what oil?\" to receive Golem Sprocket.",
            "gives": [],
            "gets": [
              "Note from Arantir",
              "Golem Sprocket"
            ],
            "who": "Kandin Firepot"
          }
        ]
      },
      {
        "title": "Pre-Revamp Checklist",
        "steps": [
          {
            "depth": 1,
            "kind": "talk",
            "text": "Talk to Solomen in the Temple of Solusek Ro, receive a note. [OPTIONAL]",
            "gives": [],
            "gets": [],
            "who": "Solomen",
            "zone": "Temple of Solusek Ro"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the note to Camin at the Vasty Deep Inn in Erudin. Hail him, then hand him 1000pp. [OPTIONAL]",
            "gives": [],
            "gets": [],
            "who": "Camin"
          },
          {
            "depth": 1,
            "kind": "buy",
            "text": "Buy the potion called Ro's Breath from Dargon in Halas, outside the shaman guild (900-1100pp).",
            "gives": [],
            "gets": [
              "Ro's Breath"
            ],
            "who": "Dargon"
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "Take the potion to Camin, receive potion back with the charge missing.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the used potion to Dargon, who turns into Arantir Karondor, and receive the ring.",
            "gives": [],
            "gets": [],
            "who": "Arantir Karondor"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand Challice the ring in the basement of the Paladin Guild in Felwithe, receive another ring back.",
            "gives": [],
            "gets": [],
            "who": "Challice"
          },
          {
            "depth": 2,
            "kind": "give",
            "text": "Hand the ring to Dargon/Arantir. Talk to him of the other wizards and receive a note.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Phinigel Autropos in Kedge Keep. Loot the Blue Crystal Staff.",
            "gives": [],
            "gets": [
              "Blue Crystal Staff"
            ],
            "who": "Phinigel Autropos"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Kill Venril Sathir in Karnors's Castle, loot Gnarled Staff.",
            "gives": [],
            "gets": [
              "Gnarled Staff"
            ],
            "who": "Venril Sathir"
          },
          {
            "depth": 1,
            "kind": "other",
            "text": "Take the note to Kandin Firepot, then:",
            "gives": [],
            "gets": [],
            "who": "Kandin Firepot"
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "1. Give him Cazic's Skin from CT to recieve Kandin's Bag.",
            "gives": [],
            "gets": [
              "Cazic's Skin"
            ]
          },
          {
            "depth": 2,
            "kind": "get",
            "text": "2. Give him Mistletoe Powder to obtain the Staff of Gabstik",
            "gives": [],
            "gets": [
              "Mistletoe Powder",
              "Staff of Gabstik"
            ]
          },
          {
            "depth": 2,
            "kind": "other",
            "text": "3. Give him back Kandin's Bag to get a new note.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give note to Dargon to spawn Arantir, then hail him. Give him the Blue Crystal Staff, Gnarled Staff, and Staff of Gabstik. Receive a bag.",
            "gives": [],
            "gets": []
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give the bag to Solomen, receive the Staff of the Four",
            "gives": [],
            "gets": []
          }
        ]
      }
    ]
  },
  {
    "quest": "Bard Plane of Sky Tests",
    "page": "Bard Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Bard Test of Tone",
        "trigger": "tone",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Light Woolen Mask from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Light Woolen Mask"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Light Woolen Mask to Cilin Spellsinger in Plane of Sky -- receive Mask of Song",
            "gives": [
              "Wind Rune Meda",
              "Light Woolen Mask"
            ],
            "gets": [
              "Mask of Song"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Bard Test of Voice",
        "trigger": "voice",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Light Woolen Mantle from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Light Woolen Mantle"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Light Woolen Mantle to Cilin Spellsinger in Plane of Sky -- receive Mantle of the Songweaver",
            "gives": [
              "Wind Rune Kala",
              "Light Woolen Mantle"
            ],
            "gets": [
              "Mantle of the Songweaver"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Bard Test of Pitch",
        "trigger": "pitch",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Crude Wooden Flute from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Crude Wooden Flute"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Crude Wooden Flute to Cilin Spellsinger in Plane of Sky -- receive Ervaj's Flute of Flight",
            "gives": [
              "Wind Rune Azia",
              "Crude Wooden Flute"
            ],
            "gets": [
              "Ervaj's Flute of Flight"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Bard Test of Wind",
        "trigger": "wind",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Amulet of Woven Hair from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Amulet of Woven Hair"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Amulet of Woven Hair to Cilin Spellsinger in Plane of Sky -- receive Amulet of the Fae",
            "gives": [
              "Wind Rune Caza",
              "Amulet of Woven Hair"
            ],
            "gets": [
              "Amulet of the Fae"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Bard Test of Brass",
        "trigger": "brass",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Glowing Diamond from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Glowing Diamond"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Horn in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Horn"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Glowing Diamond, Efreeti War Horn to Cilin Spellsinger in Plane of Sky -- receive Denon's Horn of Disaster",
            "gives": [
              "Wind Rune Fana",
              "Glowing Diamond",
              "Efreeti War Horn"
            ],
            "gets": [
              "Denon's Horn of Disaster"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Bard Test of Harmony",
        "trigger": "harmony",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Nebulous Diamond from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Nebulous Diamond"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Spear in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Spear"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Nebulous Diamond, Efreeti War Spear to Cilin Spellsinger in Plane of Sky -- receive Spear of Harmony",
            "gives": [
              "Wind Rune Heda",
              "Nebulous Diamond",
              "Efreeti War Spear"
            ],
            "gets": [
              "Spear of Harmony"
            ],
            "who": "Cilin Spellsinger",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Beastlord Plane of Sky Tests",
    "page": "Beastlord Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Beastlord Test of Aviak",
        "trigger": "aviak",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Elder's Totem from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Elder's Totem"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Spiroc Elder's Totem to Animist Kratho in Plane of Sky -- receive Spiroc Beak Earcuff",
            "gives": [
              "Wind Rune Beza",
              "Spiroc Elder's Totem"
            ],
            "gets": [
              "Spiroc Beak Earcuff"
            ],
            "who": "Animist Kratho",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Beastlord Test of Azarack",
        "trigger": "azarack",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Azarack Skin from Protector of Sky in Plane of Sky",
            "gives": [],
            "gets": [
              "Azarack Skin"
            ],
            "who": "Protector of Sky",
            "zone": "Plane of Sky",
            "area": "Island 2: Azarack Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Azarack Skin to Animist Kratho in Plane of Sky -- receive Azarack Skin Wristwraps",
            "gives": [
              "Wind Rune Heda",
              "Azarack Skin"
            ],
            "gets": [
              "Azarack Skin Wristwraps"
            ],
            "who": "Animist Kratho",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Beastlord Test of Claw",
        "trigger": "claw",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Sphinx Claw from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Sphinx Claw"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Mithril Bands from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Mithril Bands"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Brass Knuckles in Plane of Sky",
            "gives": [],
            "gets": [
              "Brass Knuckles"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Sphinx Claw, Mithril Bands, Brass Knuckles to Animist Kratho in Plane of Sky -- receive Windhowl",
            "gives": [
              "Wind Rune Izah",
              "Sphinx Claw",
              "Mithril Bands",
              "Brass Knuckles"
            ],
            "gets": [
              "Windhowl"
            ],
            "who": "Animist Kratho",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Beastlord Test of Harpy",
        "trigger": "harpy",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Leather Cord from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Leather Cord"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Leather Cord to Animist Kratho in Plane of Sky -- receive Griffon-Hide Armguards",
            "gives": [
              "Wind Rune Kala",
              "Leather Cord"
            ],
            "gets": [
              "Griffon-Hide Armguards"
            ],
            "who": "Animist Kratho",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Beastlord Test of Wind",
        "trigger": "wind",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silken Wrap from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Silken Wrap"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, Silken Wrap to Animist Kratho in Plane of Sky -- receive Diaphonous Waistband",
            "gives": [
              "Wind Rune Geza",
              "Silken Wrap"
            ],
            "gets": [
              "Diaphonous Waistband"
            ],
            "who": "Animist Kratho",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Berserker Plane of Sky Tests",
    "page": "Berserker Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Berserker Test of Sharpness",
        "trigger": "sharpness",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Djinni War Blade from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Djinni War Blade"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Standard in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Standard"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Djinni War Blade, Efreeti Standard to Stragen The Hewer in Plane of Sky -- receive Skycleaver",
            "gives": [
              "Wind Rune Jaka",
              "Djinni War Blade",
              "Efreeti Standard"
            ],
            "gets": [
              "Skycleaver"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Berserker Test of Will",
        "trigger": "will",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Pulsating Ruby from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Pulsating Ruby"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Pulsating Ruby to Stragen The Hewer in Plane of Sky -- receive Molten Coil",
            "gives": [
              "Wind Rune Ena",
              "Pulsating Ruby"
            ],
            "gets": [
              "Molten Coil"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Berserker Test of Ferocity",
        "trigger": "ferocity",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot High Quality Raiment from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "High Quality Raiment"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, High Quality Raiment to Stragen The Hewer in Plane of Sky -- receive Sash of Ferocity",
            "gives": [
              "Wind Rune Ozah",
              "High Quality Raiment"
            ],
            "gets": [
              "Sash of Ferocity"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Berserker Test of Burden",
        "trigger": "burden",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Feathered Cape from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Feathered Cape"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Feathered Cape to Stragen The Hewer in Plane of Sky -- receive Shroud of the Sky",
            "gives": [
              "Wind Rune Azia",
              "Feathered Cape"
            ],
            "gets": [
              "Shroud of the Sky"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Berserker Test of Blood",
        "trigger": "blood",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Azarack Blood from Protector of Sky in Plane of Sky",
            "gives": [],
            "gets": [
              "Azarack Blood"
            ],
            "who": "Protector of Sky",
            "zone": "Plane of Sky",
            "area": "Island 2: Azarack Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Azarack Blood to Stragen The Hewer in Plane of Sky -- receive Blood-Drawn Runes",
            "gives": [
              "Wind Rune Lena",
              "Azarack Blood"
            ],
            "gets": [
              "Blood-Drawn Runes"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Berserker Test of Fools Errand",
        "trigger": "fools errand",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Jester's Mask from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Jester's Mask"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Efreeti Great Staff from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Great Staff"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Jester's Mask, Efreeti Great Staff to Stragen The Hewer in Plane of Sky -- receive Cudgel of the Fool",
            "gives": [
              "Wind Rune Dena",
              "Jester's Mask",
              "Efreeti Great Staff"
            ],
            "gets": [
              "Cudgel of the Fool"
            ],
            "who": "Stragen The Hewer",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Cleric Plane of Sky Tests",
    "page": "Cleric Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Cleric Test of Courage",
        "trigger": "courage",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silver Hoop from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Silver Hoop"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Silver Hoop to Josin Faithbringer in Plane of Sky -- receive Truewind Earring",
            "gives": [
              "Wind Rune Lena",
              "Silver Hoop"
            ],
            "gets": [
              "Truewind Earring"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Cleric Test of Skill",
        "trigger": "skill",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Small Shield from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Small Shield"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Small Shield to Josin Faithbringer in Plane of Sky -- receive Aegis of the Wind",
            "gives": [
              "Wind Rune Meda",
              "Small Shield"
            ],
            "gets": [
              "Aegis of the Wind"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Cleric Test of Protection",
        "trigger": "protection",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Shiny Pauldrons from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Shiny Pauldrons"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Shiny Pauldrons to Josin Faithbringer in Plane of Sky -- receive Pauldrons of Piety",
            "gives": [
              "Wind Rune Caza",
              "Shiny Pauldrons"
            ],
            "gets": [
              "Pauldrons of Piety"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Cleric Test of Resolution",
        "trigger": "resolution",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silvered Spiroc Necklace from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Silvered Spiroc Necklace"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Silvered Spiroc Necklace to Josin Faithbringer in Plane of Sky -- receive Necklace of Resolution",
            "gives": [
              "Wind Rune Neza",
              "Silvered Spiroc Necklace"
            ],
            "gets": [
              "Necklace of Resolution"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Cleric Test of Theurgy",
        "trigger": "theurgy",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Djinni Aura from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Djinni Aura"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Mace in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Mace"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Djinni Aura, Efreeti Mace to Josin Faithbringer in Plane of Sky -- receive Theurgist's Star",
            "gives": [
              "Wind Rune Kala",
              "Djinni Aura",
              "Efreeti Mace"
            ],
            "gets": [
              "Theurgist's Star"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Cleric Test of The Weak",
        "trigger": "weak",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Mithril Bands from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Mithril Bands"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Standard in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Standard"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Mithril Bands, Efreeti Standard to Josin Faithbringer in Plane of Sky -- receive Baton of the Sky",
            "gives": [
              "Wind Rune Ena",
              "Mithril Bands",
              "Efreeti Standard"
            ],
            "gets": [
              "Baton of the Sky"
            ],
            "who": "Josin Faithbringer",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Druid Plane of Sky Tests",
    "page": "Druid Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Druid Test of Wolf",
        "trigger": "wolf",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Worn Leather Mask from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Worn Leather Mask"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Worn Leather Mask to Strandar Pinemist in Plane of Sky -- receive Drake-Hide Mask",
            "gives": [
              "Wind Rune Meda",
              "Worn Leather Mask"
            ],
            "gets": [
              "Drake-Hide Mask"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Druid Test of Bear",
        "trigger": "bear",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Mantle of Woven Grass from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Mantle of Woven Grass"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Mantle of Woven Grass to Strandar Pinemist in Plane of Sky -- receive Nature Walker's Mantle",
            "gives": [
              "Wind Rune Kala",
              "Mantle of Woven Grass"
            ],
            "gets": [
              "Nature Walker's Mantle"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Druid Test of Tree",
        "trigger": "tree",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Battle Staff from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Battle Staff"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Statuette in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Statuette"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Spiroc Battle Staff, Efreeti Statuette to Strandar Pinemist in Plane of Sky -- receive Shillelagh",
            "gives": [
              "Wind Rune Azia",
              "Spiroc Battle Staff",
              "Efreeti Statuette"
            ],
            "gets": [
              "Shillelagh"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Druid Test of The Bee",
        "trigger": "bee",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Divine Honeycomb from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Divine Honeycomb"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Divine Honeycomb to Strandar Pinemist in Plane of Sky -- receive Honeycomb Belt",
            "gives": [
              "Wind Rune Dena",
              "Divine Honeycomb"
            ],
            "gets": [
              "Honeycomb Belt"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Druid Test of Eagle",
        "trigger": "eagle",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ethereal Ruby from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Ethereal Ruby"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Elder's Totem from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Elder's Totem"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Ethereal Ruby, Spiroc Elder's Totem to Strandar Pinemist in Plane of Sky -- receive Spiroc Banisher Focus",
            "gives": [
              "Wind Rune Ena",
              "Ethereal Ruby",
              "Spiroc Elder's Totem"
            ],
            "gets": [
              "Spiroc Banisher Focus"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Druid Test of Nature",
        "trigger": "nature",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Storm Sky Opal from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Storm Sky Opal"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Scimitar in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Scimitar"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Storm Sky Opal, Efreeti Scimitar to Strandar Pinemist in Plane of Sky -- receive Espri",
            "gives": [
              "Wind Rune Izah",
              "Storm Sky Opal",
              "Efreeti Scimitar"
            ],
            "gets": [
              "Espri"
            ],
            "who": "Strandar Pinemist",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Enchanter Plane of Sky Tests",
    "page": "Enchanter Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Enchanter Test of Illusion",
        "trigger": "illusion",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Finely Woven Cloth Cord from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Finely Woven Cloth Cord"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Finely Woven Cloth Cord to Enchanter Jolas in Plane of Sky -- receive Sphinx Hair Cord",
            "gives": [
              "Wind Rune Meda",
              "Finely Woven Cloth Cord"
            ],
            "gets": [
              "Sphinx Hair Cord"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Enchanter Test of Metamorphism",
        "trigger": "metamorphism",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Light Cloth Mantle from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Light Cloth Mantle"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, Light Cloth Mantle to Enchanter Jolas in Plane of Sky -- receive Wind Walker's Mantle",
            "gives": [
              "Wind Rune Ozah",
              "Light Cloth Mantle"
            ],
            "gets": [
              "Wind Walker's Mantle"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Enchanter Test of Deception",
        "trigger": "deception",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silken Mask from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Silken Mask"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Silken Mask to Enchanter Jolas in Plane of Sky -- receive Ivory Mask",
            "gives": [
              "Wind Rune Beza",
              "Silken Mask"
            ],
            "gets": [
              "Ivory Mask"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Enchanter Test of Dislocation",
        "trigger": "dislocation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Adamantium Earring from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Adamantium Earring"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Adamantium Earring to Enchanter Jolas in Plane of Sky -- receive Earring of Displacement",
            "gives": [
              "Wind Rune Caza",
              "Adamantium Earring"
            ],
            "gets": [
              "Earring of Displacement"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Enchanter Test of Memorization",
        "trigger": "memorization",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Glowing Necklace from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Glowing Necklace"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Glowing Necklace to Enchanter Jolas in Plane of Sky -- receive Necklace of Whispering Winds",
            "gives": [
              "Wind Rune Fana",
              "Glowing Necklace"
            ],
            "gets": [
              "Necklace of Whispering Winds"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Enchanter Test of Incapacitation",
        "trigger": "incapacitation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Large Sky Sapphire from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Large Sky Sapphire"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Wind Staff in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Wind Staff"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Large Sky Sapphire, Efreeti Wind Staff to Enchanter Jolas in Plane of Sky -- receive Rod of the Protecting Winds",
            "gives": [
              "Wind Rune Izah",
              "Large Sky Sapphire",
              "Efreeti Wind Staff"
            ],
            "gets": [
              "Rod of the Protecting Winds"
            ],
            "who": "Enchanter Jolas",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Magician Plane of Sky Tests",
    "page": "Magician Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Magician Test of Clarification",
        "trigger": "clarification",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Feathered Cape from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Feathered Cape"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Feathered Cape to Magus Frinon in Plane of Sky -- receive Bracelet of Clarification",
            "gives": [
              "Wind Rune Lena",
              "Feathered Cape"
            ],
            "gets": [
              "Bracelet of Clarification"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Empowerment",
        "trigger": "empowerment",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ceramic Mask from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Ceramic Mask"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Ceramic Mask to Magus Frinon in Plane of Sky -- receive Mask of Empowerment",
            "gives": [
              "Wind Rune Neza",
              "Ceramic Mask"
            ],
            "gets": [
              "Mask of Empowerment"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Shielding",
        "trigger": "shielding",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Golden Coffer from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Golden Coffer"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Golden Coffer to Magus Frinon in Plane of Sky -- receive Gold White Pendant",
            "gives": [
              "Wind Rune Azia",
              "Golden Coffer"
            ],
            "gets": [
              "Gold White Pendant"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Summoning",
        "trigger": "summoning",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Large Diamond from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Large Diamond"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Large Diamond to Magus Frinon in Plane of Sky -- receive Drake-Hide Amice",
            "gives": [
              "Wind Rune Dena",
              "Large Diamond"
            ],
            "gets": [
              "Drake-Hide Amice"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Interpretation",
        "trigger": "interpretation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Golden Efreeti Ring from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Golden Efreeti Ring"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Golden Efreeti Ring to Magus Frinon in Plane of Sky -- receive Duennan Shielding Ring",
            "gives": [
              "Wind Rune Ena",
              "Golden Efreeti Ring"
            ],
            "gets": [
              "Duennan Shielding Ring"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Gesticulation",
        "trigger": "gesticulation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Hazy Opal from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Hazy Opal"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Magi Staff in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Magi Staff"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Hazy Opal, Efreeti Magi Staff to Magus Frinon in Plane of Sky -- receive Staff of The Magister",
            "gives": [
              "Wind Rune Jaka",
              "Hazy Opal",
              "Efreeti Magi Staff"
            ],
            "gets": [
              "Staff of The Magister"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Magician Test of Displacement",
        "trigger": "displacement",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Crown of Elemental Mastery in Plane of Sky",
            "gives": [],
            "gets": [
              "Crown of Elemental Mastery"
            ],
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Large Opal from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Large Opal"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Djinni Stave from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Djinni Stave"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Crown of Elemental Mastery, Large Opal, Djinni Stave to Magus Frinon in Plane of Sky -- receive Staff of Elemental Mastery: Air",
            "gives": [
              "Wind Rune Heda",
              "Crown of Elemental Mastery",
              "Large Opal",
              "Djinni Stave"
            ],
            "gets": [
              "Staff of Elemental Mastery: Air"
            ],
            "who": "Magus Frinon",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Monk Plane of Sky Tests",
    "page": "Monk Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Monk Test of Strength",
        "trigger": "strength",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silken Strands from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Silken Strands"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Silken Strands to Holwin in Plane of Sky -- receive Back Straps of Mastery",
            "gives": [
              "Wind Rune Caza",
              "Silken Strands"
            ],
            "gets": [
              "Back Straps of Mastery"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Monk Test of Sight",
        "trigger": "sight",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Cracked Leather Eyepatch from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Cracked Leather Eyepatch"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, Cracked Leather Eyepatch to Holwin in Plane of Sky -- receive Ton Po's Eye Patch",
            "gives": [
              "Wind Rune Geza",
              "Cracked Leather Eyepatch"
            ],
            "gets": [
              "Ton Po's Eye Patch"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Monk Test of Speed",
        "trigger": "speed",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Dove Slippers from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Dove Slippers"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Dove Slippers to Holwin in Plane of Sky -- receive Sandals of Alacrity",
            "gives": [
              "Wind Rune Jaka",
              "Dove Slippers"
            ],
            "gets": [
              "Sandals of Alacrity"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Monk Test of Tears",
        "trigger": "tears",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silken Wrap from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Silken Wrap"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Silken Wrap to Holwin in Plane of Sky -- receive Ton Po's Shoulder Wraps",
            "gives": [
              "Wind Rune Beza",
              "Silken Wrap"
            ],
            "gets": [
              "Ton Po's Shoulder Wraps"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Monk Test of Fists",
        "trigger": "fists",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Nebulous Sapphire from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Nebulous Sapphire"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Brass Knuckles in Plane of Sky",
            "gives": [],
            "gets": [
              "Brass Knuckles"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Nebulous Sapphire, Brass Knuckles to Holwin in Plane of Sky -- receive Wu's Fist of Mastery",
            "gives": [
              "Wind Rune Neza",
              "Nebulous Sapphire",
              "Brass Knuckles"
            ],
            "gets": [
              "Wu's Fist of Mastery"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Monk Test of Tranquility",
        "trigger": "tranquility",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Tear of Quellious from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Tear of Quellious"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Tear of Quellious to Holwin in Plane of Sky -- receive Golden Sash of Tranquility",
            "gives": [
              "Wind Rune Lena",
              "Tear of Quellious"
            ],
            "gets": [
              "Golden Sash of Tranquility"
            ],
            "who": "Holwin",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Necromancer Plane of Sky Tests",
    "page": "Necromancer Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Necromancer Test of Flight",
        "trigger": "flight",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Griffon's Beak from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Griffon's Beak"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Griffon's Beak to Drakis Bloodcaster in Plane of Sky -- receive Bloody Griffon-Hide Wrist Guard",
            "gives": [
              "Wind Rune Lena",
              "Griffon's Beak"
            ],
            "gets": [
              "Bloody Griffon-Hide Wrist Guard"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Necromancer Test of Power",
        "trigger": "power",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Black Silk Cape from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Black Silk Cape"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Black Silk Cape to Drakis Bloodcaster in Plane of Sky -- receive Cloak of Spiroc Feathers",
            "gives": [
              "Wind Rune Neza",
              "Black Silk Cape"
            ],
            "gets": [
              "Cloak of Spiroc Feathers"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Necromancer Test of Mind",
        "trigger": "mind",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Fine Cloth Raiment from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Fine Cloth Raiment"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, Fine Cloth Raiment to Drakis Bloodcaster in Plane of Sky -- receive Bloodsoaked Raiment",
            "gives": [
              "Wind Rune Ozah",
              "Fine Cloth Raiment"
            ],
            "gets": [
              "Bloodsoaked Raiment"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Necromancer Test of Heart",
        "trigger": "heart",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Pulsating Ruby from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Pulsating Ruby"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Pulsating Ruby to Drakis Bloodcaster in Plane of Sky -- receive Sphinx Heart Amulet",
            "gives": [
              "Wind Rune Azia",
              "Pulsating Ruby"
            ],
            "gets": [
              "Sphinx Heart Amulet"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Necromancer Test of Finger",
        "trigger": "finger",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ring of Veeshan from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Ring of Veeshan"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Ring of Veeshan to Drakis Bloodcaster in Plane of Sky -- receive Band of Wailing Winds",
            "gives": [
              "Wind Rune Caza",
              "Ring of Veeshan"
            ],
            "gets": [
              "Band of Wailing Winds"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Necromancer Test of Hands",
        "trigger": "hands",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Gorgon Head from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Gorgon Head"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Efreeti Great Staff from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Great Staff"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Gorgon Head, Efreeti Great Staff to Drakis Bloodcaster in Plane of Sky -- receive Gorgon Head Staff",
            "gives": [
              "Wind Rune Fana",
              "Gorgon Head",
              "Efreeti Great Staff"
            ],
            "gets": [
              "Gorgon Head Staff"
            ],
            "who": "Drakis Bloodcaster",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Paladin Plane of Sky Tests",
    "page": "Paladin Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Paladin Test of Spirit",
        "trigger": "spirit",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Lena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Lena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ivory Sky Diamond from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Ivory Sky Diamond"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Lena, Ivory Sky Diamond to Dason Goldblade in Plane of Sky -- receive Girdle of Faith",
            "gives": [
              "Wind Rune Lena",
              "Ivory Sky Diamond"
            ],
            "gets": [
              "Girdle of Faith"
            ],
            "who": "Dason Goldblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Paladin Test of Sacrifice",
        "trigger": "sacrifice",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Bixie Sword Blade from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Bixie Sword Blade"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, Bixie Sword Blade to Dason Goldblade in Plane of Sky -- receive Aldryn, Blade of the Ocean",
            "gives": [
              "Wind Rune Ozah",
              "Bixie Sword Blade"
            ],
            "gets": [
              "Aldryn, Blade of the Ocean"
            ],
            "who": "Dason Goldblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Paladin Test of Love",
        "trigger": "love",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Golden Hilt in Plane of Sky",
            "gives": [],
            "gets": [
              "Golden Hilt"
            ],
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Sphinx Claw from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Sphinx Claw"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, Golden Hilt, Sphinx Claw to Dason Goldblade in Plane of Sky -- receive Thelvorn, Blade of Light",
            "gives": [
              "Wind Rune Geza",
              "Golden Hilt",
              "Sphinx Claw"
            ],
            "gets": [
              "Thelvorn, Blade of Light"
            ],
            "who": "Dason Goldblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Paladin Test of Compassion",
        "trigger": "compassion",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Large Sky Diamond from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Large Sky Diamond"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Zweihander in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Zweihander"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Large Sky Diamond, Efreeti Zweihander to Dason Goldblade in Plane of Sky -- receive Truvinan",
            "gives": [
              "Wind Rune Izah",
              "Large Sky Diamond",
              "Efreeti Zweihander"
            ],
            "gets": [
              "Truvinan"
            ],
            "who": "Dason Goldblade",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Ranger Plane of Sky Tests",
    "page": "Ranger Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Ranger Test of Body",
        "trigger": "body",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Griffon Talon from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Griffon Talon"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Griffon Talon to Ranger Spirit in Plane of Sky -- receive Griffon Talon Necklace",
            "gives": [
              "Wind Rune Meda",
              "Griffon Talon"
            ],
            "gets": [
              "Griffon Talon Necklace"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Ranger Test of Defense",
        "trigger": "defense",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Fine Velvet Cloak from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Fine Velvet Cloak"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Fine Velvet Cloak to Ranger Spirit in Plane of Sky -- receive Dark Cloak of the Sky",
            "gives": [
              "Wind Rune Neza",
              "Fine Velvet Cloak"
            ],
            "gets": [
              "Dark Cloak of the Sky"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Ranger Test of The Earth",
        "trigger": "elemental earth",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Earth Totem from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Earth Totem"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Spiroc Earth Totem to Ranger Spirit in Plane of Sky -- receive Earthshaker's Mantle",
            "gives": [
              "Wind Rune Kala",
              "Spiroc Earth Totem"
            ],
            "gets": [
              "Earthshaker's Mantle"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Ranger Test of Thunder",
        "trigger": "elemental thunder",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot White Gold Earring from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "White Gold Earring"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, White Gold Earring to Ranger Spirit in Plane of Sky -- receive Thunderforged Earring",
            "gives": [
              "Wind Rune Azia",
              "White Gold Earring"
            ],
            "gets": [
              "Thunderforged Earring"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Ranger Test of Blade",
        "trigger": "blade",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Circlet of Brambles from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Circlet of Brambles"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Long Sword in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Long Sword"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Circlet of Brambles, Efreeti Long Sword to Ranger Spirit in Plane of Sky -- receive Arydryidriyorn",
            "gives": [
              "Wind Rune Ena",
              "Circlet of Brambles",
              "Efreeti Long Sword"
            ],
            "gets": [
              "Arydryidriyorn"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Ranger Test of Ranged Attack",
        "trigger": "ranged attack",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Shimmering Pearl from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Shimmering Pearl"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Bow in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Bow"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Shimmering Pearl, Efreeti War Bow to Ranger Spirit in Plane of Sky -- receive Windstriker",
            "gives": [
              "Wind Rune Heda",
              "Shimmering Pearl",
              "Efreeti War Bow"
            ],
            "gets": [
              "Windstriker"
            ],
            "who": "Ranger Spirit",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Rogue Plane of Sky Tests",
    "page": "Rogue Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Rogue Test of Thievery",
        "trigger": "thievery",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Inlaid Choker from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Inlaid Choker"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, Inlaid Choker to Thalik Silenthand in Plane of Sky -- receive Wispy Choker of Vigor",
            "gives": [
              "Wind Rune Ozah",
              "Inlaid Choker"
            ],
            "gets": [
              "Wispy Choker of Vigor"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Rogue Test of Trickery",
        "trigger": "trickery",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Sphinxian Circlet from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Sphinxian Circlet"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Sphinxian Circlet to Thalik Silenthand in Plane of Sky -- receive Renard's Belt of Quickness",
            "gives": [
              "Wind Rune Izah",
              "Sphinxian Circlet"
            ],
            "gets": [
              "Renard's Belt of Quickness"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Rogue Test of Silence",
        "trigger": "silence",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Sky Totem from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Sky Totem"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Spiroc Sky Totem to Thalik Silenthand in Plane of Sky -- receive Griffon Wing Spauldors",
            "gives": [
              "Wind Rune Ena",
              "Spiroc Sky Totem"
            ],
            "gets": [
              "Griffon Wing Spauldors"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Rogue Test of Cunning",
        "trigger": "cunning",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Jester's Mask from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Jester's Mask"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Jester's Mask to Thalik Silenthand in Plane of Sky -- receive Crystal Mask",
            "gives": [
              "Wind Rune Dena",
              "Jester's Mask"
            ],
            "gets": [
              "Crystal Mask"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Rogue Test of Stealth",
        "trigger": "stealth",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Fine Wool Cloak from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Fine Wool Cloak"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, Fine Wool Cloak to Thalik Silenthand in Plane of Sky -- receive Shimmering Bracer of Protection",
            "gives": [
              "Wind Rune Geza",
              "Fine Wool Cloak"
            ],
            "gets": [
              "Shimmering Bracer of Protection"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Rogue Test of Deception",
        "trigger": "deception",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Bixie Stinger from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Bixie Stinger"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Bloodsky Sapphire from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Bloodsky Sapphire"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Bixie Stinger, Bloodsky Sapphire to Thalik Silenthand in Plane of Sky -- receive Thornstinger",
            "gives": [
              "Wind Rune Jaka",
              "Bixie Stinger",
              "Bloodsky Sapphire"
            ],
            "gets": [
              "Thornstinger"
            ],
            "who": "Thalik Silenthand",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Shadow Knight Plane of Sky Tests",
    "page": "Shadow Knight Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Shadow Knight Test of Bash",
        "trigger": "bash",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ozah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ozah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Finely Crafted Amulet from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Finely Crafted Amulet"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ozah, Finely Crafted Amulet to Sarkis Ebonblade in Plane of Sky -- receive Amulet of the Sphinx Eye",
            "gives": [
              "Wind Rune Ozah",
              "Finely Crafted Amulet"
            ],
            "gets": [
              "Amulet of the Sphinx Eye"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Test of Smash",
        "trigger": "smash",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Silvery Ring from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Silvery Ring"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Silvery Ring to Sarkis Ebonblade in Plane of Sky -- receive Crimson Ring of the Djinni",
            "gives": [
              "Wind Rune Beza",
              "Silvery Ring"
            ],
            "gets": [
              "Crimson Ring of the Djinni"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Test of Slash",
        "trigger": "slash",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Finely Woven Cloth Belt from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Finely Woven Cloth Belt"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Finely Woven Cloth Belt to Sarkis Ebonblade in Plane of Sky -- receive Pegasus-Hide Belt",
            "gives": [
              "Wind Rune Dena",
              "Finely Woven Cloth Belt"
            ],
            "gets": [
              "Pegasus-Hide Belt"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Test of Disempowerment",
        "trigger": "disempowerment",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Rusted Pauldrons from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Rusted Pauldrons"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Rusted Pauldrons to Sarkis Ebonblade in Plane of Sky -- receive Blood Sky Face Plate",
            "gives": [
              "Wind Rune Fana",
              "Rusted Pauldrons"
            ],
            "gets": [
              "Blood Sky Face Plate"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Test of Envenoming",
        "trigger": "envenoming",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Shield in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Shield"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Efreeti War Shield to Sarkis Ebonblade in Plane of Sky -- receive Obtenebrate Mithril Guard",
            "gives": [
              "Wind Rune Heda",
              "Efreeti War Shield"
            ],
            "gets": [
              "Obtenebrate Mithril Guard"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Raising of the Dead",
        "trigger": "raising of the dead",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Sphinxian Ring from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Sphinxian Ring"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Fae Pauldrons from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Fae Pauldrons"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Sphinxian Ring, Fae Pauldrons to Sarkis Ebonblade in Plane of Sky -- receive Pearlescent Pauldrons",
            "gives": [
              "Wind Rune Izah",
              "Sphinxian Ring",
              "Fae Pauldrons"
            ],
            "gets": [
              "Pearlescent Pauldrons"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shadow Knight Test of Necropotence",
        "trigger": "necropotence",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Blood Sky Ruby from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Blood Sky Ruby"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Axe in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Axe"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Blood Sky Ruby, Efreeti War Axe to Sarkis Ebonblade in Plane of Sky -- receive Khyldorn the Blood Drinker",
            "gives": [
              "Wind Rune Kala",
              "Blood Sky Ruby",
              "Efreeti War Axe"
            ],
            "gets": [
              "Khyldorn the Blood Drinker"
            ],
            "who": "Sarkis Ebonblade",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Shaman Plane of Sky Tests",
    "page": "Shaman Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Shaman Test of Might",
        "trigger": "might",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Meda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Meda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Leather Cord from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Leather Cord"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Meda, Leather Cord to Medicine Man Veetra in Plane of Sky -- receive Amulet of the Fang",
            "gives": [
              "Wind Rune Meda",
              "Leather Cord"
            ],
            "gets": [
              "Amulet of the Fang"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shaman Test of Health",
        "trigger": "health",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Kala in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Kala"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ceremonial Belt from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Ceremonial Belt"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Kala, Ceremonial Belt to Medicine Man Veetra in Plane of Sky -- receive Bracelet of the Spirits",
            "gives": [
              "Wind Rune Kala",
              "Ceremonial Belt"
            ],
            "gets": [
              "Bracelet of the Spirits"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shaman Test of Sight",
        "trigger": "sight",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Light Damask Mantle from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Light Damask Mantle"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Light Damask Mantle to Medicine Man Veetra in Plane of Sky -- receive Fairy-Hide Mantle",
            "gives": [
              "Wind Rune Beza",
              "Light Damask Mantle"
            ],
            "gets": [
              "Fairy-Hide Mantle"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shaman Test of Shrink",
        "trigger": "shrink",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Ena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Ena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Corrosive Venom from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Corrosive Venom"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Club in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Club"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Ena, Corrosive Venom, Efreeti War Club to Medicine Man Veetra in Plane of Sky -- receive Warhammer of the Wind",
            "gives": [
              "Wind Rune Ena",
              "Corrosive Venom",
              "Efreeti War Club"
            ],
            "gets": [
              "Warhammer of the Wind"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shaman Test of Snake",
        "trigger": "snake",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Heda in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Heda"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Bixie Essence in Plane of Sky",
            "gives": [],
            "gets": [
              "Bixie Essence"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiritualist`s Ring from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiritualist`s Ring"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Heda, Bixie Essence, Spiritualist`s Ring to Medicine Man Veetra in Plane of Sky -- receive Vermilion Sky Ring",
            "gives": [
              "Wind Rune Heda",
              "Bixie Essence",
              "Spiritualist`s Ring"
            ],
            "gets": [
              "Vermilion Sky Ring"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Shaman Test of The Witch Doctor",
        "trigger": "witch doctor",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Symbol of Veeshan from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Symbol of Veeshan"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Maul in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Maul"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, Symbol of Veeshan, Efreeti War Maul to Medicine Man Veetra in Plane of Sky -- receive Garduk",
            "gives": [
              "Wind Rune Geza",
              "Symbol of Veeshan",
              "Efreeti War Maul"
            ],
            "gets": [
              "Garduk"
            ],
            "who": "Medicine Man Veetra",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Warrior Plane of Sky Tests",
    "page": "Warrior Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Warrior Test of Skill",
        "trigger": "skill",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Neza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Neza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Azure Ring from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Azure Ring"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Neza, Azure Ring to Torgon Blademaster in Plane of Sky -- receive Azure Ruby Ring",
            "gives": [
              "Wind Rune Neza",
              "Azure Ring"
            ],
            "gets": [
              "Azure Ruby Ring"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Warrior Test of Strength",
        "trigger": "strength",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Azia in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Azia"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Stone Amulet from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Stone Amulet"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Azia, Stone Amulet to Torgon Blademaster in Plane of Sky -- receive Runed Wind Amulet",
            "gives": [
              "Wind Rune Azia",
              "Stone Amulet"
            ],
            "gets": [
              "Runed Wind Amulet"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Warrior Test of Force",
        "trigger": "force",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Beza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Beza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Spiroc Air Totem from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "Spiroc Air Totem"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Beza, Spiroc Air Totem to Torgon Blademaster in Plane of Sky -- receive Pauldrons of the Blue Sky",
            "gives": [
              "Wind Rune Beza",
              "Spiroc Air Totem"
            ],
            "gets": [
              "Pauldrons of the Blue Sky"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Warrior Test of Think",
        "trigger": "think",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Wind Tablet from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Tablet"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Belt in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Belt"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Wind Tablet, Efreeti Belt to Torgon Blademaster in Plane of Sky -- receive Belt of the Four Winds",
            "gives": [
              "Wind Rune Fana",
              "Wind Tablet",
              "Efreeti Belt"
            ],
            "gets": [
              "Belt of the Four Winds"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Warrior Test of Smash",
        "trigger": "smash",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Djinni War Blade from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Djinni War Blade"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Gem of Invigoration in Plane of Sky",
            "gives": [],
            "gets": [
              "Gem of Invigoration"
            ],
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Djinni War Blade, Gem of Invigoration to Torgon Blademaster in Plane of Sky -- receive Dagas",
            "gives": [
              "Wind Rune Jaka",
              "Djinni War Blade",
              "Gem of Invigoration"
            ],
            "gets": [
              "Dagas"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Warrior Test of Bash",
        "trigger": "bash",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Ethereal Emerald from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Ethereal Emerald"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Battle Axe in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Battle Axe"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Ethereal Emerald, Efreeti Battle Axe to Torgon Blademaster in Plane of Sky -- receive Fangol",
            "gives": [
              "Wind Rune Dena",
              "Ethereal Emerald",
              "Efreeti Battle Axe"
            ],
            "gets": [
              "Fangol"
            ],
            "who": "Torgon Blademaster",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  },
  {
    "quest": "Wizard Plane of Sky Tests",
    "page": "Wizard Plane of Sky Tests",
    "era": "Classic",
    "stages": [
      {
        "title": "Wizard Test of Concentration",
        "trigger": "concentration",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Dena in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Dena"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Grey Damask Cloak from Gorgalosk in Plane of Sky",
            "gives": [],
            "gets": [
              "Grey Damask Cloak"
            ],
            "who": "Gorgalosk",
            "zone": "Plane of Sky",
            "area": "Island 3: Harpy Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Dena, Grey Damask Cloak to Wizard Schrock in Plane of Sky -- receive Augmentor's Mask",
            "gives": [
              "Wind Rune Dena",
              "Grey Damask Cloak"
            ],
            "gets": [
              "Augmentor's Mask"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Wizard Test of Focus",
        "trigger": "focus",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Fana in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Fana"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Woven Skull Cap from Keeper of Souls in Plane of Sky",
            "gives": [],
            "gets": [
              "Woven Skull Cap"
            ],
            "who": "Keeper of Souls",
            "zone": "Plane of Sky",
            "area": "Island 4: Pegasus Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Fana, Woven Skull Cap to Wizard Schrock in Plane of Sky -- receive Al`Kabor's Cap of Binding",
            "gives": [
              "Wind Rune Fana",
              "Woven Skull Cap"
            ],
            "gets": [
              "Al`Kabor's Cap of Binding"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Wizard Test of Meditation",
        "trigger": "meditation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Geza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Geza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot High Quality Raiment from The Spiroc Lord in Plane of Sky",
            "gives": [],
            "gets": [
              "High Quality Raiment"
            ],
            "who": "The Spiroc Lord",
            "zone": "Plane of Sky",
            "area": "Island 5: Spiroc Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Geza, High Quality Raiment to Wizard Schrock in Plane of Sky -- receive Raiment of Thunder",
            "gives": [
              "Wind Rune Geza",
              "High Quality Raiment"
            ],
            "gets": [
              "Raiment of Thunder"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Wizard Test of Conception",
        "trigger": "conception",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Izah in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Izah"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Box of Winds from Bazzt Zzzt in Plane of Sky",
            "gives": [],
            "gets": [
              "Box of Winds"
            ],
            "who": "Bazzt Zzzt",
            "zone": "Plane of Sky",
            "area": "Island 6: Bee Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti Statuette in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti Statuette"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Izah, Box of Winds, Efreeti Statuette to Wizard Schrock in Plane of Sky -- receive Solidate Mithril Ring",
            "gives": [
              "Wind Rune Izah",
              "Box of Winds",
              "Efreeti Statuette"
            ],
            "gets": [
              "Solidate Mithril Ring"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Wizard Test of Visualization",
        "trigger": "visualization",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Jaka in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Jaka"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Amethyst Amulet from Sister of the Spire in Plane of Sky",
            "gives": [],
            "gets": [
              "Amethyst Amulet"
            ],
            "who": "Sister of the Spire",
            "zone": "Plane of Sky",
            "area": "Island 7: Drake Island"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Jaka, Amethyst Amulet to Wizard Schrock in Plane of Sky -- receive Amulet of the Void",
            "gives": [
              "Wind Rune Jaka",
              "Amethyst Amulet"
            ],
            "gets": [
              "Amulet of the Void"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      },
      {
        "title": "Wizard Test of Preparation",
        "trigger": "preparation",
        "steps": [
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Wind Rune Caza in Plane of Sky",
            "gives": [],
            "gets": [
              "Wind Rune Caza"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "loot",
            "text": "Loot Large Sky Lapis from Eye of Veeshan in Plane of Sky",
            "gives": [],
            "gets": [
              "Large Sky Lapis"
            ],
            "who": "Eye of Veeshan",
            "zone": "Plane of Sky",
            "area": "Island 8: Veeshan Island"
          },
          {
            "depth": 1,
            "kind": "get",
            "text": "Get Efreeti War Staff in Plane of Sky",
            "gives": [],
            "gets": [
              "Efreeti War Staff"
            ],
            "zone": "Plane of Sky"
          },
          {
            "depth": 1,
            "kind": "give",
            "text": "Give Wind Rune Caza, Large Sky Lapis, Efreeti War Staff to Wizard Schrock in Plane of Sky -- receive Nargon's Staff",
            "gives": [
              "Wind Rune Caza",
              "Large Sky Lapis",
              "Efreeti War Staff"
            ],
            "gets": [
              "Nargon's Staff"
            ],
            "who": "Wizard Schrock",
            "zone": "Plane of Sky"
          }
        ]
      }
    ]
  }
];

export const QUEST_PLAN_PEOPLE: Record<string, PlanPerson> = {
  "Konia Swiftfoot": {
    "name": "Konia Swiftfoot",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": -526,
      "x": -2439
    },
    "note": "100% @. Bard Epic Quest NPC located in Western Karana guard tower #1 at NEG 500 NEG 2400. Respawns 6m40s."
  },
  "Fajio Knejo": {
    "name": "Fajio Knejo",
    "zone": "Misty Thicket",
    "loc": {
      "y": -130,
      "x": -54
    },
    "note": "100% @. Fajio can be found in Misty Thicket at -130, -54. This is on the safe side of the wall close to the entrance to the dangerous side where the two guards are stationed."
  },
  "Andad Filla": {
    "name": "Andad Filla",
    "zone": "Southern Desert of Ro",
    "loc": {
      "y": -3045,
      "x": 1211
    },
    "note": "50% @. Found by the Innothule Swamp zone line. Peaceful even to trolls and ogres."
  },
  "Misty Tekcihta": {
    "name": "Misty Tekcihta",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 2430,
      "x": 2580
    },
    "note": "100% @ Arena entrance #13 on the map. Misty Tekcihta location is located at 2430 2580 at the Arena Entrance. #13 on the Lake Rathetear map. Note: Her last name is 'A Thicket' spelled backwards, giving her the name of a zone in the game (Misty Thicket)."
  },
  "Baenar Swiftsong": {
    "name": "Baenar Swiftsong",
    "zone": "South Karana",
    "loc": {
      "y": -13,
      "x": 94
    },
    "note": "100% @. He is next to Vhalen Nostrolo's Well #3 on the map. No notable resistances and doesn't summon, making him a safe option to charm for fighting Brother Qwinn."
  },
  "Marfen Binkdirple": {
    "name": "Marfen Binkdirple",
    "zone": "Solusek's Eye",
    "loc": {
      "y": -306,
      "x": -1072
    },
    "note": "Marfen is a vendor located at -310, -1090, just to the left of the gnome fort entrance. He also has a small role in the Bard Epic. Like all merchants, Marfen has a faction floor of dubious, and should never aggro. NOTE: He will NOT sell to followers of Innoruuk apparently. As a level 60 Troll Shaman with Innoruuk deity I could not even interact with him or open his trade window. Bear form and 141 CHA made no difference. When trying he simply replies \"I am tolerant by nature... but you push me past my limit. get out! Creatures like you make me sick. the things you do..get out of here Pagain!\" 7/21/2022 NOTE: He sold just fine to a 60 Innoruuk shaman with 113 cha. Paid 5177 a bag with apprehensive faction in bear form. 3/9/24"
  },
  "Serra": {
    "name": "Serra",
    "zone": "The Estate of Unrest",
    "loc": {
      "y": 691,
      "x": -280
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Maligar": {
    "name": "Maligar",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": 1191,
      "x": -10891
    },
    "note": "Handing Maligar the Note to Maligar received from Baenar Swiftsong spawns Maligar's Enraged Doppleganger. He is surrounded by 3 lower-level guards and 2 pets who do not see invis or hide. Charm him to do hand in or sneak up from behind. 30 minute respawn after note handed in. He is an undercon, tough fight."
  },
  "Maligar's Enraged Doppleganger": {
    "name": "Maligar's Enraged Doppleganger",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": 1249,
      "x": -10905
    },
    "note": "Spawned from Maligar during the Bard Epic Quest. Harm Touches initially for approximately 451 damage. Surrounded by 4 lower-level guards. **Serious under-con. His regenerative abilities are incredible. Do not understimate this NPC**"
  },
  "Blackwing": {
    "name": "Blackwing",
    "zone": "Rathe Mountains",
    "loc": {
      "y": -1700,
      "x": -15
    },
    "note": "Kelkim Menkia says 'The strings were from a huge onyx drake.' A named onyx drake in the Rathe Mountains."
  },
  "Nezekezena": {
    "name": "Nezekezena",
    "zone": "Burning Woods",
    "loc": {
      "y": -1072,
      "x": -3772
    },
    "note": "(+2800, +1030). Named wurm for bard and magician epics. High fire resist. Summons, casts Ice Comet, Wrath of Al'Kabor, G-Flux, Markar's Clash and Tishan's Clash (DD and stun), Resist debuff, and gates. Placeholder for known spawn is a high level wurm. Recommended buff cold and magic resist before engaging. Can be snared and feared. 5 on map is confirmed spawn location and probably best area to farm. See Phurzikon for details on spawning, as they share a spawn point and cycle. Spawn Timer = 6 minutes 40 seconds"
  },
  "Eldrig the Old": {
    "name": "Eldrig the Old",
    "zone": "Skyfire Mountains"
  },
  "Kelkim Menkia": {
    "name": "Kelkim Menkia",
    "zone": "Southern Karana",
    "loc": {
      "y": -246,
      "x": -3671
    },
    "note": "100% @."
  },
  "Quag Maelstrom": {
    "name": "Quag Maelstrom",
    "zone": "Ocean of Tears",
    "loc": {
      "y": 1183,
      "x": -5978
    },
    "note": "50% @. Random spawn on seafury island. - He will DRAIN YOUR MANA very rapidly! Do not mess with him if you're a caster. Easy to resist with 150+ MR. Although an epic quest npc, he is can be found during classic era."
  },
  "Vedico Windwhisper": {
    "name": "Vedico Windwhisper",
    "zone": "Butcherblock Mountains"
  },
  "Forpar Fizfla": {
    "name": "Forpar Fizfla",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": 133,
      "x": -606
    },
    "note": "You writhe in the grip of agony. You have taken 511 points of damage. He seems to be a Gnome Shadow Knight with Harm Touch. Be careful near the windmills. NOTE: I was multiquesting the Kedge backbone from my Iksar who was KOS. I had the idea to get a druid to wolf form me which got me to dubious for the turn in. So wolf form improves your faction with Forpar Fizfla if you need it to do for a turn in. No faction hits for killing. 6 minute 42 second respawn"
  },
  "Phinigel Autropos": {
    "name": "Phinigel Autropos",
    "zone": "Kedge Keep",
    "loc": {
      "y": 37,
      "x": 111
    },
    "note": "100% @. Phinigel is the last known knight of the Kedge, loyal to Prexus to his last breath. He resides deep within Kedge Keep. He is protected by several Swirlspine Guardians. ===VOIDLING LOCATION=== To spawn the instance that has Phinigel in it you must first hail the voidling located at the entrance of the star room. XYZ - (/way -35, 15, -73) ===Strategy=== Not an extraordinarily difficult foe once he is separated from his Swirlspine Guardians. His AOEs are very strong, including a dispel which will cause rather rapid problems with drownings. To avoid this he is usually engaged only with pets (which never drown and seem to have innate resistance to AOEs) and not with melee players."
  },
  "Amygdalan warrior": {
    "name": "Amygdalan Warrior",
    "zone": "Plane of Fear"
  },
  "Drolvarg Warlord": {
    "name": "A Drolvarg warlord",
    "zone": "Karnor's Castle",
    "loc": {
      "y": 55,
      "x": -573
    },
    "note": "25% @. Summons and him and his bodyguards all see invis. Spawns inside Basement below the Jail and has Bodyguards as place holder, seen him pop at different spawn points within the room."
  },
  "Nortlav the Scalekeeper": {
    "name": "Nortlav the Scalekeeper",
    "zone": "The Hole"
  },
  "An Undead Bard": {
    "name": "An Undead Bard",
    "zone": "Old Sebilis",
    "loc": {
      "y": -2080,
      "x": -700
    },
    "note": "Part of the revamped Bard Epic. A vendor NPC that spawns in Trakanon's lair. If it is up when Trakanon spawns, Trakanon will kill him. To spawn Trakanon for the bard epic quest, turn in a Mystical Lute Body to the non-KOS undead bard. You'll get the lute body back and he will attack you. After you kill him, the spawned version of Trakanon will appear where the undead bard was originally standing. The spawned version of Trakanon despawns after 20 minutes. Not actually undead despite his name. Undead nukes will not land."
  },
  "Baldric Slezaf": {
    "name": "Baldric Slezaf",
    "zone": "Dreadlands",
    "loc": {
      "y": 779,
      "x": 9657
    },
    "note": "100% @. For the final turn in of the bard epic."
  },
  "Lord Bergurgle": {
    "name": "Lord Bergurgle",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 2777,
      "x": 159
    },
    "note": "20% @. PH is the middle a Deepwater Goblin in the underwater tower beneath the island directly south of the Southern Karana zone line. 29.0 min respawn. The entrance to the underwater tunnel leading to the tower can be found at Loc (2587, 1551, -113). Deep is nearby but does not aggro. NOTE: Spawn percentage appears to be accurate. I camped this spot for 17 hours trying to get Clean Lakewater for Druid epic, leading to about 35 spawn cycles for Bergurgle and placeholders; got Bergurgle 7 times which is right about 20% of the time. Happy hunting!"
  },
  "Shmendrik Lavawalker": {
    "name": "Shmendrik Lavawalker",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 3614,
      "x": 0
    },
    "note": "100% @. When killed, a spirit of flame is spawned."
  },
  "A Spirit of Flame": {
    "name": "A Spirit of Flame",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 3614,
      "x": 0
    },
    "note": "Spawn triggered upon the death of Shmendrik Lavawalker. When spawned, a spirit of flame will attack the closest entity (may include Natasha Whitewater; beware)."
  },
  "Natasha Whitewater": {
    "name": "Natasha Whitewater",
    "zone": "Lake Rathetear / Timorous Deep",
    "loc": {
      "y": -11600,
      "x": -2190,
      "z": 70
    },
    "note": "In Timorous Deep. Spawns in the nearby cabin instead of directly on top of Shmendrik Lavawalker. Timorous Deep version is spawned by giving Omat Vastsea the Blood Soaked Plasmatic Priest Robe"
  },
  "Omat Vastsea": {
    "name": "Omat Vastsea",
    "zone": "Timorous Deep",
    "loc": {
      "y": -11567,
      "x": -2227
    },
    "note": "This priest of the Triumvuriate of Water is a primary protagonist in the Cleric Epic Quest. He can be found on the left side of the hut inside the Hidden Oasis on the far south end of Timorous Deep. (swim through the first hidden underwater passage -11550, -3800. The middle island has another underwater passage at -11310, -1322)"
  },
  "A Seeker": {
    "name": "A Seeker",
    "zone": "Temple of Solusek Ro",
    "loc": {
      "y": 326,
      "x": 38,
      "z": 29
    },
    "note": "Level 2. There are several seekers present in the Temple of Ro, but only one is the correct one for the cleric epic quest. The correct seeker for the cleric 1.0 is a human male seeker located in a small throne room on the second floor. The 1.0 seeker spawns to the left of the dais at 9 A.M. game time, replacing a keeper, and despawns at 9 P.M game time, being replaced by a keeper again. When the Coral Statue of Tarew Marr is turned in to this seeker he will attack. Fight him in the hallway to avoid unwanted adds. Once killed he will respawn again in roughly 6 minutes (2 hours game time) if it's still daytime."
  },
  "A Plasmatic Priest": {
    "name": "A Plasmatic Priest",
    "zone": "Temple of Solusek Ro",
    "loc": {
      "y": 330,
      "x": 40
    },
    "note": "A target for the Cleric Epic Quest spawned by giving a specific a seeker (330, 40, 30) a Coral Statue of Tarew. He is KOS. Casts Complete Heal, Reckoning, Annul Magic, and Word Divine; the last one is a PBAE that can affect mobs around the priest causing them to attack him which could result in the quest being failed, and so he is often fought away from mobs usually at the zoneline. He does not have particularly impressive resists, but he does summon. This fight is easy with a small group of 60s. Will despawn if not engaged within 10 minutes. Will not despawn while engaged (2/13/13 patch). Unfearable? EDIT 8/289/2024: The placeholder is on a six minute respawn timer. We fought him inside the room both times with one full group and a single 60 druid. We had high DPS on the first fight and took him down in less than a minute and before he cast his PBAoE. The second fight we were short our rogue and the 60 druid, and he got one PBAoE off. The two other mobs in the room agro'd on us. The adds are green at 51 and they went down quickly, although we took faction hits from them. Both adds dropped Darkwood Staffs, Robe to the Keeper, and one dropped Human Blood."
  },
  "Lord Gimblox": {
    "name": "Lord Gimblox",
    "zone": "Solusek's Eye",
    "loc": {
      "y": -796,
      "x": -367
    },
    "note": "Spawns in the Throne Room, between 17 and 18 on wiki map. He spawns on the left side (when sitting on the throne and facing the room). He is an uncommon spawn, so unless you are lucky you can expect to have to clear several placeholders before he appears. To find him, travel a short distance from the entrance and go through the hole with a single goblin (or take the longerish way around, on the left, with that swinging axe trap). Go through that mini room before dropping down. Go through the door, then through the large gate, then through the door on the right. Go straight up two flights of stairs, and all the way straight, through a false wall. Take a left at the end of this hallway. Enter the door on left, at the end of the next hallway, and then you'll find the throne room through one more door, straight ahead. This room contains a throne, but Lord Gimblox does not spawn on it (he spawns to the left of it, if you sit on the throne and face into the room)."
  },
  "Naxot Deepwater": {
    "name": "Naxot Deepwater",
    "zone": "Burning Woods",
    "loc": {
      "y": 3400,
      "x": -2150
    },
    "note": "An Iksar member of the Triumvirate missionaries. Stumbled upon the Plasmatic Priests' secret affiliation with the sarnaks. Should spawn at 6pm and despawn at 6am game time. Also despawns on turn in."
  },
  "Ixiblat Fer": {
    "name": "Ixiblat Fer",
    "zone": "Burning Woods",
    "loc": {
      "y": -1800,
      "x": 1940
    },
    "note": "Slowable, Snareable easily with Druid Epic, Casts AE fire spells. Does not despawn."
  },
  "Overking Bathezid": {
    "name": "Overking Bathezid",
    "zone": "Chardok",
    "loc": {
      "y": -839,
      "x": 960
    },
    "note": "Overlord of Chardok City. Bathezid is a rather tame opponent as compared to the queen. He casts wizard spells but will also CH. Procs Fiery Death, a 400 DMG + 1 slot dispel AOE"
  },
  "Zordak Ragefire": {
    "name": "Zordak Ragefire",
    "zone": "Nagafen's Lair",
    "loc": {
      "y": -1434,
      "x": -825
    },
    "note": "This non-agressive vendor is part of the Cleric epic. Handing him the Shimmering Pearl* initiates a short monologue. Back away immediately after turning in the pearl. Zordak will first respawn as a KoS (human) version. After killing the aggressive human version, the KoS dragon Zordakalicus Ragefire will spawn. Can respawn multiple times after a single Nagafen death."
  },
  "Jhassad Oceanson": {
    "name": "Jhassad Oceanson",
    "zone": "Timorous Deep",
    "loc": {
      "y": -11915,
      "x": -1736
    },
    "note": "This is the high priest that conducts the summoning of the Avatar of Water"
  },
  "Avatar of Water": {
    "name": "Avatar of Water",
    "zone": "Timorous Deep",
    "loc": {
      "y": -11770,
      "x": -2115
    },
    "note": "The corporeal form of the triumvirate: Povar, E`ci, and Tarew Marr. Ignores Feign Death Update 27/02/2023 - Killed with 10 people. No DT. Does not ignore FD. Immune to movement speed effects. Hits 575, Flurries. Casts wizard spells."
  },
  "Telin Darkforest": {
    "name": "Telin Darkforest",
    "zone": "Burning Woods",
    "loc": {
      "y": 2958,
      "x": 2758
    },
    "note": "50% @ Green 8/18/2021: (3239, 2861). This NPC is located in the north west corner of the zone. He starts both the druid and ranger epic quests. If you are a druid or ranger you can hail him first. After, you need to say : \"what action\" and he will give you a note. If he doesn't, then your faction is too low. Faction can be built up fast by doing the muffin-quest for Pandos in West Freeport. Once your faction with Pandos is kindly, then your faction with Telin should be kindly too, meaning you'll be able to receive the \"worn note\" to start the quest for your epic. (Just Wolf form takes from Apprehensively to Amiable; don't need Faction item 08/29/2024) (Ornate neck Faction plus wolf form went from apprehensively to amiably and he provided the note 01/29/2023)"
  },
  "Faelin Bloodbriar": {
    "name": "Faelin Bloodbriar",
    "zone": "Greater Faydark",
    "loc": {
      "y": 1515,
      "x": 555
    },
    "note": "Either the orc pawn PH or Faelin will spawn at pos 1515, pos 555. Respawn timer is 7 minutes with roughly 10% chance that it will be Faelin. Be prepared to spend a few hours here, for some it takes just 1, for others up to 9. Faelin will despawn immediately after turning in the worn note."
  },
  "Giz X`Tin": {
    "name": "Giz X`Tin",
    "zone": "Kithicor Forest",
    "loc": {
      "y": 1199,
      "x": 1340
    },
    "note": "In return for Faelin`s Ring he gives you the Dark Metal Coin. A Teir`Dal Reaver will spawn when you hand in the ring. Be prepared to run. He is likely a 4 or 6 hour spawn. 09/01/14: Tracked him to be standing on 1310, 1251 at 10pm game time for a few seconds then proceeds to walk north east and stands at 1461, 1096 for a few seconds and then proceeds to walk east. Presumably continues to do this in a circular fashion. 05/18/19: Found him at about 1310, 1251 at 10am. 8/15/25: Found him at 1171, 541 as the undead spawned. Upon handing in the ring: \"Giz X`Tin flips you a coin after he recognizes the ring. 'It seems we have a mutual 'acquaintance.' The coin repays an old debt. You don't have to worry about what that is. Luckily, Lord Innoruuk has informed me of your coming and your desires. Fortunately, I have all the answers you require right here at the end of my friend's blade. I think I'll be paying my old 'friend' a visit.\""
  },
  "Althele": {
    "name": "Althele",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": -3658,
      "x": -1593
    },
    "note": "100% @. When Starting Druid/Ranger Epic turn in make sure and be Amiable or better (Lost turn in item being Indifferent) Can use Wolf Form (30 Aug 2024)."
  },
  "Sionae": {
    "name": "Sionae",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": -2590,
      "x": -1600
    },
    "note": "?. Once you hand in to Athele, the other druids spawn one by one as you do your hand-ins. Just wait a minute, check track after each one"
  },
  "Nuien": {
    "name": "Nuien",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": -3650,
      "x": 300
    },
    "note": "Once you hand in to Athele, the other druids spawn one by one as you do your hand-ins. Just wait a minute, check track after each one"
  },
  "Teloa": {
    "name": "Teloa",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": -3800,
      "x": -2860
    },
    "note": "The last person you hand the Braided Grass Amulet to for the Druid Epic Quest and the Ranger Epic Quest. When you hand her the amulet three dark elves that you need to intercept and kill spawn in the middle of the zone directly north of Althele and sprint at almost SoW speed south towards Althele. DON'T LET THEM REACH ALTHELE, she and the other druids will likely kill the dark elves, leaving behind no tome and setting you back to the beginning of the Shiny Tin Bowl section."
  },
  "Dark Elf Corruptor": {
    "name": "Dark Elf Corruptor",
    "zone": "East Karana",
    "loc": {
      "y": -775,
      "x": -1400
    },
    "note": "He is a level 45 Necromancer who runs really fast when spawned, almost SOW fast. He and two Dark Elf Reavers spawn around -775, -1400 and then run south. It's recommended to wait on the south face of the hill south of their spawn point and track them as they run your direction. You can easily solo pull the Corruptor with Harmony. At some point he shouts across the zone \"We come for you, fools. Your reign of weakness over the power of the lands comes to and end now!\"."
  },
  "Ella Foodcrafter": {
    "name": "Ella Foodcrafter",
    "zone": "Misty Thicket",
    "loc": {
      "y": -886,
      "x": -1912
    },
    "note": "Ella Foodcrafter is not a static spawn: she runs around the southeast end of zone. Unsure if the turn-in to Ella Foodcrafter (Runecrested Bowl and Hardened Mixture) is Multiquestable."
  },
  "Alrik Farsight": {
    "name": "Alrik Farsight",
    "zone": "Timorous Deep",
    "loc": {
      "y": -6361,
      "x": 2831
    },
    "note": "50% @. To trigger Alrik handing you the Crushed Pot, ask him \"how do you make an ancient bowl\" and then \"i will take the artifact\""
  },
  "Farios Elianos": {
    "name": "Farios Elianos",
    "zone": "South Felwithe",
    "loc": {
      "y": 375,
      "x": -846
    },
    "note": "100% @. Max melee hit 140. Can cast a fire AOE among other spells. Likely casts a mage shield on himself, resulting in higher MR than an average lv50 mob. Dispel if needed."
  },
  "Merchant Nora": {
    "name": "Merchant Nora",
    "zone": "Northern Felwithe",
    "loc": {
      "y": 144,
      "x": -414
    },
    "note": "Sells the four metal bars and a kit for Jewelcraft. Inside the \"Shop of All Holds\" in Northern Felwithe"
  },
  "Merdan Fleetfoot": {
    "name": "Merdan Fleetfoot",
    "zone": "Surefall Glade",
    "loc": {
      "y": 243,
      "x": -70
    },
    "note": "100% @."
  },
  "a human skeleton": {
    "name": "A human skeleton",
    "zone": "Trakanon's Teeth,Karnor's Castle,City of Mist,Frontier Mountains",
    "loc": {
      "y": 275,
      "x": -3802
    },
    "note": "100% @. Spawns in a few different zones, each spawn is a different mob, quest relevant ones are listed here with location. There are multiple versions of this mob with the same name for different purposes: ==== Concussion Spell Quest ==== * Hampton, a human skeleton, is located along the zone wall of Trakanon's Teeth location 270, -3800. Hand him the correct bottle to receive a Bottle of Swirling Smoke, which identifies as Hampton's Soul. He is friendly and you can do this hand-in by yourself. * Ryla, a human skeleton, is located in a jail cell in Karnor's Castle just south of the \"hand\" room. Loc is 100,-590, 38. Give the correct bottle to the skeleton to receive a Bottle of Swirling Smoke, which identifies as Ryla's Soul. He is KoS and you will need an enchanter or necromancer to charm him before you can do the turn-in. ** This version is on VS faction, not necessarily KoS. ** From zone-in, run all the way back and go left (into room 5). Take the stairs in room 5 up top and head north to the castle edge (room 7). Turn right and run all the way back to the wall, turn right, past room 10 (hands), then left and right again at the corner. Half way down this hallway to your right are the jail cells. He is in the second cell on the right. * Mardon, a human skeleton, is located in the City of Mist at location 136, -641, 77. Give the correct bottle to the skeleton to receive a Bottle of Swirling Smoke, which identifies as Mardon's Soul. He is KoS and you will need an enchanter or necromancer to charm him before you can do the turn-in. ==== Ranger Epic Quest & Druid Epic Quest ==== * (Name?), a human skeleton, is located in the Frontier Mountains at location -265, -572, 67 outside the giant fort along the western wall. Give the Wood Painting to the skeleton to receive a Silver Chained Locket. It is for the Ranger and Druid Epic Quests. When handed the Painting, the following text occurs: \"a human skeleton begins to crack and disintegrate, its body collapsing into a pile of dust that scatters into the winds. On the ground you notice a locket on a fine, thin chain which you pick up.\""
  },
  "Niera Farbreeze": {
    "name": "Niera Farbreeze",
    "zone": "Surefall Glade",
    "loc": {
      "y": 111.34,
      "x": -188.16,
      "z": 1.9
    },
    "note": "Casts Stinging Swarm, Careless Lightning, Healing, Cancel Magic and Flame Lick."
  },
  "a black reaver": {
    "name": "A black reaver",
    "zone": "City of Mist"
  },
  "Kinlo Strongarm": {
    "name": "Kinlo Strongarm",
    "zone": "North Kaladim",
    "loc": {
      "y": 347,
      "x": -178
    },
    "note": "Kinlo Strongarm's Jade Reaver turn-in quest (Druid and Ranger epics) works at apprehensive or better faction. His hails still require indifferent. WARNING: Some parts of the Ranger Epic Quest may require higher than apprehensive. Kinlo ate a Ranger's Hammer of the Ancients turn-in, with apprehensive con, on 23 June 2017. -You can sneak behind Kinlo Strongarm to turn in the Hammer of the Ancients safely. He only needs indifferent faction or better. If you want to farm faction, 30 belts and 8 shoulderpads from Crushbone took my ranger from apprehensive to amiable. ****11/13/24 was apprehensive without sneak, but sneaking to get him Indiff then turning in was successful and yielded the ore / spawned Usbak --- be careful not to hail him and turn him around before you turn in if doing this method*** -Although I got the message \"Kinlo Strongarm will not speak to you\" from hails, I turned in Jade Reaver at apprehensive 5/19/20 and he still gave the enchanted clay. -Druid (lvl 47) Apprehensive. Got the message \"Kinlo Strongarm will not speak to you\", I turned in Jade Reaver and he gave me the enchanted clay 9/11/22."
  },
  "Venril Sathir Remains": {
    "name": "Venril Sathirs remains",
    "zone": "Karnor's Castle",
    "loc": {
      "y": -77,
      "x": -553
    },
    "note": "100% @. To spawn Venril Sathir, you need to give Venril Sathirs remains a Summoned: Firefly Globe which will spawn Spirit of Venril Sathir. You then give Spirit of Venril Sathir a Spell: Resurrection spawning Venril Sathir. Note that the Firefly Globe can only be summoned at night (7 p.m. - 4 a.m. game time), so you will likely need to cast the spell before forming your raid. Be careful not to cast Harmony / Pacify / Memory Blur on or near VSR, he will resist and aggro! The same is true for Enchanter's Alliance clicky. It will agro him. He cannot be mem-blurred. If you agro him, sit and die quickly! Spawning note: A real Venril Sathir spawn will cause VSR to de-spawn, and VSR will respawn 24 Hours +/- (2 Hour Variance) after real VS dies. Otherwise the timers for the 2 mobs are entirely separate. VSR will continue to spawn every 24 Hours +/- (2 Hour Variance) each time it is killed or de-spawned until VS respawns. If the spawned version of Venril Sathir is not killed within 20 minutes, he will despawn naturally."
  },
  "Spirit of Venril Sathir": {
    "name": "Spirit of Venril Sathir",
    "zone": "Karnor's Castle"
  },
  "Venril Sathir": {
    "name": "Venril Sathir",
    "zone": "Karnor's Castle",
    "loc": {
      "y": -91,
      "x": -778
    },
    "note": "100% @. Venril Sathir, chief of the Kunzar and a powerful necromancer, united the five Iksar tribes into the Sebilisian Empire to conquer most of Kunark. In an attempt to cheat death, Venril Sathir had his essence imbued into a jewel. His heir, Rile Sathir, betrayed Venril Sathir, discarding the jewel and seizing his power. [http://everquest.allakhazam.com/wiki/venril_sathir] This new rising power eventually attracted the attention of the Lords of the Ring of Scale , deep within Veeshan's Peak. It was the mighty Trakanon who took it upon himself to bring war to the hubristic Iksar Empire. The leader of the Ring of Scale, Jaled'Dar, cast down Ganak Sathir, presumably banishing him to another plane of existence. Venril Sathir has been resurrected and now focuses on regaining the Iksar throne from his stronghold in Karnor's Castle. He has raised an army of undead and lycanthropes, and has allied with a faction of dark elves in The Overthere. The Main items in his loot table are the Leggings for the various Kunark Class specific armor, as well as a line of two handed blunt staves for casters. * Patch change 20 Feb, 2012: Venril Sathir has a slightly greater chance of dropping 2 pairs of greaves. * Patch change 8 Oct, 2013: Venril Sathir is now a Warrior class. * Patch change 18 Jan, 2014: increased Venril Sathir's deadly lifetap proc chance from 36%->50%. * Patch change 27 Apr, 2014: Venril Sathir always drops two Pulsing Green Stones. * Patch change 01 Nov 2015: Venril Sathirs remains NOTE: The normally respawning Venril Sathir no longer drops Pulsing Green Stones. It has been moved to the Venril Sathir that is spawned from a turn in to Venril Sathirs remains, this triggered spawn will now always drop two Pulsing Green Stones and nothing else. Venril Sathir and and the Venril Sathir spawned from Venril Sathir's Remains are identical mobs, with the exception of their loot table and spawn mechanics. (Ed: The spawned version of Venril Sathir also has a much lower proc rate.) A triggered Venril Sathir will despawn after 20 minutes. == Strategy == Summons. All but immune to spells, with only wizard lures having a chance to land. Does not Death Touch. Casts Deadly Lifetap (1500 hp tap) via procs on 50% of melee hits and presents the primary challenge of this fight. Besides dealing tremendous damage, the lifetaps will heal Venril, making the usual zerg tactics untenable. Having the tank equip a 2-hander such as Rod of Lamentation or Jagged Blade of War will reduce Venril's number of ripostes, and thus fewer lifetap procs. Runes on the tank will also block the lifetap's healing effect on Venril, so multiple Enchanters casting runes in a rotation chain will simplify the fight considerably. Position melee in the back and flanks to prevent them from creating more ripostes and being lifetapped. Venril is often pulled to the large three story room before his lair. If he is positioned under one of the catwalks, there is a bug where he may warp up onto that catwalk. After that, he may continue meleeing people within range or run to the back of the room and jump back down on the floor."
  },
  "Foloal Stormforest": {
    "name": "Foloal Stormforest",
    "zone": "Firiona Vie",
    "loc": {
      "y": -3390,
      "x": 3482
    },
    "note": "Head back to Foloal and give her the Softly Glowing Stone and Pulsing Green Stone. Foloal Stormforest blinks and carefully takes the stones from you, cautiously scratching the jagged green stone against the other. Its skin seems to shiver and flake at the contact and eventually begins to shine brightly. 'With the gem nature's balance is complete. Take the stone and walk your path. Blade or lightning caller, burning sword or the mother's walk.' You get a Warmly Glowing Stone (identifies as \"Nature's Balance Completed\"). (TIP: I had the Pulsing Green Stone Multiquested by a KOS Iksar Warrior - We had an enchanter Charm Foloal (becoming indiffrent to us) and the MULTIQUEST Worked - Just confirming for anyone.)"
  },
  "corrupted wooly mammoth": {
    "name": "Corrupted wooly mammoth",
    "zone": "Everfrost Peaks"
  },
  "corrupted shaman": {
    "name": "Corrupted shaman",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 2800,
      "x": 160
    },
    "note": "When the Tainted Aquagoblin is killed, the Corrupted shaman will spawn right where the tainted died. Does not always spawn after the tainted goblin has died. Estimated 3% chance of Tainted spawn, and 12% chance to get a Corrupted from a Tainted kill. YMMV"
  },
  "corrupted hill giant": {
    "name": "Corrupted hill giant",
    "zone": "Rathe Mountains",
    "loc": {
      "y": 3127,
      "x": -1253
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Withered treant": {
    "name": "Withered treant",
    "zone": "Northern Karana",
    "loc": {
      "y": 1209,
      "x": -1070
    },
    "note": "100% @. This is the quest giver for the collection portion of the Cleansed Spirit of Antonica used in the Druid Epic Quest. He requests that you bring him a Chunk of Tundra looted from the Corrupted wooly mammoth in Everfrost Peaks, Clean Lakewater obtained by killing the Corrupted Shaman in Lake Rathetear and lastly the Ancient Rock you get when killing the Corrupted hill giant found in Rathe Mountains. Upon giving him the above items he will reward the player with his Warm Pulsing Treant Heart and then despawn. His heart should then be taken to Yeka Ias in Southern Karana to receive the Cleansed Spirit of Antonica. Completed at apprehensive."
  },
  "Yeka Ias": {
    "name": "Yeka Ias",
    "zone": "Southern Karana",
    "loc": {
      "y": 2335,
      "x": -2350
    },
    "note": "100% @. Hand him the Warm Pulsing Treant Heart in exchange for the Cleansed Spirit of Antonica."
  },
  "Corrupted Seahorse": {
    "name": "Corrupted Seahorse",
    "zone": "Kedge Keep"
  },
  "Corrupted seafury cyclops": {
    "name": "Corrupted seafury cyclops",
    "zone": "Ocean of Tears"
  },
  "Corrupted brownie": {
    "name": "Corrupted brownie",
    "zone": "Lesser Faydark",
    "loc": {
      "y": 1220,
      "x": 600
    },
    "note": "(1650, 450), (0, 0). You will have to run around and kill the 3 Brownie Scouts, then sit near the small tree ~loc (0, 0). 1 Brownie Scout will spawn there. 7 minute respawn. Kill it till tainted brownie spawns (it will respawn after 7 minutes, not immediately on the death of the scout). Also, 2 brownies spawn farther away at (2nd spawn near 1220 , 600.), (3rd spawn near 1650, 450.), clear these 2 other spawns to increase chance of spawning tainted. Corrupted can be snared and feared, but he summons. Medium difficulty, a trio of mid-50s should be able to handle him if he is kept feared. Soloable by a 60 druid if you have the ganas. He likes to cast Starfire. If you will have his attention, you should have high fire resist. ===Lore=== Brownies live all over the island continent of Faydwer and are more rarely found traveling far and wide from there. Most often, however, they are found in the Faydark Forest, where their isolationist communities keep to themselves in the darkest corners of the great woods. While not an evil or immoral race as a rule, brownies are so fiercely xenophobic and territorial that they usually attack interlopers on sight. Brownies are short and lean, typically wearing clothing that matches the underbrush or trees in color. They have tanned and ruddy complexions and dark hair, and commonly wear face paint for decoration."
  },
  "Pained Unicorn": {
    "name": "Pained Unicorn",
    "zone": "Lesser Faydark",
    "loc": {
      "y": 1307,
      "x": -1218
    },
    "note": "Hits in the high 100s, summons. Highly magic resistant. Spawns on crest of hill in between Gfay and Steamfont zones. Take a diagonal path from either zoneline to the other and you should see the ridge that it spawns on, if not the unicorn itself. He is on Soldiers of Tunare faction. This faction can be raised with the Muffin for Pandos quest. Hand him the Kedge Cave Crystals that drops from the Corrupted Seahorse in Kedge Keep, the Ocean of Tears Seavines looted from a Corrupted seafury cyclops in the Ocean of Tears, and the Green Heartwood Branch obtained from destroying the Corrupted brownie found in Lesser Faydark to receive his Gleaming Unicorn Horn. The pained unicorn will not despawn like the other NPCs in this quest. You must then take the horn to Silox Azrix found in Ak'Anon (2009, -2620) to receive the Cleansed Spirit of Faydwer *Turn in did not work at level 35. Make sure he responds to the quest text. *Sneak turn in with indifferent confirmed to work."
  },
  "Silox Azrix": {
    "name": "Silox Azrix",
    "zone": "Ak'Anon",
    "loc": {
      "y": 2009,
      "x": -262
    },
    "note": "50% @. Silox Azrix is a gnome cleric that is practicing evil magics. You will receive the Cleansed Spirit of Faydwer for turning in the Gleaming Unicorn Horn that you received from Pained Unicorn. He despawns after you hand him the Gleaming Unicorn Horn."
  },
  "Ulump Pujluk": {
    "name": "Ulump Pujluk",
    "zone": "Swamp of No Hope",
    "loc": {
      "y": -111,
      "x": -1760
    },
    "note": "100% @. Simple to fight. Resistant to virtually all magic, so better off fighting with an all melee group or a charm pet. Flees at low health. With Malo and tash, some dots and nukes will land. Root can land but with very limited duration. Druid Epic Snare WILL land after multiple attempts. Mob has high regeneration. (Looks like about 250hp regen per tick)"
  },
  "Corrupted Gorilla": {
    "name": "Corrupted gorilla",
    "zone": "Emerald Jungle"
  },
  "Corrupted barracuda": {
    "name": "Corrupted barracuda",
    "zone": "Lake of Ill Omen",
    "loc": {
      "y": -824,
      "x": 143
    },
    "note": "(-900, -830), (-1351, -761). Kill a deepwater barracuda until tainted barracuda spawns. Kill tainted barracuda to spawn corrupted barracuda. Not 100% chance to spawn corrupted."
  },
  "Dolgin Codslayer": {
    "name": "Dolgin Codslayer",
    "zone": "Timorous Deep",
    "loc": {
      "y": -11840,
      "x": -1855
    },
    "note": "Druid Epic Nature's Walker Scimitar: Triggers summoned Faydedar upon turn-in of Froglok Essence, which is returned back to you. The triggered spawn will pop in the lake of water next to the dwarf upon turn-in. The respawn timer here used to list him as a 14hr repop but we killed him at 5pm EST and I returned around 4:30am (approx 11.5hr later) and he was up so I'm listing him as 10-12hr repop. More investigation needed. The spawn timer for him is listed as 11 hours 15 minutes exactly based on old Everquest archives. (4/22/2025): Just confirmed that he seems to have some sort of variance in his respawn timer, although the specifics are unknown. You say, 'Hail, Dolgin Codslayer' Dolgin Codslayer says 'ARGH! Dangit, ya scared me! Tread cautiously, friend. This here place ain't as friendly as it seems. There's a beast lurkin' in this here puddle.' You say, 'A beast?' Dolgin Codslayer says 'Aye lad. I seen it come from the ocean. It was fightin' a group of adventurers, not unlike yerself. The battle raged long and hard, and at the end the beast lay still among countless of the adventurers bodies. They left assuming it had been slain by their hands. But, once they left, I seen it come crawlin in this here place. They called it by the name Fayde, er, Fayred. Hrmm. What was it they called it? I can't remember.' You say, 'Faydedar?' Dolgin Codslayer says 'Ya! That's what they called it! A great water dragon as the legends say. Only way to find him now is to lure him out from hiding. Not that I would suggest doin such a thing. The dern thing's broken, bleedin, and cornered. That's a mighty deadly position to put a critter in if ye ask me. Course if yer wantin' to try it, there might be a way. Ya willin to risk it?' You say, 'I will risk it.' Dolgin Codslayer says 'Well jus' before that there beast ended up in combat, I watched him from the shores. Only reason he got into such a mess was 'cause of his belly. He swam right into those adventurers chasin' down a wandering froglok. You wanna catch a fish, use the right bait. If only we had us some frogloks essence, then mebbe he'd come out agin. But I must warn ye laddies that the bloke over by the inn already warned me to leave all the natural critters in this here oasis in peace. He might get right mad if he sees a battle brewin' here.' Hand him the froglok essence looted from Ulump. Dolgin Codslayer says 'What's this? Egads! It's perfect. Now all we gotta do is hope he bites.' Dolgin takes a little of the essence and smears it on a piece of bread. He places the bait into the water and watches intently.' He will hand it back and despawn. Faydedar will now be spawned in the water in the middle of the oasis. Kill it to loot a Pod of Seawater (identifies as \"Seawater from Timorous\")."
  },
  "Faydedar": {
    "name": "Faydedar",
    "zone": "Timorous Deep"
  },
  "Nekexin Virulence": {
    "name": "Nekexin Virulence",
    "zone": "The Overthere",
    "loc": {
      "y": 3670,
      "x": -795
    },
    "note": "100% @. Hand him Froglok Essence, Pod of Seawater, Green Tree Bark and Pure Lakewater to get the Cleansed Spirit of Kunark. He will despawn upon hand in of the quest items. His respawn is 2 hours from hand in. Faction hits unconfirmed."
  },
  "Xanuusus": {
    "name": "Xanuusus",
    "zone": "Northern Karana",
    "loc": {
      "y": 1354,
      "x": 499
    },
    "note": "50% @. This named treant is located in the northern part of the zone and his main purpose is for both the druid and ranger epic quests. He is also involved in minor delivery quest the originates in Rivervale."
  },
  "Stofo Olan": {
    "name": "Stofo Olan",
    "zone": "Erudin",
    "loc": {
      "y": -1109,
      "x": -70
    },
    "note": "50% @ Stofo Olan is located in the Vasty Deep INN in Erudin 2nd floor last room on the right."
  },
  "Reania Jukle": {
    "name": "Reania Jukle",
    "zone": "Qeynos Aqueducts",
    "loc": {
      "y": 393,
      "x": -389
    },
    "note": ""
  },
  "a ghoul scribe": {
    "name": "A ghoul scribe",
    "zone": "Lower Guk",
    "loc": {
      "y": 538,
      "x": -711
    },
    "note": "14% @. Placeholder has a 28 minute spawn timer."
  },
  "the ghoul arch magus": {
    "name": "The ghoul arch magi",
    "zone": "Lower Guk",
    "loc": {
      "y": 1184,
      "x": -832
    },
    "note": "25% @. The arch mage is an excellent hunt for high level casters in LGuk. PH is a jin ghoul wizard or a kor ghoul wizard. There are two spawns in this room. Magi spawns in front of the bookcase."
  },
  "Rilgor Plegnog": {
    "name": "Rilgor Plegnog",
    "zone": "Ak'Anon",
    "loc": {
      "y": 2024,
      "x": -579
    },
    "note": ""
  },
  "Chrislin Baker": {
    "name": "Chrislin Baker",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": 1048,
      "x": -1989
    },
    "note": "Located by herself in a house in the village in the far northwestern corner of West Karana. Handing her a Quill and a Piece of Parchment will spawn Thrackin Griften across the zone."
  },
  "Vessel Drozlin": {
    "name": "Vessel Drozlin",
    "zone": "East Cabilis",
    "loc": {
      "y": 591,
      "x": -826
    },
    "note": "100% @. Found deep in the tunnels under the Shaman guild in East Cabilis. Video for the route through the Shaman guild [https://www.youtube.com/watch?v=WMoJTJUOb1M] You can also use the water tunnels if you know how to jump up at the right spot. Swim into the tunnels under the docks, when you get to the second opening ( around loc 407, -741 ) look straight up and swim upwards into the wall, you will eventually bounce up onto the ledge (There's no need to hit the jump key). The room he spawns in has a stationary low level Scorpion or Mosquito once you pass through the one-way door. NOTE: If you have your FPS set too high in options (61-100) you cannot bounce onto the ledge. Turn down your FPS in the options to 60 and you should be able to jump out. Vessel is extremely resistant to magic, so much so that many people believe he is immune to magic. Do not expect to land any spells that don't have a very large resist modifier (Lifetaps, Lures, Theft of Thought). Due to his extremely high MR he is unable to be slowed. Flees at 15% hp. He casts a 16 point Damage Shield and other SK buffs on himself, dispel is recommended."
  },
  "Verina Tomb": {
    "name": "Verina Tomb",
    "zone": "Neriak Third Gate",
    "loc": {
      "y": 411,
      "x": -812
    },
    "note": "100% @ ** 411, -812|. Verina Tomb is found inside the Cleric's guild across from Dvis Zexus. She spawns alone in the south room of Cleric's guild. Has NO faction hits. Other NPCs do not assist her. Upon spawning, she immediately buffs herself with Fortitude , Symbol of Marzin (+1060 HP combined), and other high level Cleric buffs likely including Resist Magic. She casts Complete Heal, Annul Magic, Reckoning and other high level Cleric spells. She casts Gate at low health. This mob spawns at 411, -812. Respawn Timer for live EQ is 13 hours after being killed and from 5 to 14 hours after zone or server reset, need timer confirmed for EQL."
  },
  "Prince Selrach Di'zok": {
    "name": "Prince Selrach Di'zok",
    "zone": "Chardok",
    "loc": {
      "y": -560,
      "x": 1360
    },
    "note": "The prince of Chardok. A rogue is required to lockpick the door. Can be managed with a single group. Torp shaman + chanter dps is highly recommended. Boltrans + torch on Royal Guards (no haste) works. The room can be pacified somewhat easily (on a lvl 60 w/ 255 cha). Notice that 'Selrach' is an anagram of Charles, hence the wordplay with royalty. Prince can be slowed somewhat easily with tash or malo. Consider pulling with dispell, since he will be buffed up from sorrounding mobs. CAN BE SNARED with Druid Epic! 10/6/25 01/09-2022 Confirmed Torpor drop"
  },
  "Joren Nobleheart": {
    "name": "Joren Nobleheart",
    "zone": "Southern Felwithe",
    "loc": {
      "y": 736,
      "x": -658
    },
    "note": "Attacks very quickly. Very high MR. Maybe immune to slow? Was only able to land a single magic based spell on him over the course of multiple kills even with tash and malo on. Does not social with any other mob in the zone so he can be brought to zone easily. Respawn time is longer than rest of zone."
  },
  "Bozlum Blossom": {
    "name": "Bozlum Blossom",
    "zone": "Oggok",
    "loc": {
      "y": 540,
      "x": 1166
    },
    "note": "Found in the top back of the caves across from Brokk Boxtripper"
  },
  "Brokk Boxtripper": {
    "name": "Brokk Boxtripper",
    "zone": "Oggok",
    "loc": {
      "y": 220,
      "x": 378
    },
    "note": ""
  },
  "Modani Qu`Loni": {
    "name": "Modani Qu`Loni",
    "zone": "The Overthere",
    "loc": {
      "y": 536,
      "x": -902
    },
    "note": "15%@. Find him in the temple with two entrances in the east branch of the valley. The entrance to this temple is at around 225, -750. Not in the pair of opposing temples labeled B and C on the map. He spawns in the north east room at (536, -902), then paths into the looping hallway, circumnavigating the temple. - He can also spawn in the static spawn locations (have seen this more than once). He has a 40 minute placeholder with the same route. He is a very rare spawn. To get him to spawn without lowering faction, charm the placeholder and send it into other scorpikis. Let it die, then Blanket of Forgetfulness to drop aggro. Wait 40 minutes and repeat. Modani is indifferent to all as an enchanter epic quest NPC. The surrounding scorpikis are on the Venril Sathir Faction. To get an Enchanters Sack, hand him Jeb's Seal, then say \"I need a sack\""
  },
  "Cazel": {
    "name": "Cazel",
    "zone": "Oasis of Marr",
    "loc": {
      "y": 1553,
      "x": 782
    },
    "note": "50% @ , 50% @ (-236, -667). Sand Giant that roams from Orc Highway to Docks and along the water to Nro. Sometimes looks like a cyclops. Kill Strategy Snare-able, Fear-able and Slow-able (As of 6/2017, 54 enchanter was able to land every spell. Test kill performed on 11/12/15 with 59 & 60 ENC and a blue con necromancer (to the 59 Enc). Charm Gadallion (gypsy camp) and Innkeep Tizzy (near SRO zoneline) in zone and haste them, otherwise overcoming his regen is near impossible. Both of these mobs are level 45 and do max 120 damage per attack. Tash and put your 2 pets on him. Let your snarer snare him (doesn't need to be a necro) and fear him while he's snared. Try to slow while he's feared. Repeat. Took about 5-10 minutes and charm only broke on 1 pet so your mileage may vary. Note that this strategy is unlikely to work (as of 2021) due to changes to these NPC's damage; they can no longer out-dps Cazel's regen. Update: As of June, 2017 a 54 Enchanter was able to land every spell including Shiftless Deeds on first try. Did not seem heavily resistant as described. Update: As of July, 2020 -- duoed w/ 60 Ench & 60 Wiz. snare in from wiz. ench fear w/ Gadallion + vog. wizard chain sunstriking. Died in a about 2 mins. Update: On December 18th of 2021, Unchainedfury (Blue) solo'd Cazel without a charm pet, without fearing, and while tanking with dots. Died in about 3 mins and 40 seconds. https://www.youtube.com/watch?v=1mzqZTHbkRg Update: 27/10/22 Innkeeper Tizzy and Gadallion appear to be uncharmable. \"Kill Strategy\" is now void. Update: 07/2023 Duoed ench 60 + Nec 60. Super easy. Snare(nec) / fear (ench), nec pet + zumaik ench pet. 5 min fight. The \"Fear\" spell will work on Cazel as he is level 51. This means a cleric with the Terror Forged Mask can keep him continuously feared. Update: On December 18th of 2021, Unchainedfury (Blue) solo'd Cazel without a charm pet, without fearing, and while tanking with dots. Died in about 3 mins and 40 seconds. https://www.youtube.com/watch?v=1mzqZTHbkRg"
  },
  "Mizzle Gepple": {
    "name": "Clockwork VIIX",
    "zone": "Ak'Anon",
    "loc": {
      "y": 2027,
      "x": -517
    },
    "note": "100% @. Part of the enchanter epic also known as Mizzle Gepple ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  "Nadia Starfeast": {
    "name": "Nadia Starfeast",
    "zone": "Firiona Vie",
    "loc": {
      "y": -3872,
      "x": 2525
    },
    "note": "50% @. /say Dull Diamond/Sapphire/Ruby/Emerald to Nadia to receive gem. Gems are for enchanter epic quest. Primary faction seems to be Inhabitants of Firiona Vie"
  },
  "Spectral librarian": {
    "name": "Spectral librarian",
    "zone": "Kaesora",
    "loc": {
      "y": 116,
      "x": -415
    },
    "note": "20% @. Multiple placeholders inside the library. Clear everything inside for the best results. He is a relatively rare spawn, so expect to spend 3+ hours here."
  },
  "Enraged spectral librarian": {
    "name": "Enraged spectral librarian",
    "zone": "Kaesora"
  },
  "Felia Goldenwing": {
    "name": "Felia Goldenwing",
    "zone": "Skyfire Mountains",
    "loc": {
      "y": -3604,
      "x": 957
    },
    "note": "3% @ , (-2380, 145). Part of the Skyfire Named Cycle. Enchanters can get to Dubious with the wurms/drakes (not the feasters) and are able to turn in to her without charm (I was indif to her)."
  },
  "Wraith of Jaxion": {
    "name": "Wraith of Jaxion",
    "zone": "City of Mist",
    "loc": {
      "y": 160,
      "x": 226
    },
    "note": "5% @. The Wraith of Jaxion has a gyrating goo PH that circles the OUTSIDE portion of the third and final floating building. If the Wraith (not PH) is up it is possible to pull him from the see-through ramp with the 3 oozes on it to the ground floor without other mobs agroing. Start off by targeting the Wraith then get SoW (or Jboots), levitate and invis. Then from near the top of the second section of the ramp (but below where the undead pathers can see you) run off toward the wraith (He may be pathing behind the building so you may need to float back to the top of the ramp until he's pathing toward you on the right side of the ledge). Start spamming Tash and once it starts casting stop running and recast. If it hits him drop down near the Lhranc building and wait for him to port to you. Mez, charm and do your hand in. Note that he will path back past the moat group so give them a heads up before you leave. This may work to pull the PH as well but I didn't try it. A second method similar to above requires use of the ramp but rather than chancing a miss, head straight to the back of the zone from the ledge (with levitate or Air illusion) of the first building on the 3rd level (top of the ramp). Run from there towards the Jaxion spawn point but left just a bit. This should place you on top of the \"Moat\" building with the reaver in it. You will not aggro the building. There is a flat ledge area which you can use to stop falling incase you miss it, plus a very high pointed roof where you can levitate and just past the edge, cast your tash on the roaming PH/Jaxion. Jaxion will float down to you, and you can complete this portion. This location gives you a chance to try again if you fail the first time with tash. ****NOTE**** Not sure what happens if he isn't killed from this location. The way I did it on my level 50 enchanter was to get air illusion (for long lasting lev), IVU myself and got someone to invis me. I went upto the balcony in temple, used lev trick to get onto the flag pole, then lev trick again to get onto the 2nd floor. I ran to the top of the pointy building and then ran to the see-thru ramp. I got all the way to the floating building with the locked door. used lev trick to get on top of the door (note: just walking onto the right side fence post works), ran around the building to get to the ramp on the other side. then I just ran up to wraith, waited for the pathing for him to be out of LOS of other mobs - mezz, tash, charm and floated off to the zone in. An easy way to do PH is to simply Allure the gyrating goo and have tell him to attack any mob on the nearby bridge. It will fall to the lower level and quickly aggro several mobs."
  },
  "Impaler Tzilug": {
    "name": "Impaler Tzilug",
    "zone": "The Overthere",
    "loc": {
      "y": -27,
      "x": 1359
    },
    "note": "50% @. Flanked by four static Scorpikis Guardians and one roaming up and down the length of the ramp. For a solo method on obtaining the , use collaboration or similar faction spell on any scorpikis in the area. If you haven't ruined faction with Venril Sathir, you should start pretty close to non-KOS (went from apprehensive to aimiable with collaboration). This will allow you to walk down with no worries, right up to Impaler Tzilug. Once here, make sure you have Gate and Allure memmed and make sure you have SoW or Jboots active. Might also be a good time to get Rune/Berserker Strength up (all I had up was Berserker Strength since I was out of regeants). Get a \"trade\" (or hand-in) window up for Impaler with the dull emerald in it (can't hand items to pets that are fighting) but DO NOT press \"give.\" Doing so will cause you to lose the gem. Cast charm on him and once he is your pet, quickly finish the \"give\" and he will hand you the enchanted gem. Run out of the tunnels leaving him behind to fight and gate at your earliest convenience. This method no longer works (5/14/2020) you can not cast with a trade window open. Simply pacify the 3 closests Guardians and then charm Tzilug. It totally works, I self invis with trade on all the time, and charmed this guy today with trade open (12/27/2023). Also, if you're Amiable after faction spell, you can just turn it in without charming, did this today also (12/27/2023) (confirmed 08/22/24)."
  },
  "Wraith of a Shissir": {
    "name": "Wraith of a Shissir",
    "zone": "Plane of Fear",
    "loc": {
      "y": 804,
      "x": 413
    },
    "note": "The wraith spawns every 72 hours, or when Cazic Thule spawns and repops the zone. Spawn location: in the top of the temple, in the room at the top of the ramp (between two phoboplasms). This temple also contains a portal which is the only exit out of the zone. She sees invis - due to the nature of her temple and its \"cosmetic\" walls, any attempting to invis through to the exit portal will find themselves aggroing the Wraith and, by extension, the entire temple. If she is up, do not attempt to invis out of the zone unless you have a death wish. Wraith of a Shissir is a bottleneck in the Enchanter Epic. A Druid with maxxed out tracking skill was able to track her from the zone in."
  },
  "the Ghost of Kindle": {
    "name": "The Ghost of Kindle",
    "zone": "The Hole",
    "loc": {
      "y": 950,
      "x": 410
    },
    "note": "100% @. Does not aggro players like other ghosts in the area (cons indifferent). Shares a room with a few other hostile ghosts. Is not a rare spawn, always up and has no placeholder. Will respawn every 21 minutes and 30 seconds. The small area up the stairs before the last door leading to her is a safe spot. Easiest way to solo her is setup there with a fully buffed animation and pull her with a lull crit fail, other ghosts won't assist. If you slow her, animation can handle her with a little help. Just make sure you're ready to throw mezzes when she will try to chain heal at 40%. You can always use a revenant pet and lull the room but some revenants are immune to charm/mez, so while not impossible it can make things a lot more complicated if you're unlucky with spawn RNG."
  },
  "a forsaken revenant": {
    "name": "A Forsaken Revenant",
    "zone": "Plane of Hate"
  },
  "The Tangrin": {
    "name": "The Tangrin",
    "zone": "Field of Bone",
    "loc": {
      "y": 3454,
      "x": 2920
    },
    "note": "20% @. A huge, highly territorial monkey inhabiting an island off of the Field of Bone's northwestern coast. Has a 20 second stun with a 12 second recast time, and an aggro radius half the size of the island he roams. Flees at 15%. Drops Sands of the Mystics which is used in the Enchanter epic quest. Approach with care. Added 1 month into Kunark. The Tangrin can be soloed or easily duo'd. With Boltran's Agacerie (conflicting reports on if Allure can land, there might be a level variation or just unlucky RNG) use Trooper Taer or alternatively Crusader Bodli as your pet, and don't forget to haste them. They are extremely magic resistant so plan accordingly. Once the Tangrin is slowed with Forlorn Deeds, the charmed guard will dominate the fight, finishing it with more than 75% HP. However, if charm breaks mid-fight, you'll be summoned by The Tangrin and you must quickly land a Rapture or Leatherfoot Raider Skullcap out before you get hit with Monkey Stun or it could mean instant death. At 60, a cleric can keep the Tangrin almost completely stunlocked with Enforced Reverence, Stun Command, and Sound of Force. (some research & confirmation on The Tangrin's MR would be appreciated!) The building on The Tangrin's island does not block line of sight. So don't sit there. Sit on the shore across his island. Alternate strategy - did this on 02/26/2026: Bind in Warsliks Woods at the Field of Bone zoneline and preload Dictate (boltran can do but dictate is unresistible fixed duration). Go back in field of bone and run to the cabilis area and find trooper Taer. Rapture/tash/charm/haste/weaponize/-mr him, sit him and zone him in cabilis. Go back to FOB and Rapture/tash him (in case rapture blurs) and bolt to tangrin island to get a headstart. He has about sow pot runspeed so make sure you use one or he'll gain on you with just jboots but you might make it anyway with a good headstart. Run to the cliff close to Tangrin's island and wait for Taer, when he shows up rapture and charm him. Lev down to tangrin island and stick Taer on tangrin then tash/root/slow tangrin and gate back to WW. Then zone back into FOB and sprint where you engaged them, they'll still be fighting and tangrin will be at around 40% HP so just wait for tangrin to be at around 10% hp and drop dictate on Taer and let him finish it. Loot and Gate before dictate breaks. At first I tried to aggro train tangrin on Taer but I got stunned from like 150 range and barely capped out alive, dangerous idea. Then I invis'ed and ran Taer over tangrin but tangrin won't aggro Taer. Being a guard, Taer is super aggressive though so when you gate him while he fights tangrin he'll immediately reaggro tangrin and keep the fight going even if you cleared aggro with gate."
  },
  "Polzin Mrid": {
    "name": "Polzin Mrid",
    "zone": "The Hole",
    "loc": {
      "y": 216,
      "x": -63
    },
    "note": "50% @. As spoken by Jeb Lumsed: Master of the Phantasms - he is the last one you will seek out. Polzin is native to Erudin, however, after the incident near Paineel, no one has heard from him. I hope that he is well. Located in the mushroom shop at location 12 on the map."
  },
  "Rykas": {
    "name": "Rykas",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 958,
      "x": -652
    },
    "note": "100% @."
  },
  "Jahsohn Aksot": {
    "name": "Jahsohn Aksot",
    "zone": "West Commonlands",
    "loc": {
      "y": 1067,
      "x": 3216
    },
    "note": "100% @ and wanders in front of Kithicor Forest Zone line. Magician Epic Quest NPC, does not appear to spawn in EQ Legends (yet)."
  },
  "enraged dread wolf": {
    "name": "Enraged dread wolf",
    "zone": "Kithicor Forest"
  },
  "a tentacle terror (Unrest)": {
    "name": "A tentacle terror (Unrest)",
    "zone": "The Estate of Unrest",
    "loc": {
      "y": 496,
      "x": 119
    },
    "note": "25% @."
  },
  "a bloodthirsty ghoul": {
    "name": "A bloodthirsty ghoul",
    "zone": "Lower Guk",
    "loc": {
      "y": 1072,
      "x": -1073
    },
    "note": "A frenzied ghoul room - and (1070, -1040). Found in the same room as a frenzied ghoul, these are only slightly weaker."
  },
  "a gypsy dancer": {
    "name": "A gypsy dancer",
    "zone": "Mistmoore Castle",
    "loc": {
      "y": -160,
      "x": 23
    },
    "note": "Upon being aggroed says, 'Help me! Let me out! Don't Leave me here!'"
  },
  "Lava elemental": {
    "name": "Lava elemental",
    "zone": "Solusek's Eye",
    "loc": {
      "y": -136,
      "x": -968
    },
    "note": "CWG Model MB is the PH. Lava Elemental is a rare spawn. They (the lava elemental and ph) will path into the lava pillar and swim under the world if not snared. If you lack a snare I recommend pulling them back through the tunnel, past the rock trap and into the door where you enter. It will aggro another gnome which will prevent the PH from running (this will not prevent lava elemental from running but it will give you more time to kill it before it tries to jump in the lava pillar). Note: The mobs are not swimming under the world. Below the lava pillar, a tunnel filled with lava connects to the lava at -250, -980. Mob can be targeted without direct line of sight and pulled using certain spell lines (e.g. Cancel Magic)."
  },
  "famished ravener": {
    "name": "Famished ravener",
    "zone": "Kaesora",
    "loc": {
      "y": -224,
      "x": 281
    },
    "note": "100% @."
  },
  "A Fairy Guard": {
    "name": "A Fairy Guard",
    "zone": "Lesser Faydark",
    "loc": {
      "y": 1094,
      "x": 3618
    },
    "note": "100% @. Placeholder for Princess Joleena that spawns next to Gearheart. Despawns at 8am/8pm."
  },
  "Walnan": {
    "name": "Walnan",
    "zone": "Butcherblock Mountains",
    "loc": {
      "y": 2518,
      "x": -252
    },
    "note": "Paths between Kaladim/Butcherblock Docks - Spawns. High Elf Magician. Paths between Kaladim and the butcherblock docks. Doesn't summon a pet. No faction hits. 6:00 respawn timer Casts: Flame Arc, Elemental Maelstrom, Malaisement, Shock of Swords, Nullify Magic"
  },
  "A Magician": {
    "name": "A Magician",
    "zone": "Najena"
  },
  "Akksstaff": {
    "name": "Akksstaff",
    "zone": "Najena",
    "loc": {
      "y": 372,
      "x": -73
    },
    "note": "Indifferent to all?"
  },
  "Neh'Ashiir": {
    "name": "Neh`Ashiir",
    "zone": "City of Mist"
  },
  "Gylton": {
    "name": "Gylton",
    "zone": "Burning Woods",
    "loc": {
      "y": 3475,
      "x": -2852
    },
    "note": "Spawns at 3490, -2855 (between some trees), shares spawn with Entalon. Paths to around 2500, 1500 (check north of giant fort, near Skyfire, and towards west wall. High fire resist. Soloable by a 54 Magician. Will glow if carrying the embers."
  },
  "Undertow": {
    "name": "Undertow",
    "zone": "Kedge Keep",
    "loc": {
      "y": 259,
      "x": -288
    },
    "note": "50% @. A powerful seahorse Wizard in the depths of Kedge Keep. In classic, its Squallsurge Shawl was best in slot for pure casters. During the Kunark era, Undertow became the target of Magicians seeking to obtain the Orb of Mastery. *Confirmed* Soloable by only the most daring of Magicians...enter at your own risk... Has a placeholder, you can tell by whether there's two or three seahorses in his lair. Seems to be about 50/50 spawn. Ideally camp out at the very top of his temple so you can avoid the fish and pirahnas."
  },
  "Jennus Lyklobar": {
    "name": "Jennus Lyklobar",
    "zone": "Skyfire Mountains",
    "loc": {
      "y": 4175,
      "x": 2860
    },
    "note": "100% @. Rewards the Element of Fire."
  },
  "Magi P`Tasa": {
    "name": "Magi P`Tasa",
    "zone": "Plane of Hate",
    "loc": {
      "y": -371,
      "x": -164
    },
    "note": "Upstairs. A bigger, meaner male Forsaken Revenant. ===Lore=== Most sorcerers of Hate serve Innoruuk in one of two key roles: The first involves planar travel, shuttling Innoruuk's minions to and from his home plane to both ally and enemy lands — and so is limited to wizards of Hate. The second but no less important role of the sorcerers of Hate is to cast great spells of destruction against the enemies of Innoruuk, whether those enemies are intruders on the Plane of Hate itself or those the sorcerers have been sent to assault elsewhere."
  },
  "Slixin Klex": {
    "name": "Slixin Klex",
    "zone": "Burning Woods",
    "loc": {
      "y": -678,
      "x": -1129
    },
    "note": "100% @. 22 Min Respawn. Patch change 20 Feb 2012: Nilbog: Slixin Klex will drop Dirt of Underfoot more often. (Magician Epic)."
  },
  "Tiblner Milnik": {
    "name": "Tiblner Milnik",
    "zone": "Firiona Vie",
    "loc": {
      "y": -1675,
      "x": 2252
    },
    "note": "100% @ (Wanders)."
  },
  "Captain Rottgrime": {
    "name": "Captain Rottgrime",
    "zone": "The Overthere",
    "loc": {
      "y": 2452,
      "x": 2162
    },
    "note": "100% @."
  },
  "Tarbul Earthstrider": {
    "name": "Tarbul Earthstrider",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": 728,
      "x": -2347
    },
    "note": "(-2300,-790). PH is the roaming a rogue lion which spawns at at 725,-2350 and roams through -1151,-1028 and -1347, -2217. 6 minute respawn Rogue lion spawn locations: P -1307.26, -2313.25, 132.36, 0, 0, 3, a_rogue_lion P 1054.06, -1243.40, 3.19, 0, 0, 3, a_rogue_lion P -1989.95, -359.86, 22.39, 0, 0, 3, a_rogue_lion P -484.22, -660.33, 11.62, 0, 0, 3, a_rogue_lion P -178.63, 40.32, 3.19, 0, 0, 3, a_rogue_lion P -2767.67, -136.50, 63.37, 0, 0, 3, a_rogue_lion P -1453.43, -1247.24, 367.12, 0, 0, 3, a_rogue_lion P 843.36, -1971.57, 59.11, 0, 0, 3, a_rogue_lion P 669.02, -1669.26, 18.59, 0, 0, 3, a_rogue_lion P -1658.69, -2474.26, 166.26, 0, 0, 3, a_rogue_lion P -2145.59, 130.09, 3.25, 0, 0, 3, a_rogue_lion P -1833.68, -67.96, 6.25, 0, 0, 3, a_rogue_lion P -1988.22, -359.67, 22.65, 0, 0, 3, a_rogue_lion P -2203.68, -2661.24, 176.97, 0, 0, 3, a_rogue_lion P -2730.73, -2680.62, 38.94, 0, 0, 3, a_rogue_lion P -2941.86, -819.14, 33.76, 0, 0, 3, a_rogue_lion P 1184.92, -302.74, 3.18, 0, 0, 3, a_rogue_lion P 1387.54, -2330.27, 3.19, 0, 0, 3, a_rogue_lion P 1426.92, 640.82, -13.24, 0, 0, 3, a_rogue_lion P 713.29, 133.76, 3.19, 0, 0, 3, a_rogue_lion P 87.17, -1281.97, 3.19, 0, 0, 3, a_rogue_lion"
  },
  "Jinalis Andir": {
    "name": "Jinalis Andir",
    "zone": "Dagnor's Cauldron",
    "loc": {
      "y": -444,
      "x": -1999
    },
    "note": "50% @. Hangs out in Dagnor's Cauldron on the East Side of the lake. Does not see invisible. Evil races/religions may be attacked on sight by Jinalis, but share wolf form or other faction tricks work for her turn-in. You say, 'Hail Jinalis Andir.' Jinalis Andir says \"Let us dispense with pleasantries. I am Jinalis, as you know. I imagine you want to control the Elements. The Element of Water, which I possess, is the most powerful of the Elements...\" The rest of her dialogue is in the Magician Epic Quest"
  },
  "Quillmane": {
    "name": "Quillmane",
    "zone": "Southern Karana"
  },
  "Kihun Solstin": {
    "name": "Kihun Solstin",
    "zone": "Plane of Sky"
  },
  "Master of Elements": {
    "name": "Master of Elements",
    "zone": "Plane of Sky"
  },
  "Targin the Rock": {
    "name": "Targin the Rock",
    "zone": "Nagafen's Lair",
    "loc": {
      "y": -533,
      "x": -345
    },
    "note": "100% @. Spawns LEFT of the throne in the Kings room, /waypoint -541, -352, -59. Killing the PH will provide additional spawn chances, similar to Raster of Guk. * PH is a \"a greater kobold\" * 19m 21s respawn timer."
  },
  "Raster of Guk": {
    "name": "Raster of Guk",
    "zone": "Lower Guk",
    "loc": {
      "y": 944,
      "x": -387
    },
    "note": "100% @. Rare spawn on the Live Side, near a minotaur elder, in the very back of the room up the steps (next to the firepot). Raster or his PH will despawn at 8am game time and respawn at 10am game time. Given the 28 minute respawn time in Lower Guk, there are 3 PH/Raster possibilities per EQ day (72 minutes) which should roughly correspond to the in-game times below if the PHs are killed promptly. Note that these are estimates based on PH time-of-death except for the 10am respawn. 8am - Despawn if anything is up 10am - Respawn - Kill this PH 7pm to 8pm - Respawn - Kill this PH 4am to 5am - Respawn - You can either kill or leave this PH up. A mob will spawn at 10am regardless Raster can spawn on any pop not just at 10am. A mob does not have to be present for the 10am spawn to occur. For Further Tips see the talk page NOTE: It is in your best interest to kill the 10 AM spawn as swiftly as possible, and each spawn thereafter immediately as well: Except for the first (\"10am\"), each will simply spawn 28 minutes after the previous dies. If you have taken too long to kill each spawn and the last (\"4am to 5am\") doesn't pop until 7am (and it's Raster), then you're risking him despawning (at 8am) while you are still fighting him. In essence, you have a total combat window of 10 minutes to kill three spawns. Don't waste 9 minutes on the first two spawns and then watch Raster appear for 30 seconds before he despawns on you. Use the time to your advantage!"
  },
  "Brother Qwinn": {
    "name": "Brother Qwinn",
    "zone": "Southern Karana",
    "loc": {
      "y": -4833,
      "x": 3176
    },
    "note": "Monk Guildmaster involved in the Robe of the Lost Circle Quest. Spawns at -4833, 3176 and wanders the zone. Placeholders include: * Narra Tanith * an escaped Splitpaw gnoll The placeholders are on a 20 minute timer."
  },
  "Brother Zephyl": {
    "name": "Brother Zephyl",
    "zone": "Rathe Mountains"
  },
  "an iksar betrayer": {
    "name": "An iksar betrayer",
    "zone": "Chardok",
    "loc": {
      "y": -325,
      "x": -25
    },
    "note": "Approximately. He is slowable, rootable, and can be soloed by a 60 Enchanter. The spawn I killed (3/30/18) had a max hit of 164. The nearby Sarnak will completely buff him haste/sow/etc so dispell to pull is recommended. Post Revamp: Iksar Betrayer now spawns at the bridge, approximately (-325, -25), with a static placeholder at that location. The spawn point you want is opposite of the Bridgekeeper/Ancient guardian spawn point and next to the bridge against a wall. PH's can be a skelly, a sarnak, or a dog."
  },
  "a drolvarg pawbuster": {
    "name": "A Drolvarg Pawbuster",
    "zone": "Karnor's Castle",
    "loc": {
      "y": 105,
      "x": -590
    },
    "note": "100% @. Third spawn from the left when counting from door. Has Placeholders."
  },
  "Brother Balatin": {
    "name": "Brother Balatin",
    "zone": "Dreadlands",
    "loc": {
      "y": 973,
      "x": 9055
    },
    "note": "10% @. Brother Balatin is a uncommon spawn at the 'undead city' in the Dreadlands. Its placeholder is a plaguebone skeleton. He will despawn after exactly 10 minutes if not aggroed, kite if necessary."
  },
  "Tomekeeper Danl": {
    "name": "Tomekeeper Danl",
    "zone": "Erudin",
    "loc": {
      "y": -1093,
      "x": -243
    },
    "note": "Located inside the Library of Erudin on the second floor."
  },
  "Lheao": {
    "name": "Lheao",
    "zone": "Timorous Deep",
    "loc": {
      "y": -11630,
      "x": -2210
    },
    "note": "100% @."
  },
  "a fire sprite": {
    "name": "A fire sprite",
    "zone": "Lavastorm Mountains",
    "loc": {
      "y": 901,
      "x": 332
    },
    "note": "100% @. By telling a fire sprite \"I challenge Eejag\" you cause Eejag to spawn. He wanders across the zone, mainly in the western half, occasionally by the druid rings. Clearing a fire imps should get him spawned."
  },
  "a presence": {
    "name": "A presence",
    "zone": "Plane of Sky",
    "loc": {
      "y": 286,
      "x": 1043
    },
    "note": "100% @. Causes Gwan to spawn when you hand a presence the Charred Scale. Green: 2h respawn time, spawning Gwan has no effect on others sky mobs. Cannot be charmed - Dictate doesn't land. Is mezzable however if you accidentally pull."
  },
  "a sleeping ogre": {
    "name": "A Sleeping Ogre",
    "zone": "Mines of Nurga",
    "loc": {
      "y": -1498,
      "x": -68
    },
    "note": "Also found at (-1380, 245). Giving a Breath of Gwan to the sleeping ogre spawns Trunt (Important Note: a sleeping ogre must con indifferently, so you need to use sneak from behind to turn it in), a level 59 Ogre who is one of the last parts of the monk epic. The sleeping ogre's respawn is 3 hours. The sleeping ogre is KOS and has been known to despawn shortly after being agro'd. Make certain players don't accidentally agro him while forming up for the kill."
  },
  "Deep": {
    "name": "Deep",
    "zone": "Lake Rathetear, Lake of Ill Omen",
    "loc": {
      "y": -807,
      "x": -542
    },
    "note": "Description Needed. Depop after 80 minutes as long as she isn't engaged."
  },
  "Astral Projection (Overthere)": {
    "name": "Astral Projection (Overthere)",
    "zone": "The Overthere",
    "loc": {
      "y": 767,
      "x": 855
    },
    "note": "Part of Monk Epic Quest. After handing him Trunt's Head, he hands you Eye of Kaiaren."
  },
  "Astral Projection (LOIO)": {
    "name": "Astral Projection (LOIO)",
    "zone": "Lake of Ill Omen",
    "loc": {
      "y": -1913,
      "x": -952
    },
    "note": "100% @. When hailed, this astral projection will turn towards you, establish direct eye contact, and make it abundantly clear that he is ignoring you. Astral Projection will despawn when handed the Eye of Kaiaren and respawn 3 hours later."
  },
  "Kaiaren": {
    "name": "Kaiaren",
    "zone": "Trakanon's Teeth",
    "loc": {
      "y": 305,
      "x": 2470
    },
    "note": "100% @ (-1632, -2832). The name of two different NPCs that are critical to the final 3 steps of the Monk Epic Quest. * The first of the final 3 turn ins will be to Mad Kaiaren, near the Sebilis ruins. * The second and final turn ins are both to Sane Kaiaren, just west of the lake."
  },
  "Venenzi Oberzendi": {
    "name": "Venenzi Oberzendi",
    "zone": "Nektulos Forest",
    "loc": {
      "y": -1073.54,
      "x": -685.43
    },
    "note": "100% @. Starts the Necromancer Epic questline. She is located on the northern bank of the river, east of the bridge. Seems to be indifferent to all."
  },
  "Kazen Fecae": {
    "name": "Kazen Fecae",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 342,
      "x": -1589
    },
    "note": "100% @. Kazen has a permanent and lull bypassing one-way aggro link with Emkel Kabae, a nearby piddly hitting but ice comet casting level 55 wizard . You can't kill Kazen without Emkel aggroing but you can, however, kill Emkel Kabae without aggroing Kazen. He might aggro if you train Emkel right on top of him, but they're far enough away that you'd really have to try to mess it up. Spawns a bone golem nearby upon death. ;Strategy Bring at least one 60 Warrior to tank Kazen and a dedicated Cleric to Complete Heal them. Kazen hits hard (1400 max! ouch!) so defensive discipline is recommended. Bring at least a few lv60 dps. An Enchanter can assist with haste buffs & by charming Misty Tekchita for additional dps. Wizard lures land on Kazen. Before engaging Kazen, kill Emkel Kabae nearby. He is a level 55 Wizard with a permanent one-way aggro link to Kazen. If you don't you'll be forced to fight both at once. He has significantly less health than Kazen, doesn't hit nearly as hard, and will go down quickly. Now onto Kazen. Kazen casts high level Necromancer spells, but having a few of those land will hurt far less than if he were punching you. Don't bother sieving. Have your Warrior tank engage with defensive discipline and have your Cleric Complete Heal them as necessary. Defensive disc will last the entire fight with decent dps, and so long as your Cleric is able to land CH in a timely fashion Kazen will go down without issue. He flees at 20% which makes things even easier. Immediately after he dies a bone golem will spawn on his corpse; have your tank pick it up. The next three fights are simple tank'n'spanks. ;\"What if I don't want to kill Kazen?\" If doing the quest the \"intended\" way, you'll eventually need to farm Grand Herbalist Mak`ha (post revamp), or Royal Sarnak Herbalist (pre revamp) for a Manisi Herb. Mak`ha has an 18 minute respawn, but if your server is pre-revamp you're looking at a 2 hour respawn timer on the royal herbalist. ;Testimonial \"We killed him today with what was honestly extreme overkill. 60 warrior tank (backup tank unneeded), two clerics, druid, a few necros, and a lot of dps; about 16 people total? Kazen spent quite a bit of the fight casting spells and, with defensive disc and prompt but not frantic heals, our tank was never in danger and didn't drop below 60% health. Kazen's average hit was 300-400. Don't underestimate that max hit, but don't be scared by it.\""
  },
  "Sir Edwin Motte": {
    "name": "Sir Edwin Motte",
    "zone": "various (Qeynos Hills)",
    "loc": {
      "y": 1432,
      "x": -2239
    },
    "note": "3% @. Location in Qeynos Hill: Every 24 minutes a mob spawns at the West Karana zoneline and spends the next three minutes walking toward Qeynos, where, upon arrival, it despawns. Sir Edwin Motte shares this spawn with several NPCs, including Guard Westyn, Wyle Bimlin, Isabella Cellus, Lars McMannus, Tol Nicelot, Gornolin, Crumpy Irontoe, Talym Shoontar, Barn Bloodstone, and Buzzlin Bornahm, all of whom seem to be characters from other zones on a trip to Qeynos. Location in East Freeport: Seafarer's Roost Loc. -209.17, -886.15 Shares this spawn with several NPCs, including Groflah Steadirt, Trolon Lightleer there is a faction hit. Sir Edwin Motte will despawn at somepoint in this location East Freeport: Seafarer's Roost so down him quickly. Spotted up in the same room with Trolon Lightleer also spawned not 10 feet away,beware a 60 bard can spawn in place of Trolon and bash your head in (8/19/19) Location in Highpass Hold: Tiger's Roar Tavern (need verification) Location in Rathe Mountains: (3941.51, -1366.49) Three part inn, near the Feerott zone line. Other PHs that spawn in that same cycle, Bunk Odon, Hogus Dumrmas, Sylp Tyanathin, Fandl Arathin, Jars Legola, Zepin Winsle, Gwynn Marthank, Tal Godin, Rell Ostodl, Peltin Funter, Tann Cellus, Jyle Windstorm - Spawn in the southern room. The placeholders stay up for 45 seconds. They de-spawn, and a new one pops up very quickly. Takes a while for Motte to spawn."
  },
  "Najena (NPC)": {
    "name": "Najena (NPC)",
    "zone": "Najena",
    "loc": {
      "y": 353,
      "x": 105
    },
    "note": "Najena is the Mistress of her namesake dungeon. The PH is an earth elemental. Her respawn time is approx. 19 min. 2 sec or 4 min. 15 sec. in an instance. She has a magician and their pets on either side of her. Najena doesn't always see invis."
  },
  "Emkel Kabae": {
    "name": "Emkel Kabae",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 250,
      "x": -1500
    },
    "note": "~. Spawns near Kazen Fecae. Can be single pulled by a level 60, but pulling Kazen first will get Emkel aggroed. Kill Emkel first."
  },
  "Ssessthrass": {
    "name": "Ssessthrass",
    "zone": "Swamp of No Hope",
    "loc": {
      "y": 3796,
      "x": 1596
    },
    "note": "100% @. Located in a ruined building near the Field of Bone zoneline."
  },
  "Grand Herbalist Mak`ha": {
    "name": "Grand Herbalist Mak`ha",
    "zone": "Chardok",
    "loc": {
      "y": 161,
      "x": 31
    },
    "note": "20% @. Enrages. The Small Manisi Plant is on a separate loot table than the Manisi Herb, Sarnak Parrying Blade, and Jade Meditation Hoop. There is no graphic when he has the Small Manisi Plant. Place holder is a Di`Zok Herbalist, central cabin. Does not drop the Manisi Herb every time. Necromancers looking to do their epic can alternatively fight Kazen Fecae, entirely skipping the need to farm the herb."
  },
  "a bone golem": {
    "name": "A Bone Golem",
    "zone": "Lake Rathetear"
  },
  "a failed apprentice": {
    "name": "A failed apprentice",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 358,
      "x": -1550
    },
    "note": "Dies quick compared to the golem and tortured soul. Spawns following the death of a bone golem as part of the Necromancer Epic. Basic skeleton appearance. Can cast at least a dispel and either a Darkness snare or Flash of Light. Its death spawns a tortured soul."
  },
  "A tortured soul": {
    "name": "A tortured soul",
    "zone": "Lake Rathetear"
  },
  "Drendico Metalbones": {
    "name": "Drendico Metalbones",
    "zone": "Timorous Deep",
    "loc": {
      "y": 6476,
      "x": 3838
    },
    "note": "100% @. Gnome standing on mountainside north of Ogre camp in Timorous Deep. Seen casting Banshee Aura, Vampiric Embrace, and Grim Aura on himself in a repeating cycle. Turn-in NPC for part of necro epic quest."
  },
  "Jzil GSix": {
    "name": "Jzil GSix",
    "zone": "Plane of Sky"
  },
  "An azarack": {
    "name": "An azarack",
    "zone": "Plane of Sky"
  },
  "A gorgalask": {
    "name": "A gorgalask",
    "zone": "Plane of Sky",
    "loc": {
      "y": 838,
      "x": 738
    },
    "note": "100% @."
  },
  "Keeper of Souls": {
    "name": "Keeper of Souls",
    "zone": "Plane of Sky",
    "loc": {
      "y": 774,
      "x": -996
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Innoruuk (God)": {
    "name": "Innoruuk (God)",
    "zone": "Plane of Hate",
    "loc": {
      "y": 230,
      "x": 10,
      "z": 150
    },
    "note": "Innoruuk (\"Inny\") is the God of Hate. He spawns on the second floor of the Plane of Hate. Plane of Hate over went a revamp with the Velious expansion. Innoruuk increased in level to 70. His old loot table was moved to mini bosses, and now has a new loot table of racial only items. Belly Caster. Lure of Ice landed without a single resist. ===Lore=== The Father of Vengeance, Innoruuk, Prince of Hate: He spreads loathing and scorn across all Norrath. From the black heart of the Plane of Hate, Innoruuk tirelessly channels his eternal rage into myriad schemes and plots, seeking to create fierce opposition wherever harmony and tranquility exist. Loathing replaces love, and fury overrides friendship as Innoruuk fosters betrayal, murder, and vengeance within vulnerable mortals — especially those who are already greedy for power, pining for prestige, or hungry for wealth. Many times have the spies of Innoruuk subtly turned supposed allies to blood feuds and even open warfare. Within Innoruuk's vast city of twisting alleys and narrow streets of the Plane of Hate are a horde of abominable constructs, undead, and even scions of Innoruuk's chosen race, the powerful Tier'Dal, administering their dark god's will while maintaining a tireless vigil against invaders. Over time, the Plane of Hate has come to reflect its master's ever-expanding power. Innoruuk's true form stands roughly 60 feet tall, his frame somewhat thin and his head oblong. Innoruuk's faintly bat-like facial features are permanently pulled back into a vicious sneer, while a gaze of his infernal eyes is said to be capable of eliciting open combat between even the best of friends. Innoruuk usually wears finely made, colorful shirts, pants, bright jewelry, and a great dark-colored cloak. Innoruuk is worshiped by the dark elves, or Teir'Dal, who see hatred as the means for achieving anything, when wielded properly. The Teir'Dal are Innoruuk's primary servants on Norrath, masters of vengeance, spying, infiltrating, breeding feuds, and, above all, tormenting their light elven cousins. Among the Teir'Dal, one who sees himself or herself as a victim is laughable, while one who turns a setback into the downfall of the one who wronged them is highly respected. A surprising number of humans and trolls also follow Innoruuk, similarly revering hatred as a tool capable of driving them along the path of greatness. Regardless of race, followers of Innoruuk believe that the stronger their hatred for an object or being, the sweeter their ultimate vengeance and glory will be. Apocryphal tales told by clerics of Innoruuk typically portray individuals suffering some terrible wrong by one of much greater power; the devout individual then channels his or her hatred into growing strong enough to exact a remarkable and dramatic revenge. Innoruuk does occasionally walk the world of Norrath in mortal form, as he enjoys seeing first-hand the raw hatred between two opposing factions; he loves nothing more than starting arguments between friends, or wooing a woman only to treat her cruelly, bringing her to hate him with all her fury. Taking mortal form has resulted in many achievements for the Prince of Hate. However, no achievement has been as rewarding as his greatest victory, when, long ago during the Elder Age, Innoruuk lured the king and queen of Tunare's beloved elves to his home plane. Once there, Innoruuk transformed their rulers into the first Teir'Dal king and queen, souring their pure love for one another into a hatred so strong that Innoruuk was able to create his entire servitor race. === Strategy === High resists. He is possible to slow"
  },
  "Cazic Thule (God)": {
    "name": "Cazic-Thule (God)",
    "zone": "Plane of Fear",
    "loc": {
      "y": 1116,
      "x": -43
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Gkzzallk": {
    "name": "Gkzzallk",
    "zone": "Plane of Sky"
  },
  "thought destroyer": {
    "name": "Thought destroyer",
    "zone": "Plane of Hate",
    "loc": {
      "y": -615,
      "x": -214
    },
    "note": "11% @ ?. Spawns out of the corpse of A scorn banshee. Multiple can spawn in one night. ===Lore=== A scorn banshee (simply one of many names by which such creatures are known, \"scorn\" merely being representative of a cruel, hateful nature) appears as a ragged, insubstantial version of the deceased bard's living form. Its face is twisted in a terrible, hate-filled sneer, and even while singing it manages to fill the air with horrid shrieks, cackles, and wails."
  },
  "Reklon Gnallen": {
    "name": "Reklon Gnallen",
    "zone": "Erudin",
    "loc": {
      "y": -724,
      "x": -89
    },
    "note": "Erudite guildmaster for the Paladins of Erudin. Indifferent faction is required to MQ paladin epic pieces"
  },
  "Keeper of the Tombs": {
    "name": "Keeper of the Tombs",
    "zone": "The Hole",
    "loc": {
      "y": 807,
      "x": 569
    },
    "note": "100% @. Respawn time: 1 week. (1/8/2020) Easy kill for one group of 55 plus. Bring a CC because the spawns to get to him come in 2s or more."
  },
  "Joshua": {
    "name": "Joshua",
    "zone": "West Freeport",
    "loc": {
      "y": -246,
      "x": -706
    },
    "note": "50% @."
  },
  "Kirak Vil": {
    "name": "Kirak Vil",
    "zone": "Nektulos Forest",
    "loc": {
      "y": 2045,
      "x": -791
    },
    "note": "(1658, -724). He wanders with in a small area in front of the Neriak zoneline (in the newbie area). Highly magic resistant. Can be tashed, but not much else lands."
  },
  "Elia the Pure": {
    "name": "Elia the Pure",
    "zone": "Northern Felwithe",
    "loc": {
      "y": 247,
      "x": -713
    },
    "note": "Is KoS to Human Cleric of Innoruuk. Summons."
  },
  "Irak Altil": {
    "name": "Irak Altil",
    "zone": "Plane of Fear",
    "loc": {
      "y": 366,
      "x": -188
    },
    "note": "Wanders between the hourglass and the fallen bell (423, -746). Wandering unattackable skeleton, associated with Paladin Epic Quest."
  },
  "Jaeil the Insane": {
    "name": "Jaeil the Insane",
    "zone": "The Hole",
    "loc": {
      "y": 238,
      "x": 873
    },
    "note": "Slowable. Jaeil the Insane is easily 1 groupable and can be spawn multiple times provided you have the Shiny Tin Bowl. Jaeil the Insane is undead."
  },
  "an essence tamer": {
    "name": "An Essence Tamer",
    "zone": "Plane of Sky"
  },
  "Malka Rale": {
    "name": "Malka Rale",
    "zone": "Qeynos Aqueducts",
    "loc": {
      "y": 475,
      "x": -510
    },
    "note": "Spawns at night (in place of a courier) in the Qeynos Aqueducts at #15 (lower most 15) on the map"
  },
  "Founy Jestands": {
    "name": "Founy Jestands",
    "zone": "North Kaladim",
    "loc": {
      "y": 532,
      "x": 317
    },
    "note": "Standing next to pottery wheel across from the bank in North Kaladim. Despawns every in-game day at 8am, then respawns at 10am. ."
  },
  "Tani N`Mar": {
    "name": "Tani N`Mar",
    "zone": "Neriak Third Gate",
    "loc": {
      "y": 666,
      "x": -1312
    },
    "note": "Dark Elf Rogue guildmaster in Neriak. Despawns at 7pm game time, respawns at 8pm. Either magic immune or extremely magic resistant. Appears to be immune to mez and charm spells. Tested April 2023. Assasinate works fine to cycle him faster. Definitely not 2mil hp (came to test that)"
  },
  "Anson Mcbale": {
    "name": "Anson McBale",
    "zone": "Highpass Hold",
    "loc": {
      "y": 5,
      "x": 325
    },
    "note": "GM rogue hidden away in the smugglers' tunnels near High Keep. He is able to spawn Stanos Herkanor for any rogue of level 50 or higher who tells him they [need to see Stanos]. He has A Smuggler as his placeholder if he has despawned or been killed and a 22 minute respawn time. Take care fighting here, as Cyrla Shadowstepper may assist wither the smuggler or Anson."
  },
  "Eldreth": {
    "name": "Eldreth",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 2623,
      "x": -551
    },
    "note": "50% @. Erudite wizard who is part of the Rogue Epic Quest. Despawns every time a rogue completes the hand-in and then respawns eight hours later. Does not always see invis - 4/24/2025"
  },
  "Yendar Starpyre": {
    "name": "Yendar Starpyre",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": -1469,
      "x": 1719
    },
    "note": "100% @. He hits hard and nukes harder. Don't underestimate him. From his spawn point just north of the druid rings, he paths in a straight line to loc 13, 1706 (north of kobold camps). Then he turns east until he hits the path and follows the path southeast. At the fork in the path near Watchman Halv, he turns left (Northeast) and continues to follow the path. When the path turns left at about loc -700, -245, he heads Southeast and stops at -850, -440. Then he turns around and follows the same path back to his spawn location. Respawn time seems to be ~6-8 hours."
  },
  "General V`ghera": {
    "name": "General V`ghera",
    "zone": "Kithicor Forest",
    "loc": {
      "y": 700,
      "x": 2250
    },
    "note": "The final boss in the rogue epic quest. Procs Soul Devour. Since the recent proc patch changes, he has become a lot tougher; need a lot of healing to take him down. Does not See Invis, but his companions do. Will summon. He seems to attack much faster than the average mob, so do not underestimate his DPS on the tank."
  },
  "The Ishva Mal": {
    "name": "The Ishva Mal",
    "zone": "South Karana & Splitpaw Lair"
  },
  "Oracle of K`Arnon": {
    "name": "Oracle of K`Arnon",
    "zone": "Ocean of Tears",
    "loc": {
      "y": -529,
      "x": -8843
    },
    "note": "100% @. This fellow is the source of that awesome looking blue and gold robe that a lot of casters wear. It has good stats for anyone that can use INT and mana. While he is not particularily difficult, he spawns very very slowly (at about 6 hour intervals). He is guarded by the Guardian of K`Arnon, a level 40-41 Paladin. He is also the bearer of the (unfinished?) Quest for the Tome of Ages."
  },
  "Vilnius the Small": {
    "name": "Vilnius the Small",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": 167,
      "x": -6696
    },
    "note": "Always spawns at night, does not path. Vilnius' placeholder is a brigand or a bandit on the top of the mountain. The brigand, as well as all the bandits, are on the KaranaBandits faction, but Vilnius is indifferent to all. However, Vilnius is not there all the time; he has a placeholder (the aforementioned brigand) who despawns at 7 p.m. game time (the very verge of 8 p.m., before the clock ticks over) each day. Once the brigand despawns, Vilnius will spawn very shortly after and will despawn at 5 a.m. game time. If the brigand is up, don't kill it, just wait until it despawns. If you do kill him, Vilnius won't spawn, and you'll have to wait until the brigand spawns again. This time, let the brigand despawn, and then Vilnius will spawn a little later. Vilnius spawns around 8pm and despawns at 5am Vilnius the Small says, 'Okayge, just because I am short don't mean I can't bounce your Iksar rump all over these hills. Now, do you have something for me, or are you just in search of a rump bouncing?' You say, 'I'm in search of a rump bouncing' Vilinus the Small says, 'My pleasure to oblige you then. Shall I start on the left side or the right side?' He will become hostile and attack you if you say that. Props for sticking to his word, I suppose. Ouch!"
  },
  "Solusek kobold king": {
    "name": "A kobold king",
    "zone": "Nagafen's Lair",
    "loc": {
      "y": -549,
      "x": -362
    },
    "note": "50% @. He spawns beside two solusek kobolds near the other ledges where kobold champion and kobold priest spawn. Caution: He can be healed by the kobold priest, so it's best to either kill the priest first, or pull him out of range."
  },
  "Kobold champion": {
    "name": "Kobold champion",
    "zone": "Nagafen's Lair",
    "loc": {
      "y": -652,
      "x": -345
    },
    "note": "25% @. This mighty warrior is found on the southern ledge of the three ledges that host the other two royals; the kobold priest and solusek kobold king."
  },
  "The froglok king": {
    "name": "The froglok king",
    "zone": "Lower Guk",
    "loc": {
      "y": -105,
      "x": 22
    },
    "note": "20% @. The top frog himself, he is found deep in the depths of Lower Guk, and is guarded by Guk knights. The king is a paladin, and has a ton of hitpoints."
  },
  "Karg Icebear": {
    "name": "Karg IceBear",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 1615,
      "x": -5744
    },
    "note": "He spawns on a hill just west of the gates to Permafrost . His pathing has him roaming in 3 distinct loops before returning to his spawn location outside Permafrost. See the Polar Bear Cloak Quest walkthrough for a description of his route.. A difficult-to-locate Barbarian warrior who roams all across the \"tundra\" area of Everfrost Peaks. He's searching for the finest of polar bear pelts to fashion into cloaks for anyone who can afford them. If you so happen to come across Karg, hand over a Polar Bear Skin and toss him 5pp to complete the Polar Bear Cloak Quest and receive one of his famous cloaks to keep warm in the frigid climate. If you have a Werewolf Talon, give it + 75pp to complete the Lupine Claw Gauntlets Quest and receive Lupine Claw Gauntlets. He can spawn within an hour of being killed or despawning, but he may share a spawn timer with Martar IceBear. Be warned, Karg has an affinity for the mammoths in the region and will attack you if you're spotted hunting Mammoths. Additionally, there seems to be some feud with Tundra Jack, who will attack and kill Karg if their paths should cross."
  },
  "Stanos Herkanor": {
    "name": "Stanos Herkanor",
    "zone": "Highpass Hold",
    "loc": {
      "y": 35,
      "x": 327
    },
    "note": "The man behind the curtain. Stanos heads the powerful smuggling ring which controls Highpass Hold in partnership with the boss of Highkeep, Carson Mccabe. This organization competes with the Circle of Unseen Hands, a human rogue guild based in Qeynos. He is also the father of and rival to Renux Herkanor, and is a central character in the Rogue Epic Quest. Located inside the hidden cave with all the smugglers. Triggered spawn by saying \"I need to see Stanos\" to Anson McBale. Only 50+ Rogues can spawn Stanos."
  },
  "Kurron Ni": {
    "name": "Kurron Ni",
    "zone": "The Overthere",
    "loc": {
      "y": 3248,
      "x": 2207
    },
    "note": "This mysterious Dark Elf has quite an interesting name. Spell it backwards and it's In Norruk! He's the starting NPC for the Shadowknight Epic Quest. Live server patch notes: July 21, 2021: Reduced the respawn time for Kurron Ni from about 84 hours to about 4 hours. : You say, 'Hail, Kurron Ni' : Kurron Ni says, 'Out of my way, stranger, I am on a delicate mission. Interfere with my search and I shall relieve you of your head! Bother me no more.' : You say, 'What do you seek?' : Kurron Ni says 'I have traveled here in hopes of finding a soul worthy of assisting me in completing my mission. : You say, 'I am worthy' : Kurron Ni says 'I doubt it, but I have been wrong before. Before I share with you the details of my mission, however, you must first prove your worthiness. Agreed? : You say, 'Agreed' : Kurron Ni says 'Very well then, my new friend. I have an acquaintance that stands in need of three pieces of Darkforge Armor. He requires the breast, greaves and helm to complete his set. I also must pay back a loan that has come due in the amount of 900 platinum. Return this to me and I shall share with you my dark mission, and the immeasurable reward that will be earned at its completion. Show your face here without fulfilling my request and I will offer you on the altar to Innoruuk himself. Be off!"
  },
  "Duriek Bloodpool": {
    "name": "Duriek Bloodpool",
    "zone": "Paineel",
    "loc": {
      "y": 905,
      "x": -100
    },
    "note": "50% @. Located just before the newbie zone coming in from the Toxx forest. There's a door in the hallway before the newbie zone, go through it, up the stairs, past another door, and he's there."
  },
  "Smaka": {
    "name": "Smaka",
    "zone": "Neriak Foreign Quarter",
    "loc": {
      "y": -335,
      "x": -107
    },
    "note": ""
  },
  "a ratman guard": {
    "name": "A ratman guard",
    "zone": "The Hole"
  },
  "The froglok shin lord": {
    "name": "The froglok shin lord",
    "zone": "Upper Guk",
    "loc": {
      "y": -5,
      "x": 288
    },
    "note": "The Shin Lord is a Paladin (a fact which many Paladins after Ghoulbane find a bit odd), he can lay hands and casts healing. He sometimes is seen wielding Ghoulbane which he uses to ward off the undead frogloks of Lower Guk."
  },
  "Rharzar": {
    "name": "Rharzar",
    "zone": "Rathe Mountains",
    "loc": {
      "y": -1146,
      "x": 1046
    },
    "note": "Rharzar is a rare spawn in the southern-most section of Rathe Mountains. His PH is \"a drake\", which spawns north of Zazamoukh's hill and is the only spawn in the area with a 10:00 timer. Upon spawning, the mob will roam around the hill counter-clockwise. Will run at low health. Casts 50+ cleric spells such as Reckoning. May also have an AE stun, but that needs confirmation. Has a high MR, so fear kiting is not a reliable option. Will CH a LOT. KOS and has a wider aggro radius than usual, so keep your distance! Stuns landed, but did not stop it from casting. Save your mana for damage or heals."
  },
  "An ashenbone drake": {
    "name": "An Ashenbone Drake",
    "zone": "Plane of Hate",
    "loc": {
      "y": -1,
      "x": -263
    },
    "note": "34% @ , (40, -55), (-374, 117). Description needed. ===Lore=== From the skeletal remains of those foolish enough to have invaded the Plane of Hate, Innoruuk occasionally creates a planar construct resembling a dragon made of bones. Infusing this huge creation with the soul of a loyal Teir'Dal follower, as well as a good dose of his own malevolence, he creates a powerful servant with powerful jaws, claws like swords, and a jagged tail, which can also cast spells as a necromancer of considerable power. The roar of an ashenbone drake sounds like a deep, rattling wind, alerting nearby minions of the Prince of Hate when its ire has been aroused. Over 12 feet in height and roughly 25 feet in length (including the tail) on average, ashenbone drakes project a foreboding image when encountered. Their hate aura disrupts even the most organized assaults of Innoruuk's home plane, while the drakes' spells rain decay, toxins, and death upon the ranks of their enemies. Immune to most magical spells, an ashenbone drake is a creature of terrible power. The souls of more powerful Teir'Dal necromancers are crafted into reflectively large and more powerful drakes; dark elves consider it a great honor to be made into such a powerful and immortal servant of their deity. The drakes have a strict hierarchy among their own kind, with titles as follows (in ascending order of rank): ashenbone drake, hatebone drake, ashenbone broodmaster, and hatebone broodlord."
  },
  "Teydar": {
    "name": "Teydar",
    "zone": "Qeynos Aqueducts",
    "loc": {
      "y": 338,
      "x": -409
    },
    "note": "50% @."
  },
  "Lhranc": {
    "name": "Lhranc",
    "zone": "City of Mist",
    "loc": {
      "y": 0,
      "x": 85
    },
    "note": "100% @. Patch change on 18 Jan, 2014: lhranc - spectral iksar form is a shadowknight that casts spells. human form is now a shadowknight, but doesn't cast spells. Greatly increased the proc chance of Soul Devour. Increased HP/MR. Removed his helm/made him larger. Flees at low hp. It should be noted Soul Devour will proc on nearly every hit and cannot be resisted."
  },
  "Marl Kastane": {
    "name": "Marl Kastane",
    "zone": "Kerra Island",
    "loc": {
      "y": 565,
      "x": 63
    },
    "note": "50% @. This guy really knows how to live incognito. Careful not to turn in quest items to his pet!"
  },
  "Gerot Kastane": {
    "name": "Gerot Kastane",
    "zone": "Paineel",
    "loc": {
      "y": 798,
      "x": 670
    },
    "note": "50% @. Description needed. 501 hitpoint Harmtouch"
  },
  "Knarthenne Skurl": {
    "name": "Knarthenne Skurl",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": -5,
      "x": 1148
    },
    "note": "50% @."
  },
  "a mimic": {
    "name": "A mimic",
    "zone": "The Hole",
    "loc": {
      "y": -20,
      "x": 265
    },
    "note": "This chest drops the Cell Key which is given to Caradon to spawn Kyrenna. Key does not always drop, seems to be about a 25% chance. Mimics are always up and on the same spawn timer as rest of zone, located in the dock area in the bank building (The Strong Box) behind a hidden wall at the back. They have no placeholder and are always up. Each spawn is always blue to a level 60."
  },
  "Caradon": {
    "name": "Caradon",
    "zone": "The Hole",
    "loc": {
      "y": 420,
      "x": -190
    },
    "note": "3 Days @. Quest NPC in the Ratman Jail of The Hole. He can be found in the north-east jail cell. DOES NOT NEED TO BE KILLED for SK EPIC!"
  },
  "Kyrenna": {
    "name": "Kyrenna",
    "zone": "The Hole",
    "loc": {
      "y": 420,
      "x": -190
    },
    "note": "Upon spawning Kyrenna, you do not have to kill Caradon. He will agro you but you can FD split Kyrenna away from him and he will revert back to non-KoS. Note that Kyrenna is 100% Magic Immune and will try to CHeal and then run at low HP, so need to push to interrupt and then burn her down before she gets too far. Wizards: Lure of Ice lands at least 75% of the time."
  },
  "Ghost of Glohnor": {
    "name": "Ghost of Glohnor",
    "zone": "The Hole",
    "loc": {
      "y": 787,
      "x": 463
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Mummy of Glohnor": {
    "name": "Mummy of Glohnor",
    "zone": "The Hole",
    "loc": {
      "y": 820,
      "x": 465,
      "z": -680
    },
    "note": "May spawn immediately on the Ghost's location after hand in, be near the graveyard, at the docks in the city, or downstairs in the building next to where you hand in to the ghost. The location seems random."
  },
  "a lesser spirit": {
    "name": "A lesser spirit",
    "zone": "Various"
  },
  "Bondl Felligan": {
    "name": "Bondl Felligan",
    "zone": "North Freeport",
    "loc": {
      "y": 475,
      "x": 580
    },
    "note": "Part of the shaman epic quest. Because of known pathing/scripting issues, he may be located at +30, +480 instead of his usual sewer hangout. Also known to wander to 50, 60 after turning in the Tiny Gem where he ends up in the Jade Tiger Den on the 2nd floor inside the 2nd wooden door on the left in a room with a greater spirit. Presumably considers based the Truespirit faction BUT confirmed he does not give a faction hit when killed. Empty loot table, no coin. Killed with 10x draughts so 6k HP is very plausible. Long respawn, at least over 20 minutes may be hours. 04/25/2023 Blue"
  },
  "a wandering spirit": {
    "name": "A wandering spirit",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": -500,
      "x": -5300
    },
    "note": "100% @. Involved in the Shaman Epic Quest. It looks like a larger than average willowisp and does not emit light. Wanders through most of the zone, but Shaman tend to wait at -500, -5300 for it to path by once every 30 minutes. Be ready to hail lock him before handing in the item."
  },
  "Glaron the Wicked": {
    "name": "Glaron the Wicked",
    "zone": "Rathe Mountains",
    "loc": {
      "y": 2870,
      "x": -1905
    },
    "note": "100% @. He casts Harm Touch, Disease Cloud, Siphon Strength, Heat Blood. Two hour respawn time."
  },
  "Spirit Sentinel": {
    "name": "Spirit Sentinel",
    "zone": "Emerald Jungle",
    "loc": {
      "y": 1235.01,
      "x": 285.34
    },
    "note": "See Below 1235.01, +285.34| AND 3854.30, -687.73|(3854.30, -687.73). Exact locs for Spirit Sentinels in EJ are at: * To start test +1235.01, +285.34 (in the hut, NW from CoM) * +3854.30, -687.73 (underwater, in the lake) If you are here to turn in pelt DO NOT turn it into sentinel underwater."
  },
  "Black Dire": {
    "name": "Black Dire",
    "zone": "Mistmoore Castle",
    "loc": {
      "y": 90,
      "x": -166,
      "z": -222
    },
    "note": "Spawns at the end of the canyon (4 on map) when an advisor is killed. Hits in the 200s, can quad, and harm touches (about 450). Note that despite being in wolf form, this is NOT flagged as an animal and as such is not susceptible to Animal-Only spells. Note that he will despawn about 30 min after being aggroed. On 1/24/2020 he despawned before being aggroed, so the despawn detail may be incorrect. His MR is high, so it is very difficult to slow him. 60 necro and 54 mage killed him, but it was a rough fight. Best to clear all mobs up to the castle entrance from where he spawns, then trigger him. At lvl 60, he resisted 4 snares, but my lifetap dot, splurt and pyro all stuck. Best to send pets/blast him from up on top ledge by castle entrance to buy time before be paths up. He hits as hard as a lvl 58+ mob so he is a super undercon! With Malo/malosini and Tash, it is possible to land a slow on him, but still very difficult. With a slow however, it is entirely possible for a torp shaman to solo him."
  },
  "Lord Ghiosk": {
    "name": "Lord Ghiosk",
    "zone": "City of Mist"
  },
  "High Scale Kirn": {
    "name": "High Scale Kirn",
    "zone": "The Hole",
    "loc": {
      "y": -16,
      "x": 266,
      "z": -246
    },
    "note": "(?)."
  },
  "Neh`Ashiir": {
    "name": "Neh`Ashiir",
    "zone": "City of Mist"
  },
  "Iksar Broodling": {
    "name": "Iksar Broodling",
    "zone": "Plane of Fear"
  },
  "Lord Rak`Ashiir": {
    "name": "Lord Rak`Ashiir",
    "zone": "City of Mist"
  },
  "Kargek Redblade": {
    "name": "Kargek Redblade",
    "zone": "East Freeport",
    "loc": {
      "y": -239,
      "x": -567
    },
    "note": "100% @."
  },
  "Wenden Blackhammer": {
    "name": "Wenden Blackhammer",
    "zone": "East Freeport",
    "loc": {
      "y": -211,
      "x": -564
    },
    "note": "100% @."
  },
  "A mountain giant patriarch": {
    "name": "A mountain giant patriarch",
    "zone": "Dreadlands",
    "loc": {
      "y": -506,
      "x": 2001
    },
    "note": "20% @ ?. A rare spawn at the giant fort or giant houses on the north side of the zone. Stronger than the A Mountain Giant Steep. Has a slightly better drop table as well, including some Research mats. He drops the Tree Weave chest piece, which is alright for those who don't have raid gear. Unsure if he drops Hill Giant Toes. Also a part of the Warrior Epic Quest! Edit May 2025: Saw him wandering with other giants north of KC. Accidentally got him in a quad!"
  },
  "Mentrax Mountainbone": {
    "name": "Mentrax Mountainbone",
    "zone": "Frontier Mountains",
    "loc": {
      "y": 389,
      "x": 459
    },
    "note": "100% @. Like the nearby Eldak Howlingbear he is indifferent to all and not social. 6 minute 40 second spawn time."
  },
  "Fright": {
    "name": "Fright",
    "zone": "Plane of Fear",
    "loc": {
      "y": -636,
      "x": -358
    },
    "note": "Fright will Cazic Touch and run at low health. Random chance to spawn Iksar Broodling upon death. Unique to this particular golem, its melee attacks were said to occasionally place a stack of Issued Water on the player's cursor."
  },
  "Denken Strongpick": {
    "name": "Denken Strongpick",
    "zone": "Ocean of Tears",
    "loc": {
      "y": 1589,
      "x": 4035
    },
    "note": "100% @. Located on Aviak Island"
  },
  "Queen Velazul Di`zok": {
    "name": "Queen Velazul Di`zok",
    "zone": "Chardok",
    "loc": {
      "y": -1081,
      "x": 990
    },
    "note": "Her Majesty is the brood mother of the Sarnak and during the late Velious era opened her realm up to other races that have proper faction to serve her. The Sarnak are an artificial race created by combining Iksar and Dragon. After serving as slaves to the Iksar, they have gone feral. Her enemies include the Iksar race and Chief RokGus's Kunark Goblins. She is by far the hardest mob in Chardok. Beware, as she casts gate. === Strategy === Queen has an area effect 850hp, 1 tick fire dot called Flame Song of Ro. The effect can be removed by a magic dispel spell/song/clicky if the debuff is in a top slot. The fire debuff is a -100 Resist Adjust. However, aside from the tank, no one needs to be hit by the AoE. The AoE happens once every 12 seconds, so don't engage until you get a precise timer on it. Then, have someone in voice chat call out a countdown. At 5 seconds remaining, all melees aside from the tank should be around the corner. Then, the person calling the countdown should call the melees to re-engage and restart the timer and countdown. Using a log parsing program like GINA can help with this, but don't get too reliant in case you're out of range of the message. The AoE message is \" is immolated in flame.\" At 20%, she will start casting Gate, so make sure to mana sieve before pushing her past this threshold, or have enough dps to blow her away. Also, at low health, the Queen will enrage, which means that even during the push, your tank needs to be opposite the rest of the raid force so that the push can continue when enrage happens."
  },
  "Oknoggin Stonesmacker": {
    "name": "Oknoggin Stonesmacker",
    "zone": "The Feerrott",
    "loc": {
      "y": 804,
      "x": 1153
    },
    "note": "100% @. Found by the bridge separating the part of the zone leading to Rathe Mountains from the part of the zone leading to Oggok."
  },
  "Tenal Redblade": {
    "name": "Tenal Redblade",
    "zone": "Eastern Plains of Karana",
    "loc": {
      "y": -1765,
      "x": -6000,
      "z": 388
    },
    "note": "100% @. Follow the ramp all the way up to Highpass Hold, he will be located outside of a white tower before the zoneline.| known_loot = * None"
  },
  "A_goblin_wizard_(Permafrost)": {
    "name": "A goblin wizard (Permafrost)",
    "zone": "Permafrost",
    "loc": {
      "y": 230,
      "x": -480
    },
    "note": "?%@, (350,350), and various others. SLAM SLAM SLAM SLAM this guy fellow warriors. He hurts a lot. Try your hardest to negate his spells. Destroyed my health when I was caught lackin. Known to appear in the 3 before the first gate, as well as in the room just south of 8 on the map."
  },
  "Lord Nagafen": {
    "name": "Lord Nagafen",
    "zone": "Nagafen's Lair",
    "loc": {
      "y": -1395,
      "x": -871
    },
    "note": "Fire breathing boss of EverQuest (classic). Icon of the game. Appeared on the original box art and featured in the original promotional artwork. The fire dragon Nagafen lives in exile from all dragonkind due to a plot with Lady Vox to create another prismatic dragon similar to Kerafyrm. Lord Nagafen, along with Lady Vox and Phinigel Autropos, is one of EverQuest's original three raid bosses. He resides in the very rear of Nagafen's Lair, guarded by the fire giants. === Strategy === The key to defeating him is avoiding the two special attacks he has: an Area Effect fire spell and an Area Effect fear spell. Fire and Magic Resists mean everything with this fellow. 8/2/2026 - Killed at level 40 on D0 raid solo as BST/MNK/ENC, looked like maxhit of 167, mostly (only?) doubles. Lava Breath landed a decent amount but I only had 126FR, did not seem to fully lose any buffs despite eating the AE a number of times but durations were low and several wore off shortly after despite only a 7min fight. Had to aggressively dance between Evasive while healing/tanking and then swap to Balanced to push the endurance regen while healing to swap back to Evasive ASAP. Slow resisted pretty rarely without resist debuff invocation, easily reapplied. Also note that Nagafen (and Yael? All raid bosses?) WILL IGNORE pets if a player is in range in terms of tanking. The voidling to begin the raid is right past the little gate where you fight the first fire giants, easily accessible via swimming up the lava river."
  },
  "Severilous": {
    "name": "Severilous",
    "zone": "Emerald Jungle",
    "loc": {
      "y": 2500,
      "x": 3500
    },
    "note": "Wanders. Severilous says \"Very cute, mortal. Please, please, don't kill me. Hah! Tell me, are you immune to poison? I certainly hope so. I am.\" One of the Kunark dragons. Wanders in the NW of the zone."
  },
  "Maestro": {
    "name": "Maestro of Rancor",
    "zone": "Plane of Hate",
    "loc": {
      "y": -82,
      "x": 295
    },
    "note": "100% @. The Maestro of Rancor is the guardian of Innoruuk, and resides within the Organ Hall in the Plane of Hate. The many items he carries tend towards those usable by bards. === Lore === Once a mortal named Vedel Revnold, the Maestro of Rancor is now a twisted, evil being residing on the Plane of Hate, replaying his legendary haunting symphony for all eternity, echoing mournful chords across much of the plane. His hatred for all around him (even for Innoruuk himself), is secondary only to his hatred for himself. The Maestro has a pallor of embalmed blue, with fangs, claws, and soulless eyes — he bears only a superficial resemblance to his former self. Still, his dress is that of a wealthy nobleman, with bright pants and a high-collared, flowing cape. If anyone approaches the Maestro, he attacks immediately and mercilessly; he has no desire for conversation, for he wants only to play his music and to lament in despair until the end of time for his horrible crime. Upon being slain, Maestro of Rancor says 'The dance is over, for now.' According to the Brian Canary interview with aLovingRobot, Maestro is the original and only model of Mayong Mistmoore that was ever used. https://www.youtube.com/watch?v=sRLeVEuuLXM&t=1s&ab_channel=aLovingRobot === Strategy === His AoE lifetap (250 hp) can make fighting him an exercise in futility. He hits for upwards of 200 damage a hit. He is extremely resistant to cold (Lure of Frost does not land) and magic, but Lure of Flame is effective. Don't count on any regular nukes (non-lures) landing. He is not a Belly Caster. Overcast invocation will help land slows. Maestro of Rancor will see through a rogue's Hide skill. Summons. Does not DT."
  },
  "Spiroc Lord": {
    "name": "The Spiroc Lord",
    "zone": "Plane of Sky",
    "loc": {
      "y": -836,
      "x": 1090
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Solomen": {
    "name": "Solomen",
    "zone": "Temple of Solusek Ro",
    "loc": {
      "y": 426,
      "x": 80
    },
    "note": "100% @."
  },
  "Camin": {
    "name": "Camin",
    "zone": "Erudin",
    "loc": {
      "y": -1166,
      "x": -13
    },
    "note": "100% @. Located on the second floor of The Vasty Deep Inn. First room on the left."
  },
  "Dargon": {
    "name": "Dargon",
    "zone": "Halas",
    "loc": {
      "y": 354,
      "x": 356
    },
    "note": "@. The illusionary form of Arantir Karondor. She (he) is on True Spirit primary faction, which could cause trouble for some aspiring barbarian alchemists."
  },
  "Challice": {
    "name": "Challice",
    "zone": "Northern Felwithe",
    "loc": {
      "y": -14,
      "x": -262
    },
    "note": "100% @. Give her Arantir's Ring and then return it back to Arantir Karondor."
  },
  "Kandin Firepot": {
    "name": "Kandin Firepot",
    "zone": "Butcherblock Mountains",
    "loc": {
      "y": -1496,
      "x": 2840
    },
    "note": "100% @."
  },
  "Arantir Karondor": {
    "name": "Arantir Karondor",
    "zone": "Halas",
    "loc": {
      "y": 354,
      "x": 356
    },
    "note": "@. The true identity of Dargon."
  },
  "Gorgalosk": {
    "name": "Gorgalosk",
    "zone": "Plane of Sky",
    "loc": {
      "y": 547,
      "x": 474
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Cilin Spellsinger": {
    "name": "Cilin Spellsinger",
    "zone": "Plane of Sky"
  },
  "The Spiroc Lord": {
    "name": "The Spiroc Lord",
    "zone": "Plane of Sky",
    "loc": {
      "y": -836,
      "x": 1090
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Bazzt Zzzt": {
    "name": "Bazzt Zzzt",
    "zone": "Plane of Sky",
    "loc": {
      "y": -946,
      "x": 296
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Sister of the Spire": {
    "name": "Sister of the Spire",
    "zone": "Plane of Sky",
    "loc": {
      "y": -1010,
      "x": -489
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Eye of Veeshan": {
    "name": "Eye of Veeshan",
    "zone": "Plane of Sky",
    "loc": {
      "y": -267,
      "x": -1370,
      "z": 1250
    },
    "note": "In theory, the end boss of the Plane of Sky. In practice, several other mobs are much stronger. Fairly straightforward fight."
  },
  "Animist Kratho": {
    "name": "Animist Kratho",
    "zone": "Plane of Sky"
  },
  "Protector of Sky": {
    "name": "Protector of Sky",
    "zone": "Plane of Sky",
    "loc": {
      "y": -146,
      "x": -277
    },
    "note": "Placed by the zone map's own label; the wiki states no spot."
  },
  "Stragen The Hewer": {
    "name": "Stragen The Hewer",
    "zone": "Plane of Sky"
  },
  "Josin Faithbringer": {
    "name": "Josin Faithbringer",
    "zone": "Plane of Sky",
    "loc": {
      "y": 1349,
      "x": 659
    },
    "note": "50% @. This is the quest NPC for Cleric Plane of Sky Tests turn ins."
  },
  "Strandar Pinemist": {
    "name": "Strandar Pinemist",
    "zone": "Plane of Sky"
  },
  "Enchanter Jolas": {
    "name": "Enchanter Jolas",
    "zone": "Plane of Sky"
  },
  "Magus Frinon": {
    "name": "Magus Frinon",
    "zone": "Plane of Sky",
    "loc": {
      "y": 1305,
      "x": 604
    },
    "note": "100% @. Name in game is actually Magi Frinon. This is the quest NPC for Magician Plane of Sky Tests turn ins."
  },
  "Holwin": {
    "name": "Holwin",
    "zone": "Plane of Sky"
  },
  "Drakis Bloodcaster": {
    "name": "Drakis Bloodcaster",
    "zone": "Plane of Sky"
  },
  "Dason Goldblade": {
    "name": "Dason Goldblade",
    "zone": "Plane of Sky"
  },
  "Ranger Spirit": {
    "name": "Ranger Spirit",
    "zone": "Plane of Sky"
  },
  "Thalik Silenthand": {
    "name": "Thalik Silenthand",
    "zone": "Plane of Sky"
  },
  "Sarkis Ebonblade": {
    "name": "Sarkis Ebonblade",
    "zone": "Plane of Sky"
  },
  "Medicine Man Veetra": {
    "name": "Medicine Man Veetra",
    "zone": "Plane of Sky"
  },
  "Torgon Blademaster": {
    "name": "Torgon Blademaster",
    "zone": "Plane of Sky",
    "loc": {
      "y": 1400,
      "x": 564
    },
    "note": "100% @. This is the quest NPC for Warrior Plane of Sky Tests turn ins."
  },
  "Wizard Schrock": {
    "name": "Wizard Schrock",
    "zone": "Plane of Sky"
  }
};

/** The era each zone a plan names is tagged with on its own wiki page ("Classic", "Kunark", …). */
export const QUEST_PLAN_ZONE_ERAS: Record<string, string> = {
  "Western Karana": "Classic",
  "Southern Desert of Ro": "Classic",
  "Lake Rathetear": "Classic",
  "South Karana": "Classic",
  "Solusek's Eye": "Classic",
  "Unrest": "Classic",
  "Western Plains of Karana": "Classic",
  "Rathe Mountains": "Classic",
  "Burning Woods": "Kunark",
  "Skyfire Mountains": "Kunark",
  "Ocean of Tears": "Classic",
  "Butcherblock Mountains": "Classic",
  "Steamfont Mountains": "Classic",
  "Kedge Keep": "Classic",
  "Plane of Fear": "Classic",
  "Karnor's Castle": "Kunark",
  "Timorous Deep": "Kunark",
  "The Temple of Solusek Ro": "Temple",
  "Chardok": "Chardok Revamp",
  "Nagafen's Lair": "Classic",
  "Burning Wood": "Kunark",
  "Greater Faydark": "Classic",
  "Kithicor Forest": "Classic",
  "East Karana": "Classic",
  "Everfrost": "Classic",
  "Innothule Swamp": "Classic",
  "Felwithe": "Classic",
  "Northern Felwithe": "Classic",
  "Firiona Vie": "Kunark",
  "Surefall Glade": "Classic",
  "Frontier Mountains": "Kunark",
  "City of Mist": "Kunark",
  "Everfrost Peaks": "Classic",
  "Northern Karana": "Classic",
  "Southern Karana": "Classic",
  "Lesser Faydark": "Classic",
  "Ak'Anon": "Classic",
  "Swamp of No Hope": "Kunark",
  "Emerald Jungle": "Kunark",
  "Lake of Ill Omen": "Kunark",
  "The Overthere": "Kunark",
  "North Karana": "Classic",
  "Erudin": "Classic",
  "Qeynos Catacombs": "Classic",
  "Cabilis": "Kunark",
  "Neriak": "Classic",
  "Overthere": "Kunark",
  "Dalnir": "Kunark",
  "Plane of Sky": "Classic",
  "Kaesora": "Kunark",
  "Skyfire": "Kunark",
  "The Hole": "Classic",
  "Plane of Hate": "Classic",
  "Field of Bone": "Kunark",
  "West Commonlands": "Classic",
  "Mistmoore": "Classic",
  "Najena": "Classic",
  "Dagnor's Cauldron": "Classic",
  "the Hole": "Classic",
  "Dreadlands": "Kunark",
  "Lavastorm Mountains": "Classic",
  "Mines of Nurga": "Kunark",
  "Trakanon's Teeth": "Kunark",
  "West Freeport": "Classic",
  "Neriak Third Gate": "Classic",
  "Splitpaw": "Classic",
  "Paineel": "Paineel",
  "Qeynos Aqueducts": "Classic",
  "Toxxulia Forest": "Classic",
  "Erud's_Crossing": "Classic",
  "Freeport": "Classic",
  "Permafrost": "Classic",
  "Feerrott": "Classic",
  "Plane of Air": "Classic",
  "Temple of Solusek Ro": "Temple",
  "The Estate of Unrest": "Classic",
  "Old Sebilis": "Kunark",
  "Eastern Plains of Karana": "Classic",
  "South Felwithe": "Classic",
  "East Cabilis": "Kunark",
  "Southern Felwithe": "Classic",
  "Mistmoore Castle": "Classic",
  "Nektulos Forest": "Classic",
  "Neriak Foreign Quarter": "Classic",
  "North Freeport": "Classic",
  "East Freeport": "Classic",
  "The Feerrott": "Classic"
};
