/**
 * What the page cache does with a copy a peer sent it
 * ([ADR 0164](../decisions/0164-the-newest-copy-in-the-room-wins.md)).
 *
 * Filesystem-backed rather than pure, because the rule *is* about the cache: which copy is on disk
 * afterwards, and what date it carries. A temp directory per test, so nothing here can see anybody's
 * real cache.
 *
 * The rule being pinned is small and easy to get backwards: **the newest pull wins**. Skipping
 * anything already held was the obvious version and it quietly meant a peer who re-pulled a page this
 * morning could never hand it to somebody holding a fortnight-old copy — every install expiring and
 * re-fetching the same page independently, which is the thing the sharing exists to stop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWikiClient } from "../wiki";
import { createPageStore, type PageStore } from "../wiki/page-store";
import type { WikiPage } from "../../src/shared/types";
import { itemRows, type ItemRow } from "../../src/shared/item-search";
import { shardOf } from "../../src/shared/item-shards";
import type { SharedItemPage } from "../../src/shared/peer-share";

const DAY = 24 * 60 * 60 * 1000;
const TTL_DAYS = 14;

function rig(opts: { roster?: string[] } = {}) {
  // One client per test. The catalogue is held in memory and dropped by the client's *own* writes, so
  // a test that seeded files directly and then re-read the same client would be asking it to notice
  // something it is entitled to miss.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-share-test-"));
  // `itemShard` hands out the *roster's* titles for a shard, not whatever the cache happens to hold —
  // so a test about what we would give a peer has to have a roster for there to be anything to give.
  if (opts.roster) {
    const at = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "harvest.json"),
      JSON.stringify({ roster: opts.roster, listedAt: at, fetched: 0, fromPeers: 0, failed: [], startedAt: at, updatedAt: at }),
      "utf8",
    );
  }
  const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
  return {
    wiki,
    /** The AC on the cached copy, as a stand-in for "whose copy is this". */
    async ac(title: string) {
      const held = (await wiki.cachedItems()).find((i) => i.title === title);
      return held?.card?.lines[0];
    },
    async stamp(title: string) {
      return (await wiki.cachedItems()).find((i) => i.title === title)?.fetchedAt;
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString();

const page = (title: string, fetchedAt: string, ac: number): SharedItemPage => ({
  kind: "item",
  title,
  wikiPath: `/${title}`,
  sources: [],
  components: [],
  rewards: [],
  card: { title, lines: [`AC: ${ac}`] },
  fetchedAt,
});

test("a page we don't hold is taken, keeping the age the sender pulled it", async () => {
  const r = rig();
  try {
    assert.equal(r.wiki.items.accept([page("Thing", daysAgo(10), 1)]), 1);
    assert.equal(await r.ac("Thing"), "AC: 1");
    // The age travels: stamping "now" here is what would make a relayed page immortal.
    assert.match((await r.stamp("Thing")) ?? "", new RegExp(daysAgo(10).slice(0, 10)));
  } finally {
    r.cleanup();
  }
});

test("an older copy than ours is refused", async () => {
  const r = rig();
  try {
    r.wiki.items.accept([page("Thing", daysAgo(10), 1)]);
    assert.equal(r.wiki.items.accept([page("Thing", daysAgo(12), 99)]), 0);
    assert.equal(await r.ac("Thing"), "AC: 1", "ours stood");
  } finally {
    r.cleanup();
  }
});

test("a newer copy replaces ours — one re-pull serves the room", async () => {
  // The case the whole rule exists for.
  const r = rig();
  try {
    r.wiki.items.accept([page("Thing", daysAgo(10), 1)]);
    assert.equal(r.wiki.items.accept([page("Thing", daysAgo(1), 42)]), 1);
    assert.equal(await r.ac("Thing"), "AC: 42");
    // And our expiry clock is now set by *their* pull, which is the point: the freshest fetch anybody
    // made is the one everyone's TTL runs from.
    assert.match((await r.stamp("Thing")) ?? "", new RegExp(daysAgo(1).slice(0, 10)));
  } finally {
    r.cleanup();
  }
});

test("an equally-old copy is not rewritten", async () => {
  // Strictly newer, so the common case — two peers holding the same page at the same age — is not a
  // disk write per shard for no change.
  const r = rig();
  try {
    const stamp = daysAgo(5);
    r.wiki.items.accept([page("Thing", stamp, 1)]);
    assert.equal(r.wiki.items.accept([page("Thing", stamp, 99)]), 0);
    assert.equal(await r.ac("Thing"), "AC: 1");
  } finally {
    r.cleanup();
  }
});

test("a copy already past our own TTL is not cached at all", async () => {
  // Writing it would mean caching something immediately due for re-fetch: `holds` would say no and
  // the harvest would go and get it anyway, having already paid for the message.
  const r = rig();
  try {
    assert.equal(r.wiki.items.accept([page("Stale", daysAgo(TTL_DAYS + 6), 5)]), 0);
    assert.equal(await r.ac("Stale"), undefined);
  } finally {
    r.cleanup();
  }
});

test("a sender's stamp from the future cannot pin a page in our cache", async () => {
  // `readSharedPage` clamps it away before this is reached; belt and braces, since the failure would
  // be a page that never expires.
  const r = rig();
  try {
    const ahead = new Date(Date.now() + 400 * DAY).toISOString();
    r.wiki.items.accept([{ ...page("Thing", ahead, 1) }]);
    const stamp = await r.stamp("Thing");
    assert.ok(!stamp || Date.parse(stamp) <= Date.now() + 1000, `stamped in the future: ${stamp}`);
  } finally {
    r.cleanup();
  }
});

// ─── A parser bump invalidates the kinds it changed, and nothing else ───────────────

/**
 * Write a page straight into the cache at a chosen parse version, as an older build would have.
 *
 * Through the store rather than by hand, because the store owns the on-disk shape — a test that
 * wrote bucket lines itself would be pinning the format instead of the rule. One store per directory,
 * so a second seed supersedes the first the way a re-parse does.
 */
const seeders = new Map<string, PageStore>();
function seed(
  dir: string,
  page: Record<string, unknown> & { kind: string; title: string },
  version: number,
  /** The name it is cached *under*, when that differs from the page's own — see the alias test. */
  as?: string,
) {
  const store = seeders.get(dir) ?? createPageStore(dir);
  seeders.set(dir, store);
  const full = { sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), ...page };
  store.put(as ?? page.title, version, full as unknown as WikiPage);
}

