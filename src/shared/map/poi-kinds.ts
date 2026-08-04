/**
 * What a map label *is*, so the map can offer to hide the kinds you don't want.
 *
 * A community map's points of interest are colored, and the colors do mean something — red is
 * usually a zone line, teal a quest giver, purple a forge — but it's a convention each mapmaker
 * keeps in their own way: zone lines come as both `255,0,0` and `240,0,0`, merchants as `0,128,0`
 * and `0,127,0`, and plenty of labels are drawn in the default black. Classifying on **the label's
 * own words** is far steadier than a color table, so that's what this does; the color is still
 * shown beside the toggle, since that's how you recognise them on the map.
 *
 * Every vocabulary below is a **tally of the real corpus** — 760 map files (the game's own 192 plus
 * Brewall's 568), ~19,000 distinct labels — not a guess at what mapmakers might write. The counts
 * quoted in the comments are from that tally, and the shapes that earn a rule are the ones that
 * turn up in the thousands. See [ADR 0048](../../../specs/decisions/0048-a-map-label-is-read-by-its-words.md).
 *
 * Pure and dependency-free, and tested against that corpus — see `poi-kinds.test.ts`.
 */

import { isFloorLabel, type MapPoi } from "./eqmap";

/**
 * The section a kind is filed under in the label filter. Fourteen checkboxes in a flat list is a
 * wall, and the question you actually arrive with is broader than one kind — "hide the dungeon
 * furniture", "just show me who's here" — so the groups are what you reach for first.
 */
export type PoiGroup = "travel" | "features" | "people" | "zone" | "notes";

export type PoiKind =
  // Getting around
  | "zoneline"
  | "transport"
  | "passage"
  // Doors & traps
  | "door"
  | "trap"
  // Who's here
  | "merchant"
  | "quest"
  | "spawn"
  | "mob"
  // The zone
  | "loot"
  | "craft"
  | "named"
  // Map notes
  | "floor"
  | "note";

/** Display order and wording for the filter's sections. */
export const POI_GROUPS: { group: PoiGroup; label: string }[] = [
  { group: "travel", label: "Getting around" },
  { group: "features", label: "Doors & traps" },
  { group: "people", label: "Who's here" },
  { group: "zone", label: "The zone" },
  { group: "notes", label: "Map notes" },
];

/** Display order and wording for the label filter. */
export const POI_KINDS: { kind: PoiKind; group: PoiGroup; label: string; hint: string }[] = [
  { kind: "zoneline", group: "travel", label: "Zone lines", hint: "Exits and arrivals — “to Butcherblock Mountains”, “from The Overthere”, Succor points" },
  { kind: "transport", group: "travel", label: "Ports & boats", hint: "Druid rings, wizard spires, teleport pads, portals, translocators, boats and docks" },
  { kind: "passage", group: "travel", label: "Ways up & down", hint: "Ladders, elevators, stairs, ramps, one-way drops, and swim/climb/jump routes" },
  { kind: "door", group: "features", label: "Doors & clickies", hint: "Locked doors (with the key or picklock they need), secret doors, fake walls, levers" },
  { kind: "trap", group: "features", label: "Traps & hazards", hint: "The mapmaker's TRAP markers, and spots flagged as kill-on-sight" },
  { kind: "merchant", group: "people", label: "Vendors & services", hint: "Anyone whose label names a trade or a service — shops, bankers, soulbinders, class trainers" },
  { kind: "quest", group: "people", label: "Quests & missions", hint: "Quest, task, mission and Heroic Adventure markers, and who gives them" },
  { kind: "spawn", group: "people", label: "Named & bosses", hint: "Notable spawns — Hunter targets, bosses, raid targets, roamers, and placeholder chains" },
  { kind: "mob", group: "people", label: "Ordinary spawns", hint: "A label that starts with a/an/the, the same signal that tells a mob from a player" },
  { kind: "loot", group: "zone", label: "Ground spawns & drops", hint: "Items lying in the world (“GS: Yew Leaf”) and the mobs marked as dropping one" },
  { kind: "craft", group: "zone", label: "Tradeskill stations", hint: "Forges, looms, kilns, ovens and the rest of the stations" },
  { kind: "named", group: "zone", label: "Names & places", hint: "Proper names written plain — landmarks, rooms, camps, and any NPC whose label says nothing else about them" },
  { kind: "floor", group: "notes", label: "Floor markers", hint: "The mapmaker's own storey labels, which also drive the floor filter" },
  { kind: "note", group: "notes", label: "Notes", hint: "Everything else the mapmaker wrote — directions, tips, addresses, credits, bare dots" },
];

