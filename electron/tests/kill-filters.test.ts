/**
 * Black-box tests for the kill filters and the confidence vocabulary. The map and the kill
 * list share both, so these pin the thing that keeps the two views telling the same story.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KILL_FILTERS,
  filterKills,
  filterMobKnowledge,
  matchesDrop,
  mobChoices,
  sharedAsKill,
  windowMoves,
  withDroppedOnly,
  type KillFilters,
} from "../../src/shared/kill-filters";
import { confidenceTier, CONFIDENCE_TIERS, PLOTTABLE_CONFIDENCE } from "../../src/shared/kill-confidence";
import type { MobKnowledge } from "../../src/shared/mob-stats";
import type { KillRecord } from "../../src/shared/types";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

function kill(p: Partial<KillRecord> & { mob: string }): KillRecord {
  return {
    id: p.mob + (p.at ?? ""),
    logId: 1,
    at: p.at ?? new Date(NOW).toISOString(),
    confidence: p.confidence ?? 1,
    ...p,
  };
}

/** Minutes before `NOW`, as an ISO timestamp. */
const agoMin = (m: number) => new Date(NOW - m * 60_000).toISOString();

const filters = (over: Partial<KillFilters> = {}): KillFilters => ({ ...DEFAULT_KILL_FILTERS, ...over });

test("the defaults keep everything from a play session", () => {
  const kills = [kill({ mob: "a coyote", at: agoMin(1) }), kill({ mob: "a rat", at: agoMin(200) })];
  assert.equal(filterKills(kills, filters(), NOW).length, 2);
});

test("the time window cuts off older kills", () => {
  const kills = [
    kill({ mob: "recent", at: agoMin(5) }),
    kill({ mob: "older", at: agoMin(30) }),
    kill({ mob: "ancient", at: agoMin(600) }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ window: "10m" }), NOW).map((k) => k.mob),
    ["recent"],
  );
  assert.deepEqual(
    filterKills(kills, filters({ window: "1h" }), NOW).map((k) => k.mob),
    ["recent", "older"],
  );
  assert.equal(filterKills(kills, filters({ window: "all" }), NOW).length, 3);
});

test("mob and drop filters match on a substring, case-insensitively", () => {
  const kills = [
    kill({ mob: "a giant rat", drops: ["Giant Rat Ear"] }),
    kill({ mob: "a coyote", drops: ["Chunk of Meat"] }),
    kill({ mob: "a rock spider" }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ mob: "RAT" }), NOW).map((k) => k.mob),
    ["a giant rat"],
  );
  assert.deepEqual(
    filterKills(kills, filters({ drop: "meat" }), NOW).map((k) => k.mob),
    ["a coyote"],
  );
  // The same rule, asked about one row: the 📖 panel marks the drop the search was for, and a
  // second implementation of "matched" there would highlight lines the filter didn't keep.
  assert.equal(matchesDrop("Chunk of Meat", " MEAT "), true);
  assert.equal(matchesDrop("Chunk of Meat", "fang"), false);
  assert.equal(matchesDrop("Chunk of Meat", ""), true, "an empty filter asks nothing");
});

test("'dropped' keeps only kills that gave something up", () => {
  const kills = [kill({ mob: "gave", drops: ["Bone Chips"] }), kill({ mob: "gave nothing" })];
  assert.deepEqual(
    filterKills(kills, filters({ droppedOnly: true }), NOW).map((k) => k.mob),
    ["gave"],
  );
});

test("the confidence floor hides positions that aren't worth believing", () => {
  const kills = [
    kill({ mob: "measured", confidence: 1 }),
    kill({ mob: "vague", confidence: 0.3 }),
    kill({ mob: "unplaced", confidence: 0 }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ minConfidence: PLOTTABLE_CONFIDENCE }), NOW).map((k) => k.mob),
    ["measured", "vague"],
  );
  // With no floor, even an unplaced kill is listed — it happened, after all.
  assert.equal(filterKills(kills, filters(), NOW).length, 3);
});

test("a kill with an unreadable timestamp is kept rather than lost", () => {
  const kills = [kill({ mob: "odd clock", at: "not a date" })];
  assert.equal(filterKills(kills, filters({ window: "10m" }), NOW).length, 1);
});

