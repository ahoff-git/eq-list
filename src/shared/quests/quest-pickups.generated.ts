/**
 * Quest items that lie on the ground at a known spot — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-quest-pickups.mjs`, which reads eqlwiki's quest-page
 * pickup tables (scraped 2026-10-16T07:00:55.133Z). Shipped rather than fetched at runtime — see
 * [ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md). Read it
 * through `quest-pickups.ts`, which owns how a pickup is named on the list and placed on the map.
 *
 * 42 pickups, 154 quest NPCs.
 */

export interface QuestPickup {
  /** The quest it's turned in for — the list group it's filed under. */
  quest: string;
  /** What it's called in game. */
  item: string;
  /** What tells this one from the rest of its set — the map pin's caption. */
  label: string;
  /** The zone, in the wiki's wording. */
  zone: string;
  /** Where, in `/loc` order — absent when the page only describes the spot ("in the Ghost Room Pit"). */
  loc?: { y: number; x: number; z?: number };
  /** How to reach it, and anything the page warns about. */
  note: string;
  /** The wiki page it was read from. */
  page: string;
}

/** Someone a quest sends you to — placed by their own wiki page, with what you do there. */
export interface QuestNpc {
  /** The quest whose top table names them. */
  quest: string;
  /** Their name — their wiki page's title, and the map pin's caption. */
  npc: string;
  /** The zone, in the wiki's wording. */
  zone: string;
  /** Where their page says they stand, in `/loc` order. */
  loc: { y: number; x: number; z?: number };
  /** The quest's checklist steps that name them — what to hand in, and what you get back. */
  steps: string[];
  /** How to reach them, from their page. */
  note: string;
}

export const QUEST_PICKUPS_SOURCE = { wiki: "https://eqlwiki.com", pages: ["Tarton's Wheel","Coin of Tash (Tashania)","The Bones of Darak Lightforge","Armor of the Priest Quests","Ivan McMannus' Remains","The Geologist's Purloined Tools","Rogue Redemption","Caduceus of Sacrament Quest","The Rogue Take","Chalice of Conquest Quest","The Bridge","Tunic of Ridossan Quest","Incandescent Armor Quests","Noble Hunters","Sentry Xyrin Quest","Poacher's Head Quest (Surefall Glade)","Vasty Deep Water","Crafted Armor Quests","Poacher's Head Quest (Erudin)","Series C Black Boxes","Taxes","Blessed Oil Quest","Blessed Oil","Langseax Quest","Magic Elixir for the Warriors","Princess Lenya (Quest)","Rogue Errands","Telescope Lenses","The Bayle List","The Donations","Titan Samples (good)"], scrapedAt: "2026-10-16T07:00:55.133Z" };

