import { test } from "node:test";
import assert from "node:assert/strict";

import { gridRows, planWalk, slowestSteps, sweepResults } from "./sweep-report.mjs";

test("the slowest steps are listed longest first", () => {
  const timings = [{ label: "a", ms: 1000 }, { label: "b", ms: 9000 }, { label: "c", ms: 4000 }];
  assert.deepEqual(slowestSteps(timings, 2), ["b: 9.0s", "c: 4.0s"]);
});

const AREAS = [
  { key: "now", label: "Now", sections: ["overview", "buffs"] },
  { key: "find", label: "Find", sections: ["search", "aa"] },
];
const NAMES = { overview: "Overview", buffs: "Buffs", search: "Search", aa: "AAs" };

test("the walk visits every section of every area in order, labelled by the app's own names", () => {
  const plan = planWalk(AREAS, NAMES);
  assert.deepEqual(plan.map((p) => [p.a, p.s, p.label]), [
    [0, 0, "Now → Overview"],
    [0, 1, "Now → Buffs"],
    [1, 0, "Find → Search"],
    [1, 1, "Find → AAs"],
  ]);
});

test("a section with no display name is labelled by its key rather than dropped", () => {
  assert.equal(planWalk([{ key: "x", label: "X", sections: ["mystery"] }], {})[0].label, "X → mystery");
});

const clean = () => ({ problems: [], steps: 24, views: 40, text: [], grids: [] });
const blocked = { count: 12, hosts: ["eqlwiki.com"] };

const find = (results, name) => results.find((r) => r.name === name);

test("a clean sweep passes every row it owns and says what it covered", () => {
  const results = sweepResults({ seen: clean(), findings: [], how: "fixture profile", blocked });
  assert.equal(find(results, "sweep: every section").status, "pass");
  assert.match(find(results, "sweep: every section").summary, /24 sections, 40 views/);
  assert.equal(find(results, "sweep: page errors").status, "pass");
  assert.equal(find(results, "sweep: broken values").status, "pass");
});

test("a console error in the sweep fails page errors and says where", () => {
  const findings = [{ source: "console", text: "TypeError: x is undefined", where: "Now → Buffs" }];
  const row = find(sweepResults({ seen: clean(), findings, how: "", blocked }), "sweep: page errors");
  assert.equal(row.status, "fail");
  assert.match(row.evidence.join("\n"), /Now → Buffs/);
});

test("an error on the allowlist does not fail, but is still listed", () => {
  const findings = [{ source: "log:network", text: "Failed to load resource: net::ERR_NAME_NOT_RESOLVED", where: "Find → Items" }];
  const row = find(sweepResults({ seen: clean(), findings, how: "", blocked }), "sweep: page errors");
  assert.equal(row.status, "pass");
  assert.match(row.evidence.join("\n"), /allowed:/);
});

test("an error from the main process's log fails the same row", () => {
  const findings = [{ source: "main", text: "uncaught Error: statement is busy", where: "main process log" }];
  assert.equal(find(sweepResults({ seen: clean(), findings, how: "", blocked }), "sweep: page errors").status, "fail");
});

test("NaN on screen fails broken values", () => {
  const seen = { ...clean(), text: [{ source: "text", text: "Damage NaN", where: "History → Combat" }] };
  assert.equal(find(sweepResults({ seen, findings: [], how: "", blocked }), "sweep: broken values").status, "fail");
});

test("a section that could not be opened fails the sweep row", () => {
  const seen = { ...clean(), problems: ["Now → Buffs: could not open it (disabled)"] };
  const row = find(sweepResults({ seen, findings: [], how: "", blocked }), "sweep: every section");
  assert.equal(row.status, "fail");
  assert.match(row.evidence[0], /Now → Buffs/);
});

const g = (grid, assertion, status, ...evidence) => ({ grid, assertion, status, evidence });

test("grid results are rolled up per kind of assertion, and one failing table fails its row only", () => {
  const rows = gridRows([
    g("Items", "column menu (text)", "pass", "ok"),
    g("Items", "pager footer", "pass", "ok"),
    g("Faction · Hits", "pager footer", "fail", "no pager footer"),
    g("Faction · Hits", "▶ ◀ and rows per page", "pass", "ok"),
  ]);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName["grid: pager footer"].status, "fail");
  assert.match(byName["grid: pager footer"].summary, /Faction · Hits/);
  assert.equal(byName["grid: column menu"].status, "pass");
  assert.equal(byName["faction hits: ▶ ◀ rows per page"].status, "pass");
  assert.equal(byName["grid: sort then page"].status, "skip", "nothing ran, so it is a skip and not a pass");
});

test("the column menu's evidence says which kind of column was tried", () => {
  const rows = gridRows([g("Items", "column menu (number)", "pass", "level")]);
  assert.match(rows.find((r) => r.name === "grid: column menu").evidence[0], /Items \(number\)/);
});