test("an item page from the previous parse version is still good", async () => {
  // The regression this pins cost real money: `CACHE_VERSION` is one number for the whole cache, so
  // bumping it to teach the parser about *zone* pages threw away 11,482 untouched item pages and
  // would have made every user re-fetch the catalogue over three hours. Item pages did not change.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-version-test-"));
  try {
    seed(dir, { kind: "item", title: "Old But Fine" }, 12);
    seed(dir, { kind: "item", title: "Genuinely Ancient" }, 4);
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const items = await wiki.cachedItems();
    assert.deepEqual(
      items.map((i) => i.title),
      ["Old But Fine"],
      "the previous version is kept; one from before the floor is not",
    );
  } finally {
    await cleanup(dir);
  }
});

test("a zone page from before the roster existed is re-read, not trusted", async () => {
  // The other half: a zone page gained `npcs` at v13 and `links` at v14, so one cached below the
  // current floor must not be treated as current — or its mobs would never get levels.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-version-zone-"));
  try {
    seed(dir, { kind: "zone", title: "Blackburrow", npcs: [{ name: "A Gnoll", level: "5-7" }] }, 12);
    seed(
      dir,
      { kind: "item", title: "Gnoll Thing", sources: [{ kind: "drop", where: "a gnoll", detail: "Nowhere At All" }] },
      12,
    );
    // The zone is stale, so its roster is not read and the item gets no mob level from it. The level
    // itself lives on the *row*, so this asks the same question `itemRows` would.
    const before = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const stale = itemRows(await before.cachedItems(), before.levelSources())[0];
    assert.equal(stale?.level?.from, undefined);

    // Re-parsed at the current version, the same roster does place it. A **fresh client**, because
    // the catalogue is held in memory and invalidated by *our* writes — seeding pages behind a
    // running client's back is exactly the thing it is entitled not to notice.
    seed(dir, { kind: "zone", title: "Blackburrow", npcs: [{ name: "A Gnoll", level: "5-7" }] }, 14);
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const items = await wiki.cachedItems();
    const fresh = itemRows(items, wiki.levelSources())[0];
    assert.equal(fresh?.level?.from, "mob");
    assert.equal(fresh?.level?.min, 5);
  } finally {
    await cleanup(dir);
  }
});