export const QUEST_PICKUPS: QuestPickup[] = [
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Azia",
    "zone": "Erud's Crossing",
    "loc": {
      "y": -1159,
      "x": 2329
    },
    "note": "Underwater on the ocean floor past the shipwreck with the zombie sailors, just after the ledge. Use invis and avoid the five zombie sailors inside the ship. BEWARE! Lvl 40 \"a killer shark\"s see invis and dispel! Enduring Breath Recommended: Yes",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Beza",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 5000,
      "x": -5100
    },
    "note": "Floor of the house in the back of the hidden cave entered through the frozen river. The house is located in the northeast portion of the caves. Three ice boned skeletons spawn inside. Enter the river through the closest hole (2417, -4068) and swim up against the ice to breathe. The Lich of Miragul wanders the caves, but it is not aggressive. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Caza",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 2782,
      "x": 142,
      "z": -372
    },
    "note": "Underwater on the top floor of the stone tower in the hidden cave underneath the first island out from Rathe Mountains island #15 on the map. Cave entrance is at 2826, -907, -171. Other cave entrance is south-southwest of the South Karana zone line, which is also the Evac location. Enduring Breath Recommended: Yes",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Dena",
    "zone": "Dagnor's Cauldron",
    "loc": {
      "y": -890,
      "x": -740,
      "z": -431
    },
    "note": "Underwater in a small gully on the lake floor out and to the west of Kedge Keep (near the island), directly out from Unrest. Enduring Breath Recommended: Yes",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Ena",
    "zone": "Lower Guk",
    "loc": {
      "y": 1145,
      "x": -690,
      "z": -122
    },
    "note": "On the floor of the a reanimated hand (Lower Guk) room. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Fana",
    "zone": "Oasis of Marr",
    "loc": {
      "y": -790,
      "x": -60
    },
    "note": "Underwater on the top floor of the stone tower in the lake. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Geza",
    "zone": "Highpass Hold",
    "loc": {
      "y": -207,
      "x": 433,
      "z": -18
    },
    "note": "Beneath the waterfall near The Tiger's Roar patio. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Heda",
    "zone": "Qeynos Aqueducts",
    "loc": {
      "y": 670,
      "x": 60
    },
    "note": "Underwater on the tile floor of the shark pit. 14 on map. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Izah",
    "zone": "Neriak Commons",
    "loc": {
      "y": 0.89,
      "x": -803.9
    },
    "note": "Underwater on the river floor immediately outside The Blind Fish windows. The Blind Fish is the underground bar near the Bank, with four large windows looking out below the surface. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Tarton's Wheel",
    "item": "Rod",
    "label": "Jaka",
    "zone": "Unrest",
    "loc": {
      "y": 520,
      "x": -285
    },
    "note": "Underwater on the hidden cavern floor to the right of the manor. Near Serra and a gnomish spelunker, but in a cubby between them and the gazebo. Enduring Breath Recommended: No",
    "page": "Tarton's Wheel"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Azia",
    "zone": "Ak'anon",
    "loc": {
      "y": 1990,
      "x": -260,
      "z": -125
    },
    "note": "Near great wheel (not in water). It's on the West side of the water wheel, then North a bit, right at the Star light thing.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Beza",
    "zone": "Erudin Palace",
    "loc": {
      "y": 703,
      "x": 740,
      "z": 44
    },
    "note": "In the Caster's Guild zone (Erudin Palace), go one level up from the zone-in teleporter. It's in the fountain with rocks in it, on the rocks.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Caza",
    "zone": "Northern Felwithe",
    "loc": {
      "y": -110,
      "x": -790,
      "z": -50
    },
    "note": "In the fishing pond.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Dena",
    "zone": "West Freeport",
    "loc": {
      "y": 129,
      "x": -750,
      "z": -80
    },
    "note": "In the pool under the Academy of Arcane Science (Caster Guild).",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Ena",
    "zone": "Grobb",
    "loc": {
      "y": 197,
      "x": -261,
      "z": -2.31
    },
    "note": "In the pool near a bar. When you enter the zone and go across the first bridge, you'll see the small pool on the right.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Fana",
    "zone": "Halas",
    "loc": {
      "y": -138,
      "x": 179
    },
    "note": "In the lake in front of city. If you're facing the city, it's to the left near the far dock, underwater on a raised ledge.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Geza",
    "zone": "South Kaladim",
    "loc": {
      "y": 75,
      "x": 360,
      "z": -5
    },
    "note": "Pool by warrior's guild.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Heda",
    "zone": "Neriak Commons",
    "loc": {
      "y": 0,
      "x": -795,
      "z": -70
    },
    "note": "Pass the Constructed Potential by the big bridge. Jump off to the left; it's in the water next to the glass windows.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Izah",
    "zone": "Oggok",
    "loc": {
      "y": 109,
      "x": 101,
      "z": -137
    },
    "note": "In the lake near warrior guild at the north end.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "item": "Old Silver Coin",
    "label": "Jaka",
    "zone": "North Qeynos",
    "loc": {
      "y": -90,
      "x": -445,
      "z": -10
    },
    "note": "Under the Temple of Life \"UFO\" in the Koalindl Fish Pool.",
    "page": "Coin of Tash (Tashania)"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "A Dusty Old Backbone",
    "label": "A Dusty Old Backbone",
    "zone": "Unrest",
    "note": "A Dusty Old Backbone and Dusty Ribcage - Both spawn in the Ghost Room Pit in Unrest. Go into the basement, then through the invisible wall, go through the lava, and the bag is in the pit. Dusty Ribcage also spawns in Mistmoore Castle. You can skip going to Mistmoore if you collect it in Unrest.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "Dusty Ribcage",
    "label": "Dusty Ribcage",
    "zone": "Mistmoore Castle",
    "note": "Dusty Ribcage - Skip if you got in Unrest already. The Garden in Mistmoore Castle. This is in Fountain Room #7 on the map.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "Dusty Old Finger Bones",
    "label": "Dusty Old Finger Bones",
    "zone": "Kedge Keep",
    "note": "Dusty Old Finger Bones - Inside Phinigel Autropos's room in Kedge Keep.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "Dusty Old Skull",
    "label": "Dusty Old Skull",
    "zone": "Steamfont Mountains",
    "note": "Dusty Old Skull - Minotaur caves in Steamfont Mountains in Meldrath's room.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "A Dusty Old Jawbone",
    "label": "A Dusty Old Jawbone",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 4535,
      "x": -5235
    },
    "note": "A Dusty Old Jawbone - Underwater Ice Cave (Miragul's area) in Everfrost Peaks. There are emblems on the wall in the cave. The item is under the third emblem at about 4535, -5235.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "A Dusty Broken Sword",
    "label": "A Dusty Broken Sword",
    "zone": "North Kaladim",
    "loc": {
      "y": 761,
      "x": 332
    },
    "note": "A Dusty Broken Sword - In the mines of North Kaladim in the water. Ground spawn in the water at roughly +761, +332.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "The Bones of Darak Lightforge",
    "item": "A Dusty Broken Shield",
    "label": "A Dusty Broken Shield",
    "zone": "Erudin",
    "loc": {
      "y": -605,
      "x": -725
    },
    "note": "A Dusty Broken Shield - On a ledge on right cliffs in Erudin from the docks. Ground spawn at -605, -725. You must swim from the docks to reach the shield.",
    "page": "The Bones of Darak Lightforge"
  },
  {
    "quest": "Armor of the Priest Quests",
    "item": "Ingot of the Penitent",
    "label": "Ingot of the Penitent",
    "zone": "Upper Guk",
    "loc": {
      "y": 200,
      "x": -500
    },
    "note": "Ingot of the Penitent (Ground spawn in the Upper Guk Scryer Room, roughly 200, -500. Inside the eastern pillar of water.)",
    "page": "Armor of the Priest Quests"
  },
  {
    "quest": "Armor of the Priest Quests",
    "item": "Turgan's Note",
    "label": "Turgan's Note",
    "zone": "Kithicor Forest",
    "loc": {
      "y": 1700,
      "x": 1100
    },
    "note": "Icon of the Reliant (Turgan's Note is a ground spawn, inside of a burnt hut in Kithicor Woods, at 1700, 1100. Give the note to Turgan in Lake Rathetear at 3641.08, 149.10.)",
    "page": "Armor of the Priest Quests"
  },
  {
    "quest": "Armor of the Priest Quests",
    "item": "Ingot of the Reliant",
    "label": "Ingot of the Reliant",
    "zone": "Kithicor Forest",
    "loc": {
      "y": -90,
      "x": 3300
    },
    "note": "Ingot of the Reliant (Ground spawn on a tree stump in Kithicor. Jump off of the adjacent fallen tree onto the stump at -90, 3300.)",
    "page": "Armor of the Priest Quests"
  },
  {
    "quest": "Armor of the Priest Quests",
    "item": "Ingot of the Ardent",
    "label": "Ingot of the Ardent",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2984,
      "x": -5716
    },
    "note": "Ingot of the Ardent (Ground spawn in Everfrost Peaks at 2984, -5716. You'll most likely need Enduring Breath to get to it. It's very hard to see and blends into the river floor.)",
    "page": "Armor of the Priest Quests"
  },
  {
    "quest": "Ivan McMannus' Remains",
    "item": "Barbarian Femur",
    "label": "Barbarian Femur",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 1405,
      "x": -4570,
      "z": -190
    },
    "note": "Barbarian Femur: +1405, -4570, -190",
    "page": "Ivan McMannus' Remains"
  },
  {
    "quest": "Ivan McMannus' Remains",
    "item": "Barbarian Jaw",
    "label": "Barbarian Jaw",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 1465,
      "x": -4500,
      "z": -230
    },
    "note": "Barbarian Jaw: +1465, -4500, -230",
    "page": "Ivan McMannus' Remains"
  },
  {
    "quest": "Ivan McMannus' Remains",
    "item": "Barbarian Skull",
    "label": "Barbarian Skull",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 1580,
      "x": -4485,
      "z": -245
    },
    "note": "Barbarian Skull: +1580, -4485, -245",
    "page": "Ivan McMannus' Remains"
  },
  {
    "quest": "The Geologist's Purloined Tools",
    "item": "Magnifying Glass",
    "label": "Magnifying Glass",
    "zone": "Erud's Crossing",
    "loc": {
      "y": -600,
      "x": 2000
    },
    "note": "The Magnifying Glass is a bag sitting on the ground not too far from the shore. The loc is -600, 2000.",
    "page": "The Geologist's Purloined Tools"
  },
  {
    "quest": "The Geologist's Purloined Tools",
    "item": "Geologist's Hammer",
    "label": "Geologist's Hammer",
    "zone": "Erud's Crossing",
    "loc": {
      "y": -526,
      "x": 2287
    },
    "note": "The Geologist's Hammer looks like a hammer and is on the ocean floor at the bottom of the big drop off. You will have to swim down the deep drop off here to find it. The loc is -526, 2287.",
    "page": "The Geologist's Purloined Tools"
  },
  {
    "quest": "Rogue Redemption",
    "item": "The Oblong Bottle",
    "label": "The Oblong Bottle",
    "zone": "Ocean of Tears",
    "loc": {
      "y": -1611,
      "x": 2924
    },
    "note": "The Oblong Bottle - ground spawn, Ocean of Tears, -1611, +2924",
    "page": "Rogue Redemption"
  },
  {
    "quest": "Caduceus of Sacrament Quest",
    "item": "Icon of Sacrament",
    "label": "Icon of Sacrament",
    "zone": "Mistmoore Castle",
    "loc": {
      "y": -68,
      "x": 280
    },
    "note": "Icon of Sacrament (ground spawn found in the jail in Mistmoore Castle (-68, 280))",
    "page": "Caduceus of Sacrament Quest"
  },
  {
    "quest": "The Rogue Take",
    "item": "Locked Chest",
    "label": "Locked Chest",
    "zone": "East Freeport",
    "loc": {
      "y": -406,
      "x": -1150
    },
    "note": "If you swim off shore a little you will find a groundspawn named Locked Chest (Loc: -406, -1150). The chest has a ~14 minute spawn time, but you may be able to spawn it again by switching difficulties and creating instances (giving Giz the letter does not respawn the chest).",
    "page": "The Rogue Take"
  },
  {
    "quest": "Chalice of Conquest Quest",
    "item": "Abandoned Orc Shovel",
    "label": "Abandoned Orc Shovel",
    "zone": "Lake Rathetear",
    "loc": {
      "y": 3486,
      "x": -663
    },
    "note": "Once you have the Stem and Foot of Candlestick pop into Lake Rathetear for the shovel. Follow the right side past the merchants, bandits until the orc camps. The [Abandoned Orc Shovel]] is a ground spawn at /loc +3486, -663 inside the 2nd tent.. You will need it later for the Chalice.",
    "page": "Chalice of Conquest Quest"
  },
  {
    "quest": "The Bridge",
    "item": "Sealed List",
    "label": "Sealed List",
    "zone": "South Qeynos",
    "loc": {
      "y": 275,
      "x": -350
    },
    "note": "You can find the list in South Qeynos, which will lead you to the architects. (Go to the second location at (275, -350) to immediately pick up the ground spawn which is the Sealed List.)",
    "page": "The Bridge"
  },
  {
    "quest": "Tunic of Ridossan Quest",
    "item": "Green river sludge",
    "label": "Green river sludge",
    "zone": "The Feerrott",
    "loc": {
      "y": 135,
      "x": 705
    },
    "note": "1 x Green river sludge ground spawn in the river in The Feerrott, near Oggok at (+135, +705)",
    "page": "Tunic of Ridossan Quest"
  }
];

