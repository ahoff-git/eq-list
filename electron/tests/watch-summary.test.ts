/**
 * Black-box tests for how a watch reads at a glance — the chips on a folded row.
 *
 * What's *wrong* with a rule is `watch-check.ts` and is tested there; the summary only carries its
 * findings, which is asserted here once so the two can't drift apart.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeWatch } from "../../src/shared/watch-summary";
import type { CastWatch } from "../../src/shared/types";

const watch = (over: Partial<CastWatch> = {}): CastWatch => ({ id: "w", spell: "Mesmeri", enabled: true, ...over });
const stopper = [{ field: "line" as const, op: "contains" as const, text: "has been slain" }];

test("a plain watch summarizes as the one thing it does", () => {
  const s = summarizeWatch(watch());
  assert.equal(s.prompts, "cast");
  assert.equal(s.timing, "");
  assert.equal(s.conditions, "");
  assert.deepEqual(s.issues, []);
});

test("the prompts read as the ticks that are on", () => {
  assert.equal(summarizeWatch(watch({ onFade: true })).prompts, "cast · fades");
  assert.equal(summarizeWatch(watch({ onCast: false, onLine: true })).prompts, "raw text");
});

test("one condition says what it is; several are counted", () => {
  assert.equal(
    summarizeWatch(watch({ conditions: [{ field: "caster", op: "exact", text: "BunnySlayer", exclude: true }] })).conditions,
    "caster isn't BunnySlayer",
  );
  const three = watch({
    conditions: [
      { field: "caster", op: "contains", text: "elf" },
      { field: "zone", op: "contains", text: "Guk" },
      { field: "line", op: "contains", text: "casting" },
    ],
  });
  assert.equal(summarizeWatch(three).conditions, "3 conditions");
  assert.equal(summarizeWatch({ ...three, match: "any" }).conditions, "any of 3 conditions");
  // A row still being typed isn't advertised as a rule.
  assert.equal(summarizeWatch(watch({ conditions: [{ field: "line", op: "contains", text: " " }] })).conditions, "");
});

test("the timing chip says when, and how many times", () => {
  assert.equal(summarizeWatch(watch({ delay: "25" })).timing, "25s");
  assert.equal(summarizeWatch(watch({ delay: "90" })).timing, "1m 30s");
  assert.equal(summarizeWatch(watch({ delay: "25", repeat: 2 })).timing, "25s ×3");
  // A repeat that was refused isn't counted — the chip has to say what will happen, not what was asked.
  assert.equal(summarizeWatch(watch({ delay: "8m", repeat: 2, cancelOnDeath: "never" })).timing, "8m");
  assert.equal(summarizeWatch(watch({ delay: "8m", repeat: 2, cancelWhen: stopper })).timing, "8m ×3");
});

// ── and what's wrong with it ───────────────────────────────────────────────────
// Carried from `watch-check.ts` rather than judged here, so the row's ⚠ and the open watch's list
// can't disagree about whether a rule is sound.

test("the summary carries the checker's findings, and the list it needs for them", () => {
  assert.match(summarizeWatch(watch({ delay: "soon" })).issues[0].message, /isn't a delay/);
  assert.equal(summarizeWatch(watch({ spell: "  " })).issues[0].level, "error");
  // The duplicate check only has an answer when the rest of the list is passed.
  const twin = watch({ id: "other" });
  assert.deepEqual(summarizeWatch(watch()).issues, []);
  assert.match(summarizeWatch(watch(), [twin]).issues[0].message, /Another enabled watch/);
});