// ── Trailing parentheticals ───────────────────────────────────────────────────────────────────
// A parenthetical is the single most informative shape in the corpus (7,000+ labels carry one) and
// the packs use it for everything: a trade, an achievement flag, a picklock skill, a direction.
// So it's read first — but only for the things it actually says.

/**
 * The closing bracket is optional because 19 labels in the corpus are missing theirs —
 * `Curfang_(Hunter`, `Altunic Jartin (Shields` — and a hand-authored typo shouldn't cost the label
 * its kind. It can't swallow a mid-label bracket: `[^)]*` can't cross a `)`, so the match still has
 * to reach the end of the string.
 */
const TRAILING_PAREN = /\(([^)]*)\)?\s*$/;

/**
 * Brewall's mark for a spawn on the Hunter achievement list, stacked with roam/respawn notes:
 * `(Hunter)`, `(Hunter,Roam)`, `(Hunter,Roam,HS)`, `(Hunter,5days+2hours)`, `(Hunter/Gladiator)`.
 * 4,119 distinct labels wear it, which makes it the most common parenthetical of all — and the old
 * classifier only recognised a bare `(Hunter)`, so every one of the rest was filed as a merchant.
 * The misspelling is real and cheap to accept.
 */
const HUNTER = /\b(?:hunter|hutner)\b/i;

/**
 * Someone selling something, said outright. Checked ahead of the quest words so `(Adventure
 * Merchant)` and `(Raid Outfitter)` stay shops rather than being claimed by "adventure"/"raid".
 */
const SELLER = /\b(?:merchants?|merhcant|mechant|vendor|suppl(?:ier|ies)|outfitter|shopkeeper|li[ao]son|liaison)\b/i;

/** Quest, task, mission and Heroic Adventure markers — `(Quests 65+)`, `(Task Master)`, `(HA)`. */
const QUEST_WORDS = /\b(?:quests?|missions?|tasks?|task ?master|taskmaster|ha|heroic adventures?|adventures?|epic memories|rescue)\b/i;

/** An item lying in the world, or one a mob drops — the packs mark both, in the label or a bracket. */
const LOOT_WORDS = /\b(?:ground spawn|mob drop)\b/i;

/**
 * A trade or a stock line, which is how the packs mark vendors and class trainers: `(General)` 301,
 * `(Merchant)` 278, `(Spells)` 198, `(Smithing)` 160, `(Weapons)` 145, `(Armor)` 137, and a long
 * tail of the same idea. Broad on purpose — this is the one bracket that really does name a trade.
 */
const TRADE =
  /\b(?:general|bank(?:er)?|soulbinder|parcels?|satchels?|tribute|barter|bazaar|casino|inn|bars?|barkeep|bartender|town crier|guild ?master|trainer|training|skills|spells?|songs?|tomes?|scrolls?|research|armou?r(?:er)?|weapons?|shields?|robes?|boots?|cloth|chain|plate|leather|jewel(?:ry|ery|er|crafting)|gems|augs?|augments?|augmentations?|smith(?:ing)?|blacksmith(?:ing)?|tailor(?:ing)?|taiolr|pottery|baking|baker|brew(?:ing|er)?|fletch(?:ing|er)?|alchemy|tinker(?:ing|er)?|fishing|poisons?|cobbler|food|drink|produce|vegetables|reagents|potions?|solvents|components|instruments|brooms|books|mercenary|fellowship|faction|corpse summoner|spirit shrouds|guild banners|tradeskill|trade skill)\b/i;

