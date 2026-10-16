/**
 * fetch-quest-pickups.mjs — regenerate the quest items that lie on the ground at a known spot.
 *
 * Epic quests send you to pick things up — the wizard epic's ten Rods for Tarton's Wheel, and steps
 * like it in every other class's epic — and eqlwiki keeps each such step on the quest's own page as a
 * table of Zone / Location rows (`scripts/lib/pickup-table-parse.mjs`). This reads every page in
 * `PAGES` and writes them into one dataset the map pins and the shopping list both read
 * ([ADR 0291](../specs/decisions/0291-quest-pickups-are-generated-static-data.md)).
 *
 * Some pages list the pieces as checklist bullets instead of a table — the enchanter's Coin of Tash
 * writes its ten coins as `** Azia - Ak'anon - directions (y, x, z)` (`scripts/lib/pickup-checklist-parse.mjs`).
 *
 * **Adding another epic step is one line in `PAGES`** and a rerun:
 *   - `page`  — the eqlwiki page holding the table (usually the quest's own).
 *   - `quest` — the quest it's for, which becomes the list group the items are filed under.
 *   - `label` — the table's column that names each one; it captions the map pin. Omit it for a
 *               checklist page, whose bullets lead with their own label.
 *   - `item`  — what each one is called in game (defaults to `label`'s column header).
 *   - `from`  — `"checklist"` for a page that lists them as bullets; `"spots"` for one that only
 *               mentions them in prose, naming each in `spots` (`scripts/lib/pickup-spots-parse.mjs`);
 *               `"npcs"` for a long quest with no pickups, bundled only for its NPCs; a table otherwise.
 *   - `spots` — for `"spots"`: `{ item, label?, match?, zone?, noLoc? }` per ground spawn. `label`
 *               only where several share one item name (the list keys entries by name).
 *
 * Only quests in zones this server runs: a pickup in a zone the map can't open is a pin nobody can
 * reach (a test holds every zone to `isKnownPlace`). Kunark and Velious ones wait for their era —
 * see ADR 0299.
 *
 *   node scripts/fetch-quest-pickups.mjs            # rewrite the generated list
 *   node scripts/fetch-quest-pickups.mjs --dry-run  # report what would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parsePickupChecklist } from "./lib/pickup-checklist-parse.mjs";
import { parsePickupSpots } from "./lib/pickup-spots-parse.mjs";
import { parsePickupTables } from "./lib/pickup-table-parse.mjs";
import { checklistStepsFor, npcPlace, relatedNpcs } from "./lib/quest-npc-parse.mjs";

helpIfAsked(import.meta.url);

const PAGES = [
  { page: "Tarton's Wheel", quest: "Tarton's Wheel", label: "Rod", item: "Rod" },
  { page: "Coin of Tash (Tashania)", quest: "Coin of Tash (Tashania)", item: "Old Silver Coin", from: "checklist" },
  {
    page: "The Bones of Darak Lightforge",
    from: "spots",
    spots: [
      // The Ghost Room Pit, Kedge Keep, Mistmoore's garden and Meldrath's room are described, never located.
      { item: "A Dusty Old Backbone", match: "** [[A Dusty Old Backbone]]", noLoc: true, zone: "Unrest" },
      { item: "Dusty Ribcage", match: "** [[Dusty Ribcage]] - <b>", noLoc: true, zone: "Mistmoore Castle" },
      { item: "Dusty Old Finger Bones", match: "** [[Dusty Old Finger Bones]]", noLoc: true, zone: "Kedge Keep" },
      { item: "Dusty Old Skull", match: "** [[Dusty Old Skull]]", noLoc: true, zone: "Steamfont Mountains" },
      { item: "A Dusty Old Jawbone", match: "** [[A Dusty Old Jawbone]]" },
      { item: "A Dusty Broken Sword", match: "** [[A Dusty Broken Sword]]" },
      { item: "A Dusty Broken Shield", match: "** [[A Dusty Broken Shield]]" },
    ],
  },
  {
    page: "Armor of the Priest Quests",
    from: "spots",
    spots: [
      { item: "Ingot of the Penitent" },
      { item: "Turgan's Note", match: "Turgan's Note is a ground spawn", zone: "Kithicor Forest" },
      { item: "Ingot of the Reliant", zone: "Kithicor Forest" },
      { item: "Ingot of the Ardent" },
    ],
  },
  {
    page: "Ivan McMannus' Remains",
    from: "spots",
    spots: [
      { item: "Barbarian Femur", match: "* [[Barbarian Femur]]", zone: "Everfrost Peaks" },
      { item: "Barbarian Jaw", match: "* [[Barbarian Jaw]]", zone: "Everfrost Peaks" },
      { item: "Barbarian Skull", match: "* [[Barbarian Skull]]", zone: "Everfrost Peaks" },
    ],
  },
  {
    page: "The Geologist's Purloined Tools",
    from: "spots",
    spots: [
      { item: "Magnifying Glass", match: "* The [[Magnifying Glass]]", zone: "Erud's Crossing" },
      { item: "Geologist's Hammer", match: "* The [[Geologist's Hammer]]", zone: "Erud's Crossing" },
    ],
  },
  { page: "Rogue Redemption", from: "spots", spots: [{ item: "The Oblong Bottle", match: "[[The Oblong Bottle]] - ground spawn", zone: "Ocean of Tears" }] },
  { page: "Caduceus of Sacrament Quest", from: "spots", spots: [{ item: "Icon of Sacrament", match: "* [[Icon of Sacrament]]" }] },
  { page: "The Rogue Take", from: "spots", spots: [{ item: "Locked Chest", zone: "East Freeport" }] },
  {
    page: "Chalice of Conquest Quest",
    from: "spots",
    // The page's own link is missing a bracket: "[Abandoned Orc Shovel]] is a ground spawn".
    spots: [{ item: "Abandoned Orc Shovel", match: "Abandoned Orc Shovel]] is a ground spawn", zone: "Lake Rathetear" }],
  },
  // The spot comes before the item in this sentence: "Go to the second location at (275, -350) to … pick up … [[Sealed List]]".
  { page: "The Bridge", from: "spots", spots: [{ item: "Sealed List", match: "Go to the second location at", zone: "South Qeynos" }] },
  { page: "Tunic of Ridossan Quest", from: "spots", spots: [{ item: "Green river sludge", zone: "The Feerrott" }] },
  // Long in-era quests whose top table names five or more NPCs the wiki places — bundled for their
  // NPC pins alone. (The class epics would be here, but they are "Epics Era": out of era on this server.)
  ...[
    "Incandescent Armor Quests",
    "Noble Hunters",
    "Sentry Xyrin Quest",
    "Poacher's Head Quest (Surefall Glade)",
    "Vasty Deep Water",
    "Crafted Armor Quests",
    "Poacher's Head Quest (Erudin)",
    "Series C Black Boxes",
    "Taxes",
    "Blessed Oil Quest",
    "Blessed Oil",
    "Langseax Quest",
    "Magic Elixir for the Warriors",
    "Princess Lenya (Quest)",
    "Rogue Errands",
    "Telescope Lenses",
    "The Bayle List",
    "The Donations",
    "Titan Samples (good)",
  ].map((page) => ({ page, from: "npcs" })),
].map((p) => ({ quest: p.page, ...p }));

/**
 * Where an NPC stands when their wiki page doesn't say — measured in game, so a quest's NPC still gets
 * a pin. Used only as a fallback: once the page states a location, the page wins.
 */
