/**
 * Quest items that lie on the ground at a known spot — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-quest-pickups.mjs`, which reads eqlwiki's quest-page
 * pickup tables (scraped 2026-10-14T19:42:50.299Z). Shipped rather than fetched at runtime — see
 * [ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md). Read it
 * through `quest-pickups.ts`, which owns how a pickup is named on the list and placed on the map.
 *
 * 10 pickups.
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

export const QUEST_PICKUPS_SOURCE = { wiki: "https://eqlwiki.com", pages: ["Tarton's Wheel"], scrapedAt: "2026-10-14T19:42:50.299Z" };

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
  }
];
