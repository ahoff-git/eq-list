/**
 * eqlwiki.mjs — reading facts off eqlwiki's zone pages, once, for every script that needs one.
 *
 * Every zone page carries the same infobox — the `zoneTopTable` — and each row is a labelled fact
 * about the zone: which zones it touches, what levels its monsters are, what it's called in `/who`.
 * The crawl to reach them is identical whatever row you're after, so it lives here rather than in
 * each generator: titles from one category listing, then wikitext **fifty pages per request**, which
 * makes a full refresh of all 117 zones three calls rather than 117.
 *
 * Nothing here knows what a row *means*. It hands back the value verbatim; deciding what "1-20, 35"
 * is worth is the generator's business.
 */

const EQLWIKI = "https://eqlwiki.com/api.php";
const AGENT = "eq-list zone facts (+github.com/ahoff-git/eq-list)";
/** The wiki's own cap on a multi-page `titles=` query for anonymous callers. */
const BATCH = 50;
/** A backstop against a continuation loop, not a real limit on the category. */
const MAX_PAGES = 40;

export async function api(params) {
  const url = `${EQLWIKI}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  const res = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Every article in a category, following continuation. `cmnamespace: 0` keeps sub-categories out. */
export async function categoryMembers(category) {
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
export async function wikitextFor(titles) {
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
 * Every labelled row of a zone's infobox, by its label, values verbatim.
 *
 * The shape is a header line and the value on the next:
 *
 *     ! ''' Adjacent Zones: '''
 *     |[[Rivervale]], [[Runnyeye]]
 *
 * Read as *lines* rather than by a regex per label, because the decoration around a label is
 * whatever the person writing that page typed — bold quotes, a colon, a link (`[[Zone Spawn Timer]]`),
 * odd spacing. Stripping all of that once and keying on what's left is one rule instead of one
 * pattern per caller, and it can't be got subtly wrong for a label nobody has tried yet.
 *
 * First wins where a page states a row twice, matching the reading order a person would use.
 */
export function infoboxRows(wikitext) {
  const lines = (wikitext ?? "").split(/\r?\n/);
  const rows = new Map();
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!line.startsWith("!") || !lines[i + 1].startsWith("|")) continue;
    const label = labelKey(line.slice(1));
    if (label && !rows.has(label)) rows.set(label, lines[i + 1].slice(1).trim());
  }
  return rows;
}

/** A label reduced to the words in it: decoration, links and punctuation dropped, case folded. */
const labelKey = (text) =>
  text
    .replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** One labelled row of a zone's infobox, verbatim, or `undefined` when the page hasn't got it. */
export function infoboxRow(wikitext, label) {
  return infoboxRows(wikitext).get(labelKey(label));
}

/** The zone pages, by title — the corpus every generator in here starts from. */
export async function zonePages() {
  // Drop the handful of maintenance pages that sit in Category:Zones — the same rule the app's own
  // zone index uses (`electron/wiki/index.ts`), so a generator and the live lookup see one world.
  const titles = (await categoryMembers("Zones")).filter((t) => !/cleanupproject/i.test(t));
  console.log(`eqlwiki lists ${titles.length} zones.`);
  const pages = await wikitextFor(titles);
  console.log(`read ${pages.size} of them.`);
  return { titles: [...titles].sort((a, b) => a.localeCompare(b)), pages };
}
