/**
 * fetch-gm-event-items.mjs — regenerate the items eqlwiki says were only ever handed out at GM events.
 *
 * Such an item has no drop, vendor or quest to reach it, so it is never "in era" whatever its
 * categories say: Oakwynd carries only `Non-P99_Content, Lore_Items, Items`, none of them an era tag.
 * The fact lives in the page's prose ("Obtained during a GM event."), which the page parser doesn't
 * keep, and teaching it to would mean re-fetching every cached item page. So it is read here, once,
 * the same generated-static-data shape the named-mob list uses
 * ([ADR 0292](../specs/decisions/0292-a-gm-event-item-is-never-in-era.md)).
 *
 * The wiki words it several ways, all counted: "Obtained during a GM event", "Given out in a GM
 * event", "GM Event Item". A **hedged** line ("Possibly a GM Event item?") is not, and neither is a
 * page that isn't an item (an NPC "released for a GM event"). Another page can also tag an item it
 * lists — Firestrike's "{{:Blade of Shadowed Flame}} (GM Event Item)", Gate's "(GM Event Only)" —
 * and that names the item as firmly as its own page would.
 *
 *   node scripts/fetch-gm-event-items.mjs            # rewrite the generated list
 *   node scripts/fetch-gm-event-items.mjs --dry-run  # report what would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { api, wikitextFor } from "./lib/eqlwiki.mjs";

helpIfAsked(import.meta.url);

const OUT = path.join(ROOT, "src/shared/items/gm-event-items.generated.ts");
const dryRun = flag("dry-run");

/** A line that says outright that the item came from a GM event. */
const STATES_GM_EVENT =
  /\b(?:obtained|given(?: out)?|handed out|awarded|rewarded)\s+(?:during|in|at|from)\s+an?\s+GM\s+event\b|\bGM\s+event\s+item\b/i;
/** A line that only guesses. */
const HEDGED = /\b(?:possibly|maybe|probably|perhaps|might|unsure)\b|\?/i;
/** An item page — the only kind an era verdict is about. */
const ITEM_PAGE = /\{\{\s*Itempage\b/i;

/** Every page whose text mentions a GM event, following continuation. */
async function candidates() {
  const titles = [];
  let offset = 0;
  for (let guard = 0; guard < 20 && offset !== undefined; guard++) {
    const data = await api({ action: "query", list: "search", srsearch: '"GM event"', srwhat: "text", srlimit: "50", sroffset: String(offset) });
    titles.push(...(data.query?.search ?? []).map((r) => r.title));
    offset = data.continue?.sroffset;
  }
  return titles;
}

/** `{{:Item}} (GM Event Item)` / `[[Item]] (GM Event Only)` — an item another page tags. */
const TAGGED = /(?:\{\{:([^}|]+)\}\}|\[\[([^\]|]+)(?:\|[^\]]*)?\]\])\s*\(GM Event (?:Item|Only)\)/gi;

function taggedItems(wikitext) {
  return [...wikitext.matchAll(TAGGED)].map((m) => (m[1] ?? m[2]).trim());
}

function isGmEventItem(wikitext) {
  if (!ITEM_PAGE.test(wikitext)) return false;
  return wikitext.split(/\n|(?<=\.)\s+/).some((line) => STATES_GM_EVENT.test(line) && !HEDGED.test(line));
}

async function main() {
  console.log('Searching eqlwiki for "GM event"…');
  const found = await candidates();
  console.log(`${found.length} pages mention it.`);
  const texts = await wikitextFor(found);
  const own = found.filter((t) => isGmEventItem(texts.get(t) ?? ""));
  const tagged = found.flatMap((t) => taggedItems(texts.get(t) ?? ""));
  const items = [...new Set([...own, ...tagged])].sort((a, b) => a.localeCompare(b));
  const skipped = found.filter((t) => !items.includes(t));
  console.log(`${items.length} are GM-event items.`);
  if (skipped.length) console.log(`  not counted: ${skipped.join(", ")}`);

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * Items eqlwiki says were only handed out at GM events — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-gm-event-items.mjs\` (scraped ${scrapedAt}). Read through
 * \`gm-event-items.ts\`; see
 * [ADR 0292](../../../specs/decisions/0292-a-gm-event-item-is-never-in-era.md).
 *
 * ${items.length} items.
 */

export const GM_EVENT_ITEMS_SOURCE = { search: '"GM event"', scrapedAt: ${JSON.stringify(scrapedAt)} };

export const GM_EVENT_ITEMS: string[] = ${JSON.stringify(items, null, 2)};
`;
  writeGenerated(OUT, body, { dryRun });
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
