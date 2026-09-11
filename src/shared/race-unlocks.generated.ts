/**
 * Race unlock requirements, quests and faction-point values — GENERATED, do not edit by hand.
 *
 * Regenerate with `node scripts/fetch-race-unlocks.mjs`, which fetches and parses
 * "User:Alanna/Alanna's Race Unlock Guide" (scraped 2026-09-10T22:09:40.232Z). Shipped rather
 * than fetched at runtime — see this script's own header and
 * [ADR 0222](../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md).
 *
 * Only what the guide states in a structurally regular way is here: each race's required factions,
 * its recommended method's numbered steps, and every faction-point breakdown found under that
 * method — grouped by the guide's own nearest heading, **never merged or summed across groups** (see
 * `scripts/lib/race-unlocks-parse.mjs`'s header for why). "Alternative Methods" is deliberately not
 * parsed at all; the guide page itself is one `ItemLink` away for that.
 *
 * **Each step is kept raw, `[[Title]]`/`[[Title|Display]]` markup and all** — the UI renders a
 * step's own quest/item/NPC links inline (`wikiLinksIn` in `race-unlocks.ts`) rather than as a
 * second, disconnected list, so a link always reads in the sentence that explains what it's for.
 *
 * The lookup over this is hand-written beside it in `race-unlocks.ts`. Nothing should import this
 * file directly.
 *
 * 16 races.
 */

export interface RaceUnlockFactionHit {
  faction: string;
  /** Signed — a negative entry lowers the faction. */
  amount: number;
  /** Whatever the guide wrote after the number on its line ("or -2", "(-5/-10 for named)") — kept
   *  verbatim rather than discarded, since it can change what the number actually means. */
  note?: string;
}

/** One block of faction-point bullets, as the guide wrote them under one heading. Never merged with
 *  another group — two turn-ins under the same race can name the same faction with different
 *  numbers, because they're alternatives to each other, not additive. */
export interface RaceUnlockHitGroup {
  /** The nearest heading above this block, in the guide's own words. */
  label: string;
  hits: RaceUnlockFactionHit[];
}

/** The guide's "Recommended Method" for a race: its numbered steps (raw wikitext — see the header),
 *  and every faction-point breakdown found underneath. */
export interface RaceUnlockMethod {
  steps: string[];
  hitGroups: RaceUnlockHitGroup[];
}

export type RaceUnlockRequirement = { race: string; method: RaceUnlockMethod } & (
  | { kind: "factions"; factions: string[] }
  | { kind: "prerequisite-race"; requires: string[] }
  | { kind: "task"; task: string; taskWikiTitle?: string }
);

export const RACE_UNLOCK_SOURCE = { title: "User:Alanna/Alanna's Race Unlock Guide", scrapedAt: "2026-09-10T22:09:40.233Z" };

