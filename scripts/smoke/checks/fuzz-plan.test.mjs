import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { ARG_SHAPES, callExpression, fuzzTargets } from "./fuzz-plan.mjs";

const NAMES = [
  "ui.all", "ui.set", "wiki.search", "wiki.refresh", "wiki.harvestStart", "wiki.openInBrowser", "wiki.onHarvest",
  "win.hide", "win.close", "update.check", "lookup.open", "awari.send", "peer.rejoin", "admin.patch", "map.open", "map.sources",
  "alerts.test", "records.test", "settings.pickLogDir", "settings.get", "settings.update", "kills.clear", "combat.clearHistory",
  "app.openLog", "app.selfCheckFix", "app.info", "faction.hitsPage", "loot.dropsPage", "gameClock.add", "achievements.setManual",
  "nav.onCommand", "search.show",
];

const { targets, left } = fuzzTargets(NAMES);
const skipped = (name) => left.some((l) => l.name === name);

test("the functions that open windows, dialogs, browsers or the peer room are never called", () => {
  for (const name of ["win.hide", "win.close", "update.check", "lookup.open", "awari.send", "peer.rejoin", "admin.patch", "map.open",
    "alerts.test", "records.test", "settings.pickLogDir", "app.openLog", "wiki.openInBrowser", "search.show", "nav.onCommand"]) {
    assert.ok(skipped(name), `${name} should be skipped`);
  }
});

test("a function that wipes a ledger, starts a crawl or re-fetches the wiki is left alone", () => {
  for (const name of ["kills.clear", "combat.clearHistory", "wiki.harvestStart", "wiki.refresh", "app.selfCheckFix"]) assert.ok(skipped(name), name);
});

test("the settings the run depends on are not rewritten, and subscriptions are not calls", () => {
  assert.ok(skipped("settings.update"));
  assert.ok(skipped("ui.set"));
  assert.ok(skipped("wiki.onHarvest"));
});

test("ordinary reads and the stores the persistence probe uses are fuzzed", () => {
  for (const name of ["ui.all", "wiki.search", "settings.get", "map.sources", "app.info", "faction.hitsPage", "loot.dropsPage", "gameClock.add", "achievements.setManual"]) {
    assert.ok(targets.includes(name), `${name} should be fuzzed`);
  }
});

test("every function is either fuzzed or skipped with a reason, never lost", () => {
  assert.equal(targets.length + left.length, NAMES.length);
  for (const entry of left) assert.ok(entry.why.length > 5);
});

test("the hostile shapes cover the ones that found real bugs: null, {}, -1, NaN and a 2 MB string", () => {
  const sources = ARG_SHAPES.map(([, source]) => source);
  for (const wanted of ["[null]", "[{}]", "[-1]", "[NaN]", "['x'.repeat(2e6)]"]) assert.ok(sources.includes(wanted), wanted);
});

test("every shape and the call built from it are valid JavaScript", () => {
  for (const [, source] of ARG_SHAPES) {
    assert.doesNotThrow(() => new vm.Script(callExpression("wiki.search", source, 1200)), source);
  }
});

test("a call expression names the function it calls and is bounded by a timeout", () => {
  const expression = callExpression("faction.hitsPage", "[null]", 1200);
  assert.match(expression, /window\.eql\.faction\.hitsPage\(\.\.\.\[null\]\)/);
  assert.match(expression, /1200/);
});

test("a function path that is not a plain dotted name cannot be turned into code", () => {
  assert.throws(() => callExpression("ui.all(); alert(1); //", "[]", 100), /not a function path/);
  assert.throws(() => callExpression("", "[]", 100), /not a function path/);
});
