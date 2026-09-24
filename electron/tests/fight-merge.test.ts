/**
 * Black-box tests for pooling two provably-overlapping fights into one (`fight-merge.ts`, ADR 0276).
 *
 * The property that matters most: a hit or heal two sources both report is counted **once**, not
 * twice, while one only one side saw is added in rather than dropped — the whole reason a merge is
 * more complete than either log alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFight, type MergeSource } from "../fight-merge";
import { MAX_RECENT_HITS } from "../combat-stats";
import { SELF } from "../../src/shared/combat-parser";
import { shareableHits } from "../../src/shared/peer-share";
import type { FightHeal, FightHit } from "../../src/shared/types";

const T0 = Date.parse("2026-09-03T18:00:00.000Z");
const at = (offsetSec: number): string => new Date(T0 + offsetSec * 1000).toISOString();

function hit(over: Partial<FightHit>): FightHit {
  return { attacker: "Kainos", target: "a gnoll", amount: 10, melee: true, at: at(0), ...over };
}
function heal(over: Partial<FightHeal>): FightHeal {
  return { healer: "Kainos", target: "Kainos`s warder", amount: 10, at: at(0), ...over };
}

test("a hit both sides saw counts once; a hit only one side saw is added in", () => {
  const mine: MergeSource = {
    name: "Kainos",
    hits: [hit({ amount: 20, at: at(0) }), hit({ amount: 15, at: at(2) })],
    heals: [],
  };
  const bran: MergeSource = {
    name: "Bran",
    hits: [
      hit({ attacker: "Bran", amount: 30, at: at(-1) }), // Kainos never saw this one at all
      hit({ amount: 20, at: at(0) }), // the same swing Kainos also saw
      hit({ amount: 15, at: at(2) }), // ditto
      hit({ attacker: "Bran", amount: 25, at: at(3) }),
    ],
    heals: [],
  };

  const merged = mergeFight(mine, [bran]);
  assert.ok(merged);
  const kainos = merged.byCombatant.find((c) => c.name === "Kainos")!;
  const branRow = merged.byCombatant.find((c) => c.name === "Bran")!;
  const gnoll = merged.byCombatant.find((c) => c.name === "a gnoll")!;

  assert.equal(kainos.dealt, 35); // 20 + 15, not doubled by Bran's copy of the same two swings
  assert.equal(branRow.dealt, 55); // 30 + 25 — including the swing only Bran ever saw
  assert.equal(gnoll.taken, 90);
  assert.equal(merged.totalDealt, 90);
  // "Yours" stays yours — a party-mate's damage never inflates it, merged or not.
  assert.equal(merged.yourDealt, 35);
});

test("a matching amount far apart in time is a different swing, not a duplicate", () => {
  const mine: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(0) })], heals: [] };
  const bran: MergeSource = { name: "Bran", hits: [hit({ amount: 20, at: at(30) })], heals: [] };
  const merged = mergeFight(mine, [bran]);
  assert.ok(merged);
  assert.equal(merged.totalDealt, 40); // both kept — 30s apart is not "the same logged moment"
});

test("healing pools the same way damage does", () => {
  const mine: MergeSource = {
    name: "Kainos",
    hits: [hit({ amount: 5, at: at(0) })], // needs at least some damage or there's no fight at all
    heals: [heal({ amount: 8, at: at(1) })],
  };
  const cleric: MergeSource = {
    name: "Bran",
    hits: [],
    heals: [
      heal({ amount: 8, at: at(1) }), // Kainos's own heal, also seen by Bran
      heal({ healer: "Bran", target: "Kainos", amount: 40, at: at(2) }), // Bran healing Kainos
    ],
  };
  const merged = mergeFight(mine, [cleric]);
  assert.ok(merged);
  assert.equal(merged.totalHealed, 48); // 8 (once) + 40
  assert.equal(merged.yourHealed, 8); // only Kainos's own heal counts as "yours"
  // "Yours" is you *and your pet* — Bran's 40 landed on Kainos, and Kainos's own 8 landed on his
  // pet, and both are "received by yours" the same way `yourTaken` already counts pet damage.
  assert.equal(merged.yourHealReceived, 48);
});

test("two of your own hits with the same attacker, target, and amount are both kept", () => {
  // A source's own list is already real, distinct swings — e.g. a fixed-damage weapon striking
  // twice in quick succession. Deduping *within* one source (rather than only across sources)
  // would collapse this into a single swing and silently under-report your own damage.
  const mine: MergeSource = {
    name: "Kainos",
    hits: [hit({ amount: 20, at: at(0) }), hit({ amount: 20, at: at(1) })],
    heals: [],
  };
  const merged = mergeFight(mine, []);
  assert.ok(merged);
  const kainos = merged.byCombatant.find((c) => c.name === "Kainos")!;
  assert.equal(kainos.dealt, 40);
});

test("`mine`'s hits must be resolved from SELF before merging, or a shared swing double-counts", () => {
  // `combat.recentHits()` still says "You" for your own swing (`FightHit`'s own doc) — a peer who
  // saw the same swing never wrote "You", they named you outright. Feeding unresolved hits into
  // `mergeFight` is exactly the bug `ipc.ts`'s `mergedFight()` had: the same event never matches as
  // "the same", so it's added in twice instead of deduped to one.
  const unresolved: MergeSource = {
    name: "Kainos",
    hits: [{ attacker: SELF, target: "a gnoll", amount: 20, melee: true, at: at(0) }],
    heals: [],
  };
  const bran: MergeSource = {
    name: "Bran",
    hits: [hit({ attacker: "Kainos", amount: 20, at: at(0) })], // the same swing, named for real
    heals: [],
  };
  const broken = mergeFight(unresolved, [bran]);
  assert.ok(broken);
  assert.equal(broken.byCombatant.find((c) => c.name === "a gnoll")!.taken, 40); // double-counted

  const resolved: MergeSource = { name: "Kainos", hits: shareableHits(unresolved.hits, "Kainos"), heals: [] };
  const fixed = mergeFight(resolved, [bran]);
  assert.ok(fixed);
  assert.equal(fixed.byCombatant.find((c) => c.name === "a gnoll")!.taken, 20); // counted once
});

test("a peer contributes even a mob's own attack on them, admitted as party rather than a stranger", () => {
  // Proves `recordParty` is actually seeding the replay: without it, `fight-scope.ts` would treat
  // Bran as an unrelated stranger and refuse his exchange with the gnoll entirely (ADR 0067).
  const mine: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(0) })], heals: [] };
  const bran: MergeSource = {
    name: "Bran",
    hits: [hit({ attacker: "a gnoll", target: "Bran", amount: 12, at: at(1) })],
    heals: [],
  };
  const merged = mergeFight(mine, [bran]);
  assert.ok(merged);
  const gnoll = merged.byCombatant.find((c) => c.name === "a gnoll")!;
  assert.equal(gnoll.dealt, 12);
  const branRow = merged.byCombatant.find((c) => c.name === "Bran")!;
  assert.equal(branRow.taken, 12);
});

test("unsettled is recomputed fresh from the replay, not carried over stale from the caller", () => {
  // `local.unsettled` (the caller's own doubt list, built before any merge) is *not* what a reader
  // of the merged breakdown should see: a name doubted only by a miss never reaches `mergeFight` at
  // all (misses aren't replayed — the doc'd gap above), so it could go on being flagged
  // "provisional" for a row that no longer exists in the merged `byCombatant`. The replay's own
  // `unsettled` — built from exactly what it doubts — is what `mergeFight` must hand back instead.
  const mine: MergeSource = {
    name: "Kainos",
    hits: [
      hit({ amount: 20, at: at(0) }), // opens the fight, making the gnoll a recognized enemy
      hit({ attacker: "Zeb", amount: 5, at: at(1) }), // a name nobody's placed — party, pet, or mob
    ],
    heals: [],
  };
  const merged = mergeFight(mine, []);
  assert.ok(merged);
  assert.deepEqual(merged.unsettled, ["Zeb"]);
});

test("startedAt/endedAt are never part of what a merge replaces, even when a peer's hit is earlier", () => {
  // `combat-history.ts`'s `fightKey` identifies a stored fight by exactly these two fields plus its
  // log file, on the assumption that re-reading the same log always reproduces the same boundary.
  // A peer's data is live-only and never lands in that log — so if a merge could shift these, the
  // very next re-read/re-import would key the same real fight differently than history already has
  // it filed under, and file the same fight a second time instead of recognizing the one already there.
  const mine: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(5) })], heals: [] };
  const bran: MergeSource = {
    name: "Bran",
    hits: [hit({ attacker: "Bran", amount: 30, at: at(0) })], // Bran engaged 5s before Kainos did
    heals: [],
  };
  const merged = mergeFight(mine, [bran]);
  assert.ok(merged);
  assert.ok(!("startedAt" in merged));
  assert.ok(!("endedAt" in merged));
});

test("a source at the recent-hits/heals cap is truncated — merging from it is refused, not risked", () => {
  // The cap (`MAX_RECENT_HITS`/`MAX_RECENT_HEALS`, `combat-stats.ts`) is a sliding window: once hit,
  // the *earliest* real hits are already gone from this array. A merge built from it would silently
  // report less damage than the fight actually had — worse than the caller's own complete total.
  const manyHits: FightHit[] = Array.from({ length: MAX_RECENT_HITS }, (_, i) => hit({ amount: 1, at: at(i) }));
  const mine: MergeSource = { name: "Kainos", hits: manyHits, heals: [] };
  const bran: MergeSource = { name: "Bran", hits: [hit({ attacker: "Bran", amount: 30, at: at(-1) })], heals: [] };
  assert.equal(mergeFight(mine, [bran]), null);

  // The same refusal applies when it's a *peer's* copy that's at the cap, not just your own.
  const short: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(0) })], heals: [] };
  const truncatedPeer: MergeSource = { name: "Bran", hits: manyHits, heals: [] };
  assert.equal(mergeFight(short, [truncatedPeer]), null);
});
