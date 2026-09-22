/**
 * fetch-stances-invocations.mjs — regenerate the stance/invocation-by-class table from eqlwiki's own
 * "Stances & Invocations" page.
 *
 * A **third** static-generated exception to `specs/wiki-data/README.md`'s "item/quest/recipe data is
 * fetched at runtime" rule, alongside the zone facts and Alanna's Race Unlock Guide
 * ([ADR 0262](../specs/decisions/0262-stances-and-invocations-are-generated-static-data.md)): which
 * classes can use which stance or invocation is wanted as a standalone reference chart, before
 * anything else is on screen, and it's a fact about EQL's class design that changes about never —
 * the same two reasons the zone facts ship as data rather than being fetched live. Unlike the race
 * unlock guide, this page *is* a uniform template (`Name | Description | Classes`, one row per
 * ability) rather than hand-authored prose, so it's closer in kind to the zone infobox — see this
 * script's parser (`scripts/lib/stances-invocations-parse.mjs`) for what "uniform" means here and the
 * one place the page contradicts itself (a name spelled two ways between its two tables).
 *
 *   node scripts/fetch-stances-invocations.mjs            # rewrite the generated table
 *   node scripts/fetch-stances-invocations.mjs --dry-run  # report what would change, write nothing
 *
 * Fails loudly, by name, on anything that doesn't fit the shape the parser was built against — see
 * its own header. Re-run this whenever the page changes and commit the diff; nothing regenerates it
 * on a schedule, the same as the race unlock guide.
 */
import path from "node:path";
import { ROOT, flag, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parseStancesInvocations } from "./lib/stances-invocations-parse.mjs";

const PAGE_TITLE = "Stances & Invocations";
const OUT = path.join(ROOT, "src/shared/stances-invocations.generated.ts");
const dryRun = flag("dry-run");

function renderAbility(a) {
  const classes = a.classes.map((c) => JSON.stringify(c)).join(", ");
  return `  { name: ${JSON.stringify(a.name)}, description: ${JSON.stringify(a.description)}, classes: [${classes}] },`;
}

async function main() {
  console.log(`Fetching "${PAGE_TITLE}"…`);
  const pages = await wikitextFor([PAGE_TITLE]);
  const wikitext = pages.get(PAGE_TITLE);
  if (!wikitext) throw new Error(`eqlwiki has no page "${PAGE_TITLE}" — has it been renamed or deleted?`);

  const { stances, invocations } = parseStancesInvocations(wikitext);
  console.log(`Parsed ${stances.length} stances, ${invocations.length} invocations.`);
  for (const a of [...stances, ...invocations]) console.log(`  ${a.name.padEnd(20)} ${a.classes.join(" ")}`);

  const body = `/**
 * Which classes can use which stance or invocation — GENERATED, do not edit by hand.
 *
 * Regenerate with \`npm run stances:fetch\` (\`scripts/fetch-stances-invocations.mjs\`), which fetches
 * and parses "${PAGE_TITLE}" (scraped ${new Date().toISOString()}). Shipped rather than fetched at
 * runtime — see this script's own header and
 * [ADR 0262](../../specs/decisions/0262-stances-and-invocations-are-generated-static-data.md).
 *
 * \`classes\` is the wiki's own three-letter code per class (\`class-names.ts\`'s
 * \`CLASS_ABBREVIATIONS\`) — translated to the app's full class names in \`stances-invocations.ts\`,
 * not here, so this file only ever says what the wiki said. Nothing should import this file
 * directly; the lookup over it lives beside it in \`stances-invocations.ts\`.
 *
 * ${stances.length} stances, ${invocations.length} invocations.
 */

export interface StanceInvocationAbility {
  name: string;
  description: string;
  classes: string[];
}

export const STANCES_INVOCATIONS_SOURCE = { title: ${JSON.stringify(PAGE_TITLE)}, scrapedAt: ${JSON.stringify(new Date().toISOString())} };

export const STANCES: StanceInvocationAbility[] = [
${stances.map(renderAbility).join("\n")}
];

export const INVOCATIONS: StanceInvocationAbility[] = [
${invocations.map(renderAbility).join("\n")}
];
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
