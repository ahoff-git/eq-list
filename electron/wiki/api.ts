/**
 * api.ts — thin wrapper over the eqlwiki.com MediaWiki API. Node/Electron-main
 * only. Every call goes through `apiGet` so the base URL, User-Agent, timeout
 * and JSON handling live in exactly one place.
 *
 * Endpoints used (confirmed against the live wiki):
 *   opensearch  — title-prefix autocomplete → [term, titles[], descs[], urls[]]
 *   parse       — rendered content HTML at  parse.text["*"]
 *   query/search — full-text fallback when opensearch finds nothing
 */
import { createLogger } from "../../src/shared/logging";
import type { SearchResult } from "../../src/shared/types";

const log = createLogger("wiki-api");

export const WIKI_BASE = "https://eqlwiki.com";
const API = `${WIKI_BASE}/api.php`;
const UA = "EQ-List/0.1 (loot overlay; contact adamhoffmang@gmail.com)";
const TIMEOUT_MS = 20_000;

/**
 * **MediaWiki reports failure inside a 200.** `res.ok` is not the test.
 *
 * A rate limit, a read-only wiki, or a parameter this build sends that a later MediaWiki no longer
 * accepts all arrive as HTTP 200 with an `error` (or merely a `warnings`) block and **no `query` at
 * all** — measured against eqlwiki, which answers an unrecognised `list=` exactly that way. Read
 * optimistically, that is indistinguishable from "the category is empty", which is how a listing
 * helper turns somebody else's outage into a roster that is silently short and looks complete. That
 * is the failure [ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)
 * exists to prevent, arriving through the one door it wasn't watching — noticed by reading
 * `everquest-legends-mcp`'s `assertNoWikiApiError`, which carries the same comment
 * ([neighbours](../../specs/neighbours.md)).
 *
 * So an `error` throws, and a `warnings` is logged: a warning is how the API says it *changed* what
 * you asked for (it clamps an out-of-range `cmlimit` and says so), which is worth seeing in a log
 * even though the answer is usable.
 */
