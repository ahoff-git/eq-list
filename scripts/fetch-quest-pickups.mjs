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
 *   - `from`  — `"checklist"` for a page that lists them as bullets; a table otherwise.
 *
 *   node scripts/fetch-quest-pickups.mjs            # rewrite the generated list
 *   node scripts/fetch-quest-pickups.mjs --dry-run  # report what would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parsePickupChecklist } from "./lib/pickup-checklist-parse.mjs";
import { parsePickupTables } from "./lib/pickup-table-parse.mjs";
import { checklistStepsFor, npcPlace, relatedNpcs } from "./lib/quest-npc-parse.mjs";

helpIfAsked(import.meta.url);

const PAGES = [
  { page: "Tarton's Wheel", quest: "Tarton's Wheel", label: "Rod", item: "Rod" },
  { page: "Coin of Tash (Tashania)", quest: "Coin of Tash (Tashania)", item: "Old Silver Coin", from: "checklist" },
];

const WIKI = "https://eqlwiki.com";
const OUT = path.join(ROOT, "src/shared/quests/quest-pickups.generated.ts");
const dryRun = flag("dry-run");

async function main() {
  console.log(`Fetching ${PAGES.map((p) => `"${p.page}"`).join(", ")}…`);
  const texts = await wikitextFor(PAGES.map((p) => p.page));
  const pickups = [];
  for (const { page, quest, label, item = label, from } of PAGES) {
    const text = texts.get(page);
    if (!text) throw new Error(`eqlwiki has no page "${page}"`);
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
  /** Where, in \`/loc\` order. */
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
  /** Where their page says they stand, in \`/loc\` order. */
  loc: { y: number; x: number };
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
      const place = npcPlace(npcTexts.get(npc) ?? "");
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
