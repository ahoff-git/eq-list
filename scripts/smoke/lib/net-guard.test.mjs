import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeBlockedFetches } from "./net-guard.mjs";

test("refused fetches are counted and named by host, each host once", () => {
  const text = ["https://eqlwiki.com/api.php?a=1", "https://eqlwiki.com/api.php?a=2", "https://example.org/x", ""].join("\n");
  assert.deepEqual(summarizeBlockedFetches(text), { count: 3, hosts: ["eqlwiki.com", "example.org"] });
});

test("an empty file means nothing was refused", () => {
  assert.deepEqual(summarizeBlockedFetches(""), { count: 0, hosts: [] });
});

test("a line that is not a URL is still counted rather than lost", () => {
  assert.equal(summarizeBlockedFetches("not a url").count, 1);
});
