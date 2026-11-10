import { test } from "node:test";
import assert from "node:assert/strict";

import { FAULTS, parseFaults } from "./faults.mjs";

test("fault names are read as a set, whitespace and empties ignored", () => {
  assert.deepEqual([...parseFaults(" console-error , no-pager,,")].sort(), ["console-error", "no-pager"]);
  assert.equal(parseFaults(undefined).size, 0);
  assert.equal(parseFaults("").size, 0);
});

test("a misspelt fault is an error, since it would otherwise look like a run that passed", () => {
  assert.throws(() => parseFaults("console-eror"), /unknown fault console-eror/);
});

test("every fault says what it does", () => {
  for (const [name, why] of Object.entries(FAULTS)) assert.ok(why.length > 20, name);
});
