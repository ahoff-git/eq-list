/**
 * fetch-tradeskills.mjs — regenerate the Tradeskills tab from eqlwiki's `Category:Tradeskills`.
 *
 * Each skill page is hand-authored prose with a leveling guide somewhere in it, written differently on
 * every page — the same situation as the AA list and Alanna's guide, shipped the same way: as
 * committed, generated data, so a reformat shows up as a diff to review rather than a parser quietly
 * breaking in a running app ([ADR 0302](../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md)).
 *
 *   node scripts/fetch-tradeskills.mjs            # rewrite the generated file
 *   node scripts/fetch-tradeskills.mjs --dry-run  # report what would change, write nothing
 *
 * Three reads: every page in the category (rendered HTML and its categories), `Template:PageEra` (which
 * eras the server has open today), and the categories of the items the guides link, so a line that
 * needs a Velious-era ingredient can say so. That last one **asks the cache first**: the committed web
 * snapshot (`lib/wiki-snapshot.mjs`) already holds most of those pages with their kind and era flag,
 * and only what it can't settle goes to the wiki — see `settledByCache`. The skill pages themselves
 * are always fetched: the cache keeps a page parsed, and the guide is read off its rendered HTML. The era *judgement* is not made here — the generated file
 * keeps the facts and `src/shared/tradeskills/tradeskill-era.ts` judges them against the live era.
 *
 * **Fails loudly**: a skill page with no leveling guide, a guide that links nothing, or a guide element
 * the parser has never seen stops the regen with the page's name.
 */
import path from "node:path";
import { ROOT, flag, load, writeGenerated } from "./lib/cli.mjs";
import { api, categoryMembers, pagesByLink, wikitextFor } from "./lib/eqlwiki.mjs";
import { inEras, linkedTitles, notesField, pageEras, parseGuides, priceRows, vendorRows } from "./lib/tradeskills-parse.mjs";
import { snapshotPages } from "./lib/wiki-snapshot.mjs";
import { addMadeItems, recipeIndex } from "./lib/tradeskill-results.mjs";

// The app's own compiled logic, so a step's span, materials and prices are read here exactly as the
// app reads them (needs `npm run build:electron` first — `load` says so if it hasn't been).
const { costGuide, planGuide } = load("src/shared/tradeskills/step-plan.js");
const wikiPrice = load("src/shared/tradeskills/wiki-price.js");

const OUT = path.join(ROOT, "src/shared/tradeskills/tradeskills.generated.ts");
const CATEGORY = "Tradeskills";
const CULTURAL = /^Cultural Tradeskills:\s*(.+)$/;
const BATCH = 50;
const dryRun = flag("dry-run");

/** What a page in the category is: a skill with a guide, a race's cultural recipes, or a reference. */
function kindOf(title) {
  if (CULTURAL.test(title)) return { kind: "cultural", name: CULTURAL.exec(title)[1].trim() };
  if (/^Skill /.test(title) || title === "Jewelcrafting") return { kind: "skill", name: title.replace(/^Skill /, "") };
  return { kind: "reference", name: title };
}

/**
 * Can the cached copy of a linked page answer for it without a request? Only one answer is wanted —
 * "is this an item, and of which era" — and the cache settles two cases outright:
 *
 * - **not an item** (a zone, an NPC, a quest): its era says nothing about the step, so it's skipped;
 * - **an item flagged in era**: nothing to record, since an era that was open when it was cached stays
 *   open.
 *
 * What it can't settle is an item flagged **out** of era: the flag doesn't say *which* era, and the
 * era key is what lets Velious be judged live. Those, and pages the cache has never seen, are fetched.
 */
function settledByCache(cached) {
  if (!cached) return false;
  if (cached.kind !== "item" && cached.kind !== "recipe") return true;
  return !cached.outOfEra;
}

async function renderedPage(title) {
  const data = await api({ action: "parse", page: title, prop: "text|categories" });
  if (data.error || !data.parse) throw new Error(`"${title}" would not parse: ${data.error?.info ?? "no parse block"}`);
  return { html: data.parse.text, categories: (data.parse.categories ?? []).map((c) => c.category.replace(/_/g, " ")) };
}

