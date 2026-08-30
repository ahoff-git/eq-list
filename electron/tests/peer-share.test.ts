/**
 * What crosses the wire between two installs, and what happens to it on the way in.
 *
 * Three subjects, and they are the three ways this feature can be quietly wrong rather than loudly
 * broken ([ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)):
 *
 *   - **The readers**, because everything inbound is a stranger's. A reader that lets one bad field
 *     through doesn't crash — it files an impossible tally, or draws a marker at the wrong end of
 *     the world, and looks like data.
 *   - **The de-dupes**, because "two people at one camp see one countdown" is the whole point of
 *     sharing a timer, and getting it wrong shows the camp two rows for one mob — which is worse
 *     than not sharing at all, since both rows look authoritative.
 *   - **The buff target**, because `ON_YOU` means *the sender*. Replayed verbatim it silently
 *     collapses everybody's self-buffs onto yours, and every row still looks plausible.
 *
 * Ids are injected (`newId`) for the same reason `decodeWatches` takes one: a test should be able to
 * assert on what it produced.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SAME_SPAWN_MS,
  compareScores,
  mergeBuffs,
  mergeTimers,
  newlyOffered,
  offerSummary,
  outOfDate,
  readAsk,
  readGive,
  readOffer,
  shareKind,
  shareableBuffs,
  sharing,
  type PeerTimer,
} from "../../src/shared/peer-share";
import { ON_PET, ON_YOU, type BuffInstance } from "../../src/shared/buff-tracking";
import type { SpawnTimer } from "../../src/shared/spawn-timers";
import type { HighScore } from "../../src/shared/types";

/** Predictable ids, so an assertion can name what a reader produced. */
function ids(): () => string {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const T0 = Date.parse("2026-01-01T12:00:00.000Z");
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

function timer(over: Partial<SpawnTimer> = {}): SpawnTimer {
  return {
    id: "gnoll@Blackburrow#0",
    key: "gnoll@Blackburrow",
    mob: "a gnoll",
    place: "Blackburrow",
    killedAt: iso(0),
    watchFrom: iso(600_000),
    dueAt: iso(600_000),
    seconds: 600,
    source: "killed",
    samples: 3,
    lead: 0,
    ...over,
  };
}

function buff(over: Partial<BuffInstance> = {}): BuffInstance {
  return {
    key: "spirit of wolf",
    spell: "Spirit of Wolf",
    target: ON_YOU,
    up: true,
    at: iso(0),
    since: iso(0),
    source: "landed",
    byYou: false,
    permanent: false,
    onEnemy: false,
    ...over,
  };
}

// ─── The catalogue and its three messages ───────────────────────────────────

test("a kind we don't know cannot be asked for or received", () => {
  assert.equal(shareKind("watches")?.family, "authored");
  assert.equal(shareKind("passwords"), undefined);
  assert.equal(readAsk({ what: "passwords" }), null);
  assert.equal(readGive({ what: "passwords", rows: [{}] }, ids()), null);
});

test("an offer keeps only known kinds with numeric counts", () => {
  const offer = readOffer({
    watches: { n: 3, rev: 2 },
    passwords: { n: 9, rev: 1 },
    mobs: { n: "lots", rev: 1 },
    kills: { n: -1, rev: 1 },
    scores: { n: 0, rev: 7 },
  });
  assert.deepEqual(offer, { watches: { n: 3, rev: 2 }, scores: { n: 0, rev: 7 } });
});

test("a kind that isn't switched on is off — absent and false both mean no", () => {
  assert.equal(sharing(undefined, "watches"), false);
  assert.equal(sharing({}, "watches"), false);
  assert.equal(sharing({ watches: false }, "watches"), false);
  assert.equal(sharing({ watches: true }, "watches"), true);
});

test("a give with no rows is unchanged, which is not the same as a give of none", () => {
  const unchanged = readGive({ what: "mobs", rev: 4 }, ids());
  assert.equal(unchanged?.stale, true);
  // An empty list means "I now hold none", which `contributions.ts` treats as an un-share that
  // keeps what it taught (ADR 0056). Collapsing the two would silently freeze a peer's tally.
  const emptied = readGive({ what: "mobs", rev: 5, rows: [] }, ids());
  assert.equal(emptied?.stale, false);
  assert.deepEqual(emptied?.rows, []);
});

// ─── Readers ────────────────────────────────────────────────────────────────

test("a shared kill without a position is dropped, not defaulted to nowhere", () => {
  const give = readGive(
    {
      what: "kills",
      rev: 1,
      rows: [
        { zone: "Blackburrow", mob: "a gnoll", y: 100, x: -50, confidence: 0.9 },
        { zone: "Blackburrow", mob: "a gnoll", confidence: 0.9 },
        { zone: "Blackburrow", mob: "a gnoll", y: 1e9, x: 0, confidence: 0.9 },
      ],
    },
    ids(),
  );
  assert.deepEqual(give?.rows, [{ zone: "Blackburrow", mob: "a gnoll", y: 100, x: -50, confidence: 0.9 }]);
});

test("a confidence outside 0–1 is clamped rather than believed", () => {
  const give = readGive(
    { what: "kills", rev: 1, rows: [{ zone: "z", mob: "m", y: 1, x: 1, confidence: 99 }] },
    ids(),
  );
  assert.equal((give?.rows[0] as { confidence: number }).confidence, 1);
});

test("a respawn whose shortest exceeds its longest is impossible, so it is refused", () => {
  const give = readGive(
    {
      what: "respawns",
      rev: 1,
      rows: [
        { key: "k", mob: "a named", shortestSeconds: 900, longestSeconds: 300, samples: 2 },
        { key: "k2", mob: "a named", shortestSeconds: 300, longestSeconds: 900, samples: 2 },
      ],
    },
    ids(),
  );
  assert.equal(give?.rows.length, 1);
  assert.equal((give?.rows[0] as { key: string }).key, "k2");
});

test("a copied list entry arrives empty of the sender's progress", () => {
  const give = readGive(
    {
      what: "lists",
      rev: 1,
      rows: [{ id: "theirs", name: "Bone Chips", needed: 20, obtained: 17, notify: true, lastSeenAt: iso(0) }],
    },
    ids(),
  );
  const entry = give?.rows[0] as Record<string, unknown>;
  // Their id would collide with ours; their counts are a record of their log, not evidence we have.
  assert.equal(entry.id, "id-1");
  assert.equal(entry.obtained, 0);
  assert.equal(entry.notify, undefined);
  assert.equal(entry.lastSeenAt, undefined);
  assert.equal(entry.needed, 20);
});

test("a style pointing at a placement we haven't got lands somewhere visible", () => {
  const give = readGive(
    {
      what: "styles",
      rev: 1,
      rows: [{ name: "Loud", style: { position: "loc:theirs", durationMs: 9_000_000, animation: "explode" } }],
    },
    ids(),
  );
  const style = (give?.rows[0] as { style: Record<string, unknown> }).style;
  // A `loc:` id names a spot in *their* settings, so it would resolve to nothing and the banner
  // would never appear. Clamped duration and a known animation, for the same reason.
  assert.equal(style.position, "top");
  assert.equal(style.durationMs, 60_000);
  assert.equal(style.animation, "none");
});

// ─── Buff targets, which are relative until they aren't ─────────────────────

test("a buff on 'you' is resolved to the sender before it leaves", () => {
  const out = shareableBuffs([buff(), buff({ target: ON_PET }), buff({ target: "Someone else" })], "Kainos");
  assert.deepEqual(
    out.map((b) => b.target),
    ["Kainos", "Kainos's pet"],
  );
});

test("a buff still wearing a relative target is refused on arrival", () => {
  // Belt and braces: `shareableBuffs` resolves on the way out, and this is what stops an older or a
  // hand-rolled sender collapsing its self-buffs onto ours.
  const give = readGive({ what: "buffs", rev: 1, rows: [buff(), buff({ target: "Kainos" })] }, ids());
  assert.equal(give?.rows.length, 1);
  assert.equal((give?.rows[0] as BuffInstance).target, "Kainos");
});

test("nothing is shareable without a name to resolve a target against", () => {
  assert.deepEqual(shareableBuffs([buff()], "  "), []);
});

// ─── De-dupe: countdowns ────────────────────────────────────────────────────

test("two clocks for one camp, close together, are one spawn", () => {
  const mine = [timer({ samples: 2 })];
  const theirs: PeerTimer[] = [{ timer: timer({ dueAt: iso(600_000 + 60_000), samples: 9 }), by: "Bob", agreeing: [] }];
  const merged = mergeTimers(mine, theirs);
  assert.equal(merged.length, 1);
  // More gaps behind the interval wins, so Bob's is the clock shown…
  assert.equal(merged[0].by, "Bob");
  // …and both are credited, which is the reason to want this at a shared camp.
  assert.deepEqual(merged[0].agreeing.sort(), ["Bob", "You"]);
});

test("two clocks a full respawn apart are two spawns, not one", () => {
  const merged = mergeTimers(
    [timer()],
    [{ timer: timer({ dueAt: iso(600_000 + SAME_SPAWN_MS + 1000) }), by: "Bob", agreeing: [] }],
  );
  assert.equal(merged.length, 2);
});

test("somebody who can see it outranks any countdown, however well evidenced", () => {
  const merged = mergeTimers(
    [timer({ samples: 500 })],
    [{ timer: timer({ dueAt: iso(600_000 + 1000), samples: 1, seenAt: iso(0) }), by: "Bob", agreeing: [] }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].by, "Bob");
  assert.ok(merged[0].timer.seenAt);
});

test("with equal evidence the tighter bound wins, and a tie stays ours", () => {
  const earlier = mergeTimers(
    [timer()],
    [{ timer: timer({ dueAt: iso(600_000 - 30_000) }), by: "Bob", agreeing: [] }],
  );
  assert.equal(earlier[0].by, "Bob");

  // An exact tie resolves to ours, so the row doesn't flicker with packet order.
  const tied = mergeTimers([timer()], [{ timer: timer(), by: "Bob", agreeing: [] }]);
  assert.equal(tied.length, 1);
  assert.equal(tied[0].by, undefined);
});

test("different camps never merge, however close their due times", () => {
  const merged = mergeTimers(
    [timer()],
    [{ timer: timer({ key: "gnoll@Befallen", place: "Befallen" }), by: "Bob", agreeing: [] }],
  );
  assert.equal(merged.length, 2);
});

// ─── De-dupe: buffs ─────────────────────────────────────────────────────────

test("one spell on one person is one row, and the freshest report wins", () => {
  const merged = mergeBuffs(
    [buff({ target: "Kainos", at: iso(0) })],
    [{ buff: buff({ target: "Kainos", at: iso(60_000), up: false }), by: "Bob" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].buff.up, false);
  assert.equal(merged[0].by, "Bob");
});

test("the same spell on two people is two rows", () => {
  const merged = mergeBuffs(
    [buff({ target: "Kainos" })],
    [{ buff: buff({ target: "Bob" }), by: "Bob" }],
  );
  assert.equal(merged.length, 2);
});

// ─── Scores: compared, never merged ─────────────────────────────────────────

const score = (categoryId: string, value: number, over: Partial<HighScore> = {}): HighScore => ({
  categoryId,
  value,
  at: iso(0),
  beaten: 1,
  ...over,
});

test("a category nobody has is not a row, and a column with no figure is not a zero", () => {
  const rows = compareScores(
    { character: "Kainos", scores: [score("biggest-hit", 400)] },
    [{ character: "Bob", scores: [score("longest-fight", 90)] }],
    () => 0,
  );
  assert.deepEqual(rows.map((r) => r.categoryId).sort(), ["biggest-hit", "longest-fight"]);
  const hit = rows.find((r) => r.categoryId === "biggest-hit")!;
  assert.equal(hit.columns.find((c) => c.character === "Bob")?.score, undefined);
});

test("the biggest settled figure leads, and a provisional one cannot", () => {
  const rows = compareScores(
    { character: "Kainos", scores: [score("biggest-hit", 400)] },
    [{ character: "Bob", scores: [score("biggest-hit", 9000, { unsettled: true })] }],
    () => 0,
  );
  // Bob's is larger and says it might be wrong, so it is shown and does not take the crown
  // (ADR 0130's provisional flag, surviving the wire).
  assert.equal(rows[0].leader, "Kainos");
  assert.equal(rows[0].columns.find((c) => c.character === "Bob")?.score?.value, 9000);
});

test("a board with no character is left out — a column has to be somebody's", () => {
  const rows = compareScores(
    { character: "", scores: [score("biggest-hit", 400)] },
    [{ character: "Bob", scores: [score("biggest-hit", 100)] }],
    () => 0,
  );
  assert.deepEqual(rows[0].columns.map((c) => c.character), ["Bob"]);
});

// ─── What is worth interrupting somebody about ──────────────────────────────

test("a first catalogue is news, and an unchanged one is not", () => {
  const offer = { watches: { n: 3, rev: 1 }, styles: { n: 1, rev: 1 } };
  // Never heard from them: somebody who was already sharing when you connected is exactly who you
  // want to know about (ADR 0143).
  assert.deepEqual(newlyOffered(offer, undefined), ["watches", "styles"]);
  assert.deepEqual(newlyOffered(offer, offer), []);
});

test("a count moving is not an offer — it is somebody's evening", () => {
  // The whole noise problem: a catalogue's counts move on every kill, and a notice per catalogue
  // change would be a notice per kill.
  const before = { watches: { n: 3, rev: 1 }, mobs: { n: 10, rev: 1 } };
  const after = { watches: { n: 9, rev: 4 }, mobs: { n: 412, rev: 91 } };
  assert.deepEqual(newlyOffered(after, before), []);
});

test("only what a reader has to act on — an observation fetches itself", () => {
  const offered = newlyOffered({ mobs: { n: 400, rev: 1 }, kills: { n: 80, rev: 1 }, pins: { n: 4, rev: 1 } }, {});
  assert.deepEqual(offered, ["pins"]);
});

test("a kind switched on over an empty list is an offer of nothing", () => {
  assert.deepEqual(newlyOffered({ watches: { n: 0, rev: 3 } }, {}), []);
  // …and becomes news the moment they actually have one.
  assert.deepEqual(newlyOffered({ watches: { n: 1, rev: 4 } }, { watches: { n: 0, rev: 3 } }), ["watches"]);
});

test("newly offered kinds come back in catalogue order, whatever order they arrived in", () => {
  // So two peers offering the same things read the same way.
  assert.deepEqual(newlyOffered({ scores: { n: 8, rev: 1 }, watches: { n: 2, rev: 1 } }, {}), [
    "watches",
    "scores",
  ]);
});

test("a notice names two things and counts the rest", () => {
  assert.equal(offerSummary(["watches"]), "Watch rules");
  assert.equal(offerSummary(["watches", "styles"]), "Watch rules and Alert styles");
  // A card has one line for this, and a peer who switched everything on must not fill it.
  assert.equal(offerSummary(["watches", "styles", "lists", "pins"]), "Watch rules, Alert styles and 2 more");
});

// ─── Keeping up to date without waiting to be told ──────────────────────────

test("a kind we have never had is out of date, however new we are", () => {
  assert.deepEqual(outOfDate({ mobs: { n: 400, rev: 7 } }, () => undefined), ["mobs"]);
});

test("an equal revision is up to date, and a lower one is not worth re-fetching", () => {
  const offer = { mobs: { n: 400, rev: 7 } };
  assert.deepEqual(outOfDate(offer, () => 7), []);
  // Their store was reset behind a revision we already hold. Asking would fetch what we have, and
  // their answer would say "unchanged" anyway.
  assert.deepEqual(outOfDate(offer, () => 9), []);
  assert.deepEqual(outOfDate(offer, () => 6), ["mobs"]);
});

test("reconciliation is observations only — nothing authored is re-fetched behind a reader's back", () => {
  const offer = {
    mobs: { n: 400, rev: 7 },
    kills: { n: 80, rev: 3 },
    respawns: { n: 12, rev: 2 },
    watches: { n: 5, rev: 9 },
    styles: { n: 2, rev: 4 },
    timers: { n: 3, rev: 1 },
    scores: { n: 8, rev: 5 },
  };
  assert.deepEqual(outOfDate(offer, () => undefined), ["mobs", "kills", "respawns"]);
});

test("a kind offered over an empty store is nothing to fetch", () => {
  assert.deepEqual(outOfDate({ mobs: { n: 0, rev: 4 } }, () => undefined), []);
});

// ── Item pages: the one family applied without anybody looking (ADR 0160) ────
// Which is exactly why the reader is the safety. These land straight in the page cache, so a field
// that gets through is a stat card somebody searches by and sorts on.

/** Read one page the way a `give` of the `items` kind does. */
function readPage(raw: unknown): unknown {
  const give = readGive({ what: "items", rev: 1, rows: [raw] }, () => "id");
  return give?.rows[0];
}

test("public pages share by default; everything of yours does not", () => {
  // The asymmetry is the decision (ADR 0161): an item page is a copy of a public wiki page with
  // nothing of yours in it, so "off until asked" protects nothing and costs the room the sharing.
  assert.equal(sharing(undefined, "items"), true);
  assert.equal(sharing({}, "items"), true);
  for (const key of ["watches", "styles", "lists", "pins", "mobs", "kills", "respawns", "timers", "buffs", "scores"] as const) {
    assert.equal(sharing({}, key), false, `${key} must stay off by default`);
  }
});

test("an explicit no stays no, which is the whole point of a toggle", () => {
  assert.equal(sharing({ items: false }, "items"), false);
  assert.equal(sharing({ items: true }, "items"), true);
});

test("a page carries its age, so relaying it can't make it immortal", () => {
  // Without this, A shares to B on day 13 and B to C on day 26, and a page nobody has re-checked
  // since it was first fetched stays permanently "fresh".
  const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const page = readPage({ kind: "item", title: "Thing", fetchedAt: old }) as { fetchedAt?: string };
  assert.equal(page.fetchedAt, old);
});

test("a stamp from the future is refused, so a peer can't pin a page in our cache", () => {
  const ahead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const page = readPage({ kind: "item", title: "Thing", fetchedAt: ahead }) as { fetchedAt?: string };
  // `undefined` means "we'll stamp our own now" — honest, and at worst it costs one re-fetch.
  assert.equal(page.fetchedAt, undefined);
  assert.equal((readPage({ kind: "item", title: "Thing", fetchedAt: "nonsense" }) as { fetchedAt?: string }).fetchedAt, undefined);
  assert.equal((readPage({ kind: "item", title: "Thing", fetchedAt: 12345 }) as { fetchedAt?: string }).fetchedAt, undefined);
});

test("an item page a peer sent is rebuilt field by field", () => {
  const page = readPage({
    kind: "item",
    title: "Cloak of Wisdom",
    wikiPath: "/Cloak_of_Wisdom",
    card: { title: "Cloak of Wisdom", lines: ["Slot: BACK", "WIS: +10"] },
    sources: [{ kind: "drop", where: "a heretic prophet", detail: "The Feerrott" }],
    components: [{ name: "Silk", qty: 2 }],
    outOfEra: false,
  }) as Record<string, unknown>;

  assert.equal(page.title, "Cloak of Wisdom");
  assert.deepEqual(page.sources, [{ kind: "drop", where: "a heretic prophet", detail: "The Feerrott" }]);
  assert.deepEqual((page.card as { lines: string[] }).lines, ["Slot: BACK", "WIS: +10"]);
  // No stamp offered, so none is kept — the receiver treats that as "arrived now".
  assert.equal(page.fetchedAt, undefined);
});

test("only the kinds the catalogue is made of travel under this kind", () => {
  // Items and recipes are the catalogue; mobs and quests are what give an item its level, so they
  // are in the roster and therefore in the sharing (ADR 0163).
  assert.ok(readPage({ kind: "item", title: "Cloak of Wisdom" }));
  assert.ok(readPage({ kind: "recipe", title: "Aviak Eggs" }), "a recipe is an item page that is craftable");
  assert.ok(readPage({ kind: "quest", title: "Aviak Talons" }), "a quest states its own requirement");
  assert.ok(readPage({ kind: "mob", title: "a gnoll pup" }), "a mob page is read when we have one");
  // A zone page's whole value is its NPC roster — one table, every mob's level.
  const zone = readPage({
    kind: "zone",
    title: "Blackburrow",
    npcs: [{ name: "A Burly Gnoll", level: "7-9" }, { name: "no level" }, "rubbish"],
  }) as { npcs?: { name: string; level: string }[] };
  assert.deepEqual(zone.npcs, [{ name: "A Burly Gnoll", level: "7-9" }], "and rows without both are dropped");
  // Still refused: nothing in the Items tab reads one, and a peer filling a cache nobody asked them
  // to fill is what the list exists to prevent.
  assert.equal(readPage({ kind: "spell", title: "Minor Healing" }), undefined);
  assert.equal(readPage({ kind: "page", title: "Main Page" }), undefined);
});

test("a page with no title, or no kind, is dropped rather than repaired", () => {
  assert.equal(readPage({ kind: "item" }), undefined);
  assert.equal(readPage({ title: "Nameless" }), undefined);
  assert.equal(readPage({ kind: "nonsense", title: "Thing" }), undefined);
  assert.equal(readPage("not an object"), undefined);
});

test("an unknown source kind becomes `unknown`, never itself", () => {
  const page = readPage({
    kind: "item",
    title: "Thing",
    sources: [{ kind: "somethingelse", where: "a mob" }, { kind: "vendor", where: "a merchant" }],
  }) as { sources: { kind: string }[] };
  assert.deepEqual(page.sources.map((s) => s.kind), ["unknown", "vendor"]);
});

test("unknown keys never survive, and lists are capped", () => {
  const page = readPage({
    kind: "item",
    title: "Thing",
    evil: "payload",
    sources: Array.from({ length: 500 }, () => ({ kind: "drop", where: "a mob" })),
    card: { title: "Thing", lines: Array.from({ length: 500 }, (_, i) => `line ${i}`) },
  }) as Record<string, unknown>;
  assert.equal("evil" in page, false);
  assert.ok((page.sources as unknown[]).length <= 60, "sources capped");
  assert.ok(((page.card as { lines: string[] }).lines).length <= 40, "card lines capped");
});

test("one give cannot carry the whole catalogue", () => {
  // A shard is about eleven pages; the cap bounds what a hostile peer can spend of our time.
  const rows = Array.from({ length: 5000 }, (_, i) => ({ kind: "item", title: `Item ${i}` }));
  const give = readGive({ what: "items", rev: 1, shard: 3, rows }, () => "id");
  assert.ok((give?.rows.length ?? 0) <= 64, `got ${give?.rows.length}`);
  assert.equal(give?.shard, 3, "and the shard is echoed back so an answer can't be mis-filed");
});

test("a shard number outside the bitmap is not a shard", () => {
  assert.equal(readAsk({ what: "items", shard: -1 })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: 99999 })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: "3" })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: 3 })?.shard, 3);
});
