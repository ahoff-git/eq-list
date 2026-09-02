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
  /** A roster that differs per walk, for testing what a re-walk does with what it finds. */
  rosterAt?: (walk: number) => string[];
  /** A walk that was stopped or capped — its answer is used, but not written down as this week's. */
  walkComplete?: boolean;
  /** Whether a peer answering an ask also names that shard's titles, as protocol 3+ does. */
  namesTitles?: boolean;
  /** How many pages the change catch-up reports having invalidated or added. */
  caughtUp?: number;
  /** Candidates the shape offers once the roster is satisfied (ADR 0180). */
  candidates?: string[];
  /** What each candidate turns out to be when probed. Anything unnamed is `other`. */
  verdicts?: Record<string, "item" | "other" | "missing">;
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
    /** Every category walk this run caused — the count that says whether a roster went stale. */
    walks: [] as { gapMs: number }[],
    catchUps: [] as number[],
    notes: [] as string[],
    /** Candidates probed, in order — the shape exploration (ADR 0180). */
    probed: [] as string[],
    /** How many times the candidate set was rebuilt. Once per run, not once per candidate. */
    candidateAsks: 0,
  };
  let saved: SavedHarvest | null = opts.saved ?? null;
  let clock = 0;

  const harvester = createHarvester({
    roster: async (gapMs, note) => {
      log.walks.push({ gapMs });
      note("the item list — 1 categories, 1 items so far");
      const titles = opts.rosterAt?.(log.walks.length) ?? roster;
      return { titles, complete: opts.walkComplete ?? true, categories: ["Category:Items"] };
    },
    candidates: async () => {
      log.candidateAsks += 1;
      return opts.candidates ?? [];
    },
    probe: async (title) => {
      log.probed.push(title);
      const verdict = opts.verdicts?.[title] ?? "other";
      if (verdict === "item") held.add(title);
      return verdict;
    },
    catchUp: async (note) => {
      log.catchUps.push(1);
      note("what changed");
      return opts.caughtUp ?? 0;
    },
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
      // A real `give` names the shard's roster titles beside its pages (ADR 0177), which the hub
      // folds in through `learn`. Modelled here because a bootstrap has nothing *but* that.
      if (opts.namesTitles) harvester.learn(opts.answers?.[shard] ?? []);
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
    onProgress: (p) => {
      if (p.title) log.notes.push(p.title);
    },
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
    // An install that has already walked: with no roster of its own it would bootstrap off the room
    // instead, which is ADR 0181's business and is tested there.
    saved: { ...savedRoster([...mine, ...theirs], 1), fetched: 0 },
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
    saved: { ...savedRoster(only, 1), fetched: 0 }, // already walked, nothing fetched yet
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
    roster: async () => ({ titles: roster, complete: true, categories: [] }),
    catchUp: async () => 0,
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
    saved: { ...savedRoster([...mine, ...theirs], 1), fetched: 0 }, // already walked — see above
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

// ─── The roster is a walk, and it expires (ADR 0177) ─────────────────────────

/** A checkpoint as a previous run would have left it, `listedAt` days ago. */
function savedRoster(roster: string[], listedDaysAgo: number | undefined, now = 0): SavedHarvest {
  const at = new Date(now).toISOString();
  return {
    roster,
    ...(listedDaysAgo === undefined ? {} : { listedAt: new Date(now - listedDaysAgo * 864e5).toISOString() }),
    fetched: roster.length,
    fromPeers: 0,
    failed: [],
    startedAt: at,
    updatedAt: at,
  };
}

test("a fresh roster is reused rather than walked again", async () => {
  // The saving that makes "Resume filling" cheap: ~100 listing requests skipped.
  const { harvester, log, settle } = rig({
    roster: ["A", "B"],
    held: ["A", "B"],
    saved: savedRoster(["A", "B"], 1),
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 0, "a day-old roster is still the item list");
});

test("a roster a week old is walked again, so a new item can ever be found", async () => {
  // The bug this fixes: `start()` took the saved roster whenever there was one, so an install that
  // filled its catalogue in March was still working from March's item list in September. No button
  // passes `restart`, so there was no way out of it at all.
  const { harvester, log, settle, savedNow } = rig({
    held: ["A", "B"],
    saved: savedRoster(["A", "B"], 8),
    rosterAt: () => ["A", "B", "Mistmoore Heirloom Ring"],
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 1, "the week-old roster was re-walked");
  assert.deepEqual(log.fetched, ["Mistmoore Heirloom Ring"], "and the new item was fetched");
  assert.ok(savedNow()?.listedAt, "the walk's date is written down, so the next run needn't repeat it");
});

test("a checkpoint from before rosters had dates re-walks once", async () => {
  const { harvester, log, settle } = rig({
    held: ["A"],
    saved: savedRoster(["A"], undefined),
    rosterAt: () => ["A"],
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 1, "an unknown date reads as stale — the safe way round");
});

test("a re-walk that comes back short keeps what we had", async () => {
  // A truncated or half-failed crawl is far likelier than eleven thousand deletions, and shrinking
  // the roster on one would quietly un-share shards the room depends on.
  const { harvester, settle, savedNow } = rig({
    held: ["A", "B", "C"],
    saved: savedRoster(["A", "B", "C"], 8),
    rosterAt: () => ["A"],
  });
  harvester.start();
  await settle();

  assert.deepEqual([...(savedNow()?.roster ?? [])].sort(), ["A", "B", "C"]);
});

test("a failed walk keeps the old roster rather than throwing the catalogue away", async () => {
  const { harvester, settle, savedNow } = rig({
    held: ["A", "B"],
    saved: savedRoster(["A", "B"], 8),
    rosterAt: () => [],
  });
  harvester.start();
  await settle();

  assert.deepEqual(savedNow()?.roster, ["A", "B"], "a moment offline is not an install that stops filling");
  assert.ok(harvester.status().error, "and it says so");
});

test("the walk honours the pace and says what it is doing", async () => {
  // A hundred seconds of silence before the first page reads as a hang.
  const { harvester, log, settle } = rig({ roster: ["A"] });
  harvester.start({ gapMs: 2000 });
  await settle();

  assert.deepEqual(log.walks, [{ gapMs: 2000 }]);
  assert.ok(
    log.notes.some((n) => n.includes("the item list")),
    "the phase is visible while it runs",
  );
});

// ─── Titles learned from a peer (ADR 0177) ──────────────────────────────────

test("a title a peer names becomes a page we go and fetch", async () => {
  // The point of sharing the roster: one install's walk reaches the room. A title is *not* evidence
  // the page exists — it simply makes the shard incomplete, which is how it becomes work.
  const { harvester, log, settle } = rig({ roster: ["A"], held: ["A"], saved: savedRoster(["A"], 1) });
  harvester.start();
  await settle();
  assert.deepEqual(log.fetched, [], "nothing to do yet");

  const fresh = harvester.learn(["A", "Mistmoore Heirloom Ring"]);
  assert.deepEqual(fresh, ["Mistmoore Heirloom Ring"], "only the one we hadn't heard of");

  harvester.start();
  await settle();
  assert.deepEqual(log.fetched, ["Mistmoore Heirloom Ring"]);
});

test("learning the same title twice adds it once", async () => {
  const { harvester, settle, savedNow } = rig({ roster: ["A"], held: ["A"], saved: savedRoster(["A"], 1) });
  harvester.start();
  await settle();

  harvester.learn(["B"]);
  assert.deepEqual(harvester.learn(["B"]), [], "the second time it is not news");
  assert.deepEqual([...(savedNow()?.roster ?? [])].sort(), ["A", "B"]);
});

test("an install with no roster learns nothing, and that is deliberate", async () => {
  // A roster invented out of a peer message would make `hasRoster` true on an install that has never
  // listed anything — the ignorance ADR 0176 relies on being able to tell apart from emptiness.
  const { harvester } = rig({ saved: null });
  assert.deepEqual(harvester.learn(["Rusty Axe"]), []);
});

test("a walk that was stopped is used but not written down as this week's answer", async () => {
  // Otherwise one press of Stop during the roster phase freezes a half-walked item list for a week —
  // and a short roster is the failure that hides itself.
  const { harvester, log, settle, savedNow } = rig({
    held: ["A", "B"],
    saved: savedRoster(["A", "B"], 8),
    rosterAt: () => ["A", "B", "C"],
    walkComplete: false,
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 1);
  assert.ok(savedNow()?.roster.includes("C"), "what it did reach is still used");

  const listedAt = savedNow()?.listedAt;
  harvester.start();
  await settle();
  assert.equal(savedNow()?.listedAt, listedAt, "the date didn't move");
  assert.equal(log.walks.length, 2, "so the next run walks again");
});

test("a first walk that was stopped leaves no date, so the next run finishes the job", async () => {
  const { harvester, log, settle, savedNow } = rig({
    saved: null,
    held: ["A"],
    rosterAt: () => ["A"],
    walkComplete: false,
  });
  harvester.start();
  await settle();

  assert.equal(savedNow()?.listedAt, undefined);
  harvester.start();
  await settle();
  assert.equal(log.walks.length, 2);
});

/**
 * `rosterExpired` is what the room-fill tick asks, and it is the only way the weekly walk is ever
 * reached on an install nobody clicks (ADR 0177's "whenever a run begins" — ADR 0176 is what begins
 * one). Worth pinning separately from `start`, because a filled install never gets as far as `start`.
 */
test("a week-old roster reports itself expired, and a fresh one doesn't", () => {
  const fresh = rig({ roster: ["A"], held: ["A"], saved: savedRoster(["A"], 1) });
  assert.equal(fresh.harvester.rosterExpired(), false);

  const old = rig({ roster: ["A"], held: ["A"], saved: savedRoster(["A"], 8) });
  assert.equal(old.harvester.rosterExpired(), true);
});

test("no roster at all is not the same as a stale one", () => {
  // Nothing to refresh, and a first walk is somebody else's decision — the distinction ADR 0176
  // depends on being able to make. Reporting `true` here would have a fresh install walk the
  // category graph on a timer before it had any reason to.
  const { harvester } = rig({ roster: ["A"], held: [] });
  assert.equal(harvester.rosterExpired(), false);
});

// ─── The wiki says what changed (ADR 0179) ──────────────────────────────────

test("every run asks what changed, even when the roster is fresh", async () => {
  // An edit is news at any time, where a new page is only news weekly — so the catch-up runs on
  // every start while the walk runs only when the roster has expired.
  const { harvester, log, settle } = rig({
    held: ["A", "B"],
    saved: savedRoster(["A", "B"], 1),
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 0, "the roster was fresh");
  assert.equal(log.catchUps.length, 1, "but we still asked what changed");
  assert.ok(log.notes.includes("what changed"), "and said so while doing it");
});

test("a catch-up that fails does not stop the run", async () => {
  // Nine requests is a cheap optimisation, and a cheap optimisation must not become a single point
  // of failure for a crawl that has a roster and plenty to do without it.
  const roster = ["A", "B", "C"];
  const fetched: string[] = [];
  const harvester = createHarvester({
    roster: async () => ({ titles: roster, complete: true, categories: [] }),
    catchUp: async () => {
      throw new Error("recentchanges is down");
    },
    heldTitles: async () => new Set<string>(),
    held: (t) => fetched.includes(t),
    fetch: async (title) => (fetched.push(title), true),
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

  assert.deepEqual([...fetched].sort(), ["A", "B", "C"]);
  assert.equal(harvester.status().status, "done");
});

test("the walk's categories are kept, so a new page can be judged by them", async () => {
  // The incremental path has to apply the *same* definition the walk did, or "is this new title
  // ours?" becomes a second rule free to drift from the first.
  const { harvester, settle, savedNow } = rig({ saved: null, roster: ["A"], held: ["A"] });
  harvester.start();
  await settle();

  assert.deepEqual(savedNow()?.categories, ["Category:Items"]);
});

// ─── The wiki has a shape, and it moves (ADR 0180) ───────────────────────────

test("exploring happens only once the roster is satisfied", async () => {
  // The priority that makes this safe to run at all: a guess at what might exist is worth less than
  // a page the roster says is missing, so every candidate waits until the shard work is done.
  const { harvester, log, settle } = rig({
    roster: ["A", "B", "C"],
    candidates: ["Mistmoore Heirloom Ring"],
  });
  harvester.start();
  await settle();

  assert.deepEqual([...log.fetched].sort(), ["A", "B", "C"], "the roster is still fetched in full");
  assert.deepEqual(log.probed, ["Mistmoore Heirloom Ring"]);
  // The roster's pages come first: the probe is the last thing that happened.
  assert.equal(harvester.status().status, "done");
});

test("a candidate that turns out to be an item joins the roster", async () => {
  // And joins it through `learn`, the same door a peer's titles come through — so it shards, travels
  // and expires like any other title, with nothing downstream taught where it came from.
  const { harvester, log, settle, savedNow } = rig({
    roster: ["A"],
    held: ["A"],
    candidates: ["Mistmoore Heirloom Ring", "Some Faction"],
    verdicts: { "Mistmoore Heirloom Ring": "item" },
  });
  harvester.start();
  await settle();

  assert.deepEqual(log.probed.sort(), ["Mistmoore Heirloom Ring", "Some Faction"]);
  assert.ok(savedNow()?.roster.includes("Mistmoore Heirloom Ring"), "the discovery is in the roster");
  assert.ok(!savedNow()?.roster.includes("Some Faction"), "the dead end is not");
  // `found` is already the number for "an item we had no record of", whether a walk, a peer or this
  // turned it up — so a discovery counts there rather than inventing a second figure.
  assert.equal(harvester.status().found, 1);
});

test("the candidate set is built once a run, not once a candidate", async () => {
  // It is a set subtraction over a few thousand titles. Doing it per page would make the cheap half
  // of this feature the expensive half.
  const { harvester, log, settle } = rig({
    roster: ["A"],
    held: ["A"],
    candidates: ["One", "Two", "Three"],
  });
  harvester.start();
  await settle();

  assert.equal(log.probed.length, 3);
  assert.equal(log.candidateAsks, 1);
});

test("every candidate is paced like a page, and a run with none is simply done", async () => {
  const paced = rig({ roster: ["A"], held: ["A"], candidates: ["One", "Two"] });
  paced.harvester.start();
  await paced.settle();
  // Two probes, two gaps: exploring is not a way round the rate limit.
  assert.equal(paced.log.waits.length, 2);

  const none = rig({ roster: ["A"], held: ["A"] });
  none.harvester.start();
  await none.settle();
  assert.equal(none.log.probed.length, 0);
  assert.equal(none.harvester.status().status, "done");
});

// ─── A new install asks before it crawls (ADR 0181) ─────────────────────────

test("a first run with peers in the room takes its roster from them, not from a walk", async () => {
  // The walk is 194 requests and three minutes before the first page, all of it re-deriving a list
  // the room is already holding. With nothing of our own and somebody there, we ask instead.
  const titles = titlesInDistinctShards(1, 3)[0];
  const shard = shardOf(titles[0]);
  const { harvester, log, settle, savedNow } = rig({
    roster: ["should-not-be-walked"],
    peers: [{ peerId: "them", have: setShard(emptyCoverage(), shard), at: 0 }],
    answers: { [shard]: titles },
    namesTitles: true,
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 0, "no category walk happened");
  assert.ok(log.asked.length > 0, "the room was asked");
  assert.deepEqual([...savedNow()!.roster].sort(), [...titles].sort(), "and the roster came from them");
});

test("a roster taken from the room is never written down as walked", async () => {
  // The room is a fast start, not a substitute for the wiki. Leaving `listedAt` unset is what brings
  // us back to walk it properly (ADR 0179's `rosterExpired`), so the catalogue is not capped at
  // whatever the room happened to know.
  const titles = titlesInDistinctShards(1, 3)[0];
  const shard = shardOf(titles[0]);
  const { harvester, settle, savedNow } = rig({
    peers: [{ peerId: "them", have: setShard(emptyCoverage(), shard), at: 0 }],
    answers: { [shard]: titles },
    namesTitles: true,
  });
  harvester.start();
  await settle();

  assert.equal(savedNow()?.listedAt, undefined, "not written down as this week's answer");
  assert.equal(harvester.rosterExpired(), true, "so a walk is still owed");
});

test("an empty room is still crawled, exactly as before", async () => {
  // The gate is that somebody is *there with something*. Alone, nothing about this changes.
  const { harvester, log, settle } = rig({ roster: ["A", "B"] });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 1, "no peers, so the walk happens");
  assert.deepEqual([...log.fetched].sort(), ["A", "B"]);
});

test("a peer who holds nothing is not a reason to skip the walk", async () => {
  // Another new install is not a source. Two of them must not sit there each waiting for the other.
  const { harvester, log, settle } = rig({
    roster: ["A", "B"],
    peers: [{ peerId: "them", have: emptyCoverage(), at: 0 }],
  });
  harvester.start();
  await settle();

  assert.equal(log.walks.length, 1);
});

test("a room that turns out to have nothing to give is crawled after all", async () => {
  // The failure this guards against: peers too old to send titles, or that drop mid-run. Asking
  // first is the point, but a bootstrap that ends empty has produced nothing — so the walk we
  // skipped happens in the same run rather than leaving a new install with no catalogue.
  const shard = shardOf("A");
  const { harvester, log, settle, savedNow } = rig({
    roster: ["A", "B"],
    peers: [{ peerId: "silent", have: setShard(emptyCoverage(), shard), at: 0 }],
    answers: {}, // they answer with nothing — protocol 2, or simply gone
    namesTitles: true,
  });
  harvester.start();
  await settle();

  assert.ok(log.asked.length > 0, "we asked first");
  assert.equal(log.walks.length, 1, "and then walked when that produced nothing");
  assert.deepEqual([...savedNow()!.roster].sort(), ["A", "B"]);
  assert.deepEqual([...log.fetched].sort(), ["A", "B"], "the run finished the job");
});
