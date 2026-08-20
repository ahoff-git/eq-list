/**
 * fetch-zone-levels.mjs — regenerate the "what level is this zone" table from eqlwiki.
 *
 * The hunt list answers *where do I go to farm what's left*, and the next question a person asks of
 * every zone on it is whether they can survive there. eqlwiki already answers it: every zone page's
 * infobox carries a **Level of Monsters** row, written by people who play this server — the same
 * infobox, on the same pages, that the adjacency table beside this one is read from
 * ([ADR 0117](../specs/decisions/0117-the-wiki-says-which-zones-touch.md)). So this is one more row
 * off a crawl that already exists (`lib/eqlwiki.mjs`), not a new source.
 *
 * **The value is kept exactly as the wiki writes it.** Real rows include `1-12`, `7-25+`,
 * `1-20, 35` and `29-34 Droga Main, 33-38 Inner Sanctum` — a zone is not one span, and flattening
 * those to a min and a max would invent a claim ("levels 1 to 35") the wiki is careful not to make.
 * The one thing this does judge is whether there's a number in there at all: `?`, `n/a` and
 * `Quest Only` say nothing a reader can use, so they're left out rather than shown as a level.
 *
 *   node scripts/fetch-zone-levels.mjs            # rewrite the generated table
 *   node scripts/fetch-zone-levels.mjs --dry-run  # report what would change, write nothing
 *
 * **Shipped, not fetched at runtime**, like every other generated table here: a normal launch costs
 * the wiki nothing. Re-run it when the wiki moves on.
 */
import path from "node:path";
import { ROOT, few, flag, writeGenerated } from "./lib/cli.mjs";
import { infoboxRow, zonePages } from "./lib/eqlwiki.mjs";

const OUT = path.join(ROOT, "src/shared/zones/levels.generated.ts");
const dryRun = flag("dry-run");

/**
 * The levels a page says its monsters are, or `undefined` when it doesn't say.
 *
 * Wiki decoration comes off (a link's display text is what a reader sees, bold quotes are noise) and
 * nothing else does. A value with no digit in it isn't a level range — it's the page shrugging — and
 * a shrug shown next to a zone name would read as information.
 */
export function levelsIn(wikitext) {
  const row = infoboxRow(wikitext, "Level of Monsters");
  if (!row) return undefined;
  const text = row
    .replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\d/.test(text) ? text : undefined;
}

const banner = (rows) => `/**
 * What level a zone's monsters are, as eqlwiki states it — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-zone-levels.mjs\`. Shipped rather than fetched, so a normal
 * launch costs the wiki nothing; re-run it when the wiki moves on.
 *
 * **Verbatim, because a zone is not one span.** \`1-20, 35\` and \`29-34 Droga Main, 33-38 Inner
 * Sanctum\` are two bands and a note about where each one is, and the min-and-max they'd collapse to
 * would be a claim the wiki never made. So the value is the wiki's own wording, shown as written —
 * the same choice \`levels.ts\` makes for a mob, one level up
 * ([ADR 0122](../../../specs/decisions/0122-a-zone-wears-its-levels.md)).
 *
 * Names are the wiki's own; the lookup beside this file (\`levels.ts\`) resolves them against whatever
 * a caller has in hand. Nothing should import this file directly.
 *
 * ${rows} zones.
 */

/** A zone name → the levels its page states for the monsters there, as the wiki writes them. */
export const ZONE_LEVELS: Readonly<Record<string, string>> = {
`;

const main = async () => {
  const { titles, pages } = await zonePages();

  const table = {};
  const silent = [];
  for (const title of titles) {
    const found = levelsIn(pages.get(title) ?? "");
    if (found) table[title] = found;
    else silent.push(title);
  }
  console.log(`${Object.keys(table).length} zones state a level range.`);
  if (silent.length) console.warn(`no usable Level of Monsters row on ${silent.length}: ${few(silent, 12)}`);

  const body = Object.entries(table)
    .map(([zone, levels]) => `  ${JSON.stringify(zone)}: ${JSON.stringify(levels)},`)
    .join("\n");
  writeGenerated(OUT, `${banner(Object.keys(table).length)}${body}\n};\n`, { dryRun });
};

await main();
