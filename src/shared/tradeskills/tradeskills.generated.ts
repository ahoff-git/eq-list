/**
 * Tradeskills and their leveling guides — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-tradeskills.mjs`, which reads every page in eqlwiki's
 * `Category:Tradeskills` (scraped 2026-10-17T20:53:16.996Z). Shipped rather than fetched at runtime — see the
 * script's header and
 * [ADR 0302](../../../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md).
 *
 * Facts only: which era each page and each linked item belongs to, and which eras the wiki had open
 * on the day this was scraped. Whether a line is out of era *now* is `tradeskill-era.ts`'s call.
 */

import type { Tradeskill, WikiPrice } from "./tradeskill-types";

export const TRADESKILLS_SOURCE = { category: "Tradeskills", scrapedAt: "2026-10-17T20:53:16.996Z" };

/** `Template:PageEra`'s `in` keys on the day of the scrape. Anything else is shut (its `#default`). */
export const OPEN_ERAS_AT_SCRAPE: readonly string[] = ["classic","fear","hate","hole","sky","stonebrunt","temple","warrens","paineel"];

/** Linked item title → its era keys (`classic` left out: always open). */
export const ITEM_ERAS: Readonly<Record<string, readonly string[]>> = {
  "Clay/water mixture": [
    "velious"
  ],
  "Dragon Meat": [
    "velious"
  ],
  "Dragon Steak": [
    "velious"
  ],
  "Unfired Idol": [
    "velious"
  ]
};

/**
 * What a merchant charges for a material, in copper, and the page that said so — a skill page's cost
 * table first, else the item's own notes. An approximation the wiki's editors wrote down; charisma and
 * faction move the real price.
 */
export const PRICES: Readonly<Record<string, WikiPrice>> = {
  "Agrimony": {
    "copper": 132299,
    "source": "Skill Alchemy"
  },
  "Allspice": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Arnworth": {
    "copper": 1679,
    "source": "Arnworth"
  },
  "Arrow": {
    "copper": 160,
    "source": "Skill Fletching"
  },
  "Ashwood Bow Staff": {
    "copper": 15750,
    "source": "Skill Fletching"
  },
  "Balm Leaves": {
    "copper": 66840,
    "source": "Skill Alchemy"
  },
  "Benzoin": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Birthwort": {
    "copper": 524,
    "source": "Birthwort"
  },
  "Bladderwrack": {
    "copper": 135475,
    "source": "Skill Alchemy"
  },
  "Block of Clay": {
    "copper": 41,
    "source": "Block of Clay"
  },
  "Blue Vervain Bulb": {
    "copper": 367,
    "source": "Blue Vervain Bulb"
  },
  "Bundled Bone Arrow Shafts": {
    "copper": 79,
    "source": "Skill Fletching"
  },
  "Bundled Ceramic Arrow Shafts": {
    "copper": 1155,
    "source": "Skill Fletching"
  },
  "Bundled Wooden Arrow Shafts": {
    "copper": 5,
    "source": "Skill Fletching"
  },
  "Celandine Herb": {
    "copper": 8467,
    "source": "Skill Alchemy"
  },
  "Cententialspore": {
    "copper": 524,
    "source": "Skill Alchemy"
  },
  "Cloak Sectional Mold": {
    "copper": 1259,
    "source": "Cloak Sectional Mold"
  },
  "Clover": {
    "copper": 22490,
    "source": "Skill Alchemy"
  },
  "Clubmoss": {
    "copper": 8467,
    "source": "Skill Alchemy"
  },
  "Comfrey": {
    "copper": 524,
    "source": "Comfrey"
  },
  "Darkwood Bow Staff": {
    "copper": 226800,
    "source": "Skill Fletching"
  },
  "Dhea": {
    "copper": 39689,
    "source": "Skill Alchemy"
  },
  "Duskglow Vine": {
    "copper": 524,
    "source": "Duskglow Vine"
  },
  "Echinacea": {
    "copper": 6773,
    "source": "Skill Alchemy"
  },
  "Elderberry": {
    "copper": 10583,
    "source": "Skill Alchemy"
  },
  "Electrum Bar": {
    "copper": 2650,
    "source": "Electrum Bar"
  },
  "Elm Bow Staff": {
    "copper": 2110,
    "source": "Skill Fletching"
  },
  "Eucalyptus Leaf": {
    "copper": 6776,
    "source": "Skill Alchemy"
  },
  "Fennel": {
    "copper": 3385,
    "source": "Skill Alchemy"
  },
  "Fenugreek": {
    "copper": 524,
    "source": "Fenugreek"
  },
  "Figwort": {
    "copper": 66145,
    "source": "Skill Alchemy"
  },
  "Fine Coral Mesh": {
    "copper": 190200,
    "source": "Fine Coral Mesh"
  },
  "Fire Opal": {
    "copper": 55000,
    "source": "Fire Opal"
  },
  "Flight Arrow": {
    "copper": 4100,
    "source": "Skill Fletching"
  },
  "Gears": {
    "copper": 7300,
    "source": "Gears"
  },
  "Glass Shard": {
    "copper": 80,
    "source": "Glass Shard"
  },
  "Gnomish Bolts": {
    "copper": 3000,
    "source": "Gnomish Bolts"
  },
  "Gold Bar": {
    "copper": 10079,
    "source": "Gold Bar"
  },
  "Heliotrope": {
    "copper": 135474,
    "source": "Skill Alchemy"
  },
  "Hemp Twine": {
    "copper": 10,
    "source": "Skill Fletching"
  },
  "Hickory Bow Staff": {
    "copper": 211,
    "source": "Skill Fletching"
  },
  "Hydrangea": {
    "copper": 11853,
    "source": "Skill Alchemy"
  },
  "Hyssop": {
    "copper": 6776,
    "source": "Skill Alchemy"
  },
  "Jatamasi": {
    "copper": 6775,
    "source": "Skill Alchemy"
  },
  "Katuka Bark": {
    "copper": 524,
    "source": "Skill Alchemy"
  },
  "Lady's Mantle": {
    "copper": 3386,
    "source": "Skill Alchemy"
  },
  "Large Bowl Sketch": {
    "copper": 1500,
    "source": "Large Bowl Sketch"
  },
  "Large Groove Nocks": {
    "copper": 5,
    "source": "Skill Fletching"
  },
  "Lime Coated Meshing": {
    "copper": 158500,
    "source": "Lime Coated Meshing"
  },
  "Lined Vial Sketch": {
    "copper": 839,
    "source": "Lined Vial Sketch"
  },
  "Linen String": {
    "copper": 21,
    "source": "Skill Fletching"
  },
  "Lucerne": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Maidenhair Fern": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Mandrake Root": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Medium Groove Nocks": {
    "copper": 16,
    "source": "Skill Fletching"
  },
  "Mercury": {
    "copper": 10160,
    "source": "Skill Alchemy"
  },
  "Metal Fastening": {
    "copper": 16000,
    "source": "Metal Fastening"
  },
  "Metal Rod": {
    "copper": 800,
    "source": "Metal Rod"
  },
  "Metal Twine": {
    "copper": 1000,
    "source": "Metal Twine"
  },
  "Mugwart": {
    "copper": 7349,
    "source": "Skill Alchemy"
  },
  "Mullein": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Mystic Ash": {
    "copper": 20321,
    "source": "Skill Alchemy"
  },
  "Night Shade": {
    "copper": 2645,
    "source": "Skill Alchemy"
  },
  "Oak Bow Staff": {
    "copper": 69300,
    "source": "Skill Fletching"
  },
  "Oakmoss": {
    "copper": 135475,
    "source": "Skill Alchemy"
  },
  "Planing Tool": {
    "copper": 10710,
    "source": "Skill Fletching"
  },
  "Platemail Helm": {
    "copper": 370000,
    "source": "Platemail Helm"
  },
  "Platinum Bar": {
    "copper": 105000,
    "source": "Platinum Bar"
  },
  "Sage Leaf": {
    "copper": 2648,
    "source": "Skill Alchemy"
  },
  "Sealed Vial Sketch": {
    "copper": 1889,
    "source": "Sealed Vial Sketch"
  },
  "Set of Bone Arrow Vanes": {
    "copper": 1365,
    "source": "Skill Fletching"
  },
  "Set of Ceramic Arrow Vanes": {
    "copper": 2782,
    "source": "Skill Fletching"
  },
  "Set of Wooden Arrow Vanes": {
    "copper": 682,
    "source": "Skill Fletching"
  },
  "Several Parabolic Cut Fletchings": {
    "copper": 26,
    "source": "Skill Fletching"
  },
  "Several Round Cut Fletchings": {
    "copper": 5,
    "source": "Skill Fletching"
  },
  "Several Shield Cut Fletchings": {
    "copper": 189,
    "source": "Skill Fletching"
  },
  "Sharkskin Tubing": {
    "copper": 142600,
    "source": "Sharkskin Tubing"
  },
  "Sheet Metal": {
    "copper": 1000,
    "source": "Sheet Metal"
  },
  "Sickle Leaf": {
    "copper": 524,
    "source": "Sickle Leaf"
  },
  "Silk String": {
    "copper": 52,
    "source": "Skill Fletching"
  },
  "Silver Bar": {
    "copper": 530,
    "source": "Silver Bar"
  },
  "Small Brick of Ore": {
    "copper": 515,
    "source": "Small Brick of Ore"
  },
  "Small Groove Nocks": {
    "copper": 42,
    "source": "Skill Fletching"
  },
  "Small Piece of Ore": {
    "copper": 172,
    "source": "Small Piece of Ore"
  },
  "Small Vial": {
    "copper": 10,
    "source": "Skill Alchemy"
  },
  "Snakes Head Iris": {
    "copper": 2839,
    "source": "Skill Alchemy"
  },
  "Sumbul": {
    "copper": 6773,
    "source": "Skill Alchemy"
  },
  "Valerian Root": {
    "copper": 3149,
    "source": "Valerian Root"
  },
  "Velium Bar": {
    "copper": 251999,
    "source": "Jewelcrafting"
  },
  "Whittling Blade": {
    "copper": 2110,
    "source": "Skill Fletching"
  },
  "Wolf Blood": {
    "copper": 1058,
    "source": "Skill Alchemy"
  },
  "Yarrow": {
    "copper": 25199,
    "source": "Skill Alchemy"
  },
  "Yerbhimba": {
    "copper": 524,
    "source": "Yerbhimba"
  }
};

