/**
 * Black-box tests for the pure log parser. Run with `npm test` (compiles the
 * electron/shared TS, then `node --test`). These pin the loot-line grammar so
 * the watcher can trust it; they only need re-running if log-parser.ts changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCoin,
  parseGameTime,
  parseLoot,
  parseLevel,
  parseZone,
  parseXp,
  parseKill,
  parseLoc,
  parseLogin,
  splitLine,
  stripArticle,
  characterFromLogFile,
} from "../../src/shared/log-parser";
import { parseLine } from "../../src/shared/parse-line";
import type { LogLine } from "../../src/shared/types";

/**
 * The parsers take an already-split line (see `splitLine`). These wrappers keep the tests
 * reading as "raw line in, event out", which is what they're actually pinning.
 */
function on<T>(parse: (line: LogLine) => T | null): (raw: string) => T | null {
  return (raw) => {
    const line = splitLine(raw, 1);
    return line ? parse(line) : null;
  };
}

const parseLogLine = on(parseLoot);
const parseZoneLine = on(parseZone);
const parseXpLine = on(parseXp);
const parseKillLine = on(parseKill);
const parseLocLine = on(parseLoc);
const parseLevelLine = on(parseLevel);
const parseCoinLine = on(parseCoin);
const parseLoginLine = on(parseLogin);
const parseGameTimeLine = on(parseGameTime);

test("splitLine extracts the message, an ISO time, and carries the line id", () => {
  const r = splitLine("[Fri Jul 17 18:41:14 2026] Hello world", 42);
  assert.ok(r);
  assert.equal(r!.message, "Hello world");
  assert.match(r!.at, /^2026-07-17T/);
  assert.equal(r!.logId, 42);
  assert.equal(r!.raw, "[Fri Jul 17 18:41:14 2026] Hello world");
});

test("splitLine tolerates a space-padded day", () => {
  const r = splitLine("[Sun Jul  7 09:05:00 2026] x");
  assert.ok(r);
  assert.match(r!.at, /^2026-07-07T/);
});

test("splitLine rejects a line with no timestamp — a wrapped continuation, not an event", () => {
  assert.equal(splitLine("  Policy set or a policy with unsafe-eval enabled."), null);
  assert.equal(splitLine(""), null);
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

// The auto-store forms and the stack counts below are verbatim shapes from a real
// EQL log — they were silently unparsed (or under-counted) before.
test("each loot line records what became of the item", () => {
  const kept = parseLogLine("[Fri Jul 17 18:41:14 2026] --You have looted a Bone Chips from a skeleton's corpse.--");
  assert.equal(kept!.fate, "kept");
  assert.equal(kept!.detail, undefined);

  const sold = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Snake Egg from an asp's corpse and sold it for 4 copper.",
  );
  assert.equal(sold!.fate, "sold");
  assert.equal(sold!.detail, "4 copper");

  const stored = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Spiderling Silk from a rock spider's corpse and stored it in your tradeskill depot",
  );
  assert.equal(stored!.fate, "stored");
  assert.equal(stored!.detail, "tradeskill depot");

  const combined = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Crushbone Belt +2 from an orc's corpse to create a Crushbone Belt +5.",
  );
  assert.equal(combined!.fate, "combined");
  assert.equal(combined!.detail, "Crushbone Belt +5");
});

// Coin. The line names neither mob nor item — only which of the two paid — so `from` is the
// whole basis for keeping the two money ledgers apart downstream (ADR 0047).
test("parses coin off a corpse", () => {
  const e = parseCoinLine("[Fri Jul 17 18:41:14 2026] You receive 3 silver and 2 copper from the corpse.");
  assert.ok(e);
  assert.equal(e!.kind, "coin");
  assert.equal(e!.from, "corpse");
  assert.equal(e!.copper, 32);
});

test("parses coin from an auto-sold item, and says it came from the item", () => {
  const e = parseCoinLine("[Fri Jul 17 18:41:14 2026] You receive 4 copper from that item.");
  assert.ok(e);
  assert.equal(e!.from, "item");
  assert.equal(e!.copper, 4);
});

test("a 'You receive' line with no coin in it is not a coin line", () => {
  assert.equal(parseCoinLine("[Fri Jul 17 18:41:14 2026] You receive a Gnoll Fang from the corpse."), null);
  assert.equal(parseCoinLine("[Fri Jul 17 18:41:14 2026] You receive 3 silver from a vendor."), null);
});