export const QUEST_NPCS: QuestNpc[] = [
  {
    "quest": "Tarton's Wheel",
    "npc": "Sulgar",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2998,
      "x": -2399
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "npc": "Romar Sunto",
    "zone": "Temple of Solusek Ro",
    "loc": {
      "y": 393,
      "x": 90
    },
    "steps": [
      "Get Coin Pouch from Romar Sunto in The Temple of Solusek Ro",
      "Give Radiant Coin of Tash to Romar Sunto in The Temple of Solusek Ro at (393, 90) to receive the Spell: Tashania."
    ],
    "note": "2nd floor. He is accessed from the 3rd level past Lord Searfire and the Undead Knights in the 2nd floor library."
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "npc": "Tarn Visilin",
    "zone": "High Keep",
    "loc": {
      "y": 65,
      "x": -223
    },
    "steps": [
      "Give Coin of Tash to Tarn Visilin in the library at High Keep, at (75, -220), to receive the Glowing Coin of Tash."
    ],
    "note": "Located on the second left after the \"Established 2097\" sign at the entrance. First floor."
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "npc": "Mizr N`Mar",
    "zone": "Neriak Third Gate",
    "loc": {
      "y": 913,
      "x": -1314
    },
    "steps": [
      "Give Glowing Coin of Tash to Mizr N`Mar in the Neriak 3rd Gate library at (913, -1314) to receive the Gleaming Coin of Tash."
    ],
    "note": ""
  },
  {
    "quest": "Coin of Tash (Tashania)",
    "npc": "Raine Beteria",
    "zone": "Erudin",
    "loc": {
      "y": -1050,
      "x": -212
    },
    "steps": [
      "Give Gleaming Coin of Tash to Raine Beteria in the Erudin library at (-1050, -212) to receive the Radiant Coin of Tash."
    ],
    "note": "Located on the second floor of the Erudin City Library. Sells various enchanter illusion spells."
  },
  {
    "quest": "Armor of the Priest Quests",
    "npc": "Dwigus Lowater",
    "zone": "Dagnor's Cauldron",
    "loc": {
      "y": -558,
      "x": -463
    },
    "steps": [
      "Ingot of the Constant (Drops off of Dwigus Lowater in Dagnor's Cauldron on the island.)"
    ],
    "note": "(-898, -627). Dwigus Lowater paths right next to merchant Conium Darkblade on the center island. Dwigus Lowater's place holder is a Scalded Rat. The PH Scaled Rat will path and stop right next to merchant Conium Darkblade. Keep killing Scalded Rats until Dwigus Lowater pops."
  },
  {
    "quest": "Armor of the Priest Quests",
    "npc": "Sludge Dankmire",
    "zone": "RunnyEye Citadel",
    "loc": {
      "y": 9,
      "x": -1
    },
    "steps": [
      "Icon of the Constant (Drops off of Sludge Dankmire in the well on the fourth level of Clan Runnyeye.)"
    ],
    "note": "4th level: @. Spawns in middle of fountain underwater in the area near bank and Lord Pickclaw spot. Spawn Location is in the room at -17, -8 on the fourth level of Runnyeye Citadel. ~28 Min Respawn. He remains, to this day, the dankest of the goblins in Runnyeye."
  },
  {
    "quest": "Ivan McMannus' Remains",
    "npc": "Arnis McLish",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": -1599,
      "x": -168
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Ivan McMannus' Remains",
    "npc": "Snowflake",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2021,
      "x": -1161
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "The Geologist's Purloined Tools",
    "npc": "Yelesom Paust",
    "zone": "Erud's Crossing",
    "loc": {
      "y": -1175,
      "x": 1239
    },
    "steps": [],
    "note": "50% @. Sits on the wall of the crater at the center of the island. Dispells, casts root, nukes."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Bubar",
    "zone": "East Commonlands",
    "loc": {
      "y": -1519,
      "x": -116
    },
    "steps": [
      "Trek yonder to Bubar and buy Gator Gulp Ale then run to WC and buy A Sparkling Sapphire from Noresa Sparkle (it's NO DROP and costs between 500-550pp), and give Her the Sparkle purse, she will give you a Tiny Key. Do not kill her, she has only negative general Freeport faction hits.",
      "Go back to Bubar in EC and give him both keys and the gem case he will give you the Gem Of Righteousness (A Sparkling Sapphire)."
    ],
    "note": "Ever since childhood, Bubar aspired to be a vendor of the goodly allied races of Norrath. He set up shop inside the East Commonlands tunnels, offering food, bandages, drink, and more practical items. Bubar is renowned for three things - His ability to work all hours of the day, his die-hard hatred of evil races, and his inability to identify anyone who sneaks up behind him first. It is this handicap that has many citizens of Norrath wondering, is Bubar in fact loyal to the good races in Norrath, or simply maintaining this image in the public eye, while finding a loop hole to sell to evil races? Luckily for Bubar, though, there has been no complaint issued because of his fair prices. Anyone who chooses to boycott Bubar's sales in the tunnels can choose to sell their items for half price from the Shady Swashbuckler."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "CWG Model CX",
    "zone": "Solusek's Eye",
    "loc": {
      "y": -308,
      "x": -1135
    },
    "steps": [
      "Go to Sol A have someone kill (or pickpocket) CWG Model CX to obtain the Clockwork Oil Stout and have someone group with you and bring Lynada the Exiled to the ent and kill her then loot the Sparkle purse."
    ],
    "note": "Description needed. ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Conium Darkblade",
    "zone": "Dagnor's Cauldron",
    "loc": {
      "y": -236,
      "x": -826
    },
    "steps": [
      "Then run to Dagnor's Cauldron and on top of the Island find Conium Darkblade and give him the Sealed Note from Lon the Redeemed he will give you Never Stop Chopping."
    ],
    "note": "This is the only vendor in the zone. He's located on the island in the middle of Dagnor's Cauldron."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Kizdean Gix",
    "zone": "West Commonlands",
    "loc": {
      "y": -162,
      "x": 262
    },
    "steps": [],
    "note": "Summons Kizdean Gix Pet after ~ 1min. Spawns every 6 min 40 sec. Dragoon Zytl spawns in front of Befallen after killed."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Noresa Sparkle",
    "zone": "West Commonlands",
    "loc": {
      "y": -701,
      "x": 267
    },
    "steps": [
      "Trek yonder to Bubar and buy Gator Gulp Ale then run to WC and buy A Sparkling Sapphire from Noresa Sparkle (it's NO DROP and costs between 500-550pp), and give Her the Sparkle purse, she will give you a Tiny Key. Do not kill her, she has only negative general Freeport faction hits."
    ],
    "note": "\"Greedy\" Jewelry Making merchant who charges double and offers half. Sells a Sparkling Sapphire for burning rapier quest in her hut near befallen and is scared of Kizdean Gix. If she appears not to have the Sapphire for sale: uncheck the 'Show only items I can use' box in the merchant window."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Ortallius",
    "zone": "Southern Desert of Ro",
    "loc": {
      "y": 1146,
      "x": 1377
    },
    "steps": [
      "Go to South Ro and find a Orc named Ortallius (right side of ent) give him both Gems and he will give you the Burning Rapier!"
    ],
    "note": "This orc is found in the northwest corner of the desert. He is rather interested in attaining dervish cutthroat rings. He does not attack on sight (unlike almost every other orc). This mob spawns at +1100, +1300 and roams around the general area near Rathmana Allin."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Toxdil",
    "zone": "West Freeport",
    "loc": {
      "y": 631,
      "x": 200
    },
    "steps": [
      "Go to West Freeport and find Toxdil behind hidden wall and give him A Sparkling Sapphire, purchased from Noresa Sparkle, and he will give you a Tiny Key then go to East Freeport to Hallard's Resale have someone with 130 lock pick open the door at the bottom and get the Gem Case on the floor."
    ],
    "note": "Located in the Secret Tunnel in West Freeport. He despawns at 5am game time and respawns at 8pm. During this time his place is taken by Guard Dungwatch or a sewer rat or other yard trash mob. Dubious and will not vendor to 25 Iksar Monk, 57 CHA, no faction work in Commonlands yet, 8/20/2023."
  },
  {
    "quest": "Rogue Redemption",
    "npc": "Wela Muselender",
    "zone": "Northern Felwithe",
    "loc": {
      "y": 102,
      "x": -343
    },
    "steps": [],
    "note": "Alcohol merchant. Sells Tunare's Finest for Rogue Redemption quest."
  },
  {
    "quest": "Caduceus of Sacrament Quest",
    "npc": "Ostorm",
    "zone": "Temple of Solusek Ro",
    "loc": {
      "y": 437,
      "x": -79
    },
    "steps": [
      "2x Magnetized Platinum Bars. (give enchanted platinum to Ostorm for this)"
    ],
    "note": "In return for an Enchanted Platinum Bar he will give you a Magnetized Platinum Bar. In return for a Lambent Stone and two Fire Opals he will give you a Lambent Fire Opal. In return for a Ruby he will reset all your specialization skills to 49."
  },
  {
    "quest": "The Rogue Take",
    "npc": "Giz Dinree",
    "zone": "East Freeport",
    "loc": {
      "y": -361,
      "x": -1100
    },
    "steps": [],
    "note": "100% @. Down by the docks off to the side. Spawns between 8 PM and 9 PM. Despawns between 5 AM and 6 AM. Between 5 AM and 7 PM the spawn is Bait Masterson."
  },
  {
    "quest": "Chalice of Conquest Quest",
    "npc": "Datur Nightseer",
    "zone": "North Kaladim",
    "loc": {
      "y": 1337,
      "x": 133
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Chalice of Conquest Quest",
    "npc": "Dok",
    "zone": "Halas",
    "loc": {
      "y": 212,
      "x": 275
    },
    "steps": [],
    "note": "@."
  },
  {
    "quest": "Chalice of Conquest Quest",
    "npc": "Ghilanbiddle Nylwadil",
    "zone": "Dagnor's Cauldron",
    "loc": {
      "y": 412,
      "x": 98
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Chalice of Conquest Quest",
    "npc": "Nicholas",
    "zone": "Rathe Mountains",
    "loc": {
      "y": 3070,
      "x": -763
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Chalice of Conquest Quest",
    "npc": "Priestess Ghalea",
    "zone": "North Kaladim",
    "loc": {
      "y": 788,
      "x": 134
    },
    "steps": [],
    "note": "Priestess Ghalea is the guild master of the cleric's guild in Kaladim (the Church of Underfoot). She is involved in several quests."
  },
  {
    "quest": "The Bridge",
    "npc": "Hansl Bigroon",
    "zone": "South Qeynos",
    "loc": {
      "y": 281,
      "x": -353
    },
    "steps": [],
    "note": "Is on QeynosCitizen faction. He can aggro on evil races who are otherwise tolerated by vendors and guilds."
  },
  {
    "quest": "The Bridge",
    "npc": "Jogl Doobraugh",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": -157,
      "x": -495
    },
    "steps": [],
    "note": "Eight hour spawn"
  },
  {
    "quest": "The Bridge",
    "npc": "Purchin Oddsbot",
    "zone": "High Keep",
    "loc": {
      "y": 139,
      "x": -331
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "The Bridge",
    "npc": "Trantor Everhot",
    "zone": "North Kaladim",
    "loc": {
      "y": 493,
      "x": -205
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Tunic of Ridossan Quest",
    "npc": "Driana Poxsbourne",
    "zone": "West Freeport",
    "loc": {
      "y": 1372,
      "x": -330
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Tunic of Ridossan Quest",
    "npc": "Lyris Moonbane",
    "zone": "Qeynos Aqueducts",
    "loc": {
      "y": 301,
      "x": -445
    },
    "steps": [],
    "note": "Necromancer Guildmaster of the Shrine of Bertoxxulous"
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Radiant",
    "zone": "Cazic Thule",
    "loc": {
      "y": 358,
      "x": -107
    },
    "steps": [
      "Radiant Gloves from Radiant in The Temple of Cazic-Thule"
    ],
    "note": "Spawns at and Roams to Wizard Spire (259, -416). Spawns in the maze at (358, -107) and roams to the foot of the Wizard spire. 22 Min 00 Sec Respawn Timer. Has a placeholder."
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Tarn Visilin",
    "zone": "High Keep",
    "loc": {
      "y": 65,
      "x": -223
    },
    "steps": [
      "Gleaming Gloves by giving a bloodstone to Tarn Visilin in Highpass Keep"
    ],
    "note": "Located on the second left after the \"Established 2097\" sign at the entrance. First floor."
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Tizina",
    "zone": "Lavastorm Mountains",
    "loc": {
      "y": -333,
      "x": 937
    },
    "steps": [
      "Enchanted Gloves by giving 5 pp to Tizina in Lavastorm Mountains"
    ],
    "note": "Nestled in a camp of otherwise indifferent & dubious merchants, Tizina cons threatening to Rallos Zek Ogres and Cazic Thule Trolls. It is advised that you consider her from a safe distance before approaching if you are an Evil character."
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Ezmirella",
    "zone": "Northern Karana",
    "loc": {
      "y": -613,
      "x": -131
    },
    "steps": [],
    "note": "100% @. Description needed. Located in the Gypsy camp. She cons threateningly to Iksars"
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Raine Beteria",
    "zone": "Erudin",
    "loc": {
      "y": -1050,
      "x": -212
    },
    "steps": [
      "Glowing Silver Wand from Raine Beteria"
    ],
    "note": "Located on the second floor of the Erudin City Library. Sells various enchanter illusion spells."
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "A Froglok Scryer",
    "zone": "Upper Guk",
    "loc": {
      "y": 244,
      "x": -465
    },
    "steps": [
      "Glowing Mask, found on a froglok scryer or a skeleton monk in Upper Guk"
    ],
    "note": "17% @. A Froglok Scryer is an Enchanter, who can charm your Pet. PH is usually a ~lvl 23 froglok"
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Enynti",
    "zone": "Mistmoore Castle",
    "loc": {
      "y": 80,
      "x": -112
    },
    "steps": [
      "Rune of Fortune (top), from Enynti in the Chasm below Mistmoore"
    ],
    "note": ""
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Mizr N`Mar",
    "zone": "Neriak Third Gate",
    "loc": {
      "y": 913,
      "x": -1314
    },
    "steps": [
      "Rune of Fortune (bottom) by giving 5 pp to Mizr N`Mar in Neriak Third Gate"
    ],
    "note": ""
  },
  {
    "quest": "Incandescent Armor Quests",
    "npc": "Madame Serena",
    "zone": "South Qeynos",
    "loc": {
      "y": -38,
      "x": -64
    },
    "steps": [
      "Rune of Fortune (middle) by giving 5 pp to Madame Serena in South Qeynos"
    ],
    "note": "50% @ Behind Maiden's Lure. Appears to be on either Antonius Bayle or Coalition of Tradefolk faction. KOS, but doing the Rohand's Brandy quest to Captain Rohand. Handing her 50gp produces a Rune of Fortune"
  },
  {
    "quest": "Noble Hunters",
    "npc": "Bunk Odon",
    "zone": "Innothule Swamp",
    "loc": {
      "y": 216,
      "x": -319
    },
    "steps": [
      "Bunk Odon"
    ],
    "note": "100% @. Bunky spawns near the entrance to Upper Guk and is one of the nobles. Nobles spawn one at a time and there are 2 H Elf, 2 Human, 1 erudite, and Bunk. They drop noble Crests for an Ogre Warrior."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Gwynn Marthank",
    "zone": "Innothule Swamp",
    "loc": {
      "y": -37,
      "x": -494
    },
    "steps": [
      "Gwynn Marthank"
    ],
    "note": "100% @."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Hogus Durmas",
    "zone": "Innothule Swamp",
    "loc": {
      "y": -306,
      "x": -519
    },
    "steps": [
      "Hogus Durmas"
    ],
    "note": "100% @. Another Noble Hunter in the swamp by Guk. As far as I know, these nobles are the only way to raise Indigo Brotherhood faction if it's too low to do quests for the dark elves. It seems that the Nobles are all placeholders for eachother...there is often one hanging out by Guk, but each particular name seems to be rare. They kill froggies, and if you are evil, they attack you too! Hogas' max hit is for 27. Not sure of the factions, but I assume they were the same as Jars Legola."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Jars Legola",
    "zone": "Innothule Swamp",
    "loc": {
      "y": 110,
      "x": -499
    },
    "steps": [
      "Jars Legola"
    ],
    "note": "50% @."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Rell Ostodl",
    "zone": "Innothule Swamp",
    "loc": {
      "y": -1470,
      "x": 47
    },
    "steps": [
      "Rell Ostodl"
    ],
    "note": "75% @. Can Drop Tattered Parchment that simply reads \"Zimel's Blades\""
  },
  {
    "quest": "Noble Hunters",
    "npc": "Tann Cellus",
    "zone": "Innothule Swamp",
    "loc": {
      "y": 362,
      "x": -436
    },
    "steps": [
      "Tann Cellus"
    ],
    "note": "50% @."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Tal Godin",
    "zone": "Innothule Swamp, Rathe Mountains",
    "loc": {
      "y": -1470,
      "x": 47
    },
    "steps": [
      "Tal Godin"
    ],
    "note": "8% @ Innothule , Rathe (3943, -1366)."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Zepin Winsle",
    "zone": "Innothule Swamp",
    "loc": {
      "y": -1470,
      "x": 47
    },
    "steps": [
      "Zepin Winsle"
    ],
    "note": "100% @. This NPC spawns in Innothule Swamp, and also in Rathe Mountains on a bugged cycle with several other NPCS who spawn and despawn about once per minute."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Sven Drinn",
    "zone": "Rathe Mountains",
    "loc": {
      "y": 3992,
      "x": -1383
    },
    "steps": [],
    "note": "Drops Human Scalp."
  },
  {
    "quest": "Noble Hunters",
    "npc": "Philicia Drinn",
    "zone": "Rathe Mountains",
    "loc": {
      "y": 4002,
      "x": -1359
    },
    "steps": [],
    "note": "Drops Human Scalp."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Andlin",
    "zone": "North Freeport",
    "loc": {
      "y": -91,
      "x": 337
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Boris",
    "zone": "North Freeport",
    "loc": {
      "y": 147,
      "x": 335
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Gallius",
    "zone": "North Freeport",
    "loc": {
      "y": 38,
      "x": 340
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Janeal",
    "zone": "North Freeport",
    "loc": {
      "y": 147,
      "x": 364
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Meighan",
    "zone": "North Freeport",
    "loc": {
      "y": 37,
      "x": 359
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Theo",
    "zone": "North Freeport",
    "loc": {
      "y": 76,
      "x": 371
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Sentry Warren",
    "zone": "North Freeport",
    "loc": {
      "y": 86,
      "x": 414
    },
    "steps": [],
    "note": "3% @."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Serna Tasknon",
    "zone": "North Freeport",
    "loc": {
      "y": 46,
      "x": 352
    },
    "steps": [],
    "note": "At the top of the temple."
  },
  {
    "quest": "Sentry Xyrin Quest",
    "npc": "Styria Fearnon",
    "zone": "Ocean of Tears",
    "loc": {
      "y": 578,
      "x": -9357
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Gnoll Poacher",
    "zone": "Surefall Glade",
    "loc": {
      "y": 143,
      "x": -419
    },
    "steps": [],
    "note": "15% @. Placeholder for the a Poacher. The gnoll poacher drops a \"gnoll head\" it is not \"no drop\" as the wiki states, it is tradeable. When you give it to Gillarian, you are given 2 silver (should be 7 gold, I entered a bug fix for this and incorrect dialogue). He gives you a rough elm recurve bow which sells for almost 2pp. Respawn Time: 6 minutes and 40 seconds. LOC: (144, -415)"
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "A Poacher",
    "zone": "Surefall Glade",
    "loc": {
      "y": 143,
      "x": -419
    },
    "steps": [],
    "note": "100% @. placeholder for Gnoll Poacher. Respawn time: 6 minutes and 40 seconds. LOC: (144, -415)"
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Poacher Dell",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Poacher Hill",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "16% @."
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Poacher Shelli",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @. She was found inside the hut labeled #2 on the map with the merchants,(just outside the Erudin zone) although its clear that she roams. A lvl 1 agnostic Erudite Enchanter is KOS to this NPC who cons red."
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Poacher Topi",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Poacher's Head Quest (Surefall Glade)",
    "npc": "Poacher Willa",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Flynn Merrington",
    "zone": "North Qeynos",
    "loc": {
      "y": 39,
      "x": 332
    },
    "steps": [],
    "note": "This little guy hands out always in the Crow's Tavern."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Geoard Bluehawk",
    "zone": "Erudin",
    "loc": {
      "y": -1175,
      "x": -331
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Illithi Nollith",
    "zone": "Erudin",
    "loc": {
      "y": -1074,
      "x": -217
    },
    "steps": [],
    "note": "Located on the first floor or the Erudin City Library."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Lanken Rjarn",
    "zone": "Erudin Palace",
    "loc": {
      "y": 537,
      "x": 776
    },
    "steps": [],
    "note": "Enchanter guildmaster in Erudin."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Moodoro Finharn",
    "zone": "North Qeynos",
    "loc": {
      "y": 164,
      "x": 338
    },
    "steps": [],
    "note": "Plays the card game. Spawn time: 6:40."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Nolusia Finharn",
    "zone": "Erudin / Erudin Palace",
    "loc": {
      "y": 695,
      "x": 651
    },
    "steps": [],
    "note": "Palace:. Quest NPC in Erudin at night. Enchanter Guildmaster in the Erudin Palace during the day."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Phloatin Highbrow",
    "zone": "Erudin",
    "loc": {
      "y": -1183,
      "x": -318
    },
    "steps": [],
    "note": "His sister is Sinnkin Highbrow, and the two of them are the only members of the faction Erudite Citizen."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Sinnkin Highbrow",
    "zone": "Erudin",
    "loc": {
      "y": -1053,
      "x": -255
    },
    "steps": [],
    "note": "Her brother is Phloatin Highbrow."
  },
  {
    "quest": "Vasty Deep Water",
    "npc": "Tol Nicelot",
    "zone": "Erudin, Qeynos Hills",
    "loc": {
      "y": -1096,
      "x": -232
    },
    "steps": [],
    "note": "|Erudin (-1096, -232). He doesn't trust the bank to hold his money and as a result he has a tendency to carry lots of platinum. It varies from around 2 to 5 platinum. He has a 6 minute respawn time. * Tol Nicelot that spawns in Erudin's Library will NOT be assisted by the guards. Respawn timer is 6:40? * Tol Nicelot that spawns in Erudin's Library is KOS for my Erudite Necromancer, I'll confirm that the guards do not assist, and i just pull with aggro as he walks by the door, let my pet occupy him long enough to darkness, then run him down to the toxx zoneline to fear kite. He will heal himself, so I keep him feared at all costs and burn him down quick, then med to full well before the next respawn. * If Mikeana Tolstaub aggros during a pull, zone out, and expect that the next pull you make is gonna suck. She apparently buffs him with something that gives him close to double his usual HP. * One of the possibly 24 minute spawns in Qeynos Hills that starts at West Karana and paths to North Qeynos then despawns. Shares this spawn with several NPCs, including Sir Edwin Motte, Guard Westyn, Wyle Bimlin, Isabella Cellus, Tol Nicelot, Gornolin, Crumpy Irontoe, Talym Shoontar and Barn Bloodstone, all of whom seem to be characters from other zones on a trip to Qeynos."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Aviak avocet",
    "zone": "Southern Karana",
    "loc": {
      "y": -6533,
      "x": 1177
    },
    "steps": [
      "Aviak Charm (Southern Karana - Aviak avocet)"
    ],
    "note": "50% @ , (-6772, 1035), (-6791, 1034), (-6661, 1128), (1244, -1811).. Aviak avocets are the strongest of the Aviaks found at the Village in South Karana. Possible spawn locs: 50% @ (-6533, 1177), (-6772, 1035), (-6791, 1034), (-6661, 1128), (1244, -1811). ===Lore=== Aviaks, a birdlike race of humanoids, can be found throughout Norrath. From nests in the crags of the Butcherblock Mountains to village roosts on island archipelagoes in the Ocean of Tears to entire aviary cities on the plains of Karana, many different species of aviaks have carved out their homes. As a rule, aviaks are not very aggressive toward other creatures. This trait, combined with their limited intelligence, makes them somewhat less than a serious threat to other civilized races. Aviaks can, however, become serious nuisances, if not outright threats, to outlying communities. They have little regard for (or perhaps little understanding of) territorial boundaries or ownership, happily foraging for food on a farmer's fields or even walking right into frontier homes in search of food. Aviaks have also been known to flock toward travelers and snatch anything brightly colored or glittery. Those who respond violently to the aviaks' actions find the normally unaggressive birdmen quite capable of defending themselves. Aviaks are prolific breeders, which keeps their population high even in the face of conflict with other more intelligent and warlike races. They are also long-lived by human standards, some living two centuries or more. Avocets, the eldest among the aviaks, reach considerable size and physical prowess, even developing enough intelligence to become reasonable leaders of their tribes."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Fire goblin shaman",
    "zone": "Solusek's Eye",
    "loc": {
      "y": 47,
      "x": -666
    },
    "steps": [
      "Goblin Fire Totem (Solusek A - Fire goblin shaman or inferno goblin shaman)"
    ],
    "note": "33% @ , (-29, -672)."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "A gypsy musician",
    "zone": "Mistmoore Castle",
    "loc": {
      "y": -152,
      "x": -13
    },
    "steps": [
      "Werewolf Talon (Mistmoore - A gypsy musician or A Werewolf)"
    ],
    "note": "33% @ , (-142, -18)."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "A Werewolf",
    "zone": "Western Plains of Karana, Southern Karana, Northern Karana, West Commonlands, Kithicor Forest, Mistmoore Castle",
    "loc": {
      "y": -3843,
      "x": -3875
    },
    "steps": [
      "Werewolf Talon (Mistmoore - A gypsy musician or A Werewolf)"
    ],
    "note": "50% @ in WK; (-515, -800) in WC, (-1200, -1000) near Gypsy Camp in NK. Spawns in places like the Karanas and the Commonlands at night. Drops are from the WK/SK werewolves unless otherwise noted. WC werewolves are able to drop the pelt. West Commonlands The first spawn happens exactly 8:00 PM in WC @ (-515, -800). It can only spawn 3 times in one night at 8PM, 11PM, and 3AM. The respawn timer is 10 minutes. (While it does spawn right at 8PM, it doesn't respawn right at 11PM and 3AM--it respawns 10 mins after you kill it.) Drops are not as common as listed. Killed 6 in a row with no drops. Confirmed WC Werewolf drops; and . South Karana Spawns by -4112.00, +3081.00, +67.88 south karana. Stare at wall and spawns every 9-10 mins."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Lord Soptyvr",
    "zone": "Gorge of King Xorbb",
    "loc": {
      "y": 492,
      "x": -604
    },
    "steps": [
      "Bunch of Optic Nerves (Runnyeye Citadel - an Evil Eye prisoner or an Evil Eye (Runnyeye); Beholder's Maze - an Evil Eye (Beholder's Maze), Lord Soptyvr, Lord Sviir, or Lord Syrkl; Lower Guk - An Evil Eye (Lower Guk))"
    ],
    "note": "25% @. Lord Soptyvr is the strongest of King Xorbb's subjects. He spawns on the altar in the middle of the other evil eye spawns. He is an enchanter who casts Tashani, Languid Pace, Sanity Warp, a dot, and a charm. Pet has a lot of hit points. Lord Sviir and Lord Syrkl can spawn nearby to his left and right. 4-hour respawn."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Lord Sviir",
    "zone": "Beholder's Maze",
    "loc": {
      "y": 538,
      "x": -638
    },
    "steps": [
      "Bunch of Optic Nerves (Runnyeye Citadel - an Evil Eye prisoner or an Evil Eye (Runnyeye); Beholder's Maze - an Evil Eye (Beholder's Maze), Lord Soptyvr, Lord Sviir, or Lord Syrkl; Lower Guk - An Evil Eye (Lower Guk))"
    ],
    "note": "15% @."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Lord Syrkl",
    "zone": "Beholder's Maze",
    "loc": {
      "y": 469,
      "x": -562
    },
    "steps": [
      "Bunch of Optic Nerves (Runnyeye Citadel - an Evil Eye prisoner or an Evil Eye (Runnyeye); Beholder's Maze - an Evil Eye (Beholder's Maze), Lord Soptyvr, Lord Sviir, or Lord Syrkl; Lower Guk - An Evil Eye (Lower Guk))"
    ],
    "note": "15% @."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "An Evil Eye (Lower Guk)",
    "zone": "Lower Guk",
    "loc": {
      "y": 625,
      "x": -445
    },
    "steps": [
      "Bunch of Optic Nerves (Runnyeye Citadel - an Evil Eye prisoner or an Evil Eye (Runnyeye); Beholder's Maze - an Evil Eye (Beholder's Maze), Lord Soptyvr, Lord Sviir, or Lord Syrkl; Lower Guk - An Evil Eye (Lower Guk))"
    ],
    "note": "This wizard is found on the live side of Lower Guk. The bag is the common drop; there is no longer a rare drop (Manastone). It Gates. 9 minute 30 second respawn timer."
  },
  {
    "quest": "Crafted Armor Quests",
    "npc": "Trazdon",
    "zone": "Najena",
    "loc": {
      "y": -225,
      "x": 150
    },
    "steps": [
      "Dark Circlet (Najena - Trazdon)"
    ],
    "note": "(#7 on the Najena map). Spawns on a ramp above a pool of blood with two elementals spawned below him. Will flee under 10%."
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "A Poacher",
    "zone": "Surefall Glade",
    "loc": {
      "y": 143,
      "x": -419
    },
    "steps": [],
    "note": "100% @. placeholder for Gnoll Poacher. Respawn time: 6 minutes and 40 seconds. LOC: (144, -415)"
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "Poacher Dell",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "Poacher Hill",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "16% @."
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "Poacher Shelli",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @. She was found inside the hut labeled #2 on the map with the merchants,(just outside the Erudin zone) although its clear that she roams. A lvl 1 agnostic Erudite Enchanter is KOS to this NPC who cons red."
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "Poacher Topi",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Poacher's Head Quest (Erudin)",
    "npc": "Poacher Willa",
    "zone": "Toxxulia Forest",
    "loc": {
      "y": 2208,
      "x": 389
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Clockwork XIIC",
    "zone": "Ak'Anon",
    "loc": {
      "y": 1313,
      "x": -380
    },
    "steps": [
      "Clockwork XIIC is located at 1314, -380, -80 on an island at the top of the waterfalls."
    ],
    "note": "16% @. This spider guards a machine in the middle of a lake. ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Clockwork XVIIC",
    "zone": "Ak'Anon",
    "loc": {
      "y": 2045,
      "x": -354
    },
    "steps": [
      "Clockwork XVIIC is located atop the wall just inside from the Steamfont Mountains entrance at 238, -46, 12 between 8pm and 6am, or at 2045, -354, -180 outside the entrance to the the Mines of Malfunction (evil Gnomes) between 6am and 8pm."
    ],
    "note": "16% @. Description needed. \"Adheres to time of day spawn.\" (means what?) ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Clockwork XXVIC",
    "zone": "Ak'Anon",
    "loc": {
      "y": 763,
      "x": -175
    },
    "steps": [
      "Clockwork XXVIC is located at 762, -175, -54 in the Palace outside King Ak'Anon's room."
    ],
    "note": "16% @. Description needed. ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Clockwork XXVIIC",
    "zone": "Ak'Anon",
    "loc": {
      "y": 1973,
      "x": -242
    },
    "steps": [
      "Clockwork XXVIIC paths between 1783, -385, -124 south of the paddle wheel, and 1988, -544, -182 in the Mines of Malfunction (evil Gnomes), stopping briefly at each location."
    ],
    "note": "16% @. Description needed. ===Lore=== The pride of gnome tinkerers, clockwork constructs come in several shapes and sizes suitable for the many roles they play in gnome society: from guards to cargo haulers to sewer cleaners. Made of metal and mechanical parts and powered by magic and steam, clockworks seem very alien to most of Norrath's denizens unaccustomed to the oddities of Akanon's gnomes. Clockworks show no emotion, going about their business with relentless precision. Every movement, every action they take, has a machine's calculated exactitude. Every clockwork has a particular job and place in gnome society as well as the skills and construction to match the job. Rat-like clockworks clean the streets and sewers. Large spider-like clockworks haul cargo overland. Clockworks built in the image of gnomes serve as guards and even automaton merchants. Well, that is how it all works in theory. In reality, many gnome tinkerers can hardly be bothered with getting every detail of every clockwork just right; there are so many other interesting things with which to fiddle. After being in service for some time, a few clockworks go rogue, distorting their intended functions in gnome society, sometimes with hazardous consequences. Some gnomes suspect that a force is actually at work within their society vandalizing perfectly functional clockworks and causing them to go rogue certainly a better explanation than faulty craftsmanship! Gnomes take clockworks with them when they travel across Norrath, so the machines are found wherever one encounters gnomes, while defective clockworks might be found wherever gnomes have passed by."
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Jogl Doobraugh",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": -157,
      "x": -495
    },
    "steps": [],
    "note": "Eight hour spawn"
  },
  {
    "quest": "Series C Black Boxes",
    "npc": "Drekon Vebnebber",
    "zone": "Ak'Anon",
    "loc": {
      "y": 866,
      "x": -475
    },
    "steps": [],
    "note": "Merchant selling general supplies in Ak'Anon."
  },
  {
    "quest": "Taxes",
    "npc": "Captain Rohand",
    "zone": "South Qeynos",
    "loc": {
      "y": 15,
      "x": -40
    },
    "steps": [
      "Captain Rohand (15, -40, 3)"
    ],
    "note": "Located inside of Mermaid's Lure. Can be found in category Fishing Supplies."
  },
  {
    "quest": "Taxes",
    "npc": "Fhara Semhart",
    "zone": "South Qeynos",
    "loc": {
      "y": 399,
      "x": -80
    },
    "steps": [
      "Fhara Semhart (400, -80, 3)"
    ],
    "note": "Behind Lion's Mane Inn. At Fhara's Leather and Thread. Around the corner from the Bard Guild at 412, -88."
  },
  {
    "quest": "Taxes",
    "npc": "Fish Ranamer",
    "zone": "South Qeynos",
    "loc": {
      "y": -292,
      "x": -269
    },
    "steps": [
      "Fish Ranamer (-290, -270, 3)"
    ],
    "note": "Located inside of Fish's Ale."
  },
  {
    "quest": "Taxes",
    "npc": "Flynn Merrington",
    "zone": "North Qeynos",
    "loc": {
      "y": 39,
      "x": 332
    },
    "steps": [
      "Flynn Merrington (35, 330, 3)"
    ],
    "note": "This little guy hands out always in the Crow's Tavern."
  },
  {
    "quest": "Taxes",
    "npc": "Mira Sayer",
    "zone": "Qeynos Hills",
    "loc": {
      "y": 1404,
      "x": 307
    },
    "steps": [
      "Mira Sayer (1400, 300, 8)"
    ],
    "note": ""
  },
  {
    "quest": "Taxes",
    "npc": "Nesiff Tallaherd",
    "zone": "South Qeynos",
    "loc": {
      "y": 440,
      "x": -243
    },
    "steps": [
      "Nesiff Tallaherd (440, -245, 3)"
    ],
    "note": "Merchant inside Nesiff's Wooden Weapons #5 on the SQ map."
  },
  {
    "quest": "Blessed Oil Quest",
    "npc": "Brother Hayle",
    "zone": "Splitpaw Lair",
    "loc": {
      "y": 382,
      "x": 329
    },
    "steps": [],
    "note": "50% @. In Splitpaw Lair, at #6 on the map. Spawns on instance creation."
  },
  {
    "quest": "Blessed Oil Quest",
    "npc": "Nomsoe Jusagta",
    "zone": "North Qeynos",
    "loc": {
      "y": -233,
      "x": -261
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Blessed Oil Quest",
    "npc": "Priestess Jahnda",
    "zone": "North Qeynos",
    "loc": {
      "y": -59,
      "x": -678
    },
    "steps": [],
    "note": "Cleric Guildmaster located in the Temple of Life."
  },
  {
    "quest": "Blessed Oil Quest",
    "npc": "Tyokan Mekase",
    "zone": "North Qeynos",
    "loc": {
      "y": -161,
      "x": -146
    },
    "steps": [],
    "note": "In the vendor building in the Temple of Life area. Note that he only works in the daytime, and a female NPC name Whysia Flock will be in his place at night. Hail her to confirm. Tyokan's primary faction changed to KnightsofThunder."
  },
  {
    "quest": "Blessed Oil Quest",
    "npc": "Whysia Flock",
    "zone": "North Qeynos",
    "loc": {
      "y": -161,
      "x": -146
    },
    "steps": [],
    "note": "Night-time general merchant and scroll strongbox minder (30 and 40 numbered boxes) at the Temple Shop at the Temple of Life in North Qeynos."
  },
  {
    "quest": "Blessed Oil",
    "npc": "Brother Hayle",
    "zone": "Splitpaw Lair",
    "loc": {
      "y": 382,
      "x": 329
    },
    "steps": [],
    "note": "50% @. In Splitpaw Lair, at #6 on the map. Spawns on instance creation."
  },
  {
    "quest": "Blessed Oil",
    "npc": "Nomsoe Jusagta",
    "zone": "North Qeynos",
    "loc": {
      "y": -233,
      "x": -261
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Blessed Oil",
    "npc": "Priestess Jahnda",
    "zone": "North Qeynos",
    "loc": {
      "y": -59,
      "x": -678
    },
    "steps": [],
    "note": "Cleric Guildmaster located in the Temple of Life."
  },
  {
    "quest": "Blessed Oil",
    "npc": "Tyokan Mekase",
    "zone": "North Qeynos",
    "loc": {
      "y": -161,
      "x": -146
    },
    "steps": [],
    "note": "In the vendor building in the Temple of Life area. Note that he only works in the daytime, and a female NPC name Whysia Flock will be in his place at night. Hail her to confirm. Tyokan's primary faction changed to KnightsofThunder."
  },
  {
    "quest": "Blessed Oil",
    "npc": "Whysia Flock",
    "zone": "North Qeynos",
    "loc": {
      "y": -161,
      "x": -146
    },
    "steps": [],
    "note": "Night-time general merchant and scroll strongbox minder (30 and 40 numbered boxes) at the Temple Shop at the Temple of Life in North Qeynos."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Frostbite",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": -3532,
      "x": -2236
    },
    "steps": [],
    "note": "100% @. A level 12 Frostbite was hitting an upwards of 26 and occasionally double striking. Undercon?"
  },
  {
    "quest": "Langseax Quest",
    "npc": "Iceberg",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2050,
      "x": -3800
    },
    "steps": [],
    "note": "Wanders the tundra but spawns at Tundra Jack's Tower and often gets stuck in his pathing there.. Follows Tundra Jack around."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Basil",
    "zone": "West Karana",
    "loc": {
      "y": 0,
      "x": -8500
    },
    "steps": [],
    "note": "Basil is the easier of the two enemies spawned by the Langseax quest. He spawns significantly more often and is drastically easier than his counterpart, Paglan. T In Everquest Legends he has at least two spawn points on the western side of the zone. Once he spawns, he immediately starts running around the zone up in the mountainous northern area. He runs past the Ogre camp (area 18 on the West Karana map), so if you don't have tracking this might be a good landmark to watch for him. But as far as I can tell, once he sawns, he just keeps running around in the northern part of the zone."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Paglan",
    "zone": "West Karana",
    "loc": {
      "y": -8500,
      "x": 0
    },
    "steps": [],
    "note": "Paglan is an astoundingly under-conned mob. This enemy has at least double the health of Basil and hits extremely hard. As a level 25 warrior I was able to deal about 150 damage to him before he had me near death and 150 damage barely dented his health bar. I'm estimating his health to be somewhere above or near 1250. Unclear if he actually is a Rogue per the Wiki, Basil was not, but I did not want to risk seeing if Paglan could backstab me. He spawned in the same area Basil did, near #16 on the West Karana map. I found him on my 8th or 9th try."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Dok",
    "zone": "Halas",
    "loc": {
      "y": 212,
      "x": 275
    },
    "steps": [],
    "note": "@."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Tundra Jack",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2859,
      "x": -1620
    },
    "steps": [],
    "note": "100% @. Always followed by his polar bear companion, Iceberg. After spawning he immediately sprints south at jboots speed across the mountains. Beware if you're using Wolf Form to traverse the zone, he will attack you. If killed first, Iceberg will almost immediately despawn. Trivia: Tundra Jack is inspired by Yukon Cornelius from the Rankin and Bass 1964 stop motion animated television special Rudolph the Red-Nosed Reindeer. Besides the name similarity they are both prospectors on a frigid tundra and make reference to silver and gold."
  },
  {
    "quest": "Langseax Quest",
    "npc": "Ulrich McMannus",
    "zone": "Western Plains of Karana",
    "loc": {
      "y": -3793,
      "x": -2353
    },
    "steps": [],
    "note": "May drop a Rusty Halberd, even if he isn't holding one (especially when showing another weapon). Note: I've been charming Ulrich and throwing him at the nearby Guard Donlan, and Ulrich has won every fight with anywhere from a quarter to half of his HP remaining. Absolutely an undercon."
  },
  {
    "quest": "Magic Elixir for the Warriors",
    "npc": "Arnis McLish",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": -1599,
      "x": -168
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Magic Elixir for the Warriors",
    "npc": "Bryndin McMill",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2041,
      "x": -1149
    },
    "steps": [],
    "note": "50% @. This barbarian can be found in Everfrost Peaks standing next to his faithful companion Snowflake"
  },
  {
    "quest": "Magic Elixir for the Warriors",
    "npc": "Megan O`Reilly",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2025,
      "x": -3795
    },
    "steps": [],
    "note": "50% @. Tundra Jack says, 'Megan? Just a young warrior of the Wolves of the North. She sorta likes hangin' around ol' Tundra Jack. Must be my good looks.' We learn from Renth McLanis that Renth was ordered to personally escort the young warrior, Megan (the courier). Megan was sent to fetch the remains of Warrior Guildmaster Kylan O'Danos' deceased cousin, Ivan McMannus. Renth guzzling spirits at McDaniels forgot. Having lost the courier, Megan (and so the remains of Kylan's cousin) Renth sends you to Arnis McLish. for directions to Megan, and find out from her where Ivan's remains are. I think Renth is scared of Tundra Jack! Arnis McLish says 'I heard she got lost on the plains. You should go ask her dog, Snowflake, where she is. I hear he is somewhere around the pass to Halas.' Snowflake says 'Ruff.. Ruff.. Woof..' Megan OReilly says 'Brrrr.. It.. Is sooo.. c-cold!! I never.. sh-should've j-joined.. the.. the W-wolves of the N-north!!'"
  },
  {
    "quest": "Magic Elixir for the Warriors",
    "npc": "Snowflake",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 2021,
      "x": -1161
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Magic Elixir for the Warriors",
    "npc": "Talin O`Donal",
    "zone": "Everfrost Peaks",
    "loc": {
      "y": 3611,
      "x": 671
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Princess Lenya (Quest)",
    "npc": "Inkeeper Freegraze",
    "zone": "Northern Felwithe",
    "loc": {
      "y": 147,
      "x": -374
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Princess Lenya (Quest)",
    "npc": "Jojongua",
    "zone": "Innothule Swamp",
    "loc": {
      "y": 1832,
      "x": 0,
      "z": -25
    },
    "steps": [],
    "note": "20% @. A very large kobold that spawns near the undead tower. I seemed to spawn him by killing undead in the tower and/or the kobold that wanders by it near the water."
  },
  {
    "quest": "Princess Lenya (Quest)",
    "npc": "Marlin Shirtov",
    "zone": "Highpass Hold",
    "loc": {
      "y": 396,
      "x": -231
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Princess Lenya (Quest)",
    "npc": "Mistress Anna",
    "zone": "High Keep",
    "loc": {
      "y": -78,
      "x": -87
    },
    "steps": [],
    "note": "Level 4: 50% @."
  },
  {
    "quest": "Princess Lenya (Quest)",
    "npc": "Tearon Bleanix",
    "zone": "High Keep",
    "loc": {
      "y": 15,
      "x": 50
    },
    "steps": [],
    "note": "3% @. Casts Lay on Hands. An undead version also exists behind a locked door on the 3rd floor."
  },
  {
    "quest": "Rogue Errands",
    "npc": "Guard Stald",
    "zone": "Highpass Hold",
    "loc": {
      "y": 127,
      "x": 464
    },
    "steps": [],
    "note": "100% @."
  },
  {
    "quest": "Rogue Errands",
    "npc": "Hanns Krieghor",
    "zone": "North Qeynos",
    "loc": {
      "y": 31,
      "x": 149
    },
    "steps": [],
    "note": "The Rogue Guildmaster in Qeynos[https://web.archive.org/web/20010423170131/http://eqbeastiary.allakhazam.com:80/search.shtml?id=2960]. Leader of the Circle of Unseen Hands. Get it? Unseen Hanns? Speculated to be a reference to Hans Gruber (Alan Rickman), the main antagonist of Die Hard, a 1988 American film."
  },
  {
    "quest": "Rogue Errands",
    "npc": "Jracol Brestiage",
    "zone": "North Qeynos",
    "loc": {
      "y": 1117,
      "x": -854
    },
    "steps": [],
    "note": "50% @. Jracol Brestiage is the Dark Elf with Highpass faction who hangs outside the north gate in the North Qeynos zone. If you hang a right coming out of the north gate and follow the wall, you should see him standing by the wall or by a tree close to the zone. He is only around at night between 8 PM to 5 AM."
  },
  {
    "quest": "Rogue Errands",
    "npc": "Prak",
    "zone": "Highpass Hold",
    "loc": {
      "y": 396,
      "x": -203
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Rogue Errands",
    "npc": "Zannsin Resdinet",
    "zone": "North Qeynos",
    "loc": {
      "y": 143,
      "x": 163
    },
    "steps": [],
    "note": "Found in \"treasure room\""
  },
  {
    "quest": "Telescope Lenses",
    "npc": "Bidl Frugrin",
    "zone": "Greater Faydark",
    "loc": {
      "y": -540,
      "x": -570
    },
    "steps": [],
    "note": "50% @. Despawns at 6 am, respawns at 8 pm."
  },
  {
    "quest": "Telescope Lenses",
    "npc": "Fodin Frugrin",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": -1788,
      "x": 666
    },
    "steps": [],
    "note": "Merchant selling various smithing armor molds in Steamfont."
  },
  {
    "quest": "Telescope Lenses",
    "npc": "Phiz Frugrin",
    "zone": "Steamfont Mountains",
    "loc": {
      "y": -1570,
      "x": -1821
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "Telescope Lenses",
    "npc": "Trudo Frugrin",
    "zone": "Lesser Faydark",
    "loc": {
      "y": 1069,
      "x": -1676
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "Telescope Lenses",
    "npc": "Zenita D`Rin",
    "zone": "East Freeport",
    "loc": {
      "y": -1548,
      "x": 335
    },
    "steps": [],
    "note": "50% @. She calls herself the great Zenita. You can play a card game with her to win a spare telescope lens."
  },
  {
    "quest": "The Bayle List",
    "npc": "Frenway Marthank",
    "zone": "Surefall Glade",
    "loc": {
      "y": -103,
      "x": -303
    },
    "steps": [],
    "note": "50% @."
  },
  {
    "quest": "The Bayle List",
    "npc": "Mammoth",
    "zone": "Surefall Glade",
    "loc": {
      "y": 225,
      "x": -180
    },
    "steps": [],
    "note": "Mammoth is a great bear that can sometimes be found in the caves of Surefall Glade. Mammoth spawns directly behind the waterfall on the lake in the glade and wanders into the cave. Mammoth spawns 3AM game time and despawns by 5AM."
  },
  {
    "quest": "The Bayle List",
    "npc": "Mutt Rootlit",
    "zone": "Highpass Hold",
    "loc": {
      "y": 422,
      "x": -60
    },
    "steps": [],
    "note": "She is found standing next to her 'hero' Barn Bloodstone"
  },
  {
    "quest": "The Bayle List",
    "npc": "Pietro Zarn",
    "zone": "East Freeport",
    "loc": {
      "y": -207,
      "x": -303
    },
    "steps": [],
    "note": "SK Guildmaster"
  },
  {
    "quest": "The Bayle List",
    "npc": "Rathmana Allin",
    "zone": "Southern Desert of Ro",
    "loc": {
      "y": 1210,
      "x": 1402
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "The Donations",
    "npc": "Enic Ruklin",
    "zone": "North Qeynos",
    "loc": {
      "y": -34,
      "x": -375
    },
    "steps": [],
    "note": ""
  },
  {
    "quest": "The Donations",
    "npc": "Guard Cheslin",
    "zone": "Qeynos Hills",
    "loc": {
      "y": 1037,
      "x": -873
    },
    "steps": [],
    "note": "A particularly boastful and confident member of the Qeynos guard. Has a nasty habit of getting himself murdered by low-level mobs due to being low-level himself."
  },
  {
    "quest": "The Donations",
    "npc": "Guard Leopold",
    "zone": "Qeynos Hills",
    "loc": {
      "y": 573,
      "x": 94
    },
    "steps": [],
    "note": "Seems to have high resists. Breaks roots frequently as a 44 sham."
  },
  {
    "quest": "The Donations",
    "npc": "Kane Bayle (NPC)",
    "zone": "North Qeynos",
    "loc": {
      "y": 270,
      "x": 202
    },
    "steps": [],
    "note": "Qeynos military leader. May have been Level 50 earlier in EQ's timeline [https://web.archive.org/web/20020703091354/http://eqbeastiary.allakhazam.com:80/search.shtml?id=6848]"
  },
  {
    "quest": "The Donations",
    "npc": "Lanhern Firepride",
    "zone": "South Qeynos",
    "loc": {
      "y": 190,
      "x": -314
    },
    "steps": [],
    "note": "Merchant selling plate armor. Wife of Ton Firepride who is a rival of Brohan Ironforge. Lanhern swoons over Brohan's son Dren Ironforge. Dren believes Lanhern's husband Ton is her father. Lanhern claims Ton was tutored in Blacksmithing by the Dwarfs of Kaladim ... and she also acquired the dwarf's love of drink. Ogre Swill is her beverage of choice. The Firepride's son is Guard Ginton who patrols North Qeynos. She goes to the Fish's Ale at -231, -280 from 6PM to 6AM and will not sell anything during this timeframe. Meera Lylon takes her place in Fireprides to sell the same selection."
  },
  {
    "quest": "Titan Samples (good)",
    "npc": "Giang Yin",
    "zone": "Stonebrunt Mountains",
    "loc": {
      "y": 1822,
      "x": -1364
    },
    "steps": [],
    "note": "34% @. Other pandas in the zone seem to be the place holder for this guy. He wanders a good portion of the zone at SOW speed. Can't be snared or rooted so if you're going to kill him then be prepared for that."
  },
  {
    "quest": "Titan Samples (good)",
    "npc": "Old Ghostback",
    "zone": "Stonebrunt Mountains",
    "loc": {
      "y": 1734,
      "x": -2702
    },
    "steps": [],
    "note": "34% @. Old Ghostback is a gorilla found in the Stonebrunt Mountains. Players can get him to spawn by killing gorillas in the northern part of the zone. He is immune to run speed changes."
  },
  {
    "quest": "Titan Samples (good)",
    "npc": "Prowler of the Jungle",
    "zone": "Stonebrunt Mountains",
    "loc": {
      "y": 2000,
      "x": 2000
    },
    "steps": [],
    "note": "15% @. Immune to changes in run speed. Instant spawn after killing the trigger (Any Leopard seems to spawn it once it's been spawned once). Does not drop the skin or tooth every time. May have No loot whatsoever."
  },
  {
    "quest": "Titan Samples (good)",
    "npc": "Slyder the Ancient",
    "zone": "Stonebrunt Mountains",
    "loc": {
      "y": 3517,
      "x": 1165
    },
    "steps": [],
    "note": "100% @. A very, very large snake. Not immune to Fear, but is immune to changes in run speed. Procs Deadly Poison (100dmg initial hit, 30dmg per tick for several minutes after). Ouch! The An emerald adder that paths North to South along the West wall is the PH for Slyder the Ancient. Slyder seems to mostly spawn in the Northwestern quadrant."
  },
  {
    "quest": "Titan Samples (good)",
    "npc": "Snowbeast",
    "zone": "Stonebrunt Mountains",
    "loc": {
      "y": 1696,
      "x": -2524
    },
    "steps": [],
    "note": "50% @ , 50% @ (3250, 1015). Fast run speed but not as fast as SoW. As with all the other Titans in this area, Snowbeast will spawn instantly once the placeholder is killed, and the placeholder is another animal of the same type as the Titan (in this case either the highland tigers or kejek tigers may be the ph). Once spawned, it will roam quite widely in the area around the spawn point, but can generally be found in the north and north-west areas of the zone. Immune to run speed changes. Can be controlled with stun, mez, charm and fear."
  }
];
