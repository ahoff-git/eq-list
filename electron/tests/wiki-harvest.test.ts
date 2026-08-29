/**
 * Black-box tests for the catalogue harvest — the schedule and the sharing, not the network.
 *
 * Every dependency is injected, so this pins the things that actually matter about a long fetch
 * against someone else's server, in milliseconds rather than hours: that it **waits between pages**,
 * **skips what we hold without waiting**, **prefers a peer's copy to a wiki request**, **doesn't
 * duplicate what the room is already doing**, and **stops when told**
 * ([ADR 0153](../decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md),
 * [ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarvester, DEFAULT_GAP_MS, GAP_RANGE, type SavedHarvest } from "../wiki/harvest";
import { emptyCoverage, setShard, shardOf, type PeerCoverage } from "../../src/shared/item-shards";

/**
 * Titles chosen so the fixture is readable: `shardOf` is a hash, so a test that wants "two shards"
 * has to go and find two names that land in different ones rather than assuming they do.
 */
function titlesInDistinctShards(count: number, perShard: number): string[][] {
  const groups = new Map<number, string[]>();
  for (let i = 0; groups.size < count || [...groups.values()].some((g) => g.length < perShard); i++) {
    const title = `Test Item ${i}`;
    const shard = shardOf(title);
    const bucket = groups.get(shard);
    if (bucket) {
      if (bucket.length < perShard) bucket.push(title);
    } else if (groups.size < count) {
      groups.set(shard, [title]);
    }
    if (i > 200_000) throw new Error("could not build the fixture");
  }
  return [...groups.values()].slice(0, count);
}

interface RigOpts {
  roster?: string[];
  held?: string[];
  fail?: string[];
  saved?: SavedHarvest | null;
  peers?: PeerCoverage[];
  /** A peer list that can move with the fake clock — for modelling one that keeps publishing. */
  peersAt?: (now: number) => PeerCoverage[];
  /** What a peer sends back when asked for a shard: the titles it hands over. */
  answers?: Record<number, string[]>;
  myId?: string;
}

