/**
 * fetch-aa-list.mjs — regenerate the Alternate Advancement reference list from eqlwiki's own page.
 *
 * eqlwiki's "Alternate Advancement" page is a **single hand-authored page**, not one of the recurring
 * templates `electron/wiki/parse.ts` reads generically (it uses plain `.wikitable`, never the item/
 * quest/mob/faction pages' `eoTable2`/`eoTable3`/signature container classes) — the same situation
 * Alanna's Race Unlock Guide and "Stances & Invocations" are in, and the same reason it's shipped the
 * same way: as committed, generated data rather than fetched live at runtime (see
 * `specs/wiki-data/README.md`'s Non-responsibilities, and
 * [ADR 0263](../specs/decisions/0263-the-alternate-advancement-page-is-generated-static-data.md)).
 * Nothing else re-checks this data against the live game, so a reformat has to show up as a diff to
 * review, not as a parser quietly breaking inside a running app.
 *
 *   node scripts/fetch-aa-list.mjs            # rewrite the generated table
 *   node scripts/fetch-aa-list.mjs --dry-run  # report what would change, write nothing
 *
 * **Fails loudly, on purpose.** `aa-list-parse.mjs` throws with the specific section or row that
 * didn't match the shape this was built against, rather than silently emitting a short list or a
 * garbled description — a bad regen must be *impossible* to commit by accident. Re-run this whenever
 * the wiki page changes, and if it refuses, read the error: it names exactly what to go looking at.
 */
import path from "node:path";
import { ROOT, flag, load, writeGenerated } from "./lib/cli.mjs";
import { wikitextFor } from "./lib/eqlwiki.mjs";
import { parseAlternateAdvancement } from "./lib/aa-list-parse.mjs";

const PAGE_TITLE = "Alternate Advancement";
const OUT = path.join(ROOT, "src/shared/aa-list.generated.ts");
const dryRun = flag("dry-run");

function renderEntry(e) {
  const fields = [
    `name: ${JSON.stringify(e.name)}`,
    `ranks: ${JSON.stringify(e.ranks)}`,
    `cost: ${JSON.stringify(e.cost)}`,
    `description: ${JSON.stringify(e.description)}`,
    `category: ${JSON.stringify(e.category)}`,
    ...(e.category === "class" ? [`class: ${JSON.stringify(e.class)}`] : []),
  ];
  return `  { ${fields.join(", ")} },`;
}

async function main() {
  console.log(`Fetching "${PAGE_TITLE}"…`);
  const pages = await wikitextFor([PAGE_TITLE]);
  const wikitext = pages.get(PAGE_TITLE);
  if (!wikitext) throw new Error(`eqlwiki has no page "${PAGE_TITLE}" — has it been renamed or deleted?`);

  const { SPELL_CLASSES } = load("src/shared/spell-file.js");
  const entries = parseAlternateAdvancement(wikitext, SPELL_CLASSES);

  console.log(`Parsed ${entries.length} AAs.`);
  for (const category of ["general", "archetype", "special"]) {
    console.log(`  ${category.padEnd(12)} ${entries.filter((e) => e.category === category).length}`);
  }
  for (const cls of SPELL_CLASSES) {
    console.log(`  class:${cls.padEnd(14)} ${entries.filter((e) => e.category === "class" && e.class === cls).length}`);
  }

  const body = `/**
 * Alternate Advancement abilities — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-aa-list.mjs\`, which fetches and parses eqlwiki's
 * "${PAGE_TITLE}" page (scraped ${new Date().toISOString()}). Shipped rather than
 * fetched at runtime — see this script's own header and
 * [ADR 0263](../../specs/decisions/0263-the-alternate-advancement-page-is-generated-static-data.md).
 *
 * \`ranks\`/\`cost\` are kept as the wiki's own **text** ("4", "2/4/6/9") rather than parsed into
 * numbers — the same reasoning \`parseZoneNpcs\` keeps a mob's level range as text for
 * (\`electron/wiki/parse.ts\`): nothing here computes on them, so parsing would only be a chance to
 * get it wrong. \`description\` is plain text with wiki markup stripped, since it's what
 * \`AAPanel\`'s search matches against.
 *
 * Entries are in the wiki page's own order: General, Archetype, each class (in \`SPELL_CLASSES\`
 * order), then Special. The lookup/UI over this lives in \`AAPanel.tsx\`; nothing should import this
 * file directly outside it.
 *
 * ${entries.length} AAs.
 */

import type { SPELL_CLASSES } from "./spell-file";

export interface AlternateAdvancementFacts {
  name: string;
  ranks: string;
  cost: string;
  description: string;
}

export type AACategory =
  | { category: "general" }
  | { category: "archetype" }
  | { category: "class"; class: (typeof SPELL_CLASSES)[number] }
  | { category: "special" };

export type AlternateAdvancement = AlternateAdvancementFacts & AACategory;

export const AA_LIST_SOURCE = { title: ${JSON.stringify(PAGE_TITLE)}, scrapedAt: ${JSON.stringify(new Date().toISOString())} };

export const AA_LIST: AlternateAdvancement[] = [
${entries.map(renderEntry).join("\n")}
];
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