/** What one combine of a crafted item costs in materials, where a skill page states it whole. */
export const COMBINE_COSTS: Readonly<Record<string, WikiPrice>> = {
  "Animated Bait": {
    "copper": 4,
    "source": "Skill Tinkering"
  },
  "Aqualung": {
    "copper": 240000,
    "source": "Skill Tinkering"
  },
  "Black Pearl Electrum Choker": {
    "copper": 22678,
    "source": "Jewelcrafting"
  },
  "Black Pearl Platinum Ring": {
    "copper": 120958,
    "source": "Jewelcrafting"
  },
  "Black Pearl Velium Ring": {
    "copper": 272158,
    "source": "Jewelcrafting"
  },
  "Black Sapphire Electrum Earring": {
    "copper": 260000,
    "source": "Jewelcrafting"
  },
  "Black Sapphire Platinum Necklace": {
    "copper": 355000,
    "source": "Jewelcrafting"
  },
  "Black Sapphire Silvered Necklace": {
    "copper": 255000,
    "source": "Jewelcrafting"
  },
  "Black Sapphire Velium Necklace": {
    "copper": 525000,
    "source": "Jewelcrafting"
  },
  "Blackened Pearl Silver Ring": {
    "copper": 20662,
    "source": "Jewelcrafting"
  },
  "Blue Diamond Electrum Earring": {
    "copper": 285000,
    "source": "Jewelcrafting"
  },
  "Bundled Steel Arrow Shafts": {
    "copper": 2835,
    "source": "Skill Fletching"
  },
  "Cat Eye Platinum Necklace": {
    "copper": 101000,
    "source": "Jewelcrafting"
  },
  "Cat Eye Velium Necklace": {
    "copper": 252200,
    "source": "Jewelcrafting"
  },
  "CLASS 1 Bone Hooked Arrow": {
    "copper": 415,
    "source": "Skill Fletching"
  },
  "CLASS 1 Bone Point Arrow": {
    "copper": 94,
    "source": "Skill Fletching"
  },
  "CLASS 1 Ceramic Point Arrow": {
    "copper": 1393,
    "source": "Skill Fletching"
  },
  "CLASS 1 Wood Hooked Arrow": {
    "copper": 330,
    "source": "Skill Fletching"
  },
  "CLASS 1 Wood Point Arrow": {
    "copper": 20,
    "source": "Skill Fletching"
  },
  "CLASS 2 Bone Hooked Arrow": {
    "copper": 425,
    "source": "Skill Fletching"
  },
  "CLASS 2 Bone Point Arrow": {
    "copper": 115,
    "source": "Skill Fletching"
  },
  "CLASS 2 Ceramic Hooked Arrow": {
    "copper": 1501,
    "source": "Skill Fletching"
  },
  "CLASS 2 Ceramic Silver Tip Arrow": {
    "copper": 5176,
    "source": "Skill Fletching"
  },
  "CLASS 2 Steel Silver Tip Arrow": {
    "copper": 6893,
    "source": "Skill Fletching"
  },
  "CLASS 2 Wood Point Arrow": {
    "copper": 41,
    "source": "Skill Fletching"
  },
  "CLASS 3 Bone Hooked Arrow": {
    "copper": 588,
    "source": "Skill Fletching"
  },
  "CLASS 3 Bone Point Arrow": {
    "copper": 278,
    "source": "Skill Fletching"
  },
  "CLASS 3 Ceramic Hooked Arrow": {
    "copper": 1664,
    "source": "Skill Fletching"
  },
  "CLASS 3 Ceramic Silver Tip Arrow": {
    "copper": 5339,
    "source": "Skill Fletching"
  },
  "CLASS 3 Steel Silver Tip Arrow": {
    "copper": 7019,
    "source": "Skill Fletching"
  },
  "CLASS 3 Wood Point Arrow": {
    "copper": 204,
    "source": "Skill Fletching"
  },
  "CLASS 4 Bone Hooked Arrow": {
    "copper": 1118,
    "source": "Skill Fletching"
  },
  "CLASS 4 Ceramic Hooked Arrow": {
    "copper": 2194,
    "source": "Skill Fletching"
  },
  "CLASS 4 Ceramic Silver Tip Arrow": {
    "copper": 5869,
    "source": "Skill Fletching"
  },
  "CLASS 4 Steel Silver Tip Arrow": {
    "copper": 7549,
    "source": "Skill Fletching"
  },
  "CLASS 4 Wood Point Arrow": {
    "copper": 697,
    "source": "Skill Fletching"
  },
  "CLASS 5 Ceramic Silver Tip Arrow": {
    "copper": 6526,
    "source": "Skill Fletching"
  },
  "CLASS 5 Steel Silver Tip Arrow": {
    "copper": 8232,
    "source": "Skill Fletching"
  },
  "CLASS 5 Wood Point Arrow": {
    "copper": 1643,
    "source": "Skill Fletching"
  },
  "CLASS 6 Ceramic Silver Tip Arrow": {
    "copper": 7969,
    "source": "Skill Fletching"
  },
  "CLASS 6 Steel Silver Tip Arrow": {
    "copper": 9612,
    "source": "Skill Fletching"
  },
  "CLASS 6 Wood Point Arrow": {
    "copper": 4030,
    "source": "Skill Fletching"
  },
  "Collapsible Fishing Pole": {
    "copper": 6000,
    "source": "Skill Tinkering"
  },
  "Compass": {
    "copper": 3000,
    "source": "Skill Tinkering"
  },
  "Diamond Electrum Mask": {
    "copper": 227519,
    "source": "Jewelcrafting"
  },
  "Electrum Amber Earring": {
    "copper": 5038,
    "source": "Jewelcrafting"
  },
  "Electrum Bloodstone Necklace": {
    "copper": 3022,
    "source": "Jewelcrafting"
  },
  "Electrum Carnelian Wedding Ring": {
    "copper": 3375,
    "source": "Jewelcrafting"
  },
  "Electrum Cat Eye Bracelet": {
    "copper": 2720,
    "source": "Jewelcrafting"
  },
  "Electrum Fire Wedding Ring": {
    "copper": 57519,
    "source": "Jewelcrafting"
  },
  "Electrum Hematite Choker": {
    "copper": 2670,
    "source": "Jewelcrafting"
  },
  "Electrum Jasper Earring": {
    "copper": 3274,
    "source": "Jewelcrafting"
  },
  "Electrum Lapis Lazuli Earring": {
    "copper": 2609,
    "source": "Jewelcrafting"
  },
  "Electrum Malachite Bracelet": {
    "copper": 2569,
    "source": "Jewelcrafting"
  },
  "Electrum Onyx Pendant": {
    "copper": 3174,
    "source": "Jewelcrafting"
  },
  "Electrum Opal Amulet": {
    "copper": 19654,
    "source": "Jewelcrafting"
  },
  "Electrum Pearl Choker": {
    "copper": 7054,
    "source": "Jewelcrafting"
  },
  "Electrum Peridot Bracelet": {
    "copper": 12598,
    "source": "Jewelcrafting"
  },
  "Electrum Star Amulet": {
    "copper": 3526,
    "source": "Jewelcrafting"
  },
  "Electrum Star Ruby Ring": {
    "copper": 68038,
    "source": "Jewelcrafting"
  },
  "Electrum Turquoise Engagement Ring": {
    "copper": 2629,
    "source": "Jewelcrafting"
  },
  "Emerald Electrum Bracelet": {
    "copper": 15622,
    "source": "Jewelcrafting"
  },
  "Field Point Arrowheads": {
    "copper": 5,
    "source": "Skill Fletching"
  },
  "Fire Emerald Electrum Bracelet": {
    "copper": 88198,
    "source": "Jewelcrafting"
  },
  "Fire Emerald Golden Bracelet": {
    "copper": 95758,
    "source": "Jewelcrafting"
  },
  "Fire Emerald Platinum Ring": {
    "copper": 186478,
    "source": "Jewelcrafting"
  },
  "Fire Emerald Velium Ring": {
    "copper": 337678,
    "source": "Jewelcrafting"
  },
  "Firewater": {
    "copper": 80,
    "source": "Skill Tinkering"
  },
  "Flameless Lantern": {
    "copper": 2000,
    "source": "Skill Tinkering"
  },
  "Footwarming Boots": {
    "copper": 200000,
    "source": "Skill Tinkering"
  },
  "Gnomish Firework": {
    "copper": 200,
    "source": "Skill Tinkering"
  },
  "Gold Bloodstone Necklace": {
    "copper": 10582,
    "source": "Jewelcrafting"
  },
  "Gold Carnelian Wedding Ring": {
    "copper": 10935,
    "source": "Jewelcrafting"
  },
  "Gold Lapis Lazuli Earring": {
    "copper": 10169,
    "source": "Jewelcrafting"
  },
  "Gold Malachite Bracelet": {
    "copper": 10129,
    "source": "Jewelcrafting"
  },
  "Gold Onyx Pendant": {
    "copper": 10734,
    "source": "Jewelcrafting"
  },
  "Gold Turquoise Engagement Ring": {
    "copper": 10189,
    "source": "Jewelcrafting"
  },
  "Golden Amber Earring": {
    "copper": 12598,
    "source": "Jewelcrafting"
  },
  "Golden Black Pearl Choker": {
    "copper": 30238,
    "source": "Jewelcrafting"
  },
  "Golden Black Sapphire Earring": {
    "copper": 265000,
    "source": "Jewelcrafting"
  },
  "Golden Blue Diamond Pendant": {
    "copper": 355000,
    "source": "Jewelcrafting"
  },
  "Golden Cat Eye Bracelet": {
    "copper": 10280,
    "source": "Jewelcrafting"
  },
  "Golden Diamond Mask": {
    "copper": 235079,
    "source": "Jewelcrafting"
  },
  "Golden Emerald Bracelet": {
    "copper": 23182,
    "source": "Jewelcrafting"
  },
  "Golden Fire Wedding Ring": {
    "copper": 65079,
    "source": "Jewelcrafting"
  },
  "Golden Hematite Choker": {
    "copper": 10230,
    "source": "Jewelcrafting"
  },
  "Golden Jacinth Wedding Ring": {
    "copper": 210079,
    "source": "Jewelcrafting"
  },
  "Golden Jaded Bracelet": {
    "copper": 13606,
    "source": "Jewelcrafting"
  },
  "Golden Opal Amulet": {
    "copper": 27214,
    "source": "Jewelcrafting"
  },
  "Golden Pearl Choker": {
    "copper": 14614,
    "source": "Jewelcrafting"
  },
  "Golden Peridot Bracelet": {
    "copper": 20158,
    "source": "Jewelcrafting"
  },
  "Golden Ruby Ring": {
    "copper": 142377,
    "source": "Jewelcrafting"
  },
  "Golden Sapphire Earring": {
    "copper": 110878,
    "source": "Jewelcrafting"
  },
  "Golden Star Amulet": {
    "copper": 11086,
    "source": "Jewelcrafting"
  },
  "Golden Star Ruby Ring": {
    "copper": 75598,
    "source": "Jewelcrafting"
  },
  "Golden Topaz Earring": {
    "copper": 15118,
    "source": "Jewelcrafting"
  },
  "Hooked Arrowheads": {
    "copper": 315,
    "source": "Skill Fletching"
  },
  "Imbued Black Pearl Electrum Choker": {
    "copper": 22678,
    "source": "Jewelcrafting"
  },
  "Imbued Black Pearl Platinum Ring": {
    "copper": 120958,
    "source": "Jewelcrafting"
  },
  "Imbued Black Sapphire Electrum Earring": {
    "copper": 477519,
    "source": "Jewelcrafting"
  },
  "Imbued Black Sapphire Platinum Necklace": {
    "copper": 575799,
    "source": "Jewelcrafting"
  },
  "Imbued Black Sapphire Silvered Necklace": {
    "copper": 475503,
    "source": "Jewelcrafting"
  },
  "Imbued Blackened Pearl Silver Ring": {
    "copper": 20662,
    "source": "Jewelcrafting"
  },
  "Imbued Diamond Electrum Mask": {
    "copper": 227519,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Amber Earring": {
    "copper": 5038,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Fire Ring": {
    "copper": 57519,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Opal Amulet": {
    "copper": 19654,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Peridot Bracelet": {
    "copper": 12598,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Plains Earring": {
    "copper": 17519,
    "source": "Jewelcrafting"
  },
  "Imbued Electrum Rose Amulet": {
    "copper": 3526,
    "source": "Jewelcrafting"
  },
  "Imbued Emerald Electrum Bracelet": {
    "copper": 15622,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Amber Earring": {
    "copper": 12598,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Black Pearl Choker": {
    "copper": 30238,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Black Sapphire Earring": {
    "copper": 485079,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Diamond Mask": {
    "copper": 235079,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Emerald Bracelet": {
    "copper": 23182,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Fire Ring": {
    "copper": 65079,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Ivory Earring": {
    "copper": 20079,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Jaded Bracelet": {
    "copper": 13606,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Opal Amulet": {
    "copper": 27214,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Peridot Bracelet": {
    "copper": 20158,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Plains Earring": {
    "copper": 25079,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Rose Amulet": {
    "copper": 11086,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Ruby Ring": {
    "copper": 142377,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Sapphire Earring": {
    "copper": 110878,
    "source": "Jewelcrafting"
  },
  "Imbued Golden Topaz Earring": {
    "copper": 15118,
    "source": "Jewelcrafting"
  },
  "Imbued Ivory Electrum Earring": {
    "copper": 12519,
    "source": "Jewelcrafting"
  },
  "Imbued Ivory Silver Necklace": {
    "copper": 10503,
    "source": "Jewelcrafting"
  },
  "Imbued Jaded Electrum Bracelet": {
    "copper": 6046,
    "source": "Jewelcrafting"
  },
  "Imbued Jaded Platinum Ring": {
    "copper": 104326,
    "source": "Jewelcrafting"
  },
  "Imbued Jaded Silver Ring": {
    "copper": 4030,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Amber Ring": {
    "copper": 103318,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Diamond Ring": {
    "copper": 325799,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Emerald Ring": {
    "copper": 113902,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Fire Ring": {
    "copper": 155799,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Ivory Necklace": {
    "copper": 110799,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Opal Ring": {
    "copper": 117934,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Peridot Ring": {
    "copper": 110878,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Plains Ring": {
    "copper": 115799,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Ruby Veil": {
    "copper": 233097,
    "source": "Jewelcrafting"
  },
  "Imbued Platinum Topaz Necklace": {
    "copper": 105838,
    "source": "Jewelcrafting"
  },
  "Imbued Rose Platinum Ring": {
    "copper": 101806,
    "source": "Jewelcrafting"
  },
  "Imbued Ruby Electrum Ring": {
    "copper": 134817,
    "source": "Jewelcrafting"
  },
  "Imbued Sapphire Electrum Earring": {
    "copper": 103318,
    "source": "Jewelcrafting"
  },
  "Imbued Sapphire Platinum Necklace": {
    "copper": 201598,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Amber Ring": {
    "copper": 3022,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Diamond Ring": {
    "copper": 225503,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Emerald Ring": {
    "copper": 13606,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Fire Ring": {
    "copper": 55503,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Opal Ring": {
    "copper": 17638,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Plains Ring": {
    "copper": 15503,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Rose Ring": {
    "copper": 1510,
    "source": "Jewelcrafting"
  },
  "Imbued Silver Ruby Veil": {
    "copper": 132801,
    "source": "Jewelcrafting"
  },
  "Imbued Silvered Peridot Ring": {
    "copper": 10582,
    "source": "Jewelcrafting"
  },
  "Imbued Silvered Sapphire Necklace": {
    "copper": 101302,
    "source": "Jewelcrafting"
  },
  "Imbued Topaz Electrum Earring": {
    "copper": 7558,
    "source": "Jewelcrafting"
  },
  "Imbued Topaz Silver Necklace": {
    "copper": 5542,
    "source": "Jewelcrafting"
  },
  "Jacinth Electrum Wedding Ring": {
    "copper": 202519,
    "source": "Jewelcrafting"
  },
  "Jaded Electrum Bracelet": {
    "copper": 6046,
    "source": "Jewelcrafting"
  },
  "Jaded Platinum Ring": {
    "copper": 104326,
    "source": "Jewelcrafting"
  },
  "Jaded Silver Ring": {
    "copper": 4030,
    "source": "Jewelcrafting"
  },
  "Jaded Velium Ring": {
    "copper": 255526,
    "source": "Jewelcrafting"
  },
  "Jasper Gold Earring": {
    "copper": 10834,
    "source": "Jewelcrafting"
  },
  "Mechanized Lockpicks": {
    "copper": 18000,
    "source": "Skill Tinkering"
  },
  "Nantik's Anti-Gravity Unit": {
    "copper": 360000,
    "source": "Skill Tinkering"
  },
  "Platinum Amber Ring": {
    "copper": 103318,
    "source": "Jewelcrafting"
  },
  "Platinum Bloodstone Earring": {
    "copper": 101302,
    "source": "Jewelcrafting"
  },
  "Platinum Blue Diamond Tiara": {
    "copper": 380000,
    "source": "Jewelcrafting"
  },
  "Platinum Carnelian Wedding Ring": {
    "copper": 101655,
    "source": "Jewelcrafting"
  },
  "Platinum Diamond Wedding Ring": {
    "copper": 325799,
    "source": "Jewelcrafting"
  },
  "Platinum Emerald Ring": {
    "copper": 113902,
    "source": "Jewelcrafting"
  },
  "Platinum Fire Wedding Ring": {
    "copper": 155799,
    "source": "Jewelcrafting"
  },
  "Platinum Hematite Ring": {
    "copper": 100950,
    "source": "Jewelcrafting"
  },
  "Platinum Jacinth Wedding Ring": {
    "copper": 300799,
    "source": "Jewelcrafting"
  },
  "Platinum Jasper Ring": {
    "copper": 101554,
    "source": "Jewelcrafting"
  },
  "Platinum Lapis Lazuli Necklace": {
    "copper": 100889,
    "source": "Jewelcrafting"
  },
  "Platinum Malachite Ring": {
    "copper": 100849,
    "source": "Jewelcrafting"
  },
  "Platinum Onyx Bracelet": {
    "copper": 101454,
    "source": "Jewelcrafting"
  },
  "Platinum Opal Engagement Ring": {
    "copper": 117934,
    "source": "Jewelcrafting"
  },
  "Platinum Pearl Ring": {
    "copper": 105334,
    "source": "Jewelcrafting"
  },
  "Platinum Peridot Ring": {
    "copper": 110878,
    "source": "Jewelcrafting"
  },
  "Platinum Ruby Veil": {
    "copper": 233097,
    "source": "Jewelcrafting"
  },
  "Platinum Star Ruby Veil": {
    "copper": 166318,
    "source": "Jewelcrafting"
  },
  "Platinum Topaz Necklace": {
    "copper": 105838,
    "source": "Jewelcrafting"
  },
  "Platinum Turquoise Bracelet": {
    "copper": 100909,
    "source": "Jewelcrafting"
  },
  "Powered Gloves": {
    "copper": 40000,
    "source": "Skill Tinkering"
  },
  "Rebreather": {
    "copper": 950000,
    "source": "Skill Tinkering"
  },
  "Rose Platinum Engagement Ring": {
    "copper": 101806,
    "source": "Jewelcrafting"
  },
  "Ruby Electrum Ring": {
    "copper": 134817,
    "source": "Jewelcrafting"
  },
  "Sapphire Electrum Earring": {
    "copper": 103318,
    "source": "Jewelcrafting"
  },
  "Sapphire Platinum Necklace": {
    "copper": 201598,
    "source": "Jewelcrafting"
  },
  "Sapphire Velium Necklace": {
    "copper": 352798,
    "source": "Jewelcrafting"
  },
  "Silver Amber Ring": {
    "copper": 3022,
    "source": "Jewelcrafting"
  },
  "Silver Bloodstone Earring": {
    "copper": 1006,
    "source": "Jewelcrafting"
  },
  "Silver Blue Diamond Ring": {
    "copper": 280000,
    "source": "Jewelcrafting"
  },
  "Silver Carnelian Wedding Ring": {
    "copper": 1359,
    "source": "Jewelcrafting"
  },
  "Silver Cat Eye Necklace": {
    "copper": 704,
    "source": "Jewelcrafting"
  },
  "Silver Diamond Wedding Ring": {
    "copper": 225503,
    "source": "Jewelcrafting"
  },
  "Silver Emerald Ring": {
    "copper": 13606,
    "source": "Jewelcrafting"
  },
  "Silver Fire Wedding Ring": {
    "copper": 55503,
    "source": "Jewelcrafting"
  },
  "Silver Hematite Ring": {
    "copper": 654,
    "source": "Jewelcrafting"
  },
  "Silver Jacinth Wedding Ring": {
    "copper": 200503,
    "source": "Jewelcrafting"
  },
  "Silver Jasper Ring": {
    "copper": 1258,
    "source": "Jewelcrafting"
  },
  "Silver Lapis Lazuli Necklace": {
    "copper": 593,
    "source": "Jewelcrafting"
  },
  "Silver Malachite Ring": {
    "copper": 553,
    "source": "Jewelcrafting"
  },
  "Silver Onyx Bracelet": {
    "copper": 1158,
    "source": "Jewelcrafting"
  },
  "Silver Opal Engagement Ring": {
    "copper": 17638,
    "source": "Jewelcrafting"
  },
  "Silver Rose Engagement Ring": {
    "copper": 1510,
    "source": "Jewelcrafting"
  },
  "Silver Ruby Veil": {
    "copper": 132801,
    "source": "Jewelcrafting"
  },
  "Silver Tipped Arrowheads": {
    "copper": 3990,
    "source": "Skill Fletching"
  },
  "Silver Turquoise Bracelet": {
    "copper": 613,
    "source": "Jewelcrafting"
  },
  "Silver Wolf's Eye Necklace": {
    "copper": 3728,
    "source": "Jewelcrafting"
  },
  "Silvered Fire Emerald Ring": {
    "copper": 86182,
    "source": "Jewelcrafting"
  },
  "Silvered Pearl Ring": {
    "copper": 5038,
    "source": "Jewelcrafting"
  },
  "Silvered Peridot Ring": {
    "copper": 10582,
    "source": "Jewelcrafting"
  },
  "Silvered Sapphire Necklace": {
    "copper": 101302,
    "source": "Jewelcrafting"
  },
  "Silvered Star Ruby Veil": {
    "copper": 66022,
    "source": "Jewelcrafting"
  },
  "Spyglass": {
    "copper": 25000,
    "source": "Skill Tinkering"
  },
  "Stalking Probe": {
    "copper": 15000,
    "source": "Skill Tinkering"
  },
  "Standard Bow Cam": {
    "copper": 37800,
    "source": "Skill Fletching"
  },
  "Thermal Cloak": {
    "copper": 900,
    "source": "Skill Tinkering"
  },
  "Tinkered Catapult": {
    "copper": 50000,
    "source": "Skill Tinkering"
  },
  "Topaz Electrum Earring": {
    "copper": 7558,
    "source": "Jewelcrafting"
  },
  "Topaz Silver Necklace": {
    "copper": 5542,
    "source": "Jewelcrafting"
  },
  "Topaz Velium Necklace": {
    "copper": 257038,
    "source": "Jewelcrafting"
  },
  "Velium Amber Ring": {
    "copper": 254518,
    "source": "Jewelcrafting"
  },
  "Velium Bloodstone Earring": {
    "copper": 252502,
    "source": "Jewelcrafting"
  },
  "Velium Blue Diamond Bracelet": {
    "copper": 550000,
    "source": "Jewelcrafting"
  },
  "Velium Carnelian Wedding Ring": {
    "copper": 252855,
    "source": "Jewelcrafting"
  },
  "Velium Diamond Wedding Ring": {
    "copper": 525000,
    "source": "Jewelcrafting"
  },
  "Velium Emerald Ring": {
    "copper": 265102,
    "source": "Jewelcrafting"
  },
  "Velium Fire Wedding Ring": {
    "copper": 306999,
    "source": "Jewelcrafting"
  },
  "Velium Hematite Ring": {
    "copper": 252150,
    "source": "Jewelcrafting"
  },
  "Velium Jacinth Wedding Ring": {
    "copper": 451999,
    "source": "Jewelcrafting"
  },
  "Velium Jasper Ring": {
    "copper": 252754,
    "source": "Jewelcrafting"
  },
  "Velium Lapis Lazuli Necklace": {
    "copper": 252089,
    "source": "Jewelcrafting"
  },
  "Velium Malachite Ring": {
    "copper": 252049,
    "source": "Jewelcrafting"
  },
  "Velium Onyx Bracelet": {
    "copper": 252654,
    "source": "Jewelcrafting"
  },
  "Velium Opal Engagement Ring": {
    "copper": 269134,
    "source": "Jewelcrafting"
  },
  "Velium Pearl Ring": {
    "copper": 256534,
    "source": "Jewelcrafting"
  },
  "Velium Peridot Ring": {
    "copper": 262078,
    "source": "Jewelcrafting"
  },
  "Velium Rose Engagement Ring": {
    "copper": 253006,
    "source": "Jewelcrafting"
  },
  "Velium Ruby Veil": {
    "copper": 384297,
    "source": "Jewelcrafting"
  },
  "Velium Star Ruby Veil": {
    "copper": 317518,
    "source": "Jewelcrafting"
  },
  "Velium Turquoise Bracelet": {
    "copper": 252109,
    "source": "Jewelcrafting"
  },
  "Velium Wolf's Eye Necklace": {
    "copper": 255224,
    "source": "Jewelcrafting"
  },
  "Wolf's Eye Electrum Bracelet": {
    "copper": 5744,
    "source": "Jewelcrafting"
  },
  "Wolf's Eye Golden Bracelet": {
    "copper": 13304,
    "source": "Jewelcrafting"
  },
  "Wolf's Eye Platinum Necklace": {
    "copper": 104024,
    "source": "Jewelcrafting"
  }
};

