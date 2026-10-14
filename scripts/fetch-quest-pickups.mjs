/**
 * fetch-quest-pickups.mjs — regenerate the quest items that lie on the ground at a known spot.
 *
 * Epic quests send you to pick things up — the wizard epic's ten Rods for Tarton's Wheel, and steps
 * like it in every other class's epic — and eqlwiki keeps each such step on the quest's own page as a
 * table of Zone / Location rows (`scripts/lib/pickup-table-parse.mjs`). This reads every page in
 * `PAGES` and writes them into one dataset the map pins and the shopping list both read
 * ([ADR 0291](../specs/decisions/0291-quest-pickups-are-generated-static-data.md)).
 *
 * **Adding another epic step is one line in `PAGES`** and a rerun:
 *   - `page`  — the eqlwiki page holding the table (usually the quest's own).
 *   - `quest` — the quest it's for, which becomes the list group the items are filed under.
 *   - `label` — the table's column that names each one; it captions the map pin.
 *   - `item`  — what each one is called in game (defaults to `label`'s column header).
 *
 *   node scripts/fetch-quest-pickups.mjs            # rewrite the generated list
 *   node scripts/fetch-quest-pickups.mjs --dry-run  # report what would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parsePickupTables } from "./lib/pickup-table-parse.mjs";

helpIfAsked(import.meta.url);

const PAGES = [{ page: "Tarton's Wheel", quest: "Tarton's Wheel", label: "Rod", item: "Rod" }];

const WIKI = "https://eqlwiki.com";
const OUT = path.join(ROOT, "src/shared/quests/quest-pickups.generated.ts");
const dryRun = flag("dry-run");

async function main() {
  console.log(`Fetching ${PAGES.map((p) => `"${p.page}"`).join(", ")}…`);
  const texts = await wikitextFor(PAGES.map((p) => p.page));
  const pickups = [];
  for (const { page, quest, label, item = label } of PAGES) {
    const text = texts.get(page);
    if (!text) throw new Error(`eqlwiki has no page "${page}"`);
    const { rows, skipped } = parsePickupTables(text, { label });
    if (!rows.length) throw new Error(`"${page}" has no table with ${label} / Zone / Location columns`);
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

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * Quest items that lie on the ground at a known spot — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-quest-pickups.mjs\`, which reads eqlwiki's quest-page
 * pickup tables (scraped ${scrapedAt}). Shipped rather than fetched at runtime — see
 * [ADR 0291](../../../specs/decisions/0291-quest-pickups-are-generated-static-data.md). Read it
 * through \`quest-pickups.ts\`, which owns how a pickup is named on the list and placed on the map.
 *
 * ${pickups.length} pickups.
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

export const QUEST_PICKUPS_SOURCE = { wiki: ${JSON.stringify(WIKI)}, pages: ${JSON.stringify(PAGES.map((p) => p.page))}, scrapedAt: ${JSON.stringify(scrapedAt)} };

export const QUEST_PICKUPS: QuestPickup[] = ${JSON.stringify(pickups, null, 2)};
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
