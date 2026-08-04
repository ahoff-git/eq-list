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
 * Pure and dependency-free, and tested against the real corpus — see `poi-kinds.test.ts`.
 */

import type { MapPoi } from "./eqmap";

export type PoiKind = "travel" | "quest" | "merchant" | "craft" | "mob" | "named" | "note";

/** Display order and wording for the label filter. */
export const POI_KINDS: { kind: PoiKind; label: string; hint: string }[] = [
  { kind: "travel", label: "Zone lines", hint: "Exits to other zones, and Succor points" },
  { kind: "quest", label: "Quests", hint: "Quest and mission markers, and who gives them" },
  { kind: "merchant", label: "Merchants", hint: "Vendors, bankers and trainers — anyone whose label names their trade" },
  { kind: "craft", label: "Tradeskills", hint: "Forges, looms, kilns, ovens and the rest of the stations" },
  { kind: "mob", label: "Mobs", hint: "Ordinary spawns — a label that starts with a/an/the" },
  { kind: "named", label: "Named", hint: "Someone or something with a proper name" },
  { kind: "note", label: "Notes", hint: "Everything else the mapmaker wrote down — areas, loot, directions" },
];

/** Tradeskill stations, which are labelled by the object rather than by a person. */
const CRAFT = /\b(forge|loom|kiln|oven|pottery wheel|brew barrel|barrel|anvil|workbench|bench|tanning|sewing kit|spit|stove|cauldron|still|mixing bowl|grill|tool box|toolbox|jeweler'?s kit)\b/i;

/**
 * A trade named in parentheses — "(Weapons)", "(Wizard Spells)", "(Banker)", "(Tinkering
 * Supplies)". This is how the packs mark merchants and trainers, and it's the single most common
 * shape in the whole corpus.
 */
const TRADE_PAREN = /\(([^)]+)\)\s*$/;
const QUEST_TRADE = /\b(quest|quests|mission|missions|task|tasks|task master|taskmaster)\b/i;

/** A quest marker's prefix, as the packs write it: "GS: Questionable Cheese", "Q: …". */
const QUEST_PREFIX = /^(gs|gt|q|quest)\s*[:.-]/i;

/** Where a zone line or a succor point is. */
const TRAVEL = /^(to|zone to|zoneline|zone line|succor|succour|port in|entrance|exit)\b/i;

/** A label that's really a coordinate or a bare number — a mapmaker's own note. */
const NUMERIC = /^-?\d+[\s,.]/;

/**
 * Which kind a label reads as. Order matters: the most specific shapes are tested first, and
 * "note" is the honest fallback rather than a guess.
 */
export function poiKind(label: string): PoiKind {
  const text = label.trim();
  if (!text) return "note";
  if (TRAVEL.test(text)) return "travel";
  if (QUEST_PREFIX.test(text)) return "quest";

  const paren = TRADE_PAREN.exec(text);
  if (paren) {
    // "(Quests)" and "(Missions)" are quest givers; any other trade in parentheses is a merchant
    // or trainer. Either way the parenthetical is what tells us — the name never would.
    return QUEST_TRADE.test(paren[1]) ? "quest" : "merchant";
  }
  if (CRAFT.test(text)) return "craft";
  if (NUMERIC.test(text)) return "note";
  // An article means an ordinary spawn ("a grimling arcanist"), the same signal the cast-alert
  // matcher uses to tell a mob from a player. Without one it's a proper name.
  if (/^(an?|the)\s/i.test(text)) return "mob";
  if (/^[A-Z`'’]/.test(text) && text.split(/\s+/).length <= 4) return "named";
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