export const TRADESKILLS: readonly Tradeskill[] = [
 {
  "name": "Barbarian",
  "title": "Cultural Tradeskills: Barbarian",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Dark Elf",
  "title": "Cultural Tradeskills: Dark Elf",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Dwarf",
  "title": "Cultural Tradeskills: Dwarf",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Gnome",
  "title": "Cultural Tradeskills: Gnome",
  "kind": "cultural",
  "eras": [
   "velious"
  ],
  "guides": []
 },
 {
  "name": "Half Elf",
  "title": "Cultural Tradeskills: Half Elf",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Halfling",
  "title": "Cultural Tradeskills: Halfling",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "High Elf",
  "title": "Cultural Tradeskills: High Elf",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Human",
  "title": "Cultural Tradeskills: Human",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Iksar",
  "title": "Cultural Tradeskills: Iksar",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Ogre",
  "title": "Cultural Tradeskills: Ogre",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Wood Elf",
  "title": "Cultural Tradeskills: Wood Elf",
  "kind": "cultural",
  "eras": [
   "epicquests"
  ],
  "guides": []
 },
 {
  "name": "Jewelcrafting",
  "title": "Jewelcrafting",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Recommended Leveling",
    "anchor": "Recommended_Leveling",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "EQ Legends Note: Some trivial levels for other types of crafting have been found to have changed. This level guide is currently based on the information already on the wiki, and needs to be double checked and adjusted against in game trivial levels and costs."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Jewelcrafting recipes often list enchanted metals as an ingredient; however, this is only required if you want the jewelry to have stats. If you're just crafting to practice your skill, you can use the unenchanted metal bars instead."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "The recommended leveling below tries to balance low cost and minimal effort. If you want to save every copper you can, you can use the full list of jewelry further below, sort by price and follow that. However in many cases you will be only getting 2-3 skill points before needing to go back to the merchant for new supplies. The method below keeps things almost just as cheap, while making use of the auto-combine crafting feature to do a lot of combines of the same recipes to preserve your sanity."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Silver Jewelry (1-34)",
      "anchor": "Silver_Jewelry_(1-34)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Trivial 17 - ",
         {
          "link": "Silver Bar",
          "text": "Silver Bar"
         },
         " + ",
         {
          "link": "Malachite",
          "text": "Malachite"
         }
        ],
        "makes": [
         "Silver Malachite Ring"
        ],
        "skill": {
         "from": 1,
         "to": 17
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "Malachite",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 553,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 24 - ",
         {
          "link": "Silver Bar",
          "text": "Silver Bar"
         },
         " + ",
         {
          "link": "Cat's Eye Agate",
          "text": "Cat's Eye Agate"
         }
        ],
        "makes": [
         "Silver Cat Eye Necklace"
        ],
        "skill": {
         "from": 17,
         "to": 24
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "Cat's Eye Agate",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 704,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 34 - ",
         {
          "link": "Silver Bar",
          "text": "Silver Bar"
         },
         " + ",
         {
          "link": "Star Rose Quartz",
          "text": "Star Rose Quartz"
         }
        ],
        "makes": [
         "Silver Rose Engagement Ring"
        ],
        "skill": {
         "from": 24,
         "to": 34
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "Star Rose Quartz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 1510,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Electrum Jewelry (34-111)",
      "anchor": "Electrum_Jewelry_(34-111)"
     },
     {
      "kind": "text",
      "runs": [
       "Before continuing to this level, be aware that each bar of electrum costs about 2.5pp; however, this is cheaper than using the more expensive gemstones required to continue working with silver."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Trivial 74 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Malachite",
          "text": "Malachite"
         }
        ],
        "makes": [
         "Electrum Malachite Bracelet"
        ],
        "skill": {
         "from": 34,
         "to": 74
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Malachite",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 2569,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 84 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Cat's Eye Agate",
          "text": "Cat's Eye Agate"
         }
        ],
        "makes": [
         "Electrum Cat Eye Bracelet"
        ],
        "skill": {
         "from": 74,
         "to": 84
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Cat's Eye Agate",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 2720,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 95 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Carnelian",
          "text": "Carnelian"
         }
        ],
        "makes": [
         "Electrum Carnelian Wedding Ring"
        ],
        "skill": {
         "from": 84,
         "to": 95
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Carnelian",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 3375,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 100 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Amber",
          "text": "Amber"
         }
        ],
        "makes": [
         "Electrum Amber Earring"
        ],
        "skill": {
         "from": 95,
         "to": 100
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Amber",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 5038,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 106 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Jade",
          "text": "Jade"
         }
        ],
        "makes": [
         "Jaded Electrum Bracelet"
        ],
        "skill": {
         "from": 100,
         "to": 106
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Jade",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 6046,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 111 - ",
         {
          "link": "Electrum Bar",
          "text": "Electrum Bar"
         },
         " + ",
         {
          "link": "Topaz",
          "text": "Topaz"
         }
        ],
        "makes": [
         "Topaz Electrum Earring"
        ],
        "skill": {
         "from": 106,
         "to": 111
        },
        "needs": [
         {
          "name": "Electrum Bar",
          "qty": 1
         },
         {
          "name": "Topaz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 7558,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Gold Jewelry (111-202)",
      "anchor": "Gold_Jewelry_(111-202)"
     },
     {
      "kind": "text",
      "runs": [
       "Before continuing to this level, be aware that each bar of gold costs about 10.5pp; however, this is cheaper than using the more expensive gemstones required to continue working with electrum."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Trivial 146 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Malachite",
          "text": "Malachite"
         }
        ],
        "makes": [
         "Gold Malachite Bracelet"
        ],
        "skill": {
         "from": 111,
         "to": 146
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Malachite",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 10129,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 154 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Hematite",
          "text": "Hematite"
         }
        ],
        "makes": [
         "Golden Hematite Choker"
        ],
        "skill": {
         "from": 146,
         "to": 154
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Hematite",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 10230,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 162 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Onyx",
          "text": "Onyx"
         }
        ],
        "makes": [
         "Gold Onyx Pendant"
        ],
        "skill": {
         "from": 154,
         "to": 162
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Onyx",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 10734,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 170 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Star Rose Quartz",
          "text": "Star Rose Quartz"
         }
        ],
        "makes": [
         "Golden Star Amulet"
        ],
        "skill": {
         "from": 162,
         "to": 170
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Star Rose Quartz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 11086,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 178 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Jade",
          "text": "Jade"
         }
        ],
        "makes": [
         "Golden Jaded Bracelet"
        ],
        "skill": {
         "from": 170,
         "to": 178
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Jade",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 13606,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 183 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Topaz",
          "text": "Topaz"
         }
        ],
        "makes": [
         "Golden Topaz Earring"
        ],
        "skill": {
         "from": 178,
         "to": 183
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Topaz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 15118,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 186 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Peridot",
          "text": "Peridot"
         }
        ],
        "makes": [
         "Golden Peridot Bracelet"
        ],
        "skill": {
         "from": 183,
         "to": 186
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Peridot",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 20158,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 191 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Opal",
          "text": "Opal"
         }
        ],
        "makes": [
         "Golden Opal Amulet"
        ],
        "skill": {
         "from": 186,
         "to": 191
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Opal",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 27214,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Warning: The price per combine nearly triples at this point."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Trivial 199 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Star Ruby",
          "text": "Star Ruby"
         }
        ],
        "makes": [
         "Golden Star Ruby Ring"
        ],
        "skill": {
         "from": 191,
         "to": 199
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Star Ruby",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 75598,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 202 - ",
         {
          "link": "Gold Bar",
          "text": "Gold Bar"
         },
         " + ",
         {
          "link": "Fire Emerald",
          "text": "Fire Emerald"
         }
        ],
        "makes": [
         "Fire Emerald Golden Bracelet"
        ],
        "skill": {
         "from": 199,
         "to": 202
        },
        "needs": [
         {
          "name": "Gold Bar",
          "qty": 1
         },
         {
          "name": "Fire Emerald",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 95758,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Platinum Jewelry (202-279)",
      "anchor": "Platinum_Jewelry_(202-279)"
     },
     {
      "kind": "text",
      "runs": [
       "Before continuing to this level, be aware that each bar of platinum costs about 105pp; however, this is cheaper than using the more expensive gemstones required to continue working with gold."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Trivial 218 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Malachite",
          "text": "Malachite"
         },
         " Result: ",
         {
          "link": "Platinum Malachite Ring",
          "text": "Platinum Malachite Ring"
         }
        ],
        "skill": {
         "from": 202,
         "to": 218
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Malachite",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 100849,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 228 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Cat's Eye Agate",
          "text": "Cat's Eye Agate"
         },
         " Result: ",
         {
          "link": "Cat Eye Platinum Necklace",
          "text": "Cat Eye Platinum Necklace"
         }
        ],
        "skill": {
         "from": 218,
         "to": 228
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Cat's Eye Agate",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 101000,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 242 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Star Rose Quartz",
          "text": "Star Rose Quartz"
         },
         " Result: ",
         {
          "link": "Rose Platinum Engagement Ring",
          "text": "Rose Platinum Engagement Ring"
         }
        ],
        "skill": {
         "from": 228,
         "to": 242
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Star Rose Quartz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 101806,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 255 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Topaz",
          "text": "Topaz"
         },
         " Result: ",
         {
          "link": "Platinum Topaz Necklace",
          "text": "Platinum Topaz Necklace"
         }
        ],
        "skill": {
         "from": 242,
         "to": 255
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Topaz",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 105838,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 260 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Emerald",
          "text": "Emerald"
         },
         " Result: ",
         {
          "link": "Platinum Emerald Ring",
          "text": "Platinum Emerald Ring"
         }
        ],
        "skill": {
         "from": 255,
         "to": 260
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Emerald",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 113902,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 263 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Opal",
          "text": "Opal"
         },
         " Result: ",
         {
          "link": "Platinum Opal Engagement Ring",
          "text": "Platinum Opal Engagement Ring"
         }
        ],
        "skill": {
         "from": 260,
         "to": 263
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Opal",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 117934,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 268 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Fire Opal",
          "text": "Fire Opal"
         },
         " Result: ",
         {
          "link": "Platinum Fire Wedding Ring",
          "text": "Platinum Fire Wedding Ring"
         }
        ],
        "skill": {
         "from": 263,
         "to": 268
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Fire Opal",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 155799,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 271 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Star Ruby",
          "text": "Star Ruby"
         },
         " Result: ",
         {
          "link": "Platinum Star Ruby Veil",
          "text": "Platinum Star Ruby Veil"
         }
        ],
        "skill": {
         "from": 268,
         "to": 271
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Star Ruby",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 166318,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 274 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Fire Emerald",
          "text": "Fire Emerald"
         },
         " Result: ",
         {
          "link": "Fire Emerald Platinum Ring",
          "text": "Fire Emerald Platinum Ring"
         }
        ],
        "skill": {
         "from": 271,
         "to": 274
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Fire Emerald",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 186478,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 276 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Sapphire",
          "text": "Sapphire"
         },
         " Result: ",
         {
          "link": "Sapphire Platinum Necklace",
          "text": "Sapphire Platinum Necklace"
         }
        ],
        "skill": {
         "from": 274,
         "to": 276
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Sapphire",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 201598,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       },
       {
        "runs": [
         "Trivial 279 - ",
         {
          "link": "Platinum Bar",
          "text": "Platinum Bar"
         },
         " + ",
         {
          "link": "Ruby",
          "text": "Ruby"
         },
         " Result: ",
         {
          "link": "Platinum Ruby Veil",
          "text": "Platinum Ruby Veil"
         }
        ],
        "skill": {
         "from": 276,
         "to": 279
        },
        "needs": [
         {
          "name": "Platinum Bar",
          "qty": 1
         },
         {
          "name": "Ruby",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 233097,
         "how": "recipe",
         "source": "Jewelcrafting"
        }
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Going beyond this in Everquest Legends requires gemstones that are only available as high level drops: ",
       {
        "link": "Jacinth",
        "text": "Jacinth"
       },
       ", ",
       {
        "link": "Black Sapphire",
        "text": "Black Sapphire"
       },
       ", ",
       {
        "link": "Diamond",
        "text": "Diamond"
       },
       ", and ",
       {
        "link": "Blue Diamond",
        "text": "Blue Diamond"
       },
       ". You will likely be making these for equipment rather than skill increases. The highest is 295 from ",
       {
        "link": "Platinum Blue Diamond Tiara",
        "text": "Platinum Blue Diamond Tiara"
       },
       "."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Velium Jewelry (279+)",
      "anchor": "Velium_Jewelry_(279+)",
      "unavailable": "Velium is not currently available in Everquest Legends"
     },
     {
      "kind": "text",
      "runs": [
       "Velium is not currently available in Everquest Legends"
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "Before continuing to this level, be aware that each bar of velium costs about 252pp."
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Alchemy",
  "title": "Skill Alchemy",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Skill Progression",
    "anchor": "Skill_Progression",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "One possible crafting path is listed here. These recipes require less merchant micro-managing while still staying highly efficient on vendor costs:"
      ]
     },
     {
      "kind": "table",
      "header": [
       "Trivial",
       "Recipe",
       "Ingredient 1",
       "Ingredient 2",
       "Ingredient 3"
      ],
      "rows": [
       [
        [
         "1-83"
        ],
        [
         {
          "link": "Potion of Accuracy",
          "text": "Potion of Accuracy"
         }
        ],
        [
         {
          "link": "Birthwort",
          "text": "Birthwort"
         }
        ],
        [
         {
          "link": "Fenugreek",
          "text": "Fenugreek"
         }
        ],
        [
         {
          "link": "Blue Vervain Bulb",
          "text": "Blue Vervain Bulb"
         }
        ]
       ],
       [
        [
         "84-150"
        ],
        [
         {
          "link": "Greater Potion of Accuracy",
          "text": "Greater Potion of Accuracy"
         }
        ],
        [
         {
          "link": "Birthwort",
          "text": "Birthwort"
         }
        ],
        [
         {
          "link": "Fenugreek",
          "text": "Fenugreek"
         }
        ],
        [
         {
          "link": "Valerian Root",
          "text": "Valerian Root"
         }
        ]
       ],
       [
        [
         "151-212"
        ],
        [
         {
          "link": "Elixir of Concentration",
          "text": "Elixir of Concentration"
         }
        ],
        [
         {
          "link": "Violet Tri-Tube Sap",
          "text": "Violet Tri-Tube Sap"
         }
        ],
        [
         {
          "link": "Yerbhimba",
          "text": "Yerbhimba"
         }
        ],
        []
       ],
       [
        [
         "213-244"
        ],
        [
         {
          "link": "Elixir of Greater Concentration",
          "text": "Elixir of Greater Concentration"
         }
        ],
        [
         {
          "link": "Violet Tri-Tube Sap",
          "text": "Violet Tri-Tube Sap"
         }
        ],
        [
         {
          "link": "Duskglow Vine",
          "text": "Duskglow Vine"
         }
        ],
        []
       ],
       [
        [
         "245-255"
        ],
        [
         {
          "link": "Potion of Mystical Aptitude",
          "text": "Potion of Mystical Aptitude"
         }
        ],
        [
         {
          "link": "Yerbhimba",
          "text": "Yerbhimba"
         }
        ],
        [
         {
          "link": "Duskglow Vine",
          "text": "Duskglow Vine"
         }
        ],
        []
       ]
      ],
      "skill": [
       {
        "from": 1,
        "to": 83
       },
       {
        "from": 84,
        "to": 150
       },
       {
        "from": 151,
        "to": 212
       },
       {
        "from": 213,
        "to": 244
       },
       {
        "from": 245,
        "to": 255
       }
      ],
      "needs": [
       [
        {
         "name": "Birthwort",
         "qty": 1
        },
        {
         "name": "Fenugreek",
         "qty": 1
        },
        {
         "name": "Blue Vervain Bulb",
         "qty": 1
        }
       ],
       [
        {
         "name": "Birthwort",
         "qty": 1
        },
        {
         "name": "Fenugreek",
         "qty": 1
        },
        {
         "name": "Valerian Root",
         "qty": 1
        }
       ],
       [
        {
         "name": "Violet Tri-Tube Sap",
         "qty": 1
        },
        {
         "name": "Yerbhimba",
         "qty": 1
        }
       ],
       [
        {
         "name": "Violet Tri-Tube Sap",
         "qty": 1
        },
        {
         "name": "Duskglow Vine",
         "qty": 1
        }
       ],
       [
        {
         "name": "Yerbhimba",
         "qty": 1
        },
        {
         "name": "Duskglow Vine",
         "qty": 1
        }
       ]
      ],
      "cost": [
       {
        "copper": 1415,
        "how": "materials"
       },
       {
        "copper": 4197,
        "how": "materials"
       },
       {
        "copper": 524,
        "how": "partial",
        "unpriced": [
         "Violet Tri-Tube Sap"
        ]
       },
       {
        "copper": 524,
        "how": "partial",
        "unpriced": [
         "Violet Tri-Tube Sap"
        ]
       },
       {
        "copper": 1048,
        "how": "materials"
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Simple Path to 255",
      "anchor": "Simple_Path_to_255"
     },
     {
      "kind": "text",
      "runs": [
       "This will take a lot of manual combines until you manage to succeed on a potion and learn the recipe, but it only requires three ingredients and each combine only costs about 1pp. All three can be bought from ",
       {
        "link": "Sithgok",
        "text": "Sithgok"
       },
       " in ",
       {
        "link": "Innothule Swamp",
        "text": "Innothule Swamp"
       },
       " or ",
       {
        "link": "Sven Felligan",
        "text": "Sven Felligan"
       },
       " in ",
       {
        "link": "Everfrost Peaks",
        "text": "Everfrost Peaks"
       },
       "."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "1 - 202 Skill"
      ],
      "strong": true
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         {
          "link": "Mystical Infusion",
          "text": "Mystical Infusion"
         }
        ],
        "children": [
         {
          "runs": [
           "2x ",
           {
            "link": "Sickle Leaf",
            "text": "Sickle Leaf"
           }
          ]
         }
        ],
        "skill": {
         "from": 1,
         "to": 202
        },
        "needs": [
         {
          "name": "Sickle Leaf",
          "qty": 2
         }
        ],
        "cost": {
         "copper": 1048,
         "how": "materials"
        }
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "202 - 255 Skill"
      ],
      "strong": true
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         {
          "link": "Potion of Mystical Aptitude",
          "text": "Potion of Mystical Aptitude"
         }
        ],
        "children": [
         {
          "runs": [
           "1x ",
           {
            "link": "Yerbhimba",
            "text": "Yerbhimba"
           }
          ]
         },
         {
          "runs": [
           "1x ",
           {
            "link": "Duskglow Vine",
            "text": "Duskglow Vine"
           }
          ]
         }
        ],
        "skill": {
         "from": 202,
         "to": 255
        },
        "needs": [
         {
          "name": "Yerbhimba",
          "qty": 1
         },
         {
          "name": "Duskglow Vine",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 1048,
         "how": "materials"
        }
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "After Skill 255",
      "anchor": "After_Skill_255"
     },
     {
      "kind": "text",
      "runs": [
       "After the ",
       {
        "link": "Potion of Mystical Aptitude",
        "text": "Potion of Mystical Aptitude"
       },
       " at trivial 255, there is a large gap in what can be crafted, and the next craftable recipes are at trivial 302. They do require more ingredients, but most can be purchased at vendors. One does require farming in ",
       {
        "link": "Kedge Keep",
        "text": "Kedge Keep"
       },
       ". However, since these are the highest level recipes craftable, the Alchemy leveling journey could be considered complete any time after skill 255. **Note: The Distillate IX recipes do not appear to work at this time, with the exception of Distillate of Replenishment IX (level 60 to use). Alchemy 255 and AA Alchemy mastery maxxed out and they will not combine."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Any of the following recipes can take Alchemy up to skill 300:"
      ]
     },
     {
      "kind": "table",
      "header": [
       "Trivial",
       "Recipe",
       "",
       "",
       "",
       "Ingredient 1",
       "Ingredient 2",
       "Ingredient 3",
       "Ingredient 4"
      ],
      "rows": [
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Alacrity IX",
          "text": "Distillate of Alacrity IX"
         }
        ],
        [
         "Buff"
        ],
        [
         "Combat"
        ],
        [
         "Haste"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Arnworth",
          "text": "Arnworth"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ],
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Celestial Healing IX",
          "text": "Distillate of Celestial Healing IX"
         }
        ],
        [
         "Buff"
        ],
        [
         "Regen"
        ],
        [
         "Health"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Gerti Blossom",
          "text": "Gerti Blossom"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ],
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Clarity IX",
          "text": "Distillate of Clarity IX"
         }
        ],
        [
         "Buff"
        ],
        [
         "Regen"
        ],
        [
         "Mana"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Katuka Bark",
          "text": "Katuka Bark"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ],
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Divine Healing IX",
          "text": "Distillate of Divine Healing IX"
         }
        ],
        [
         "Utility"
        ],
        [
         "Heal"
        ],
        [
         "Health"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Tregrum",
          "text": "Tregrum"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ],
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Replenishment IX",
          "text": "Distillate of Replenishment IX"
         }
        ],
        [
         "Buff"
        ],
        [
         "Regen"
        ],
        [
         "Health"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Clivers",
          "text": "Clivers"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ],
       [
        [
         "302"
        ],
        [
         {
          "link": "Distillate of Spirituality IX",
          "text": "Distillate of Spirituality IX"
         }
        ],
        [
         "Buff"
        ],
        [
         "Regen"
        ],
        [
         "Mana, Health"
        ],
        [
         {
          "link": "Comfrey",
          "text": "Comfrey"
         }
        ],
        [
         {
          "link": "Deepwater Ink",
          "text": "Deepwater Ink"
         }
        ],
        [
         {
          "link": "Methysticum",
          "text": "Methysticum"
         }
        ],
        [
         {
          "link": "Small Vial",
          "text": "Small Vial"
         },
         " x5"
        ]
       ]
      ],
      "skill": [
       {
        "from": 255,
        "to": 300
       },
       null,
       null,
       null,
       null,
       null
      ],
      "needs": [
       [
        {
         "name": "Comfrey",
         "qty": 1
        },
        {
         "name": "Deepwater Ink",
         "qty": 1
        },
        {
         "name": "Arnworth",
         "qty": 1
        },
        {
         "name": "Small Vial",
         "qty": 1
        }
       ],
       [],
       [],
       [],
       [],
       []
      ],
      "cost": [
       {
        "copper": 2213,
        "how": "partial",
        "unpriced": [
         "Deepwater Ink"
        ]
       },
       null,
       null,
       null,
       null,
       null
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Baking",
  "title": "Skill Baking",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Quick Leveling Guide",
    "anchor": "Quick_Leveling_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "For more info see Baking Leveling Guide"
      ]
     },
     {
      "kind": "table",
      "header": [
       "Item",
       "Ingredients",
       "Trivial"
      ],
      "rows": [
       [
        [
         {
          "link": "Batwing Crunchies",
          "text": "Batwing Crunchies"
         }
        ],
        [
         "1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         "1 ",
         {
          "link": "Frosting",
          "text": "Frosting"
         }
        ],
        [
         "46"
        ]
       ],
       [
        [
         {
          "link": "Fish Fillets",
          "text": "Fish Fillets"
         }
        ],
        [
         "1 ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         },
         "1 ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ],
        [
         "82"
        ]
       ],
       [
        [
         {
          "link": "Fish Rolls",
          "text": "Fish Rolls"
         }
        ],
        [
         "1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         "1 ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ],
        [
         "135"
        ]
       ],
       [
        [
         {
          "link": "Batwing Pie",
          "text": "Batwing Pie"
         }
        ],
        [
         "1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         "1 ",
         {
          "link": "Clump of Dough",
          "text": "Clump of Dough"
         },
         "1 ",
         {
          "link": "Spices",
          "text": "Spices"
         },
         "1 ",
         {
          "link": "Pie Tin",
          "text": "Pie Tin"
         },
         " (returned)"
        ],
        [
         "142"
        ]
       ],
       [
        [
         {
          "link": "Wedding Cake",
          "text": "Wedding Cake"
         }
        ],
        [
         "1 ",
         {
          "link": "White Chocolate",
          "text": "White Chocolate"
         },
         "1 ",
         {
          "link": "Frosting",
          "text": "Frosting"
         },
         "1 ",
         {
          "link": "Clump of Dough",
          "text": "Clump of Dough"
         },
         "1 ",
         {
          "link": "Cake Round",
          "text": "Cake Round"
         },
         " (returned)"
        ],
        [
         "162"
        ]
       ],
       [
        [
         {
          "link": "Birthday Cake",
          "text": "Birthday Cake"
         }
        ],
        [
         "1 ",
         {
          "link": "Winter Chocolate",
          "text": "Winter Chocolate"
         },
         "1 ",
         {
          "link": "Frosting",
          "text": "Frosting"
         },
         "1 ",
         {
          "link": "Clump of Dough",
          "text": "Clump of Dough"
         },
         "1 ",
         {
          "link": "Cake Round",
          "text": "Cake Round"
         },
         " (returned)"
        ],
        [
         "162"
        ]
       ],
       [
        [
         {
          "link": "Dragon Steak",
          "text": "Dragon Steak"
         }
        ],
        [
         "1 ",
         {
          "link": "Dragon Meat",
          "text": "Dragon Meat"
         },
         "1 ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         },
         "1 ",
         {
          "link": "Spices",
          "text": "Spices"
         }
        ],
        [
         "242"
        ]
       ]
      ],
      "skill": [
       {
        "from": 0,
        "to": 46
       },
       {
        "from": 46,
        "to": 82
       },
       {
        "from": 82,
        "to": 135
       },
       {
        "from": 135,
        "to": 142
       },
       {
        "from": 142,
        "to": 162
       },
       null,
       {
        "from": 162,
        "to": 242
       }
      ],
      "needs": [
       [
        {
         "name": "Bat Wing",
         "qty": 1
        },
        {
         "name": "Frosting",
         "qty": 1
        }
       ],
       [
        {
         "name": "Jug of Sauces",
         "qty": 1
        },
        {
         "name": "Fresh Fish",
         "qty": 1
        }
       ],
       [
        {
         "name": "Bat Wing",
         "qty": 1
        },
        {
         "name": "Fresh Fish",
         "qty": 1
        }
       ],
       [
        {
         "name": "Bat Wing",
         "qty": 1
        },
        {
         "name": "Clump of Dough",
         "qty": 1
        },
        {
         "name": "Spices",
         "qty": 1
        }
       ],
       [
        {
         "name": "White Chocolate",
         "qty": 1
        },
        {
         "name": "Frosting",
         "qty": 1
        },
        {
         "name": "Clump of Dough",
         "qty": 1
        }
       ],
       [],
       [
        {
         "name": "Dragon Meat",
         "qty": 1
        },
        {
         "name": "Jug of Sauces",
         "qty": 1
        },
        {
         "name": "Spices",
         "qty": 1
        }
       ]
      ]
     }
    ]
   },
   {
    "name": "Baking Leveling Guide (Detailed)",
    "anchor": "Baking_Leveling_Guide_(Detailed)",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "You need about 10pp and an hour of your time to get to skill 135 (assuming you sell back what you make). Skill ups after that become more time consuming and costly. Evil races, including Iksars, can take advantage of the ",
       {
        "link": "Rohand's Brandy",
        "text": "Rohand's Brandy"
       },
       " quest in Qeynos in order to raise faction with Freeport merchants. NB : get your Int or Wis to a decent level, for this not being a hell to upgrade. you can go from 1 hour only to 4 hour clicking to get it upgraded if you have like no more than 60 int."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Ingredients for 1-135:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Frosting",
          "text": "Frosting"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 1: Batwing Crunchies",
      "anchor": "Step_1:_Batwing_Crunchies"
     },
     {
      "kind": "text",
      "runs": [
       "If Good:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "West Freeport",
          "text": "West Freeport"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Lysa Truegreen",
          "text": "Lysa Truegreen"
         },
         " (2nd floor of caster guild): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Pincia Brownloe",
          "text": "Pincia Brownloe"
         },
         " (Building across from monk guild): buy 10 stacks of ",
         {
          "link": "Frosting",
          "text": "frosting"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Note: ",
       {
        "link": "Pincia Brownloe",
        "text": "Pincia Brownloe"
       },
       " appears to be willing to sell to anyone. (Every character I've tried so far anyway, including an iksar necromancer.)"
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Evil:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "East Commonlands",
          "text": "East Commonlands"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Katha Firespinner",
          "text": "Katha Firespinner"
         },
         " (Inn near WC zoneline - She doesn't sell to Trolls.): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " - 3/2022 Would not sell to Rallos Zek Ogre Shaman with dubious faction."
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "Neriak",
          "text": "Neriak Commons"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Niz L`Crit",
          "text": "Niz L`Crit"
         },
         " (refined palate, next to bank): buy 10 stacks of ",
         {
          "link": "Frosting",
          "text": "frosting"
         },
         " - 3/2022 Beware of ",
         {
          "link": "Razran F`Lok",
          "text": "Razran F`Lok"
         },
         ". He paths at the Neriak Down Under entrance to bank area."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Iksar:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Field of Bone",
          "text": "Field of Bone"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Acet",
          "text": "Klok Acet"
         },
         " (near entrance to Cabilis): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         }
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "East Cabilis",
          "text": "East Cabilis"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Sweetzie",
          "text": "Klok Sweetzie"
         },
         " (near bank): buy 10 stacks of ",
         {
          "link": "Frosting",
          "text": "Frosting"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "THEN:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to your favorite oven (or use a ",
         {
          "link": "Spit",
          "text": "spit"
         },
         " if you want to lug one around)"
        ]
       },
       {
        "runs": [
         "Make ",
         {
          "link": "Batwing Crunchies",
          "text": "Batwing Crunchies"
         },
         " till skill 46: 1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         ", 1 ",
         {
          "link": "Frosting",
          "text": "Frosting"
         },
         "."
        ]
       },
       {
        "runs": [
         "Sell leftover ",
         {
          "link": "Frosting",
          "text": "Frosting"
         },
         " and ",
         {
          "link": "Batwing Crunchies",
          "text": "Batwing Crunchies"
         },
         "."
        ]
       },
       {
        "runs": [
         "KEEP extra ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 2: Fish Fillets",
      "anchor": "Step_2:_Fish_Fillets"
     },
     {
      "kind": "text",
      "runs": [
       "If Good:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "East Freeport",
          "text": "East Freeport"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Tanlok Harson",
          "text": "Tanlok Harson"
         },
         " (port authority at dock, second floor): buy 10 stacks of ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Sun Alemaker",
          "text": "Sun Alemaker"
         },
         " (Trader's Holiday - the oven is right behind her) : buy 10 stacks of ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Evil:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Neriak",
          "text": "Neriak Commons"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Niz L'Crit",
          "text": "Niz L'Crit"
         },
         " (refined palate, next to bank): buy 10 stacks of ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Mariz Ixtaz",
          "text": "Mariz Ixtaz"
         },
         " (near Toadstool): buy 30 stacks of ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Iksar"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Cabilis",
          "text": "East Cabilis"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Sweetzie",
          "text": "Klok Sweetzie"
         },
         " (near bank): buy 10 stacks of ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         }
        ]
       },
       {
        "runs": [
         "Check all vendors, and try to buy as much ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         " as you can find."
        ]
       },
       {
        "runs": [
         "Then grab a pole and hit the fishing button till you have 30 stacks. (I told you to go to Freeport)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Note: Iksar necromancers level 34+ with ",
       {
        "link": "Call of Bones",
        "text": "Call of Bones"
       },
       " (skeleton illusion) can buy ",
       {
        "link": "Fresh Fish",
        "text": "Fresh Fish"
       },
       " from the merchants inside the Port Authority"
      ]
     },
     {
      "kind": "text",
      "runs": [
       "THEN:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to your favorite oven (or use a spit if you want to lug one around)"
        ]
       },
       {
        "runs": [
         "Make ",
         {
          "link": "Fish Fillets",
          "text": "Fish Fillets"
         },
         " till skill 82: 1 ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         ", 1 ",
         {
          "link": "Jug of Sauces",
          "text": "Jug of Sauces"
         }
        ]
       },
       {
        "runs": [
         "Sell extra ",
         {
          "link": "Jug of Sauces",
          "text": "Jugs of Sauces"
         },
         " and ",
         {
          "link": "Fish Fillets",
          "text": "Fish Fillets"
         },
         "."
        ]
       },
       {
        "runs": [
         "KEEP extra ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 3: Fish Rolls",
      "anchor": "Step_3:_Fish_Rolls"
     },
     {
      "kind": "text",
      "runs": [
       "If Good:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "West Freeport",
          "text": "West Freeport"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Lysa Truegreen",
          "text": "Lysa Truegreen"
         },
         " (2nd floor of caster guild): buy 20 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         }
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "East Freeport",
          "text": "East Freeport"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Tanlok Harson",
          "text": "Tanlok Harson"
         },
         " (port authority at dock): buy 20 stacks of ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         " (including leftovers from step 2)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Evil:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "East Commonlands",
          "text": "East Commonlands"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Katha Firespinner",
          "text": "Katha Firespinner"
         },
         " (Inn near ",
         {
          "link": "West Commonlands",
          "text": "West Commonlands"
         },
         " zoneline): buy 20 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " (including leftovers from step 1)"
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "Neriak",
          "text": "Neriak Commons"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Mariz Ixtaz",
          "text": "Mariz Ixtaz"
         },
         " (near Toadstool): buy 20 stacks of ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         " (including leftovers from step 2)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Iksar:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Field of Bone",
          "text": "Field of Bone"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Acet",
          "text": "Klok Acet"
         },
         " (near entrance to ",
         {
          "link": "Cabilis",
          "text": "East Cabilis"
         },
         "): buy 20 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " (including leftovers from step 1)"
        ]
       },
       {
        "runs": [
         "Check all vendors, and try to buy as much ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         " as you can find."
        ]
       },
       {
        "runs": [
         "Then grab a pole and hit the fishing button till you have 20 stacks of ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         },
         " (including leftovers from step 2). (I told you to go to Freeport)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "THEN:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to your favorite ",
         {
          "link": "Oven",
          "text": "oven"
         },
         " (or use a ",
         {
          "link": "Spit",
          "text": "spit"
         },
         " if you want to lug one around)"
        ]
       },
       {
        "runs": [
         "Make ",
         {
          "link": "Fish Rolls",
          "text": "Fish Rolls"
         },
         " till skill 135: 1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         ", 1 ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       },
       {
        "runs": [
         "Sell all leftover ",
         {
          "link": "Fresh Fish",
          "text": "Fresh Fish"
         }
        ]
       },
       {
        "runs": [
         "KEEP extra ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         }
        ]
       },
       {
        "runs": [
         "Use ",
         {
          "link": "Fish Rolls",
          "text": "Fish Rolls"
         },
         " (these are very popular items, especially among monks)"
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 4: Batwing Pie",
      "anchor": "Step_4:_Batwing_Pie"
     },
     {
      "kind": "text",
      "runs": [
       "This is where it starts to become more expensive and time consuming. Note: On p1999 you can/may need to use Snake Eggs to make clumps of dough until 142."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Good/Evil:"
      ]
     },
     {
      "kind": "text",
      "runs": [
       "(It should be noted that ",
       {
        "link": "Clump of Dough",
        "text": "Clumps of Dough"
       },
       " can be created from different kinds of eggs, which yield different quantities of dough. Basilisk eggs (farmed in ",
       {
        "link": "Lavastorm Mountains",
        "text": "Lavastorm Mountains"
       },
       ") have a great drop rate and provide 15 ",
       {
        "link": "Clump of Dough",
        "text": "Clumps of Dough"
       },
       " per successful combine.)"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Lavastorm Mountains",
          "text": "Lavastorm Mountains"
         }
        ]
       },
       {
        "runs": [
         "Kill ",
         {
          "link": "A Lava Basilisk",
          "text": "Lava Basilisks"
         },
         " till you get 15 ",
         {
          "link": "Basilisk Egg",
          "text": "Basilisk Eggs"
         }
        ]
       },
       {
        "runs": [
         "Acquire a ",
         {
          "link": "Pie Tin",
          "text": "Pie Tin"
         },
         " (see smithing or pottery recipes for more info. Personally, I recommend pottery. It is far easier and cheaper)."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Good:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "West Freeport",
          "text": "West Freeport"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Pincia Brownloe",
          "text": "Pincia Brownloe"
         },
         " (unlabeled building next to monk's guild, W Freeport): buy a ",
         {
          "link": "Mixing Bowl",
          "text": "Mixing Bowl"
         },
         ", 15 ",
         {
          "link": "Bottle of Milk",
          "text": "Bottles of Milk"
         },
         ", 15 ",
         {
          "link": "Cup of Flour",
          "text": "Cups of Flour"
         },
         ", and 10 stacks of ",
         {
          "link": "Spices",
          "text": "Spices"
         },
         "."
        ]
       },
       {
        "runs": [
         {
          "link": "Lysa Truegreen",
          "text": "Lysa Truegreen"
         },
         " (2nd level of caster building): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " (including leftovers from step 3)"
        ]
       },
       {
        "runs": [
         "Remember these 2 merchants, if/when you run out of stacks just return and stock again."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Evil:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to Neriak Foreign Quarter"
        ]
       },
       {
        "runs": [
         {
          "link": "Sal Drana",
          "text": "Sal Drana"
         },
         " (human side): buy a ",
         {
          "link": "Mixing Bowl",
          "text": "Mixing Bowl"
         }
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "Neriak",
          "text": "Neriak Commons"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Niz L`Crit",
          "text": "Niz L`Crit"
         },
         " (refined palate, next to bank): buy 15 ",
         {
          "link": "Bottle of Milk",
          "text": "Bottles of Milk"
         },
         ", 15 ",
         {
          "link": "Cup of Flour",
          "text": "Cups of Flour"
         },
         ", and 10 stacks of ",
         {
          "link": "Spices",
          "text": "Spices"
         }
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "East Commonlands",
          "text": "East Commonlands"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Katha Firespinner",
          "text": "Katha Firespinner"
         },
         " (inn 3): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " (including leftovers from step 3)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If Iksar:"
      ]
     },
     {
      "kind": "text",
      "runs": [
       "It is much easier if you go to ",
       {
        "link": "Freeport",
        "text": "Freeport"
       },
       ", but if you insist on staying in ",
       {
        "link": "Kunark",
        "text": "Kunark"
       },
       "..."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "The Overthere",
          "text": "The Overthere"
         }
        ]
       },
       {
        "runs": [
         "Hunt ",
         {
          "link": "A stonegazer cockatrice",
          "text": "Stonegazer Cockatrice"
         },
         " or ",
         {
          "link": "Forage",
          "text": "Forage"
         },
         " till you get 45 ",
         {
          "link": "Cockatrice Egg",
          "text": "Cockatrice Eggs"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "3 times as many eggs are needed as the Good/Evil routes because ",
       {
        "link": "Cockatrice Egg",
        "text": "Cockatrice Eggs"
       },
       " only yield 5 ",
       {
        "link": "Clump of Dough",
        "text": "Clumps of Dough"
       },
       " per successful combine, whereas ",
       {
        "link": "Basilisk Egg",
        "text": "Basilisk Eggs"
       },
       " yield 15"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to ",
         {
          "link": "Field of Bone",
          "text": "Field of Bone"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Acet",
          "text": "Klok Acet"
         },
         " (near entrance to ",
         {
          "link": "Cabilis",
          "text": "East Cabilis"
         },
         "): buy 10 stacks of ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " (including leftovers from step 3)"
        ]
       },
       {
        "runs": [
         "Go to ",
         {
          "link": "Cabilis",
          "text": "East Cabilis"
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Klok Sweetzie",
          "text": "Klok Sweetzie"
         },
         " (near bank): buy 45 ",
         {
          "link": "Bottle of Milk",
          "text": "Bottles of Milk"
         },
         ", 45 ",
         {
          "link": "Cup of Flour",
          "text": "Cups of Flour"
         },
         ", and 10 stacks of ",
         {
          "link": "Spices",
          "text": "Spices"
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "THEN:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Make ",
         {
          "link": "Clump of Dough",
          "text": "Clumps of Dough"
         },
         " in ",
         {
          "link": "Mixing Bowl",
          "text": "Mixing Bowl"
         },
         ". They are long since trivial for you: 1 ",
         {
          "link": "Basilisk Egg",
          "text": "Basilisk Egg"
         },
         ", 1 ",
         {
          "link": "Cup of Flour",
          "text": "Cup of Flour"
         },
         ", 1 ",
         {
          "link": "Bottle of Milk",
          "text": "Bottle of Milk"
         },
         " (yields 15 ",
         {
          "link": "Clump of Dough",
          "text": "Clumps of Dough"
         },
         ")"
        ]
       },
       {
        "runs": [
         "Make ",
         {
          "link": "Batwing Pie",
          "text": "Batwing Pie"
         },
         " (in ",
         {
          "link": "Oven",
          "text": "Oven"
         },
         ") until skill 142: 1 ",
         {
          "link": "Bat Wing",
          "text": "Bat Wing"
         },
         ", 1 ",
         {
          "link": "Clump of Dough",
          "text": "Clump of Dough"
         },
         ", 1 ",
         {
          "link": "Spices",
          "text": "Spices"
         },
         ", 1 ",
         {
          "link": "Pie Tin",
          "text": "Pie Tin"
         },
         " (you get the tin back)."
        ]
       },
       {
        "runs": [
         "All this can be done in ",
         {
          "link": "West Freeport",
          "text": "West Freeport"
         },
         ". An ",
         {
          "link": "Oven",
          "text": "Oven"
         },
         " is located in an unnamed building behind the monk guild, over the bridge."
        ]
       },
       {
        "runs": [
         "Sell extra ",
         {
          "link": "Bat Wing",
          "text": "Bat Wings"
         },
         " and ",
         {
          "link": "Batwing Pie",
          "text": "Batwing Pies"
         },
         "."
        ]
       },
       {
        "runs": [
         "KEEP extra ",
         {
          "link": "Clump of Dough",
          "text": "Clumps of Dough"
         },
         "."
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 5: Cakes",
      "anchor": "Step_5:_Cakes"
     },
     {
      "kind": "text",
      "runs": [
       "All people:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to Greater or Lesser Faydark"
        ]
       },
       {
        "runs": [
         "Hunt Brownies for their parts."
        ]
       },
       {
        "runs": [
         "Make White Chocolate: 2 frosting, 1 spices, 1 brownie parts (in a mixing bowl)"
        ]
       },
       {
        "runs": [
         "And/or Make Winter Chocolate: 2 frosting, 1 brownie parts (in a mixing bowl)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "THEN:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Make Wedding cakes till 162: 1 White Chocolate, 1 Frosting, 1 Clump of Dough"
        ]
       },
       {
        "runs": [
         "OR -- Make Birthday cakes till 162: 1 Winter Chocolate, 1 Frosting, 1 Clump of Dough"
        ]
       },
       {
        "runs": [
         "Both require a Cake Round (Smithing or Pottery) which you get back after combine"
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 6: Pixie Powdered Cinnesticks",
      "anchor": "Step_6:_Pixie_Powdered_Cinnesticks"
     },
     {
      "kind": "text",
      "runs": [
       "All people:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Go to Greater or Lesser Faydark"
        ]
       },
       {
        "runs": [
         "Buy or Forage ",
         {
          "link": "Cinnamon Sticks",
          "text": "Cinnamon Sticks"
         }
        ]
       },
       {
        "runs": [
         "Hunt Pixies for Pixie dust"
        ]
       },
       {
        "runs": [
         "Make Pixie Powder Cinnesticks till trivial (>200): 3 Pixie Dust, 1 Cinnamon Stick (in a mixing bowl)"
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "NOTE: ",
       {
        "link": "A pixie jongleur",
        "text": "A pixie jongleur"
       },
       " gives you negative faction hits to: Guards of Qeynos (-30), Jaggedpine Treefolk (-30), Protectors of Pine (-30). QRG Protected Animals (-30). Kill with a character that doesn't care about those faction hits or find a way to kill these pixies without getting a faction hit if this is a concern with you. You will have to kill hundreds, maybe thousands to get enough pixie dusts to get to 202 skill!"
      ],
      "strong": true
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 7: Dragon Steaks",
      "anchor": "Step_7:_Dragon_Steaks"
     },
     {
      "kind": "text",
      "runs": [
       "All people:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Get Dragon meat however you can (it is a rare drop off Velious dragons), and make Dragon Steaks till trivial."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Then come back and tell us what the trivial is: 1 Dragon Meat, 1 Jug of Sauces, 1 Spices."
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Blacksmithing",
  "title": "Skill Blacksmithing",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Blacksmithing Leveling Guide",
    "anchor": "Blacksmithing_Leveling_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Strength or Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Getting Started (Up to 68)",
      "anchor": "Getting_Started_(Up_to_68)"
     },
     {
      "kind": "text",
      "runs": [
       "(Updated for EQL recipes/trivials)"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "1 to 21: ",
         {
          "link": "Metal Bits",
          "text": "Metal Bits"
         },
         " and ",
         {
          "link": "File",
          "text": "File"
         }
        ],
        "children": [
         {
          "runs": [
           "Buy 3 ",
           {
            "link": "File Mold",
            "text": "File Mold"
           },
           ", 53 ",
           {
            "link": "Water Flask",
            "text": "Water Flask"
           },
           ", 100 ",
           {
            "link": "Small Piece of Ore",
            "text": "Small Piece of Ore"
           },
           " (~20pp)."
          ],
          "children": [
           {
            "runs": [
             "Do ~50 ",
             {
              "link": "Metal Bits",
              "text": "Metal Bits"
             },
             " combines, and then 3 ",
             {
              "link": "File",
              "text": "File"
             },
             ". (Keep 1, sell extras)"
            ]
           },
           {
            "runs": [
             "You will want ~40 metal bits left after making your file."
            ]
           }
          ]
         }
        ],
        "skill": {
         "from": 1,
         "to": 21
        },
        "needs": [
         {
          "name": "File Mold",
          "qty": 3,
          "total": true
         },
         {
          "name": "Water Flask",
          "qty": 53,
          "total": true
         },
         {
          "name": "Small Piece of Ore",
          "qty": 100,
          "total": true
         }
        ]
       },
       {
        "runs": [
         "21 to 31: ",
         {
          "link": "Sheet Metal",
          "text": "Sheet Metal"
         }
        ],
        "skill": {
         "from": 21,
         "to": 31
        },
        "needs": [
         {
          "name": "Small Brick of Ore",
          "qty": 2
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 1030,
         "how": "partial",
         "unpriced": [
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "41 to 68: ",
         {
          "link": "Large Lantern",
          "text": "Large Lantern"
         }
        ],
        "children": [
         {
          "runs": [
           "Need to buy 40 ",
           {
            "link": "Lantern Casing Mold",
            "text": "Lantern Casing Mold"
           },
           " and 40 ",
           {
            "link": "Bottle",
            "text": "Bottles"
           },
           " (~6pp)."
          ]
         },
         {
          "runs": [
           "Around forty combines will use up your metal bits from earlier and get you to around 68. Sell Lanterns after to get some money back."
          ]
         }
        ],
        "skill": {
         "from": 41,
         "to": 68
        },
        "needs": [
         {
          "name": "Lantern Casing Mold",
          "qty": 40,
          "total": true
         },
         {
          "name": "Bottle",
          "qty": 40,
          "total": true
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Banded Armor (Up to 115)",
      "anchor": "Banded_Armor_(Up_to_115)"
     },
     {
      "kind": "text",
      "runs": [
       "(Updated for EQL recipes/trivials)"
      ]
     },
     {
      "kind": "text",
      "runs": [
       "You will need to do about 100 combines to go from 68 to 115. If you plan on wearing the armor, your best bet is going to still follow the cheapest path and then make each item you need to wear once or twice after it is trivial."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "69 to 90: ",
         {
          "link": "Banded Belt",
          "text": "Banded Belt"
         },
         ", ",
         {
          "link": "Banded Boots",
          "text": "Banded Boots"
         },
         ", ",
         {
          "link": "Banded Bracer",
          "text": "Banded Bracer"
         },
         ", ",
         {
          "link": "Banded Gorget",
          "text": "Banded Gorget"
         },
         ", ",
         {
          "link": "Banded Mantle",
          "text": "Banded Mantle"
         },
         ", ",
         {
          "link": "Banded Mask",
          "text": "Banded Mask"
         }
        ],
        "children": [
         {
          "runs": [
           "Gorget, followed by Bracers are the cheapest. The others are substantially more expensive. Expect it to take about 50 combines to reach 90+. (Only needed 41 gorget combines to progress from 68 to 92 at 370 Strength.)"
          ],
          "children": [
           {
            "runs": [
             "Sheet Metal: 50 total"
            ]
           },
           {
            "runs": [
             "Estimated Cost: 60pp"
            ]
           }
          ]
         }
        ],
        "skill": {
         "from": 69,
         "to": 90
        },
        "needs": [
         {
          "name": "Belt Sectional Mold",
          "qty": 1
         },
         {
          "name": "Sheet Metal",
          "qty": 2
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "needsFor": {
         "result": "Banded Belt",
         "options": 6
        },
        "cost": {
         "copper": 2000,
         "how": "partial",
         "unpriced": [
          "Belt Sectional Mold",
          "Water Flask"
         ]
        }
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "90 to 106: ",
         {
          "link": "Banded Cloak",
          "text": "Banded Cloak"
         },
         ", ",
         {
          "link": "Banded Gauntlets",
          "text": "Banded Gauntlets"
         },
         ", ",
         {
          "link": "Banded Helm",
          "text": "Banded Helm"
         },
         ", ",
         {
          "link": "Banded Leggings",
          "text": "Banded Leggings"
         },
         ", ",
         {
          "link": "Banded Sleeves",
          "text": "Banded Sleeves"
         }
        ],
        "children": [
         {
          "runs": [
           "Gauntlets, followed very closely by Helms are the cheapest. You will probably need 20 gauntlets to hit 100 and about 12 Helms to get 106. (Only needed 23 gauntlet combines to progress from 92 to 102 at 370 Strength.)"
          ],
          "children": [
           {
            "runs": [
             "Sheet Metal: 64 total"
            ]
           },
           {
            "runs": [
             "Estimated Cost: 90pp"
            ]
           }
          ]
         }
        ],
        "skill": {
         "from": 90,
         "to": 106
        },
        "needs": [
         {
          "name": "Cloak Sectional Mold",
          "qty": 1
         },
         {
          "name": "Sheet Metal",
          "qty": 2
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "needsFor": {
         "result": "Banded Cloak",
         "options": 5
        },
        "cost": {
         "copper": 3259,
         "how": "partial",
         "unpriced": [
          "Water Flask"
         ]
        }
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "106 to 115: ",
         {
          "link": "Banded Mail",
          "text": "Banded Mail"
         }
        ],
        "children": [
         {
          "runs": [
           "Other than getting a few levels above 105 out of leggings, you'll have to rely on Mail for most of this. Expect to make 20 or so. (Needed 30 mail combines to progress from 102 to 115, with a total of 177 sheet metal for all banded progress at 370 Strength.)"
          ],
          "children": [
           {
            "runs": [
             "Sheet Metal: 60 total"
            ]
           },
           {
            "runs": [
             "Estimated Cost: 100pp"
            ]
           }
          ]
         }
        ],
        "skill": {
         "from": 106,
         "to": 115
        },
        "needs": [
         {
          "name": "Mail Sectional Mold",
          "qty": 1
         },
         {
          "name": "Sheet Metal",
          "qty": 3
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 3000,
         "how": "partial",
         "unpriced": [
          "Mail Sectional Mold",
          "Water Flask"
         ]
        }
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Feir`Dal Fletching Kit (up to 163)",
      "anchor": "Feir`Dal_Fletching_Kit_(up_to_163)"
     },
     {
      "kind": "text",
      "runs": [
       "If you are not agro to Wood Elves, I would highly recommend making ",
       {
        "link": "Feir`Dal Fletching Kit",
        "text": "Feir`Dal Fletching Kits"
       },
       " up to 163. This costs about 7pp per combine and will take you higher than Ornate Chain. Don't be like me and burn 3000pp just to get to 133. I could have probably gotten to 163 for less than 2000pp if I had started with the kits."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "You do NOT have to be a Wood Elf to use the Feir`Dal Forge or make Feir`Dal cultural crafting."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "If you can't go to Kelethin, Ornate (below) is going to be your best bet. But just know it's really annoying to get materials for, and extremely expensive."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Ornate Chain (up to 142)",
      "anchor": "Ornate_Chain_(up_to_142)"
     },
     {
      "kind": "text",
      "runs": [
       {
        "link": "Ornate Chain Armor",
        "text": "Ornate Chain Armor"
       },
       " can get you to 142. It requires ",
       {
        "link": "High Quality Metal Rings",
        "text": "High Quality Metal Rings"
       },
       " which are made from ",
       {
        "link": "Large Brick of High Quality Ore",
        "text": "Large Brick of High Quality Ore"
       },
       " which are a pain to get. You can sometimes find them on merchants that players sold to, along with ",
       {
        "link": "Small Brick of High Quality Ore",
        "text": "Small Brick of High Quality Ore"
       },
       " which can be turned into the Large Bricks. These are all extremely expensive - about 60pp for a single brick which will make 2 rings, if you don't fail."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "So far the only merchant confirmed to always sell these in EQ Legends is ",
       {
        "link": "Greta Terrilon",
        "text": "Greta Terrilon"
       },
       " in ",
       {
        "link": "Halas",
        "text": "Halas"
       },
       ". Unfortunately, no one in Halas seems to sell silver bars."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "From the looks of it, the best path to 142 is:"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         {
          "link": "Ornate Chain Bracelet",
          "text": "Ornate Chain Bracelet"
         },
         " to 122 (~32pp per combine)"
        ],
        "skill": {
         "from": 115,
         "to": 122
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "High Quality Metal Rings",
          "qty": 1
         },
         {
          "name": "Chainmail Bracelet Pattern",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 32000,
         "how": "stated"
        }
       },
       {
        "runs": [
         {
          "link": "Ornate Chain Coif",
          "text": "Ornate Chain Coif"
         },
         " to 132 (~65pp per combine)"
        ],
        "skill": {
         "from": 122,
         "to": 132
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "High Quality Metal Rings",
          "qty": 2
         },
         {
          "name": "Chainmail Coif Pattern",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 65000,
         "how": "stated"
        }
       },
       {
        "runs": [
         {
          "link": "Ornate Chain Mail",
          "text": "Ornate Chain Mail"
         },
         " to 142 (~98pp per combine)"
        ],
        "skill": {
         "from": 132,
         "to": 142
        },
        "needs": [
         {
          "name": "Silver Bar",
          "qty": 1
         },
         {
          "name": "High Quality Metal Rings",
          "qty": 3
         },
         {
          "name": "Chainmail Tunic Pattern",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 98000,
         "how": "stated"
        }
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "I spent about 3000pp on Ore, Silver Bars, and Patterns. It got me to 133 skill."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Fine Plate (up to 188)",
      "anchor": "Fine_Plate_(up_to_188)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "142 to 168: ",
         {
          "link": "Fine Plate Bracer",
          "text": "Fine Plate Bracer"
         }
        ],
        "skill": {
         "from": 142,
         "to": 168
        },
        "needs": [
         {
          "name": "Leather Padding",
          "qty": 1
         },
         {
          "name": "Medium Quality Folded Sheet Metal",
          "qty": 1
         },
         {
          "name": "Plate Bracer Mold",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "168 to 179: ",
         {
          "link": "Fine Plate Helm",
          "text": "Fine Plate Helm"
         }
        ],
        "skill": {
         "from": 168,
         "to": 179
        },
        "needs": [
         {
          "name": "Leather Padding",
          "qty": 1
         },
         {
          "name": "Medium Quality Folded Sheet Metal",
          "qty": 2
         },
         {
          "name": "Plate Helm Mold",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "179 to 188: ",
         {
          "link": "Fine Plate Breastplate",
          "text": "Fine Plate Breastplate"
         }
        ],
        "skill": {
         "from": 179,
         "to": 188
        },
        "needs": [
         {
          "name": "Breastplate Mold",
          "qty": 1
         },
         {
          "name": "Leather Padding",
          "qty": 1
         },
         {
          "name": "Medium Quality Folded Sheet Metal",
          "qty": 3
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "name": "Skilling up Recommendations",
    "anchor": "Skilling_up_Recommendations",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "The following recommendations are designed to strike a solid balance between saving time and saving money."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Basics",
      "anchor": "Basics"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Bypass ",
         {
          "link": "Scaler",
          "text": "Scaler"
         },
         " in favor of ",
         {
          "link": "Studs",
          "text": "Studs"
         },
         ", and then on to ",
         {
          "link": "Skewers",
          "text": "Skewers"
         },
         ". This path avoids making multiple trips between merchants for molds because you only require ",
         {
          "link": "Metal Bits",
          "text": "Metal Bits"
         },
         " and ",
         {
          "link": "Water Flask",
          "text": "Water Flask"
         },
         " until you hit ",
         {
          "link": "Skewers",
          "text": "Skewers"
         },
         " (which still use the supply of bits you will have acquired, as well as a single mold), but will cost a little more. Total cost to get from 1 to 100 skill (only 1 point put into it) using this method was approximately 100 plat (50 CHA, 161 WIS). ~~NOTE~~: Studs are trivial at 41, so you still need to do Large Lanterns (or similar i.e. Forged Javelins). Studs are a good stand-in for Scaler, though."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "You CAN bypass ornate chain armors in favor of fine plate, or alternate between ornate and fine plate visors as you get in supplies for either. Getting your tailoring skills up high enough to make your own leather padding will save lots of money in the long run, and people often have silks and skins to sell-you can also reliable farm your own in newbie zones (There's a decent spot in Eastern Commons near the tunnel to farm spiderlings and random bear/wolf/cat skins for padding while you buy/sell with players). By making your own leather padding and selling your wares to merchants (if you can't find buyers), you will make back most of what you spend. Ornate chain requires more trips between the farming locale and bank/forge, but may be cheaper overall."
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Banded",
      "anchor": "Banded"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "For banded armor, Banded mask trivial 90, Banded Gorget (92), Banded Belt, boots, bracer or Mantle (95), Banded Cloak, Gauntlets, Helm or Sleeves (102), banded Leggings (108) and finally banded Mail at 115."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "All Banded combines require a mold, water flask and some number of pieces of sheet metal. I would suggest gorget (1 piece sheet metal), any of gauntlets sleeve or cloak (all require 2 sheet metal), Helm (2 pieces sheet metal, then mail (requires 3 pieces of sheet metal)"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "When working on banded armor, work in ",
         {
          "link": "East Freeport",
          "text": "East Freeport"
         },
         ", ",
         {
          "link": "Toxxulia Forest",
          "text": "Toxxulia Forest"
         },
         ", ",
         {
          "link": "Qeynos Hills",
          "text": "Qeynos Hills"
         },
         ", ",
         {
          "link": "Greater Faydark",
          "text": "Greater Faydark"
         },
         ", or ",
         {
          "link": "East Cabilis",
          "text": "East Cabilis"
         },
         ". These areas have ",
         {
          "link": "Sheet Metal",
          "text": "Sheet Metal"
         },
         " pre-made, which reduces your time spent as well as your losses due to sub-combine failure. I suggest Greater Faydark or East Freeport for most people. Trolls, Ogres, and Dark Elves have nowhere to buy it and must make their own."
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Ornate Chain (Mantle, Boots, or Gloves)",
      "anchor": "Ornate_Chain_(Mantle,_Boots,_or_Gloves)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Banded covers you to 115 but there is a path to go from 175 -182 where you can make Ornate Chain."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "It takes about 40-55 attempts with a HE Cleric having 198 WIS to go from 175 to 182 trivial."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Ornate Chain is made with an unenchanted silver bar and High Quality Ore dropped by goblins in SolA or Permafrost and maybe Runnyeye."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "It is easiest to farm SolA. Why SolA? There is a Gnome vendor (if you aren't KOS) in zone you can sell FS weapons and gems that drop off the goblins so you don't have to leave the zone. If you can do the tricks to sell to the ",
         {
          "link": "Goblin Merchant",
          "text": "Goblin Merchant"
         },
         " that is an option too. Often either/both merchants will have HQ ore you can buy if you just want to spend the plat. This is handy after making good coin selling FS weapons, gems, and jewelry the goblins like to drop."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "This takes time but may be less time and money than getting materials and beginning Fine Plate before you absolutely must do plate."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "The vendor in Freeport listed to sell the medium sized chain mold patterns does not exist at this time, use a different city. Felwithe and Neriak are good options because they sell patterns and silver bars."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "the HQ ore can frequently be found on merchants in Highkeep, and there is a forge in Highpass Hold just outside of Highkeep and to the left."
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "High Quality Rings are not stackable, and 1 large brick of HQ ore turns in to 2 rings, so plan your bag space around this. A good option is to pre purchase the stackable silver bars and patterns and convert bricks and immediately use the 2 rings to make an attempt at a mantle."
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Fine Plate",
      "anchor": "Fine_Plate"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "When working on fine plate armor, work in ",
         {
          "link": "Highkeep",
          "text": "Highkeep"
         },
         ", or ",
         {
          "link": "Qeynos",
          "text": "Qeynos"
         },
         ". These are the only three cities where both the molds, AND the medium quality ores can be bought for 20pp each."
        ]
       },
       {
        "runs": [
         "Folded MQ sheets are stackable"
        ]
       },
       {
        "runs": [
         "Get stacks and stacks and stacks of spiderling silks and make stacks and stacks of silk thread. This is the most difficult part of doing fine steel besides having a couple thousand platinum to hit it hard (which you don't burn through too fast with reselling to vendor what you make, it just takes a good chunk of plat to start with)."
        ]
       },
       {
        "runs": [
         "Once you have stacks and stacks and stacks (12-20 stacks) of ",
         {
          "link": "Silk Thread",
          "text": "Silk Thread"
         },
         " made from spiderling silks take a ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         },
         ", a ",
         {
          "link": "Skinning Knife",
          "text": "Skinning Knife"
         },
         ", and all your stacks of silk thread to ",
         {
          "link": "Stonebrunt Mountains",
          "text": "Stonebrunt Mountains"
         },
         " to farm cat pelts. The leopards almost always drop a LQ or MQ cat pelt. You need the skinning knife to down grade MQ pelts to LQ. Out of 200 pelts I just farmed I received 5 HQ pelts so don't expect many HQ if needing for other purposes. As you get a pelt immediately turn it into stackable ",
         {
          "link": "Leather Padding",
          "text": "Leather Padding"
         },
         ". Why do it this way? Stonebrunt is far from everything and the pelts drop on almost every kill but do not stack. It is only efficient to go here if you bring everything to convert the pelts into leather padding so you can walk in with stacks of silk thread and walk out with stacks of leather padding for fine plate smithing."
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Brewing",
  "title": "Skill Brewing",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Leveling Guide",
    "anchor": "Leveling_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "The following is intended as a guide for those interested in advancing brewing skills with a minimum of foraged items and running around. ",
       {
        "link": "Qeynos",
        "text": "Qeynos"
       },
       " and ",
       {
        "link": "Freeport",
        "text": "Freeport"
       },
       " are excellent cities to learn in. With decent Int or Wis one can advance in this skill relatively quickly, just DO NOT drink while brewing! Brewing is relatively easy skill to start don't train any points in this skill unless you just have some to spare."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Note for Tailors: You can make ",
       {
        "link": "Heady Kiola",
        "text": "Heady Kiola"
       },
       " while working up brewing and save for tailoring. But the price difference between ",
       {
        "link": "Heady Kiola",
        "text": "Heady Kiola"
       },
       " and the options below is so significant, you might as well just use the Ale recipes to level up cheaply and quickly, and then only make ",
       {
        "link": "Heady Kiola",
        "text": "Heady Kiola"
       },
       " as need be once it is trivial."
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Fast Track (up to 151)",
      "anchor": "Fast_Track_(up_to_151)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "1 to 31: ",
         {
          "link": "Short Beer",
          "text": "Short Beer"
         }
        ],
        "children": [
         {
          "runs": [
           {
            "link": "Barley",
            "text": "Barley"
           },
           " + ",
           {
            "link": "Cask",
            "text": "Cask"
           },
           " + ",
           {
            "link": "Hops",
            "text": "Hops"
           },
           " + ",
           {
            "link": "Malt",
            "text": "Malt"
           }
          ]
         }
        ],
        "skill": {
         "from": 1,
         "to": 31
        },
        "needs": [
         {
          "name": "Barley",
          "qty": 1
         },
         {
          "name": "Cask",
          "qty": 1
         },
         {
          "name": "Hops",
          "qty": 1
         },
         {
          "name": "Malt",
          "qty": 1
         }
        ]
       }
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "1 to 151: ",
         {
          "link": "Skull Ale",
          "text": "Skull Ale"
         }
        ],
        "children": [
         {
          "runs": [
           {
            "link": "Cyclops Skull",
            "text": "Cyclops Skull"
           },
           " + ",
           {
            "link": "Short Beer",
            "text": "Short Beer"
           },
           " + ",
           {
            "link": "Spices",
            "text": "Spices"
           },
           " + ",
           {
            "link": "Vinegar",
            "text": "Vinegar"
           }
          ]
         },
         {
          "runs": [
           "This requires a ",
           {
            "link": "Cyclops Skull",
            "text": "Cyclops Skull"
           },
           " from an ",
           {
            "link": "An undead cyclops",
            "text": "an undead cyclops"
           },
           " in ",
           {
            "link": "South Karana",
            "text": "South Karana"
           },
           ". You only need one skull for all the combines."
          ]
         },
         {
          "runs": [
           {
            "link": "Spices",
            "text": "Spices"
           },
           " and ",
           {
            "link": "Vinegar",
            "text": "Vinegar"
           },
           " aren't available in all cities, so you may need to travel."
          ]
         },
         {
          "runs": [
           "At first the recipe will not be available in the advanced trade skill window. You will need to manually combine the ingredients until you succeed at making the ale once, then the recipe can be auto-combined."
          ]
         }
        ],
        "skill": {
         "from": 1,
         "to": 151
        },
        "needs": [
         {
          "name": "Cyclops Skull",
          "qty": 1
         },
         {
          "name": "Short Beer",
          "qty": 1
         },
         {
          "name": "Spices",
          "qty": 1
         },
         {
          "name": "Vinegar",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "If you're trying to do Brewing at very low levels you may need to do ",
         {
          "link": "Short Ale",
          "text": "Short Ale"
         },
         " (trivial 51), ",
         {
          "link": "Ale",
          "text": "Ale"
         },
         " (trivial 68), and ",
         {
          "link": "Ol'Tujim's Fierce Brew",
          "text": "Ol'Tujim's Fierce Brew"
         },
         " (trivial 135) instead. Its more annoying and more expensive. If you can just wait until level 15-20 and go farm a skull it will be easier."
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Advanced Brewing (up to 188)",
      "anchor": "Advanced_Brewing_(up_to_188)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "up to 168: ",
         {
          "link": "Ginesh",
          "text": "Ginesh"
         }
        ],
        "children": [
         {
          "runs": [
           "This takes foraged vegetables, but is pretty cheap. If you don't have vegetables or run out, just move on to the next."
          ]
         }
        ],
        "skill": {
         "from": 151,
         "to": 168
        },
        "needs": [
         {
          "name": "Short Beer",
          "qty": 1
         },
         {
          "name": "Shotglass",
          "qty": 1
         },
         {
          "name": "Vegetables",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "up to 188: ",
         {
          "link": "Faydwer Shaker",
          "text": "Faydwer Shaker"
         }
        ],
        "skill": {
         "from": 168,
         "to": 188
        },
        "needs": [
         {
          "name": "Cask",
          "qty": 1
         },
         {
          "name": "Dwarven Ale",
          "qty": 1
         },
         {
          "name": "Elven Wine",
          "qty": 1
         },
         {
          "name": "Gnomish Spirits",
          "qty": 1
         },
         {
          "name": "Mead",
          "qty": 1
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Master Brewing (up to 248)",
      "anchor": "Master_Brewing_(up_to_248)"
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "up to 248: ",
         {
          "link": "Minotaur Hero's Brew",
          "text": "Minotaur Hero's Brew"
         }
        ],
        "skill": {
         "from": 188,
         "to": 248
        },
        "needs": [
         {
          "name": "Cask",
          "qty": 1
         },
         {
          "name": "Malt",
          "qty": 3
         },
         {
          "name": "Short Beer",
          "qty": 2
         },
         {
          "name": "Water Flask",
          "qty": 2
         },
         {
          "name": "Yeast",
          "qty": 1
         }
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Fletching",
  "title": "Skill Fletching",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Level Up Guide",
    "anchor": "Level_Up_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "If you're just looking to level up Fletching you can follow these charts for the quickest and cheapest way. If you want to know more about the details about how to make custom arrows and bows you can find those details further below."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Dexterity, Intelligence, or Wisdom: whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "The trivial of any arrow is determined by the highest trivial out of all 4 components. The absolute cheapest way to level fletching is to use just the single component which will yield an arrow with a high enough trivial to raise your fletching, and the cheapest things available for the other 3 components. However, this will usually lead to an arrow with terrible stats. If you have extra coin and plan to use the arrows upgrade first to ",
       {
        "link": "Several Parabolic Cut Fletchings",
        "text": "Parabolic  Fletching +50 Range"
       },
       " then ",
       {
        "link": "Small Groove Nocks",
        "text": "Small Nocks +50 Range"
       },
       " then ",
       {
        "link": "Bundled Bone Arrow Shafts",
        "text": "Bone Shafts +1 Dmg"
       },
       "."
      ]
     },
     {
      "kind": "table",
      "header": [
       "Description",
       "Trivial",
       "Dmg/Rng",
       "Combine Cost (CP)",
       "Point",
       "Shaft",
       "Fletch",
       "Nock",
       "Arrow"
      ],
      "rows": [
       [
        [
         "Type 1"
        ],
        [
         "16"
        ],
        [
         "1/50"
        ],
        [
         "20"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Round"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 1 Wood Point Arrow",
          "text": "CLASS 1 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 2"
        ],
        [
         "36"
        ],
        [
         "1/75"
        ],
        [
         "31"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Round"
        ],
        [
         "Medium"
        ],
        [
         {
          "link": "CLASS 1 Wood Point Arrow",
          "text": "CLASS 1 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 3"
        ],
        [
         "46"
        ],
        [
         "1/100"
        ],
        [
         "41"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Para"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 2 Wood Point Arrow",
          "text": "CLASS 2 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 4"
        ],
        [
         "56"
        ],
        [
         "1/100"
        ],
        [
         "56"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Round"
        ],
        [
         "Small"
        ],
        [
         {
          "link": "CLASS 1 Wood Point Arrow",
          "text": "CLASS 1 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 5"
        ],
        [
         "68"
        ],
        [
         "2/50"
        ],
        [
         "94"
        ],
        [
         "Field"
        ],
        [
         "Bone"
        ],
        [
         "Round"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 1 Bone Point Arrow",
          "text": "CLASS 1 Bone Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 6"
        ],
        [
         "82"
        ],
        [
         "2/25"
        ],
        [
         "204"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Shield"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 3 Wood Point Arrow",
          "text": "CLASS 3 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 7"
        ],
        [
         "102"
        ],
        [
         "2/5"
        ],
        [
         "330"
        ],
        [
         "Hooked"
        ],
        [
         "Wood"
        ],
        [
         "Round"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 1 Wood Hooked Arrow",
          "text": "CLASS 1 Wood Hooked Arrow"
         }
        ]
       ],
       [
        [
         "Type 8"
        ],
        [
         "122"
        ],
        [
         "2/25"
        ],
        [
         "697"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Wood Vane"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 4 Wood Point Arrow",
          "text": "CLASS 4 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 9"
        ],
        [
         "135"
        ],
        [
         "3/50"
        ],
        [
         "1393"
        ],
        [
         "Field"
        ],
        [
         "Ceramic"
        ],
        [
         "Round"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 1 Ceramic Point Arrow",
          "text": "CLASS 1 Ceramic Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 10"
        ],
        [
         "162"
        ],
        [
         "2/75"
        ],
        [
         "1643"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Bone Vane"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 5 Wood Point Arrow",
          "text": "CLASS 5 Wood Point Arrow"
         }
        ]
       ],
       [
        [
         "Type 11"
        ],
        [
         "202"
        ],
        [
         "3/50"
        ],
        [
         "4030"
        ],
        [
         "Field"
        ],
        [
         "Wood"
        ],
        [
         "Ceramic Vane"
        ],
        [
         "Large"
        ],
        [
         {
          "link": "CLASS 6 Wood Point Arrow",
          "text": "CLASS 6 Wood Point Arrow"
         }
        ]
       ]
      ],
      "skill": [
       {
        "from": 0,
        "to": 16
       },
       {
        "from": 16,
        "to": 36
       },
       {
        "from": 36,
        "to": 46
       },
       {
        "from": 46,
        "to": 56
       },
       {
        "from": 56,
        "to": 68
       },
       {
        "from": 68,
        "to": 82
       },
       {
        "from": 82,
        "to": 102
       },
       {
        "from": 102,
        "to": 122
       },
       {
        "from": 122,
        "to": 135
       },
       {
        "from": 135,
        "to": 162
       },
       {
        "from": 162,
        "to": 202
       }
      ],
      "needs": [
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Parabolic Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Bone Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Shield Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Hooked Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Set of Wooden Arrow Vanes",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Ceramic Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Several Round Cut Fletchings",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Set of Bone Arrow Vanes",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ],
       [
        {
         "name": "Field Point Arrowheads",
         "qty": 1
        },
        {
         "name": "Bundled Wooden Arrow Shafts",
         "qty": 1
        },
        {
         "name": "Set of Ceramic Arrow Vanes",
         "qty": 1
        },
        {
         "name": "Large Groove Nocks",
         "qty": 1
        }
       ]
      ],
      "cost": [
       {
        "copper": 20,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 20,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 41,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 20,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 94,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 204,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 330,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 697,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 1393,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 1643,
        "how": "recipe",
        "source": "Skill Fletching"
       },
       {
        "copper": 4030,
        "how": "recipe",
        "source": "Skill Fletching"
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Once your Fletching hits 200+ you will want to start making Advanced Arrows."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "There are four options and they are all trivial at 335 (300 is the current skill cap in EQ Legends):"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         {
          "link": "Kelethin",
          "text": "Kelethin"
         },
         " Arrows"
        ],
        "children": [
         {
          "runs": [
           {
            "link": "Mithril Champion Arrows",
            "text": "Mithril Champion Arrows"
           }
          ]
         },
         {
          "runs": [
           {
            "link": "Blessed Champion Arrows",
            "text": "Blessed Champion Arrows"
           }
          ]
         }
        ]
       },
       {
        "runs": [
         {
          "link": "Surefall Glade",
          "text": "Surefall Glade"
         },
         " Arrows"
        ],
        "children": [
         {
          "runs": [
           {
            "link": "Steel Guardian Arrows",
            "text": "Steel Guardian Arrows"
           }
          ]
         },
         {
          "runs": [
           {
            "link": "Blessed Guardian Arrows",
            "text": "Blessed Guardian Arrows"
           }
          ]
         }
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Both of the \"Blessed\" versions are only slightly better and require imbued gems. The Karana (Surefall Glade) Blessed arrows require foraged ",
       {
        "link": "Plains Pebble",
        "text": "Plains Pebbles"
       },
       " to be enchanted. When you first start this journey your success rate will only be about 5%. You would need thousands of Plains Pebbles to reach 300 skill going that route."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "My recommendation would be to just make normal Mithril Champion Arrows. They're almost just as good and a lot cheaper than the Blessed version. If you do want a Blessed version, the Champion Arrows require Emeralds, which can thankfully be store bought - far easier to acquire than the Plains Pebbles. The Steel Guardian Arrows are also a good choice, though from Jokon's guide below it seems like they're a little more complicated and require higher ",
       {
        "link": "Blacksmithing",
        "text": "Blacksmithing"
       },
       " skill."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "To make the Mithril Champion Arrows, follow the ",
       {
        "link": "Blessed Champion Arrows Guide",
        "text": "Blessed Champion Arrows Guide"
       },
       ", but leave out all the emeralds. By leaving out the emeralds, you will make normal Mithril Arrow Heads, which will combine with the other components in the guide to make the Mithril Champion Arrows."
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Pottery",
  "title": "Skill Pottery",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Quick Leveling Guide",
    "anchor": "Quick_Leveling_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "For more detailed info see below."
      ]
     },
     {
      "kind": "table",
      "header": [
       "Item",
       "Ingredients",
       "Trivial",
       "Era"
      ],
      "rows": [
       [
        [
         {
          "link": "Clay/water mixture",
          "text": "Clay/water mixture"
         },
         " (Conversion)"
        ],
        [],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "26"
        ],
        [
         {
          "era": "velious"
         }
        ]
       ],
       [
        [
         "Pre-Velious: ",
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         },
         " (Conversion)"
        ],
        [],
        [
         {
          "link": "Large Block of Clay",
          "text": "Large Block of Clay"
         }
        ],
        [],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "21"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Medium Container",
          "text": "Unfired Medium Container"
         }
        ],
        [
         {
          "link": "Medium Jar Sketch",
          "text": "Medium Jar Sketch"
         }
        ],
        [
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "36"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Large Container",
          "text": "Unfired Large Container"
         }
        ],
        [
         {
          "link": "Large Jar Sketch",
          "text": "Large Jar Sketch"
         }
        ],
        [
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "41"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Small Bowl",
          "text": "Unfired Small Bowl"
         }
        ],
        [
         {
          "link": "Bowl Sketch",
          "text": "Bowl Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "102"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Medium Bowl",
          "text": "Unfired Medium Bowl"
         }
        ],
        [
         {
          "link": "Medium Bowl Sketch",
          "text": "Medium Bowl Sketch"
         }
        ],
        [
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "122"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Large Bowl",
          "text": "Unfired Large Bowl"
         }
        ],
        [
         {
          "link": "Large Bowl Sketch",
          "text": "Large Bowl Sketch"
         }
        ],
        [
         {
          "link": "Large Block of Clay",
          "text": "Large Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         {
          "link": "Glass Shard",
          "text": "Glass Shard"
         }
        ],
        [
         "148"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Poison Vial",
          "text": "Unfired Poison Vial"
         }
        ],
        [
         {
          "link": "Vial Sketch",
          "text": "Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin*"
        ],
        [
         "148"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Lined Poison Vial",
          "text": "Unfired Lined Poison Vial"
         }
        ],
        [
         {
          "link": "Lined Vial Sketch",
          "text": "Lined Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin*"
        ],
        [
         "168"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         {
          "link": "Unfired Sealed Poison Vial",
          "text": "Unfired Sealed Poison Vial"
         }
        ],
        [
         {
          "link": "Sealed Vial Sketch",
          "text": "Sealed Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin*"
        ],
        [
         "188"
        ],
        [
         {
          "era": "classic"
         }
        ]
       ]
      ]
     }
    ]
   },
   {
    "name": "Leveling Guide",
    "anchor": "Leveling_Guide",
    "blocks": [
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "0 to 21: ",
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        "skill": {
         "from": 0,
         "to": 21
        },
        "needs": [
         {
          "name": "Small Block of Clay",
          "qty": 3
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "21 to 36: ",
         {
          "link": "Unfired Medium Container",
          "text": "Unfired Medium Container"
         }
        ],
        "skill": {
         "from": 21,
         "to": 36
        },
        "needs": [
         {
          "name": "Block of Clay",
          "qty": 1
         },
         {
          "name": "Medium Jar Sketch",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 41,
         "how": "partial",
         "unpriced": [
          "Medium Jar Sketch",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "36 to 41: ",
         {
          "link": "Unfired Large Container",
          "text": "Unfired Large Container"
         }
        ],
        "skill": {
         "from": 36,
         "to": 41
        },
        "needs": [
         {
          "name": "Block of Clay",
          "qty": 1
         },
         {
          "name": "Large Jar Sketch",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 41,
         "how": "partial",
         "unpriced": [
          "Large Jar Sketch",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "41 to 102: ",
         {
          "link": "Unfired Small Bowl",
          "text": "Unfired Small Bowl"
         }
        ],
        "skill": {
         "from": 41,
         "to": 102
        },
        "needs": [
         {
          "name": "Bowl Sketch",
          "qty": 1
         },
         {
          "name": "Small Block of Clay",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       },
       {
        "runs": [
         "102 to 122: ",
         {
          "link": "Unfired Medium Bowl",
          "text": "Unfired Medium Bowl"
         }
        ],
        "skill": {
         "from": 102,
         "to": 122
        },
        "needs": [
         {
          "name": "Block of Clay",
          "qty": 1
         },
         {
          "name": "Medium Bowl Sketch",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 41,
         "how": "partial",
         "unpriced": [
          "Medium Bowl Sketch",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "122 to 148: ",
         {
          "link": "Unfired Large Bowl",
          "text": "Unfired Large Bowl"
         },
         " or ",
         {
          "link": "Unfired Poison Vial",
          "text": "Unfired Poison Vial"
         },
         " // ",
         {
          "link": "Poison Vial",
          "text": "Poison Vial"
         }
        ],
        "skill": {
         "from": 122,
         "to": 148
        },
        "needs": [
         {
          "name": "Glass Shard",
          "qty": 1
         },
         {
          "name": "Large Block of Clay",
          "qty": 1
         },
         {
          "name": "Large Bowl Sketch",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "needsFor": {
         "result": "Unfired Large Bowl",
         "options": 3
        },
        "cost": {
         "copper": 1580,
         "how": "partial",
         "unpriced": [
          "Large Block of Clay",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "122 to 168: ",
         {
          "link": "Unfired Lined Poison Vial",
          "text": "Unfired Lined Poison Vial"
         },
         " // ",
         {
          "link": "Lined Poison Vial",
          "text": "Lined Poison Vial"
         }
        ],
        "skill": {
         "from": 122,
         "to": 168
        },
        "needs": [
         {
          "name": "Lined Vial Sketch",
          "qty": 1
         },
         {
          "name": "Small Block of Clay",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "needsFor": {
         "result": "Unfired Lined Poison Vial",
         "options": 2
        },
        "cost": {
         "copper": 839,
         "how": "partial",
         "unpriced": [
          "Small Block of Clay",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "122 to 188: ",
         {
          "link": "Unfired Sealed Poison Vial",
          "text": "Unfired Sealed Poison Vial"
         },
         " // ",
         {
          "link": "Sealed Poison Vial",
          "text": "Sealed Poison Vial"
         }
        ],
        "skill": {
         "from": 122,
         "to": 188
        },
        "needs": [
         {
          "name": "Sealed Vial Sketch",
          "qty": 1
         },
         {
          "name": "Small Block of Clay",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ],
        "needsFor": {
         "result": "Unfired Sealed Poison Vial",
         "options": 2
        },
        "cost": {
         "copper": 1889,
         "how": "partial",
         "unpriced": [
          "Small Block of Clay",
          "Water Flask"
         ]
        }
       },
       {
        "runs": [
         "188 to 250: ",
         {
          "link": "Unfired Idol",
          "text": "Unfired Idol"
         },
         " // Fired Idol"
        ],
        "skill": {
         "from": 188,
         "to": 250
        },
        "needs": [
         {
          "name": "Idol Sketch",
          "qty": 1
         },
         {
          "name": "Large Block of Magic Clay",
          "qty": 1
         },
         {
          "name": "Sculpting Tools",
          "qty": 1
         },
         {
          "name": "Vial of Clear Mana",
          "qty": 1
         }
        ]
       }
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 1 Jar and bowls",
      "anchor": "Step_1_Jar_and_bowls"
     },
     {
      "kind": "text",
      "runs": [
       "During this stage it is best to just discard your combines because they cannot be sold unless fired. Since firing sheets do not stack it is very time consuming to fire and in most cases the firing step is trivial. If you plan on needing any Mana Vials for ",
       {
        "link": "Tailoring",
        "text": "Tailoring"
       },
       " or Pottery Idols skip Large Bowls."
      ]
     },
     {
      "kind": "table",
      "header": [
       "Sketch",
       "Clay",
       "Water",
       "Other"
      ],
      "rows": [
       [
        [
         {
          "link": "Unfired Medium Container",
          "text": "Unfired Medium Container"
         }
        ],
        [
         {
          "link": "Medium Jar Sketch",
          "text": "Medium Jar Sketch"
         }
        ],
        [
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "36"
        ]
       ],
       [
        [
         {
          "link": "Unfired Small Bowl",
          "text": "Unfired Small Bowl"
         }
        ],
        [
         {
          "link": "Bowl Sketch",
          "text": "Bowl Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "102"
        ]
       ],
       [
        [
         {
          "link": "Unfired Medium Bowl",
          "text": "Unfired Medium Bowl"
         }
        ],
        [
         {
          "link": "Medium Bowl Sketch",
          "text": "Medium Bowl Sketch"
         }
        ],
        [
         {
          "link": "Block of Clay",
          "text": "Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [],
        [
         "122"
        ]
       ],
       [
        [
         {
          "link": "Unfired Large Bowl",
          "text": "Unfired Large Bowl"
         }
        ],
        [
         {
          "link": "Large Bowl Sketch",
          "text": "Large Bowl Sketch"
         }
        ],
        [
         {
          "link": "Large Block of Clay",
          "text": "Large Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         {
          "link": "Glass Shard",
          "text": "Glass Shard"
         }
        ],
        [
         "148"
        ]
       ]
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 2 Poison Vials",
      "anchor": "Step_2_Poison_Vials"
     },
     {
      "kind": "text",
      "runs": [
       "At this point it may be important for you to recoup your losses some by firing the combines with a ",
       {
        "link": "High Quality Firing Sheet",
        "text": "High Quality Firing Sheet"
       },
       ". These will also be useful to you if you plan on ",
       {
        "link": "Poison Making",
        "text": "Poison Making"
       },
       " or getting ",
       {
        "link": "Tailoring",
        "text": "Tailoring"
       },
       " above 131."
      ]
     },
     {
      "kind": "table",
      "header": [
       "Sketch",
       "Clay",
       "Water",
       "Other"
      ],
      "rows": [
       [
        [
         {
          "link": "Unfired Poison Vial",
          "text": "Unfired Poison Vial"
         }
        ],
        [
         {
          "link": "Vial Sketch",
          "text": "Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin/Brew"
        ],
        [
         "148"
        ]
       ],
       [
        [
         {
          "link": "Unfired Lined Poison Vial",
          "text": "Unfired Lined Poison Vial"
         }
        ],
        [
         {
          "link": "Lined Vial Sketch",
          "text": "Lined Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin/Brew"
        ],
        [
         "168"
        ]
       ],
       [
        [
         {
          "link": "Unfired Sealed Poison Vial",
          "text": "Unfired Sealed Poison Vial"
         }
        ],
        [
         {
          "link": "Sealed Vial Sketch",
          "text": "Sealed Vial Sketch"
         }
        ],
        [
         {
          "link": "Small Block of Clay",
          "text": "Small Block of Clay"
         }
        ],
        [
         {
          "link": "Water Flask",
          "text": "Water Flask"
         }
        ],
        [
         "Pelt/Skin/Brew"
        ],
        [
         "188"
        ]
       ]
      ]
     },
     {
      "kind": "heading",
      "level": 1,
      "text": "Step 3 Deity Idols",
      "anchor": "Step_3_Deity_Idols"
     },
     {
      "kind": "text",
      "runs": [
       "Firstly find yourself some ",
       {
        "link": "Sculpting Tools",
        "text": "Sculpting Tools"
       },
       " sold by most pottery vendors."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Enchanter Step Take any ",
       {
        "link": "Poison Vial",
        "text": "Poison Vials"
       },
       " you have saved and an equal amount of ",
       {
        "link": "Emerald",
        "text": "Emeralds"
       },
       " to an enchanter to create ",
       {
        "link": "Vial of Clear Mana",
        "text": "Vial of Clear Manas"
       },
       ". While you have the enchanter you may also wish to have them create an equal amount of ",
       {
        "link": "Large Block of Magic Clay",
        "text": "Magic Clay"
       },
       "."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Imbuer Step The last thing you will need is to choose an Imbued Gem, ",
       {
        "link": "Imbued Amber",
        "text": "Imbued Amber"
       },
       " for ",
       {
        "link": "Cazic Thule",
        "text": "Cazic Thule"
       },
       " is the least expensive option. Once you settle on the gem/deity you will need to find a 29+ Cleric/Druid/Shaman/Wizard that worships that deity to imbue the gem."
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Unfired Step Combine the Imbued Gem, ",
       {
        "link": "Large Block of Magic Clay",
        "text": "Large Block of Magic Clay"
       },
       ", ",
       {
        "link": "Vial of Clear Mana",
        "text": "Vial of Clear Mana"
       },
       ", ",
       {
        "link": "Idol Sketch",
        "text": "Idol Sketch"
       },
       ", ",
       {
        "link": "Sculpting Tools",
        "text": "Sculpting Tools"
       },
       " on a ",
       {
        "link": "Pottery Wheel",
        "text": "Pottery Wheel"
       },
       " (Trivial 255)."
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Note: On EQ Legends, creating an Unfired Idol (Tunare) trivial is 282. This is the only unfired idol I have tested this on, though. I also have not tested to see what firing trivial is."
        ]
       }
      ]
     },
     {
      "kind": "text",
      "runs": [
       "Firing // Rogue Step If you decide to fire your idols you will need a rogue to craft up some ",
       {
        "link": "White Lead",
        "text": "White Lead"
       },
       " so that you can make ",
       {
        "link": "Divine Crystalline Glaze",
        "text": "Divine Crystalline Glaze"
       },
       ". The Glaze is made with ",
       {
        "link": "White Lead",
        "text": "White Lead"
       },
       ", ",
       {
        "link": "Iron Oxide",
        "text": "Iron Oxide"
       },
       ", ",
       {
        "link": "Permafrost Crystals",
        "text": "Permafrost Crystals"
       },
       ", ",
       {
        "link": "Water Flask",
        "text": "Water Flask"
       },
       " in a ",
       {
        "link": "Glaze Mortar",
        "text": "Glaze Mortar"
       },
       ". Lastly combine the ",
       {
        "link": "Unfired Idol",
        "text": "Unfired Idol"
       },
       ", ",
       {
        "link": "High Quality Firing Sheet",
        "text": "High Quality Firing Sheet"
       },
       ", ",
       {
        "link": "Divine Crystalline Glaze",
        "text": "Divine Crystalline Glaze"
       },
       " in a ",
       {
        "link": "Kiln",
        "text": "Kiln"
       },
       " (Trivial 242 to 248)"
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Tailoring",
  "title": "Skill Tailoring",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Leveling Guide",
    "anchor": "Leveling_Guide",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "table",
      "header": [
       "Range",
       "Trivial",
       "Item",
       "Ingredients",
       "Combine in",
       "Era"
      ],
      "rows": [
       [
        [
         "1-15"
        ],
        [
         "15"
        ],
        [
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         }
        ],
        [
         "2x ",
         {
          "link": "Spider Silk",
          "text": "Spider Silk"
         }
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "15-26"
        ],
        [
         "26"
        ],
        [
         {
          "link": "Patchwork Boots",
          "text": "Patchwork Boots"
         }
        ],
        [
         {
          "link": "Boot Pattern",
          "text": "Boot Pattern"
         },
         ", Ruined ",
         {
          "link": "Ruined Bear Pelt",
          "text": "Bear"
         },
         " or ",
         {
          "link": "Ruined Wolf Pelt",
          "text": "Wolf"
         },
         " or ",
         {
          "link": "Ruined Cat Pelt",
          "text": "Cat"
         },
         " Pelts"
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "26-36"
        ],
        [
         "36"
        ],
        [
         {
          "link": "Raw Silk Headband",
          "text": "Raw Silk Headband"
         }
        ],
        [
         {
          "link": "Cap Pattern",
          "text": "Cap Pattern"
         },
         ", ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         },
         ", ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "51-82"
        ],
        [
         "82"
        ],
        [
         {
          "link": "Cured Silk Mask",
          "text": "Cured Silk Mask"
         }
        ],
        [
         {
          "link": "Mask Pattern",
          "text": "Mask Pattern"
         },
         ", ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         },
         ", ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "82-88"
        ],
        [
         "88"
        ],
        [
         {
          "link": "Hand Made Backpack",
          "text": "Hand Made Backpack"
         }
        ],
        [
         {
          "link": "Backpack Pattern",
          "text": "Backpack Pattern"
         },
         ", ",
         {
          "link": "High Quality Bear Skin",
          "text": "High Quality Bear Skin"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         },
         ", ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "88-108"
        ],
        [
         "108"
        ],
        [
         {
          "link": "Reinforced Armor",
          "text": "Reinforced Armor"
         }
        ],
        [
         "(Small) ",
         {
          "link": "High Quality Wolf Skin",
          "text": "High Quality Wolf Skin"
         },
         ", (Medium) ",
         {
          "link": "High Quality Cat Pelt",
          "text": "High Quality Cat Pelt"
         },
         ", (Large) ",
         {
          "link": "High Quality Bear Skin",
          "text": "High Quality Bear Skin"
         },
         ", 1-4x ",
         {
          "link": "Steel Boning",
          "text": "Steel Boning"
         },
         ", 1x * Pattern"
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         },
         ", ",
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         },
         ", ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "108-115"
        ],
        [
         "115"
        ],
        [
         {
          "link": "Tailored Quiver",
          "text": "Tailored Quiver"
         }
        ],
        [
         {
          "link": "High Quality Cat Pelt",
          "text": "High Quality Cat Pelt"
         },
         ", ",
         {
          "link": "Quiver Pattern",
          "text": "Quiver Pattern"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "131-135"
        ],
        [
         "135"
        ],
        [
         {
          "link": "Wu's Fighting Wristbands",
          "text": "Wu's Fighting Wristbands"
         }
        ],
        [
         {
          "link": "Wristband Pattern",
          "text": "Wristband Pattern"
         },
         ", 4x ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Vial of Viscous Mana",
          "text": "Vial of Viscous Mana"
         }
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "135-142"
        ],
        [
         "142"
        ],
        [
         {
          "link": "Wu's Fighting Cap",
          "text": "Wu's Fighting Cap"
         }
        ],
        [
         {
          "link": "Cap Pattern",
          "text": "Cap Pattern"
         },
         ", 4x ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Vial of Viscous Mana",
          "text": "Vial of Viscous Mana"
         }
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "142-151"
        ],
        [
         "151"
        ],
        [
         {
          "link": "Wu's Fighting Sleeves",
          "text": "Wu's Fighting Sleeves"
         }
        ],
        [
         {
          "link": "Sleeve Pattern",
          "text": "Sleeve Pattern"
         },
         ", 4x ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", 2x ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Vial of Viscous Mana",
          "text": "Vial of Viscous Mana"
         }
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "151-155"
        ],
        [
         "155"
        ],
        [
         {
          "link": "Wu's Fighting Pantaloons",
          "text": "Wu's Fighting Pantaloons"
         }
        ],
        [
         {
          "link": "Pant Pattern",
          "text": "Pant Pattern"
         },
         ", 4x ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", 3x ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Vial of Viscous Mana",
          "text": "Vial of Viscous Mana"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "155-158"
        ],
        [
         "158"
        ],
        [
         {
          "link": "Wu's Fighting Shirt",
          "text": "Wu's Fighting Shirt"
         }
        ],
        [
         {
          "link": "Tunic Pattern",
          "text": "Tunic Pattern"
         },
         ", 4x ",
         {
          "link": "Heady Kiola",
          "text": "Heady Kiola"
         },
         ", 3x ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Vial of Viscous Mana",
          "text": "Vial of Viscous Mana"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "158-190"
        ],
        [
         "190"
        ],
        [
         {
          "link": "Forest Green Silk Swatch",
          "text": "Forest Green Silk Swatch"
         }
        ],
        [
         "2x ",
         {
          "link": "Silk Thread",
          "text": "Silk Thread"
         },
         ", 2x ",
         {
          "link": "Silk Swatch",
          "text": "Silk Swatch"
         },
         ", ",
         {
          "link": "Dark Green Dye",
          "text": "Dark Green Dye"
         }
        ],
        [
         {
          "link": "Sewing Kit",
          "text": "Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "162"
        ],
        [
         "-"
        ],
        [
         "Recommended level for ",
         {
          "link": "Coldain Prayer Shawl",
          "text": "Coldain Prayer Shawl"
         },
         " (and stopping point for many tailors)"
        ]
       ],
       [
        [
         "190-222"
        ],
        [
         "222"
        ],
        [
         {
          "link": "Fleeting Quiver",
          "text": "Fleeting Quiver"
         }
        ],
        [
         {
          "link": "Fleeting Quiver Pattern",
          "text": "Fleeting Quiver Pattern"
         },
         ", ",
         {
          "link": "Aviak Egg Oil",
          "text": "Aviak Egg Oil"
         },
         ", ",
         {
          "link": "Griffon Feathers",
          "text": "Griffon Feathers"
         },
         ", ",
         {
          "link": "High Quality Lion Skin",
          "text": "High Quality Lion Skin"
         },
         ", ",
         {
          "link": "Vial of Distilled Mana",
          "text": "Vial of Distilled Mana"
         }
        ],
        [
         {
          "link": "Loom",
          "text": "Loom"
         },
         ", ",
         {
          "link": "Large Sewing Kit",
          "text": "Large Sewing Kit"
         }
        ],
        [
         {
          "era": "classic"
         }
        ]
       ],
       [
        [
         "190-215"
        ],
        [
         "215"
        ],
        [
         "Wood Elfs Only ",
         {
          "link": "Mithril Reinforced Mask",
          "text": "Mithril Reinforced Mask"
         }
        ],
        [
         {
          "link": "Mask Pattern",
          "text": "Mask Pattern"
         },
         ", ",
         {
          "link": "Excellent Sabertooth Tiger Hide",
          "text": "Excellent Sabertooth Tiger Hide"
         },
         ", ",
         {
          "link": "Mithril Boning",
          "text": "Mithril Boning"
         },
         ", ",
         {
          "link": "Oak Bark Tannin",
          "text": "Oak Bark Tannin"
         }
        ],
        [
         {
          "link": "Feir'Dal Sewing Kit",
          "text": "Feir'Dal Sewing Kit"
         }
        ],
        [
         {
          "era": "unknown"
         }
        ]
       ],
       [
        [
         "190-215"
        ],
        [
         "215"
        ],
        [
         "Halfling Only ",
         {
          "link": "Vale Reinforced Mask",
          "text": "Vale Reinforced Mask"
         }
        ],
        [
         {
          "link": "Mask Pattern",
          "text": "Mask Pattern"
         },
         ", ",
         {
          "link": "Acorn Oil",
          "text": "Acorn Oil"
         },
         ", ",
         {
          "link": "High Quality Brute Hide",
          "text": "High Quality Brute Hide"
         },
         ", ",
         {
          "link": "Steel Boning",
          "text": "Steel Boning"
         }
        ],
        [
         {
          "link": "Vale Sewing Kit",
          "text": "Vale Sewing Kit"
         }
        ],
        [
         {
          "era": "unknown"
         }
        ]
       ],
       [
        [
         "215-228"
        ],
        [
         "228"
        ],
        [
         "Wood Elfs Only ",
         {
          "link": "Imbued Mithril Reinforced Mask",
          "text": "Imbued Mithril Reinforced Mask"
         }
        ],
        [
         {
          "link": "Mask Pattern",
          "text": "Mask Pattern"
         },
         ", ",
         {
          "link": "Excellent Sabertooth Tiger Hide",
          "text": "Excellent Sabertooth Tiger Hide"
         },
         ", ",
         {
          "link": "Mithril Boning",
          "text": "Mithril Boning"
         },
         ", ",
         {
          "link": "Oak Bark Tannin",
          "text": "Oak Bark Tannin"
         },
         ", ",
         {
          "link": "Imbued Emerald",
          "text": "Imbued Emerald"
         }
        ],
        [
         {
          "link": "Feir'Dal Sewing Kit",
          "text": "Feir'Dal Sewing Kit"
         }
        ],
        [
         {
          "era": "unknown"
         }
        ]
       ],
       [
        [
         "215-228"
        ],
        [
         "228"
        ],
        [
         "Halfling Only ",
         {
          "link": "Imbued Vale Reinforced Mask",
          "text": "Imbued Vale Reinforced Mask"
         }
        ],
        [
         {
          "link": "Mask Pattern",
          "text": "Mask Pattern"
         },
         ", ",
         {
          "link": "Acorn Oil",
          "text": "Acorn Oil"
         },
         ", ",
         {
          "link": "High Quality Brute Hide",
          "text": "High Quality Brute Hide"
         },
         ", ",
         {
          "link": "Steel Boning",
          "text": "Steel Boning"
         },
         ", ",
         {
          "link": "Imbued Plains Pebble",
          "text": "Imbued Plains Pebble"
         }
        ],
        [
         {
          "link": "Vale Sewing Kit",
          "text": "Vale Sewing Kit"
         }
        ],
        [
         {
          "era": "unknown"
         }
        ]
       ]
      ],
      "skill": [
       {
        "from": 1,
        "to": 15
       },
       {
        "from": 15,
        "to": 26
       },
       {
        "from": 26,
        "to": 36
       },
       {
        "from": 51,
        "to": 82
       },
       {
        "from": 82,
        "to": 88
       },
       {
        "from": 88,
        "to": 108
       },
       {
        "from": 108,
        "to": 115
       },
       {
        "from": 131,
        "to": 135
       },
       {
        "from": 135,
        "to": 142
       },
       {
        "from": 142,
        "to": 151
       },
       {
        "from": 151,
        "to": 155
       },
       {
        "from": 155,
        "to": 158
       },
       {
        "from": 158,
        "to": 190
       },
       null,
       {
        "from": 190,
        "to": 222
       },
       {
        "from": 190,
        "to": 215
       },
       {
        "from": 190,
        "to": 215
       },
       {
        "from": 215,
        "to": 228
       },
       {
        "from": 215,
        "to": 228
       }
      ],
      "needs": [
       [
        {
         "name": "Spider Silk",
         "qty": 2
        }
       ],
       [
        {
         "name": "Boot Pattern",
         "qty": 1
        },
        {
         "name": "Ruined Bear Pelt",
         "qty": 1
        },
        {
         "name": "Ruined Wolf Pelt",
         "qty": 1
        },
        {
         "name": "Ruined Cat Pelt",
         "qty": 1
        }
       ],
       [
        {
         "name": "Cap Pattern",
         "qty": 1
        },
        {
         "name": "Silk Swatch",
         "qty": 1
        }
       ],
       [
        {
         "name": "Mask Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 1
        },
        {
         "name": "Silk Swatch",
         "qty": 1
        }
       ],
       [
        {
         "name": "Backpack Pattern",
         "qty": 1
        },
        {
         "name": "High Quality Bear Skin",
         "qty": 1
        }
       ],
       [
        {
         "name": "High Quality Wolf Skin",
         "qty": 1
        },
        {
         "name": "High Quality Cat Pelt",
         "qty": 1
        },
        {
         "name": "High Quality Bear Skin",
         "qty": 1
        },
        {
         "name": "Steel Boning",
         "qty": 1
        }
       ],
       [
        {
         "name": "High Quality Cat Pelt",
         "qty": 1
        },
        {
         "name": "Quiver Pattern",
         "qty": 1
        }
       ],
       [
        {
         "name": "Wristband Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 4
        },
        {
         "name": "Silk Swatch",
         "qty": 1
        },
        {
         "name": "Vial of Viscous Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Cap Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 4
        },
        {
         "name": "Silk Swatch",
         "qty": 1
        },
        {
         "name": "Vial of Viscous Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Sleeve Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 4
        },
        {
         "name": "Silk Swatch",
         "qty": 2
        },
        {
         "name": "Vial of Viscous Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Pant Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 4
        },
        {
         "name": "Silk Swatch",
         "qty": 3
        },
        {
         "name": "Vial of Viscous Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Tunic Pattern",
         "qty": 1
        },
        {
         "name": "Heady Kiola",
         "qty": 4
        },
        {
         "name": "Silk Swatch",
         "qty": 3
        },
        {
         "name": "Vial of Viscous Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Silk Thread",
         "qty": 2
        },
        {
         "name": "Silk Swatch",
         "qty": 2
        },
        {
         "name": "Dark Green Dye",
         "qty": 1
        }
       ],
       [],
       [
        {
         "name": "Fleeting Quiver Pattern",
         "qty": 1
        },
        {
         "name": "Aviak Egg Oil",
         "qty": 1
        },
        {
         "name": "Griffon Feathers",
         "qty": 1
        },
        {
         "name": "High Quality Lion Skin",
         "qty": 1
        },
        {
         "name": "Vial of Distilled Mana",
         "qty": 1
        }
       ],
       [
        {
         "name": "Mask Pattern",
         "qty": 1
        },
        {
         "name": "Excellent Sabertooth Tiger Hide",
         "qty": 1
        },
        {
         "name": "Mithril Boning",
         "qty": 1
        },
        {
         "name": "Oak Bark Tannin",
         "qty": 1
        }
       ],
       [
        {
         "name": "Mask Pattern",
         "qty": 1
        },
        {
         "name": "Acorn Oil",
         "qty": 1
        },
        {
         "name": "High Quality Brute Hide",
         "qty": 1
        },
        {
         "name": "Steel Boning",
         "qty": 1
        }
       ],
       [
        {
         "name": "Mask Pattern",
         "qty": 1
        },
        {
         "name": "Excellent Sabertooth Tiger Hide",
         "qty": 1
        },
        {
         "name": "Mithril Boning",
         "qty": 1
        },
        {
         "name": "Oak Bark Tannin",
         "qty": 1
        },
        {
         "name": "Imbued Emerald",
         "qty": 1
        }
       ],
       [
        {
         "name": "Mask Pattern",
         "qty": 1
        },
        {
         "name": "Acorn Oil",
         "qty": 1
        },
        {
         "name": "High Quality Brute Hide",
         "qty": 1
        },
        {
         "name": "Steel Boning",
         "qty": 1
        },
        {
         "name": "Imbued Plains Pebble",
         "qty": 1
        }
       ]
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Tinkering",
  "title": "Skill Tinkering",
  "kind": "skill",
  "eras": [],
  "guides": [
   {
    "name": "Raising Tinkering Skill",
    "anchor": "Raising_Tinkering_Skill",
    "blocks": [
     {
      "kind": "text",
      "runs": [
       "Intelligence or Wisdom, whichever is higher governs your chance to gain skill increases."
      ],
      "strong": true
     },
     {
      "kind": "text",
      "runs": [
       "A good progression of items to make to raise your skill. Remember you start at 50!"
      ]
     },
     {
      "kind": "list",
      "items": [
       {
        "runs": [
         "Flameless Lantern to 68"
        ],
        "skill": {
         "from": 50,
         "to": 68
        },
        "makes": [
         "Flameless Lantern"
        ],
        "needs": [
         {
          "name": "Large Lantern",
          "qty": 1
         },
         {
          "name": "Metal Twine",
          "qty": 1
         },
         {
          "name": "Firewater",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 2000,
         "how": "recipe",
         "source": "Skill Tinkering"
        }
       },
       {
        "runs": [
         "Stalking Probes to 102"
        ],
        "skill": {
         "from": 68,
         "to": 102
        },
        "makes": [
         "Stalking Probe"
        ],
        "needs": [
         {
          "name": "Bottle",
          "qty": 1
         },
         {
          "name": "Firewater",
          "qty": 1
         },
         {
          "name": "Gears",
          "qty": 2
         },
         {
          "name": "Metal Rod",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 15000,
         "how": "recipe",
         "source": "Skill Tinkering"
        }
       },
       {
        "runs": [
         "Power Gloves to 122"
        ],
        "skill": {
         "from": 102,
         "to": 122
        }
       },
       {
        "runs": [
         "Aqualung to 148"
        ],
        "skill": {
         "from": 122,
         "to": 148
        },
        "makes": [
         "Aqualung"
        ],
        "needs": [
         {
          "name": "Fine Coral Mesh",
          "qty": 1
         },
         {
          "name": "Fresh Fish",
          "qty": 1
         },
         {
          "name": "Gnomish Bolts",
          "qty": 1
         },
         {
          "name": "Metal Rod",
          "qty": 1
         },
         {
          "name": "Metal Twine",
          "qty": 1
         },
         {
          "name": "Silk Lined Steel Helm",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 240000,
         "how": "recipe",
         "source": "Skill Tinkering"
        }
       },
       {
        "runs": [
         "Rebreathers to 175"
        ],
        "skill": {
         "from": 148,
         "to": 175
        },
        "makes": [
         "Rebreather"
        ],
        "needs": [
         {
          "name": "Aqualung",
          "qty": 1
         },
         {
          "name": "Firewater",
          "qty": 1
         },
         {
          "name": "Lime Coated Meshing",
          "qty": 1
         },
         {
          "name": "Metal Fastening",
          "qty": 1
         },
         {
          "name": "Platemail Helm",
          "qty": 1
         },
         {
          "name": "Sharkskin Tubing",
          "qty": 1
         }
        ],
        "cost": {
         "copper": 950000,
         "how": "recipe",
         "source": "Skill Tinkering"
        }
       },
       {
        "runs": [
         "Nantik's Anti-Gravity Unit to 202"
        ],
        "skill": {
         "from": 175,
         "to": 202
        },
        "makes": [
         "Nantik's Anti-Gravity Unit"
        ],
        "needs": [
         {
          "name": "Sheet Metal",
          "qty": 1
         },
         {
          "name": "Metal Rod",
          "qty": 1
         },
         {
          "name": "Static Orb",
          "qty": 1
         },
         {
          "name": "Metal Fastening",
          "qty": 1
         },
         {
          "name": "Large Black Lodestone",
          "qty": 2
         }
        ],
        "cost": {
         "copper": 360000,
         "how": "recipe",
         "source": "Skill Tinkering"
        }
       },
       {
        "runs": [
         "Footwarming Boots to 235 (will require smithing ",
         {
          "link": "Small Fine Plate Boots",
          "text": "Small Fine Plate Boots"
         },
         ")"
        ],
        "skill": {
         "from": 202,
         "to": 235
        },
        "needs": [
         {
          "name": "Leather Padding",
          "qty": 1
         },
         {
          "name": "Medium Quality Folded Sheet Metal",
          "qty": 2
         },
         {
          "name": "Small Plate Boot Mold",
          "qty": 1
         },
         {
          "name": "Smithy Hammer",
          "qty": 1
         },
         {
          "name": "Water Flask",
          "qty": 1
         }
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "name": "Tradeskill Equipment",
  "title": "Tradeskill Equipment",
  "kind": "reference",
  "eras": [],
  "guides": []
 }
];
