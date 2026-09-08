/**
 * Black-box tests for formatting a player's own kills as text worth pasting into eqlwiki.
 *
 * The reconciliation itself is `drop-truth.ts`'s job and is tested there; these tests pin the
 * *wording* — which sections appear when, and that only `myKills`/`myCount` ever reach the page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWikiContribution, type WikiContributionInput } from "../../src/shared/wiki-contribution";
import type { MobKnowledge } from "../../src/shared/mob-stats";

const AT = "2026-09-08T20:00:00.000Z";

function zone(over: Partial<MobKnowledge> = {}): Pick<MobKnowledge, "zone" | "myKills" | "drops"> {
  return { zone: "Lower Guk", myKills: 20, drops: [], ...over };
}

const base: WikiContributionInput = {
  mob: "a decaying skeleton",
  character: "Kainos",
  at: AT,
  wikiDrops: {},
  zones: [zone()],
};

test("no kills at all says so plainly rather than an empty page", () => {
  const text = buildWikiContribution({ ...base, zones: [zone({ myKills: 0 })] });
  assert.match(text, /No kills recorded yet/);
});

test("a drop the wiki has never heard of becomes a suggested transclusion line", () => {
  const zones = [zone({ myKills: 20, drops: [{ item: "Bone Chips", count: 5, rate: 0.25, myCount: 5 }] })];
  const text = buildWikiContribution({ ...base, wikiDrops: {}, zones });
  assert.match(text, /=== Drops not currently on the page ===/);
  assert.match(text, /\{\{:Bone Chips\}\} — seen 5 of 20 kills \(25%\)/);
  // Never the wiki's own structured `.ddb` box or a rarity word — this app has no way to assign
  // either correctly, and inventing one would be a fabricated citation.
  assert.doesNotMatch(text, /drare|ddb|\[\d+\]/);
});

test("a listed drop never seen in enough kills is flagged, not asserted as wrong", () => {
  const zones = [zone({ myKills: 30, drops: [] })];
  const text = buildWikiContribution({ ...base, wikiDrops: { "Rusty Dagger": "4.7%" }, zones });
  assert.match(text, /=== Listed, but not confirmed in these kills ===/);
  assert.match(text, /Rusty Dagger — the page says 4\.7%; not seen in 30 kills/);
});

test("a drop that matches the wiki's own listing raises neither section", () => {
  const zones = [zone({ myKills: 20, drops: [{ item: "Bone Chips", count: 5, rate: 0.25, myCount: 5 }] })];
  const text = buildWikiContribution({ ...base, wikiDrops: { "Bone Chips": "20%" }, zones });
  assert.doesNotMatch(text, /=== Drops not currently on the page ===/);
  assert.doesNotMatch(text, /=== Listed, but not confirmed/);
  assert.match(text, /Nothing here differs from what the page already says\./);
});

test("only your own kills and your own share of a count ever reach the text", () => {
  // A zone pooled with peers: 50 kills total, 10 of them yours; the item dropped 25 times total,
  // 3 of them for you. If a peer's count leaked in, this would read "seen 25 of 50".
  const zones = [
    zone({
      myKills: 10,
      drops: [{ item: "Rare Gem", count: 25, rate: 0.5, myCount: 3 }],
    }),
  ];
  const text = buildWikiContribution({ ...base, wikiDrops: {}, zones });
  assert.match(text, /seen 3 of 10 kills/);
  assert.doesNotMatch(text, /25 of 50/);
});

test("several zones sum their kills and name themselves, once there's more than one", () => {
  const zones = [zone({ zone: "Lower Guk", myKills: 10 }), zone({ zone: "Upper Guk", myKills: 15 })];
  const text = buildWikiContribution({ ...base, zones });
  assert.match(text, /25 kills across 2 zones \(Lower Guk, Upper Guk\)/);
});

test("one zone doesn't name itself — the mob's own page already says where it lives", () => {
  const text = buildWikiContribution({ ...base, zones: [zone({ zone: "Lower Guk", myKills: 5 })] });
  assert.match(text, /5 kills across 1 zone, as of/);
  assert.doesNotMatch(text, /Lower Guk/);
});

test("the mob name and character both appear, so a pasted block is self-explanatory out of context", () => {
  const text = buildWikiContribution(base);
  assert.match(text, /== a decaying skeleton — from Kainos's own kills ==/);
});

// Reproduced from a real captured log: several graded copies of one item ("Arrow", "Arrow +2",
// "Arrow +3", "Arrow +4") fold onto one line by `reconcileDrops`'s own base-name rule, and one grade
// happened to be peer-only (myCount 0) — confirming the fold still excludes it from the total rather
// than quietly including a peer's drop once it's merged under a shared name.
test("graded copies of one item fold to one line, and a peer-only grade still doesn't count", () => {
  const zones = [
    zone({
      myKills: 213,
      drops: [
        { item: "Arrow", count: 4, rate: 4 / 213, myCount: 4 },
        { item: "Arrow +2", count: 7, rate: 7 / 213, myCount: 7 },
        { item: "Arrow +3", count: 31, rate: 31 / 213, myCount: 31 },
        { item: "Arrow +4", count: 2, rate: 2 / 213, myCount: 0 }, // a peer's kill, never yours
      ],
    }),
  ];
  const text = buildWikiContribution({ ...base, wikiDrops: {}, zones });
  assert.match(text, /\{\{:Arrow\}\} — seen 42 of 213 kills \(20%\)/); // 4+7+31+0, not +2
  assert.doesNotMatch(text, /Arrow \+2|Arrow \+3|Arrow \+4/); // graded names never appear on their own
});