/** Linked title (as linked) → its categories, through redirects, following `clcontinue`. */
async function categoriesOf(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const byTitle = new Map();
    const alias = new Map();
    let clcontinue;
    do {
      const params = { action: "query", prop: "categories", cllimit: "max", redirects: "1", titles: batch.join("|") };
      if (clcontinue) params.clcontinue = clcontinue;
      const data = await api(params);
      for (const n of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) alias.set(n.from, n.to);
      for (const p of data.query?.pages ?? []) {
        const list = byTitle.get(p.title) ?? [];
        for (const c of p.categories ?? []) list.push(c.title.replace(/^Category:/, ""));
        byTitle.set(p.title, list);
      }
      clcontinue = data.continue?.clcontinue;
    } while (clcontinue);
    for (const t of batch) {
      let resolved = t;
      for (let hops = 0; alias.has(resolved) && hops < 3; hops++) resolved = alias.get(resolved);
      if (byTitle.has(resolved)) out.set(t, byTitle.get(resolved));
    }
  }
  return out;
}

/** Every material any step needs, by name — a pick-one need's alternatives too, so the cheapest can be chosen. */
function neededMaterials(pages) {
  const names = new Set();
  const add = (needs) => needs?.forEach((n) => [n.name, ...(n.alternatives ?? [])].forEach((t) => names.add(t)));
  const visit = (items) => items.forEach((i) => (add(i.needs), visit(i.children ?? [])));
  for (const p of pages) {
    for (const g of p.guides) {
      for (const b of g.blocks) {
        if (b.kind === "list") visit(b.items);
        else if (b.kind === "table") b.needs?.forEach(add);
      }
    }
  }
  return [...names].sort();
}

/**
 * Prices for every material the guides need, and whole-combine costs for what they make.
 *
 * **An item's own notes first** ("Costs around 0.524pp"): a note on the item's page is about that
 * item, where a skill page's table can sit stale for years — Alchemy's "Reagent Pricing" is flagged
 * "Needs updating" by its own editors and prices Birthwort at five times its own page's figure. The
 * cache keeps pages parsed, not their notes, so that is a wikitext read, fifty pages a request, for
 * the needed materials only.
 *
 * **Then the skill pages' tables.** A priced row is a **combine cost** when its first link is
 * something crafted (Tinkering's "Cost to Make", Jewelcrafting's crafted-item "Cost*") and a
 * **material price** otherwise. The first page to price a title wins, in category order.
 */
