import { test } from "node:test";
import assert from "node:assert/strict";

import { exitCode, fail, formatDetails, formatTable, pass, runCheck, skip } from "./report.mjs";

test("a passing run exits 0 and a failure exits nonzero", () => {
  assert.equal(exitCode([pass("a", "ok"), pass("b", "ok")]), 0);
  assert.equal(exitCode([pass("a", "ok"), fail("b", "bad")]), 1);
});

test("a skip is visible but is not a red build on its own", () => {
  assert.equal(exitCode([pass("a", "ok"), skip("b", "no data")]), 0);
});

test("a check that throws becomes a failed result carrying the error, not a crash", async () => {
  const [result] = await runCheck("probe", async () => {
    throw new Error("socket closed");
  });
  assert.equal(result.status, "fail");
  assert.match(result.summary, /socket closed/);
  assert.equal(result.name, "probe");
});

test("a result is timed with the injected clock", async () => {
  let now = 1000;
  const [result] = await runCheck("probe", async () => {
    now += 2500;
    return pass("probe", "ok");
  }, () => now);
  assert.equal(result.ms, 2500);
});

test("a check that reports several rows has its time on the first only", async () => {
  let now = 0;
  const results = await runCheck("sweep", async () => {
    now += 4000;
    return [pass("sweep: a", "ok"), fail("sweep: b", "bad")];
  }, () => now);
  assert.deepEqual(results.map((r) => [r.name, r.ms]), [["sweep: a", 4000], ["sweep: b", 0]]);
});

test("a row with no time of its own shows none, not a false 0.0s", () => {
  assert.doesNotMatch(formatTable([pass("a", "ok")]), /0\.0s/);
});

test("the table lists every check and counts each outcome", () => {
  const table = formatTable([{ ...pass("sweep", "24 sections"), ms: 61000 }, fail("fuzz", "main hung"), skip("session-end", "not windows")]);
  assert.match(table, /PASS\s+sweep\s+61\.0s\s+24 sections/);
  assert.match(table, /FAIL\s+fuzz/);
  assert.match(table, /SKIP\s+session-end/);
  assert.match(table, /1 pass, 1 fail, 1 skip/);
});

test("details show the evidence of failures and skips that explain themselves, and nothing for a clean pass", () => {
  const details = formatDetails([pass("a", "ok", ["fine"]), fail("b", "bad", ["line one", "line two"]), skip("c", "why", ["no windows"]), skip("d", "bare")]);
  assert.match(details, /FAIL {2}b\n {4}line one\n {4}line two/);
  assert.match(details, /SKIP {2}c/);
  assert.doesNotMatch(details, /fine/);
  assert.doesNotMatch(details, /\bd\b/);
});

test("verbose details include what a pass looked at", () => {
  assert.match(formatDetails([pass("a", "ok", ["looked at 9 grids"])], { verbose: true }), /looked at 9 grids/);
});
