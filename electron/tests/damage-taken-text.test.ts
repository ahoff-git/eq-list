/**
 * Black-box tests for the words a resist suggestion is told in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adviceOf,
  describeAcSuggestion,
  describeHpSuggestion,
  describeManaSuggestion,
  describeStrain,
  describeSuggestion,
  describeSwingSuggestion,
  resistLabel,
} from "../../src/shared/combat/damage-taken-text";
import { figure } from "../../src/shared/format";
import type { ResistRow } from "../../src/shared/combat/resist-worth";
import type { SwingSuggestion } from "../../src/shared/combat/cruising";

const fire: ResistRow = { type: "fire", stat: "svFire", damage: 530, hits: 80, share: 0.53, saved: 0.027, flagged: true };

test("a resist is called what its item stat is called; Void has no stat to borrow from", () => {
  assert.equal(resistLabel(fire), "SV Fire");
  assert.equal(resistLabel({ type: "void", stat: null }), "Void resist");
});

test("the suggestion says how much, where, and what more would buy", () => {
  assert.equal(
    describeSuggestion(fire, "zone"),
    "Fire is 53% of the damage that landed on you since you arrived here. +30 SV Fire would cut about 2.7% of what you take.",
  );
});

test("the AC suggestion says why a resist won't do, what you wear, and what the loadout reaches", () => {
  assert.equal(
    describeAcSuggestion({ share: 0.74, wearing: 60, loadout: 125, gain: 65 }, "sitting"),
    "Melee is 74% of the damage that landed on you this sitting, and no resist touches it. You wear 60 AC; the loadout the builder planned for your goals reaches 125 (+65).",
  );
});

test("with the gear known it says what the gear gives, and the window changes the phrase", () => {
  const text = describeSuggestion({ ...fire, points: 12 }, "recent");
  assert.match(text, /in your recent fights\. Your gear gives 12 SV Fire\. \+30 SV Fire/);
});

test("the health suggestion says how often you died, and that more health helps whatever did it", () => {
  assert.equal(
    describeHpSuggestion({ died: 3, fights: 14, wearing: 44, loadout: 103, gain: 59 }, "zone"),
    "You died in 3 of 14 fights since you arrived here. More health helps whatever did it: your gear gives 44 and the loadout the builder planned for your goals reaches 103 (+59).",
  );
});

test("the mana suggestion says how often you ran out, among the fights you cast in", () => {
  assert.equal(
    describeManaSuggestion({ dry: 4, casting: 11, wearing: 991, loadout: 1653, gain: 662 }, "sitting"),
    "You ran out of mana in 4 of the 11 fights you cast in this sitting. Your gear gives 991 mana; the loadout the builder planned for your goals reaches 1653 (+662).",
  );
});

test("for one fight, a death is told as a death, with what landed on you first — not as a rate", () => {
  assert.equal(
    describeHpSuggestion({ died: 1, fights: 1, wearing: 44, loadout: 103, gain: 59, burst: { taken: 3062, windowSec: 15 } }, "fight"),
    `You died in this fight, after ${figure(3062)} damage in the last 15s. More health helps whatever did it: your gear gives 44 and the loadout the builder planned for your goals reaches 103 (+59, about 1.9% of that burst).`,
  );
  assert.match(describeHpSuggestion({ died: 1, fights: 1, wearing: 44, loadout: 103, gain: 59 }, "fight"), /^You died in this fight\. More health/, "no burst, no clause");
  assert.match(describeManaSuggestion({ dry: 2, casting: 1, wearing: 991, loadout: 1653, gain: 662 }, "fight"), /^You ran out of mana in this fight\. Your gear gives 991 mana/);
  assert.match(describeSuggestion(fire, "fight"), /^Fire is 53% of the damage that landed on you in this fight\./);
});

test("the strain line gives the figures even when they're too small to suggest anything", () => {
  assert.equal(describeStrain({ fights: 14, died: 0, casting: 11, dry: 1 }), "Died in 0 of 14 fights; ran out of mana in 1 of the 11 you cast in.");
  assert.equal(describeStrain({ fights: 6, died: 1, casting: 0, dry: 0 }), "Died in 1 of 6 fights.", "no casting, nothing to say about mana");
  assert.equal(describeStrain({ fights: 0, died: 0, casting: 0, dry: 0 }), "");
});

test("the advice reads armour, resists, mana, then health — the one that helps whatever did it, last", () => {
  const advice = adviceOf(
    {
      ac: { share: 0.74, wearing: 60, loadout: 125, gain: 65 },
      resists: [fire],
      mana: { dry: 4, casting: 11, wearing: 991, loadout: 1653, gain: 662 },
      hp: { died: 3, fights: 14, wearing: 44, loadout: 103, gain: 59 },
    },
    "zone",
  );
  assert.deepEqual(advice.map((a) => a.label), ["AC +65", "SV Fire 53%", "Mana +662", "HP +59"]);
  assert.match(advice[1].sentence, /^Fire is 53% of the damage/);
});

test("nothing found is no advice", () => {
  assert.deepEqual(adviceOf({ ac: null, resists: [], mana: null, hp: null }, "zone"), []);
});

const swing: SwingSuggestion = {
  plan: 20,
  lean: 26,
  gain: 6,
  fights: 32,
  takenRatio: 0.079,
  meleeShare: 0.53,
  falls: [
    { stat: "ac", plan: 180, lean: 140 },
    { stat: "mana", plan: 1500, lean: 900 },
  ],
};

test("the swing suggestion says why you can afford it, what the preset swings, and what it costs", () => {
  assert.equal(
    describeSwingSuggestion(swing, "zone"),
    `You didn't die in any of the 32 fights since you arrived here, took 8% as much damage as you dealt, and 53% of what you dealt was melee. The loadout your goals plan has a swing score of 20/s; the "Melee damage" preset reaches 26/s (+30%), for AC 180 → 140, mana 1500 → 900.`,
  );
});

test("a swap that costs nothing worth naming says so instead of listing nothing", () => {
  const text = describeSwingSuggestion({ ...swing, falls: [] }, "sitting");
  assert.ok(text.includes("fights this sitting, "), text);
  assert.ok(text.endsWith("(+30%), at next to no cost in AC, HP or mana."), text);
});

test("a harder swing is said only when nothing is wrong — it would argue with the advice to take more", () => {
  const none = { ac: null, resists: [], mana: null, hp: null, swing };
  const only = adviceOf(none, "zone");
  assert.deepEqual(only.map((a) => [a.label, a.icon]), [["Swing +30%", "⚔"]]);
  assert.match(only[0].sentence, /^You didn't die in any of the 32 fights/);
  const withAc = adviceOf({ ...none, ac: { share: 0.74, wearing: 60, loadout: 125, gain: 65 } }, "zone");
  assert.deepEqual(withAc.map((a) => a.label), ["AC +65"]);
  assert.equal(withAc[0].icon, undefined, "the shield is the pill's own glyph");
  assert.deepEqual(adviceOf({ ...none, swing: null }, "zone"), []);
});
