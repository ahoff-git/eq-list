/**
 * Quest items that lie on the ground at a known spot — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-quest-pickups.mjs`, which reads eqlwiki's quest-page
 * pickup tables (scraped 2026-10-15T17:16:44.800Z). Shipped rather than fetched at runtime — see
 * [ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md). Read it
 * through `quest-pickups.ts`, which owns how a pickup is named on the list and placed on the map.
 *
 * 20 pickups, 4 quest NPCs.
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
  /** Where, in `/loc` order. */
  loc: { y: number; x: number; z?: number };
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
  loc: { y: number; x: number };
  /** The quest's checklist steps that name them — what to hand in, and what you get back. */
  steps: string[];
  /** How to reach them, from their page. */
  note: string;
}

export const QUEST_PICKUPS_SOURCE = { wiki: "https://eqlwiki.com", pages: ["Tarton's Wheel","Coin of Tash (Tashania)"], scrapedAt: "2026-10-15T17:16:44.800Z" };

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
  }
];

export const QUEST_NPCS: QuestNpc[] = [
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
  }
];
