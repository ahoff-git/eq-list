/**
 * Black-box tests for dividing the catalogue between a room
 * ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)).
 *
 * Two properties carry the whole feature, and both are pinned here rather than argued about:
 *
 *  - **A shard is a property of the title**, so two installs that never speak still agree about
 *    which shard anything is in. If this ever stops being true, peers start claiming to hold shards
 *    whose contents they do not share, and the room quietly loses pages.
 *  - **Two peers with the same information pick different work.** Without that, every peer sorts the
 *    gaps identically, all take the lowest, and the room fetches one shard N times and the rest
 *    never — which is the exact duplication this exists to prevent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_TTL_MS,
  SHARD_COUNT,
  coverageOf,
  countShards,
  decodeCoverage,
  emptyCoverage,
  encodeCoverage,
  hasShard,
  planShardStep,
  roomCoverage,
  setShard,
  shardOf,
  type PeerCoverage,
} from "../../src/shared/item-shards";

const NAMES = ["Rusty Short Sword", "Cloak of Wisdom", "Dragoon Dirk", "Aviak Talon", "Water Flask"];

test("a title's shard is a property of the title, not of any roster", () => {
  for (const name of NAMES) {
    const shard = shardOf(name);
    assert.ok(Number.isInteger(shard) && shard >= 0 && shard < SHARD_COUNT);
    // The same answer every time it is asked, which is what two installs rely on.
    assert.equal(shardOf(name), shard);
  }
});

test("the fold is case, spacing and padding — and nothing else", () => {
  // A peer that trimmed differently would disagree about shards with everyone else.
  assert.equal(shardOf("Rusty Short Sword"), shardOf("  rusty   short sword  "));
  assert.equal(shardOf("RUSTY SHORT SWORD"), shardOf("Rusty Short Sword"));
  // …but a genuinely different name is a different title, grade included.
  assert.notEqual(shardOf("Dragoon Dirk"), shardOf("Dragoon Dirk +2"));
});

test("eleven thousand titles spread over the shards rather than piling up", () => {
  // A hash that clumped would put half the catalogue in one message and defeat the whole scheme.
  const titles = Array.from({ length: 11_136 }, (_, i) => `Item Number ${i}`);
  const counts = new Map<number, number>();
  for (const t of titles) counts.set(shardOf(t), (counts.get(shardOf(t)) ?? 0) + 1);
  assert.ok(counts.size > SHARD_COUNT * 0.95, `only ${counts.size} shards used`);
  const biggest = Math.max(...counts.values());
  // ~11 per shard on average; anything near a hundred would mean a message too big to send.
  assert.ok(biggest < 40, `worst shard holds ${biggest}`);
});

test("coverage survives the round trip, and rubbish decodes to nothing held", () => {
  const cover = coverageOf(NAMES);
  assert.equal(countShards(cover), new Set(NAMES.map(shardOf)).size);
  assert.deepEqual(decodeCoverage(encodeCoverage(cover)), cover);
  // Untrusted input: a peer's malformed bitmap must read as "they have nothing", never throw.
  assert.equal(countShards(decodeCoverage("not hex")), 0);
  assert.equal(countShards(decodeCoverage(undefined)), 0);
  assert.equal(countShards(decodeCoverage(12345)), 0);
});

/** A room where `present` is the first `n` shards, for readable fixtures. */
function firstShards(n: number) {
  const cover = emptyCoverage();
  for (let i = 0; i < n; i++) setShard(cover, i);
  return cover;
}

const peer = (peerId: string, have: number[], extra: Partial<PeerCoverage> = {}): PeerCoverage => {
  const cover = emptyCoverage();
  for (const s of have) setShard(cover, s);
  return { peerId, have: cover, at: 1000, ...extra };
};

test("a shard a peer already has is asked for, never fetched", () => {
  // The whole point: their copy costs the wiki nothing and takes one message.
  const step = planShardStep({
    mine: emptyCoverage(),
    present: firstShards(4),
    peers: [peer("them", [2])],
    myId: "me",
    now: 1000,
  });
  assert.deepEqual(step, { action: "ask", shard: 2, from: "them" });
});