// ─── The catalogue is held, not re-walked ───────────────────────────────────

test("the catalogue is built once and kept", async () => {
  // Walking the cache is hundreds of milliseconds of synchronous reads on the process that serves
  // every window's IPC. Doing it per Items tab mount is what froze the app; the same array coming
  // back is what stops it.
  const r = rig();
  try {
    r.wiki.items.accept([page("Thing", daysAgo(1), 1)]);
    const first = await r.wiki.cachedItems();
    const second = await r.wiki.cachedItems();
    assert.equal(first, second, "the same array, not an equal one — nothing was re-read");
  } finally {
    r.cleanup();
  }
});

test("writing a page drops the held catalogue", async () => {
  // The other half: held for ever would be a cache that never notices a fetch. Our own writes are
  // the only ones it has to notice, which is why the invalidation sits next to them.
  const r = rig();
  try {
    r.wiki.items.accept([page("First", daysAgo(1), 1)]);
    const before = await r.wiki.cachedItems();
    assert.deepEqual(before.map((i) => i.title), ["First"]);

    r.wiki.items.accept([page("Second", daysAgo(1), 2)]);
    const after = await r.wiki.cachedItems();
    assert.notEqual(before, after, "a write means the next read rebuilds");
    assert.deepEqual(after.map((i) => i.title).sort(), ["First", "Second"]);
  } finally {
    r.cleanup();
  }
});

test("two callers arriving at once share one walk", async () => {
  // The Items tab mounting while the share hub's tick asks for coverage is the ordinary case.
  const r = rig();
  try {
    r.wiki.items.accept([page("Thing", daysAgo(1), 1)]);
    const [a, b] = await Promise.all([r.wiki.cachedItems(), r.wiki.cachedItems()]);
    assert.equal(a, b);
  } finally {
    r.cleanup();
  }
});

// ─── The packed catalogue ────────────────────────────────────────────

/** The pack is written after the build settles, so a test that reads it has to let that happen. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

/**
 * Tear down a temp cache, tolerating a write that is still in flight.
 *
 * The pack is written fire-and-forget on purpose — the catalogue is already in hand and a failed
 * write only costs the next launch a rebuild — so one can land while the directory is being removed
 * and Windows answers ENOTEMPTY. Retrying is the test's problem, not the client's.
 */