/** `(GM Warrior)`, `(GM Cleric)` — a GuildMaster, i.e. the class trainer. 90+ of them. */
const TRAINER = /^gm\b/i;

/** A notable spawn by any other name: `(Boss)`, `(Raid)`, `(Roam)`, `(Epic)`, `(Hunter/Gladiator)`. */
const NOTABLE = /\b(?:boss|raid|roam|gladiator|epic)\b/i;

/** An epic target's class and tier, which is the whole bracket: `(SHD:1.0)`, `(WAR:1.5)`, `(BST:epic)`. */
const EPIC_CLASS = /^[a-z]{3}:\s*(?:\d|epic)/i;

/** Kill-on-sight — `Merci`s Feeding Pit (KOS)`. The one hazard the packs flag in brackets. */
const KOS = /\bkos\b/i;

/**
 * A bracket about *opening* something: `(Click Book)`, `(Picklock 200+)`, `(Pickable)`,
 * `(Jade Inlaid Key,Unpickable)`. These sit on doors and clickies, never on people.
 */
const OPENS = /\b(?:click\w*|picklock|pickable|un-?pickable|not-?pickable|keyring|keys?|locked)\b/i;

/** A bracket giving a direction or a level, which makes the label a way through: `(to East)`, `(up)`. */
const WAY_PAREN = /^(?:to\s|one[- ]?way|1 way)|\b(?:up|down|above|below|fall|hole|under ?water|in lava|on roof|top|upper level)\b/i;

/** A bracket naming the conveyance: `(Boat)`, `(Translocator)`, `(Teleport Pad)`, `(TL to all islands)`. */
const TRANSPORT_PAREN = /\b(?:boats?|translocator|teleport\w*|portal|ferry|blimp|tl to|paths? to)\b/i;

// ── The label's own words ─────────────────────────────────────────────────────────────────────

/** Credits and tooling that occasionally leak onto the drawn layer instead of the credits layer. */
const META = /^(?:original|revised) map\b|^map by\b|^https?:|^www\.|^height filter\b/i;

/**
 * `TRAP`, `TRAP: Fake Door`, `TRAP: Swinging Axe`. Checked before doors so a fake door reads as the
 * trap it is; `Trapdoor` is deliberately excluded by the word boundary, since that's a real door.
 */
const TRAP = /^traps?\b|\btrap:/i;

/**
 * `GS: Yew Leaf` — 422 distinct labels. **GS is Ground Spawn**, not a quest: the packs use it to
 * mark a harvestable item on the floor. The old classifier read it as a quest prefix, which put a
 * zone's entire foraging map under "Quests".
 */
