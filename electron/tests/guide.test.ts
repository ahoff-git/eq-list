/**
 * Black-box tests for how-to guide text and rules (`src/shared/help/guide.ts`): hotkeys and tab names are
 * resolved or checked against the code rather than typed into prose, so a guide can't quietly outlive the thing
 * it describes. Synthetic guides only — the real ones are held to these rules in `guides.test.ts`. Only need
 * re-running if the module changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_HOTKEYS, MAP_WINDOW, guideParts, guidePlainText, guideProblems, plainSectionLabel, type Guide } from "../../src/shared/help/guide";
import { LOOKUP_HOTKEY, OVERLAY_HOTKEY, STATS_HOTKEY } from "../../src/shared/constants";

const SECTIONS = new Set(["items", "search"]);
const guide = (over: Partial<Guide> = {}): Guide => ({
  id: "read-stats",
  title: "Read your stats",
  gist: "Plan from your real numbers.",
  section: "items",
  steps: ["Open the **Inventory** window.", "Press {hotkey:stats}."],
  ...over,
});
const problems = (over: Partial<Guide>) => guideProblems([guide(over)], SECTIONS).join(" | ");

test("the hotkeys a guide can name are the ones main registers, not copies of them", () => {
  assert.equal(GUIDE_HOTKEYS.overlay, OVERLAY_HOTKEY.label);
  assert.equal(GUIDE_HOTKEYS.lookup, LOOKUP_HOTKEY.label);
  assert.equal(GUIDE_HOTKEYS.stats, STATS_HOTKEY.label);
});

test("text is read as plain words, a bold label, and a hotkey", () => {
  assert.deepEqual(guideParts("Press {hotkey:stats}, then **Read my stats** or drag."), [
    { kind: "text", text: "Press " },
    { kind: "key", text: STATS_HOTKEY.label },
    { kind: "text", text: ", then " },
    { kind: "bold", text: "Read my stats" },
    { kind: "text", text: " or drag." },
  ]);
  assert.deepEqual(guideParts("Nothing special."), [{ kind: "text", text: "Nothing special." }]);
  assert.deepEqual(guideParts(""), []);
});

test("a hotkey that doesn't exist stays visibly wrong rather than blank", () => {
  assert.deepEqual(guideParts("Press {hotkey:nope}."), [
    { kind: "text", text: "Press " },
    { kind: "text", text: "{hotkey:nope}" },
    { kind: "text", text: "." },
  ]);
});

test("plain text is what the parts add up to", () => {
  assert.equal(guidePlainText("Press {hotkey:lookup} on **Search**."), `Press ${LOOKUP_HOTKEY.label} on Search.`);
});

test("a button names the tab, not the count or state the tab is wearing", () => {
  assert.equal(plainSectionLabel("Alerts (6)"), "Alerts");
  assert.equal(plainSectionLabel("Peers (off)"), "Peers");
  assert.equal(plainSectionLabel("Crafting log (3)"), "Crafting log");
  assert.equal(plainSectionLabel("Inventory & exports"), "Inventory & exports");
  assert.equal(plainSectionLabel("What's new (2)"), "What's new");
  assert.equal(plainSectionLabel(""), "");
});

test("a good guide has no problems", () => {
  assert.deepEqual(guideProblems([guide(), guide({ id: "second-one", tips: ["It only reads what is on screen."] })], SECTIONS), []);
  assert.deepEqual(guideProblems([], SECTIONS), []);
});

test("a guide is held to the nav: its section must exist", () => {
  assert.match(problems({ section: "renamed-tab" }), /section "renamed-tab" is not in the nav/);
});

test("the map is the one thing a guide can be about that is not a section — it is a window", () => {
  assert.equal(problems({ section: MAP_WINDOW }), "");
  assert.match(problems({ section: "map-tab" }), /not in the nav/);
});

test("an id is kebab-case and used once", () => {
  assert.match(problems({ id: "Read Stats" }), /kebab-case/);
  assert.match(guideProblems([guide(), guide()], SECTIONS).join(), /used twice/);
});

test("it needs words and steps", () => {
  assert.match(problems({ title: " " }), /no title/);
  assert.match(problems({ gist: "" }), /no gist/);
  assert.match(problems({ steps: [] }), /no steps/);
  assert.match(problems({ steps: ["Fine.", " "] }), /an empty line/);
  assert.match(problems({ tips: [""] }), /an empty line/);
});

test("a hotkey token must name a real hotkey", () => {
  assert.match(problems({ steps: ["Press {hotkey:nope}."] }), /no hotkey called "nope"/);
  assert.equal(problems({ steps: ["Press {hotkey:overlay}."] }), "");
});

test("a registered hotkey can't be typed out by hand — it would be wrong the day it changed", () => {
  assert.match(problems({ steps: ["Press Ctrl+Shift+K."] }), /by hand/);
  assert.match(problems({ steps: ["Press **Cmd + Shift + L**."] }), /by hand/);
  assert.equal(problems({ steps: ["Press Alt+← to go back."] }), "", "a key with no constant is fine to name");
});

test("markup left open is caught", () => {
  assert.match(problems({ steps: ["Click **Read my stats."] }), /unclosed/);
  assert.match(problems({ steps: ["Click {this}."] }), /stray brace/);
});
