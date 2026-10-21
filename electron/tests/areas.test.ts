/**
 * Black-box tests for the area registry (ADR 0320): every section belongs to exactly one area, and
 * picking an area lands on the section you left it on, unless that one can't be used here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, areaOf, sectionToOpen } from "../../src/shared/chrome/areas";

test("every section belongs to exactly one area", () => {
  const all = AREAS.flatMap((a) => a.sections);
  assert.equal(new Set(all).size, all.length);
  for (const s of all) assert.ok(areaOf(s)?.sections.includes(s));
  assert.equal(areaOf("no-such-tab"), undefined);
});

test("the old tabs are all still sections, so remembered places and openTab callers keep working", () => {
  const old = ["list", "hunt", "timers", "goals", "achievements", "buffs", "loot", "faction", "search", "items", "spells", "stances", "aa", "tradeskills", "combat", "session", "exports", "alerts", "peers", "settings"];
  assert.deepEqual(old.filter((t) => !areaOf(t)), []);
});

test("an area opens on the section last used there", () => {
  const now = areaOf("buffs")!;
  assert.equal(sectionToOpen(now, { now: "timers" }, () => true), "timers");
});

test("with nothing remembered, an area opens on its first section", () => {
  assert.equal(sectionToOpen(areaOf("loot")!, {}, () => true), "combat");
});

test("a remembered section that can't be used here, or isn't in the area, falls to the first usable one", () => {
  const now = areaOf("buffs")!;
  const usable = (s: string) => s !== "overview" && s !== "timers";
  assert.equal(sectionToOpen(now, { now: "timers" }, usable), "buffs");
  assert.equal(sectionToOpen(now, { now: "search" }, () => true), "overview");
});

test("an area with nothing usable still names a section, so the window never shows an empty panel", () => {
  const now = areaOf("buffs")!;
  assert.equal(sectionToOpen(now, {}, () => false), "overview");
});
