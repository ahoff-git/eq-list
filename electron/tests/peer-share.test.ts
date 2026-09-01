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
import type { ShareDelivery, ShareKind } from "../../src/shared/peer-share";
import type { KillRecord } from "../../src/shared/types";
import {
  SAME_SPAWN_MS,
  compareScores,
  mergeBuffs,
  mergeTimers,
  newlyOffered,
  offerSummary,
  outOfDate,
  PROTOCOL_UNSTATED,
  SHARE_KINDS,
  SHARE_PROTOCOL,
  readAsk,
  readGive,
  readProtocol,
  shareableKills,
  shareableRespawns,
  versionStanding,
  readOffer,
  shareKind,
  shareableBuffs,
  sharing,
  type PeerTimer,
} from "../../src/shared/peer-share";
import { ON_PET, ON_YOU, type BuffInstance } from "../../src/shared/buff-tracking";
import type { SpawnTimer } from "../../src/shared/spawn-timers";
import type { HighScore } from "../../src/shared/types";
/**
 * The rows of a **whole** `give` — what almost every reader test is asserting on.
 *
 * `readGive` answers a discriminated union now that a `give` may also be a delta, and a test that
 * sent whole rows wants to say so once rather than narrow at every assertion. It asserts the mood as
 * well as returning the rows, so a reader that quietly started answering `unchanged` fails here
 * rather than further down as an empty list.
 */
function wholeRows(give: ShareDelivery | null): unknown[] {
  assert.ok(give, "expected a give");
  assert.equal(give.mode, "whole");
  return give.mode === "whole" ? give.rows : [];
}


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
  assert.equal(unchanged?.mode, "unchanged");
  // An empty list means "I now hold none", which `contributions.ts` treats as an un-share that
  // keeps what it taught (ADR 0056). Collapsing the two would silently freeze a peer's tally.
  const emptied = readGive({ what: "mobs", rev: 5, rows: [] }, ids());
  assert.deepEqual(wholeRows(emptied), []);
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
  assert.deepEqual(wholeRows(give), [{ zone: "Blackburrow", mob: "a gnoll", y: 100, x: -50, confidence: 0.9 }]);
});

test("a confidence outside 0–1 is clamped rather than believed", () => {
  const give = readGive(
    { what: "kills", rev: 1, rows: [{ zone: "z", mob: "m", y: 1, x: 1, confidence: 99 }] },
    ids(),
  );
  assert.equal((wholeRows(give)[0] as { confidence: number }).confidence, 1);
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
  assert.equal(wholeRows(give).length, 1);
  assert.equal((wholeRows(give)[0] as { key: string }).key, "k2");
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
  const entry = wholeRows(give)[0] as Record<string, unknown>;
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
  const style = (wholeRows(give)[0] as { style: Record<string, unknown> }).style;
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
  assert.equal(wholeRows(give).length, 1);
  assert.equal((wholeRows(give)[0] as BuffInstance).target, "Kainos");
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
  return wholeRows(give)[0];
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
  assert.ok(wholeRows(give).length <= 64, `got ${wholeRows(give).length}`);
  assert.equal(give?.shard, 3, "and the shard is echoed back so an answer can't be mis-filed");
});

test("a shard number outside the bitmap is not a shard", () => {
  assert.equal(readAsk({ what: "items", shard: -1 })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: 99999 })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: "3" })?.shard, undefined);
  assert.equal(readAsk({ what: "items", shard: 3 })?.shard, 3);
});

// ─── Identity, projection, and deltas ───────────────────────────────────────

test("what leaves a kill is where it was, and only for kills we can place and did not borrow", () => {
  const kill = (over: Partial<KillRecord>): KillRecord =>
    ({ id: "k", logId: 1, at: iso(0), mob: "a gnoll", zone: "Blackburrow", y: 10, x: 20, confidence: 0.9, ...over }) as KillRecord;

  const out = shareableKills([
    kill({}),
    // Somebody else's, which would echo round a room of three for ever.
    kill({ sharedBy: "Bran" }),
    // Nothing a receiver could draw.
    kill({ y: undefined, x: undefined }),
    kill({ confidence: 0.05 }),
    // No zone means no map to put it on.
    kill({ zone: undefined }),
  ]);
  assert.deepEqual(out, [{ zone: "Blackburrow", y: 10, x: 20, mob: "a gnoll", confidence: 0.9 }]);
});