function rig(opts: RigOpts = {}) {
  const roster = opts.roster ?? ["A", "B", "C"];
  const held = new Set(opts.held ?? []);
  const fail = new Set(opts.fail ?? []);
  const log = {
    fetched: [] as string[],
    waits: [] as number[],
    asked: [] as { peerId: string; shard: number }[],
    claims: [] as (number | undefined)[],
    saves: [] as SavedHarvest[],
  };
  let saved: SavedHarvest | null = opts.saved ?? null;
  let clock = 0;

  const harvester = createHarvester({
    roster: async () => roster,
    heldTitles: async () => held,
    held: (title) => held.has(title),
    fetch: async (title) => {
      log.fetched.push(title);
      if (fail.has(title)) throw new Error("boom");
      held.add(title);
      return true;
    },
    peers: () => opts.peersAt?.(clock) ?? opts.peers ?? [],
    myId: () => opts.myId ?? "me",
    askPeer: (peerId, shard) => {
      log.asked.push({ peerId, shard });
      // The pages land in the cache through the share hub, not through a reply — so the fake does
      // the same thing: it puts them where `held` reads.
      for (const title of opts.answers?.[shard] ?? []) held.add(title);
    },
    claim: (shard) => log.claims.push(shard),
    load: () => saved,
    save: (state) => {
      saved = state;
      log.saves.push(JSON.parse(JSON.stringify(state)) as SavedHarvest);
    },
    wait: async (ms) => {
      log.waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    onProgress: () => {},
  });
  const settle = async () => {
    for (let i = 0; i < 500; i++) await Promise.resolve();
  };
  return { harvester, log, settle, savedNow: () => saved };
}

test("it fetches the whole roster, with a gap between pages", async () => {
  const { harvester, log, settle } = rig({ roster: ["A", "B", "C"] });
  harvester.start();
  await settle();

  assert.deepEqual([...log.fetched].sort(), ["A", "B", "C"]);
  assert.equal(harvester.status().status, "done");
  assert.equal(harvester.status().fetched, 3);
  // One gap per page fetched. (Which pages share a shard is a hash's business, so the count is what
  // is asserted, not the arrangement.)
  assert.equal(log.waits.filter((w) => w === DEFAULT_GAP_MS).length, 3);
});

test("a page we already hold costs no request and no wait", async () => {
  // The reason running it again next month is reasonable rather than a second three-hour penance.
  const { harvester, log, settle } = rig({ roster: ["A", "B", "C", "D"], held: ["A", "B", "C"] });
  harvester.start();
  await settle();

  assert.deepEqual(log.fetched, ["D"]);
  assert.equal(log.waits.filter((w) => w === DEFAULT_GAP_MS).length, 1);
});

test("a broken page is recorded and the run carries on", async () => {
  const { harvester, log, settle } = rig({ roster: ["A", "B", "C"], fail: ["B"] });
  harvester.start();
  await settle();

  assert.equal(log.fetched.length, 3, "the others were still fetched after B threw");
  assert.equal(harvester.status().failed, 1);
  assert.equal(harvester.status().status, "done");
});

test("nothing is fetched twice, however the run is interrupted", async () => {
  // Resumability comes from the cache rather than a cursor: what we hold is the record of what is
  // done, so a run restarted anywhere picks up correctly.
  const roster = ["A", "B", "C", "D"];
  const first = rig({ roster, held: ["A", "B"] });
  first.harvester.start();
  await first.settle();
  assert.deepEqual([...first.log.fetched].sort(), ["C", "D"]);

  const second = rig({ roster, held: roster, saved: first.savedNow() });
  second.harvester.start();
  await second.settle();
  assert.deepEqual(second.log.fetched, [], "a filled catalogue asks the wiki for nothing at all");
  assert.equal(second.harvester.status().status, "done");
});

test("a shard a peer has is taken from them instead of from the wiki", async () => {
  // The headline: their copy costs the wiki nothing and takes one message.
  const [mine, theirs] = titlesInDistinctShards(2, 2);
  const theirShard = shardOf(theirs[0]);
  const { harvester, log, settle } = rig({
    roster: [...mine, ...theirs],
    peers: [{ peerId: "them", have: setShard(emptyCoverage(), theirShard), at: 0 }],
    answers: { [theirShard]: theirs },
  });
  harvester.start();
  await settle();

  assert.deepEqual(log.asked, [{ peerId: "them", shard: theirShard }]);
  assert.deepEqual([...log.fetched].sort(), [...mine].sort(), "only our own shard cost a request");
  assert.equal(harvester.status().fromPeers, 2, "and the two pages they sent are counted as theirs");
  assert.equal(harvester.status().status, "done");
});

test("a peer who doesn't answer costs one ask, then the wiki", async () => {
  // A catalogue can be a minute stale, and a peer can drop. The run must not stall on either.
  const [only] = titlesInDistinctShards(1, 2);
  const shard = shardOf(only[0]);
  const { harvester, log, settle } = rig({
    roster: only,
    peers: [{ peerId: "silent", have: setShard(emptyCoverage(), shard), at: 0 }],
    answers: {}, // they send nothing back
  });
  harvester.start();
  await settle();

  assert.equal(log.asked.length, 1, "asked once, not in a loop");
  assert.deepEqual([...log.fetched].sort(), [...only].sort(), "and then fetched properly");
  assert.equal(harvester.status().status, "done");
});

test("a shard the room is visibly working on is left alone", async () => {
  const [ours, theirs] = titlesInDistinctShards(2, 1);
  const claimedShard = shardOf(theirs[0]);
  const { harvester, log, settle } = rig({
    roster: [...ours, ...theirs],
    // They hold nothing yet, but they are on it right now — and they keep saying so, which is what
    // a live peer does. (A peer that stops publishing releases its claim; that is the test below.)
    peersAt: (now) => [{ peerId: "them", have: emptyCoverage(), doing: claimedShard, at: now }],
  });
  harvester.start();
  await settle();
  harvester.stop();
  await settle();

  assert.deepEqual(log.fetched, ours, "we did our own shard and left theirs to them");
  assert.equal(log.fetched.includes(theirs[0]), false, "no duplicate pull");
  // And it parked rather than spinning or calling itself finished.
  assert.equal(harvester.status().status, "idle");
});

test("a claim from a peer who has gone quiet is eventually taken over", async () => {
  const [ours, theirs] = titlesInDistinctShards(2, 1);
  const claimedShard = shardOf(theirs[0]);
  const { harvester, log, settle } = rig({
    roster: [...ours, ...theirs],
    // They claimed it and then stopped publishing — crashed, or closed the app mid-shard.
    peers: [{ peerId: "them", have: emptyCoverage(), doing: claimedShard, at: 0 }],
  });
  harvester.start();
  await settle();

  // Their claim expires on the fake clock and the work is picked up rather than abandoned.
  assert.deepEqual([...log.fetched].sort(), [...ours, ...theirs].sort());
  assert.equal(harvester.status().status, "done");
});

test("we announce the shard we're fetching, and release it after", async () => {
  // The claim is what stops somebody else spending eleven requests on the same pages.
  const { harvester, log, settle } = rig({ roster: ["A", "B"] });
  harvester.start();
  await settle();

  assert.ok(log.claims.some((c) => typeof c === "number"), "a shard was claimed");
  assert.equal(log.claims.at(-1), undefined, "and released when the run ended");
});

test("stopping ends the run and leaves it resumable", async () => {
  const roster = ["A", "B", "C", "D", "E"];
  const log: string[] = [];
  let stopped = false;
  const harvester = createHarvester({
    roster: async () => roster,
    heldTitles: async () => new Set<string>(),
    held: (t) => log.includes(t),
    fetch: async (title) => {
      log.push(title);
      if (log.length === 2 && !stopped) {
        stopped = true;
        harvester.stop();
      }
      return true;
    },
    peers: () => [],
    myId: () => "me",
    askPeer: () => {},
    claim: () => {},
    load: () => null,
    save: () => {},
    wait: async () => {},
    now: () => 0,
    onProgress: () => {},
  });
  harvester.start();
  for (let i = 0; i < 500; i++) await Promise.resolve();

  assert.equal(log.length, 2, "the page in flight finished; no other began");
  assert.equal(harvester.status().status, "idle", "idle, not done — so the panel offers Resume");
});

test("a second start while running is a no-op", async () => {
  const { harvester, log, settle } = rig({ roster: ["A", "B", "C"] });
  harvester.start();
  harvester.start();
  harvester.start();
  await settle();
  assert.equal(log.fetched.length, 3, "one run, not three");
});

test("no roster is an error the panel can show, not a run that instantly succeeded", async () => {
  const { harvester, settle } = rig({ roster: [] });
  harvester.start();
  await settle();

  const status = harvester.status();
  assert.equal(status.status, "idle");
  assert.equal(status.total, 0);
  assert.match(status.error ?? "", /item list/i);
});

test("the pace is clamped to something defensible at both ends", async () => {
  const { harvester, log, settle } = rig({ roster: ["A", "B"] });
  harvester.start({ gapMs: 1 }); // "as fast as possible" is not on offer
  await settle();
  assert.ok(log.waits.includes(GAP_RANGE.min));
  assert.equal(log.waits.includes(1), false);
});

test("progress counts what we hold, and where it came from", async () => {
  const [mine, theirs] = titlesInDistinctShards(2, 2);
  const theirShard = shardOf(theirs[0]);
  const { harvester, settle } = rig({
    roster: [...mine, ...theirs],
    peers: [{ peerId: "them", have: setShard(emptyCoverage(), theirShard), at: 0 }],
    answers: { [theirShard]: theirs },
  });
  harvester.start();
  await settle();

  const status = harvester.status();
  assert.equal(status.total, 4);
  assert.equal(status.at, 4, "everything held");
  assert.equal(status.fetched, 2);
  assert.equal(status.fromPeers, 2);
  // The figure that says whether joining a room was worth it.
  assert.equal(status.shards.mine, status.shards.present);
});
