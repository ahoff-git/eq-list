/**
 * parse.ts — Lucy's HTML into a `LucyItem`. A pure black box: string in, structured data out, no
 * I/O and no network, so it is pinned against real captured pages under `fixtures/lucy/`.
 *
 * Lucy is hand-written HTML from about 2004 — nested tables, unclosed tags, layout carried in
 * `style` attributes. There is very little to hook onto, so this leans on the two class names that
 * are stable and meaningful, and on **reading a table's own header row** rather than counting tables:
 *
 *  - `.shottitle` / `.shotdata` — the item's in-game tooltip: the name, then the stat lines, which
 *    are separated by nothing but `<br>` (see `html-text.ts` for why that matters).
 *  - `table.spellview` — used for *every* data table on the page (submitter, item type, drops,
 *    merchants). The two that matter are identified by their header cells reading "Drops from" or
 *    "Sold by", which survives the page growing another table above them. Counting would not.
 *  - `img[src*="/pgfx/item_"]` — the icon, hosted on the Allakhazam CDN.
 *
 * The era verdict is computed here too, from **every** zone on the page, and only then is the source
 * list trimmed for storage — see `SOURCE_CAP`.
 */
import { parse, type HTMLElement } from "node-html-parser";
import { htmlToLines } from "../html-text";
import { eraFromSourceZones, placeableZone, zoneReadings } from "../../src/shared/lucy-era";
import { zoneKey } from "../../src/shared/names";
import { createLogger } from "../../src/shared/logging";
import type { ItemSource, LucyItem, LucySearchResult, SourceKind } from "../../src/shared/types";

const log = createLogger("lucy-parse");

/**
 * How many source rows to keep. Lucy describes twenty-five years of EverQuest, so a common
 * tradeskill component has hundreds: `Water Flask` has 54 mobs dropping it and **362 merchants**
 * selling it, in zones from Grobb to `Stratos: Zephyr's Flight`. Keeping them all would put a
 * four-hundred-row table on an item page and 40 KB in the cache, for one flask.
 *
 * Three things make the cap a selection rather than a quiet truncation:
 *
 *  - **the era verdict is decided before the trim**, over every zone the page listed, so a cap can
 *    never turn an in-era item out-of-era;
 *  - **placeable zones come first, and a drop before a sale**, so what survives is the part a player
 *    here could act on, most actionable first;
 *  - `LucyItem.sourceRows` carries the real total, and the panel shows it — a list that said "50
 *    sources" while hiding 366 would be a lie of omission.
 */
const SOURCE_CAP = 50;

/**
 * The two "NPC | Zone" tables Lucy puts on an item page, keyed by the header row that identifies
 * each. Reading the header is what makes this robust: `table.spellview` is the class on *every* data
 * table on the page (submitter, item type, drops, merchants), so counting them would break the first
 * time Lucy added a row above.
 */
const SOURCE_TABLES: { header: readonly string[]; kind: SourceKind }[] = [
  { header: ["drops from", "zone"], kind: "drop" },
  { header: ["sold by", "zone"], kind: "vendor" },
];

const text = (el: HTMLElement | null | undefined): string => (el?.text ?? "").replace(/\s+/g, " ").trim();

/**
 * Lucy disambiguates same-named NPCs with dash-separated tails — `a gnoll pup - Blackburrow`,
 * `a skeleton - Innothule Swamp - Captain Bones` — in a row whose next cell already names the zone.
 *
 * The zone segment is dropped, because the name is shown right beside that cell and is what a mob
 * name would be matched against, and `a gnoll pup - Blackburrow` matches nothing the log ever prints.
 * Anything else in the tail is **kept**: `Captain Bones` says which spawn, which is information Lucy
 * is offering rather than a repetition.
 *
 * Matched against every *reading* of the zone (`lucy-era.ts`), because the two cells disagree on
 * decoration as a matter of course: the tail says `Befallen` where the cell says `Befallen 2.0`.
 */
export function withoutZoneSuffix(where: string, zone: string): string {
  if (!zone || !where.includes(" - ")) return where;
  const zoneKeys = new Set(zoneReadings(zone).map(zoneKey));
  const parts = where.split(" - ");
  // Never the first segment: that is the name itself, even for a mob named after its zone.
  return parts.filter((p, i) => i === 0 || !zoneKeys.has(zoneKey(p))).join(" - ");
}

/** Does this table's first row read as the given header? */
function hasHeader(table: HTMLElement, header: readonly string[]): boolean {
  const labels = (table.querySelectorAll("tr")[0]?.querySelectorAll("td") ?? []).map((c) => text(c).toLowerCase());
  return header.every((h, i) => labels[i] === h);
}

/**
 * Every "NPC, in zone" row from both tables, in page order and **uncapped** — the era verdict is
 * entitled to see all of them.
 */