test("an auto-sell states the item's price, which is parsed off the loot line itself", () => {
  const one = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Snake Egg from an asp's corpse and sold it for 4 copper.",
  );
  assert.equal(one!.soldFor, 4);

  // A stack's price is for the whole stack — the unit price is the caller's division.
  const stack = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted 2 Spiderling Eye from a spiderling's corpse and sold it for 1 silver and 4 copper.",
  );
  assert.equal(stack!.soldFor, 14);
  assert.equal(stack!.qty, 2);

  // Every other fate: the log states no price, so there isn't one to invent.
  const kept = parseLogLine("[Fri Jul 17 18:41:14 2026] --You have looted a Bone Chips from a skeleton's corpse.--");
  assert.equal(kept!.soldFor, undefined);
  const stored = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Spiderling Silk from a rock spider's corpse and stored it in your tradeskill depot",
  );
  assert.equal(stored!.soldFor, undefined);
});

test("parses the auto-store (tradeskill depot) loot line", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted a Spiderling Silk from a rock spider's corpse and stored it in your tradeskill depot",
  );
  assert.ok(e);
  assert.equal(e!.item, "Spiderling Silk");
  assert.equal(e!.source, "rock spider");
  assert.equal(e!.qty, 1);
});

test("a looted stack reports its count", () => {
  const e = parseLogLine(
    "[Fri Jul 17 18:41:14 2026] You looted 2 Spiderling Eye from a spiderling's corpse and sold it for 1 silver and 4 copper.",
  );
  assert.ok(e);
  assert.equal(e!.item, "Spiderling Eye");
  assert.equal(e!.qty, 2);
});

test("qty defaults to 1, and the count never lands in the item name", () => {
  const one = parseLogLine("[Fri Jul 17 18:41:14 2026] --You have looted a Bone Chips from a skeleton's corpse.--");
  assert.equal(one!.qty, 1);
  const many = parseLogLine("[Fri Jul 17 18:41:14 2026] --You have looted 4 Bone Chips from a skeleton's corpse.--");
  assert.equal(many!.qty, 4);
  assert.equal(many!.item, "Bone Chips");
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

test("parseLevelLine reads the level-up line, keeping the number", () => {
  // Verbatim from a real log: EQL puts both halves on one line.
  const real = parseLevelLine("[Tue Jul 28 23:33:10 2026] You have gained a level! Welcome to level 2!");
  assert.ok(real);
  assert.equal(real!.level, 2);

  const welcome = parseLevelLine("[Wed Jul 29 00:31:02 2026] Welcome to level 14!");
  assert.equal(welcome!.level, 14);

  // Either half alone still means "start the XP counter over", number or not.
  const gained = parseLevelLine("[Wed Jul 29 00:31:02 2026] You have gained a level!");
  assert.ok(gained);
  assert.equal(gained!.level, undefined);

  // An ability point is not a level.
  assert.equal(parseLevelLine("[Wed Jul 29 00:31:02 2026] You have gained an ability point!"), null);
});

test("parseLoginLine finds the line that starts a sitting, and not the level one", () => {
  // Verbatim from a real log — 12 of them across a fortnight, one per sitting.
  const login = parseLoginLine("[Tue Jul 21 20:23:23 2026] Welcome to EverQuest Legends!");
  assert.ok(login);
  assert.equal(login!.at, "2026-07-21T20:23:23");

  // The same words a level-up uses must not read as a login — that would restart the play
  // session every time you levelled.
  assert.equal(parseLoginLine("[Wed Jul 29 00:31:02 2026] Welcome to level 14!"), null);
  assert.equal(parseLoginLine("[Tue Jul 28 23:33:10 2026] You have gained a level! Welcome to level 2!"), null);
  // And the dispatcher agrees, which is what actually runs.
  assert.equal(parseLine("[Wed Jul 29 00:31:02 2026] Welcome to level 14!")?.kind, "level");
  assert.equal(parseLine("[Tue Jul 21 20:23:23 2026] Welcome to EverQuest Legends!")?.kind, "login");
});

test("parseGameTimeLine reads a real /time response, folding the 12-hour reading to 0-23", () => {
  // Verbatim from a live client's log:
  //   [Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 6 PM
  //   [Thu Sep 03 18:57:41 2026] Earth Time: Thursday, September 03, 2026 18:57:41
  const t = parseGameTimeLine("[Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 6 PM");
  assert.ok(t);
  assert.equal(t!.hour, 18);
  assert.equal(t!.at, "2026-09-03T18:57:41");

  // The companion "Earth Time" line names nothing this doesn't already have from the bracket
  // timestamp, and isn't the shape a `/time` reading takes — it must not be read as one.
  assert.equal(parseGameTimeLine("[Thu Sep 03 18:57:41 2026] Earth Time: Thursday, September 03, 2026 18:57:41"), null);

  // Midnight and noon, which read from opposite ends of `to24Hour`.
  assert.equal(parseGameTimeLine("[Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 12 AM")!.hour, 0);
  assert.equal(parseGameTimeLine("[Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 12 PM")!.hour, 12);

  // And the dispatcher agrees.
  assert.equal(parseLine("[Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 6 PM")?.kind, "gameTime");
});
