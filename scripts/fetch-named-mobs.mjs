/**
 * fetch-named-mobs.mjs — regenerate the list of eqlwiki's own "Named Mobs" category.
 *
 * `Category:Named Mobs` is eqlwiki's spawn-mechanics tag — a mob that fills a spawn slot which
 * otherwise cycles through an ordinary placeholder — not a promise that every member has a unique
 * proper name. Taken as the map's source of truth for "named" anyway
 * ([ADR 0265](../specs/decisions/0265-named-spawns-mark-themselves-on-the-map.md)): eqlwiki has no
 * narrower `Category:Rare` at all, and this is the one list the wiki itself keeps.
 *
 * A category listing, not a page to parse — `categoryMembers` (`scripts/lib/eqlwiki.mjs`) already
 * walks it, continuation and all, so there is nothing else to do but sort and stamp it.
 *
 *   node scripts/fetch-named-mobs.mjs            # rewrite the generated list
 *   node scripts/fetch-named-mobs.mjs --dry-run  # report what would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, writeGenerated } from "./lib/cli.mjs";
import { categoryMembers } from "./lib/eqlwiki.mjs";

const CATEGORY = "Named Mobs";
const OUT = path.join(ROOT, "src/shared/named-mobs.generated.ts");
const dryRun = flag("dry-run");

async function main() {
  console.log(`Fetching "Category:${CATEGORY}"…`);
  const titles = (await categoryMembers(CATEGORY)).sort((a, b) => a.localeCompare(b));
  console.log(`${titles.length} named mobs.`);

  const body = `/**
 * eqlwiki's "Named Mobs" category — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-named-mobs.mjs\`, which walks eqlwiki's own
 * \`Category:${CATEGORY}\` (scraped ${new Date().toISOString()}). Shipped rather than fetched at
 * runtime — see this script's own header and
 * [ADR 0265](../../specs/decisions/0265-named-spawns-mark-themselves-on-the-map.md).
 *
 * A plain title list, in the category's own order. The fold that matches a title against a kill
 * log or a zone's NPC roster lives in \`named-mobs.ts\`, beside the lookup; nothing should import
 * this file directly outside it.
 *
 * ${titles.length} named mobs.
 */

export const NAMED_MOBS_SOURCE = { title: ${JSON.stringify(`Category:${CATEGORY}`)}, scrapedAt: ${JSON.stringify(new Date().toISOString())} };

export const NAMED_MOBS: string[] = ${JSON.stringify(titles, null, 2)};
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