export const RACE_UNLOCKS: RaceUnlockRequirement[] = [
  { race: "Barbarian", kind: "factions", factions: ["Rogues of the White Rose", "Wolves of the North", "Merchants of Halas"], method: {
    steps: [
      "Complete the [[Lion Meat Shipment Quest]] 200 times",
      "Turn in the resulting 200 [[Lion Delight]] to [[Iceberg]]",
    ],
    hitGroups: [
      {
        label: "Lion Meat Shipment",
        hits: [
        { faction: "Merchants of Halas", amount: 10 },
        { faction: "Wolves of the North", amount: 7 },
        { faction: "Shamen of Justice", amount: 7 },
        { faction: "Rogues of the White Rose", amount: 5 },
        { faction: "Wolves of the North", amount: 5 },
        { faction: "Shamen of Justice", amount: 5 },
        { faction: "Merchants of Halas", amount: 5 },
        { faction: "Steel Warriors", amount: 5 },
        { faction: "Rogues of the White Rose", amount: 5 },
        ],
      },
    ],
  } },
  { race: "Dark Elf", kind: "factions", factions: ["Dreadguard Inner", "Dreadguard Outer", "Dark Bargainers"], method: {
    steps: [
      "Do the [[Bottle of Red Wine]] quest 400 times",
    ],
    hitGroups: [
      {
        label: "Details",
        hits: [
        { faction: "Dreadguard Inner", amount: 5 },
        { faction: "Dreadguard Outer", amount: 5 },
        { faction: "Dark Bargainers", amount: 10 },
        ],
      },
    ],
  } },
  { race: "Dwarf", kind: "factions", factions: ["Storm Guard", "Merchants of Kaladim", "Kazon Stormhammer"], method: {
    steps: [
      "Do the [[Tumpy Tonics]] quest 400 times",
    ],
    hitGroups: [
      {
        label: "Tumpy Tonics",
        hits: [
        { faction: "Storm Guard", amount: 5 },
        { faction: "Kazon Stormhammer", amount: 5 },
        { faction: "Miners Guild 249", amount: 5 },
        { faction: "Merchants of Kaladim", amount: 5 },
        { faction: "Craknek Warriors", amount: -1 },
        ],
      },
    ],
  } },
  { race: "Erudite", kind: "factions", factions: ["Deepwater Knights", "High Council of Erudin", "Heretics"], method: {
    steps: [
      "Kill 400 Kobolds",
      "Do the [[Kobold Molars (Good)]] with all of the molars you loot",
      "Kill Heretics in Paineel until you max out Deepwater Knights",
      "Do the first step [[The Painting]] of 400 times minus your completions of [[Kobold Molars (Good)]]",
    ],
    hitGroups: [
      {
        label: "Slaughter Kobolds",
        hits: [
        { faction: "Heretics", amount: 5 },
        { faction: "High Guard of Erudin", amount: 5 },
        { faction: "Clan Kobolk", amount: -1, note: "5/-10 for named)" },
        ],
      },
      {
        label: "Kobold Molars",
        hits: [
        { faction: "Deepwater Knights", amount: 7 },
        { faction: "High Council of Erudin", amount: 5 },
        { faction: "Heretics", amount: -1 },
        ],
      },
      {
        label: "Killing Heretics",
        hits: [
        { faction: "Craftkeepers", amount: 100 },
        { faction: "Crimson Hands", amount: 100 },
        { faction: "Deepwater Knights", amount: 100 },
        { faction: "Gate Callers", amount: 100 },
        { faction: "Heretics", amount: -100 },
        { faction: "Craftkeepers", amount: 10 },
        { faction: "Crimson Hands", amount: 10 },
        { faction: "Deepwater Knights", amount: 10 },
        { faction: "Gate Callers", amount: 10 },
        { faction: "Heretics", amount: -10 },
        { faction: "Craftkeepers", amount: 25 },
        { faction: "Crimson Hands", amount: 25 },
        { faction: "Deepwater Knights", amount: 25 },
        { faction: "Gate Callers", amount: 25 },
        { faction: "Heretics", amount: -25 },
        ],
      },
      {
        label: "The Painting",
        hits: [
        { faction: "Craftkeepers", amount: 5 },
        { faction: "High Council of Erudin", amount: 5 },
        { faction: "Heretics", amount: -1 },
        { faction: "High Guard of Erudin", amount: 5 },
        ],
      },
    ],
  } },
  { race: "Froglok", kind: "factions", factions: ["Protectors of Gukta", "Guktan Elders", "Guktan Suppliers"], method: {
    steps: [
      "Give 800 [[Phosphorous Powder]] to [[Zok Zribb]] in [[Rathe Mountains]]",
    ],
    hitGroups: [
      {
        label: "Details",
        hits: [
        { faction: "Guktan Suppliers", amount: 5 },
        { faction: "Protectors of Gukta", amount: 5 },
        { faction: "High Council of Gukta", amount: 5 },
        { faction: "Lorekeepers of Gukta", amount: 5 },
        { faction: "Guktan Elders", amount: 5 },
        ],
      },
    ],
  } },
  { race: "Gnome", kind: "factions", factions: ["King Ak'Anon", "Gem Choppers", "Eldritch Collective"], method: {
    steps: [
      "Do the first part of [[Series C Black Boxes]] 400 times",
    ],
    hitGroups: [
      {
        label: "Series C Black Boxes",
        hits: [
        { faction: "King Ak'Anon", amount: 5 },
        { faction: "Eldritch Collective", amount: 5 },
        { faction: "Gem Choppers", amount: 5 },
        { faction: "Dark Reflection", amount: -1 },
        { faction: "Meldrath", amount: -1 },
        ],
      },
    ],
  } },
  { race: "Half Elf", kind: "prerequisite-race", requires: ["Human", "Wood Elf"], method: {
    steps: [
      "Unlock Wood Elf or Humans (Qeynos)",
    ],
    hitGroups: [

    ],
  } },
  { race: "Halfling", kind: "factions", factions: ["Guardians of the Vale", "Merchants of Rivervale", "Priests of Mischief"], method: {
    steps: [
      "Do [[Bandages for Honeybugger]] 400 times",
      "Kill 400 goblins in [[Runnyeye]]",
    ],
    hitGroups: [
      {
        label: "Bandages",
        hits: [
        { faction: "Merchants of Rivervale", amount: 5 },
        { faction: "Deeppockets", amount: 5 },
        { faction: "Guardians of the Vale", amount: 5 },
        { faction: "Mayor Gubbin", amount: 5 },
        { faction: "Coalition of Tradefolk Underground", amount: -1 },
        ],
      },
      {
        label: "Killing Goblins",
        hits: [
        { faction: "Pickclaw Goblins", amount: -5 },
        { faction: "Guardians of the Vale", amount: 5 },
        { faction: "King Xorbb", amount: 5 },
        { faction: "Priests of Mischief", amount: 5 },
        { faction: "Clan Runnyeye", amount: -1, note: "or -2" },
        { faction: "Storm Reapers", amount: 5 },
        { faction: "Guardians of the Vale", amount: 5 },
        { faction: "Storm Guard", amount: 5 },
        { faction: "King Xorbb", amount: 5 },
        { faction: "Priests of Mischief", amount: 5 },
        ],
      },
    ],
  } },
  { race: "High Elf", kind: "factions", factions: ["Keepers of the Art", "Merchants of Felwithe", "Clerics of Tunare"], method: {
    steps: [
      "Do [[Muffin for Pandos]] 400 times",
      "Do the first step of [[Hogcaller's Inn]] 400 times",
      "Do [[Bat Wings]] 400 times",
    ],
    hitGroups: [
      {
        label: "Muffins for Pandos",
        hits: [
        { faction: "Faydark Champions", amount: 5 },
        { faction: "King Tearis Thex", amount: 5 },
        { faction: "Clerics of Tunare", amount: 5 },
        { faction: "Soldiers of Tunare", amount: 5 },
        { faction: "Crushbone Orcs", amount: -1 },
        ],
      },
      {
        label: "Hogcaller's Inn",
        hits: [
        { faction: "Emerald Warriors", amount: 5 },
        { faction: "Indigo Brotherhood", amount: -1 },
        { faction: "Merchants of Felwithe", amount: 5 },
        { faction: "Merchants of Kelethin", amount: 5 },
        ],
      },
      {
        label: "Bat Wings",
        hits: [
        { faction: "Keepers of the Art", amount: 5 },
        { faction: "King Tearis Thex", amount: 5 },
        { faction: "Faydark Champions", amount: 5 },
        { faction: "The Dead", amount: -1 },
        ],
      },
    ],
  } },
  { race: "Human (Freeport)", kind: "factions", factions: ["Coalition of Tradefolk", "Freeport Militia", "Knights of Truth"], method: {
    steps: [
      "Do [[Tonics for Groflah]] 110 times",
      "Do [[Message Intercept]] giving [[A Note]] to [[Sir Lucan D`Lere]] 42 times",
    ],
    hitGroups: [
      {
        label: "Tumpy Tonics",
        hits: [
        { faction: "Coalition of Tradefolk", amount: 10 },
        { faction: "Coalition of Tradefolk Underground", amount: 10 },
        { faction: "Knights of Truth", amount: 10 },
        { faction: "Merchants of Qeynos", amount: 7 },
        ],
      },
      {
        label: "Message Intercept",
        hits: [
        { faction: "Knights of Truth", amount: 5 },
        { faction: "Priests of Marr", amount: 5 },
        { faction: "The Freeport Militia", amount: -2 },
        { faction: "Coalition of Tradefolk Underground", amount: -1 },
        { faction: "The Freeport Militia", amount: 25 },
        { faction: "Coalition of Tradefolk Underground", amount: 5 },
        { faction: "Knights of Truth", amount: -2 },
        { faction: "Priests of Marr", amount: -2 },
        ],
      },
    ],
  } },
  { race: "Human (Qeynos)", kind: "factions", factions: ["Merchants of Qeynos", "Guards of Qeynos", "Corrupt Qeynos Guards"], method: {
    steps: [
      "Do [[Rohand's Brandy]] 400 times",
      "Do [[Honey Mead for Trumpy]] 400 times",
    ],
    hitGroups: [
      {
        label: "Brandy",
        hits: [
        { faction: "Merchants of Qeynos", amount: 25 },
        { faction: "Circle of Unseen Hands", amount: -5 },
        { faction: "Antonius Bayle", amount: 5 },
        { faction: "Coalition of Tradefolk", amount: 5 },
        { faction: "Guards of Qeynos", amount: 5 },
        ],
      },
      {
        label: "Honey Mead",
        hits: [
        { faction: "Circle of Unseen Hands", amount: 5 },
        { faction: "Merchants of Qeynos", amount: -1 },
        { faction: "Corrupt Qeynos Guards", amount: 5 },
        { faction: "Guards of Qeynos", amount: -1 },
        { faction: "Kane Bayle", amount: 5 },
        ],
      },
    ],
  } },
  { race: "Iksar", kind: "factions", factions: ["New Sebilisian Expedition"], method: {
    steps: [
      "Trade [[Metal Bits]] to [[Crusader Iktra]] in [[North Ro]] until amiable",
      "Trade [[Small Piece of High Quality Ore|Small Pieces of High Quality Ore]] to [[Crusader Iktra]] in [[North Ro]] until it's maxed out",
    ],
    hitGroups: [
      {
        label: "Metal Bits",
        hits: [
        { faction: "New Sebilisian Expedition", amount: 5 },
        ],
      },
      {
        label: "Small Pieces of High Quality Ore",
        hits: [
        { faction: "New Sebilisian Expedition", amount: 10 },
        ],
      },
    ],
  } },
  { race: "Ogre", kind: "factions", factions: ["Oggok Guards", "Clurg", "Merchants of Oggok"], method: {
    steps: [
      "Do the Oggok [[Muffin Quests|Fresh Baked Muffin Quest]] 400 times",
    ],
    hitGroups: [
      {
        label: "Muffins",
        hits: [
        { faction: "Merchants of Oggok", amount: 5 },
        { faction: "Oggok Guards", amount: 5 },
        { faction: "Clurg", amount: 5 },
        ],
      },
    ],
  } },
  { race: "Troll", kind: "factions", factions: ["Da Bashers", "Grobb Merchants", "Dark Ones"], method: {
    steps: [
      "Do [[More Help for Innoruuk]] 400 times",
      "Do [[Nerbilik's Grub Locker]] 400 times",
    ],
    hitGroups: [
      {
        label: "Deathfist Belts",
        hits: [
        { faction: "Dark Ones", amount: 5 },
        { faction: "Shadownights of Night Keep", amount: 5 },
        { faction: "Frogloks of Guk", amount: -1 },
        ],
      },
      {
        label: "Grub Locker",
        hits: [
        { faction: "Da Bashers", amount: 10 },
        { faction: "Grobb Merchants", amount: 5 },
        { faction: "Broken Skull Clan", amount: -1 },
        ],
      },
    ],
  } },
  { race: "Kerran", kind: "task", task: "Aid the Kerrans of Kerra Isle", taskWikiTitle: "Aid the Kerrans of Kerra Isle", method: {
    steps: [
      "Hail any class GM in [[Kerra Isle]] to be assigned this task",
      "Do every quest in Kerra Isle",
      "Aid [[Feskr Drinkmaker]]",
      "[[Feskr's Supplies]]",
      "Aid [[Urkath Greyface]]",
      "[[Skunk Scent Gland (Quest)]]",
      "Aid the [[Kerran tseq]]",
      "[[Heretic's Toy]]",
      "Aid [[Feren]]",
      "[[Razortooth]]",
      "Aid [[Roary Fishpouncer]]",
      "[[Fish Dinner]]",
      "Aid [[Ailix]]",
      "[[The Luck of Ailix]]",
      "Aid [[Shazda Asad]]",
      "[[First Test of Kejaar]]",
      "[[Second Test of Kejaar]]",
      "Aid [[Thalith Mamluk]]",
      "[[Fang Tooth (Quest)]]",
      "Aid [[Errrak Thickshank]]",
      "[[Health Potion]]",
      "Aid [[The Kerran Sha`rr]]",
      "[[Something is Wrrrong]]",
      "[[This Means Warrr]]",
    ],
    hitGroups: [

    ],
  } },
  { race: "Wood Elf", kind: "factions", factions: ["Emerald Warriors", "Soldiers of Tunare", "Kelethin Merchants"], method: {
    steps: [
      "Do [[Muffin for Pandos]] 400 times",
      "Do the first step of [[Hogcaller's Inn]] 400 times",
    ],
    hitGroups: [
      {
        label: "Muffins for Pandos",
        hits: [
        { faction: "Faydark Champions", amount: 5 },
        { faction: "King Tearis Thex", amount: 5 },
        { faction: "Clerics of Tunare", amount: 5 },
        { faction: "Soldiers of Tunare", amount: 5 },
        { faction: "Crushbone Orcs", amount: -1 },
        ],
      },
      {
        label: "Hogcaller's Inn",
        hits: [
        { faction: "Emerald Warriors", amount: 5 },
        { faction: "Indigo Brotherhood", amount: -1 },
        { faction: "Merchants of Felwithe", amount: 5 },
        { faction: "Merchants of Kelethin", amount: 5 },
        ],
      },
    ],
  } },
];
