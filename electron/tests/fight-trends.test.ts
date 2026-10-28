/**
 * Black-box tests for the history search's matching and the trends drawn over what it finds. Fights
 * are built from verbatim log lines through the real parser and cells, so a trend can't rest on a
 * cell shape the log never produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDamageCells, isResist } from "../../src/shared/combat/damage-tree";
import { fightMatches } from "../../src/shared/combat/fight-search";
import { fightTrends, trendTips } from "../../src/shared/combat/fight-trends";
import { parseCombat } from "../../src/shared/combat/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatantStat, DamageEvent, MissEvent, StoredFight } from "../../src/shared/types";

let ids = 0;

/** A stored fight from log lines — only the fields the search and the trends read. */
function fight(lines: string[], opts: { label?: string; zone?: string; died?: boolean; mine?: string[] } = {}): StoredFight {
  const acc = createDamageCells();
  const names = new Set<string>();
  for (const line of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${line}`, 1)!)!;
    if (event.kind === "spell-outcome") {
      assert.ok(isResist(event), line);
      acc.record(event);
      names.add(event.caster).add(event.target);
    } else {
      const swing = event as DamageEvent | MissEvent;
      acc.record(swing);
      names.add(swing.attacker).add(swing.target);
    }
  }
  const mine = new Set(["You", ...(opts.mine ?? [])]);
  const byCombatant = [...names].map((name) => ({ name, mine: mine.has(name) }) as CombatantStat);
  return {
    id: `f${++ids}`,
    sessionId: "s",
    label: opts.label ?? "Lord Nagafen",
    zone: opts.zone,
    stats: {
      byCombatant,
      damageCells: acc.cells(),
      deaths: opts.died ? [{ at: "", incoming: [], totalTaken: 0, windowSec: 0 }] : [],
    },
  } as unknown as StoredFight;
}

const NAGAFEN = [
  "Lord Nagafen hits YOU for 600 points of fire damage by Lava Breath.",
  "Lord Nagafen hits YOU for 700 points of fire damage by Lava Breath.",
  "Lord Nagafen crushes YOU for 300 points of damage.",
  "Lord Nagafen crushes Bunnyslayer for 200 points of damage.",
  "A lava drake bites YOU for 50 points of damage.",
  "You hit Lord Nagafen for 100 points of cold damage by Blast of Cold.",
  "You hit Lord Nagafen for 100 points of cold damage by Blast of Cold.",
  "Lord Nagafen resisted your Blast of Cold!",
  "Lord Nagafen resisted your Blast of Cold!",
  "Lord Nagafen resisted your Blast of Cold!",
  "You hit Lord Nagafen for 80 points of magic damage by Shock of Lightning.",
  "You hit Lord Nagafen for 80 points of magic damage by Shock of Lightning.",
  "You hit Lord Nagafen for 80 points of magic damage by Shock of Lightning.",
  "You hit Lord Nagafen for 80 points of magic damage by Shock of Lightning.",
  "You hit Lord Nagafen for 80 points of magic damage by Shock of Lightning.",
];

test("a search finds a fight by anyone in it, not only the mob it's labelled after", () => {
  const f = fight(NAGAFEN, { label: "a lava drake", zone: "Nagafen's Lair" });
  assert.ok(fightMatches(f, "nagafen"));
  assert.ok(fightMatches(f, "bunnyslayer"), "a group-mate finds the evenings they were along");
  assert.ok(fightMatches(f, "drake lair"), "words can still split across a name and the zone");
  assert.ok(!fightMatches(f, "vox"));
});

test("trends are about the mob the search named, and only its damage to your side", () => {
  const t = fightTrends([fight(NAGAFEN), fight(NAGAFEN, { died: true })], "nagafen")!;
  assert.deepEqual(t.subjects, ["Lord Nagafen"]);
  assert.equal(t.deaths, 1);
  // The drake's bite isn't his, and nothing you did to him is damage *to* your side.
  assert.deepEqual(
    t.incoming.map((s) => [s.source, s.damageType, s.damage]),
    [["Lava Breath", "fire", 2600], ["Crush", undefined, 1000]],
  );
  const tips = trendTips(t);
  assert.equal(
    tips.find((x) => x.kind === "damage-mix")!.text,
    "Most of Lord Nagafen's damage to your side is Lava Breath (fire, 72%) and Crush (melee, 28%).",
  );
  // The figures ride along with the sentence, for the "raise fire resist" step that comes next.
  assert.equal(tips.find((x) => x.kind === "damage-mix")!.sources![0].damageType, "fire");
  assert.match(tips.find((x) => x.kind === "biggest-hit")!.text, /700 from Lava Breath/);
  assert.equal(tips.find((x) => x.kind === "resisted")!.text, "Lord Nagafen resisted 60% of your Blast of Cold (6 of 10).");
  assert.match(tips.find((x) => x.kind === "reliable")!.text, /^Shock of Lightning lands far more reliably/);
  assert.equal(tips.find((x) => x.kind === "deaths")!.text, "You died in 1 of these 2 fights.");
});

test("a spell under the bar of tries says nothing, however bad its luck", () => {
  const t = fightTrends([fight(NAGAFEN.slice(0, 9))], "nagafen")!; // Blast of Cold: 2 lands, 3 resists
  assert.ok(!trendTips(t).some((x) => x.kind === "resisted" || x.kind === "reliable"));
});

test("how your swings were turned aside, once there are enough of them", () => {
  const lines = [
    ...Array(14).fill("You slash a coyote for 10 points of damage."),
    ...Array(3).fill("You try to slash a coyote, but a coyote parries!"),
    ...Array(2).fill("You try to slash a coyote, but a coyote dodges!"),
    "You try to slash a coyote, but miss!",
    "A coyote bites YOU for 5 points of damage.",
  ];
  const tips = trendTips(fightTrends([fight(lines, { label: "a coyote" })], "coyote")!);
  assert.equal(
    tips.find((x) => x.kind === "avoidance")!.text,
    "30% of your swings at a coyote didn't land (6 of 20): 3 parried, 2 dodged, 1 missed outright.",
  );
  // A tip that opens on a mob's name is still a sentence.
  assert.equal(tips.find((x) => x.kind === "damage-mix")!.text.charAt(0), "M");
  assert.match(tips.find((x) => x.kind === "biggest-hit")!.text, /^A coyote's biggest hit/);
});

test("a search that names only a place is about every mob there", () => {
  const t = fightTrends([fight(NAGAFEN, { zone: "Nagafen's Lair" })], "lair")!;
  assert.deepEqual(t.subjects, []);
  assert.deepEqual(t.incoming.map((s) => s.source), ["Lava Breath", "Crush", "Bite"]);
  assert.match(trendTips(t)[0].text, /^Most of the mobs' damage/);
});

test("fights stored before the cells existed give no trends rather than empty ones", () => {
  const old = { ...fight(NAGAFEN), stats: { byCombatant: [], deaths: [] } } as unknown as StoredFight;
  assert.equal(fightTrends([old], "nagafen"), null);
  assert.equal(fightTrends([], "nagafen"), null);
});