async function cleanup(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (attempt >= 20) throw e;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

test("a second launch reads the pack instead of walking the cache", async () => {
  // The reason the Items tab stopped being painful: 11,519 reads plus eleven thousand cards parsed is
  // ~700ms on the process that serves every window, paid on each launch because Items is usually the
  // tab you left open. The built answer is written down instead.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-pack-"));
  try {
    const first = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    first.items.accept([page("Thing", daysAgo(1), 7)]);
    const built = JSON.parse(await first.catalogueJson()) as ItemRow[];
    assert.deepEqual(built.map((r) => r.item.title), ["Thing"]);
    await settle();
    assert.ok(fs.existsSync(path.join(dir, "catalogue.json")), "a pack was written");

    // A fresh client is what a relaunch is. It must get the same rows without the walk.
    const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const packed = JSON.parse(await next.catalogueJson()) as ItemRow[];
    assert.deepEqual(packed.map((r) => r.item.title), ["Thing"]);
    assert.equal(packed[0].stats.stats.ac, 7, "and the built stats came with it");
  } finally {
    await cleanup(dir);
  }
});

test("writing a page drops the pack, so it can never serve a stale catalogue", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-pack-drop-"));
  try {
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    wiki.items.accept([page("First", daysAgo(1), 1)]);
    JSON.parse(await wiki.catalogueJson()) as ItemRow[];
    await settle();

    wiki.items.accept([page("Second", daysAgo(1), 2)]);
    await settle();
    // Whatever became of the file, what a *fresh* client sees must include the new page.
    const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const rows = JSON.parse(await next.catalogueJson()) as ItemRow[];
    assert.deepEqual(rows.map((r) => r.item.title).sort(), ["First", "Second"]);
  } finally {
    await cleanup(dir);
  }
});

test("a pack from another build is ignored rather than trusted", async () => {
  // It carries a signature naming the parse version and the row shape. Without that, a build that
  // added a field to a row would read yesterday's rows and quietly serve them without it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-pack-sig-"));
  try {
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    wiki.items.accept([page("Thing", daysAgo(1), 7)]);
    JSON.parse(await wiki.catalogueJson()) as ItemRow[];
    await settle();

    fs.writeFileSync(path.join(dir, "catalogue.json"), "not a pack at all", "utf8");
    const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const rows = JSON.parse(await next.catalogueJson()) as ItemRow[];
    assert.deepEqual(rows.map((r) => r.item.title), ["Thing"], "it rebuilt from the pages");
  } finally {
    await cleanup(dir);
  }
});

