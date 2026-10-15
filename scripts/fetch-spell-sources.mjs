/**
 * fetch-spell-sources.mjs — regenerate how each spell is obtained (vendor, quest, drop, research)
 * from every eqlwiki spell page's `where_to_obtain` field.
 *
 * Shipped as generated data ([ADR 0296](../specs/decisions/0296-spell-sources-are-generated-static-data.md))
 * rather than read off the harvested catalogue: the harvest's spell card never kept that section, so
 * every cached spell would need re-fetching to learn it, and the Spells tab wants the column on the
 * first open. The whole category is ~42 requests at fifty pages each.
 *
 *   node scripts/fetch-spell-sources.mjs            # rewrite the generated table
 *   node scripts/fetch-spell-sources.mjs --dry-run  # report what would change, write nothing
 *
 * The classifier is `scripts/lib/spell-source-parse.mjs`; its header lists the shapes it reads.
 * Re-run whenever the wiki's spell pages change and commit the diff.
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { categoryMembers, wikitextFor } from "./lib/eqlwiki.mjs";
import { KIND_ORDER, classifySpellSource, whereToObtain } from "./lib/spell-source-parse.mjs";

helpIfAsked(import.meta.url);

const CATEGORY = "Spells";
const OUT = path.join(ROOT, "src/shared/spells/spell-sources.generated.ts");
const dryRun = flag("dry-run");

function renderEntry([title, { kinds, quests }]) {
  const q = quests.length ? `, quests: ${JSON.stringify(quests)}` : "";
  return `  ${JSON.stringify(title)}: { kinds: ${JSON.stringify(kinds)}${q} },`;
}

async function main() {
  console.log(`Listing Category:${CATEGORY}…`);
  const titles = await categoryMembers(CATEGORY);
  console.log(`Fetching ${titles.length} spell pages…`);
  const texts = await wikitextFor(titles);

  const entries = [];
  for (const title of [...texts.keys()].sort((a, b) => a.localeCompare(b))) {
    const source = classifySpellSource(whereToObtain(texts.get(title)));
    if (source.kinds.length) entries.push([title, source]);
  }

  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, entries.filter(([, s]) => s.kinds.includes(k)).length]));
  console.log(`${entries.length} of ${texts.size} spells say where to obtain them:`, counts);
  for (const [title, s] of entries) if (s.kinds.includes("quest")) console.log(`  ${title.padEnd(32)} ${s.kinds.join("+")}  ${s.quests.join(" | ")}`);

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * How each spell is obtained — GENERATED, do not edit by hand.
 *
 * Regenerate with \`npm run spell-sources:fetch\` (\`scripts/fetch-spell-sources.mjs\`), which reads
 * every page in eqlwiki's Category:${CATEGORY} (scraped ${scrapedAt}). Shipped rather than fetched at
 * runtime — see [ADR 0296](../../../specs/decisions/0296-spell-sources-are-generated-static-data.md).
 * A spell whose page says nothing is absent. Read it through \`spell-sources.ts\`, not directly.
 *
 * ${entries.length} spells: ${KIND_ORDER.map((k) => `${counts[k]} ${k}`).join(", ")}.
 */

export type SpellSourceKind = ${KIND_ORDER.map((k) => JSON.stringify(k)).join(" | ")};

export interface SpellSourceEntry {
  kinds: SpellSourceKind[];
  /** Quest page titles, when \`kinds\` has \`"quest"\` and the wiki linked them. */
  quests?: string[];
}

export const SPELL_SOURCES_SOURCE = { category: ${JSON.stringify(CATEGORY)}, scrapedAt: ${JSON.stringify(scrapedAt)} };

export const SPELL_SOURCES: Record<string, SpellSourceEntry> = {
${entries.map(renderEntry).join("\n")}
};
`;

  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
