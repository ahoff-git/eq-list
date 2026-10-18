/**
 * Tradeskills and their leveling guides — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-tradeskills.mjs`, which reads every page in eqlwiki's
 * `Category:Tradeskills` (scraped 2026-10-17T23:17:46.939Z). Shipped rather than fetched at runtime — see the
 * script's header and
 * [ADR 0302](../../../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md).
 *
 * Facts only: which era each page and each linked item belongs to, and which eras the wiki had open
 * on the day this was scraped. Whether a line is out of era *now* is `tradeskill-era.ts`'s call.
 */

import type { Tradeskill, VendorSpot, WikiPrice } from "./tradeskill-types";

export const TRADESKILLS_SOURCE = { category: "Tradeskills", scrapedAt: "2026-10-17T23:17:46.939Z" };

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

/**
 * Who sells each material and where they stand, from the item pages' merchant tables — one line per
 * material. `zone` is the zone as shown ("East Cabilis"), `zonePage` the wiki page it links to when
 * that differs, `y`/`x` the merchant's location when the wiki gives one.
 */
export const VENDORS: Readonly<Record<string, readonly VendorSpot[]>> = {
  "Amber": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tika Shockstep","y":917,"x":721},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"North Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"South Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Zasrin Blueflame","y":148,"x":-763},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"The Overthere","merchant":"Finlay Kitoran","y":2769,"x":2365},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719}],
  "Arnworth": [{"zone":"Ak'Anon","merchant":"A Clockwork Alchemist","y":890,"x":-301},{"zone":"Everfrost Peaks","merchant":"Guri","y":2894,"x":-3396},{"zone":"Grobb","merchant":"Raztara","y":441,"x":-392},{"zone":"Halas","merchant":"Murtog MacYee","y":124,"x":-364},{"zone":"Innothule Swamp","merchant":"Clork","y":1165,"x":549},{"zone":"Rivervale","merchant":"Kizzie Mintopp","y":-229,"x":-217},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Backpack Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Alga Bruntbuckler","y":-1185,"x":-1957},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Stitch","y":128,"x":-9},{"zone":"Erudin","merchant":"Gayle Weaven","y":245,"x":88},{"zone":"Everfrost Peaks","merchant":"Seria O`Danos","y":3608,"x":701},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Firiona Vie","merchant":"Dionin Needlespin","y":-3642,"x":1985},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"Greater Faydark","merchant":"Merchant Gaeadin","y":-114,"x":-131},{"zone":"Highpass Hold","merchant":"Dyona Rossook","y":-248,"x":135},{"zone":"Misty Thicket","merchant":"Tipa Lighten","y":581,"x":-2202},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Hutyn L`Lozz","y":747,"x":-1293},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3465,"x":489},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Western Plains of Karana","merchant":"Alysa","y":431,"x":-4364},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Iala Lenard","y":177,"x":-148},{"zone":"Steamfont Mountains","merchant":"Freed Fimplefur","y":-1696,"x":829},{"zone":"Thurgadin","merchant":"Rexx Frostweaver","y":-272,"x":133}],
  "Barley": [{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"Butcherblock Mountains","merchant":"Inudul Dumirgun","y":2837,"x":-682},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Brewer Prixal","y":678,"x":-26},{"zone":"Firiona Vie","merchant":"Frothy","y":-2979,"x":2973},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"High Keep","merchant":"a clerk","y":-77,"x":-187},{"zone":"High Keep","merchant":"a dealer","y":-70,"x":-355},{"zone":"High Keep","merchant":"a dealer","y":-101,"x":-326},{"zone":"Highpass Hold","merchant":"a dealer","y":426,"x":-260},{"zone":"Highpass Hold","merchant":"a dealer","y":340,"x":-244},{"zone":"Highpass Hold","merchant":"Lyn Tarburner","y":-146,"x":493},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Heidi Grainsifter","y":-169,"x":-278},{"zone":"Thurgadin","merchant":"Tobart Dirkins","y":-332,"x":-9},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":120,"x":-406},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9}],
  "Bat Wing": [{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Jeliala Glimmercharm","area":"Top floor of the Enchanter guild","y":507,"x":765},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tika Shockstep","y":917,"x":721},{"zone":"Field of Bone","merchant":"Klok Acet","y":-2463,"x":2984},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lindie Rains","y":-39,"x":12},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysa Truegreen","y":117,"x":-719},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Zasrin Blueflame","y":148,"x":-763},{"zone":"Kael Drakkel","merchant":"Ymik","y":-1740,"x":1932},{"zone":"Kithicor Forest","merchant":"Jeena Firechaser","y":-216,"x":3813},{"zone":"Oggok","merchant":"Hrak","y":821,"x":849},{"zone":"Warsliks Woods","merchant":"Klok Gragin","y":-1651,"x":-707},{"zone":"Warsliks Woods","merchant":"Klok Rogalin","y":-1882,"x":-600}],
  "Belt Sectional Mold": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Issilyn Ristan","y":72,"x":-214},{"zone":"Toxxulia Forest","merchant":"Win Karnam","y":2247,"x":979},{"zone":"New Sebilis Expedition","merchant":"Klok Rento","y":297,"x":-101},{"zone":"Qeynos Hills","merchant":"Marton Sayer","y":1381,"x":278},{"zone":"Greater Faydark","merchant":"Merchant Linolyen","y":110,"x":345},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Nalgoz","y":239,"x":-290}],
  "Birthwort": [{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Grobb","merchant":"Blergagg","y":417,"x":-427},{"zone":"Halas","merchant":"Dargon","y":354,"x":356},{"zone":"South Qeynos","merchant":"Caleah Herblender","y":323,"x":-560},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"Oggok","merchant":"Pordopa","y":287,"x":-389},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Block of Clay": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Kyrin Steelbone","y":-21,"x":470},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-116},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","y":103,"x":-422},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Tentus Brackmar","y":995,"x":810},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Rivervale","merchant":"Bodbin Gimple","y":-80,"x":-370},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Blue Vervain Bulb": [{"zone":"Everfrost Peaks","merchant":"Guri","y":2894,"x":-3396},{"zone":"Grobb","merchant":"Blergagg","y":414,"x":-429},{"zone":"Halas","merchant":"Dargon","y":354,"x":356},{"zone":"Innothule Swamp","merchant":"Clork","y":1165,"x":549},{"zone":"Oggok","merchant":"Garakbar","y":287,"x":-389},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Greyscale","y":389,"x":525},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Boot Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":954,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":977,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Fugan Mumfur","y":-1500,"x":2876},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Demicla Tanner","y":-689,"x":-101},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Felwithe","merchant":"Merchant Tissan","y":-122,"x":-359},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sissin Tanner","y":44,"x":-550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sanhan Tanner","y":72,"x":-568},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winlar Tanner","y":38,"x":-561},{"zone":"Greater Faydark","merchant":"Merchant Aluwenae","y":-336,"x":-116},{"zone":"Grobb","merchant":"Bimuk","y":517,"x":-221},{"zone":"Grobb","merchant":"Jarlok","y":390,"x":-301},{"zone":"Halas","merchant":"Cindl","y":270,"x":-171},{"zone":"Misty Thicket","merchant":"Sonsa Fromp","y":672,"x":-2211},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Jarvah","y":-222,"x":-366},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Medron Y`Lask","y":769,"x":-1310},{"zone":"Oggok","merchant":"Juk Hidebeater","y":368,"x":-202},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fhara Semhart","y":399,"x":-80},{"zone":"Rathe Mountains","merchant":"Chizzlik","y":1719,"x":1310},{"zone":"Rivervale","merchant":"Twippie Diggs","y":-116,"x":-211},{"zone":"Thurgadin","merchant":"Mauren Frostbeard","y":-146,"x":218},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Bottle": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1265,"x":-777},{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":484,"x":-115},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1242,"x":-775},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1284,"x":-915},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1328,"x":-778},{"zone":"Butcherblock Mountains","merchant":"Gamin Griststone","y":2718,"x":-941},{"zone":"Butcherblock Mountains","merchant":"Parn Gylwyn","y":1465,"x":2817},{"zone":"Butcherblock Mountains","merchant":"Felen Razdal","y":129,"x":2383},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Vednir","y":58,"x":-8},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Poklon","y":913,"x":-85},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"Cobalt Scar","merchant":"Blumblum Swigwater","y":237,"x":-1485},{"zone":"West Commonlands","merchant":"Innkeep Seke","y":-104,"x":465},{"zone":"West Commonlands","merchant":"Ruby Boxcrafter","y":-213,"x":591},{"zone":"West Commonlands","merchant":"Innkeep Redthorn","y":-401,"x":2763},{"zone":"Crystal Caverns","merchant":"Milliace Gemshard","y":-263,"x":233},{"zone":"Crystal Caverns","merchant":"Grabble Coldheart","y":-261,"x":165},{"zone":"Eastern Plains of Karana","merchant":"Bradly","y":-856,"x":-99},{"zone":"Eastern Plains of Karana","merchant":"Stace","y":1227,"x":-2645},{"zone":"Eastern Plains of Karana","merchant":"Sorn","y":1198,"x":-2634},{"zone":"Eastern Plains of Karana","merchant":"Tanrak","y":1529,"x":-2677},{"zone":"East Commonlands","merchant":"Innkeep Leo","y":-319,"x":2977},{"zone":"East Commonlands","merchant":"Innkeep Elora","y":-184,"x":71},{"zone":"East Commonlands","merchant":"Germe Threadspinner","y":1021,"x":3635},{"zone":"East Commonlands","merchant":"Innkeep Fenia","y":1021,"x":3731},{"zone":"East Commonlands","merchant":"Innkeep Calen","y":315,"x":4890},{"zone":"Erudin","merchant":"Nerth Sailwind","y":232,"x":96},{"zone":"Erudin","merchant":"Luren Renthalis","y":-1156,"x":-61},{"zone":"Erudin","merchant":"Teria Finleather","y":-956,"x":-98},{"zone":"Erudin","merchant":"Borge Finleather","y":-994,"x":-78},{"zone":"Erudin","merchant":"Reihan Wilhemson","y":-906,"x":-88},{"zone":"Erudin","merchant":"Kisrin Breezeshadow","y":230,"x":-5},{"zone":"Erudin","merchant":"Reko Saltamer","y":207,"x":-5},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Vall Stonewisp","y":590,"x":832},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tan Monosty","y":667,"x":829},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Judge Monosty","y":689,"x":829},{"zone":"Felwithe","merchant":"Rolyn Longwalker","y":4,"x":-384},{"zone":"Felwithe","merchant":"Merchant Issynal","y":147,"x":-412},{"zone":"Felwithe","merchant":"Merchant Sorintal","y":136,"x":-415},{"zone":"Firiona Vie","merchant":"Broawn Goshart","y":-3863,"x":1673},{"zone":"Firiona Vie","merchant":"Dom Pathfinder","y":-2818,"x":2686},{"zone":"Firiona Vie","merchant":"Samson","y":-2952,"x":2977},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ralfson Gerositan","y":-384,"x":-648},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lynda Tapper","y":-296,"x":-213},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Jaleel Hoglomp","y":44,"x":-746},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Slan ODonner","y":76,"x":-335},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Cloud Alemaker","y":116,"x":-267},{"zone":"East Freeport","zonePage":"Freeport","merchant":"River Alemaker","y":127,"x":-270},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sun Alemaker","y":127,"x":-254},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gibbon Morfield","y":287,"x":284},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Yellus Gravien","y":301,"x":273},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Lyna","y":-103,"x":191},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Tulan","y":-131,"x":209},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Galio","y":-187,"x":-41},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Bran Greenglade","y":-109,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Alec Greenglade","y":-94,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Judicla Riverfield","y":70,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Shania Tassel","y":85,"x":-34},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Drona Whystlethin","y":-120,"x":-473},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Swin Blackeye","area":"In the Hogcaller's Inn","y":-158,"x":-527},{"zone":"Greater Faydark","merchant":"Merchant Aildien","y":-496,"x":-133},{"zone":"Greater Faydark","merchant":"Merchant Aluuvila","y":-94,"x":224},{"zone":"Greater Faydark","merchant":"Merchant Tilluen","y":-85,"x":271},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Greater Faydark","merchant":"Merchant Aianya","y":251,"x":614},{"zone":"Greater Faydark","merchant":"Merchant Iludarae","y":-29,"x":-149},{"zone":"Greater Faydark","merchant":"Merchant Kwein","y":155,"x":334},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Grobb","merchant":"Graktak","y":50,"x":-396},{"zone":"Grobb","merchant":"Ootok","y":233,"x":-31},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Halas","merchant":"Dok","y":212,"x":275},{"zone":"Halas","merchant":"Greta Terrilon","y":280,"x":-327},{"zone":"Halas","merchant":"Rose McDowell","y":397,"x":165},{"zone":"Halas","merchant":"Leopok Terrilon","y":205,"x":151},{"zone":"Highpass Keep","merchant":"Merchant Dominik","y":37,"x":31},{"zone":"Highpass Keep","merchant":"Dealer Shonta","y":-54,"x":-324},{"zone":"Highpass Hold","merchant":"Paulina","y":-234,"x":9},{"zone":"Highpass Hold","merchant":"Maigin Greyeagle","y":179,"x":483},{"zone":"Highpass Hold","merchant":"Bartender","y":395,"x":-184},{"zone":"Highpass Hold","merchant":"Sernn Rossook","y":-218,"x":154},{"zone":"Highpass Hold","merchant":"Bartender","y":403,"x":-165},{"zone":"Highpass Hold","merchant":"Bartholemew","y":-212,"x":11},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Tumpy Irontoe","y":178,"x":313},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Aarina Ratsbone","y":183,"x":-138},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Doramafi Ratsbone","y":710,"x":88},{"zone":"Kerra Island","merchant":"Raarrk","y":108,"x":131},{"zone":"Kithicor Forest","merchant":"Eithne Walker","y":1427,"x":-825},{"zone":"Lake Rathetear","merchant":"Srynda","y":-507,"x":637},{"zone":"Lake Rathetear","merchant":"Turga","y":3126,"x":-1815},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ootok","y":-417,"x":-457},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Smaka","y":-335,"x":-107},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Vala Tanbor","y":210,"x":-215},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"The Gobbler","y":-323,"x":-125},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Damar Nislan","y":177,"x":-196},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Palais Derekor","y":205,"x":-111},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tala Felton","y":136,"x":-98},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Darien Felton","y":136,"x":-93},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tanai Tanbor","y":215,"x":-242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sera Buelle","y":255,"x":-262},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Uawn Betell","y":246,"x":-227},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Yala Thiss","y":242,"x":-265},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Dran `slug` Rembor","y":210,"x":-244},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Slunga","y":-336,"x":-194},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rysva To`Biath","y":11,"x":-848},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Marenkor To`Biath","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":-97,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Lysanda S`Kor","y":40,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Frivsa Punox","y":35,"x":-1238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Svlis C`Luzz","y":-90,"x":-1239},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rista S`lon","y":-152,"x":-1011},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Tenso H`Rugla","y":-153,"x":-1042},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Grazis L`Crit","y":703,"x":-1472},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Katara L`Crit","y":701,"x":-1474},{"zone":"Northern Karana","merchant":"Mrysila","y":-688,"x":-159},{"zone":"Northern Karana","merchant":"Barkeep Milo","y":432,"x":2248},{"zone":"Northern Karana","merchant":"Barkeep Jeny","y":416,"x":2222},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3466,"x":489},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"Oasis of Marr","merchant":"Synthan","y":597,"x":-6},{"zone":"Oggok","merchant":"Angrog","y":-243,"x":-2},{"zone":"Oggok","merchant":"Sinsaal","y":267,"x":677},{"zone":"Oggok","merchant":"Brokk Boxtripper","y":220,"x":378},{"zone":"Oggok","merchant":"Korgarg Swillchugger","y":182,"x":-235},{"zone":"Ocean of Tears","merchant":"Endan Halson","y":-2211,"x":7721},{"zone":"The Overthere","merchant":"Tin Merchant II","y":2694,"x":2583},{"zone":"Paineel","merchant":"Loleluz","y":949,"x":822},{"zone":"Paineel","merchant":"Archenm","y":945,"x":829},{"zone":"Paineel","merchant":"Lolenton","y":950,"x":836},{"zone":"Paineel","merchant":"Gernatis","y":944,"x":848},{"zone":"Paineel","merchant":"Taralani Rahnta","y":934,"x":805},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sunsa Jocub","y":-305,"x":-276},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Bassanio Weekin","y":-40,"x":-219},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"McNeal Jocub","y":-244,"x":-261},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fish Ranamer","y":-292,"x":-269},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Rucio Divella","y":330,"x":-507},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sissy Huntlan","y":231,"x":-129},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Tasya Huntlan","y":259,"x":-69},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Nug Rellash","y":256,"x":-170},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Earron Huntlan","y":254,"x":-191},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fellesha Varshen","y":487,"x":-310},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Raheim Varshen","y":543,"x":-263},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Gahna Salbeen","y":4,"x":-220},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Tanlyn Galliway","y":125,"x":204},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sneed Galliway","y":132,"x":243},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ania Klephia","y":115,"x":359},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sabnie Blagard","y":81,"x":368},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ghil Starn","y":157,"x":195},{"zone":"Rathe Mountains","merchant":"Guzzla","y":1760,"x":1288},{"zone":"Rathe Mountains","merchant":"Roshmael","y":1592,"x":-888},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","area":"The second floor of Fool's Gold","y":-37,"x":-174},{"zone":"Rivervale","merchant":"bag merchant","y":208,"x":-214},{"zone":"Rivervale","merchant":"Wibble Bramblebush","y":6,"x":-329},{"zone":"Rivervale","merchant":"Mac Deeppockets","y":-64,"x":-188},{"zone":"Rivervale","merchant":"Flyndia Deeppockets","y":-49,"x":-207},{"zone":"RunnyEye Citadel","merchant":"A goblin bartender","y":75,"x":90},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Steamfont Mountains","merchant":"Glen Garginburr","y":-1786,"x":337},{"zone":"Thurgadin","merchant":"Loremaster Fronden","y":-395,"x":452},{"zone":"Thurgadin","merchant":"Karey","y":-38,"x":84},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":119,"x":-406},{"zone":"Thurgadin","merchant":"Klarp Bartleby","y":61,"x":-380},{"zone":"Thurgadin","merchant":"Bixx Bartleby","y":45,"x":-380},{"zone":"Thurgadin","merchant":"Adia Coldbeard","y":-57,"x":107},{"zone":"Thurgadin","merchant":"Doogle McBanick","y":-56,"x":-311},{"zone":"Thurgadin","merchant":"Fogerty Bottlenip","y":-311,"x":-27},{"zone":"Thurgadin","merchant":"Agar","y":-72,"x":-379},{"zone":"Thurgadin","merchant":"Durgan Bottlenip","y":-329,"x":-28},{"zone":"Timorous Deep","merchant":"Portik Grolam","y":-11592,"x":-2275},{"zone":"Timorous Deep","merchant":"Seloris Windweaver","y":-4867,"x":-3439},{"zone":"Timorous Deep","merchant":"Micus Vloren","y":-5195,"x":-4335},{"zone":"Toxxulia Forest","merchant":"Stylla Parsini","y":2105,"x":404},{"zone":"Toxxulia Forest","merchant":"Emil Parsini","y":2119,"x":423}],
  "Bowl Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-474},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Breastplate Mold": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Valentin Fireheart","y":54,"x":-167},{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Nerrisia Irontree","y":-88,"x":-395},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Liln Sedder","y":537,"x":-45}],
  "Bundled Bone Arrow Shafts": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Bundled Ceramic Arrow Shafts": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Bundled Wooden Arrow Shafts": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-1971,"x":-8967},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Cap Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":954,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":977,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Fugan Mumfur","y":-1500,"x":2876},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Demicla Tanner","y":-689,"x":-101},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Northern Felwithe","merchant":"Merchant Tissan","y":-122,"x":-359},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sissin Tanner","y":44,"x":-550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sanhan Tanner","y":72,"x":-568},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winlar Tanner","y":38,"x":-561},{"zone":"Greater Faydark","merchant":"Merchant Aluwenae","y":-336,"x":-116},{"zone":"Grobb","merchant":"Jarlok","y":390,"x":-301},{"zone":"Halas","merchant":"Cindl","y":270,"x":-171},{"zone":"Misty Thicket","merchant":"Sonsa Fromp","y":672,"x":-2211},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Jarvah","y":-222,"x":-366},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Medron Y`Lask","y":769,"x":-1310},{"zone":"Oggok","merchant":"Juk Hidebeater","y":368,"x":-202},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fhara Semhart","y":399,"x":-80},{"zone":"Rathe Mountains","merchant":"Chizzlik","y":1719,"x":1310},{"zone":"Rivervale","merchant":"Twippie Diggs","y":-116,"x":-211},{"zone":"Thurgadin","merchant":"Mauren Frostbeard","y":-146,"x":218},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Carnelian": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":659,"x":156},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Jade","y":-169,"x":202},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Southern Desert of Ro","merchant":"Smith Tv`ysa","y":93,"x":487},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719}],
  "Cask": [{"zone":"Ak'Anon","merchant":"a clockwork barkeep","y":1252,"x":-946},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1265,"x":-777},{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Vednir","y":58,"x":-8},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Poklon","y":913,"x":-85},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"Cobalt Scar","merchant":"Blumblum Swigwater","y":237,"x":-1485},{"zone":"West Commonlands","merchant":"Innkeep Seke","y":-104,"x":465},{"zone":"West Commonlands","merchant":"Ruby Boxcrafter","y":-213,"x":591},{"zone":"West Commonlands","merchant":"Innkeep Redthorn","y":-401,"x":2763},{"zone":"Crystal Caverns","merchant":"Hardat Gemshard","y":-243,"x":177},{"zone":"Crystal Caverns","merchant":"Grabble Coldheart","y":-261,"x":165},{"zone":"East Commonlands","merchant":"Innkeep Leo","y":-319,"x":2977},{"zone":"East Commonlands","merchant":"Innkeep Elora","y":-184,"x":71},{"zone":"East Commonlands","merchant":"Innkeep Fenia","y":1021,"x":3731},{"zone":"East Commonlands","merchant":"Innkeep Calen","y":315,"x":4890},{"zone":"Erudin","merchant":"Nerth Sailwind","y":232,"x":96},{"zone":"Erudin","merchant":"Luren Renthalis","y":-1156,"x":-61},{"zone":"Erudin","merchant":"Reihan Wilhemson","y":-906,"x":-88},{"zone":"Erudin","merchant":"Kisrin Breezeshadow","y":230,"x":-5},{"zone":"Erudin","merchant":"Reko Saltamer","y":207,"x":-5},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Vall Stonewisp","y":590,"x":832},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tan Monosty","y":667,"x":829},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Judge Monosty","y":689,"x":829},{"zone":"Felwithe","merchant":"Merchant Issynal","y":147,"x":-412},{"zone":"Felwithe","merchant":"Wela Muselender","y":102,"x":-343},{"zone":"Felwithe","merchant":"Tyle Songwhisper","y":76,"x":-368},{"zone":"Firiona Vie","merchant":"Broawn Goshart","y":-3863,"x":1673},{"zone":"Firiona Vie","merchant":"Dom Pathfinder","y":-2818,"x":2686},{"zone":"Firiona Vie","merchant":"Samson","y":-2952,"x":2977},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lynda Tapper","y":-296,"x":-213},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Jaleel Hoglomp","y":44,"x":-746},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Cloud Alemaker","y":116,"x":-267},{"zone":"East Freeport","zonePage":"Freeport","merchant":"River Alemaker","y":127,"x":-270},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sun Alemaker","y":127,"x":-254},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Judicla Riverfield","y":70,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Shania Tassel","y":85,"x":-34},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Drona Whystlethin","y":-120,"x":-473},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Swin Blackeye","y":-158,"x":-527},{"zone":"Greater Faydark","merchant":"Merchant Aildien","y":-496,"x":-133},{"zone":"Greater Faydark","merchant":"Merchant Aluuvila","y":-94,"x":224},{"zone":"Greater Faydark","merchant":"Merchant Tilluen","y":-85,"x":271},{"zone":"Greater Faydark","merchant":"Barkeep Tvanla","y":-515,"x":-550},{"zone":"Greater Faydark","merchant":"Barkeep Sissya","y":-564,"x":-558},{"zone":"Greater Faydark","merchant":"Barkeep Myrisa","y":394,"x":677},{"zone":"Greater Faydark","merchant":"Barkeep Lysslan","y":123,"x":805},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Greater Faydark","merchant":"Barkeep Syntan","y":881,"x":93},{"zone":"Greater Faydark","merchant":"Barkeep Uulianu","y":286,"x":520},{"zone":"Greater Faydark","merchant":"Barkeep Manlawen","y":322,"x":542},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Grobb","merchant":"Graktak","y":50,"x":-396},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Halas","merchant":"Rose McDowell","y":397,"x":165},{"zone":"Halas","merchant":"Brandyn McDonald","y":182,"x":-157},{"zone":"Halas","merchant":"Brin McQuaid","y":93,"x":-216},{"zone":"Halas","merchant":"Donald McQuaid","y":93,"x":-206},{"zone":"Halas","merchant":"Scon McDaniel","y":345,"x":-347},{"zone":"Highpass Keep","merchant":"Merchant Dominik","y":37,"x":31},{"zone":"Highpass Keep","merchant":"Dealer Shonta","y":-54,"x":-324},{"zone":"Highpass Hold","merchant":"Paulina","y":-234,"x":9},{"zone":"Highpass Hold","merchant":"Bartender","y":395,"x":-184},{"zone":"Highpass Hold","merchant":"Bartender","y":403,"x":-165},{"zone":"Highpass Hold","merchant":"Bartholemew","y":-212,"x":11},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Tumpy Irontoe","y":178,"x":313},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Aarina Ratsbone","y":183,"x":-138},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dura Darkfoam","y":108,"x":233},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"Kerra Island","merchant":"Raarrk","y":108,"x":131},{"zone":"Kithicor Forest","merchant":"Eithne Walker","y":1427,"x":-825},{"zone":"Lake Rathetear","merchant":"Srynda","y":-507,"x":637},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Damar Nislan","y":177,"x":-196},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Palais Derekor","y":205,"x":-111},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tala Felton","y":136,"x":-98},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Darien Felton","y":136,"x":-93},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tanai Tanbor","y":215,"x":-242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sera Buelle","y":255,"x":-262},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Uawn Betell","y":246,"x":-227},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Yala Thiss","y":242,"x":-265},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Slunga","y":-336,"x":-194},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ghrag","y":-259,"x":-260},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rysva To`Biath","y":11,"x":-848},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Marenkor To`Biath","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":-97,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Lysanda S`Kor","y":40,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Frivsa Punox","y":35,"x":-1238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Svlis C`Luzz","y":-90,"x":-1239},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rista S`lon","y":-152,"x":-1011},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Tenso H`Rugla","y":-153,"x":-1042},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Grazis L`Crit","y":703,"x":-1472},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Katara L`Crit","y":701,"x":-1474},{"zone":"Northern Karana","merchant":"Mrysila","y":-688,"x":-159},{"zone":"Northern Karana","merchant":"Barkeep Milo","y":432,"x":2248},{"zone":"Northern Karana","merchant":"Barkeep Jeny","y":416,"x":2222},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3466,"x":489},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"Oasis of Marr","merchant":"Synthan","y":597,"x":-6},{"zone":"Oggok","merchant":"Brokk Boxtripper","y":220,"x":378},{"zone":"Oggok","merchant":"Korgarg Swillchugger","y":182,"x":-235},{"zone":"The Overthere","merchant":"Tin Merchant II","y":2694,"x":2583},{"zone":"Paineel","merchant":"Loleluz","y":949,"x":822},{"zone":"Paineel","merchant":"Archenm","y":945,"x":829},{"zone":"Paineel","merchant":"Lolenton","y":950,"x":836},{"zone":"Paineel","merchant":"Gernatis","y":944,"x":848},{"zone":"Paineel","merchant":"Taralani Rahnta","y":934,"x":805},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sunsa Jocub","y":-305,"x":-276},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Bassanio Weekin","y":-40,"x":-219},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fish Ranamer","y":-292,"x":-269},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Rucio Divella","y":330,"x":-507},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sissy Huntlan","y":231,"x":-129},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Tasya Huntlan","y":259,"x":-69},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Nug Rellash","y":256,"x":-170},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Earron Huntlan","y":254,"x":-191},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fellesha Varshen","y":487,"x":-310},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Raheim Varshen","y":543,"x":-263},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Gahna Salbeen","y":4,"x":-220},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ania Klephia","y":115,"x":359},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sabnie Blagard","y":81,"x":368},{"zone":"Rathe Mountains","merchant":"Roshmael","y":1592,"x":-888},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"Rivervale","merchant":"bag merchant","y":208,"x":-214},{"zone":"Rivervale","merchant":"Mac Deeppockets","y":-64,"x":-188},{"zone":"Rivervale","merchant":"Flyndia Deeppockets","y":-49,"x":-207},{"zone":"RunnyEye Citadel","merchant":"A goblin bartender","y":75,"x":90},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Thurgadin","merchant":"Loremaster Fronden","y":-395,"x":452},{"zone":"Thurgadin","merchant":"Karey","y":-38,"x":84},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":119,"x":-406},{"zone":"Thurgadin","merchant":"Klarp Bartleby","y":61,"x":-380},{"zone":"Thurgadin","merchant":"Bixx Bartleby","y":45,"x":-380},{"zone":"Thurgadin","merchant":"Adia Coldbeard","y":-57,"x":107},{"zone":"Thurgadin","merchant":"Doogle McBanick","y":-56,"x":-311},{"zone":"Thurgadin","merchant":"Fogerty Bottlenip","y":-311,"x":-27},{"zone":"Thurgadin","merchant":"Agar","y":-72,"x":-379},{"zone":"Thurgadin","merchant":"Durgan Bottlenip","y":-329,"x":-28},{"zone":"Timorous Deep","merchant":"Portik Grolam","y":-11592,"x":-2275},{"zone":"Timorous Deep","merchant":"Micus Vloren","y":-5195,"x":-4335},{"zone":"Toxxulia Forest","merchant":"Stylla Parsini","y":2105,"x":404},{"zone":"Toxxulia Forest","merchant":"Emil Parsini","y":2119,"x":423}],
  "Cat's Eye Agate": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1045,"x":-1011},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1053,"x":-1012},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Visar Glolith","y":330,"x":753},{"zone":"Crystal Caverns","merchant":"Gilliad Coldheart","y":-176,"x":344},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Gwynora Armista","y":555,"x":749},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Andane Starinen","y":864,"x":737},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"South Felwithe","zonePage":"Felwithe","merchant":"Merchant Lyssia","y":580,"x":-872},{"zone":"South Felwithe","zonePage":"Felwithe","merchant":"Merchant Earlyn","y":464,"x":-348},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Banor Raglesin","y":-226,"x":-232},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Dulia Jestes","y":19,"x":-817},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Voglan Dransed","y":155,"x":-762},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Highpass Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Veca S`Karn","y":178,"x":-919},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Mirzna N`Mar","y":167,"x":-875},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Tzanso S`Tai","y":-407,"x":-834},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Xantis Ixtax","y":1335,"x":-1236},{"zone":"Paineel","merchant":"Linnleu Brackmar","y":734,"x":820},{"zone":"Paineel","merchant":"Keletha Nightweaver","y":734,"x":861},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"The Overthere","merchant":"Tin Merchant IV","y":2647,"x":2525},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719},{"zone":"Toxxulia Forest","merchant":"Islan Hetston","y":2251,"x":1008}],
  "Chainmail Bracelet Pattern": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Daria Smith","y":46,"x":-226},{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Tanalin Silverkale","y":117,"x":-414},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Draan N`Ryt","y":694,"x":-1780},{"zone":"Oggok","merchant":"Gralbug","y":332,"x":782}],
  "Chainmail Coif Pattern": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Daria Smith","y":46,"x":-226},{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Tanalin Silverkale","y":117,"x":-414},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Draan N`Ryt","y":694,"x":-1780},{"zone":"Oggok","merchant":"Gralbug","y":332,"x":782}],
  "Chainmail Tunic Pattern": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Daria Smith","y":46,"x":-226},{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Tanalin Silverkale","y":117,"x":-414},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Draan N`Ryt","y":694,"x":-1780},{"zone":"Oggok","merchant":"Gralbug","y":332,"x":782}],
  "Cloak Sectional Mold": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Issilyn Ristan","y":72,"x":-214},{"zone":"Toxxulia Forest","merchant":"Win Karnam","y":2247,"x":979},{"zone":"New Sebilis Expedition","merchant":"Klok Rento","y":297,"x":-101},{"zone":"Qeynos Hills","merchant":"Marton Sayer","y":1381,"x":278},{"zone":"Greater Faydark","merchant":"Merchant Linolyen","y":110,"x":345},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Nalgoz","y":239,"x":-290}],
  "Comfrey": [{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Jaxxtz","y":-41,"x":513},{"zone":"Grobb","merchant":"Grabah","y":413,"x":-418},{"zone":"Halas","merchant":"Spirita","y":348,"x":343},{"zone":"Oggok","merchant":"Garakbar","y":281,"x":-364},{"zone":"Thurgadin","merchant":"Brynjar","y":-302,"x":133}],
  "Duskglow Vine": [{"zone":"Everfrost Peaks","merchant":"Sven Felligan","y":2848,"x":-3454},{"zone":"Innothule Swamp","merchant":"Sithgok","y":1169,"x":529},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Dwarven Ale": [{"zone":"Crystal Caverns","merchant":"Hardat Gemshard","y":-243,"x":177},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ston O`Donner","area":"Velithe & Bardo's","y":101,"x":-417},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Myrissa O`Donner","area":"Velithe & Bardo's","y":83,"x":-435},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Slan ODonner","area":"Building #3","y":76,"x":-335},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Monita O`Donner","area":"Velithe & Bardo's","y":106,"x":-378},{"zone":"Greater Faydark","merchant":"Barkeep Aanlawen","y":601,"x":690},{"zone":"Highpass Hold","merchant":"Dyn Tarburner","y":-61,"x":477},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dura Darkfoam","y":108,"x":233},{"zone":"Lake Rathetear","merchant":"Abrod","y":-433,"x":657},{"zone":"Northern Karana","merchant":"Romi","y":-618,"x":-201},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Paineel","merchant":"Kelkarn","y":953,"x":830}],
  "Electrum Bar": [{"zone":"North Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Nora","y":144,"x":-414},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Zartox Ru`Soe","area":"NO LONGER SPAWNS","y":82,"x":-901},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Elven Wine": [{"zone":"Felwithe","merchant":"Wela Muselender","y":102,"x":-343},{"zone":"Felwithe","merchant":"Tyle Songwhisper","y":76,"x":-368},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ston O`Donner","y":101,"x":-417},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Myrissa O`Donner","y":83,"x":-435},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Slan ODonner","y":76,"x":-335},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Monita O`Donner","y":106,"x":-378},{"zone":"Greater Faydark","merchant":"Merchant Weaolanae","y":428,"x":338},{"zone":"Greater Faydark","merchant":"Merchant Kanoldar","y":750,"x":357},{"zone":"Greater Faydark","merchant":"Barkeep Tvanla","y":-515,"x":-550},{"zone":"Greater Faydark","merchant":"Barkeep Sissya","y":-564,"x":-558},{"zone":"Greater Faydark","merchant":"Barkeep Aanlawen","y":601,"x":690},{"zone":"Greater Faydark","merchant":"Barkeep Myrisa","y":394,"x":677},{"zone":"Greater Faydark","merchant":"Barkeep Lysslan","y":123,"x":805},{"zone":"Greater Faydark","merchant":"Barkeep Syntan","y":881,"x":93},{"zone":"Greater Faydark","merchant":"Barkeep Uulianu","y":286,"x":520},{"zone":"Greater Faydark","merchant":"Barkeep Manlawen","y":322,"x":542},{"zone":"Highpass Hold","merchant":"Dyn Tarburner","y":-61,"x":477},{"zone":"Lake Rathetear","merchant":"Abrod","y":-433,"x":657},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Yally G`Noir","y":763,"x":-1512},{"zone":"Northern Karana","merchant":"Romi","y":-618,"x":-201},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Oggok","merchant":"Clurg","y":262,"x":-249},{"zone":"Ocean of Tears","merchant":"Cleonae Kalen","y":503,"x":-9253},{"zone":"Paineel","merchant":"Kelkarn","y":953,"x":830}],
  "Emerald": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Chardok","merchant":"Haggle Baron Dry`dn","y":-93,"x":351},{"zone":"Crystal Caverns","merchant":"Gilliad Coldheart","y":-176,"x":344},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"North Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"South Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Brackin Nartoise","y":-3978,"x":2612},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Highpass Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"The Overthere","merchant":"Tin Merchant XI","y":2663,"x":2548},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Warsliks Woods","merchant":"Klok Kogrin","y":-1710,"x":-895},{"zone":"Warsliks Woods","merchant":"Klok Rogalin","y":-1882,"x":-600}],
  "Fenugreek": [{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Grobb","merchant":"Blergagg","y":417,"x":-427},{"zone":"Halas","merchant":"Dargon","y":354,"x":356},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"Oggok","merchant":"Pordopa","y":287,"x":-389},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Field Point Arrowheads": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-1900,"x":-9000},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "File Mold": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1170,"x":-745},{"zone":"Butcherblock Mountains","merchant":"Kaila Rucksack","y":2795,"x":-697},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Smithy Vyx","y":-427,"x":-215},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Jillian Dayson","area":"Inside Velithe and Bardo's Imported goods","y":140,"x":-381},{"zone":"Greater Faydark","merchant":"Merchant Nluolian","y":-107,"x":-565},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ungia","y":684,"x":-447},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"Rivervale","merchant":"Betty Brickbaker","y":-229,"x":-204},{"zone":"Rivervale","merchant":"Bodbin Gimple","area":"NO LONGER EXISTS","y":-80,"x":-370},{"zone":"Neriak Foreign Quarter","merchant":"Ungia","y":-203,"x":-279}],
  "Fine Coral Mesh": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Fire Emerald": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1347,"x":-952},{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1332,"x":-917},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"The Overthere","zonePage":"Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267}],
  "Fleeting Quiver Pattern": [{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Stitch","y":128,"x":-9},{"zone":"Highpass Hold","merchant":"Dyona Rossook","y":-248,"x":135},{"zone":"Greater Faydark","merchant":"Merchant Gaeadin","y":-119,"x":-132},{"zone":"Misty Thicket","merchant":"Tipa Lighten","y":581,"x":-2202},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Rathe Mountains","merchant":"Zok Gleeup","y":-1791,"x":-143},{"zone":"Rathe Mountains","merchant":"Zok Lubump","y":-1804,"x":-154}],
  "Fresh Fish": [{"zone":"Ak'Anon","merchant":"a clockwork grocer","y":904,"x":-284},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":733,"x":153},{"zone":"West Commonlands","merchant":"Maula Fishcatcher","y":405,"x":2408},{"zone":"Eastern Plains of Karana","merchant":"Sharna","y":-3790,"x":-2399},{"zone":"Erud's Crossing","merchant":"Renna","y":-1479,"x":857},{"zone":"The Feerrott","merchant":"Kogg","y":1045,"x":1462},{"zone":"Felwithe","merchant":"Elytan Rantas","y":41,"x":-673},{"zone":"Felwithe","merchant":"Tam Slyspan","y":245,"x":-703},{"zone":"Felwithe","merchant":"Fishmonger Jassa","y":162,"x":-588},{"zone":"Felwithe","merchant":"Fishmonger Issa","y":258,"x":-626},{"zone":"Firiona Vie","merchant":"Dorg McMerin","y":-3866,"x":1641},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Rolfic Gohar","y":-189,"x":-277},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Tanlok Harson","y":87,"x":-850},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Iseba Gargurd","y":61,"x":-882},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Tarker Gargurd","y":61,"x":-890},{"zone":"Halas","merchant":"Quillion O`Zinn","y":-15,"x":66},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Mariz Ixtaz","y":-163,"x":-938},{"zone":"Oggok","merchant":"Chef Dooga","y":201,"x":-243},{"zone":"Western Plains of Karana","merchant":"Misla McMannus","y":-4023,"x":-2344},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Captain Rohand","y":15,"x":-40},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Ghul Rustem","y":-307,"x":-28},{"zone":"Rivervale","merchant":"dock merchant","y":203,"x":-216},{"zone":"Rivervale","merchant":"Fiddy Bobick","y":19,"x":-428}],
  "Frosting": [{"zone":"Ak'Anon","merchant":"a clockwork baker","y":891,"x":-301},{"zone":"Butcherblock Mountains","merchant":"Urazun Thranon","y":2794,"x":-883},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sweetzie","y":551,"x":159},{"zone":"Crystal Caverns","merchant":"Praps Gemshard","y":-250,"x":370},{"zone":"East Commonlands","merchant":"Parthar","y":-119,"x":240},{"zone":"The Feerrott","merchant":"Bup","y":1182,"x":117},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Pincia Brownloe","y":-276,"x":-698},{"zone":"Halas","merchant":"Sissia","y":368,"x":-329},{"zone":"Misty Thicket","merchant":"Bim Buskin","y":905,"x":-2345},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Niz L`Crit","area":"The Refined Palace","y":82,"x":-884},{"zone":"The Overthere","merchant":"Tin Merchant XI","y":2663,"x":2548},{"zone":"Western Plains of Karana","merchant":"Chrislin Baker","y":1048,"x":-1989},{"zone":"Skyshrine","merchant":"Chef Kollof","y":142,"x":-474},{"zone":"Steamfont Mountains","merchant":"Finkel Rardobaen","y":-1515,"x":-1844},{"zone":"Stonebrunt Mountains","merchant":"Chef Stead","y":1348,"x":-490},{"zone":"Thurgadin","merchant":"Perkins Doughbeard","y":-279,"x":134},{"zone":"Toxxulia Forest","merchant":"Quana Rainsparkle","y":2171,"x":-1111}],
  "Gears": [{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Glass Shard": [{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Gnomish Bolts": [{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Gnomish Spirits": [{"zone":"Ak'Anon","merchant":"a clockwork barkeep","y":1252,"x":-946},{"zone":"Crystal Caverns","merchant":"Hardat Gemshard","y":-243,"x":177},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ston O`Donner","y":101,"x":-417},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Myrissa O`Donner","y":83,"x":-435},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Slan ODonner","y":76,"x":-335},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Monita O`Donner","y":106,"x":-378},{"zone":"Greater Faydark","merchant":"Barkeep Aanlawen","y":601,"x":690},{"zone":"Highpass Hold","merchant":"Dyn Tarburner","y":-61,"x":477},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dura Darkfoam","y":108,"x":233}],
  "Gold Bar": [{"zone":"North Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Nora","y":144,"x":-414},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Hematite": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"East Commonlands","merchant":"Pardor the Blessed","y":-121,"x":-780},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tika Shockstep","y":917,"x":721},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Jade","y":-169,"x":202},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54}],
  "Hooked Arrowheads": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":985,"x":3765},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Hops": [{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"Butcherblock Mountains","merchant":"Inudul Dumirgun","y":2837,"x":-682},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Brewer Prixal","y":678,"x":-26},{"zone":"Firiona Vie","merchant":"Frothy","y":-2979,"x":2973},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Highpass Keep","merchant":"a clerk","y":-77,"x":-187},{"zone":"Highpass Keep","merchant":"a dealer","y":-70,"x":-355},{"zone":"Highpass Keep","merchant":"a dealer","y":-101,"x":-326},{"zone":"Highpass Hold","merchant":"a dealer","y":426,"x":-260},{"zone":"Highpass Hold","merchant":"a dealer","y":340,"x":-244},{"zone":"Highpass Hold","merchant":"Lyn Tarburner","y":-146,"x":493},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ghrag","y":-259,"x":-260},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Heidi Grainsifter","y":-169,"x":-278},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"Thurgadin","merchant":"Tobart Dirkins","y":-332,"x":-9},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":120,"x":-406}],
  "Idol Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Jade": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Ping Fuzzlecutter","y":-269,"x":535},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Lake Rathetear","merchant":"Dreana","y":-424,"x":450},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"The Overthere","merchant":"Tin Merchant IV","y":2697,"x":2620},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54}],
  "Jug of Sauces": [{"zone":"Ak'Anon","merchant":"a clockwork baker","y":891,"x":-301},{"zone":"Butcherblock Mountains","merchant":"Urazun Thranon","y":2794,"x":-883},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sweetzie","y":551,"x":159},{"zone":"Crystal Caverns","merchant":"Praps Gemshard","y":-250,"x":370},{"zone":"East Commonlands","merchant":"Parthar","y":-119,"x":240},{"zone":"The Feerrott","merchant":"Bup","y":1182,"x":117},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Pincia Brownloe","y":-276,"x":-698},{"zone":"Halas","merchant":"Sissia","y":368,"x":-329},{"zone":"Misty Thicket","merchant":"Bim Buskin","y":905,"x":-2345},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Niz L`Crit","y":82,"x":-884},{"zone":"The Overthere","merchant":"Tin Merchant XI","y":2663,"x":2548},{"zone":"Western Plains of Karana","merchant":"Chrislin Baker","y":1048,"x":-1989},{"zone":"Western Plains of Karana","merchant":"Cleet Miller Jr","y":-3013,"x":-5735},{"zone":"Skyshrine","merchant":"Chef Kollof","y":142,"x":-474},{"zone":"Steamfont Mountains","merchant":"Finkel Rardobaen","y":-1515,"x":-1844},{"zone":"Stonebrunt Mountains","merchant":"Chef Stead","y":1348,"x":-490},{"zone":"Thurgadin","merchant":"Petcas Coldbeard","y":-57,"x":94},{"zone":"Thurgadin","merchant":"Perkins Doughbeard","y":-279,"x":134},{"zone":"Toxxulia Forest","merchant":"Quana Rainsparkle","y":2171,"x":-1111}],
  "Lantern Casing Mold": [{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1170,"x":-745},{"zone":"Butcherblock Mountains","merchant":"Kaila Rucksack","y":2795,"x":-697},{"zone":"Butcherblock Mountains","merchant":"Nalda Griststone","y":2717,"x":-964},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Gritchit","y":593,"x":158},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Smithy Vyx","y":-427,"x":-215},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Tislan","y":134,"x":-298},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"Greater Faydark","merchant":"Merchant Uaylain","y":-22,"x":118},{"zone":"Greater Faydark","merchant":"Merchant Nluolian","y":-107,"x":-565},{"zone":"Grobb","merchant":"Garklog","y":502,"x":-207},{"zone":"Grobb","merchant":"Ungia","y":684,"x":-447},{"zone":"Halas","merchant":"Jil McDaniel","y":325,"x":-289},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":6,"x":897},{"zone":"Western Plains of Karana","merchant":"Sera McMannus","y":-4011,"x":-2222},{"zone":"Qeynos Hills","merchant":"Mira Sayer","y":1404,"x":307},{"zone":"Surefall Glade","merchant":"Frannie","y":-43,"x":12},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Steamfont Mountains","merchant":"Oren Furdenbline","y":-1623,"x":429},{"zone":"Thurgadin","merchant":"Wevil Doughbeard","y":-287,"x":134},{"zone":"Thurgadin","merchant":"Brimgald Brightsteel","y":-439,"x":101},{"zone":"Neriak Foreign Quarter","merchant":"Ungia","y":-203,"x":-279}],
  "Large Black Lodestone": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Steamfont Mountains","merchant":"a mechanical merchant","y":1622,"x":-1728}],
  "Large Block of Clay": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Kyrin Steelbone","y":-21,"x":470},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-116},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Tentus Brackmar","y":995,"x":810},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Rivervale","merchant":"Bodbin Gimple","y":-80,"x":-370},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Large Bowl Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-474},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Large Groove Nocks": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298},{"zone":"Thurgadin","merchant":"Argash","y":-203,"x":-298}],
  "Large Jar Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-474},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Large Lantern": [{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":484,"x":-115},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1242,"x":-775},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1284,"x":-915},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1328,"x":-778},{"zone":"Butcherblock Mountains","merchant":"Iglan Thranon","y":2806,"x":-904},{"zone":"Butcherblock Mountains","merchant":"Gamin Griststone","y":2718,"x":-941},{"zone":"Butcherblock Mountains","merchant":"Parn Gylwyn","y":1465,"x":2817},{"zone":"Butcherblock Mountains","merchant":"Felen Razdal","y":129,"x":2383},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Dytar","y":51,"x":-197},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Lybar","y":292,"x":523},{"zone":"Crystal Caverns","merchant":"Milliace Gemshard","y":-263,"x":233},{"zone":"Eastern Plains of Karana","merchant":"Bradly","y":-856,"x":-99},{"zone":"Eastern Plains of Karana","merchant":"Stace","y":1227,"x":-2645},{"zone":"Eastern Plains of Karana","merchant":"Sorn","y":1198,"x":-2634},{"zone":"Eastern Plains of Karana","merchant":"Tanrak","y":1529,"x":-2677},{"zone":"East Commonlands","merchant":"Bubar","y":-1519,"x":-116},{"zone":"Erudin","merchant":"Teria Finleather","y":-956,"x":-98},{"zone":"Erudin","merchant":"Borge Finleather","y":-994,"x":-78},{"zone":"Felwithe","merchant":"Rolyn Longwalker","y":4,"x":-384},{"zone":"Felwithe","merchant":"Merchant Sorintal","y":136,"x":-415},{"zone":"Field of Bone","merchant":"Klok Acet","y":-2463,"x":2984},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ralfson Gerositan","y":-384,"x":-648},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Ardiflah Steadirt","y":-27,"x":482},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gibbon Morfield","y":287,"x":284},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Yellus Gravien","y":301,"x":273},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Lyna","y":-103,"x":191},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Tulan","y":-131,"x":209},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Bran Greenglade","y":-109,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Alec Greenglade","y":-94,"x":-128},{"zone":"Greater Faydark","merchant":"Merchant Aianya","y":251,"x":614},{"zone":"Greater Faydark","merchant":"Merchant Iludarae","y":-29,"x":-149},{"zone":"Greater Faydark","merchant":"Merchant Kwein","y":155,"x":334},{"zone":"Grobb","merchant":"Ootok","y":233,"x":-31},{"zone":"Halas","merchant":"Dok","y":212,"x":275},{"zone":"Halas","merchant":"Greta Terrilon","y":280,"x":-327},{"zone":"Halas","merchant":"Leopok Terrilon","y":205,"x":151},{"zone":"Highpass Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Highpass Hold","merchant":"Maigin Greyeagle","y":179,"x":483},{"zone":"Highpass Hold","merchant":"Sernn Rossook","y":-218,"x":154},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Kadek Norkhitter","y":583,"x":238},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Doramafi Ratsbone","y":710,"x":88},{"zone":"Kithicor Forest","merchant":"Elsbyth","y":-776,"x":3082},{"zone":"Lake of Ill Omen","merchant":"Klok Gnask","y":6392,"x":-6350},{"zone":"Lake Rathetear","merchant":"Dreana","y":-424,"x":450},{"zone":"Lake Rathetear","merchant":"Turga","y":3126,"x":-1815},{"zone":"Lavastorm Mountains","merchant":"Jenah Wheelspinner","y":401,"x":826},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ootok","y":-417,"x":-457},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Smaka","y":-335,"x":-107},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Vala Tanbor","y":210,"x":-215},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"The Gobbler","y":-323,"x":-125},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Dran `slug` Rembor","y":210,"x":-244},{"zone":"Northern Karana","merchant":"Romella","y":-682,"x":-201},{"zone":"Oasis of Marr","merchant":"Isslana","y":512,"x":71},{"zone":"Oggok","merchant":"Angrog","y":-243,"x":-2},{"zone":"Oggok","merchant":"Sinsaal","y":267,"x":677},{"zone":"Ocean of Tears","merchant":"Endan Halson","y":-2211,"x":7721},{"zone":"The Overthere","merchant":"Tin Merchant I","y":2733,"x":2582},{"zone":"Paineel","merchant":"Rallia Hapera","y":941,"x":770},{"zone":"Paineel","merchant":"Geomar Hapera","y":953,"x":757},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Tanlyn Galliway","y":125,"x":204},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sneed Galliway","y":132,"x":243},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ghil Starn","y":157,"x":195},{"zone":"Rathe Mountains","merchant":"Guzzla","y":1760,"x":1288},{"zone":"Rathe Mountains","merchant":"Viira Bali","y":1644,"x":-875},{"zone":"Rathe Mountains","merchant":"Susanna","y":2908,"x":-769},{"zone":"Rathe Mountains","merchant":"Chandra Kali","y":3922,"x":1390},{"zone":"Rivervale","merchant":"Wibble Bramblebush","y":6,"x":-329},{"zone":"Solusek's Eye","merchant":"goblin merchant","y":-753,"x":-437},{"zone":"Steamfont Mountains","merchant":"Glen Garginburr","y":-1786,"x":337},{"zone":"Swamp of No Hope","merchant":"Klok Migo","y":2467,"x":2911},{"zone":"Thurgadin","merchant":"Mordin Frostcleaver","y":-220,"x":-216},{"zone":"Timorous Deep","merchant":"Seloris Windweaver","y":-4867,"x":-3439},{"zone":"Warsliks Woods","merchant":"Klok Gragin","y":-1651,"x":-707},{"zone":"Warsliks Woods","merchant":"Klok Rogalin","y":-1882,"x":-600}],
  "Lime Coated Meshing": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Lined Vial Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Mail Sectional Mold": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Issilyn Ristan","y":72,"x":-214},{"zone":"Toxxulia Forest","merchant":"Win Karnam","y":2247,"x":979},{"zone":"New Sebilis Expedition","merchant":"Klok Rento","y":297,"x":-101},{"zone":"Qeynos Hills","merchant":"Marton Sayer","y":1381,"x":278},{"zone":"Greater Faydark","merchant":"Merchant Linolyen","y":110,"x":345},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Nalgoz","y":239,"x":-290}],
  "Malachite": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1120,"x":-1035},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Dreadlands","merchant":"Klok F`tshai","y":780,"x":9140},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"East Commonlands","merchant":"Lyth Spellstar","y":269,"x":4915},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Harban Ranflash","y":695,"x":883},{"zone":"Northern Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Southern Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Southern Felwithe","merchant":"Merchant Jewyln","y":567,"x":-609},{"zone":"Field of Bone","merchant":"Klok Acet","y":-2463,"x":2984},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Jade (Merchant)","y":-169,"x":202},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Mekoma Buma","y":145,"x":-761},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Halas","merchant":"Greta Terrilon","y":273,"x":-318},{"zone":"High Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"High Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"Kael Drakkel","merchant":"Ymik","y":-1740,"x":1932},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Genzal R`Jyen","y":119,"x":-919},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Camor V`Retta","y":1334,"x":-1277},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"New Sebilis Expedition","merchant":"Klok Koglin","y":177,"x":-89},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Hanlore Escaval","y":303,"x":-569},{"zone":"The Overthere","merchant":"Tin Merchant IV","y":2647,"x":2525},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Toxxulia Forest","merchant":"Tran Lilspin","y":1761,"x":-736},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719},{"zone":"Paineel","merchant":"Rallia Hapera","y":941,"x":762}],
  "Malt": [{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"Butcherblock Mountains","merchant":"Inudul Dumirgun","y":2837,"x":-682},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Brewer Prixal","y":678,"x":-26},{"zone":"Firiona Vie","merchant":"Frothy","y":-2979,"x":2973},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Highpass Keep","merchant":"a clerk","y":-77,"x":-187},{"zone":"Highpass Keep","merchant":"a dealer","y":-70,"x":-355},{"zone":"Highpass Keep","merchant":"a dealer","y":-101,"x":-326},{"zone":"Highpass Hold","merchant":"a dealer","y":426,"x":-260},{"zone":"Highpass Hold","merchant":"a dealer","y":340,"x":-244},{"zone":"Highpass Hold","merchant":"Lyn Tarburner","y":-146,"x":493},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ghrag","y":-259,"x":-260},{"zone":"Oggok","merchant":"Korgarg Swillchugger","y":182,"x":-235},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Heidi Grainsifter","y":-169,"x":-278},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"Thurgadin","merchant":"Tobart Dirkins","y":-332,"x":-9}],
  "Mask Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Alga Bruntbuckler","y":-1185,"x":-1957},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Gayle Weaven","y":245,"x":88},{"zone":"Everfrost Peaks","merchant":"Seria O`Danos","y":3608,"x":701},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"Firiona Vie","merchant":"Dionin Needlespin","y":-3642,"x":1985},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","area":"Inside Leather and Hide","y":38,"x":-539},{"zone":"Greater Faydark","merchant":"Merchant Gaeadin","y":-114,"x":-131},{"zone":"Highpass Hold","merchant":"Dyona Rossook","y":-248,"x":135},{"zone":"Kelethin","merchant":"Merchant Gaeadin","y":-114,"x":-123},{"zone":"Misty Thicket","merchant":"Tipa Lighten","y":581,"x":-2202},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Hutyn L`Lozz","y":747,"x":-1293},{"zone":"Northern Desert of Ro","merchant":"Spoolie Gee","y":3371,"x":488},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Nerissa Clothspinner","y":-11,"x":-8},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Steamfont Mountains","merchant":"Freed Fimplefur","y":-1696,"x":829},{"zone":"Thurgadin","merchant":"Rexx Frostweaver","y":-272,"x":133},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133},{"zone":"Western Plains of Karana","merchant":"Alysa","y":431,"x":-4364}],
  "Mead": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Ak'Anon","merchant":"a clockwork barkeep","y":1252,"x":-946},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":484,"x":-115},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1242,"x":-775},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1284,"x":-915},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1328,"x":-778},{"zone":"Butcherblock Mountains","merchant":"Gamin Griststone","y":2718,"x":-941},{"zone":"Butcherblock Mountains","merchant":"Parn Gylwyn","y":1465,"x":2817},{"zone":"Butcherblock Mountains","merchant":"Felen Razdal","y":129,"x":2383},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"West Commonlands","merchant":"Innkeep Seke","y":-104,"x":465},{"zone":"West Commonlands","merchant":"Innkeep Roster","y":-149,"x":452},{"zone":"West Commonlands","merchant":"Innkeep Redthorn","y":-401,"x":2763},{"zone":"West Commonlands","merchant":"Innkeep Olissa","y":-384,"x":2714},{"zone":"Crystal Caverns","merchant":"Milliace Gemshard","y":-263,"x":233},{"zone":"Crystal Caverns","merchant":"Grabble Coldheart","y":-261,"x":165},{"zone":"Eastern Plains of Karana","merchant":"Bradly","y":-856,"x":-99},{"zone":"Eastern Plains of Karana","merchant":"Stace","y":1227,"x":-2645},{"zone":"Eastern Plains of Karana","merchant":"Sorn","y":1198,"x":-2634},{"zone":"Eastern Plains of Karana","merchant":"Tanrak","y":1529,"x":-2677},{"zone":"East Commonlands","merchant":"Innkeep Harold","y":-187,"x":117},{"zone":"East Commonlands","merchant":"Innkeep Dolman","y":1028,"x":3682},{"zone":"East Commonlands","merchant":"Innkeep Leo","y":-319,"x":2977},{"zone":"East Commonlands","merchant":"Innkeep Juna","y":-334,"x":3022},{"zone":"East Commonlands","merchant":"Innkeep Elora","y":-184,"x":71},{"zone":"East Commonlands","merchant":"Germe Threadspinner","y":1021,"x":3635},{"zone":"East Commonlands","merchant":"Innkeep Fenia","y":1021,"x":3731},{"zone":"East Commonlands","merchant":"Innkeep Calen","y":315,"x":4890},{"zone":"East Commonlands","merchant":"Innkeep Blaise","y":332,"x":4842},{"zone":"Erudin","merchant":"Teria Finleather","y":-956,"x":-98},{"zone":"Erudin","merchant":"Borge Finleather","y":-994,"x":-78},{"zone":"Erudin","merchant":"Geoard BlueHawk","y":-1175,"x":-331},{"zone":"The Feerrott","merchant":"Innkeep Gub","y":1144,"x":1444},{"zone":"The Feerrott","merchant":"Innkeep Morpa","y":1144,"x":-145},{"zone":"Felwithe","merchant":"Rolyn Longwalker","y":4,"x":-384},{"zone":"Felwithe","merchant":"Wela Muselender","y":102,"x":-343},{"zone":"Felwithe","merchant":"Tyle Songwhisper","y":76,"x":-368},{"zone":"Felwithe","merchant":"Merchant Sorintal","y":136,"x":-415},{"zone":"Firiona Vie","merchant":"Samson","y":-2952,"x":2977},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lunce Nasin","y":-233,"x":-863},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ralfson Gerositan","y":-384,"x":-648},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Paggie","y":-7,"x":-232},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Rastle","y":-22,"x":-285},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lynda Tapper","y":-296,"x":-213},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Nesin Tapper","y":-280,"x":-205},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Nasumi","y":-77,"x":-720},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Hunter","y":-77,"x":-699},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Jaleel Hoglomp","y":44,"x":-746},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Cloud Alemaker","y":116,"x":-267},{"zone":"East Freeport","zonePage":"Freeport","merchant":"River Alemaker","y":127,"x":-270},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sun Alemaker","y":127,"x":-254},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gern Tassel","y":70,"x":-57},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gibbon Morfield","y":287,"x":284},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Yellus Gravien","y":301,"x":273},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Lyna","y":-103,"x":191},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Tulan","y":-131,"x":209},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Palola","y":-187,"x":-63},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Galio","y":-187,"x":-41},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Bran Greenglade","y":-109,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Alec Greenglade","y":-94,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Judicla Riverfield","y":70,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Shania Tassel","y":85,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Rille","y":72,"x":72},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Evelona","y":70,"x":56},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Drona Whystlethin","y":-120,"x":-473},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Swin Blackeye","y":-158,"x":-527},{"zone":"Greater Faydark","merchant":"Merchant Weaolanae","y":428,"x":338},{"zone":"Greater Faydark","merchant":"Merchant Kanoldar","y":750,"x":357},{"zone":"Greater Faydark","merchant":"Innkeep Anisyla","y":-247,"x":-435},{"zone":"Greater Faydark","merchant":"Innkeep Wuleran","y":-337,"x":141},{"zone":"Greater Faydark","merchant":"Innkeep Larya","y":940,"x":306},{"zone":"Greater Faydark","merchant":"Innkeep Linen","y":726,"x":459},{"zone":"Greater Faydark","merchant":"Barkeep Tvanla","y":-515,"x":-550},{"zone":"Greater Faydark","merchant":"Barkeep Sissya","y":-564,"x":-558},{"zone":"Greater Faydark","merchant":"Barkeep Myrisa","y":394,"x":677},{"zone":"Greater Faydark","merchant":"Barkeep Lysslan","y":123,"x":805},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Greater Faydark","merchant":"Barkeep Syntan","y":881,"x":93},{"zone":"Greater Faydark","merchant":"Barkeep Uulianu","y":286,"x":520},{"zone":"Greater Faydark","merchant":"Barkeep Manlawen","y":322,"x":542},{"zone":"Greater Faydark","merchant":"Merchant Aianya","y":251,"x":614},{"zone":"Greater Faydark","merchant":"Merchant Iludarae","y":-29,"x":-149},{"zone":"Greater Faydark","merchant":"Merchant Kwein","y":155,"x":334},{"zone":"Grobb","merchant":"Ootok","y":233,"x":-31},{"zone":"Grobb","merchant":"Wista","y":131,"x":-373},{"zone":"Grobb","merchant":"Zatok","y":155,"x":-280},{"zone":"Halas","merchant":"Dok","y":212,"x":275},{"zone":"Halas","merchant":"Greta Terrilon","y":280,"x":-327},{"zone":"Halas","merchant":"Hetie McDonald","y":240,"x":-154},{"zone":"Halas","merchant":"Brandyn McDonald","y":182,"x":-157},{"zone":"Halas","merchant":"Brin McQuaid","y":93,"x":-216},{"zone":"Halas","merchant":"Donald McQuaid","y":93,"x":-206},{"zone":"Halas","merchant":"Scon McDaniel","y":345,"x":-347},{"zone":"Halas","merchant":"Leopok Terrilon","y":205,"x":151},{"zone":"Highpass Keep","merchant":"Dealer Shonta","y":-54,"x":-324},{"zone":"Highpass Hold","merchant":"Paulina","y":-234,"x":9},{"zone":"Highpass Hold","merchant":"Maigin Greyeagle","y":179,"x":483},{"zone":"Highpass Hold","merchant":"Bartender","y":395,"x":-184},{"zone":"Highpass Hold","merchant":"Sernn Rossook","y":-218,"x":154},{"zone":"Highpass Hold","merchant":"Bartender","y":403,"x":-165},{"zone":"Highpass Hold","merchant":"Bartholemew","y":-212,"x":11},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Tumpy Irontoe","y":178,"x":313},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Doramafi Ratsbone","y":710,"x":88},{"zone":"Kerra Island","merchant":"Raarrk","y":108,"x":131},{"zone":"Kithicor Forest","merchant":"Innkeep Min","y":1465,"x":2383},{"zone":"Kithicor Forest","merchant":"Innkeep Jurn","y":-281,"x":3821},{"zone":"Kithicor Forest","merchant":"Innkeep Grace","y":1095,"x":-684},{"zone":"Lake Rathetear","merchant":"Abrod","y":-433,"x":657},{"zone":"Lake Rathetear","merchant":"Turga","y":3126,"x":-1815},{"zone":"Lesser Faydark","merchant":"Anelia Thrywiel","y":-307,"x":1242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ootok","y":-417,"x":-457},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wista","y":-412,"x":-499},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Smaka","y":-335,"x":-107},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Vala Tanbor","y":210,"x":-215},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"The Gobbler","y":-323,"x":-125},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Damar Nislan","y":177,"x":-196},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Bull Crusher","y":-390,"x":-252},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tala Felton","y":136,"x":-98},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Darien Felton","y":136,"x":-93},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tanai Tanbor","y":215,"x":-242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sera Buelle","y":255,"x":-262},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Uawn Betell","y":246,"x":-227},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Yala Thiss","y":242,"x":-265},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Dran `slug` Rembor","y":210,"x":-244},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Slunga","y":-336,"x":-194},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Dunred M`Trik","y":71,"x":-866},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rysva To`Biath","y":11,"x":-848},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Marenkor To`Biath","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Volkoon D`Dbth","y":-43,"x":-1030},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":-97,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Lysanda S`Kor","y":40,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Frivsa Punox","y":35,"x":-1238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Svlis C`Luzz","y":-90,"x":-1239},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rista S`lon","y":-152,"x":-1011},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Tenso H`Rugla","y":-153,"x":-1042},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Belyea K`Jartan","y":864,"x":-1424},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Cecile K`Jartan","y":910,"x":-1413},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Grazis L`Crit","y":703,"x":-1472},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Katara L`Crit","y":701,"x":-1474},{"zone":"Northern Karana","merchant":"Romi","y":-618,"x":-201},{"zone":"Northern Karana","merchant":"Barkeep Milo","y":432,"x":2248},{"zone":"Northern Karana","merchant":"Barkeep Jeny","y":416,"x":2222},{"zone":"Northern Karana","merchant":"Innkeep Disda","y":118,"x":1382},{"zone":"Northern Karana","merchant":"Innkeep James","y":156,"x":1379},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3466,"x":489},{"zone":"Northern Desert of Ro","merchant":"Innkeep Valon","y":3415,"x":503},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"Oasis of Marr","merchant":"Innkeep Marnan","y":-1321,"x":-261},{"zone":"Oggok","merchant":"Angrog","y":-243,"x":-2},{"zone":"Oggok","merchant":"Sinsaal","y":267,"x":677},{"zone":"Oggok","merchant":"Crunga","y":548,"x":-176},{"zone":"Oggok","merchant":"Erung","y":512,"x":-183},{"zone":"Ocean of Tears","merchant":"Endan Halson","y":-2211,"x":7721},{"zone":"Paineel","merchant":"Loleluz","y":949,"x":822},{"zone":"Paineel","merchant":"Archenm","y":945,"x":829},{"zone":"Paineel","merchant":"Lolenton","y":950,"x":836},{"zone":"Paineel","merchant":"Gernatis","y":944,"x":848},{"zone":"Paineel","merchant":"Taralani Rahnta","y":934,"x":805},{"zone":"Paineel","merchant":"Winnla Crestus","y":944,"x":689},{"zone":"Western Plains of Karana","merchant":"Innkeep Danin","y":-1514,"x":-13005},{"zone":"Western Plains of Karana","merchant":"Innkeep Rislarn","y":326,"x":-4417},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sunsa Jocub","y":-305,"x":-276},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"McNeal Jocub","y":-244,"x":-261},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fish Ranamer","y":-292,"x":-269},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Rucio Divella","y":330,"x":-507},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sissy Huntlan","y":231,"x":-129},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Tasya Huntlan","y":259,"x":-69},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Nug Rellash","y":256,"x":-170},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Earron Huntlan","y":254,"x":-191},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Crow","y":91,"x":358},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Tanlyn Galliway","y":125,"x":204},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sneed Galliway","y":132,"x":243},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ania Klephia","y":115,"x":359},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sabnie Blagard","y":81,"x":368},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ghil Starn","y":157,"x":195},{"zone":"Rathe Mountains","merchant":"Guzzla","y":1760,"x":1288},{"zone":"Rathe Mountains","merchant":"Philicia Drinn","y":4002,"x":-1359},{"zone":"Rathe Mountains","merchant":"Sven Drinn","y":3992,"x":-1383},{"zone":"Rathe Mountains","merchant":"Innkeep Troy","y":4283,"x":842},{"zone":"Rathe Mountains","merchant":"Innkeep Serge","y":4294,"x":831},{"zone":"Rivervale","merchant":"Wibble Bramblebush","y":6,"x":-329},{"zone":"Rivervale","merchant":"Mac Deeppockets","y":-64,"x":-188},{"zone":"Rivervale","merchant":"Flyndia Deeppockets","y":-49,"x":-207},{"zone":"RunnyEye Citadel","merchant":"A goblin bartender","y":75,"x":90},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Steamfont Mountains","merchant":"Glen Garginburr","y":-1786,"x":337},{"zone":"Thurgadin","merchant":"Loremaster Fronden","y":-395,"x":452},{"zone":"Thurgadin","merchant":"Karey","y":-38,"x":84},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":119,"x":-406},{"zone":"Thurgadin","merchant":"Klarp Bartleby","y":61,"x":-380},{"zone":"Thurgadin","merchant":"Bixx Bartleby","y":45,"x":-380},{"zone":"Thurgadin","merchant":"Adia Coldbeard","y":-57,"x":107},{"zone":"Thurgadin","merchant":"Doogle McBanick","y":-56,"x":-311},{"zone":"Thurgadin","merchant":"Fogerty Bottlenip","y":-311,"x":-27},{"zone":"Thurgadin","merchant":"Durgan Bottlenip","y":-329,"x":-28},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":52,"x":928},{"zone":"Timorous Deep","merchant":"Portik Grolam","y":-11592,"x":-2275},{"zone":"Timorous Deep","merchant":"Seloris Windweaver","y":-4867,"x":-3439},{"zone":"Timorous Deep","merchant":"Micus Vloren","y":-5195,"x":-4335}],
  "Medium Bowl Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-474},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Medium Jar Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork sketcher","y":762,"x":-140},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Grots","y":239,"x":-275},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Winoyn","y":-110,"x":-177},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jynsa Smithson","y":-178,"x":-339},{"zone":"Greater Faydark","merchant":"Merchant Nildar","y":867,"x":205},{"zone":"Grobb","merchant":"Vynugga","y":443,"x":-167},{"zone":"Halas","merchant":"Skoni","y":6,"x":-42},{"zone":"Highpass Hold","merchant":"Min Greyeagle","y":197,"x":461},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Petra D`Dbth","y":1362,"x":-1716},{"zone":"Oggok","merchant":"Kerplooe Dirtcarver","y":238,"x":756},{"zone":"Rivervale","merchant":"Marta Claytoe","y":-160,"x":-90},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-474},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Thurgadin","merchant":"Brina Snowfox","y":-257,"x":134}],
  "Medium Quality Folded Sheet Metal": [{"zone":"South Qeynos","merchant":"Liln Sedder","y":535,"x":-41}],
  "Metal Fastening": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Metal Rod": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875},{"zone":"Steamfont Mountains","merchant":"a mechanical merchant","y":1622,"x":-1728}],
  "Metal Twine": [{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Onyx": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Oasis of Marr","merchant":"Innkeep Marnan","y":-1321,"x":-261},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54}],
  "Opal": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Brackin Nartoise","y":-3978,"x":2612},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Highpass Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54}],
  "Pant Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":954,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":977,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Fugan Mumfur","y":-1500,"x":2876},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Demicla Tanner","y":-689,"x":-101},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Felwithe","merchant":"Merchant Tissan","y":-122,"x":-359},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sissin Tanner","y":44,"x":-550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sanhan Tanner","y":72,"x":-568},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winlar Tanner","y":38,"x":-561},{"zone":"Greater Faydark","merchant":"Merchant Aluwenae","y":-336,"x":-116},{"zone":"Grobb","merchant":"Bimuk","y":517,"x":-221},{"zone":"Grobb","merchant":"Jarlok","y":390,"x":-301},{"zone":"Halas","merchant":"Cindl","y":270,"x":-171},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Kalameky Darkfoam","y":173,"x":389},{"zone":"Kithicor Forest","merchant":"Lena Leatherspinner","y":-265,"x":4000},{"zone":"Misty Thicket","merchant":"Sonsa Fromp","y":672,"x":-2211},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Jarvah","y":-222,"x":-366},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Medron Y`Lask","y":769,"x":-1310},{"zone":"Oggok","merchant":"Juk Hidebeater","y":368,"x":-202},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fhara Semhart","y":399,"x":-80},{"zone":"Rathe Mountains","merchant":"Chizzlik","y":1719,"x":1310},{"zone":"Rivervale","merchant":"Twippie Diggs","y":-116,"x":-211},{"zone":"Thurgadin","merchant":"Mauren Frostbeard","y":-146,"x":218},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Peridot": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1074,"x":-1041},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1045,"x":-1011},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1053,"x":-1012},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Visar Glolith","y":330,"x":753},{"zone":"East Commonlands","merchant":"Pardor the Blessed","y":-121,"x":-780},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"East Commonlands","merchant":"Lyth Spellstar","y":269,"x":4915},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Jeliala Glimmercharm","y":507,"x":765},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Tika Shockstep","y":917,"x":721},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Gwynora Armista","y":555,"x":749},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Andane Starinen","y":864,"x":737},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Harban Ranflash","y":695,"x":883},{"zone":"Everfrost Peaks","merchant":"Magus Delin","y":1798,"x":-5028},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Felwithe","merchant":"Merchant Lyssia","y":580,"x":-872},{"zone":"Felwithe","merchant":"Merchant Jewyln","y":567,"x":-609},{"zone":"Felwithe","merchant":"Merchant Earlyn","y":464,"x":-348},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Banor Raglesin","y":-226,"x":-232},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Jarel Ranin","y":158,"x":-734},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Dulia Jestes","y":19,"x":-817},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Voglan Dransed","y":155,"x":-762},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysa Truegreen","y":117,"x":-719},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Zasrin Blueflame","y":148,"x":-763},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Mekoma Buma","area":"Caster's guild, 3rd floor.","y":145,"x":-761},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Halas","merchant":"Greta Terrilon","y":279,"x":-328},{"zone":"High Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"High Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"Kael Drakkel","merchant":"Ymik","y":-1740,"x":1932},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Kithicor Forest","merchant":"Jeena Firechaser","y":-216,"x":3813},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Veca S`Karn","y":178,"x":-919},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Genzal R`Jyen","y":119,"x":-919},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Mirzna N`Mar","y":167,"x":-875},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Xantis Ixtax","y":1335,"x":-1236},{"zone":"Northern Desert of Ro","merchant":"Magus Arindri","y":2649,"x":923},{"zone":"Oggok","merchant":"Hrak","y":821,"x":849},{"zone":"The Overthere","merchant":"Tin Merchant IV","y":2663,"x":2548},{"zone":"Paineel","merchant":"Linnleu Brackmar","y":734,"x":820},{"zone":"Paineel","merchant":"Keletha Nightweaver","y":734,"x":861},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Hanlore Escaval","y":303,"x":-569},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Temple of Solusek Ro","merchant":"Terblyn Zelbus","y":444,"x":-73},{"zone":"Southern Desert of Ro","merchant":"Magus Jerira","y":-1478,"x":1063},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Western Plains of Karana","merchant":"Innkeep Danin","y":-1514,"x":-13005},{"zone":"Toxxulia Forest","merchant":"Tran Lilspin","y":1761,"x":-736},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719},{"zone":"Toxxulia Forest","merchant":"Islan Hetston","y":2251,"x":1008}],
  "Plate Bracer Mold": [{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Nerrisia Irontree","y":-88,"x":-395},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Valentin Fireheart","y":54,"x":-167},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Liln Sedder","y":537,"x":-45}],
  "Plate Helm Mold": [{"zone":"Northern Felwithe","zonePage":"Felwithe","merchant":"Nerrisia Irontree","y":-88,"x":-395},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Valentin Fireheart","y":54,"x":-167},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Liln Sedder","y":537,"x":-45}],
  "Platemail Helm": [{"zone":"Erudin","merchant":"Jagen Kindlor","y":-709,"x":-286},{"zone":"Felwithe","merchant":"Merchant Irontree","y":-106,"x":-384},{"zone":"Firiona Vie","merchant":"Gearin Gaxx","y":-2844,"x":2753},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ikthar Fireheart","y":42,"x":-201},{"zone":"Greater Faydark","merchant":"Merchant Tananie","y":389,"x":627},{"zone":"Greater Faydark","merchant":"Merchant Tegdian","y":743,"x":56},{"zone":"Paineel","merchant":"Faratain","y":938,"x":421},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Meera Lylon","y":190,"x":-314},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Lanhern Firepride","y":190,"x":-314},{"zone":"Rathe Mountains","merchant":"Zok Kilikko","y":-2208,"x":177}],
  "Platinum Bar": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1356,"x":-882},{"zone":"North Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"North Freeport","merchant":"Amber","y":-182.6,"x":203.66},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Nora","y":144,"x":-414},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Zartox Ru`Soe","y":82,"x":-901},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Quiver Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Alga Bruntbuckler","y":-1185,"x":-1957},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Stitch","y":128,"x":-9},{"zone":"Erudin","merchant":"Gayle Weaven","y":245,"x":88},{"zone":"Everfrost Peaks","merchant":"Seria O`Danos","y":3608,"x":701},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Firiona Vie","merchant":"Dionin Needlespin","y":-3642,"x":1985},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"Greater Faydark","merchant":"Merchant Gaeadin","y":-114,"x":-131},{"zone":"Highpass Hold","merchant":"Dyona Rossook","y":-248,"x":135},{"zone":"Misty Thicket","merchant":"Tipa Lighten","y":581,"x":-2202},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Hutyn L`Lozz","y":747,"x":-1293},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Western Plains of Karana","merchant":"Alysa","y":431,"x":-4364},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Iala Lenard","y":177,"x":-148},{"zone":"Steamfont Mountains","merchant":"Freed Fimplefur","y":-1696,"x":829},{"zone":"Thurgadin","merchant":"Rexx Frostweaver","y":-272,"x":133}],
  "Ruby": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"South Felwithe","merchant":"Merchant Tyslin (South Felwithe)","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54}],
  "Sapphire": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Jade (Merchant)","y":-169,"x":202},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Sculpting Tools": [{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Sealed Vial Sketch": [{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Set of Bone Arrow Vanes": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Set of Ceramic Arrow Vanes": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Set of Wooden Arrow Vanes": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Ping Fuzzlecutter","y":-269,"x":535},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Several Parabolic Cut Fletchings": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Several Round Cut Fletchings": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Several Shield Cut Fletchings": [{"zone":"Ak'Anon","merchant":"a clockwork bowyer","y":1250,"x":-879},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Zotalz","y":344,"x":526},{"zone":"East Commonlands","merchant":"Joryd Longarms","y":989,"x":3757},{"zone":"Eastern Plains of Karana","merchant":"Bryan","y":-886,"x":-12},{"zone":"Felwithe","merchant":"Merchant Longarrow","y":-70,"x":-342},{"zone":"Firiona Vie","merchant":"Fleceal Summer","y":-3426,"x":3327},{"zone":"Greater Faydark","merchant":"Merchant Lanin","y":414,"x":329},{"zone":"Greater Faydark","merchant":"Merchant Tiladinya","y":-360,"x":-611},{"zone":"Greater Faydark","merchant":"Merchant Neaien","y":414,"x":464},{"zone":"Grobb","merchant":"Zazhar","y":441,"x":-271},{"zone":"Halas","merchant":"Rain","y":175,"x":-296},{"zone":"Iceclad Ocean","merchant":"Adinel Jailbar","y":4540,"x":1287},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Alanury Stormhammer","y":137,"x":232},{"zone":"Kithicor Forest","merchant":"Krile Arrowsmith","y":-332,"x":3882},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Andara C`Luzz","y":-135,"x":-1062},{"zone":"New Sebilis Expedition","merchant":"Klok Esrek","y":226,"x":-144},{"zone":"Oggok","merchant":"Praak","y":-329,"x":496},{"zone":"The Overthere","merchant":"Tin Merchant X","y":2697,"x":2620},{"zone":"Western Plains of Karana","merchant":"Brenzl McMannus","y":-3686,"x":-2002},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Danon Fletcher","y":414,"x":-259},{"zone":"Surefall Glade","merchant":"Livam T`Lant","y":-108,"x":-271},{"zone":"Surefall Glade","merchant":"Jarse Kedison","y":105,"x":105},{"zone":"Rivervale","merchant":"Joana Jinklebelly","y":-233,"x":-82},{"zone":"Steamfont Mountains","merchant":"a clockwork fletcher","y":79,"x":-661},{"zone":"Thurgadin","merchant":"Tavir","y":-187,"x":-298}],
  "Sharkskin Tubing": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Sheet Metal": [{"zone":"East Freeport","zonePage":"Freeport","merchant":"Issilyn Ristan","area":"Inside Armor by Ikthar","y":72,"x":-214},{"zone":"Toxxulia Forest","merchant":"Win Karnam","y":2247,"x":979},{"zone":"New Sebilis Expedition","merchant":"Klok Rento","y":297,"x":-101},{"zone":"Qeynos Hills","merchant":"Marton Sayer","y":1381,"x":278},{"zone":"Greater Faydark","merchant":"Merchant Linolyen","y":110,"x":345},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Nalgoz","y":239,"x":-290}],
  "Short Beer": [{"zone":"Ak'Anon","merchant":"a clockwork barkeep","y":1252,"x":-946},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"West Commonlands","merchant":"Innkeep Seke","y":-104,"x":465},{"zone":"West Commonlands","merchant":"Innkeep Roster","y":-149,"x":452},{"zone":"West Commonlands","merchant":"Innkeep Redthorn","y":-401,"x":2763},{"zone":"West Commonlands","merchant":"Innkeep Olissa","y":-384,"x":2714},{"zone":"Crystal Caverns","merchant":"Hardat Gemshard","y":-243,"x":177},{"zone":"Crystal Caverns","merchant":"Grabble Coldheart","y":-261,"x":165},{"zone":"East Commonlands","merchant":"Innkeep Harold","y":-187,"x":117},{"zone":"East Commonlands","merchant":"Innkeep Dolman","y":1028,"x":3682},{"zone":"East Commonlands","merchant":"Innkeep Leo","y":-319,"x":2977},{"zone":"East Commonlands","merchant":"Innkeep Juna","y":-334,"x":3022},{"zone":"East Commonlands","merchant":"Innkeep Elora","y":-184,"x":71},{"zone":"East Commonlands","merchant":"Innkeep Fenia","y":1021,"x":3731},{"zone":"East Commonlands","merchant":"Innkeep Calen","y":315,"x":4890},{"zone":"East Commonlands","merchant":"Innkeep Blaise","y":332,"x":4842},{"zone":"Erudin","merchant":"Geoard BlueHawk","y":-1175,"x":-331},{"zone":"The Feerrott","merchant":"Innkeep Gub","y":1144,"x":1444},{"zone":"The Feerrott","merchant":"Innkeep Morpa","y":1144,"x":-145},{"zone":"Firiona Vie","merchant":"Samson","y":-2952,"x":2977},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lunce Nasin","y":-233,"x":-863},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Paggie","y":-7,"x":-232},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Rastle","y":-22,"x":-285},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lynda Tapper","y":-296,"x":-213},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Nesin Tapper","y":-280,"x":-205},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Nasumi","y":-77,"x":-720},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Hunter","y":-77,"x":-699},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Jaleel Hoglomp","y":44,"x":-746},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","y":-238,"x":-835},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Myrissa O`Donner","y":83,"x":-435},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Slan ODonner","y":76,"x":-335},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Cloud Alemaker","y":116,"x":-267},{"zone":"East Freeport","zonePage":"Freeport","merchant":"River Alemaker","y":127,"x":-270},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sun Alemaker","y":127,"x":-254},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gern Tassel","y":70,"x":-57},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Palola","y":-187,"x":-63},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Judicla Riverfield","y":70,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Shania Tassel","y":85,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Rille","y":72,"x":72},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Evelona","y":70,"x":56},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Drona Whystlethin","y":-120,"x":-473},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Swin Blackeye","y":-158,"x":-527},{"zone":"Greater Faydark","merchant":"Innkeep Anisyla","y":-247,"x":-435},{"zone":"Greater Faydark","merchant":"Innkeep Wuleran","y":-337,"x":141},{"zone":"Greater Faydark","merchant":"Innkeep Larya","y":940,"x":306},{"zone":"Greater Faydark","merchant":"Innkeep Linen","y":726,"x":459},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Halas","merchant":"Hetie McDonald","y":240,"x":-154},{"zone":"Halas","merchant":"Brandyn McDonald","y":182,"x":-157},{"zone":"Halas","merchant":"Brin McQuaid","y":93,"x":-216},{"zone":"Halas","merchant":"Donald McQuaid","y":93,"x":-206},{"zone":"Halas","merchant":"Scon McDaniel","y":345,"x":-347},{"zone":"Highpass Keep","merchant":"Dealer Shonta","y":-54,"x":-324},{"zone":"Highpass Hold","merchant":"Bartender","y":395,"x":-184},{"zone":"Highpass Hold","merchant":"Bartender","y":403,"x":-165},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Tumpy Irontoe","y":178,"x":313},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dura Darkfoam","y":108,"x":233},{"zone":"Kerra Island","merchant":"Raarrk","y":108,"x":131},{"zone":"Kithicor Forest","merchant":"Innkeep Min","y":1465,"x":2383},{"zone":"Kithicor Forest","merchant":"Innkeep Jurn","y":-281,"x":3821},{"zone":"Kithicor Forest","merchant":"Innkeep Grace","y":1095,"x":-684},{"zone":"Lake Rathetear","merchant":"Abrod","y":-433,"x":657},{"zone":"Lesser Faydark","merchant":"Anelia Thrywiel","y":-307,"x":1242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Damar Nislan","y":177,"x":-196},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Bull Crusher","y":-390,"x":-252},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tala Felton","y":136,"x":-98},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Darien Felton","y":136,"x":-93},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tanai Tanbor","y":215,"x":-242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sera Buelle","y":255,"x":-262},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Uawn Betell","y":246,"x":-227},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Yala Thiss","y":242,"x":-265},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Slunga","y":-336,"x":-194},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Dunred M`Trik","y":71,"x":-866},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rysva To`Biath","y":11,"x":-848},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Marenkor To`Biath","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Volkoon D`Dbth","y":-43,"x":-1030},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":-97,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Lysanda S`Kor","y":40,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Frivsa Punox","y":35,"x":-1238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Svlis C`Luzz","y":-90,"x":-1239},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rista S`lon","y":-152,"x":-1011},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Tenso H`Rugla","y":-153,"x":-1042},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Belyea K`Jartan","y":864,"x":-1424},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Cecile K`Jartan","y":910,"x":-1413},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Grazis L`Crit","y":703,"x":-1472},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Katara L`Crit","y":701,"x":-1474},{"zone":"Northern Karana","merchant":"Romi","y":-618,"x":-201},{"zone":"Northern Karana","merchant":"Barkeep Milo","y":432,"x":2248},{"zone":"Northern Karana","merchant":"Barkeep Jeny","y":416,"x":2222},{"zone":"Northern Karana","merchant":"Innkeep Disda","y":118,"x":1382},{"zone":"Northern Karana","merchant":"Innkeep James","y":156,"x":1379},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3466,"x":489},{"zone":"Northern Desert of Ro","merchant":"Innkeep Valon","y":3415,"x":503},{"zone":"Oasis of Marr","merchant":"Tran","y":541,"x":-43},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"Oasis of Marr","merchant":"Innkeep Marnan","y":-1321,"x":-261},{"zone":"Oggok","merchant":"Clurg","y":262,"x":-249},{"zone":"Oggok","merchant":"Crunga","y":548,"x":-176},{"zone":"Oggok","merchant":"Erung","y":512,"x":-183},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Paineel","merchant":"Loleluz","y":949,"x":822},{"zone":"Paineel","merchant":"Archenm","y":945,"x":829},{"zone":"Paineel","merchant":"Lolenton","y":950,"x":836},{"zone":"Paineel","merchant":"Gernatis","y":944,"x":848},{"zone":"Paineel","merchant":"Taralani Rahnta","y":934,"x":805},{"zone":"Western Plains of Karana","merchant":"Innkeep Danin","y":-1514,"x":-13005},{"zone":"Western Plains of Karana","merchant":"Innkeep Rislarn","y":326,"x":-4417},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sunsa Jocub","y":-305,"x":-276},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"McNeal Jocub","y":-244,"x":-261},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fish Ranamer","y":-292,"x":-269},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Rucio Divella","y":330,"x":-507},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sissy Huntlan","y":231,"x":-129},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Tasya Huntlan","y":259,"x":-69},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Nug Rellash","y":256,"x":-170},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Earron Huntlan","y":254,"x":-191},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Crow","y":91,"x":358},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ania Klephia","y":115,"x":359},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sabnie Blagard","y":81,"x":368},{"zone":"Rathe Mountains","merchant":"Philicia Drinn","y":4002,"x":-1359},{"zone":"Rathe Mountains","merchant":"Sven Drinn","y":3992,"x":-1383},{"zone":"Rathe Mountains","merchant":"Innkeep Troy","y":4283,"x":842},{"zone":"Rathe Mountains","merchant":"Innkeep Serge","y":4294,"x":831},{"zone":"RunnyEye Citadel","merchant":"A goblin bartender","y":75,"x":90},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Thurgadin","merchant":"Loremaster Fronden","y":-395,"x":452},{"zone":"Thurgadin","merchant":"Karey","y":-38,"x":84},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":119,"x":-406},{"zone":"Thurgadin","merchant":"Klarp Bartleby","y":61,"x":-380},{"zone":"Thurgadin","merchant":"Bixx Bartleby","y":45,"x":-380},{"zone":"Thurgadin","merchant":"Adia Coldbeard","y":-57,"x":107},{"zone":"Thurgadin","merchant":"Doogle McBanick","y":-56,"x":-311},{"zone":"Thurgadin","merchant":"Fogerty Bottlenip","y":-311,"x":-27},{"zone":"Thurgadin","merchant":"Durgan Bottlenip","y":-329,"x":-28},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":52,"x":928},{"zone":"Timorous Deep","merchant":"Portik Grolam","y":-11592,"x":-2275},{"zone":"Timorous Deep","merchant":"Micus Vloren","y":-5195,"x":-4335}],
  "Shotglass": [{"zone":"Ak'Anon","merchant":"a clockwork barkeep","y":1252,"x":-946},{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Poklon","y":913,"x":-85},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"West Commonlands","merchant":"Innkeep Seke","y":-104,"x":465},{"zone":"West Commonlands","merchant":"Innkeep Redthorn","y":-401,"x":2763},{"zone":"Crystal Caverns","merchant":"Hardat Gemshard","y":-243,"x":177},{"zone":"Crystal Caverns","merchant":"Grabble Coldheart","y":-261,"x":165},{"zone":"East Commonlands","merchant":"Innkeep Leo","y":-319,"x":2977},{"zone":"East Commonlands","merchant":"Innkeep Elora","y":-184,"x":71},{"zone":"East Commonlands","merchant":"Innkeep Fenia","y":1021,"x":3731},{"zone":"East Commonlands","merchant":"Innkeep Calen","y":315,"x":4890},{"zone":"Felwithe","merchant":"Wela Muselender","y":102,"x":-343},{"zone":"Felwithe","merchant":"Tyle Songwhisper","y":76,"x":-368},{"zone":"Firiona Vie","merchant":"Samson","y":-2952,"x":2977},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Lynda Tapper","y":-296,"x":-213},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Cloud Alemaker","y":116,"x":-267},{"zone":"East Freeport","zonePage":"Freeport","merchant":"River Alemaker","y":127,"x":-270},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sun Alemaker","y":127,"x":-254},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Roghur Muleson","y":-24,"x":-492},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Galio","y":-187,"x":-41},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Judicla Riverfield","y":70,"x":-34},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Shania Tassel","y":85,"x":-34},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Drona Whystlethin","y":-120,"x":-473},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Swin Blackeye","y":-158,"x":-527},{"zone":"Greater Faydark","merchant":"Barkeep Tvanla","y":-515,"x":-550},{"zone":"Greater Faydark","merchant":"Barkeep Sissya","y":-564,"x":-558},{"zone":"Greater Faydark","merchant":"Barkeep Myrisa","y":394,"x":677},{"zone":"Greater Faydark","merchant":"Barkeep Lysslan","y":123,"x":805},{"zone":"Greater Faydark","merchant":"Barkeep Tuviena","y":132,"x":822},{"zone":"Greater Faydark","merchant":"Barkeep Syntan","y":881,"x":93},{"zone":"Greater Faydark","merchant":"Barkeep Uulianu","y":286,"x":520},{"zone":"Greater Faydark","merchant":"Barkeep Manlawen","y":322,"x":542},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Halas","merchant":"Brandyn McDonald","y":182,"x":-157},{"zone":"Halas","merchant":"Brin McQuaid","y":93,"x":-216},{"zone":"Halas","merchant":"Donald McQuaid","y":93,"x":-206},{"zone":"Halas","merchant":"Scon McDaniel","y":345,"x":-347},{"zone":"Highpass Keep","merchant":"Dealer Shonta","y":-54,"x":-324},{"zone":"Highpass Hold","merchant":"Paulina","y":-234,"x":9},{"zone":"Highpass Hold","merchant":"Bartender","y":395,"x":-184},{"zone":"Highpass Hold","merchant":"Bartender","y":403,"x":-165},{"zone":"Highpass Hold","merchant":"Bartholemew","y":-212,"x":11},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Tumpy Irontoe","y":178,"x":313},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dura Darkfoam","y":108,"x":233},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"Kerra Island","merchant":"Raarrk","y":108,"x":131},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Damar Nislan","y":177,"x":-196},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tala Felton","y":136,"x":-98},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Darien Felton","y":136,"x":-93},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tanai Tanbor","y":215,"x":-242},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sera Buelle","y":255,"x":-262},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Uawn Betell","y":246,"x":-227},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Yala Thiss","y":242,"x":-265},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Slunga","y":-336,"x":-194},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ghrag","y":-259,"x":-260},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rysva To`Biath","y":11,"x":-848},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Marenkor To`Biath","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":9,"x":-837},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Myrva N`Tan","y":-97,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Lysanda S`Kor","y":40,"x":-1218},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Frivsa Punox","y":35,"x":-1238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Svlis C`Luzz","y":-90,"x":-1239},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Rista S`lon","y":-152,"x":-1011},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Tenso H`Rugla","y":-153,"x":-1042},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Grazis L`Crit","y":703,"x":-1472},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Katara L`Crit","y":701,"x":-1474},{"zone":"Northern Karana","merchant":"Barkeep Milo","y":432,"x":2248},{"zone":"Northern Karana","merchant":"Barkeep Jeny","y":416,"x":2222},{"zone":"Northern Desert of Ro","merchant":"Innkeep Tozie","y":3466,"x":489},{"zone":"Oasis of Marr","merchant":"Innkeep Tizzy","y":-1307,"x":-306},{"zone":"Oggok","merchant":"Korgarg Swillchugger","y":182,"x":-235},{"zone":"Paineel","merchant":"Loleluz","y":949,"x":822},{"zone":"Paineel","merchant":"Archenm","y":945,"x":829},{"zone":"Paineel","merchant":"Lolenton","y":950,"x":836},{"zone":"Paineel","merchant":"Gernatis","y":944,"x":848},{"zone":"Paineel","merchant":"Taralani Rahnta","y":934,"x":805},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sunsa Jocub","y":-305,"x":-276},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"McNeal Jocub","y":-244,"x":-261},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fish Ranamer","y":-292,"x":-269},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Rucio Divella","y":330,"x":-507},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Sissy Huntlan","y":231,"x":-129},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Tasya Huntlan","y":259,"x":-69},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Nug Rellash","y":256,"x":-170},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Earron Huntlan","y":254,"x":-191},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ania Klephia","y":115,"x":359},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sabnie Blagard","y":81,"x":368},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"Rivervale","merchant":"Mac Deeppockets","y":-64,"x":-188},{"zone":"Rivervale","merchant":"Flyndia Deeppockets","y":-49,"x":-207},{"zone":"RunnyEye Citadel","merchant":"A goblin bartender","y":75,"x":90},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Thurgadin","merchant":"Loremaster Fronden","y":-395,"x":452},{"zone":"Thurgadin","merchant":"Karey","y":-38,"x":84},{"zone":"Thurgadin","merchant":"Celtir Gronback","y":119,"x":-406},{"zone":"Thurgadin","merchant":"Klarp Bartleby","y":61,"x":-380},{"zone":"Thurgadin","merchant":"Bixx Bartleby","y":45,"x":-380},{"zone":"Thurgadin","merchant":"Adia Coldbeard","y":-57,"x":107},{"zone":"Thurgadin","merchant":"Doogle McBanick","y":-56,"x":-311},{"zone":"Thurgadin","merchant":"Fogerty Bottlenip","y":-311,"x":-27},{"zone":"Thurgadin","merchant":"Durgan Bottlenip","y":-329,"x":-28},{"zone":"Timorous Deep","merchant":"Portik Grolam","y":-11592,"x":-2275},{"zone":"Timorous Deep","merchant":"Micus Vloren","y":-5195,"x":-4335}],
  "Sickle Leaf": [{"zone":"Everfrost Peaks","merchant":"Sven Felligan","y":2848,"x":-3454},{"zone":"Innothule Swamp","merchant":"Sithgok","y":1169,"x":529},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Silk Lined Steel Helm": [{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Silver Bar": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","area":"Bank and across from the bank","y":1348,"x":-884},{"zone":"North Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"Felwithe","merchant":"Merchant Nora","y":144,"x":-414},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Zartox Ru`Soe","y":82,"x":-901},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","area":"In Fortunes' Fancy","y":1092,"x":722},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Skyshrine","merchant":"Barkeep Droz","y":492,"x":-654},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Sleeve Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":954,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":977,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Fugan Mumfur","y":-1500,"x":2876},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Demicla Tanner","y":-689,"x":-101},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Felwithe","merchant":"Merchant Tissan","y":-122,"x":-359},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sissin Tanner","y":44,"x":-550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sanhan Tanner","y":72,"x":-568},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winlar Tanner","y":38,"x":-561},{"zone":"Greater Faydark","merchant":"Merchant Aluwenae","y":-336,"x":-116},{"zone":"Grobb","merchant":"Bimuk","y":517,"x":-221},{"zone":"Grobb","merchant":"Jarlok","y":390,"x":-301},{"zone":"Halas","merchant":"Cindl","y":270,"x":-171},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Kalameky Darkfoam","y":173,"x":389},{"zone":"Kithicor Forest","merchant":"Lena Leatherspinner","y":-265,"x":4000},{"zone":"Misty Thicket","merchant":"Sonsa Fromp","y":672,"x":-2211},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Jarvah","y":-222,"x":-366},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Medron Y`Lask","y":769,"x":-1310},{"zone":"Oggok","merchant":"Juk Hidebeater","y":368,"x":-202},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fhara Semhart","y":399,"x":-80},{"zone":"Rathe Mountains","merchant":"Chizzlik","y":1719,"x":1310},{"zone":"Rivervale","merchant":"Twippie Diggs","y":-116,"x":-211},{"zone":"Thurgadin","merchant":"Mauren Frostbeard","y":-146,"x":218},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Small Block of Clay": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"Ak'Anon","merchant":"a clockwork potter","y":750,"x":-173},{"zone":"Butcherblock Mountains","merchant":"Izbal Brightblaze","y":-1287,"x":-1972},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Hoga","y":253,"x":-202},{"zone":"East Commonlands","merchant":"Merra Clayfinger","y":-135,"x":21},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Kyrin Steelbone","y":-21,"x":470},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Gurb Smithson","y":-183,"x":-329},{"zone":"Greater Faydark","merchant":"Merchant Legweien","y":420,"x":373},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"Halas","merchant":"Merin","y":260,"x":273},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"Highpass Hold","merchant":"Winn Greenbane","y":-364,"x":-124},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Dooni","y":224,"x":-254},{"zone":"Misty Thicket","merchant":"Topper Drodo","y":585,"x":-2357},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"ChonChon","y":147,"x":-92},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-116},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Helgara Dirtcarver","y":225,"x":743},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"The Overthere","merchant":"Tin Merchant VI","y":2614,"x":2557},{"zone":"Paineel","merchant":"Tentus Brackmar","y":995,"x":810},{"zone":"Paineel","merchant":"Evus Doracmal","y":996,"x":817},{"zone":"Paineel","merchant":"Taria Clayspinner","y":994,"x":804},{"zone":"Western Plains of Karana","merchant":"Tarnar","y":1008,"x":-2087},{"zone":"Rivervale","merchant":"Bodbin Gimple","y":-80,"x":-370},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Stonebrunt Mountains","merchant":"Jaimiou Claypaws","y":1391,"x":-536},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109},{"zone":"Thurgadin","merchant":"Gilthan Brittleblade","y":-249,"x":134}],
  "Small Brick of Ore": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Kyrin Steelbone","y":-21,"x":470},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Bloarn Norkhitter","y":727,"x":213},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-116},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"Paineel","merchant":"Tentus Brackmar","y":995,"x":810},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109}],
  "Small Piece of Ore": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"Cabilis (East)","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"Freeport (North)","zonePage":"Freeport","merchant":"Kyrin Steelbone","area":"In Groflah's Forge","y":-21,"x":470},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"Halas","merchant":"April","y":173,"x":-306},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"Kaladim (North)","zonePage":"Kaladim","merchant":"Bloarn Norkhitter","y":727,"x":213},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-114},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"Paineel","merchant":"Tentus Brackmar","y":995,"x":810},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109}],
  "Small Plate Boot Mold": [{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Trista N`Ryt","y":70,"x":-857},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Krystiana N`Ryt","y":857,"x":-1499},{"zone":"Ak'Anon","merchant":"a clockwork armorer","y":1324,"x":-749},{"zone":"Ak'Anon","merchant":"a clockwork armorer","y":1228,"x":-706},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Tortuk Everhot","y":350,"x":-206}],
  "Small Vial": [{"zone":"Ak'Anon","merchant":"a clockwork alchemist"},{"zone":"Grobb","merchant":"Raztara"},{"zone":"Halas","merchant":"Murtog MacYee"},{"zone":"Neriak - Foreign Quarter","merchant":"Gambel Quick","area":"Gambels Greens located in the far north of the zone","y":253,"x":-59},{"zone":"Neriak Commons","merchant":"Marza T`Kix","area":"Bounty of the Earth in the Neriak Down Under area","y":19,"x":-880},{"zone":"Rivervale","merchant":"Kizzie Mintopp"}],
  "Smithy Hammer": [{"zone":"Ak'Anon","merchant":"a clockwork miner","y":760,"x":-155},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Toren","y":190,"x":-303},{"zone":"Erudin","merchant":"Shinan Orefinder","y":-683,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Kyrin Steelbone","y":-21,"x":470},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Trudie Steelbone","y":-34,"x":470},{"zone":"Grobb","merchant":"Okun","y":683,"x":-412},{"zone":"Halas","merchant":"Greta O`Reilly","y":78,"x":-245},{"zone":"High Keep","merchant":"Miner Harton","y":42,"x":-273},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Bloarn Norkhitter","y":727,"x":213},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Harnoff Splitrock","y":726,"x":188},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Glazn D`Unnar","y":46,"x":-796},{"zone":"New Sebilis Expedition","merchant":"Klok Lagnoz","y":280,"x":-116},{"zone":"Northern Felwithe","merchant":"Bedida Claygrinder","area":"upstairs in The Shop of All Holos","y":103,"x":-422},{"zone":"Oggok","merchant":"Bubbgrib","y":288,"x":-211},{"zone":"Oggok","merchant":"Blergerda","y":191,"x":915},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Yakem Oreslinger","y":542,"x":-81},{"zone":"Rathe Mountains","merchant":"Ukla","y":1731,"x":1289},{"zone":"Rivervale","merchant":"Bodbin Gimple","y":-80,"x":-370},{"zone":"Steamfont Mountains","merchant":"Godbin Strumharp","y":43,"x":-618},{"zone":"Stonebrunt Mountains","merchant":"Kevar Claypaws","y":1390,"x":-579},{"zone":"Thurgadin","merchant":"Nimren Stonecutter","y":46,"x":-109}],
  "Spices": [{"zone":"Ak'Anon","merchant":"a clockwork baker","y":891,"x":-301},{"zone":"Butcherblock Mountains","merchant":"Urazun Thranon","y":2794,"x":-883},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sweetzie","y":551,"x":159},{"zone":"Crystal Caverns","merchant":"Praps Gemshard","y":-250,"x":370},{"zone":"East Commonlands","merchant":"Parthar","y":-119,"x":240},{"zone":"The Feerrott","merchant":"Bup","y":1182,"x":117},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Pincia Brownloe","y":-276,"x":-698},{"zone":"Halas","merchant":"Sissia","y":368,"x":-329},{"zone":"Misty Thicket","merchant":"Bim Buskin","y":905,"x":-2345},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Niz L`Crit","y":82,"x":-884},{"zone":"The Overthere","merchant":"Tin Merchant XI","y":2663,"x":2548},{"zone":"Western Plains of Karana","merchant":"Chrislin Baker","y":1048,"x":-1989},{"zone":"Western Plains of Karana","merchant":"Cleet Miller Jr","y":-3013,"x":-5735},{"zone":"Skyshrine","merchant":"Chef Kollof","y":142,"x":-474},{"zone":"Steamfont Mountains","merchant":"Finkel Rardobaen","y":-1515,"x":-1844},{"zone":"Stonebrunt Mountains","merchant":"Chef Stead","y":1348,"x":-490},{"zone":"Thurgadin","merchant":"Perkins Doughbeard","y":-279,"x":134},{"zone":"Toxxulia Forest","merchant":"Quana Rainsparkle","y":2171,"x":-1111}],
  "Star Rose Quartz": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1053,"x":-1012},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"East Commonlands","merchant":"Katha Firespinner","y":234,"x":4731},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Jeliala Glimmercharm","y":507,"x":765},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Frena Runeflash","y":732,"x":953},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Gwynora Armista","y":555,"x":749},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Felwithe","merchant":"Merchant Lyssia","y":580,"x":-872},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Jade","y":-169,"x":202},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Dulia Jestes","y":19,"x":-817},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysa Truegreen","y":117,"x":-719},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Lysin Smokkan","y":134,"x":-750},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"High Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Veca S`Karn","y":178,"x":-919},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"Oasis of Marr","merchant":"Innkeep Marnan","y":-1321,"x":-261},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Southern Desert of Ro","merchant":"Merchant Ulyssa","y":128,"x":495},{"zone":"Southern Desert of Ro","merchant":"Smith Tv`ysa","y":93,"x":487},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Southern Desert of Ro","merchant":"Artist Passia","y":160,"x":444},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Toxxulia Forest","merchant":"Cyria Lorewhisper","y":1800,"x":-719},{"zone":"Toxxulia Forest","merchant":"Xylania Rainsparkle","y":2202,"x":-1128}],
  "Star Ruby": [{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Sothure Gemcutter","y":731,"x":552},{"zone":"West Commonlands","merchant":"Noresa Sparkle","y":-701,"x":267},{"zone":"Felwithe","merchant":"Merchant Silspin","y":242,"x":-606},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Amber (NPC)","y":-184,"x":202},{"zone":"Greater Faydark","merchant":"Merchant Kweili","y":411,"x":245},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Canarie","y":-268,"x":-172},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ziska Ironforge","y":52,"x":60},{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1347,"x":-952},{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1332,"x":-917},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Aanina Rockfinder","y":401,"x":-156},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Oxmod","y":638,"x":157},{"zone":"Firiona Vie","merchant":"Brisha Fyrestone","y":-3615,"x":2405},{"zone":"The Overthere","merchant":"Tin Merchant III","y":2678,"x":2565},{"zone":"Paineel","merchant":"Dannis Faleet","y":1092,"x":722},{"zone":"Thurgadin","merchant":"Talem Tucter","y":-334,"x":-71}],
  "Static Orb": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Kael Drakkel","merchant":"Bendad the Trader","y":-1658,"x":1953},{"zone":"The Overthere","merchant":"Tin Merchant V","y":2612,"x":2527},{"zone":"Steamfont Mountains","merchant":"Bom Knotwood","y":175,"x":-875}],
  "Topaz": [{"zone":"Ak'Anon","merchant":"a clockwork jeweler","y":1348,"x":-884},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Ixmid","y":659,"x":156},{"zone":"Dreadlands","merchant":"Klok F`tshai","y":780,"x":9140},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Anite Gemcutter","y":784,"x":598},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Glysin Denuen","y":631,"x":574},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Myrcin Denuen","y":697,"x":597},{"zone":"Erudin Palace","zonePage":"Erudin","merchant":"Elbsin Denuen","y":667,"x":574},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":107,"x":-439},{"zone":"Felwithe","merchant":"Merchant Tyslin","y":450,"x":-775},{"zone":"Firiona Vie","merchant":"Dran Hieth","y":-3132,"x":2953},{"zone":"Firiona Vie","merchant":"Drake Mountainstorm","y":-3634,"x":2404},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Aimie Moonspin","y":-54,"x":-246},{"zone":"Greater Faydark","merchant":"Merchant Laedar","y":617,"x":542},{"zone":"Grobb","merchant":"Rezslog","y":455,"x":-178},{"zone":"Grobb","merchant":"Uzak","y":563,"x":-318},{"zone":"High Keep","merchant":"Merchant Edina","y":-97,"x":-294},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":50,"x":926},{"zone":"Kael Drakkel","merchant":"Ymik","y":-1740,"x":1932},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Banaf Norkhitter","y":690,"x":431},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Nekola N`Ryt","y":81,"x":-931},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Telnor D`Unnar","y":816,"x":-1425},{"zone":"The Overthere","merchant":"Finlay Kitoran","y":2769,"x":2365},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Svena Ironforge","y":60,"x":34},{"zone":"Rathe Mountains","merchant":"Darfumpel Zirubbel","y":4093,"x":896},{"zone":"Steamfont Mountains","merchant":"Torodrane Frompwaddle","y":-1602,"x":-1841},{"zone":"Thurgadin","merchant":"Meg Tucter","y":-350,"x":-54},{"zone":"Warsliks Woods","merchant":"Klok Rogalin","y":-1882,"x":-600}],
  "Tunic Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":954,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tanner","y":977,"x":-37},{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Fugan Mumfur","y":-1500,"x":2876},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"Erudin","merchant":"Demicla Tanner","y":-689,"x":-101},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Felwithe","merchant":"Merchant Tissan","y":-122,"x":-359},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sissin Tanner","y":44,"x":-550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Sanhan Tanner","y":72,"x":-568},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winlar Tanner","y":38,"x":-561},{"zone":"Greater Faydark","merchant":"Merchant Aluwenae","y":-336,"x":-116},{"zone":"Grobb","merchant":"Bimuk","y":517,"x":-221},{"zone":"Grobb","merchant":"Jarlok","y":390,"x":-301},{"zone":"Halas","merchant":"Cindl","y":270,"x":-171},{"zone":"Kithicor Forest","merchant":"Lena Leatherspinner","y":-265,"x":4000},{"zone":"Misty Thicket","merchant":"Sonsa Fromp","y":672,"x":-2211},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Jarvah","y":-222,"x":-366},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Medron Y`Lask","y":769,"x":-1310},{"zone":"Oggok","merchant":"Juk Hidebeater","y":368,"x":-202},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Fhara Semhart","y":399,"x":-80},{"zone":"Rathe Mountains","merchant":"Chizzlik","y":1719,"x":1310},{"zone":"Rivervale","merchant":"Twippie Diggs","y":-116,"x":-211},{"zone":"Thurgadin","merchant":"Mauren Frostbeard","y":-146,"x":218},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Valerian Root": [{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Greyscale","y":389,"x":525},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Grobb","merchant":"Blergagg","y":417,"x":-427},{"zone":"Halas","merchant":"Dargon","y":354,"x":356},{"zone":"Innothule Swamp","merchant":"Clork","y":1165,"x":549},{"zone":"Oggok","merchant":"Garakbar","y":287,"x":-389},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
  "Vinegar": [{"zone":"Ak'Anon","merchant":"a clockwork baker","y":891,"x":-301},{"zone":"Butcherblock Mountains","merchant":"Urazun Thranon","y":2794,"x":-883},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sweetzie","y":551,"x":159},{"zone":"Crystal Caverns","merchant":"Praps Gemshard","y":-250,"x":370},{"zone":"East Commonlands","merchant":"Parthar","y":-119,"x":240},{"zone":"The Feerrott","merchant":"Bup","y":1182,"x":117},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Pincia Brownloe","y":-276,"x":-698},{"zone":"Halas","merchant":"Sissia","y":368,"x":-329},{"zone":"Misty Thicket","merchant":"Bim Buskin","y":905,"x":-2345},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Niz L`Crit","y":82,"x":-884},{"zone":"The Overthere","merchant":"Tin Merchant XI","y":2663,"x":2548},{"zone":"Western Plains of Karana","merchant":"Chrislin Baker","y":1048,"x":-1989},{"zone":"Western Plains of Karana","merchant":"Cleet Miller Jr","y":-3013,"x":-5735},{"zone":"Rivervale","merchant":"Bartle Barnick","area":"NO LONGER SPAWNS","y":-142,"x":-358},{"zone":"Skyshrine","merchant":"Chef Kollof","y":142,"x":-474},{"zone":"Steamfont Mountains","merchant":"Finkel Rardobaen","y":-1515,"x":-1844},{"zone":"Stonebrunt Mountains","merchant":"Chef Stead","y":1348,"x":-490},{"zone":"Thurgadin","merchant":"Perkins Doughbeard","y":-279,"x":134},{"zone":"Toxxulia Forest","merchant":"Quana Rainsparkle","y":2171,"x":-1111}],
  "Violet Tri-Tube Sap": [{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Greyscale","y":389,"x":525},{"zone":"Everfrost Peaks","merchant":"Guri","y":2894,"x":-3400},{"zone":"Innothule Swamp","merchant":"Clork","y":1165,"x":549}],
  "Water Flask": [{"zone":"Ak'Anon","merchant":"Rylin Coil","y":1469,"x":-190},{"zone":"Ak'Anon","merchant":"a clockwork grocer","y":904,"x":-284},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":484,"x":-115},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1242,"x":-775},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1284,"x":-915},{"zone":"Ak'Anon","merchant":"a clockwork merchant","y":1328,"x":-778},{"zone":"Butcherblock Mountains","merchant":"Iglan Thranon","y":2806,"x":-904},{"zone":"Butcherblock Mountains","merchant":"Gamin Griststone","y":2718,"x":-941},{"zone":"Butcherblock Mountains","merchant":"Parn Gylwyn","y":1465,"x":2817},{"zone":"Butcherblock Mountains","merchant":"Felen Razdal","y":129,"x":2383},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sweetzie","y":551,"x":160},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Lybar","y":292,"x":523},{"zone":"West Commonlands","merchant":"Innkeep Roster","y":-149,"x":452},{"zone":"West Commonlands","merchant":"Innkeep Olissa","y":-384,"x":2714},{"zone":"Crystal Caverns","merchant":"Milliace Gemshard","y":-263,"x":233},{"zone":"Dreadlands","merchant":"Klok F`tshai","y":780,"x":9140},{"zone":"Eastern Plains of Karana","merchant":"Paulina","y":-732,"x":-194},{"zone":"Eastern Plains of Karana","merchant":"Bradly","y":-856,"x":-99},{"zone":"Eastern Plains of Karana","merchant":"Stace","y":1227,"x":-2645},{"zone":"Eastern Plains of Karana","merchant":"Sorn","y":1198,"x":-2634},{"zone":"Eastern Plains of Karana","merchant":"Sharna","y":-3790,"x":-2399},{"zone":"Eastern Plains of Karana","merchant":"Iago","y":-695,"x":-134},{"zone":"Eastern Plains of Karana","merchant":"Lucetta","y":1306,"x":-2757},{"zone":"Eastern Plains of Karana","merchant":"Balthazar","y":1328,"x":-2722},{"zone":"Eastern Plains of Karana","merchant":"Tanrak","y":1529,"x":-2677},{"zone":"East Commonlands","merchant":"Bubar","y":-1519,"x":-116},{"zone":"East Commonlands","merchant":"Parthar","y":-119,"x":240},{"zone":"East Commonlands","merchant":"Innkeep Harold","y":-187,"x":117},{"zone":"East Commonlands","merchant":"Innkeep Dolman","y":1028,"x":3682},{"zone":"East Commonlands","merchant":"Innkeep Juna","y":-334,"x":3022},{"zone":"East Commonlands","merchant":"Germe Threadspinner","y":1021,"x":3635},{"zone":"East Commonlands","merchant":"Innkeep Blaise","y":332,"x":4842},{"zone":"Erudin","merchant":"Beth Breadmaker","y":136,"x":109},{"zone":"Erudin","merchant":"Helia BlueHawk","y":-1186,"x":-333},{"zone":"Erudin","merchant":"Teria Finleather","y":-956,"x":-98},{"zone":"Erudin","merchant":"Borge Finleather","y":-994,"x":-78},{"zone":"Erud's Crossing","merchant":"Renna","y":-1479,"x":857},{"zone":"The Feerrott","merchant":"Innkeep Gub","y":1144,"x":1444},{"zone":"The Feerrott","merchant":"Innkeep Morpa","y":1144,"x":-145},{"zone":"The Feerrott","merchant":"Kogg","y":1045,"x":1462},{"zone":"Felwithe","merchant":"Rolyn Longwalker","y":4,"x":-384},{"zone":"Felwithe","merchant":"Fishmonger Issa","y":258,"x":-626},{"zone":"Felwithe","merchant":"Merchant Sorintal","y":136,"x":-415},{"zone":"Firiona Vie","merchant":"Leala Swiftarrow","y":-3299,"x":3338},{"zone":"Firiona Vie","merchant":"Glinya Sweetpie","y":-2750,"x":2550},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Rolfic Gohar","y":-189,"x":-277},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Ralfson Gerositan","area":"At the North Ro gate","y":-384,"x":-648},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Paggie","area":"Inside the unnamed Inn (Bldg #12)","y":-7,"x":-232},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Rastle","area":"Inside the unnamed Inn (Bldg #12)","y":-22,"x":-285},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Nasumi","area":"Inside the Freeport Inn near North Ro ZL","y":-77,"x":-720},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Innkeep Hunter","area":"Inside the Freeport Inn near North Ro ZL","y":-77,"x":-699},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winda Lylil","area":"Inside the Grub n Grog Tavern","y":44,"x":-729},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Henna Treghost","area":"Inside the Seafarer's Roost","y":-246,"x":-874},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Gregor Nasin","area":"Inside the Seafarer's Roost","y":-238,"x":-835},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Rashinda Elore","y":290,"x":302},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gern Tassel","y":70,"x":-57},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Gibbon Morfield","y":287,"x":284},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Yellus Gravien","y":301,"x":273},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Lyna","y":-103,"x":191},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Tradesman Tulan","y":-131,"x":209},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Palola","y":-187,"x":-63},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Bran Greenglade","y":-109,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Alec Greenglade","area":"In blue building near bank (Bldg #18)","y":-94,"x":-128},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Rille","y":72,"x":72},{"zone":"North Freeport","zonePage":"Freeport","merchant":"Innkeep Evelona","y":70,"x":56},{"zone":"Greater Faydark","merchant":"Merchant Weaolanae","y":428,"x":338},{"zone":"Greater Faydark","merchant":"Merchant Kanoldar","y":750,"x":357},{"zone":"Greater Faydark","merchant":"Innkeep Anisyla","y":-247,"x":-435},{"zone":"Greater Faydark","merchant":"Innkeep Wuleran","y":-337,"x":141},{"zone":"Greater Faydark","merchant":"Innkeep Larya","y":940,"x":306},{"zone":"Greater Faydark","merchant":"Innkeep Linen","y":726,"x":459},{"zone":"Greater Faydark","merchant":"Merchant Aianya","y":251,"x":614},{"zone":"Greater Faydark","merchant":"Merchant Iludarae","y":-29,"x":-149},{"zone":"Greater Faydark","merchant":"Merchant Kwein","y":155,"x":334},{"zone":"Greater Faydark","merchant":"Merchant Tuluvdar","y":-427,"x":466},{"zone":"Grobb","merchant":"Ootok","y":233,"x":-31},{"zone":"Grobb","merchant":"Wista","y":131,"x":-373},{"zone":"Grobb","merchant":"Zatok","y":155,"x":-280},{"zone":"Halas","merchant":"Dok","y":212,"x":275},{"zone":"Halas","merchant":"Teria O`Danos","y":-6,"x":-33},{"zone":"Halas","merchant":"Greta Terrilon","y":280,"x":-327},{"zone":"Halas","merchant":"Hetie McDonald","y":240,"x":-154},{"zone":"Halas","merchant":"Leopok Terrilon","y":205,"x":151},{"zone":"High Keep","merchant":"Baker Jena","y":46,"x":-260},{"zone":"High Keep","merchant":"Treasurer Lynn","y":-70,"x":-375},{"zone":"Highpass Hold","merchant":"Maigin Greyeagle","y":179,"x":483},{"zone":"Highpass Hold","merchant":"Sernn Rossook","y":-218,"x":154},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Doramafi Ratsbone","y":710,"x":88},{"zone":"North Kaladim","zonePage":"Kaladim","merchant":"Harnoff Splitrock","y":726,"x":188},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"Kithicor Forest","merchant":"Innkeep Min","y":1465,"x":2383},{"zone":"Kithicor Forest","merchant":"Elsbyth","y":-776,"x":3082},{"zone":"Kithicor Forest","merchant":"Innkeep Jurn","y":-281,"x":3821},{"zone":"Kithicor Forest","merchant":"Innkeep Grace","y":1095,"x":-684},{"zone":"Lake Rathetear","merchant":"Dreana","y":-424,"x":450},{"zone":"Lake Rathetear","merchant":"Turga","y":3126,"x":-1815},{"zone":"Lavastorm Mountains","merchant":"Jenah Wheelspinner","y":401,"x":826},{"zone":"Lesser Faydark","merchant":"Anelia Thrywiel","y":-307,"x":1242},{"zone":"Misty Thicket","merchant":"Bim Buskin","y":905,"x":-2345},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ootok","y":-417,"x":-457},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Smaka","y":-335,"x":-107},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Vala Tanbor","y":210,"x":-215},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"The Gobbler","y":-323,"x":-125},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Tal Drana","y":106,"x":-251},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Bull Crusher","y":-390,"x":-252},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Dran `slug` Rembor","y":210,"x":-244},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Sal Drana","y":106,"x":-238},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Dunred M`Trik","y":71,"x":-866},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Volkoon D`Dbth","y":-43,"x":-1030},{"zone":"New Sebilis Expedition","merchant":"Klok Koglin","y":175,"x":-88},{"zone":"Northern Karana","merchant":"Romella","y":-682,"x":-201},{"zone":"Northern Karana","merchant":"Innkeep Disda","y":118,"x":1382},{"zone":"Northern Karana","merchant":"Innkeep James","y":156,"x":1379},{"zone":"Northern Karana","merchant":"Bilbis Briar","y":-4149,"x":1201},{"zone":"Northern Desert of Ro","merchant":"Murissa Sandwhisper","y":3712,"x":126},{"zone":"Northern Desert of Ro","merchant":"Innkeep Valon","y":3415,"x":503},{"zone":"Oasis of Marr","merchant":"Isslana","y":512,"x":71},{"zone":"Oasis of Marr","merchant":"Innkeep Marnan","y":-1321,"x":-261},{"zone":"Oggok","merchant":"Angrog","y":-243,"x":-2},{"zone":"Oggok","merchant":"Sinsaal","y":267,"x":677},{"zone":"Oggok","merchant":"Crunga","y":548,"x":-176},{"zone":"Oggok","merchant":"Erung","y":512,"x":-183},{"zone":"Ocean of Tears","merchant":"Cleonae Kalen","y":503,"x":-9253},{"zone":"Ocean of Tears","merchant":"Endan Halson","y":-2211,"x":7721},{"zone":"The Overthere","merchant":"Tin Merchant I","y":2733,"x":2582},{"zone":"The Overthere","merchant":"Klok G`rshai","y":2212,"x":-2912},{"zone":"Paineel","merchant":"Rallia Hapera","y":941,"x":770},{"zone":"Paineel","merchant":"Geomar Hapera","y":953,"x":757},{"zone":"Paineel","merchant":"Linnleu Brackmar","y":734,"x":820},{"zone":"Paineel","merchant":"Keletha Nightweaver","y":734,"x":861},{"zone":"Paineel","merchant":"Gorng Alusnein","y":984,"x":636},{"zone":"Paineel","merchant":"Iva Tersala","y":970,"x":649},{"zone":"Western Plains of Karana","merchant":"Misla McMannus","y":-4023,"x":-2344},{"zone":"Western Plains of Karana","merchant":"Innkeep Danin","y":-1514,"x":-13005},{"zone":"Western Plains of Karana","merchant":"Innkeep Rislarn","y":326,"x":-4417},{"zone":"Western Plains of Karana","merchant":"Cleet Miller Jr","y":-3013,"x":-5735},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Karn Tassen","y":-165,"x":-255},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Voleen Tassen","y":-192,"x":-266},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Tubal Weaver","y":216,"x":94},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Tanlyn Galliway","y":125,"x":204},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Sneed Galliway","y":132,"x":243},{"zone":"North Qeynos","zonePage":"Qeynos","merchant":"Ghil Starn","y":157,"x":195},{"zone":"Surefall Glade","merchant":"Sequea Erthinon","y":-155,"x":-293},{"zone":"Surefall Glade","merchant":"Grathin Nilm","y":104,"x":-86},{"zone":"Rathe Mountains","merchant":"Guzzla","y":1760,"x":1288},{"zone":"Rathe Mountains","merchant":"Viira Bali","y":1644,"x":-875},{"zone":"Rathe Mountains","merchant":"Philicia Drinn","y":4002,"x":-1359},{"zone":"Rathe Mountains","merchant":"Sven Drinn","y":3992,"x":-1383},{"zone":"Rathe Mountains","merchant":"Susanna","y":2908,"x":-769},{"zone":"Rathe Mountains","merchant":"Innkeep Troy","y":4283,"x":842},{"zone":"Rathe Mountains","merchant":"Innkeep Serge","y":4294,"x":831},{"zone":"Rathe Mountains","merchant":"Chandra Kali","y":3922,"x":1390},{"zone":"Rivervale","merchant":"Crista Tagglefoot","y":-69,"x":-381},{"zone":"Rivervale","merchant":"Daleen Leafsway","y":-87,"x":-343},{"zone":"Rivervale","merchant":"Wibble Bramblebush","y":6,"x":-329},{"zone":"RunnyEye Citadel","merchant":"A goblin merchant","y":8,"x":130},{"zone":"Skyshrine","merchant":"Ruru the Cook","y":142,"x":-475},{"zone":"Solusek's Eye","merchant":"goblin merchant","y":-753,"x":-437},{"zone":"Southern Desert of Ro","merchant":"Rathmana Allin","y":1210,"x":1402},{"zone":"Steamfont Mountains","merchant":"Finkel Rardobaen","y":-1515,"x":-1844},{"zone":"Steamfont Mountains","merchant":"Glen Garginburr","y":-1786,"x":337},{"zone":"Stonebrunt Mountains","merchant":"Chef Stead","y":1348,"x":-490},{"zone":"Thurgadin","merchant":"Petcas Coldbeard","y":-57,"x":94},{"zone":"Thurgadin","merchant":"Perkins Doughbeard","area":"Thurgadin Bank","y":-279,"x":134},{"zone":"Thurgadin","merchant":"Mordin Frostcleaver","y":-220,"x":-216},{"zone":"Icewell Keep","merchant":"Coldain Outcast","y":52,"x":928},{"zone":"Timorous Deep","merchant":"Seloris Windweaver","y":-4867,"x":-3439},{"zone":"Warsliks Woods","merchant":"Klok Rogalin","y":-1882,"x":-600}],
  "Wristband Pattern": [{"zone":"Ak'Anon","merchant":"a clockwork tailor","y":761,"x":146},{"zone":"Butcherblock Mountains","merchant":"Alga Bruntbuckler","y":-1185,"x":-1957},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Wartol","y":93,"x":-298},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Stitch","y":128,"x":-9},{"zone":"Erudin","merchant":"Gayle Weaven","y":245,"x":88},{"zone":"Everfrost Peaks","merchant":"Seria O`Danos","y":3608,"x":701},{"zone":"The Feerrott","merchant":"Murga","y":1129,"x":-138},{"zone":"Firiona Vie","merchant":"Erica Swiftweave","y":-3650,"x":2013},{"zone":"Firiona Vie","merchant":"Dionin Needlespin","y":-3642,"x":1985},{"zone":"East Freeport","zonePage":"Freeport","merchant":"Winsa Tanner","y":38,"x":-539},{"zone":"Greater Faydark","merchant":"Merchant Gaeadin","y":-114,"x":-131},{"zone":"Highpass Hold","merchant":"Dyona Rossook","y":-248,"x":135},{"zone":"Misty Thicket","merchant":"Tipa Lighten","y":581,"x":-2202},{"zone":"Neriak Commons","zonePage":"Neriak","merchant":"Garren D`Vek","y":-4,"x":-996},{"zone":"Neriak Third Gate","zonePage":"Neriak","merchant":"Hutyn L`Lozz","y":747,"x":-1293},{"zone":"North Qeynos","merchant":"Nerissa Clothspinner","y":-10,"x":-7},{"zone":"Northern Desert of Ro","merchant":"Spoolie Gee","y":3371,"x":488},{"zone":"Oggok","merchant":"Gretamog","y":627,"x":693},{"zone":"The Overthere","merchant":"Tin Merchant IX","y":2658,"x":2615},{"zone":"Western Plains of Karana","merchant":"Alysa","y":431,"x":-4364},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"Steamfont Mountains","merchant":"Freed Fimplefur","y":-1696,"x":829},{"zone":"Thurgadin","merchant":"Rexx Frostweaver","y":-272,"x":133},{"zone":"Thurgadin","merchant":"Betti Frostweaver","y":-264,"x":133}],
  "Yeast": [{"zone":"Ak'Anon","merchant":"a clockwork brewmaster","y":1265,"x":-924},{"zone":"Butcherblock Mountains","merchant":"Inudul Dumirgun","y":2837,"x":-682},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Klok Sass","y":667,"x":-38},{"zone":"East Cabilis","zonePage":"Cabilis","merchant":"Brewer Prixal","y":678,"x":-26},{"zone":"Firiona Vie","merchant":"Frothy","y":-2979,"x":2973},{"zone":"West Freeport","zonePage":"Freeport","merchant":"Krystin Charcoal","y":102,"x":9},{"zone":"Grobb","merchant":"Gartonka","y":141,"x":-306},{"zone":"Halas","merchant":"Becka McGuzzlin","y":198,"x":-144},{"zone":"Highpass Keep","merchant":"a clerk","y":-77,"x":-187},{"zone":"Highpass Keep","merchant":"a dealer","y":-70,"x":-355},{"zone":"Highpass Keep","merchant":"a dealer","y":-101,"x":-326},{"zone":"Highpass Hold","merchant":"a dealer","y":426,"x":-260},{"zone":"Highpass Hold","merchant":"a dealer","y":340,"x":-244},{"zone":"Highpass Hold","merchant":"Lyn Tarburner","y":-146,"x":493},{"zone":"South Kaladim","zonePage":"Kaladim","merchant":"Hanamaf Darkfoam","y":95,"x":233},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Wiska","y":159,"x":-104},{"zone":"Neriak Foreign Quarter","zonePage":"Neriak","merchant":"Ghrag","y":-259,"x":-260},{"zone":"Oggok","merchant":"Korgarg Swillchugger","y":182,"x":-235},{"zone":"Western Plains of Karana","merchant":"Cleet Miller","y":-2253,"x":-4128},{"zone":"South Qeynos","zonePage":"Qeynos","merchant":"Heidi Grainsifter","y":-169,"x":-278},{"zone":"Rivervale","merchant":"Burtle Barrelbelly","y":-37,"x":-174},{"zone":"Thurgadin","merchant":"Tobart Dirkins","y":-332,"x":-9}],
  "Yerbhimba": [{"zone":"Everfrost Peaks","merchant":"Sven Felligan","y":2848,"x":-3454},{"zone":"Innothule Swamp","merchant":"Sithgok","y":1169,"x":529},{"zone":"Kerra Island","merchant":"Melixis","y":519,"x":179},{"zone":"West Cabilis","zonePage":"Cabilis","merchant":"Klok Scaleroot","y":407,"x":511},{"zone":"Firiona Vie","merchant":"Marlyn McMerin","y":-3813,"x":1669},{"zone":"Thurgadin","merchant":"Hulda","y":-294,"x":133}],
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
