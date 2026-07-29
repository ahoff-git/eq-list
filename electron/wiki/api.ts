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

async function apiGet<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params }).toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    log.debug("GET", url);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
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
  const titles: string[] = [];
  let apcontinue: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      action: "query",
      list: "allpages",
      apnamespace: "0",
      aplimit: "max",
      apfilterredir: "nonredirects",
    };
    if (apcontinue) params.apcontinue = apcontinue;
    const data = await apiGet<{
      query?: { allpages?: { title: string }[] };
      continue?: { apcontinue?: string };
    }>(params);
    for (const p of data.query?.allpages ?? []) titles.push(p.title);
    apcontinue = data.continue?.apcontinue;
    if (!apcontinue) break;
  }
  return titles;
}

/** Titles of a category's content-namespace (ns=0) members, paginated. */
export async function fetchCategoryTitles(category: string, maxPages = 40): Promise<string[]> {
  const cmtitle = category.startsWith("Category:") ? category : `Category:${category}`;
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      action: "query",
      list: "categorymembers",
      cmtitle,
      cmnamespace: "0",
      cmlimit: "max",
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await apiGet<{
      query?: { categorymembers?: { title: string }[] };
      continue?: { cmcontinue?: string };
    }>(params);
    for (const p of data.query?.categorymembers ?? []) titles.push(p.title);
    cmcontinue = data.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return titles;
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