test("confidence tiers run from measured to unplaced, and never fall through", () => {
  assert.equal(confidenceTier(1).label, "measured");
  assert.equal(confidenceTier(0.6).label, "close");
  assert.equal(confidenceTier(0.3).label, "approximate");
  assert.equal(confidenceTier(0.05).label, "guess");
  assert.equal(confidenceTier(0).label, "unplaced");
  // Every tier has a distinct glyph, so the map reads without relying on color.
  const glyphs = CONFIDENCE_TIERS.map((t) => t.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
});

/**
 * A window whose cutoff moves has to be re-applied as time passes; "all" never does. A display that
 * memoized on the kills and the filters alone froze the cutoff, so "10m" kept showing kills long
 * past ten minutes once a camp went quiet — this is the signal that tells a caller it must tick.
 */
test("every window but 'all' has a cutoff that moves", () => {
  assert.equal(windowMoves("10m"), true);
  assert.equal(windowMoves("1h"), true);
  assert.equal(windowMoves("session"), true, "12 hours still expires, so it still needs a clock");
  assert.equal(windowMoves("all"), false, "nothing to re-apply — there is no cutoff");
});

test("the same kills expire as the clock advances, with the filters untouched", () => {
  const only = filters({ window: "10m" });
  const kills = [kill({ mob: "a kobold", at: agoMin(5) })];

  assert.equal(filterKills(kills, only, NOW).length, 1, "five minutes old, inside the window");
  assert.equal(
    filterKills(kills, only, NOW + 6 * 60_000).length,
    0,
    "eleven minutes old — the same kill and the same filters, a later clock",
  );
});

// ── the choices the bar offers, and the pairs of filters it must not let you build ──────────────

test("the mob picker's choices carry whether the mob has ever dropped anything", () => {
  const choices = mobChoices([
    kill({ mob: "a kobold", drops: ["Bone Chips"] }),
    kill({ mob: "a kobold" }), // one dry kill doesn't undo what the mob is known to drop
    kill({ mob: "a bat" }),
  ]);
  assert.deepEqual(choices, [
    { mob: "a bat", dropped: false },
    { mob: "a kobold", dropped: true },
  ]);
  // The same helper reads mob knowledge, whose drops are counted rows rather than names.
  assert.deepEqual(mobChoices([known({ mob: "a rat" }), known({ mob: "a kerran", drops: ["Cat Pelt"] })]), [
    { mob: "a kerran", dropped: true },
    { mob: "a rat", dropped: false },
  ]);
});

test("ticking 'dropped' lets go of a mob that has never dropped anything", () => {
  // The bug: the two filters have no common answer, so the panel emptied and said nothing about
  // which of the two did it — the mob's name still sat in the picker.
  const choices = mobChoices([kill({ mob: "a bat" }), kill({ mob: "a kobold", drops: ["Bone Chips"] })]);
  const next = withDroppedOnly(filters({ mob: "a bat" }), true, choices);
  assert.equal(next.droppedOnly, true);
  assert.equal(next.mob, "", "the box you just ticked is the newer intent, so it wins");

  // A mob that does drop is kept: nothing is in conflict.
  assert.equal(withDroppedOnly(filters({ mob: "a kobold" }), true, choices).mob, "a kobold");
  // And the mob filter matches on a substring, so what's released is judged the same way.
  assert.equal(withDroppedOnly(filters({ mob: "kob" }), true, choices).mob, "kob");
});

test("turning 'dropped' back off keeps the mob you picked", () => {
  const choices = mobChoices([kill({ mob: "a kobold", drops: ["Bone Chips"] })]);
  const off = withDroppedOnly(filters({ mob: "a bat", droppedOnly: true }), false, choices);
  assert.deepEqual([off.droppedOnly, off.mob], [false, "a bat"], "nothing is in conflict on the way out");
});

// ── peers' kills, which are kills ────────────────────────────────────────────────────────────────

/** A kill as it arrives from a peer: where, what, and how much to believe it. Nothing else travels. */
const fromPeer = { zone: "blackburrow", y: 100, x: 200, mob: "a gnoll pup", confidence: 0.9, by: "Bunny" };

test("a shared kill becomes an ordinary kill record, marked with who shared it", () => {
  const k = sharedAsKill(fromPeer, 0);
  assert.equal(k.mob, "a gnoll pup");
  assert.equal(k.sharedBy, "Bunny");
  assert.equal(k.mine, false, "never yours — you didn't loot that corpse (ADR 0027)");
  assert.deepEqual([k.y, k.x, k.confidence], [100, 200, 0.9]);
  assert.equal(k.at, "", "no time travels with a shared kill, and an invented one would be a lie");
  assert.equal(k.drops, undefined, "nor any loot — a peer shares the conclusion");
  assert.notEqual(sharedAsKill(fromPeer, 1).id, k.id, "ids are distinct within one sender's batch");
  assert.equal(sharedAsKill({ ...fromPeer, by: undefined }, 0).sharedBy, "a peer", "an unnamed sharer is still a sharer");
});

test("shared kills are kept by default, because a peer's kill is data", () => {
  const kills = [kill({ mob: "a gnoll" }), sharedAsKill(fromPeer, 0)];
  assert.equal(filterKills(kills, filters(), NOW).length, 2);
  assert.equal(DEFAULT_KILL_FILTERS.shared, true);
});

test("`shared: false` leaves only what you saw yourself", () => {
  const mine = kill({ mob: "a gnoll" });
  const kills = [mine, sharedAsKill(fromPeer, 0), sharedAsKill({ ...fromPeer, by: "Ozzy" }, 0)];
  assert.deepEqual(filterKills(kills, filters({ shared: false }), NOW), [mine]);
});

test("a time window keeps a shared kill rather than dropping it for having no clock", () => {
  // The same rule as an unparseable timestamp: losing a kill because we don't know when it happened
  // would be worse than showing it. It has a position, which is what the heatmap is about.
  const kills = [sharedAsKill(fromPeer, 0)];
  for (const window of ["10m", "1h", "session", "all"] as const) {
    assert.equal(filterKills(kills, filters({ window }), NOW).length, 1, window);
  }
});

test("the other filters still apply to a shared kill, and the drop ones exclude it", () => {
  const kills = [sharedAsKill(fromPeer, 0)];
  assert.equal(filterKills(kills, filters({ mob: "gnoll" }), NOW).length, 1);
  assert.equal(filterKills(kills, filters({ mob: "orc" }), NOW).length, 0);
  assert.equal(filterKills(kills, filters({ minConfidence: 0.95 }), NOW).length, 0, "confidence travels, so it's judged");
  // No loot travels with a shared kill, so it is no evidence at all about drops — being excluded from
  // a drop question is the correct answer, not a gap.
  assert.equal(filterKills(kills, filters({ droppedOnly: true }), NOW).length, 0);
  assert.equal(filterKills(kills, filters({ drop: "tooth" }), NOW).length, 0);
});

// ── the same filters over what those kills taught us ─────────────────────────────────────────────

function known(p: { mob: string; myKills?: number; kills?: number; drops?: string[] }): MobKnowledge {
  return {
    mob: p.mob,
    zone: "kerraridge",
    kills: p.kills ?? 10,
    myKills: p.myKills ?? 10,
    drops: (p.drops ?? []).map((item) => ({ item, count: 1, rate: 0.1, myCount: 1 })),
    lastAt: new Date(NOW).toISOString(),
    contributors: [],
    copper: 0,
    copperPerKill: 0,
  };
}

test("the knowledge panel narrows by mob and by drop, like the list beside it", () => {
  const mobs = [
    known({ mob: "a kerran zealot", drops: ["Fine Steel Dagger"] }),
    known({ mob: "a kerran mystic", drops: ["Cat Pelt"] }),
  ];
  assert.deepEqual(filterMobKnowledge(mobs, filters({ mob: "zealot" })).map((m) => m.mob), ["a kerran zealot"]);
  assert.deepEqual(filterMobKnowledge(mobs, filters({ drop: "pelt" })).map((m) => m.mob), ["a kerran mystic"]);
  assert.equal(filterMobKnowledge(mobs, filters({ droppedOnly: true })).length, 2);
  assert.equal(filterMobKnowledge([known({ mob: "a rat" })], filters({ droppedOnly: true })).length, 0);
});

test("a time window and a position floor do not apply to a lifetime tally", () => {
  // The reason the bar hides both controls here: 300 kills over three weeks is the point of this
  // panel, and "session" (12h) as a default would hide what you learned last week.
  const mobs = [known({ mob: "a kerran zealot" })];
  assert.equal(filterMobKnowledge(mobs, filters({ window: "10m" })).length, 1);
  assert.equal(filterMobKnowledge(mobs, filters({ minConfidence: 1 })).length, 1);
});

test("`shared: false` keeps the mobs you have first-hand knowledge of", () => {
  const mine = known({ mob: "a kerran zealot", myKills: 4, kills: 40 });
  const theirs = known({ mob: "a kerran mystic", myKills: 0, kills: 30 });

  assert.equal(filterMobKnowledge([mine, theirs], filters()).length, 2, "pooled by default — it's data");
  const own = filterMobKnowledge([mine, theirs], filters({ shared: false }));
  assert.deepEqual(own.map((m) => m.mob), ["a kerran zealot"]);
  // A row you contributed to keeps its pooled counts: it's still partly yours, and restating it as
  // your own 4 kills would be a different claim about the same rate.
  assert.equal(own[0].kills, 40);
});
