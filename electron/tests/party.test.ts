/**
 * Black-box tests for the two halves of "who's in your group": the line grammar
 * (`parseParty`) and the roster it feeds (`createParty`).
 *
 * The grammar is the risky half — the wordings are a client's, not something the app
 * controls — so the sentences here are pinned verbatim, including the ones that must *not*
 * match. Only needs re-running if `log-parser.ts` or `party.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParty, splitLine } from "../../src/shared/log-parser";
import { createParty } from "../../src/shared/party";
import type { PartyEvent } from "../../src/shared/types";

/** A raw log line in, a party event (or null) out — the way the watcher asks. */
function party(message: string): PartyEvent | null {
  return parseParty(splitLine(`[Mon Jul 20 19:08:30 2026] ${message}`, 1)!);
}

/** The roster after a run of lines, in join order. */
function rosterAfter(messages: string[]): string[] {
  const roster = createParty();
  for (const message of messages) {
    const event = party(message);
    if (event) roster.note(event);
  }
  return roster.members();
}

test("people joining and leaving are read from the group's own announcements", () => {
  assert.deepEqual(party("Bunnyslayer has joined the group."), {
    kind: "party",
    change: "joined",
    who: "Bunnyslayer",
    logId: 1,
    at: "2026-07-20T19:08:30",
    raw: "[Mon Jul 20 19:08:30 2026] Bunnyslayer has joined the group.",
  });
  assert.equal(party("Bunnyslayer has left the group.")?.change, "left");
  assert.equal(party("You remove Bunnyslayer from the group.")?.who, "Bunnyslayer");
  assert.equal(party("Bunnyslayer was removed from the group.")?.change, "left");
});

test("the same sentence about yourself means the group changed, not a member", () => {
  // "X has left the group" and "You have left the group" are one grammar and two meanings.
  assert.deepEqual(party("You have left the group.")?.change, "cleared");
  assert.deepEqual(party("You have joined the group.")?.change, "cleared");
  assert.deepEqual(party("You have been removed from the group.")?.change, "cleared");
  assert.deepEqual(party("Your group has been disbanded.")?.change, "cleared");
  // Nobody is named by any of them — there's nobody to name.
  assert.equal(party("Your group has been disbanded.")?.who, undefined);
});

test("group chat is membership evidence — the only kind a standing group produces", () => {
  assert.deepEqual(party("Bunnyslayer tells the group, 'inc two'")?.who, "Bunnyslayer");
  // Yours says you're grouped and nothing more, so it changes nothing — and must not read
  // as *you* joining, which would wipe the roster on every line you typed.
  assert.equal(party("You tell your party, 'oom'"), null);
});

test("lines that aren't about your group aren't party lines", () => {
  assert.equal(party("Bunnyslayer invites you to join a group."), null); // an offer, not a group
  assert.equal(party("To join the group, click on the 'FOLLOW' option, or 'DECLINE' to cancel."), null);
  assert.equal(party("Bunnyslayer tells you, 'has joined the group.'"), null);
  assert.equal(party("You say, 'Bunnyslayer has joined the group.'"), null);
});

test("the roster is the running total of those lines", () => {
  assert.deepEqual(
    rosterAfter([
      "Bunnyslayer has joined the group.",
      "Hullshamancer has joined the group.",
      "Bunnyslayer has left the group.",
      "Jarn tells the group, 'ready'",
    ]),
    ["Hullshamancer", "Jarn"],
  );
});

test("joining another group forgets the last one", () => {
  assert.deepEqual(
    rosterAfter([
      "Bunnyslayer has joined the group.",
      "You have joined the group.",
      "Hullshamancer has joined the group.",
    ]),
    ["Hullshamancer"],
  );
});

test("a member's pet is the member, and a stranger's isn't", () => {
  const roster = createParty();
  roster.note(party("Bunnyslayer has joined the group.")!);
  assert.equal(roster.has("Bunnyslayer"), true);
  assert.equal(roster.has("bunnyslayer"), true); // the log capitalizes as the sentence needs
  assert.equal(roster.has("Bunnyslayer`s warder"), true);
  assert.equal(roster.has("Randomguy`s warder"), false);
  assert.equal(roster.has("a coyote"), false);
  assert.equal(roster.has(""), false);
});

test("a member announced twice is still one member", () => {
  assert.deepEqual(
    rosterAfter([
      "Bunnyslayer has joined the group.",
      "Bunnyslayer tells the group, 'pulling'",
      "bunnyslayer tells the group, 'inc'",
    ]),
    ["Bunnyslayer"],
  );
});