test("a launch opens a handful of files, not the whole cache", async () => {
  /**
   * The one that stopped an antimalware scanner flattening the machine on every launch.
   *
   * Coverage for the peer room is built on the share hub's first catalogue tick, so it runs whether
   * or not anybody opens the Items tab — and it used to get the titles it needs by walking every page
   * in the cache. Eleven and a half thousand file opens in a burst is eleven and a half thousand
   * real-time scans. The pack carries the titles, so it is one read.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-opens-"));
  try {
    const first = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    first.items.accept([page("A", daysAgo(1), 1), page("B", daysAgo(1), 2), page("C", daysAgo(1), 3)]);
    await first.catalogueJson();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Count what a *fresh* client — a relaunch — actually opens.
    const real = fs.readFileSync;
    let opens = 0;
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      opens++;
      return real(...args);
    }) as typeof fs.readFileSync;
    try {
      const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
      await next.catalogueJson();
      next.items.status();
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = real;
    }
    // A handful: the pack, the harvest state, the mirrored indexes. Emphatically not one per page.
    assert.ok(opens < 10, `a launch opened ${opens} files`);
  } finally {
    await cleanup(dir);
  }
});

test("a page cached under two names is one item, not two", async () => {
  /**
   * Asking for a *graded* item — `Cloth Cape +2`, off the log or the shopping list — finds no page of
   * that name, so `getPage` retries the base name and caches what comes back under the name it was
   * asked about. That is deliberate (it stops the next `+2` paying for the fetch again), and it means
   * the cache holds the same page under two names. The catalogue walks what is held, so without
   * folding them the Items tab lists the same item twice — 37 times over, on a real cache.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-alias-"));
  try {
    const same = { kind: "item", title: "Cloth Cape", wikiPath: "/Cloth_Cape", card: { title: "Cloth Cape", lines: ["AC: 2"] } };
    seed(dir, same, 13);
    // The alias `getPage("Cloth Cape +2")` would write: the same page, under the asked-for name.
    seed(dir, same, 13, "Cloth Cape +2");

    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const rows = JSON.parse(await wiki.catalogueJson()) as ItemRow[];
    assert.deepEqual(rows.map((r) => r.item.title), ["Cloth Cape"], "two names, one row");
    assert.equal(rows[0].stats.stats.ac, 2, "and it is the real page, not an empty stand-in");
  } finally {
    await cleanup(dir);
  }
});

// ─── The old one-file-per-page cache ────────────────────────────────────────

test("a cache of loose page files is folded into buckets and the files go", async () => {
  /**
   * The upgrade path off one file per page ([ADR 0165](../../specs/decisions/0165-the-page-cache-is-a-few-files-not-eleven-thousand.md)).
   * Every existing install has thousands of these, so getting this wrong loses somebody's whole
   * catalogue and costs them a three-hour re-crawl.
   *
   * Also pins what migration does with the **graded aliases**: keyed by the page's own title, so
   * `Cloth_Cape_2.json` folds into the one entry rather than carrying the duplicate forward.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-migrate-"));
  try {
    const loose = (name: string, page: Record<string, unknown>) =>
      fs.writeFileSync(
        path.join(dir, `${name}.json`),
        JSON.stringify({ version: 13, page: { sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), ...page } }),
        "utf8",
      );
    const cape = { kind: "item", title: "Cloth Cape", wikiPath: "/Cloth_Cape", card: { title: "Cloth Cape", lines: ["AC: 2"] } };
    loose("Cloth_Cape", cape);
    loose("Cloth_Cape_2", cape); // the graded alias, same page under a second name
    loose("Rusty_Sword", { kind: "item", title: "Rusty Sword", wikiPath: "/Rusty_Sword", card: { title: "Rusty Sword", lines: ["AC: 1"] } });
    // Not pages, and not ours to touch.
    fs.writeFileSync(path.join(dir, "title-index.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), titles: ["Cloth Cape"] }), "utf8");

    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const titles = (await wiki.cachedItems()).map((i) => i.title);
    assert.deepEqual(titles, ["Cloth Cape", "Rusty Sword"], "every page survived the fold");

    // Named, not an exact directory listing: the client warms its mirrored title/zone indexes on
    // construction, so a wiki that happens to answer mid-test writes files of its own here — which is
    // nothing to do with the migration and made this assertion fail about one run in five.
    const left = new Set(fs.readdirSync(dir));
    for (const gone of ["Cloth_Cape.json", "Cloth_Cape_2.json", "Rusty_Sword.json"]) {
      assert.equal(left.has(gone), false, `${gone} should have been folded in and deleted`);
    }
    assert.equal(left.has("title-index.json"), true, "and nothing that isn't a page was touched");
    assert.ok(fs.readdirSync(path.join(dir, "pages")).length > 0, "the buckets hold them now");
  } finally {
    await cleanup(dir);
  }
});

test("a page is readable while the old cache is still being folded in", async () => {
  // Migration walks thousands of files, and the app is live throughout. A lookup that missed until it
  // finished would mean an upgrade launch re-fetching pages it already has.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-migrate-live-"));
  try {
    fs.writeFileSync(
      path.join(dir, "Cloth_Cape.json"),
      JSON.stringify({ version: 13, page: { kind: "item", title: "Cloth Cape", wikiPath: "/Cloth_Cape", sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString() } }),
      "utf8",
    );
    const store = createPageStore(dir);
    // Synchronously, before the migration this construction started can possibly have run.
    assert.equal(store.get("Cloth Cape")?.page.title, "Cloth Cape", "read through to the old file");
    await store.ready();
    assert.equal(store.get("Cloth Cape")?.page.title, "Cloth Cape", "and still there afterwards");
  } finally {
    await cleanup(dir);
  }
});

test("a cache that never had the old layout stops looking for it", async () => {
  // The flag that says "read through to the loose files" has to clear even when there are none, or
  // every lookup that misses the buckets opens a file that has never existed — one wasted open per
  // cache miss, for the life of the process, on every install that started here.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-fresh-"));
  try {
    const store = createPageStore(dir);
    await store.ready();
    const real = fs.readFileSync;
    let opens = 0;
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      opens++;
      return real(...args);
    }) as typeof fs.readFileSync;
    try {
      assert.equal(store.get("Nothing At All"), null);
    } finally {
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = real;
    }
    assert.equal(opens, 1, "the bucket, and nothing else");
  } finally {
    await cleanup(dir);
  }
});

test("a torn line costs one page, not the bucket", async () => {
  // An append can be cut short by a power cut. The rest of the bucket has to survive it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-torn-"));
  try {
    seed(dir, { kind: "item", title: "Whole Thing", wikiPath: "/Whole_Thing" }, 13);
    const bucket = fs
      .readdirSync(path.join(dir, "pages"))
      .map((n) => path.join(dir, "pages", n))
      .find((f) => fs.readFileSync(f, "utf8").includes("Whole Thing"));
    assert.ok(bucket, "the page landed in a bucket");
    fs.appendFileSync(bucket, 'Half A Page	13	{"kind":"item","ti', "utf8");

    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    assert.deepEqual((await wiki.cachedItems()).map((i) => i.title), ["Whole Thing"]);
  } finally {
    await cleanup(dir);
  }
});

/**
 * The other direction: when the cache goes and *asks* for copies
 * ([ADR 0176](../decisions/0176-a-room-fills-itself.md)).
 *
 * Only the refusal is pinned here, and deliberately so — a test that let the fill actually start
 * would go to the network for a roster. That a room with something to give does start one is the
 * planner's decision and is tested against `roomOffersMore` in `item-shards.test.ts`.
 */
test("nobody in the room means nothing is started, however often the tick asks", async () => {
  // The safety property of filling automatically: a solo install must never find itself crawling
  // the wiki because of a timer. The room is the gate, and an empty room is shut.
  const { wiki } = rig();
  wiki.items.fill();
  wiki.items.fill();
  // `fill` reaches the shard index through a promise, so the decision lands a macrotask later.
  await new Promise((r) => setImmediate(r));
  assert.equal(wiki.harvest.status().status, "idle");
});

/**
 * The shape has to survive the wire, or filling from a room quietly disables exploring
 * ([ADR 0180](../decisions/0180-the-wiki-has-a-shape-and-it-moves.md)).
 *
 * Worth a test of its own because the failure is silent *and* self-sustaining: a page taken from a
 * peer is written under the current `CACHE_VERSION`, so a link-less zone page looks perfectly
 * current and is never re-fetched to gain one. An install that filled from the room would have
 * nothing to explore, for ever, and nothing would say so.
 */
test("a zone page we took from a peer is handed on with its links intact", async () => {
  const { wiki } = rig({ roster: ["Blackburrow"] });
  wiki.items.accept([
    {
      kind: "zone",
      title: "Blackburrow",
      wikiPath: "/Blackburrow",
      sources: [],
      components: [],
      rewards: [],
      npcs: [{ name: "A Gnoll", level: "5-7" }],
      links: ["Gnoll Hide Lariat", "A Gnoll"],
      fetchedAt: new Date().toISOString(),
    },
  ]);
  // The shard index is built off a promise the accessors only *kick off* — so ask for it, then let
  // it land before reading what we would hand a peer.
  wiki.items.status();
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));

  const onward = wiki.items.shard(shardOf("Blackburrow"));
  const zone = onward.find((p) => p.title === "Blackburrow");
  assert.ok(zone, "the zone page is ours to give");
  assert.deepEqual(zone?.links, ["Gnoll Hide Lariat", "A Gnoll"], "and it still carries its shape");
});