async function harvestPrices(pages, priced, cache) {
  const prices = {};
  const combineCosts = {};
  const needed = neededMaterials(pages);
  const texts = await pagesByLink(needed);
  for (const t of needed) {
    const copper = wikiPrice.priceFromNotes(notesField(texts.get(t)?.text));
    if (copper) prices[t] = { copper, source: t };
  }
  const fromNotes = Object.keys(prices).length;
  // The same pages list who sells each material and where they stand — read now, for the guide's
  // "where to buy" (ADR 0304). Nothing extra is fetched for it.
  const vendors = {};
  for (const t of needed) {
    const rows = vendorRows(texts.get(t)?.text);
    if (rows.length) vendors[t] = rows;
  }

  const crafted = (t) => (cache.get(t)?.components?.length ?? 0) > 0;
  for (const { title, copper, source } of priced) {
    const into = crafted(title) ? combineCosts : prices;
    if (!(title in into)) into[title] = { copper, source };
  }
  const priceOf = needed.filter((t) => t in prices).length;
  console.log(
    `Prices: ${needed.length} materials needed, ${priceOf} priced (${fromNotes} from item notes, the rest ` +
      `from skill-page tables); ${Object.keys(combineCosts).length} whole-combine costs.`,
  );
  const merchants = Object.values(vendors).reduce((n, rows) => n + rows.length, 0);
  console.log(`Vendors: ${Object.keys(vendors).length} materials sold by ${merchants} merchant rows.`);
  return { prices: sortKeys(prices), combineCosts: sortKeys(combineCosts), vendors: sortKeys(vendors) };
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

async function main() {
  const titles = (await categoryMembers(CATEGORY)).sort();
  console.log(`${titles.length} pages in Category:${CATEGORY}.`);

  // Read once, used twice: to name what an ingredients-only step makes, and to settle linked items' eras.
  const cache = snapshotPages();
  const recipes = recipeIndex(cache);
  console.log(`Cache: ${cache.size} pages, ${recipes.size} ingredient sets.`);

  const pages = [];
  const priced = [];
  for (const title of titles) {
    const { kind, name } = kindOf(title);
    const { html, categories } = await renderedPage(title);
    let guides = [];
    if (kind === "skill") {
      try {
        guides = parseGuides(html);
      } catch (e) {
        throw new Error(`"${title}": ${e.message}`);
      }
      if (!guides.length) throw new Error(`"${title}" has no leveling-guide heading — has the page been reorganised?`);
      if (!linkedTitles(guides).length) throw new Error(`"${title}"'s guide links no items — did the parser lose them?`);
    }
    const named = addMadeItems(guides, recipes, cache);
    if (kind === "skill") for (const row of priceRows(html, wikiPrice)) priced.push({ ...row, source: title });
    pages.push({ name, title, kind, eras: pageEras(categories), guides });
    console.log(`  ${kind.padEnd(9)} ${name}${guides.length ? ` — ${guides.map((g) => g.name).join(", ")}` : ""}${named ? ` (${named} steps named from the cache)` : ""}`);
  }

  const template = (await wikitextFor(["Template:PageEra"])).get("Template:PageEra");
  if (!template) throw new Error("Template:PageEra is missing — the era switch everything here reads.");
  const open = inEras(template);

  const linked = [...new Set(pages.flatMap((p) => linkedTitles(p.guides)))].sort();
  const toFetch = linked.filter((t) => !settledByCache(cache.get(t)));
  console.log(`${linked.length} linked pages: ${linked.length - toFetch.length} settled by the cache (${cache.size} pages), ${toFetch.length} asked of the wiki.`);
  const cats = await categoriesOf(toFetch);

  // Plan every step (span, materials, stated cost) against the cache — and, for a linked page the cache
  // doesn't hold, a stand-in built from the categories just fetched, so a zone is never a material.
  const lookup = {
    get(t) {
      const cached = cache.get(t);
      if (cached) return cached;
      const c = cats.get(t);
      if (!c) return undefined;
      return { kind: c.includes("Items") ? "item" : "page", title: t, wikiPath: "", sources: [], components: [], rewards: [], fetchedAt: "" };
    },
  };
  for (const p of pages) for (const g of p.guides) planGuide(g, lookup);
  const itemEras = {};
  for (const t of toFetch) {
    const c = cats.get(t) ?? [];
    // Only items: a zone or NPC named in passing ("buy it in Halas") says nothing about the step.
    if (!c.includes("Items")) continue;
    const eras = pageEras(c).filter((e) => e !== "classic");
    if (eras.length) itemEras[t] = eras;
  }
  console.log(`${Object.keys(itemEras).length} items with a non-classic era. Open today: ${open.join(", ")}.`);

  const { prices, combineCosts, vendors } = await harvestPrices(pages, priced, cache);
  for (const p of pages) for (const g of p.guides) costGuide(g, lookup, { prices, combineCosts });

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * Tradeskills and their leveling guides — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-tradeskills.mjs\`, which reads every page in eqlwiki's
 * \`Category:${CATEGORY}\` (scraped ${scrapedAt}). Shipped rather than fetched at runtime — see the
 * script's header and
 * [ADR 0302](../../../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md).
 *
 * Facts only: which era each page and each linked item belongs to, and which eras the wiki had open
 * on the day this was scraped. Whether a line is out of era *now* is \`tradeskill-era.ts\`'s call.
 */

import type { Tradeskill, VendorSpot, WikiPrice } from "./tradeskill-types";

export const TRADESKILLS_SOURCE = { category: ${JSON.stringify(CATEGORY)}, scrapedAt: ${JSON.stringify(scrapedAt)} };

/** \`Template:PageEra\`'s \`in\` keys on the day of the scrape. Anything else is shut (its \`#default\`). */
export const OPEN_ERAS_AT_SCRAPE: readonly string[] = ${JSON.stringify(open)};

/** Linked item title → its era keys (\`classic\` left out: always open). */
export const ITEM_ERAS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(itemEras, null, 2)};

/**
 * What a merchant charges for a material, in copper, and the page that said so — a skill page's cost
 * table first, else the item's own notes. An approximation the wiki's editors wrote down; charisma and
 * faction move the real price.
 */
export const PRICES: Readonly<Record<string, WikiPrice>> = ${JSON.stringify(prices, null, 2)};

/** What one combine of a crafted item costs in materials, where a skill page states it whole. */
export const COMBINE_COSTS: Readonly<Record<string, WikiPrice>> = ${JSON.stringify(combineCosts, null, 2)};

/**
 * Who sells each material and where they stand, from the item pages' merchant tables — one line per
 * material. \`zone\` is the zone as shown ("East Cabilis"), \`zonePage\` the wiki page it links to when
 * that differs, \`y\`/\`x\` the merchant's location when the wiki gives one.
 */
export const VENDORS: Readonly<Record<string, readonly VendorSpot[]>> = {
${Object.entries(vendors).map(([item, rows]) => `  ${JSON.stringify(item)}: ${JSON.stringify(rows)},`).join("\n")}
};

export const TRADESKILLS: readonly Tradeskill[] = ${JSON.stringify(pages, null, 1)};
`;
  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
