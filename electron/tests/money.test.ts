/**
 * Black-box tests for the money helpers: the log's prose in, copper out, and back again.
 *
 * The interesting cases are all about *not losing coin*: EQ joins denominations three
 * different ways depending on how many there are, and a pattern that assumes one of them
 * silently returns a fraction of the money — which is worse than returning none, because
 * nothing downstream can tell.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coinBreakdown, describeCoins, formatCoins, parseCoins } from "../../src/shared/money";

test("parseCoins reads one denomination", () => {
  assert.equal(parseCoins("4 copper"), 4);
  assert.equal(parseCoins("3 silver"), 30);
  assert.equal(parseCoins("3 gold"), 300);
  assert.equal(parseCoins("2 platinum"), 2000);
});

test("parseCoins sums however the log joins them", () => {
  assert.equal(parseCoins("1 silver and 4 copper"), 14);
  assert.equal(parseCoins("3 silver and 2 copper"), 32);
  assert.equal(parseCoins("1 gold, 2 silver and 3 copper"), 123);
  assert.equal(parseCoins("1 platinum, 2 gold, 3 silver and 4 copper"), 1234);
  // No conjunction at all, and out of order — the arithmetic doesn't care.
  assert.equal(parseCoins("4 copper 1 silver"), 14);
});

test("parseCoins returns null when there is no coin in the text", () => {
  assert.equal(parseCoins("a tradeskill depot"), null);
  assert.equal(parseCoins(""), null);
  assert.equal(parseCoins(undefined), null);
  // A number with no denomination is not money.
  assert.equal(parseCoins("7 of them"), null);
});

test("coinBreakdown splits copper into denominations without losing any", () => {
  assert.deepEqual(coinBreakdown(1234), { platinum: 1, gold: 2, silver: 3, copper: 4 });
  assert.deepEqual(coinBreakdown(0), { platinum: 0, gold: 0, silver: 0, copper: 0 });
  assert.deepEqual(coinBreakdown(9), { platinum: 0, gold: 0, silver: 0, copper: 9 });
  // Coin is never owed, so a negative reads as nothing rather than negative denominations.
  assert.deepEqual(coinBreakdown(-50), { platinum: 0, gold: 0, silver: 0, copper: 0 });
});

test("formatCoins omits empty denominations but never the zero case", () => {
  assert.equal(formatCoins(1234), "1p 2g 3s 4c");
  assert.equal(formatCoins(1004), "1p 4c");
  assert.equal(formatCoins(30), "3s");
  // A mob that pays nothing is a finding, not a gap — so it reads as a number.
  assert.equal(formatCoins(0), "0c");
});

test("describeCoins says it the way the log does", () => {
  assert.equal(describeCoins(14), "1 silver and 4 copper");
  assert.equal(describeCoins(123), "1 gold, 2 silver and 3 copper");
  assert.equal(describeCoins(300), "3 gold");
  assert.equal(describeCoins(0), "no coin");
});

test("a parsed amount survives the round trip through both formatters", () => {
  for (const text of ["4 copper", "1 silver and 4 copper", "1 platinum, 2 gold, 3 silver and 4 copper"]) {
    const copper = parseCoins(text);
    assert.notEqual(copper, null);
    assert.equal(parseCoins(describeCoins(copper as number)), copper);
  }
});
