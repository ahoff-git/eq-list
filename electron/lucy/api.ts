/**
 * api.ts — the HTTP half of the Lucy client (lucy.allakhazam.com). Node/Electron-main only.
 *
 * Lucy is Live EverQuest's item database and has no API: it is server-rendered HTML from about 2004,
 * so this is a scraper. Three things about the real site shape everything here, and all three were
 * measured against it rather than assumed:
 *
 * **1. It demands a session cookie, and refuses with a `200`.** A cookieless request gets a 93-byte
 * body containing nothing but `<meta http-equiv="Refresh" content="0; URL=…&setcookie=1">`. Not a
 * redirect, not an error — a page a browser bounces off and `fetch` hands back as a success. Any
 * `LucySessionID` value satisfies the check; being *issued* one is the whole ritual.
 *
 * **2. It sits behind CloudFront, which caches on the URL and ignores the cookie.** Whichever body
 * landed first is served to everyone for a while — and that is why the cookie is fetched **up front,
 * from `/?setcookie=1`, before any content request is made**. The obvious design (ask, notice the
 * refusal, handshake, ask again) was written first and does not work: the cookieless first request
 * puts *the refusal* in CloudFront's cache under the content URL, and the retry is then served our
 * own poison. Getting the cookie first means no request we make is ever cookieless, so we never
 * cache anything for anyone else either. The retry below survives only for the case someone *else*
 * poisoned it, or a cookie expiring mid-session.
 *
 * **3. A search matching exactly one item `302`s to that item's page.** `fetch` follows it, so the
 * only way to know is to read `res.url` — and when it happens we already hold the page we would
 * otherwise have fetched next, so `itemList` hands it back rather than throwing it away.
 *
 * Every content request goes through one `PoliteQueue`: serialized, spaced, and deduped by URL. This
 * site does not know us and is only asked about queries eqlwiki already failed, so being slow is the
 * feature ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
 */
import zlib from "node:zlib";
import { createPoliteQueue } from "../../src/shared/polite-queue";
import { createLogger } from "../../src/shared/logging";

const log = createLogger("lucy-api");

export const LUCY_BASE = "https://lucy.allakhazam.com";

/** Where a session cookie is issued. The site's own endpoint for it, so asking is not an imposition. */
const COOKIE_URL = `${LUCY_BASE}/?setcookie=1`;

/**
 * Names us and gives someone a way to complain. Matching the wiki client's, because the point of a
 * User-Agent on a borrowed source is that its owner can identify the traffic.
 */
const UA = "EQ-List/0.1 (loot overlay; contact adamhoffmang@gmail.com)";

const TIMEOUT_MS = 20_000;

/** The name list is megabytes rather than kilobytes, so it gets its own, longer deadline. */
const LIST_TIMEOUT_MS = 120_000;

/**
 * The gap between requests. A person clicking around in a browser generates one every few seconds
 * against far heavier resources than these; a second between ours stays under that while being
 * unnoticeable on the one-request-per-click path this client actually uses.
 */
const MIN_GAP_MS = 1000;

const queue = createPoliteQueue({ minGapMs: MIN_GAP_MS });

/**
 * The session cookie, held for the process' lifetime — Lucy's own expiry is a month out. Nothing
 * secret and nothing personal: the value is a bucket id the site issues to anyone who asks, and any
 * value at all gets past the check.
 */
let session: string | null = null;
/** In-flight handshake, so a burst of first requests produces one of them rather than several. */
let handshake: Promise<void> | null = null;

/** Lucy's "you have no cookie" page — a `200` whose entire body is a meta-refresh to `setcookie=1`. */
export function needsCookie(body: string): boolean {
  return /setcookie=1/i.test(body) && /http-equiv\s*=\s*["']?refresh/i.test(body);
}

function url(path: string, params: Record<string, string>): string {
  return `${LUCY_BASE}${path}?${new URLSearchParams(params).toString()}`;
}

/** One request, with the deadline and the headers. Raw — no cookie handling, no politeness. */
async function fetchText(target: string): Promise<{ body: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    log.debug("GET", target);
    const res = await fetch(target, {
      headers: { "User-Agent": UA, ...(session ? { Cookie: session } : {}) },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${target}`);
    return { body: await res.text(), finalUrl: res.url || target };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hold a session cookie, fetching one if we haven't got it.
 *
 * Outside the queue on purpose, and it has to be: it runs *before* a queued request rather than
 * inside one, since a `queue.run` nested in a `queue.run` would wait for itself. One un-throttled
 * request per process is the cost, paid once.
 */
function ensureSession(): Promise<void> {
  if (session) return Promise.resolve();
  handshake ??= (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(COOKIE_URL, { headers: { "User-Agent": UA }, signal: ctrl.signal });
      // `getSetCookie` keeps multiple headers apart; Lucy sends one, but reading them all is free.
      session =
        res.headers
          .getSetCookie()
          .map((c) => c.split(";")[0]?.trim())
          .find((c) => !!c && c.startsWith("LucySessionID=")) ?? null;
      log.debug(session ? "session cookie acquired" : "no session cookie offered");
    } catch (e) {
      log.warn("cookie handshake failed:", (e as Error).message);
    } finally {
      clearTimeout(timer);
      handshake = null;
    }
  })();
  return handshake;
}

/**
 * A page, fetched politely and with a session in hand.
 *
 * One retry, and only for the cookie case — see the note at the top about why it should now be rare.
 * Any other bad answer is either ours to fix or CloudFront's to expire, and hammering it would be the
 * opposite of what this module is for.
 */
async function get(path: string, params: Record<string, string>): Promise<{ body: string; finalUrl: string }> {
  const target = url(path, params);
  await ensureSession();
  return queue.run(target, async () => {
    let got = await fetchText(target);
    if (needsCookie(got.body)) {
      log.debug("cookie refused mid-session, handshaking again");
      session = null;
      await ensureSession();
      got = await fetchText(target);
      if (needsCookie(got.body)) {
        throw new Error(`Lucy won't serve ${target} — a cached cookie-check page, most likely; try later`);
      }
    }
    return got;
  });
}

