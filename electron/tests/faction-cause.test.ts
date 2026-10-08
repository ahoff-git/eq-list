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
} from "../../src/shared/faction/faction-cause";
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

test("NPC dialogue is offered as the cause when no kill explains the hit, once matched to a quest", () => {
  // A bare "says"/"tells you" line is no longer enough on its own (ADR 0261, below) — a real quest
  // match is what makes this a dialogue cause rather than silence.
  const tracker = createFactionCauseTracker({ questGiver: () => ["Proving Your Worth"] });
  tracker.noteLine(line(8, "Bumle Reminjar tells you, 'You have proven yourself worthy.'"));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Bumle Reminjar",
    text: "You have proven yourself worthy.",
    gapSec: 2,
    quests: ["Proving Your Worth"],
    questsMatched: false,
  });
});

test("both dialogue grammars match — 'says' with or without a comma, and 'tells you'", () => {
  const deps = { questGiver: () => ["Any Quest"] };
  const withComma = createFactionCauseTracker(deps);
  withComma.noteLine(line(9, "Vira says, 'Well done.'"));
  assert.equal(withComma.resolve(hit(10)).causedBy?.kind, "dialogue");

  const noComma = createFactionCauseTracker(deps);
  noComma.noteLine(line(9, "Vira says 'Well done.'"));
  assert.equal(noComma.resolve(hit(10)).causedBy?.kind, "dialogue");

  const tellsYou = createFactionCauseTracker(deps);
  tellsYou.noteLine(line(9, "Bristlebane tells you, 'The trickster smiles upon you.'"));
  assert.deepEqual(tellsYou.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Bristlebane",
    text: "The trickster smiles upon you.",
    gapSec: 1,
    quests: ["Any Quest"],
    questsMatched: false,
  });
});

test("a kill explains a hit before dialogue is even considered", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:09");
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 1 });
});

test("dialogue still explains a hit the kill window missed, since its own window is wider", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  // Well outside CORRELATION_WINDOW_SEC (a kill this old would never be blamed) but inside
  // DIALOGUE_WINDOW_SEC — a turn-in is a slower, multi-step interaction than a kill's instant update.
  const dialogueSec = 10 - (CORRELATION_WINDOW_SEC + 1);
  assert.ok(CORRELATION_WINDOW_SEC + 1 <= DIALOGUE_WINDOW_SEC, "the test's own premise");
  tracker.noteLine(line(dialogueSec, "Vira says, 'Well done.'"));
  assert.equal(tracker.resolve(hit(10)).causedBy?.kind, "dialogue");
});

// A base second of 50 (not 10) for every test below that reaches DIALOGUE_WINDOW_SEC (15) seconds
// backward: `10 - DIALOGUE_WINDOW_SEC - 1` is -6, and `line()`/`hit()` format a negative second as the
// literal string "-6" — `Date.parse("...T00:00:-6")` is `NaN`, not a real moment in the past. A `NaN`
// gap fails every window check trivially, so a test built on it "passes" whether or not the window
// logic is even correct. 50 keeps every offset non-negative and genuinely inside this minute.
test("a dialogue line right at the edge of its window still counts; one second past it doesn't (exact boundary)", () => {
  const base = 50;
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(base - DIALOGUE_WINDOW_SEC, "Vira says, 'Well done.'"));
  assert.equal(tracker.resolve(hit(base)).causedBy?.kind, "dialogue", "exactly the window's width is still in range");

  const tooLate = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tooLate.noteLine(line(base - DIALOGUE_WINDOW_SEC - 1, "Vira says, 'Well done.'"));
  assert.equal(tooLate.resolve(hit(base)).causedBy, undefined, "one second past the window is too far to blame");
});

test("dialogue outside its own, wider window is not offered either", () => {
  // A real `questGiver` dependency this time: without one, `causedBy` is `undefined` no matter what
  // the window says (ADR 0261), which would make this assertion pass even if the window check were
  // broken. With one wired in, `causedBy` only stays `undefined` because the gap genuinely exceeds
  // DIALOGUE_WINDOW_SEC.
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  const base = 50;
  tracker.noteLine(line(base - DIALOGUE_WINDOW_SEC - 1, "Vira says, 'Well done.'"));
  const resolved = tracker.resolve(hit(base));
  assert.equal(resolved.causedBy, undefined, "one second past the window is too far to blame");
  assert.equal(resolved.unmatchedDialogue, undefined, "too far away to even carry forward as unmatched (ADR 0282)");
});