test("a shared respawn is the conclusion, never the evidence behind it", () => {
  const [out] = shareableRespawns([
    {
      key: "k",
      mob: "a named",
      place: "Blackburrow",
      shortestSeconds: 300,
      longestSeconds: 900,
      samples: 4,
      lastKillAt: iso(0),
      // Neither of these may cross: one is the workings, the other is a count of what *our* rule
      // threw out, which would be a sentence about a night the receiver never sat through.
      gaps: [{ seconds: 300, at: iso(0) }],
      crossedDifficulty: 2,
      notify: true,
    } as unknown as Parameters<typeof shareableRespawns>[0][number],
  ]);
  assert.deepEqual(Object.keys(out).sort(), ["key", "lastKillAt", "longestSeconds", "mob", "place", "samples", "shortestSeconds"]);
});

test("every kind's key survives the crossing — the sender's key and the receiver's agree", () => {
  // **The invariant the whole delta protocol rests on.** A `gone` names a row by key with no row
  // attached, and a whole answer's keys are only a hint a receiver may have to re-derive. If a key
  // computed here and a key computed after `read` could differ, a delta would file updates as new
  // rows and deletions would silently miss — so every `rowKey` reads what the row *says* rather than
  // an id, and this is what pins that.
  // `watches` is absent on purpose — it states no identity, and the test below says why.
  const samples: Partial<Record<ShareKind, unknown>> = {
    styles: { name: "Loud", style: {} },
    lists: { id: "theirs", name: "Fungi Staff", needed: 2, origin: { kind: "quest", name: "A Quest" } },
    pins: { id: "theirs", kind: "camp", zone: "Blackburrow", y: 1, x: 2, title: "Camp" },
    mobs: { mob: "a gnoll", zone: "Blackburrow", kills: 3, drops: {}, copper: 0, lastAt: iso(0) },
    kills: { zone: "Blackburrow", mob: "a gnoll", y: 10, x: 20, confidence: 0.9 },
    respawns: { key: "camp-key", mob: "a named", place: "Blackburrow", samples: 2, shortestSeconds: 300 },
    timers: { id: "camp-key#2", key: "camp-key", mob: "a named", place: "Blackburrow", killedAt: iso(0), dueAt: iso(600), startAt: iso(600), source: "killed" },
    buffs: { key: "spell-key", spell: "Haste", target: "Kainos", up: true, at: iso(0), since: iso(0), source: "cast", byYou: true },
    scores: { categoryId: "biggest-hit", value: 900, at: iso(0), beaten: 1 },
  };

  for (const [kind, row] of Object.entries(samples)) {
    const spec = shareKind(kind)!;
    const sent = spec.rowKey?.(row);
    assert.ok(sent, `${kind} states an identity`);
    const give = readGive({ what: kind, rev: 1, rows: [row] }, ids());
    const received = wholeRows(give);
    assert.equal(received.length, 1, `${kind} survived its own reader`);
    assert.equal(spec.rowKey?.(received[0]), sent, `${kind}: the key means the same on both sides`);
  }
});

test("a delta's rows are checked exactly as hard as a whole set's", () => {
  const give = readGive(
    {
      what: "kills",
      rev: 4,
      epoch: "run-1",
      changes: [
        { k: "good", r: { zone: "Blackburrow", mob: "a gnoll", y: 1, x: 2, confidence: 0.9 } },
        // Off the edge of the world — refused here as it would be in a whole set.
        { k: "impossible", r: { zone: "Blackburrow", mob: "a gnoll", y: 1e9, x: 0, confidence: 0.9 } },
        // No key is no row: a change nothing can be filed under is not a change.
        { r: { zone: "Blackburrow", mob: "a bat", y: 3, x: 4, confidence: 0.9 } },
      ],
      gone: ["one that left", ""],
    },
    ids(),
  );
  assert.equal(give?.mode, "delta");
  assert.ok(give && give.mode === "delta");
  assert.deepEqual(give.changes.map((c) => c.key), ["good"]);
  assert.deepEqual(give.gone, ["one that left"], "an empty key names nothing");
});

