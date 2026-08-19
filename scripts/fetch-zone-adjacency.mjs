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
 * pulled `action=query&prop=revisions` **fifty pages per request** rather than one page at a time — so
 * a full refresh is a handful of calls rather than one per zone.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, few, flag } from "./lib/cli.mjs";

const OUT = path.join(ROOT, "src/shared/zones/adjacency.generated.ts");
const EQLWIKI = "https://eqlwiki.com/api.php";
/** The wiki's own cap on a multi-page `titles=` query for anonymous callers. */
const BATCH = 50;
/** A backstop against a continuation loop, not a real limit on the category. */
const MAX_PAGES = 40;
const dryRun = flag("dry-run");

async function api(params) {
  const url = `${EQLWIKI}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  const res = await fetch(url, { headers: { "User-Agent": "eq-list zone adjacency (+github.com/ahoff-git/eq-list)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Every article in a category, following continuation. `cmnamespace: 0` keeps sub-categories out. */
async function categoryMembers(category) {
  const titles = [];
  let cmcontinue;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmnamespace: "0", cmlimit: "max" };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await api(params);
    for (const m of data.query?.categorymembers ?? []) titles.push(m.title);
    cmcontinue = data.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return titles;
}

/** `title` → wikitext, fifty pages a request. */
async function wikitextFor(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const data = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: batch.join("|") });
    for (const page of data.query?.pages ?? []) {
      const text = page.revisions?.[0]?.slots?.main?.content;
      if (text) out.set(page.title, text);
    }
  }
  return out;
}

/**
 * The zones a page says it is next to.
 *
 * The row is an infobox header and its value:
 *
 *     ! ''' Adjacent Zones: '''
 *     |[[Rivervale]], [[Runnyeye]] (depricated [[Runnyeye Citadel]])
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
  const row = /^!\s*'{0,3}\s*Adjacent Zones:?\s*'{0,3}\s*$\r?\n\|(.*)$/im.exec(wikitext);
  if (!row) return [];
  const value = row[1].replace(/\([^()]*\)/g, " ");
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
 * \${rows} zones, \${pairs} stated pairs.
 */

/** A zone name → the zones its page lists as adjacent, as the wiki spells them. */
export const WIKI_ADJACENT: Readonly<Record<string, readonly string[]>> = {
`;

const main = async () => {
  const titles = await categoryMembers("Zones");
  console.log(`eqlwiki lists ${titles.length} zones.`);
  const pages = await wikitextFor(titles);
  console.log(`read ${pages.size} of them.`);

  const table = {};
  const silent = [];
  for (const title of [...titles].sort((a, b) => a.localeCompare(b))) {
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
  const head = banner(Object.keys(table).length, pairs)
    .replace("${rows}", String(Object.keys(table).length))
    .replace("${pairs}", String(pairs));
  const text = `${head}${body}\n};\n`;

  if (dryRun) {
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    console.log(old === text ? "no change." : `would rewrite ${path.relative(ROOT, OUT)}.`);
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}.`);
};

await main();