/**
 * A browsable URL for an item, by **id** when we have one and by **name** when we don't.
 *
 * The name form is Lucy's own search, and it works as a link because of behaviour 3 above: a search
 * matching exactly one item redirects to that item, so `Rusty Short Sword` lands on the page rather
 * than on a list of one. A name that matches several lands on the list, which is the right answer to
 * an ambiguous name and better than no link at all.
 *
 * This is what lets **every** item in the app carry a Lucy link — a shopping-list row, a wiki page,
 * an item the app has only ever seen in a loot line — without knowing Lucy's id for it, and without
 * this app making a request to find out. The browser does the asking.
 */
export function itemUrlFor(target: number | string): string {
  if (typeof target === "number") return `${LUCY_BASE}/item.html?id=${target}`;
  return `${LUCY_BASE}/itemlist.html?${new URLSearchParams({ searchtext: target })}`;
}

/** The item id in a Lucy item URL, or undefined when the URL isn't one. */
export function itemIdFromUrl(target: string): number | undefined {
  const m = /\/item\.html\?(?:.*&)?id=(\d+)/.exec(target);
  return m ? Number(m[1]) : undefined;
}

/**
 * What a name search came back as. Lucy answers a one-hit search by redirecting to the item itself,
 * so "here is a list" and "here is the item, page and all" are both normal outcomes — and the second
 * carries a page we would otherwise have paid for twice.
 */
export type ItemListReply = { kind: "list"; html: string } | { kind: "item"; id: number; html: string };

/** Search items by name substring. Lucy's search is literal — no fuzz, no stemming. */
export async function itemList(term: string): Promise<ItemListReply> {
  const { body, finalUrl } = await get("/itemlist.html", { searchtext: term });
  const id = itemIdFromUrl(finalUrl);
  return id === undefined ? { kind: "list", html: body } : { kind: "item", id, html: body };
}

/** One item's detail page. */
export async function itemPage(id: number): Promise<string> {
  const { body } = await get("/item.html", { id: String(id) });
  return body;
}

/** Lucy's published id/name list, as offered on its own downloads page. */
const ITEM_LIST_URL = `${LUCY_BASE}/itemlist.txt.gz`;

/**
 * Lucy's whole item **name** list, uncompressed — the one thing this site publishes in bulk.
 *
 * Measured: 1.6 MB gzipped, 10.9 MB of CSV, 134,080 rows of `id,name,lucylink`. It is a static file
 * the site offers for exactly this purpose ("useful for matching guild loot systems to Lucy"), so
 * fetching it is taking what is on the table rather than scraping around the edges — and one
 * download replaces the endless stream of one-name searches it lets us answer locally
 * ([ADR 0154](../../specs/decisions/0154-lucy-s-own-name-list-is-worth-holding.md)).
 *
 * No cookie is needed: it is served straight off the filesystem rather than through the script that
 * demands a session. It still goes through the queue, because one large transfer is exactly the kind
 * of thing that should not land beside a burst of page requests.
 *
 * Deliberately **not** an item dump. Lucy publishes stats for spells and not for items, so this
 * carries no card, no slot and no stat — a name index, which is all it claims to be.
 */
export async function fetchItemNameList(): Promise<string> {
  return queue.run(ITEM_LIST_URL, async () => {
    const ctrl = new AbortController();
    // Its own deadline: this is megabytes over a slow old host, not a 3 KB page.
    const timer = setTimeout(() => ctrl.abort(), LIST_TIMEOUT_MS);
    try {
      log.debug("GET", ITEM_LIST_URL);
      const res = await fetch(ITEM_LIST_URL, { headers: { "User-Agent": UA }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${ITEM_LIST_URL}`);
      const gz = Buffer.from(await res.arrayBuffer());
      return zlib.gunzipSync(gz).toString("utf8");
    } finally {
      clearTimeout(timer);
    }
  });
}