test("with nobody to ask, it fetches — and the room spreads out unprompted", () => {
  const present = firstShards(64);
  const pick = (myId: string) => {
    const step = planShardStep({ mine: emptyCoverage(), present, peers: [], myId, now: 1000 });
    assert.equal(step.action, "fetch");
    return (step as { shard: number }).shard;
  };

  // One peer's order is its own and never wobbles: the same install asked twice does the same thing.
  assert.equal(pick("peer-a"), pick("peer-a"));

  // The property that matters is the *spread*, not that any particular pair differs — with 64
  // candidates two ids collide about 1.6% of the time, and that is fine: a collision costs one
  // duplicated shard (~11 pages), and the claims published on the next catalogue tick break the tie.
  // What would be fatal is every peer agreeing, which is what a shared sort order produces.
  const picks = new Set(Array.from({ length: 30 }, (_, i) => pick(`peer-${i}`)));
  assert.ok(picks.size > 15, `30 peers chose only ${picks.size} distinct shards`);
});

test("a peer's live claim is left alone", () => {
  const present = firstShards(2);
  const mine = emptyCoverage();
  setShard(mine, 0); // we hold shard 0, so shard 1 is the only gap…
  const step = planShardStep({
    mine,
    present,
    peers: [peer("them", [], { doing: 1, at: 1000 })], // …and they are on it
    myId: "me",
    now: 1000,
  });
  // Waiting is the point. Fetching it anyway is the duplicate the feature exists to stop.
  assert.deepEqual(step, { action: "wait" });
});

test("a claim from a peer who has gone quiet expires", () => {
  const present = firstShards(2);
  const mine = emptyCoverage();
  setShard(mine, 0);
  const step = planShardStep({
    mine,
    present,
    peers: [peer("them", [], { doing: 1, at: 1000 })],
    myId: "me",
    now: 1000 + CLAIM_TTL_MS + 1,
  });
  // A peer that crashed mid-shard must not reserve it for ever.
  assert.deepEqual(step, { action: "fetch", shard: 1 });
});

test("a peer who won't answer stops being asked and the shard is fetched instead", () => {
  const opts = {
    mine: emptyCoverage(),
    present: firstShards(1),
    peers: [peer("silent", [0])],
    myId: "me",
    now: 1000,
  };
  assert.deepEqual(planShardStep(opts), { action: "ask", shard: 0, from: "silent" });
  // Once we've asked and heard nothing, the same ask must not repeat for ever — it falls through to
  // the wiki, which is slower but always works.
  assert.deepEqual(planShardStep({ ...opts, asked: () => true }), { action: "fetch", shard: 0 });
});

test("the peer holding the most is asked first", () => {
  // Not fairness: a peer far along is the one most likely to still be there for the next ask, and
  // one shard each from eight peers is eight round trips for eight shards.
  const step = planShardStep({
    mine: emptyCoverage(),
    present: firstShards(8),
    peers: [peer("small", [7]), peer("big", [1, 2, 3, 4])],
    myId: "me",
    now: 1000,
  });
  assert.equal((step as { from: string }).from, "big");
});

test("a shard the roster doesn't touch is not a gap", () => {
  // Only shards our own roster has titles in can ever be filled; the rest are not missing.
  const present = firstShards(3);
  const mine = firstShards(3);
  assert.deepEqual(planShardStep({ mine, present, peers: [], myId: "me", now: 1000 }), { action: "done" });
});

test("the room's coverage is what the panel leads with", () => {
  const present = firstShards(10);
  const mine = emptyCoverage();
  for (const s of [0, 1]) setShard(mine, s);
  const counts = roomCoverage({ mine, present, peers: [peer("them", [2, 3, 4]), peer("other", [4, 5])] });
  assert.equal(counts.present, 10);
  assert.equal(counts.mine, 2);
  // "The room has 6 of 10" is a different and much more useful fact than "you have 2".
  assert.equal(counts.room, 6);
});

test("a peer holding shards our roster doesn't have can't inflate the figures", () => {
  const present = firstShards(3);
  const counts = roomCoverage({ mine: emptyCoverage(), present, peers: [peer("them", [900, 901])] });
  assert.equal(counts.room, 0);
});

test("hasShard refuses an out-of-range index rather than reading past the bitmap", () => {
  const cover = coverageOf(NAMES);
  assert.equal(hasShard(cover, -1), false);
  assert.equal(hasShard(cover, SHARD_COUNT), false);
  assert.equal(hasShard(cover, SHARD_COUNT + 5000), false);
});
