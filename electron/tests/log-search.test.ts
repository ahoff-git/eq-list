/**
 * Black-box tests for the log searcher's matcher (`src/shared/log-search.ts`) and its file reader
 * (`electron/log-search.ts`). Only need re-running if either changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogSearch } from "../../src/shared/log-search";
import { searchLogFile } from "../log-search";

const LOG = [
  "[Sat Aug 29 00:45:50 2026] You begin casting Garrison's Mighty Mana Shock.",
  "[Sat Aug 29 00:45:56 2026] You hit a goblin sentry for 247 points of magic damage by Garrison's Mighty Mana Shock.",
  "[Sat Aug 29 00:45:56 2026] You have slain a goblin sentry!",
  "[Sat Aug 29 00:46:10 2026] Bunnyslayer tells the group, 'nice, another goblin'",
  "",
  "[Sat Aug 29 00:47:02 2026] A goblin sentry resisted your Mesmerization!",
];

function search(query: string, options?: Parameters<typeof createLogSearch>[1]) {
  const s = createLogSearch(query, options);
  LOG.forEach((raw, i) => s.feed(raw, i + 1));
  return s.result();
}

test("every line mentioning the string, newest first, with its time and line number", () => {
  const { total, hits } = search("GOBLIN");
  assert.equal(total, 4);
  assert.deepEqual(
    hits.map((h) => [h.line, h.at]),
    [
      [6, "2026-08-29T00:47:02"],
      [4, "2026-08-29T00:46:10"],
      [3, "2026-08-29T00:45:56"],
      [2, "2026-08-29T00:45:56"],
    ],
  );
  assert.equal(hits[0].message, "A goblin sentry resisted your Mesmerization!");
});

test("each hit says what the parser read it as", () => {
  const kinds = search("goblin").hits.map((h) => h.kind);
  // Group chat is a "party" line — the roster learns who is grouped from who speaks there.
  assert.deepEqual(kinds, ["spell-outcome", "party", "kill", "damage"]);
});

test("combat lines only keeps just what the combat parser claims", () => {
  const { total, hits } = search("goblin", { combatOnly: true });
  assert.equal(total, 2, "the swing and the resist — not the kill line, not the chat");
  assert.deepEqual(hits.map((h) => h.kind), ["spell-outcome", "damage"]);
});

test("the timestamp is searchable too", () => {
  assert.equal(search("00:45:56").total, 2);
});

test("only the newest matches are kept, but every one is counted", () => {
  const { total, hits } = search("goblin", { limit: 2 });
  assert.equal(total, 4);
  assert.deepEqual(hits.map((h) => h.line), [6, 4]);
});

test("a query too short to mean anything matches nothing", () => {
  assert.equal(search("g").total, 0);
  assert.equal(search("   ").total, 0);
});

test("the file reader streams a real file, and a missing one is an empty answer", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-logsearch-"));
  try {
    const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
    fs.writeFileSync(file, LOG.join("\r\n"));
    const found = await searchLogFile(file, "slain");
    assert.equal(found.total, 1);
    assert.equal(found.hits[0].line, 3);
    assert.deepEqual(await searchLogFile(path.join(dir, "nope.txt"), "slain"), {
      file: path.join(dir, "nope.txt"),
      total: 0,
      hits: [],
    });
    assert.deepEqual(await searchLogFile(undefined, "slain"), { total: 0, hits: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a newer search from the same window cuts the older one short; another window's doesn't", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-logsearch-"));
  try {
    const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
    fs.writeFileSync(file, Array.from({ length: 50_000 }, () => LOG[1]).join("\n"));
    const first = searchLogFile(file, "goblin", {}, 1);
    const other = searchLogFile(file, "goblin", {}, 2);
    const second = searchLogFile(file, "sentry", {}, 1);
    assert.equal((await first).superseded, true);
    assert.equal((await other).total, 50_000);
    assert.equal((await second).total, 50_000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