test("a fuzzy match scoring exactly DIALOGUE_MATCH_MIN_SCORE still narrows the quest — the threshold is inclusive", () => {
  // fuzzyScore("Abcd.", "Abxy") is exactly 0.5 against the real scorer (two of four letters
  // substituted) — checked directly against `fuzzyScore`, not asserted blind, since the matching
  // threshold is itself a tuned constant this task must not re-litigate.
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Quest A", "Quest B"],
    questDialogue: (q) =>
      q === "Quest A" ? [{ npc: "Vira", text: "Abxy" }] : [{ npc: "Vira", text: "Completely unrelated line of dialogue text" }],
  });
  tracker.noteLine(line(8, "Vira says, 'Abcd.'"));
  const causedBy = tracker.resolve(hit(10)).causedBy;
  assert.deepEqual(
    causedBy?.kind === "dialogue" ? { quests: causedBy.quests, questsMatched: causedBy.questsMatched } : undefined,
    { quests: ["Quest A"], questsMatched: true },
    "a score of exactly 0.5 is still >= DIALOGUE_MATCH_MIN_SCORE, so this narrows rather than falling back unnarrowed",
  );
});

// ─── Competing candidates and state across several events (ADR 0224's own concern, generalized) ─

test("a kill barely inside its window still wins over a dialogue line that is numerically much closer", () => {
  // The module header claims the kill always wins when in-window, regardless of how much closer the
  // dialogue line is — not just when the kill also happens to be the nearer of the two.
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(9, "Vira says, 'Well done.'")); // gapSec 1 if it were ever asked
  tracker.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 - CORRELATION_WINDOW_SEC).padStart(2, "0")}`); // gapSec exactly 3, the edge
  assert.deepEqual(
    tracker.resolve(hit(10)).causedBy,
    { kind: "kill", mob: "a gnoll pup", gapSec: CORRELATION_WINDOW_SEC },
    "the kill is barely in range, but still wins outright over the far closer dialogue line",
  );
});

test("a kill just past its window no longer blocks a dialogue line that is in range from being used", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  tracker.noteKill("a gnoll pup", `2026-07-29T00:00:${String(10 - CORRELATION_WINDOW_SEC - 1).padStart(2, "0")}`);
  assert.deepEqual(
    tracker.resolve(hit(10)).causedBy,
    { kind: "dialogue", npc: "Vira", text: "Well done.", gapSec: 2, quests: ["Any Quest"], questsMatched: false },
    "the kill missed its own window by one second, so dialogue is consulted and wins, not silence",
  );
});

test("an ordinary line between two dialogue lines doesn't clear the last real one — only another match overwrites it", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(7, "Vira says, 'Well done.'"));
  tracker.noteLine(line(8, "You have entered Blackburrow.")); // not shaped like dialogue at all
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, {
    kind: "dialogue",
    npc: "Vira",
    text: "Well done.",
    gapSec: 3,
    quests: ["Any Quest"],
    questsMatched: false,
  });
});

test("an ordinary line doesn't clear a noted kill either — only a later kill ever displaces one", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:08");
  tracker.noteLine(line(9, "You have entered Blackburrow."));
  assert.deepEqual(tracker.resolve(hit(10)).causedBy, { kind: "kill", mob: "a gnoll pup", gapSec: 2 });
});

test("only the most recent dialogue line is remembered — a later, unmatched one displaces an earlier matched one", () => {
  // Mirrors "only the most recent kill is remembered": `lastDialogue` holds exactly one slot, so a
  // second real line of dialogue overwrites the first even when the first would have resolved to a
  // cause and the second doesn't.
  const tracker = createFactionCauseTracker({ questGiver: (npc) => (npc === "Vira" ? ["Any Quest"] : []) });
  tracker.noteLine(line(7, "Vira says, 'Well done.'"));
  tracker.noteLine(line(9, "Some Rando says, 'hey'"));
  const resolved = tracker.resolve(hit(10));
  assert.equal(resolved.causedBy, undefined, "the second, unmatched line is all that's remembered now");
  assert.deepEqual(resolved.unmatchedDialogue, { npc: "Some Rando", text: "hey", gapSec: 1 });
});

test("an ordinary line that isn't shaped like dialogue teaches nothing", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(9, "You have entered Blackburrow."));
  assert.equal(tracker.resolve(hit(10)).causedBy, undefined);
});

test("explainUnsourcedCoin makes the same guess, for a coin line instead of a faction hit", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Any Quest"] });
  tracker.noteLine(line(8, "Vira says, 'Here is your reward.'"));
  assert.deepEqual(tracker.explainUnsourcedCoin("2026-07-29T00:00:10"), {
    kind: "dialogue",
    npc: "Vira",
    text: "Here is your reward.",
    gapSec: 2,
    quests: ["Any Quest"],
    questsMatched: false,
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

test("a speaker the lookup doesn't recognize is no cause at all, not a dialogue cause with no quest (ADR 0261)", () => {
  // Before ADR 0261 this fell back to a dialogue cause naming no quest; real data showed that fallback
  // was, more often than not, a hostile mob's own combat social rather than an uncached quest giver —
  // see the module header and `questsForSpeaker`.
  const tracker = createFactionCauseTracker({ questGiver: () => [] });
  tracker.noteLine(line(8, "Some Rando says, 'hey'"));
  assert.equal(tracker.resolve(hit(10)).causedBy, undefined);
});

test("with no questGiver dependency at all, a dialogue line produces no cause at all (ADR 0261)", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  assert.equal(tracker.resolve(hit(10)).causedBy, undefined);
});

// ─── Carrying an unmatched dialogue line forward, so it can be rechecked later (ADR 0282) ──────

test("a dialogue line in window that matches no quest leaves unmatchedDialogue behind, not just a bare resolve", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => [] });
  tracker.noteLine(line(8, "Some Rando says, 'hey'"));
  const resolved = tracker.resolve(hit(10));
  assert.equal(resolved.causedBy, undefined, "still no cause — ADR 0261 stands");
  assert.deepEqual(resolved.unmatchedDialogue, { npc: "Some Rando", text: "hey", gapSec: 2 });
});

test("with no questGiver dependency at all, the unmatched line is still carried forward", () => {
  const tracker = createFactionCauseTracker();
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  const resolved = tracker.resolve(hit(10));
  assert.equal(resolved.causedBy, undefined);
  assert.deepEqual(resolved.unmatchedDialogue, { npc: "Vira", text: "Well done.", gapSec: 2 });
});

test("a matched dialogue cause carries no unmatchedDialogue alongside it — nothing left to retry", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => ["Proving Your Worth"] });
  tracker.noteLine(line(8, "Bumle Reminjar tells you, 'You have proven yourself worthy.'"));
  const resolved = tracker.resolve(hit(10));
  assert.equal(resolved.causedBy?.kind, "dialogue");
  assert.equal(resolved.unmatchedDialogue, undefined);
});

test("a kill cause leaves no unmatchedDialogue even if an (unchecked) dialogue line was also nearby", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => [] });
  tracker.noteLine(line(8, "Some Rando says, 'hey'"));
  tracker.noteKill("a gnoll pup", "2026-07-29T00:00:09");
  const resolved = tracker.resolve(hit(10));
  assert.equal(resolved.causedBy?.kind, "kill");
  assert.equal(resolved.unmatchedDialogue, undefined, "the kill explained it first; dialogue was never even asked");
});

test("no dialogue nearby at all leaves no unmatchedDialogue — scoped to hits that actually saw a line (ADR 0281's real population)", () => {
  const tracker = createFactionCauseTracker();
  assert.equal(tracker.resolve(hit(10)).unmatchedDialogue, undefined);

  // Base second 50, not 10: `10 - DIALOGUE_WINDOW_SEC - 1` is negative, and a negative second formats
  // as e.g. "-6", which `Date.parse` reads as `NaN` rather than a real moment — the assertion below
  // would then pass on a `NaN` gap failing the window check for free, not because the gap is
  // genuinely too wide. 50 keeps the gap a real, computable number.
  const outsideWindow = createFactionCauseTracker();
  outsideWindow.noteLine(line(50 - DIALOGUE_WINDOW_SEC - 1, "Vira says, 'Well done.'"));
  assert.equal(outsideWindow.resolve(hit(50)).unmatchedDialogue, undefined, "too far away to count as 'nearby' at all");
});

test("explainUnsourcedCoin never carries unmatchedDialogue — there's no ledger row behind a coin line to recheck later", () => {
  const tracker = createFactionCauseTracker({ questGiver: () => [] });
  tracker.noteLine(line(8, "Some Rando says, 'hey'"));
  assert.equal(tracker.explainUnsourcedCoin("2026-07-29T00:00:10"), undefined);
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

// ─── A giver only names a quest once it's a confirmed mob (ADR 0257) ───────────────────────────

test("a giver isMob says isn't a mob gets no cause at all, even though questGiver would name a quest", () => {
  const tracker = createFactionCauseTracker({
    questGiver: (npc) => (npc === "A Dusty Tome" ? ["Shovel of Ponz"] : []),
    isMob: () => false,
  });
  tracker.noteLine(line(8, "A Dusty Tome says, 'You have proven yourself worthy.'"));
  assert.equal(
    tracker.resolve(hit(10)).causedBy,
    undefined,
    "an unconfirmed giver is no cause at all, not a dialogue cause naming no quest",
  );
});

test("a giver isMob confirms is a mob still gets its quest, same as without the check", () => {
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz", "Torch of Alna"],
    isMob: (npc) => npc === "Vira",
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

test("with no isMob dependency at all, a giver still names its quests, unchanged from before ADR 0257", () => {
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz"],
  });
  tracker.noteLine(line(8, "Vira says, 'Well done.'"));
  const causedBy = tracker.resolve(hit(10)).causedBy;
  assert.deepEqual(causedBy?.kind === "dialogue" ? causedBy.quests : undefined, ["Shovel of Ponz"]);
});

test("questDialogue is never consulted once isMob has already ruled the giver out", () => {
  let asked = false;
  const tracker = createFactionCauseTracker({
    questGiver: () => ["Shovel of Ponz", "Torch of Alna"],
    questDialogue: (quest) => {
      asked = true;
      return [{ npc: "A Dusty Tome", text: quest }];
    },
    isMob: () => false,
  });
  tracker.noteLine(line(8, "A Dusty Tome says, 'Anything at all.'"));
  tracker.resolve(hit(10));
  assert.equal(asked, false, "nothing left to narrow once the giver isn't even a candidate");
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
