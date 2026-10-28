/**
 * Black-box tests for reading your debuffs' landings off their own sentences, and for how those
 * landings give a debuff a resist rate in the damage cells. The lexicon is a stand-in holding the real
 * sentences from a 2026-10-28 Nagafen fight; every other line goes through the real parser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOwnLandings, type LandingLookup } from "../../src/shared/combat/own-landings";
import { createDamageCells, drillDown, isResist } from "../../src/shared/combat/damage-tree";
import { parseCombat } from "../../src/shared/combat/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent, LogLine, SpellLandedEvent } from "../../src/shared/types";
import type { SpellFacts } from "../../src/shared/spells/spell-file";

/** Sentence suffix → the spell that writes it, the shape `BuffLexicon.landedOnOther` answers in. */
const SENTENCES: [suffix: string, spell: string, beneficial: boolean][] = [
  [" glances nervously about.", "Tashani", false],
  [" yawns.", "Togor's Insects II", false],
  [" is seeded with healing energy.", "Slugs Healing", true],
];

const lookup: LandingLookup = (message) => {
  for (const [suffix, name, beneficial] of SENTENCES) {
    if (message.endsWith(suffix)) {
      return { target: message.slice(0, -suffix.length), spells: [{ name, beneficial } as SpellFacts] };
    }
  }
  return null;
};

let id = 0;
function line(time: string, message: string): LogLine {
  return splitLine(`[Wed Oct 28 ${time} 2026] ${message}`, ++id)!;
}

/** Feed lines the way `main.ts` does — the line first, then its parsed event — and collect landings. */
function landingsFrom(lines: [time: string, message: string][]): { landed: SpellLandedEvent[]; events: CombatEvent[] } {
  const reader = createOwnLandings(lookup);
  const landed: SpellLandedEvent[] = [];
  const events: CombatEvent[] = [];
  for (const [time, message] of lines) {
    const l = line(time, message);
    const hit = reader.line(l);
    if (hit) {
      landed.push(hit);
      events.push(hit);
    }
    const event = parseCombat(l);
    if (event) {
      reader.note(event);
      events.push(event);
    }
  }
  return { landed, events };
}

test("your debuff's sentence after your cast is a landing on the target it names", () => {
  const { landed } = landingsFrom([
    ["00:12:19", "You begin casting Tashani."],
    ["00:12:20", "Lord Nagafen glances nervously about."],
  ]);
  assert.deepEqual(
    landed.map((e) => [e.caster, e.spell, e.target]),
    [["You", "Tashani", "Lord Nagafen"]],
  );
});

test("the rank in the spell file doesn't stop a cast of the base name pairing with it", () => {
  const { landed } = landingsFrom([
    ["00:15:23", "You begin casting Togor's Insects II."],
    ["00:15:27", "Lord Nagafen yawns."],
  ]);
  assert.deepEqual(landed.map((e) => e.spell), ["Togor's Insects"]);
});

test("a sentence that isn't yours is not a landing", () => {
  const { landed } = landingsFrom([
    // Nobody of yours casting it — somebody else's Tashani at the same camp.
    ["00:12:00", "Lord Nagafen glances nervously about."],
    // A different spell in flight.
    ["00:12:19", "You begin casting Togor's Insects."],
    ["00:12:20", "Lord Nagafen glances nervously about."],
    // Resisted: the cast is over, so a later sentence is someone else's.
    ["00:13:00", "You begin casting Tashani."],
    ["00:13:02", "Lord Nagafen resisted your Tashani!"],
    ["00:13:03", "Lord Nagafen glances nervously about."],
    // Too long after the cast to be its landing.
    ["00:14:00", "You begin casting Tashani."],
    ["00:14:30", "Lord Nagafen glances nervously about."],
  ]);
  assert.deepEqual(landed, []);
});

test("one cast lands once — except on several targets in the same second, as an area spell does", () => {
  const { landed } = landingsFrom([
    ["00:20:00", "You begin casting Tashani."],
    ["00:20:02", "A lava drake glances nervously about."],
    ["00:20:02", "A fire giant glances nervously about."],
    ["00:20:05", "Lord Nagafen glances nervously about."], // a second Tashani — someone else's
  ]);
  assert.deepEqual(landed.map((e) => e.target), ["A lava drake", "A fire giant"]);
});

test("a buff landing on a group-mate is never filed, or it would make them an enemy", () => {
  const { landed } = landingsFrom([
    ["00:14:05", "You begin casting Slugs Healing."],
    ["00:14:06", "Bunnyslayer is seeded with healing energy."],
  ]);
  assert.deepEqual(landed, []);
});

test("a debuff's landings and resists give it a resist rate per target in the cells", () => {
  const { events } = landingsFrom([
    ["00:12:19", "You begin casting Tashani."],
    ["00:12:20", "Lord Nagafen glances nervously about."],
    ["00:12:30", "You begin casting Tashani."],
    ["00:12:31", "Lord Nagafen resisted your Tashani!"],
    ["00:12:40", "You begin casting Tashani."],
    ["00:12:41", "Lord Nagafen glances nervously about."],
    ["00:12:50", "You begin casting Malaisement."],
    ["00:12:51", "Lord Nagafen resisted your Malaisement!"],
    ["00:13:00", "You begin casting Lightning Shock."],
    ["00:13:01", "You hit Lord Nagafen for 200 points of magic damage by Lightning Shock."],
  ]);
  const acc = createDamageCells();
  for (const e of events) {
    if (e.kind === "spell-landed" || e.kind === "damage" || e.kind === "miss") acc.record(e);
    else if (e.kind === "spell-outcome" && isResist(e)) acc.record(e);
  }
  const spells = drillDown(acc.cells(), "attacker", "You", ["source"]);
  assert.deepEqual(
    spells.map((n) => [n.label, n.landings, n.resists, n.resistRate, n.resistsKnown]),
    [
      ["Lightning Shock", 1, 0, 0, true], // your spell, none resisted: a real 0%, not a blank
      // Never seen landing: every reach was a resist. The meter shows this one as a count — with no
      // landing to set it against, "100%" would be claiming more than the log said.
      ["Malaisement", 0, 1, 1, true],
      ["Tashani", 2, 1, 1 / 3, true],
    ],
  );
});

test("a nuke that also announces itself lands once, not twice", () => {
  const acc = createDamageCells();
  const at = "2026-10-28T00:00:00.000Z";
  acc.record({ kind: "spell-landed", caster: "You", spell: "Lightning Shock", target: "a coyote", at, logId: 1, raw: "" });
  acc.record(parseCombat(line("00:00:00", "You hit a coyote for 20 points of magic damage by Lightning Shock."))! as never);
  const [shock] = drillDown(acc.cells(), "attacker", "You", ["source"]);
  assert.equal(shock.landings, 1);
});
