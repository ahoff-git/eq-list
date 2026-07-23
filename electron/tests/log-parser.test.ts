/**
 * Black-box tests for the pure log parser. Run with `npm test` (compiles the
 * electron/shared TS, then `node --test`). These pin the loot-line grammar so
 * the watcher can trust it; they only need re-running if log-parser.ts changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLogLine,
  parseZoneLine,
  parseXpLine,
  parseKillLine,
  parseLocLine,
  splitTimestamp,
  stripArticle,
  characterFromLogFile,
} from "../../src/shared/log-parser";

test("splitTimestamp extracts the message and an ISO time", () => {
  const r = splitTimestamp("[Fri Jul 17 18:41:14 2026] Hello world");
  assert.ok(r);
  assert.equal(r!.message, "Hello world");
  assert.match(r!.at, /^2026-07-17T/);
});

test("splitTimestamp tolerates a space-padded day", () => {
  const r = splitTimestamp("[Sun Jul  7 09:05:00 2026] x");
  assert.ok(r);
  assert.match(r!.at, /^2026-07-07T/);
});

test("stripArticle removes leading a/an/the", () => {
  assert.equal(stripArticle("a Rusty Sword"), "Rusty Sword");
  assert.equal(stripArticle("an Opal"), "Opal");
  assert.equal(stripArticle("the Crown"), "Crown");
  assert.equal(stripArticle("Bone Chips"), "Bone Chips");
});

test("parses the standard --You have looted-- drop line", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] --You have looted a Mote of Potential from an orc centurion's corpse.--",
  );
  assert.ok(e);
  assert.equal(e!.item, "Mote of Potential");
  assert.equal(e!.source, "orc centurion");
});

test("parses the auto-sell loot line", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Snake Egg from an asp's corpse and sold it for 4 copper.",
  );
  assert.ok(e);
  assert.equal(e!.item, "Snake Egg");
  assert.equal(e!.source, "asp");
});

test("parses the loot-and-combine line", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Crushbone Belt +2 from an orc's corpse to create a Crushbone Belt +5.",
  );
  assert.ok(e);
  assert.equal(e!.item, "Crushbone Belt +2");
});

test("multi-word item and source names survive", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] --You have looted a Shining Metallic Robe from a Skeletal Monk's corpse.--",
  );
  assert.ok(e);
  assert.equal(e!.item, "Shining Metallic Robe");
  assert.equal(e!.source, "Skeletal Monk");
});

test("ignores non-loot chatter", () => {
  assert.equal(parseLogLine("[Fri Jul 17 18:41:14 2026] You say, 'hello'"), null);
  assert.equal(parseLogLine("[Fri Jul 17 18:41:14 2026] Welcome to EverQuest!"), null);
  assert.equal(parseLogLine(""), null);
});

test("parseZoneLine reads zone-change lines and drops leading 'the'", () => {
  const e = parseZoneLine("[Mon Jul 20 19:02:14 2026] You have entered Everfrost Peaks.");
  assert.ok(e);
  assert.equal(e!.zone, "Everfrost Peaks");

  const t = parseZoneLine("[Mon Jul 20 19:02:14 2026] You have entered the Feerrott.");
  assert.equal(t!.zone, "Feerrott");

  assert.equal(parseZoneLine("[Mon Jul 20 19:02:14 2026] You say, 'hi'"), null);
});

test("parseXpLine handles solo, party, and percentage variants", () => {
  const solo = parseXpLine("[Mon Jul 20 19:03:05 2026] You gain experience!!"); // classic double-!
  assert.ok(solo);
  assert.equal(solo!.party, false);

  const eql = parseXpLine("[Mon Jul 20 19:03:05 2026] You gain experience! (0.5%)"); // EQL single-! + %
  assert.equal(eql!.pct, 0.5);

  const party = parseXpLine("[Mon Jul 20 19:03:05 2026] You gain party experience! (0.019%)");
  assert.ok(party);
  assert.equal(party!.party, true);
  assert.equal(party!.pct, 0.019);

  assert.equal(parseXpLine("[Mon Jul 20 19:03:05 2026] You feel refreshed."), null);
});

test("parseKillLine reads both kill forms, ignores player death", () => {
  const byYou = parseKillLine("[Mon Jul 20 19:03:05 2026] You have slain a large rat!");
  assert.equal(byYou!.target, "large rat");

  const byOther = parseKillLine("[Mon Jul 20 19:03:05 2026] an orc pawn has been slain by Jibekn!");
  assert.equal(byOther!.target, "orc pawn");

  // "have been slain" = the player died; not a kill.
  assert.equal(parseKillLine("[Mon Jul 20 19:03:05 2026] You have been slain by an orc pawn!"), null);
});

test("parseLocLine reads the y,x,z triple (y first), including negatives/decimals", () => {
  const loc = parseLocLine("[Mon Jul 20 19:03:05 2026] Your Location is 1234.5, -678.9, 42.0");
  assert.ok(loc);
  assert.equal(loc!.kind, "loc");
  assert.equal(loc!.y, 1234.5);
  assert.equal(loc!.x, -678.9);
  assert.equal(loc!.z, 42.0);

  assert.equal(parseLocLine("[Mon Jul 20 19:03:05 2026] You have entered Greater Faydark."), null);
});

test("characterFromLogFile pulls the character from the log filename (path or bare)", () => {
  assert.equal(characterFromLogFile("C:\\EQ\\Logs\\eqlog_Soandso_pq.proj.txt"), "Soandso");
  assert.equal(characterFromLogFile("eqlog_Bob_server.txt"), "Bob");
  assert.equal(characterFromLogFile("random.txt"), null);
  assert.equal(characterFromLogFile(undefined), null);
});
