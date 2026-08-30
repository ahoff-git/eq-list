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
import { itemRows } from "../../src/shared/item-search";
import type { SharedItemPage } from "../../src/shared/peer-share";

const DAY = 24 * 60 * 60 * 1000;
const TTL_DAYS = 14;

function rig() {
  // One client per test. The catalogue is held in memory and dropped by the client's *own* writes, so
  // a test that seeded files directly and then re-read the same client would be asking it to notice
  // something it is entitled to miss.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-share-test-"));
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

/** Write a page straight into the cache at a chosen parse version, as an older build would have. */
function seed(dir: string, page: Record<string, unknown> & { kind: string; title: string }, version: number) {
  const key = page.title.replace(/[^a-z0-9]+/gi, "_");
  const full = { sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), ...page };
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ version, page: full }), "utf8");
}

test("an item page from the previous parse version is still good", async () => {
  // The regression this pins cost real money: `CACHE_VERSION` is one number for the whole cache, so
  // bumping it to teach the parser about *zone* pages threw away 11,482 untouched item pages and
  // would have made every user re-fetch the catalogue over three hours. Item pages did not change.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-version-test-"));
  try {
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    seed(dir, { kind: "item", title: "Old But Fine" }, 12);
    seed(dir, { kind: "item", title: "Genuinely Ancient" }, 4);
    const items = await wiki.cachedItems();
    assert.deepEqual(
      items.map((i) => i.title),
      ["Old But Fine"],
      "the previous version is kept; one from before the floor is not",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a zone page from before the roster existed is re-read, not trusted", async () => {
  // The other half: v13 is exactly when a zone page gained `npcs`, so one cached before it has no
  // roster and must not be treated as current — or its mobs would never get levels.
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
    // the catalogue is held in memory and invalidated by *our* writes — seeding files behind a
    // running client's back is exactly the thing it is entitled not to notice.
    seed(dir, { kind: "zone", title: "Blackburrow", npcs: [{ name: "A Gnoll", level: "5-7" }] }, 13);
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const items = await wiki.cachedItems();
    const fresh = itemRows(items, wiki.levelSources())[0];
    assert.equal(fresh?.level?.from, "mob");
    assert.equal(fresh?.level?.min, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