test("a delta that cannot say which run it belongs to is not applied", () => {
  // Without an epoch there is no telling what it is a delta *of*, and applying it would leave two
  // installs disagreeing quietly. Read as "nothing changed", which the reconciliation tick undoes.
  const give = readGive({ what: "mobs", rev: 9, changes: [{ k: "a", r: {} }] }, ids());
  assert.equal(give?.mode, "unchanged");
});

test("a catalogue line keeps the fields the room coordinates with", () => {
  // `cover` and `doing` are ADR 0160's whole coordination channel, and `epoch` is what makes a
  // revision comparable. This reader used to drop all three, which is why the hub had grown a second
  // one that checked nothing.
  const offer = readOffer({
    items: { n: 100, rev: 3, cover: "ff00", doing: 7, epoch: "run-1" },
    mobs: { n: 5, rev: 2, cover: "not hex", doing: 99_999 },
    watches: { n: "lots", rev: 1 },
  });
  assert.deepEqual(offer.items, { n: 100, rev: 3, cover: "ff00", doing: 7, epoch: "run-1" });
  assert.deepEqual(offer.mobs, { n: 5, rev: 2 }, "a coverage that isn't hex and a shard out of range are dropped");
  assert.equal("watches" in offer, false, "a count that isn't a number is not a catalogue line");
});

test("a kind with no identity of its own says so, rather than inventing a fragile one", () => {
  // A rule is its whole content — no name, and an id that is regenerated on arrival. Claiming a key
  // built out of every field would only duplicate the content digest the hub already falls back to,
  // while adding a way to disagree with `readWatch`'s clamping. Absent is the honest answer, and the
  // hub handles it: keys travel on the wire rather than being re-derived on the far side.
  assert.equal(shareKind("watches")?.rowKey, undefined);
  // Every other kind does name its rows, because each of them has something stable to name them by.
  for (const spec of SHARE_KINDS) {
    if (spec.key === "watches") continue;
    assert.equal(typeof spec.rowKey, "function", `${spec.key} states an identity`);
  }
});

// ─── Which build is speaking ────────────────────────────────────────────────

test("a peer that names no protocol is the one every build before this spoke", () => {
  // "Didn't say" and "said 1" describe the same client, and having one answer for both is what keeps
  // the comparison from needing a special case everywhere it is made.
  assert.equal(readProtocol({}), PROTOCOL_UNSTATED);
  assert.equal(readProtocol({ protocol: 1 }), PROTOCOL_UNSTATED);
  assert.equal(readProtocol(null), PROTOCOL_UNSTATED);
  assert.equal(readProtocol({ protocol: "two" }), PROTOCOL_UNSTATED);
  // A number below the floor describes a protocol that never existed.
  assert.equal(readProtocol({ protocol: 0 }), PROTOCOL_UNSTATED);
  assert.equal(readProtocol({ protocol: -5 }), PROTOCOL_UNSTATED);
  // One above ours is kept as stated: it is the whole case this exists for.
  assert.equal(readProtocol({ protocol: 99 }), 99);
});

test("a build only compares as older or newer, and says nothing when it matches", () => {
  assert.equal(versionStanding(SHARE_PROTOCOL), "same");
  assert.equal(versionStanding(SHARE_PROTOCOL + 1), "newer");
  assert.equal(versionStanding(PROTOCOL_UNSTATED, 2), "older");
  // Undefined is "they haven't said", which the row treats as unknown rather than as old — but the
  // comparison itself has to answer something, and the oldest protocol is the honest floor.
  assert.equal(versionStanding(undefined, 1), "same");
});

test("the protocol is a hand-bumped number, not the app version", () => {
  // The reasoning `data-provenance.ts` spells out: CI stamps a build number into every push, so
  // comparing app versions would tell everyone they were incompatible with everyone, always. Pinned
  // so a future change to compare something automatic has to argue with this line first.
  assert.equal(typeof SHARE_PROTOCOL, "number");
  assert.ok(Number.isInteger(SHARE_PROTOCOL) && SHARE_PROTOCOL >= PROTOCOL_UNSTATED);
});
