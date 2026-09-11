/**
 * Tests for the faction-hit cause guesser: a kill noted within the correlation window of a faction
 * line gets offered as its likely cause — **either side** of it, since a real log showed this server
 * logs a kill's consequences before its own confirmation about as often as after (ADR 0224) — and
 * everything outside the window is left alone. Pure logic, no I/O — see `src/shared/faction-cause.ts`'s
 * header for why this is a guess and not a parsed fact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRELATION_WINDOW_SEC,
  DIALOGUE_WINDOW_SEC,
  FACTION_CAUSE_SAMPLES,
  causeConfidence,
  causeConfidenceWhy,
  createFactionCauseTracker,
} from "../../src/shared/faction-cause";
import type { FactionEvent, FactionCauseTally, LogLine } from "../../src/shared/types";

function hit(sec: number, faction = "Agents of Mistmoore"): FactionEvent {
  return {
    kind: "faction",
    faction,
    delta: -3,
    direction: "lowered",
    logId: sec,
    raw: "faction hit",
    at: `2026-07-29T00:00:${String(sec).padStart(2, "0")}`,
  };
}

function line(sec: number, message: string): LogLine {
  return { logId: sec, message, raw: message, at: `2026-07-29T00:00:${String(sec).padStart(2, "0")}` };
}

test("with no kill ever noted, nothing is attributed", () => {
  const tracker = createFactionCauseTracker();
  assert.deepEqual(tracker.resolve(hit(10)), hit(10));
});

test("a kill just before the hit is offered as the cause, with the true gap", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:08");
  const original = hit(10);
  const resolved = tracker.resolve(original);
  assert.deepEqual(resolved.causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 2 });
  // The original event is untouched — a caller holding it doesn't see it mutated.
  assert.notEqual(resolved, original);
  assert.deepEqual(original, hit(10));
});

test("a kill in the same second as the hit counts, at a zero gap", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:10");
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 0 });
});

test("a kill right at the edge of the window still counts; one second past it doesn't", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 - CORRELATION_WINDOW_SEC).padStart(2, "0")}`);
  assert.ok(tracker.resolve(hit(10)).causedBy, "exactly the window's width is still in range");

  const tooEarly = createFactionCauseTracker();
  tooEarly.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 - CORRELATION_WINDOW_SEC - 1).padStart(2, "0")}`);
  assert.equal(tooEarly.resolve(hit(10)).causedBy, undefined, "one second past the window is too far to blame");
});

test("a kill logged shortly after the hit counts too — this server logs a kill's consequences before its own confirmation about as often as after (real-log finding, ADR 0224)", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 + CORRELATION_WINDOW_SEC).padStart(2, "0")}`);
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: CORRELATION_WINDOW_SEC });

  const tooLate = createFactionCauseTracker();
  tooLate.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 + CORRELATION_WINDOW_SEC + 1).padStart(2, "0")}`);
  assert.equal(tooLate.resolve(hit(10)).causedBy, undefined, "one second past the window, either direction, is too far to blame");
});

test("only the most recent kill is remembered — a later one displaces an earlier one", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:07");
  tracker.noteKill("a gnoll", "2026-07-29T00:00:09");
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll", gapSec: 1 });
});

test("one kill can be blamed for several faction hits in a row — a mob can move more than one faction", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:09");
  const a = tracker.resolve(hit(10, "Agents of Mistmoore"));
  const b = tracker.resolve(hit(10, "Priests of Marr"));
  assert.deepEqual(a.causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 1 });
  assert.deepEqual(b.causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 1 });
});

test("NPC dialogue is offered as the cause when no kill explains the hit", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Bumle Reminjar tells you, 'You have proven yourself worthy.'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Bumle Reminjar",
    text: "You have proven yourself worthy.",
    gapSec: 2,
  });
});

test("both dialogue grammars match — 'says' with or without a comma, and 'tells you'", () => {
  const withComma = createFactionCauseTracker();
  withComma.noteLine(line(9, "Vira says, 'Well done.'"));
  assert.equal(withComma.resolve(hit(10)).causedBy?.kind, "dialogue");

  const noComma = createFactionCauseTracker();
  noComma.noteLine(line(9, "Vira says 'Well done.'"));
  assert.equal(noComma.resolve(hit(10)).causedBy?.kind, "dialogue");

  const tellsYou = createFactionCauseTracker();
  tellsYou.noteLine(line(9, "Bristlebane tells you, 'The trickster smiles upon you.'"));
  assert.deepEqual(tellsYou.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Bristlebane",
    text: "The trickster smiles upon you.",
    gapSec: 1,
  });
});

test("a kill explains a hit before dialogue is even considered", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:09");
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 1 });
});

test("dialogue still explains a hit the kill window missed, since its own window is wider", () => {
  const tracker = createFactionCauseTracker();
  // Well outside CORRELATION_WINDOW_SEC (a kill this old would never be blamed) but inside
  // DIALOGUE_WINDOW_SEC — a turn-in is a slower, multi-step interaction than a kill's instant update.
  const dialogueSec = 10 - (CORRELATION_WINDOW_SEC + 1);
  assert.ok(CORRELATION_WINDOW_SEC + 1 <= DIALOGUE_WINDOW_SEC, "the test's own premise");
  tracker.noteLine(line(dialogueSec, "Vira says, 'Well done.'"));
  assert.equal(tracker.resolve(hit(10)).causedBy?.kind, "dialogue");
});

test("dialogue outside its own, wider window is not offered either", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(10 - DIALOGUE_WINDOW_SEC - 1, "Vira says, 'Well done.'"));
  assert.equal(tracker.resolve(hit(10)).causedBy, undefined);
});

test("an ordinary line that isn't shaped like dialogue teaches nothing", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(9, "You have entered Blackburrow."));
  assert.equal(tracker.resolve(hit(10)).causedBy, undefined);
});

test("explainUnsourcedCoin makes the same guess, for a coin line instead of a faction hit", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Vira says, 'Here is your reward.'"));
  assert.deepEqual(tracker.explainUnsourcedCoin("2026-07-29T00:00:10"), {
    kind: "dialogue",
    npc: "Vira",
    text: "Here is your reward.",
    gapSec: 2,
  });
  assert.equal(
    createFactionCauseTracker().explainUnsourcedCoin("2026-07-29T00:00:10"),
    undefined,
    "nothing noted at all",
  );
});

test("with no questDialogue dependency, a dialogue cause lists every quest the giver has, unmatched", () => {
  const tracker = createFactionCauseTracker({
    questGiver: (npc) => (npc === "Vira" ? ["Shovel of Ponz", "Torch of Alna"] : []),
  });
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Vira",
    text: "Well done.",
    gapSec: 2,
    quests: ["Shovel of Ponz", "Torch of Alna"],
    questsMatched: false,
  });
});

test("a speaker the lookup doesn't recognize gets no `quests` field at all — not an empty list", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => [] });
  tracker.noteLine(line(8, "Some Rando says, 'hey'"));
  const causedBy = tracker.resolve(hit(10)).causedBy;
  assert.equal(causedBy?.kind, "dialogue");
  assert.equal("quests" in (causedBy ?? {}), false);
});

test("with no questGiver dependency at all, a dialogue cause is unchanged from before ADR 0221", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "dialogue", npc: "Vira", text: "Well done.", gapSec: 2 });
});

test("the giver lookup is never asked about a kill cause", () => {
  let asked = false;
  const tracker = createFactionCauseTracker({
    questGiver: () => {
      asked = true;
      return [];
    },
  });
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:09");
  tracker.resolve(hit(10));
  assert.equal(asked, false, "a kill cause never needs the giver lookup at all");
});

// ─── Narrowing a giver's quests by matching the observed line (ADR 0223) ────────────────────────

const QUEST_DIALOGUE: Record<string, { npc: string; text: string }[]> = {
  "Shovel of Ponz": [
    { npc: "Vira", text: "I hold the secrets to the construction of four tools which assist magicians." },
    { npc: "Vira", text: "Each of the four items needed to construct the famed Shovel of Ponz! Very well." },
  ],
  "Torch of Alna": [{ npc: "Vira", text: "The torch of Alna burns with the fire of a thousand suns." }],
};

test("the observed line narrows a giver's quests down to the one it actually resembles", () => {
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz", "Torch of Alna"],
    questDialogue: (quest) => QUEST_DIALOGUE[quest],
  });
  tracker.noteLine(line(8, "Vira says, 'Each of the four items needed to construct the famed Shovel of Ponz!'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Vira",
    text: "Each of the four items needed to construct the famed Shovel of Ponz!",
    gapSec: 2,
    quests: ["Shovel of Ponz"],
    questsMatched: true,
  });
});

test("a line that resembles none of the giver's quests falls back to the unnarrowed list", () => {
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz", "Torch of Alna"],
    questDialogue: (quest) => QUEST_DIALOGUE[quest],
  });
  tracker.noteLine(line(8, "Vira says, 'Completely unrelated weather today, is it not?'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Vira",
    text: "Completely unrelated weather today, is it not?",
    gapSec: 2,
    quests: ["Shovel of Ponz", "Torch of Alna"],
    questsMatched: false,
  });
});

test("a giver of only one quest is never even compared — nothing left to narrow to", () => {
  let asked = false;
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Torch of Alna"],
    questDialogue: (quest) => {
      asked = true;
      return QUEST_DIALOGUE[quest];
    },
  });
  tracker.noteLine(line(8, "Vira says, 'Anything at all.'"));
  const causedBy = tracker.resolve(hit(10)).causedBy;
  assert.deepEqual(causedBy?.kind === "dialogue" ? causedBy.quests : undefined, ["Torch of Alna"]);
  assert.equal(causedBy?.kind === "dialogue" ? causedBy.questsMatched : undefined, false);
  assert.equal(asked, false, "one candidate needs no comparison at all");
});

test("a giver with quests but no cached dialogue for any of them falls back the same way", () => {
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz", "Torch of Alna"],
    questDialogue: () => undefined, // neither quest page has been fetched
  });
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  const causedBy = tracker.resolve(hit(10)).causedBy;
  assert.deepEqual(causedBy?.kind === "dialogue" ? causedBy.quests : undefined, ["Shovel of Ponz", "Torch of Alna"]);
  assert.equal(causedBy?.kind === "dialogue" ? causedBy.questsMatched : undefined, false);
});

// ─── Trusting a repeated guess more than a lone one (ADR 0225) ─────────────────────────────────

function tally(hits: number, kind: FactionCauseTally["kind"] = "dialogue"): FactionCauseTally {
  return { kind, source: "Vira", net: -hits, hits };
}

test("causeConfidence follows the same sample-size ladder as a respawn or a drop rate", () => {
  assert.equal(causeConfidence(tally(1)), "thin");
  assert.equal(causeConfidence(tally(FACTION_CAUSE_SAMPLES.fair)), "fair");
  assert.equal(causeConfidence(tally(FACTION_CAUSE_SAMPLES.solid)), "solid");
  assert.equal(causeConfidence(tally(FACTION_CAUSE_SAMPLES.solid + 5)), "solid");
});

test("causeConfidenceWhy names the actual hit count behind every tier, not just the color", () => {
  assert.match(causeConfidenceWhy(tally(1)), /only 1 hit/);
  assert.match(causeConfidenceWhy(tally(FACTION_CAUSE_SAMPLES.fair)), new RegExp(`${FACTION_CAUSE_SAMPLES.fair} hits`));
  assert.match(causeConfidenceWhy(tally(FACTION_CAUSE_SAMPLES.solid)), new RegExp(`${FACTION_CAUSE_SAMPLES.solid} hits`));
});

test("causeConfidenceWhy names the mob for a kill cause and the name for a dialogue one", () => {
  assert.match(causeConfidenceWhy(tally(FACTION_CAUSE_SAMPLES.solid, "kill")), /same mob/);
  assert.match(causeConfidenceWhy(tally(FACTION_CAUSE_SAMPLES.solid, "dialogue")), /same name/);
});
