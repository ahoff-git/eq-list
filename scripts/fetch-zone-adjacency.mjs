/**
 * fetch-zone-adjacency.mjs — regenerate the zone ↔ zone adjacency table from eqlwiki.
 *
 * **The maps only know what a mapmaker labelled.** The travel graph is read off exit labels
 * (ADR 0062), and a border exists only when a label names a destination something answers to — which
 * leaves 146 borders drawn from one side only and 212 destinations no map file answered to. eqlwiki
 * states the same fact from the other direction: every zone page carries an **Adjacent Zones** row,
 * written by people who play here.
 *
 * It says *that* two zones connect and never *where*, which is exactly the shape the graph already
 * handles honestly — a border with no position in a zone, priced by `UNKNOWN_CROSSING` and flagged.
 * So this adds reachability without pretending to add distance.
 *
 * **Shipped, not fetched at runtime.** The output is a committed table, like the expansion one beside
 * it, so a normal launch costs eqlwiki nothing at all; re-run this when the wiki moves on.
 *
 *   node scripts/fetch-zone-adjacency.mjs            # rewrite the generated table
 *   node scripts/fetch-zone-adjacency.mjs --dry-run  # report what would change, write nothing
 *
 * **Kind to the wiki by construction**: titles come from one category listing, and the wikitext is
 * pulled fifty pages per request rather than one page at a time — see `lib/eqlwiki.mjs`, which is
 * also where the levels generator beside this one gets its pages.
 */
import path from "node:path";
import { ROOT, few, flag, writeGenerated } from "./lib/cli.mjs";
import { infoboxRow, zonePages } from "./lib/eqlwiki.mjs";

const OUT = path.join(ROOT, "src/shared/zones/adjacency.generated.ts");
const dryRun = flag("dry-run");

/**
 * The zones a page says it is next to.
 *
 * **Parenthesised notes are cut before the links are read.** They are asides about the entry beside
 * them — `(within the zone)`, `(depricated [[Runnyeye Citadel]])` — and the second shape is why it
 * matters: a note naming a *different* page, which read as an entry would assert an adjacency the
 * sentence is explicitly denying.
 *
 * **A piped link keeps its display text.** `[[Freeport|East Freeport]]` is the Freeport page standing
 * in for East Freeport, and East Freeport is the zone — the same side a map label writes, and the same
 * choice the expansion table makes.
 */
export function adjacentIn(wikitext) {
  const row = infoboxRow(wikitext, "Adjacent Zones");
  if (!row) return [];
  const value = row.replace(/\([^()]*\)/g, " ");
  const names = [];
  for (const link of value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const name = (link[2] ?? link[1]).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

const banner = (rows, pairs) => `/**
 * Which zones eqlwiki says are next to which — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-zone-adjacency.mjs\`. Shipped rather than fetched, so a normal
 * launch costs the wiki nothing; re-run it when the wiki moves on.
 *
 * **A claim, not a measurement.** It says two zones connect and never where the crossing is, so a
 * border added from it has no position in either zone: every walk to it is priced by
 * \`UNKNOWN_CROSSING\` and flagged, which is the honest shape for something nobody drew. A border the
 * maps *did* draw is never overridden by it — an exact map label beats the wiki beats everything else
 * (see specs/travel).
 *
 * Names are the wiki's own, resolved against this pack's zones at build time by the same fold every
 * zone comparison in the app shares. Nothing should import this file directly — the lookup is
 * \`adjacency.ts\` beside it.
 *
 * ${rows} zones, ${pairs} stated pairs.
 */

/** A zone name → the zones its page lists as adjacent, as the wiki spells them. */
export const WIKI_ADJACENT: Readonly<Record<string, readonly string[]>> = {
`;

const main = async () => {
  const { titles, pages } = await zonePages();

  const table = {};
  const silent = [];
  for (const title of titles) {
    const found = adjacentIn(pages.get(title) ?? "");
    if (found.length) table[title] = found;
    else silent.push(title);
  }
  const pairs = Object.values(table).reduce((n, list) => n + list.length, 0);
  console.log(`${Object.keys(table).length} zones state adjacency (${pairs} pairs).`);
  if (silent.length) console.warn(`no Adjacent Zones row on ${silent.length}: ${few(silent, 12)}`);

  const body = Object.entries(table)
    .map(([zone, list]) => `  ${JSON.stringify(zone)}: [${list.map((z) => JSON.stringify(z)).join(", ")}],`)
    .join("\n");
  writeGenerated(OUT, `${banner(Object.keys(table).length, pairs)}${body}\n};\n`, { dryRun });
};

await main();