const LOOT_PREFIX = /^g[st]\s*[:.(]/i;

/** A quest marker's own prefix, as the packs write it: `Q: …`, `Quest: …`. */
const QUEST_PREFIX = /^(?:q|quest|task|mission)\s*[:.-]/i;

/** Where a zone line, an arrival point or a succor point is. Intra-map links (`to A`, `from 4D`) too. */
const ZONELINE = /^(?:to|from|zone to|zoneline|zone line|succor|succour|port in|entrance|exit)\b|\bzone (?:in|out)\b/i;

/** The magical and nautical ways out: druid rings, spires, teleporters, portals, boats, docks. */
const TRANSPORT = /\b(?:druid ring|spires|teleport\w*|portal|translocator|blimp|ferry|boats?|docks?)\b/i;

/** The physical ways between levels. `Up`/`Down` alone is a whole label 125 times over. */
const PASSAGE =
  /^(?:up|down|out)$|^(?:swim|climb|jump|crawl|slide|drop|fall)\b|\b(?:ladder|elevator|lift|stairs?|stairway|ramp|one-?way|1 way)\b/i;

/** Doors, the walls that are really doors, and the things you pull to work them. */
const DOOR = /\b(?:doors?|doorway|trapdoors?|portcullis|fake wall|secret wall|hidden wall|lever|switch)\b/i;

/** A service named without a bracket, usually labelling the *area*: `Merchants`, `Bankers`, `Bank`. */
const SERVICE =
  /^bank$|\b(?:merchants?|bankers?|soulbinder|guild ?master|priest of discord|town crier|barkeep|bartender|tribute master|innkeep\w*)\b/i;

/**
 * Tradeskill stations, which are labelled by the object rather than by a person. The bare, generic
 * words (`Barrel`, `Spit`, `Cauldron`) are anchored to the whole label — unanchored they claimed
 * `Cauldron of Hate Overseer` and `Still Sky's Scholar`, which are mobs.
 */
const CRAFT =
  /\b(?:forge|loom|kiln|oven|pottery wheel|brew(?:ing)? barrel|anvil|workbench|tanning kit|sewing kit|fletching table|jewelry making table|fly making bench|mixing bowl|tool ?box|jeweler'?s kit)\b|^(?:barrel|spit|stove|cauldron)$/i;

/** A named's placeholder, which the packs write inline: `Deathleaper PH=a rampaging wyvern`. */
const PLACEHOLDER = /\bph=/i;

/** The bare label for a notable spawn, with no name attached: `Boss` 42, `Mini-Boss` 12. */
const NOTABLE_LABEL = /^(?:boss|mini-?boss|raid|named)$/i;

/** An article means an ordinary spawn — the same signal the cast-alert matcher uses. */
const ARTICLE = /^(?:an?|the)\s/i;

/** A coordinate, a street number, a bare figure, or the lone dot 1,908 markers are labelled with. */
const NUMERIC = /^-?\d+(?:[\s,.]|$)|^\.+$/;

/** Starts like a proper noun — the last positive signal before falling back to "note". */
const NAME_LIKE = /^[A-Z`'’]/;

/** How many words a proper name runs to before it's really a sentence. */
const NAME_MAX_WORDS = 4;

/**
 * Which kind a label reads as. The parenthetical is read first (it's the most informative shape),
 * then the label's own words, and "note" is the honest fallback rather than a guess.
 */
export function poiKind(label: string): PoiKind {
  const text = label.trim();
  if (!text) return "note";
  // Recognised by the same test that drives the floor filter, rather than a second guess at it.
  if (isFloorLabel(text)) return "floor";
  if (META.test(text)) return "note";

  const inner = TRAILING_PAREN.exec(text)?.[1]?.trim();
  // Two readings a bracket never overrules, hoisted above both helpers rather than duplicated
  // inside them: `(Hunter)` marks an achievement spawn whatever else the label says, and
  // `to The Plane of Knowledge (Click Book)` is a zone line however you work it.
  if (inner && HUNTER.test(inner)) return "spawn";
  if (ZONELINE.test(text)) return "zoneline";
  return (inner ? parenKind(text, inner) : undefined) ?? wordKind(text);
}

/**
 * What a trailing parenthetical says the label is, or `undefined` when it says nothing we
 * recognise.
 *
 * **Falling through is the whole point.** This used to end in "anything in brackets names the trade
 * they deal in", which filed **5,749 distinct labels as merchants** — every `(Hunter,Roam)` spawn,
 * every `Locked Door (Picklock 200+)`, `One-Way (to East)`, `Prince Jerranad (Boss)`. A bracket we
 * can't read now defers to the label's own words instead of inventing a shopkeeper.
 */
function parenKind(text: string, inner: string): PoiKind | undefined {
  if (SELLER.test(inner)) return "merchant";
  if (QUEST_WORDS.test(inner)) return "quest";
  if (LOOT_WORDS.test(inner)) return "loot";
  // Ahead of the station words, because a station never wears one of these and an NPC standing
  // beside one does: "War Forge Assistant (Roam)" is a roamer, not a forge.
  if (NOTABLE.test(inner) || EPIC_CLASS.test(inner)) return "spawn";
  // Unless the thing itself is a station — "Feir`Dal Forge (Cultural)" is a forge, not a shop.
  if (CRAFT.test(text)) return "craft";
  if (TRADE.test(inner) || TRAINER.test(inner)) return "merchant";
  if (KOS.test(inner)) return "trap";
  // What the label already says it is outranks what the bracket says about *working* it: the
  // bracket on `Elevator (click)` and `Portal to Island 2 Azarack (Key of the Misplaced)` is an
  // instruction, not the thing — only `Locked Door (Picklock 200+)` is both.
  if (DOOR.test(text)) return "door";
  if (PASSAGE.test(text)) return "passage";
  if (TRANSPORT.test(text)) return "transport";
  if (OPENS.test(inner)) return "door";
  if (WAY_PAREN.test(inner)) return "passage";
  if (TRANSPORT_PAREN.test(inner)) return "transport";
  return undefined;
}

/**
 * Which kind the label's own words read as. Order matters: the most specific shapes are tested
 * first, and the article is tested before the object vocabularies so "a barrel golem" isn't filed
 * as a brew barrel.
 */
function wordKind(text: string): PoiKind {
  if (TRAP.test(text)) return "trap";
  if (LOOT_PREFIX.test(text) || LOOT_WORDS.test(text)) return "loot";
  if (QUEST_PREFIX.test(text)) return "quest";
  // Before the article: "The Protector PH=a shade guardian" names the named, not its placeholder.
  if (PLACEHOLDER.test(text)) return "spawn";
  if (ARTICLE.test(text)) return "mob";
  if (NOTABLE_LABEL.test(text)) return "spawn";
  // Before the fixtures, so "Portal Merchant" is read as the shop it is rather than the portal
  // it stands next to.
  if (SERVICE.test(text)) return "merchant";
  if (DOOR.test(text)) return "door";
  if (PASSAGE.test(text)) return "passage";
  if (TRANSPORT.test(text)) return "transport";
  if (CRAFT.test(text)) return "craft";
  if (NUMERIC.test(text)) return "note";
  if (NAME_LIKE.test(text) && text.split(/\s+/).length <= NAME_MAX_WORDS) return "named";
  return "note";
}

/** One row of the map's label filter: a kind present in this map, how many, and its usual color. */
export interface PoiKindSummary {
  kind: PoiKind;
  label: string;
  hint: string;
  count: number;
  /** The color most of this kind wear on *this* map — how you recognise them on screen. */
  color?: string;
}

/** One section of the filter: the kinds under it that this map actually has, and their total. */
export interface PoiGroupSummary {
  group: PoiGroup;
  label: string;
  count: number;
  kinds: PoiKindSummary[];
}

/**
 * The label kinds a map actually contains, in display order. Built per map so a zone with no
 * quest markers doesn't offer to hide them, and so each row can show the color those labels
 * really are here rather than a color we assumed.
 */
export function poiKindSummary(pois: MapPoi[]): PoiKindSummary[] {
  const counts = new Map<PoiKind, { n: number; colors: Map<string, number> }>();
  for (const poi of pois) {
    const kind = poiKind(poi.label);
    const bag = counts.get(kind) ?? { n: 0, colors: new Map() };
    bag.n++;
    if (poi.color) bag.colors.set(poi.color, (bag.colors.get(poi.color) ?? 0) + 1);
    counts.set(kind, bag);
  }
  return POI_KINDS.flatMap(({ kind, label, hint }) => {
    const bag = counts.get(kind);
    if (!bag) return [];
    const color = [...bag.colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return [{ kind, label, hint, count: bag.n, color }];
  });
}

/**
 * The same rows, arranged into the filter's sections — an empty section is dropped, so a zone with
 * no doors and no traps offers no "Doors & traps" heading to fold.
 */
export function poiGroupSummary(pois: MapPoi[]): PoiGroupSummary[] {
  const rows = poiKindSummary(pois);
  const groupOf = new Map(POI_KINDS.map((k) => [k.kind, k.group]));
  return POI_GROUPS.flatMap(({ group, label }) => {
    const kinds = rows.filter((r) => groupOf.get(r.kind) === group);
    if (!kinds.length) return [];
    return [{ group, label, count: kinds.reduce((n, k) => n + k.count, 0), kinds }];
  });
}