const MEASURED_NPC_PLACES = {
  // `/loc` beside him while handing in Tarton's Wheel, 2026-10-14. His page has only a map image.
  Sulgar: { zone: "Everfrost Peaks", loc: { y: 2998, x: -2399 }, note: "" },
};

const WIKI = "https://eqlwiki.com";
const OUT = path.join(ROOT, "src/shared/quests/quest-pickups.generated.ts");
const dryRun = flag("dry-run");

async function main() {
  console.log(`Fetching ${PAGES.map((p) => `"${p.page}"`).join(", ")}…`);
  const texts = await wikitextFor(PAGES.map((p) => p.page));
  const pickups = [];
  for (const { page, quest, label, item = label, from, spots } of PAGES) {
    const text = texts.get(page);
    if (!text) throw new Error(`eqlwiki has no page "${page}"`);
    if (from === "npcs") continue;
    if (from === "spots") {
      const { rows, skipped } = parsePickupSpots(text, spots);
      // Every spot was named by hand, so one the page no longer has is a config to fix, not noise.
      if (skipped.length) throw new Error(`"${page}": ${skipped.join("; ")}`);
      console.log(`  ${rows.length} ground spawn(s) for ${quest}.`);
      for (const r of rows) pickups.push({ quest, item: r.item, label: r.label, zone: r.zone, ...(r.loc ? { loc: r.loc } : {}), note: r.note, page });
      continue;
    }
    const checklist = from === "checklist";
    const { rows, skipped } = checklist ? parsePickupChecklist(text) : parsePickupTables(text, { label });
    if (!rows.length) {
      throw new Error(
        checklist
          ? `"${page}" has no "Label - Zone - directions (loc)" checklist bullets`
          : `"${page}" has no table with ${label} / Zone / Location columns`,
      );
    }
    if (skipped.length) console.warn(`  skipped (no location): ${skipped.join(", ")}`);
    console.log(`  ${rows.length} ${item}s for ${quest}.`);
    for (const r of rows) {
      pickups.push({
        quest,
        item,
        label: r.label,
        zone: r.zone,
        loc: r.loc,
        note: [r.note, ...r.extras].filter(Boolean).join(" "),
        page,
      });
    }
  }

  const npcs = await questNpcs(texts);

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * Quest items that lie on the ground at a known spot — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-quest-pickups.mjs\`, which reads eqlwiki's quest-page
 * pickup tables (scraped ${scrapedAt}). Shipped rather than fetched at runtime — see
 * [ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md). Read it
 * through \`quest-pickups.ts\`, which owns how a pickup is named on the list and placed on the map.
 *
 * ${pickups.length} pickups, ${npcs.length} quest NPCs.
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
  /** Where, in \`/loc\` order — absent when the page only describes the spot ("in the Ghost Room Pit"). */
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
  /** Where their page says they stand, in \`/loc\` order. */
  loc: { y: number; x: number; z?: number };
  /** The quest's checklist steps that name them — what to hand in, and what you get back. */
  steps: string[];
  /** How to reach them, from their page. */
  note: string;
}

export const QUEST_PICKUPS_SOURCE = { wiki: ${JSON.stringify(WIKI)}, pages: ${JSON.stringify(PAGES.map((p) => p.page))}, scrapedAt: ${JSON.stringify(scrapedAt)} };

export const QUEST_PICKUPS: QuestPickup[] = ${JSON.stringify(pickups, null, 2)};

export const QUEST_NPCS: QuestNpc[] = ${JSON.stringify(npcs, null, 2)};
`;

  writeGenerated(OUT, body, { dryRun });
}

/**
 * Every NPC each quest page's top table names, placed by the NPC's own page
 * (`scripts/lib/quest-npc-parse.mjs`). One whose page states no zone and location is reported and
 * left out — no pin is better than one at 0, 0.
 */
async function questNpcs(questTexts) {
  const wanted = PAGES.map(({ page, quest }) => {
    const text = questTexts.get(page);
    return { quest, text, names: relatedNpcs(text) };
  });
  const npcTexts = await wikitextFor([...new Set(wanted.flatMap((w) => w.names))]);
  const npcs = [];
  for (const { quest, text, names } of wanted) {
    const unplaced = [];
    for (const npc of names) {
      const place = npcPlace(npcTexts.get(npc) ?? "") ?? MEASURED_NPC_PLACES[npc];
      if (!place) {
        unplaced.push(npc);
        continue;
      }
      npcs.push({ quest, npc, zone: place.zone, loc: place.loc, steps: checklistStepsFor(text, npc), note: place.note });
    }
    console.log(`  ${names.length - unplaced.length} NPCs for ${quest}.`);
    if (unplaced.length) console.warn(`  skipped (no location on their page): ${unplaced.join(", ")}`);
  }
  return npcs;
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