async function apiGet<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    log.debug("GET", url);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = (await res.json()) as T & {
      error?: { code?: string; info?: string };
      warnings?: unknown;
    };
    if (body.warnings) log.warn("wiki API warning for", params.action, JSON.stringify(body.warnings).slice(0, 300));
    // `action=parse` on a page that isn't there is an *answer*, and `fetchPageHtml` reads it as one.
    if (body.error && params.action !== "parse") {
      throw new Error(`wiki API error (${body.error.code ?? "unknown"}): ${body.error.info ?? "no detail"}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Path portion of a wiki URL, e.g. "https://eqlwiki.com/Rusty_Axe" → "/Rusty_Axe". */
function urlToPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Title-prefix autocomplete. Fast; used for the search box. */
export async function opensearch(term: string, limit = 12): Promise<SearchResult[]> {
  if (!term.trim()) return [];
  const data = await apiGet<[string, string[], string[], string[]]>({
    action: "opensearch",
    search: term,
    limit: String(limit),
    redirects: "resolve",
  });
  const titles = data[1] ?? [];
  const urls = data[3] ?? [];
  return titles.map((title, i) => ({ title, wikiPath: urlToPath(urls[i] ?? `/${title.replace(/ /g, "_")}`) }));
}

/** Full-text search, used only when opensearch returns nothing. */
export async function fullTextSearch(term: string, limit = 12): Promise<SearchResult[]> {
  if (!term.trim()) return [];
  const data = await apiGet<{
    query?: { search?: { title: string; snippet?: string }[] };
  }>({ action: "query", list: "search", srsearch: term, srlimit: String(limit) });
  const hits = data.query?.search ?? [];
  return hits.map((h) => ({
    title: h.title,
    wikiPath: `/${h.title.replace(/ /g, "_")}`,
    snippet: h.snippet?.replace(/<[^>]+>/g, ""),
  }));
}

/**
 * Enumerate every content-namespace page title, for the local fuzzy index.
 * Paginates `list=allpages` (500/page) and skips redirects. `maxPages` caps the
 * crawl so a huge wiki can't spin forever.
 */
export async function fetchAllTitles(maxPages = 80): Promise<string[]> {
  return fetchListTitles(
    "allpages",
    "ap",
    { apnamespace: "0", aplimit: "max", apfilterredir: "nonredirects" },
    maxPages,
  );
}

/** One row of a MediaWiki `list=` answer. `ns` is what tells a subcategory from a page. */
interface ListMember {
  title: string;
  ns: number;
}

/**
 * Every member a MediaWiki `list=` query returns, following its continuation.
 *
 * Two of these were written out, for `allpages` and `categorymembers`. They differ only in the list
 * name and its **continuation prefix** — `apcontinue`, `cmcontinue` — which is MediaWiki's convention,
 * along with the answer arriving under `query.<list>`. Stating that once means the paging, the cap and
 * the stop condition are the same for the next list we ask about; a copy that dropped the `break`
 * would quietly make `maxPages` requests every time.
 *
 * It yields whole members rather than titles because a category listing's **namespace** is the one
 * field that matters to the category walk — ns 14 is a subcategory to follow, ns 0 is a page to
 * record — and a helper that threw it away is what kept the roster flat
 * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 */
async function fetchListMembers(
  list: string,
  prefix: string,
  params: Record<string, string>,
  maxPages: number,
): Promise<ListMember[]> {
  const key = `${prefix}continue`;
  const members: ListMember[] = [];
  let next: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await apiGet<{
      query?: Record<string, ListMember[] | undefined>;
      continue?: Record<string, string | undefined>;
    }>({ action: "query", list, formatversion: "2", ...params, ...(next ? { [key]: next } : {}) });
    members.push(...readListBlock(data.query, list));
    next = data.continue?.[key];
    if (!next) break;
  }
  return members;
}

/**
 * The rows of a `list=` answer — **throwing when there is no answer at all**.
 *
 * The distinction this draws is the whole point, and it is measured rather than assumed: a category
 * that does not exist comes back as `query.categorymembers: []` — a present block holding nothing,
 * which honestly means "empty". A request the API refused comes back with **no `query` key**. Folded
 * together by an `?? []`, the second reads as the first, and a wiki having a bad minute becomes a
 * roster permanently short of whatever we were asking about
 * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 *
 * So: an empty list is an answer, and a missing one is an error the caller has to see.
 */
function readListBlock(
  query: Record<string, ListMember[] | undefined> | undefined,
  list: string,
): ListMember[] {
  const rows = query?.[list];
  if (!rows) throw new Error(`wiki API returned no "${list}" block — the request was refused, not empty`);
  return rows;
}

/** The same, for the callers that only ever wanted the names. */
async function fetchListTitles(
  list: string,
  prefix: string,
  params: Record<string, string>,
  maxPages: number,
): Promise<string[]> {
  return (await fetchListMembers(list, prefix, params, maxPages)).map((m) => m.title);
}

/** `Foo` and `Category:Foo` both name the same category; the API only accepts the second. */
const categoryTitle = (category: string): string =>
  category.startsWith("Category:") ? category : `Category:${category}`;

/** Titles of a category's content-namespace (ns=0) members, paginated. */
export async function fetchCategoryTitles(category: string, maxPages = 40): Promise<string[]> {
  // ns=0 only: without it the answer also carries the category's sub-categories and files.
  return fetchListTitles(
    "categorymembers",
    "cm",
    { cmtitle: categoryTitle(category), cmnamespace: "0", cmlimit: "max" },
    maxPages,
  );
}

/** One request's worth of a category: its pages, the categories below it, and where to resume. */
export interface CategorySlice {
  pages: string[];
  subcats: string[];
  /** MediaWiki's `cmcontinue`; absent when this was the last slice of the category. */
  cursor?: string;
}

/**
 * **One request** against one category, returning its members split by namespace.
 *
 * Two things about the shape, and both are deliberate. It asks for `0|14` rather than `0`, which is
 * the whole of [ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md):
 * `fetchCategoryTitles` asks for ns 0 and therefore cannot see that `Category:Items` has thirty
 * children, so an item filed only in one of them is invisible to us for ever. Asking for both in the
 * same request costs nothing extra and turns a listing into a walk.
 *
 * And it hands back the **cursor** instead of following it. `fetchCategoryTitles` paginates
 * internally, which is right for a caller that wants an answer and wrong for the walk: `Category:Items`
 * is twenty-three continuations, and a helper that swallows them would fire twenty-three requests
 * back to back inside what is supposed to be a page-a-second trickle. Yielding the cursor lets the
 * explorer put its gap around **every** request rather than around every category.
 */
export async function fetchCategorySlice(category: string, cursor?: string): Promise<CategorySlice> {
  const data = await apiGet<{
    query?: Record<string, ListMember[] | undefined>;
    continue?: { cmcontinue?: string };
  }>({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryTitle(category),
    cmnamespace: "0|14",
    cmlimit: "max",
    formatversion: "2",
    ...(cursor ? { cmcontinue: cursor } : {}),
  });
  const pages: string[] = [];
  const subcats: string[] = [];
  // Same rule as `readListBlock`: no block means refused, which must not read as an empty category.
  for (const m of readListBlock(data.query, "categorymembers")) (m.ns === 14 ? subcats : pages).push(m.title);
  return { pages, subcats, cursor: data.continue?.cmcontinue };
}

/** One thing that happened on the wiki. `type` is `edit`, `new` or `log` (a delete, move, …). */
export interface WikiChange {
  title: string;
  /** ISO 8601, as MediaWiki writes it. The newest of these becomes the next cursor. */
  timestamp: string;
  type: string;
}

/**
 * How far back `list=recentchanges` goes — `$wgRCMaxAge`, measured at **~90 days** on eqlwiki.
 *
 * The number that decides when change-tracking has to give up and the full walk take over: ask for a
 * window older than this and the answer is not "nothing changed", it is "I no longer know".
 */
export const CHANGES_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Everything that changed in the content namespace since `since`, newest first.
 *
 * The other shape of the same question. Every other refresh in this app is a **poll on a clock** —
 * a page expires and is re-fetched whether or not anybody touched it — and this is the wiki simply
 * saying what it did ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md), read off
 * `everquest-legends-mcp`'s `getRecentChanges`, [neighbours](../../specs/neighbours.md)).
 *
 * Measured against eqlwiki: a fortnight of changes is **9 requests** and names 1,362 pages of our
 * roster, where the TTL would re-fetch all 19,790.
 */
export async function fetchRecentChanges(since: Date, maxPages = 40): Promise<WikiChange[]> {
  const out: WikiChange[] = [];
  let next: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await apiGet<{
      query?: { recentchanges?: WikiChange[] };
      continue?: { rccontinue?: string };
    }>({
      action: "query",
      list: "recentchanges",
      rcnamespace: "0",
      rclimit: "max",
      rcprop: "title|timestamp|ids",
      // `rcdir=older` walks back from now; `rcend` is where to stop. Asking this way round means a
      // long gap costs more requests rather than silently returning only the most recent few.
      rcdir: "older",
      rcend: since.toISOString(),
      formatversion: "2",
      ...(next ? { rccontinue: next } : {}),
    });
    const rows = data.query?.recentchanges;
    if (!rows) throw new Error(`wiki API returned no "recentchanges" block — the request was refused`);
    out.push(...rows);
    next = data.continue?.rccontinue;
    if (!next) break;
  }
  return out;
}

/**
 * A zone page's title plus its redirect aliases. Quests link zones under many
 * names (`[[Befallen]]`, `[[Highpass]]`, `[[Highpass_Hold|…]]`), so backlink
 * lookups must union over every alias to avoid missing quests.
 */
export async function fetchRedirectAliases(title: string): Promise<string[]> {
  const data = await apiGet<{
    query?: { pages?: { title: string; redirects?: { title: string }[] }[] };
  }>({ action: "query", prop: "redirects", titles: title, rdnamespace: "0", rdlimit: "max", formatversion: "2" });
  const page = data.query?.pages?.[0];
  const aliases = [title];
  for (const r of page?.redirects ?? []) if (!aliases.includes(r.title)) aliases.push(r.title);
  return aliases;
}

/**
 * Pages that link TO `title` and are tagged `Category:<category>`. This wiki has
 * no CirrusSearch, so `incategory:` search doesn't work; a backlinks generator
 * filtered by category membership is the reliable way to get a zone's quests.
 * `cllimit=max` matters — the default (10) silently truncates the category check.
 */
export async function fetchQuestBacklinks(title: string, category = "Quests", maxRounds = 20): Promise<SearchResult[]> {
  const wanted = `Category:${category}`;
  const found = new Map<string, SearchResult>();
  let cont: Record<string, string> | undefined;
  for (let round = 0; round < maxRounds; round++) {
    const params: Record<string, string> = {
      action: "query",
      generator: "backlinks",
      gbltitle: title,
      gblnamespace: "0",
      gbllimit: "max",
      prop: "categories",
      clcategories: wanted,
      cllimit: "max",
      formatversion: "2",
      ...(cont ?? {}),
    };
    const data = await apiGet<{
      query?: { pages?: { title: string; categories?: { title: string }[] }[] };
      continue?: Record<string, string>;
    }>(params);
    for (const p of data.query?.pages ?? []) {
      if ((p.categories ?? []).some((c) => c.title === wanted) && !found.has(p.title)) {
        found.set(p.title, { title: p.title, wikiPath: `/${p.title.replace(/ /g, "_")}` });
      }
    }
    if (data.continue) cont = data.continue;
    else break;
  }
  return [...found.values()];
}

/**
 * Fetch a page's rendered content HTML plus its category names (one `parse`
 * call). Categories feed the out-of-era check in the wiki client.
 */
export async function fetchPageHtml(
  title: string,
): Promise<{ title: string; html: string; categories: string[] } | null> {
  const data = await apiGet<{
    parse?: { title: string; text: { "*": string }; categories?: { "*": string }[] };
    error?: { info: string };
  }>({ action: "parse", page: title, prop: "text|categories", redirects: "1" });
  if (data.error || !data.parse) {
    log.warn("parse failed for", title, data.error?.info ?? "");
    return null;
  }
  const categories = (data.parse.categories ?? []).map((c) => c["*"]).filter(Boolean);
  return { title: data.parse.title, html: data.parse.text["*"], categories };
}

// ─── Out-of-era detection (ported from the eql-buff-calc sample) ──────────────
// EQL locks content to progression "eras"; the wiki flags which eras are live via
// Template:PageEra, and tags pages with era categories. We fetch the out-of-era
// era keys, expand them to their category-name aliases, and match a page's
// categories against that set.

const FALLBACK_OUT_ERA_KEYS = [
  "kunark", "velious", "luclin", "chardok", "chardokrevamp",
  "holevp", "warrens", "warrensfearhatererevamp", "epics", "epicquests", "unknown",
];

const ERA_CATEGORY_ALIASES: Record<string, string[]> = {
  kunark: ["kunark era", "kunark"],
  velious: ["velious era", "velious"],
  luclin: ["luclin era", "luclin"],
  chardok: ["chardok era", "chardok"],
  chardokrevamp: ["chardok revamp era", "chardok revamp", "chardokrevamp"],
  holevp: ["hole vp era", "hole/vp era", "holevp"],
  temple: ["temple era", "temple"],
  warrens: ["warrens era", "warrens"],
  warrensfearhatererevamp: ["warrens fear hate revamp era", "warrens/fear/hate revamp era", "warrensfearhatererevamp"],
  epics: ["epics era", "epics", "epic era"],
  epicquests: ["epic quests era", "epic quests", "epicquests"],
  unknown: ["unknown era", "unknown"],
};

/** Category titles for each page in `titles` (batched). Used to flag out-of-era search hits. */
export async function fetchCategoriesFor(titles: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const data = await apiGet<{
      query?: { pages?: { title: string; categories?: { title: string }[] }[] };
    }>({
      action: "query",
      prop: "categories",
      titles: chunk.join("|"),
      cllimit: "max",
      formatversion: "2",
    });
    for (const p of data.query?.pages ?? []) out.set(p.title, (p.categories ?? []).map((c) => c.title));
  }
  return out;
}

/** Lower-cased category names currently marked "out of era" on the EQL server. */
export async function fetchOutEraCategorySet(): Promise<Set<string>> {
  let outEraKeys: string[];
  try {
    const data = await apiGet<{
      query?: { pages?: [{ revisions?: [{ slots?: { main?: { content?: string } } }] }] };
    }>({
      action: "query", titles: "Template:PageEra", prop: "revisions",
      rvprop: "content", rvslots: "*", formatversion: "2",
    });
    const content = data.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
    outEraKeys = [];
    const re = /\|\s*(\w+)\s*=\s*(in|out)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) if (m[2] === "out") outEraKeys.push(m[1]);
    if (!outEraKeys.length) throw new Error("no era keys in template");
  } catch (e) {
    log.warn("PageEra unavailable, using fallback era list:", (e as Error).message);
    outEraKeys = FALLBACK_OUT_ERA_KEYS.slice();
  }

  const set = new Set<string>();
  for (const key of outEraKeys) {
    for (const alias of ERA_CATEGORY_ALIASES[key] ?? []) set.add(alias.toLowerCase().trim());
    set.add(`${key} era`.toLowerCase());
    set.add(key.toLowerCase());
  }
  return set;
}

/**
 * Is the wiki answering, and how quickly — the `wiki` step of the setup check.
 *
 * Its own request rather than a borrowed `opensearch`, for two reasons that both matter to a
 * diagnostic: it wants the **smallest** thing the API will answer (`meta=siteinfo` is a few hundred
 * bytes, so a slow answer means a slow network rather than a big page), and it wants a **short**
 * deadline — `apiGet`'s twenty seconds is right for a page fetch behind a spinner and far too long
 * for a button somebody is watching.
 *
 * Never throws: "we couldn't reach it, and here's what happened" is the answer, not an error.
 */
export async function pingWiki(timeoutMs = 6000): Promise<{ ok: boolean; detail: string }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${API}?${new URLSearchParams({ format: "json", action: "query", meta: "siteinfo" })}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    const took = Date.now() - started;
    if (!res.ok) return { ok: false, detail: `${WIKI_BASE} answered HTTP ${res.status} after ${took} ms.` };
    return { ok: true, detail: `${WIKI_BASE} answered in ${took} ms.` };
  } catch (err) {
    const took = Date.now() - started;
    const why = (err as Error)?.name === "AbortError" ? `no answer within ${timeoutMs} ms` : String(err);
    return { ok: false, detail: `Couldn't reach ${WIKI_BASE} (${why}, after ${took} ms).` };
  } finally {
    clearTimeout(timer);
  }
}