function parseSources(root: HTMLElement): ItemSource[] {
  const sources: ItemSource[] = [];
  const seen = new Set<string>();
  for (const table of root.querySelectorAll("table.spellview")) {
    const match = SOURCE_TABLES.find((t) => hasHeader(table, t.header));
    if (!match) continue;
    // Skip the header row; every other row is NPC | zone.
    for (const row of table.querySelectorAll("tr").slice(1)) {
      const cells = row.querySelectorAll("td");
      // The NPC is a link to Allakhazam's own page; a row without one isn't a source row.
      const detail = text(cells[1]);
      const where = withoutZoneSuffix(text(cells[0]?.querySelector("a")), detail);
      if (!where) continue;
      const key = `${match.kind}|${where}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ kind: match.kind, where, ...(detail ? { detail } : {}) });
    }
  }
  return sources;
}

/**
 * The rows worth keeping: ones in zones we can place first, drops ahead of sales.
 *
 * Order within a tier is Lucy's own, so this only ever *promotes* — it never re-sorts, which would
 * make the same page read differently on different days.
 */
function keepBestSources(sources: ItemSource[]): ItemSource[] {
  if (sources.length <= SOURCE_CAP) return sources;
  const tier = (s: ItemSource) => (s.detail && placeableZone(s.detail) ? 0 : 2) + (s.kind === "drop" ? 0 : 1);
  const tiers: ItemSource[][] = [[], [], [], []];
  for (const s of sources) tiers[tier(s)].push(s);
  const kept = tiers.flat().slice(0, SOURCE_CAP);
  log.debug(
    `sources capped: kept ${kept.length} of ${sources.length}` +
      ` (${tiers[0].length} drops and ${tiers[1].length} merchants in zones we can place)`,
  );
  return kept;
}

/** The item's tooltip: its name and the stat lines under it, exactly as the game would show them. */
function parseCard(root: HTMLElement): LucyItem["card"] {
  const title = text(root.querySelector(".shottitle"));
  const dataEl = root.querySelector(".shotdata");
  if (!title || !dataEl) return undefined;
  const lines = htmlToLines(dataEl.innerHTML);
  if (!lines.length) return undefined;
  const icon = root.querySelector('img[src*="/pgfx/item_"]')?.getAttribute("src") ?? undefined;
  return { title, ...(icon ? { icon } : {}), lines };
}

/**
 * One Lucy item page → a `LucyItem`.
 *
 * `id` is passed in rather than scraped: it is what we asked for and what the cache is keyed by, and
 * the page's own copies of it live in a hidden form field and a couple of nav links — all of which
 * would be a worse thing to depend on than the caller's own request.
 */
export function parseLucyItem(id: number, html: string): LucyItem | null {
  const root = parse(html);
  const card = parseCard(root);
  // No tooltip block at all means this wasn't an item page — a 404, an error page, or Lucy's own
  // "no cookies for Lucy?" stub. Better to say nothing than to cache an item with no name.
  if (!card) {
    log.warn("no item tooltip found for id", id);
    return null;
  }
  const sources = parseSources(root);
  const { era, why } = eraFromSourceZones(sources.map((s) => s.detail ?? ""));
  return {
    id,
    name: card.title,
    card,
    sources: keepBestSources(sources),
    sourceRows: sources.length,
    era,
    eraWhy: why,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Lucy's search results page → the rows.
 *
 * Era is left `unknown` on purpose: the list carries no zones, and the only way to judge twelve hits
 * would be twelve more page fetches. The client fills it in from whatever it has already cached
 * ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
 */
/**
 * Lucy's published `itemlist.txt.gz`, uncompressed: `id,name,lucylink`, one item per line.
 *
 * The file is the site's own bulk offering ("Complete list of which item id matches which item
 * name", regenerated daily) and it is the **only** item data Lucy hands out in bulk — there is no
 * stat dump, and no advanced search to ask one of. So this is a name index and nothing more, which
 * is exactly enough to stop a misspelling finding nothing
 * ([ADR 0154](../../specs/decisions/0154-lucy-s-own-name-list-is-worth-holding.md)).
 *
 * Written by `Text::CSV_XS`, so a name carrying a comma is quoted and an internal quote is doubled.
 * That is the whole grammar, and it is worth handling properly rather than splitting on commas:
 * `Bag of the Tinkerers, Improved` is a real item and a naive split loses half of it.
 */
export function parseItemNameList(text: string): { id: number; name: string }[] {
  const out: { id: number; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const m = /^(\d+),(?:"((?:[^"]|"")*)"|([^,]*)),/.exec(line);
    // The header row (`id,name,lucylink`) fails the leading-digits test and drops out here, along
    // with anything else malformed — a bad line is skipped rather than becoming a nameless item.
    if (!m) continue;
    const name = (m[2] !== undefined ? m[2].replace(/""/g, '"') : (m[3] ?? "")).trim();
    const id = Number(m[1]);
    if (name && Number.isFinite(id)) out.push({ id, name });
  }
  return out;
}

export function parseLucyItemList(html: string): LucySearchResult[] {
  const root = parse(html);
  const results: LucySearchResult[] = [];
  const seen = new Set<number>();
  for (const row of root.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 3) continue;
    // Cell 0 is the icon (a link wrapping an <img>, no text); cell 1 is the name; cell 2 the type.
    const link = cells[1]?.querySelector('a[href*="item.html?id="]');
    const name = text(link);
    const href = link?.getAttribute("href") ?? "";
    const id = Number(/id=(\d+)/.exec(href)?.[1]);
    if (!name || !Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    const type = text(cells[2]);
    results.push({ id, name, ...(type ? { type } : {}), era: "unknown" });
  }
  return results;
}
