/**
 * Black-box tests for the damage cells and their roll-ups. Everything here is fed through the
 * real parser from verbatim log lines, so a cell can't claim a shape the log never produces.
 *
 * The load-bearing property is the one the old breakdown broke: **every level sums to the one
 * above it**. It's asserted structurally (`sumsUp`) rather than on one hand-picked total, so a
 * future axis or metric can't quietly reintroduce a share that doesn't add up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDamageCells, damageKind, damageSource, drillDown, rollUpDamage, sumDamage } from "../../src/shared/damage-tree";
import { parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { DamageAxis, DamageEvent, DamageNode, MissEvent } from "../../src/shared/types";

/** Parse a line the way the watcher would, and insist it's a swing. */
function swing(message: string): DamageEvent | MissEvent {
  const event = parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${message}`, 1)!);
  assert.ok(event && (event.kind === "damage" || event.kind === "miss"), `expected a swing: ${message}`);
  return event;
}

/** Cells from a handful of log lines. */
function cellsFrom(lines: string[]) {
  const acc = createDamageCells();
  for (const line of lines) acc.record(swing(line));
  return acc.cells();
}

/** Assert each node's damage equals the sum of its children's, all the way down. */
function sumsUp(nodes: DamageNode[], parentDamage: number, path = "root"): void {
  assert.equal(
    nodes.reduce((n, x) => n + x.damage, 0),
    parentDamage,
    `${path}: levels must sum to the level above`,
  );
  for (const node of nodes) {
    if (node.children.length) sumsUp(node.children, node.damage, `${path} > ${node.label}`);
  }
}

/** The three drill orders the panel offers (`LAYOUTS`), named so the tests read as the views do. */
const VICTIM_FIRST: DamageAxis[] = ["attacker", "kind", "source"];
const DEALER_FIRST: DamageAxis[] = ["target", "kind", "source"];
const ABILITY_FIRST: DamageAxis[] = ["kind", "source", "target"];

const FIGHT = [
  "You slash a coyote for 10 points of damage.",
  "You slash a coyote for 20 points of damage. (Critical)",
  "You try to slash a coyote, but miss!",
  "You hit a coyote for 30 points of cold damage by Blast of Cold.",
  // The short DoT form names no caster, so the DoT is its own attacker (see `parseCombat`).
  "A coyote has taken 3 damage by Blast of Cold.",
  "You kick a wild tiger for 5 points of damage.",
  "A coyote bites YOU for 7 points of damage.",
  // The long form does name one, so this tick lands under the rat.
  "You have taken 1 damage from Plague Rat Disease by a large plague rat.",
  "A female rat is burned by Kainos`s warder's flames for 2 points of non-melee damage.",
];

test("a swing is filed by what it was, and where the log gives no spell it's 'Other'", () => {
  assert.equal(damageKind(swing("You slash a coyote for 10 points of damage.")), "Melee");
  assert.equal(damageSource(swing("You slash a coyote for 10 points of damage.")), "Slash");
  // A mob's "slashes" and your "slash" are the same skill, so they share a source.
  assert.equal(damageSource(swing("A coyote slashes YOU for 10 points of damage.")), "Slash");
  const spell = swing("You hit a coyote for 30 points of cold damage by Blast of Cold.");
  assert.equal(damageKind(spell), "Spell");
  assert.equal(damageSource(spell), "Blast of Cold");
  // A DoT tick is still that spell's damage — same kind, same source, counted as a tick.
  const tick = swing("A coyote has taken 3 damage by Blast of Cold.");
  assert.equal(damageKind(tick), "Spell");
  assert.equal(damageSource(tick), "Blast of Cold");
  // A damage shield was never cast, so it isn't a spell; the log's word for it stands in.
  const shield = swing("A female rat is burned by Kainos`s warder's flames for 2 points of non-melee damage.");
  assert.equal(damageKind(shield), "Other");
  assert.equal(damageSource(shield), "flames");
  // A miss names a verb and nothing else, so it can only ever be a swing.
  assert.equal(damageKind(swing("You try to slash a coyote, but miss!")), "Melee");
});

test("hits on the same victim from the same source with the same skill are one cell", () => {
  const cells = cellsFrom(FIGHT);
  const slash = cells.find((c) => c.target === "a coyote" && c.attacker === "You" && c.source === "Slash")!;
  assert.deepEqual(
    { damage: slash.damage, hits: slash.hits, misses: slash.misses, crits: slash.crits, maxHit: slash.maxHit },
    { damage: 30, hits: 2, misses: 1, crits: 1, maxHit: 20 },
  );
  // The cast landing and its tick are the same spell but *not* the same attacker, because the
  // log's short tick form names no caster. Two cells, and the tree says so rather than guessing.
  assert.deepEqual(
    cells.filter((c) => c.source === "Blast of Cold").map((c) => [c.attacker, c.damage, c.hits, c.ticks]),
    [
      ["You", 30, 1, 0],
      ["Blast of Cold", 3, 1, 1],
    ],
  );
});

test("every level of a roll-up sums to the level above it, whichever way round it's read", () => {
  const cells = cellsFrom(FIGHT);
  const total = sumDamage(cells);
  assert.equal(total, 10 + 20 + 30 + 3 + 5 + 7 + 1 + 2);
  sumsUp(rollUpDamage(cells, ["target", "attacker", "kind", "source"]), total);
  sumsUp(rollUpDamage(cells, ["attacker", "target", "kind", "source"]), total);
});

test("a victim's tree names who hit them, how, and with what", () => {
  const cells = cellsFrom(FIGHT);
  const coyote = drillDown(cells, "target", "a coyote", VICTIM_FIRST, (name) => name === "You");
  assert.deepEqual(
    coyote.map((n) => [n.label, n.damage, n.share, n.mine]),
    [
      ["You", 60, 60 / 63, true],
      ["Blast of Cold", 3, 3 / 63, false],
    ],
  );
  const kinds = coyote[0].children;
  // A tie on damage breaks on hits, so the two slashes come before the one nuke.
  assert.deepEqual(
    kinds.map((n) => [n.label, n.damage, n.share]),
    [
      ["Melee", 30, 0.5],
      ["Spell", 30, 0.5],
    ],
  );
  assert.deepEqual(
    kinds[0].children.map((n) => [n.label, n.damage, n.crits, n.misses]),
    [["Slash", 30, 1, 1]],
  );
});

test("a dealer's tree names what it hit — the same cells, read from the other end", () => {
  const cells = cellsFrom(FIGHT);
  const you = drillDown(cells, "attacker", "You", DEALER_FIRST);
  assert.deepEqual(
    you.map((n) => [n.label, n.damage]),
    [
      ["a coyote", 60],
      ["a wild tiger", 5],
    ],
  );
  // Your damage is the same number whichever direction it's rolled up from.
  assert.equal(sumDamage(cells.filter((c) => c.attacker === "You")), 65);
});

test("an area spell adds up when the ability comes above the target, and splits when it doesn't", () => {
  // One Firestorm, three mobs: the log writes a line per target, so target-first tells you what
  // each mob took and *never* what the cast was worth. Ability-first is the only order that does.
  const cells = cellsFrom([
    "You hit a coyote for 40 points of fire damage by Firestorm.",
    "You hit a wild tiger for 35 points of fire damage by Firestorm.",
    "You hit a kobold scout for 30 points of fire damage by Firestorm.",
    "You slash a coyote for 10 points of damage.",
  ]);

  const byAbility = drillDown(cells, "attacker", "You", ABILITY_FIRST);
  const spell = byAbility.find((n) => n.label === "Spell")!;
  assert.deepEqual(
    spell.children.map((n) => [n.label, n.damage, n.hits]),
    [["Firestorm", 105, 3]],
  );
  // …and it still says which mobs it landed on, one level further in.
  assert.deepEqual(
    spell.children[0].children.map((n) => [n.label, n.damage]),
    [
      ["a coyote", 40],
      ["a wild tiger", 35],
      ["a kobold scout", 30],
    ],
  );

  // The same cast, read target-first: three rows of one hit each, and no total anywhere.
  const byTarget = drillDown(cells, "attacker", "You", DEALER_FIRST);
  assert.deepEqual(
    byTarget.map((n) => [n.label, n.damage]),
    [
      ["a coyote", 50],
      ["a wild tiger", 35],
      ["a kobold scout", 30],
    ],
  );
});

test("ticks are kept out of the hit rate, and crits are a rate of the hits that landed", () => {
  const cells = cellsFrom(FIGHT);
  const you = rollUpDamage(cells, ["attacker"]).find((n) => n.label === "You")!;
  // 4 landings (2 slashes, a kick, a nuke) and 1 miss — 5 swings, one of them critical.
  assert.equal(you.hits, 4);
  assert.equal(you.hitRate, 4 / 5);
  assert.equal(you.critRate, 1 / 4);
  // A DoT never swings, so it has no hit rate at all rather than a flattering 100%.
  const rat = rollUpDamage(cells, ["attacker"]).find((n) => n.label === "a large plague rat")!;
  assert.deepEqual([rat.hits, rat.ticks, rat.hitRate], [1, 1, 0]);
  // A source that only ever missed is still a cell — that's the whole point of a hit rate.
  const whiffs = rollUpDamage(cellsFrom(["You try to bash a coyote, but miss!"]), ["source"]);
  assert.deepEqual(
    whiffs.map((n) => [n.label, n.damage, n.misses, n.hitRate]),
    [["Bash", 0, 1, 0]],
  );
});

/**
 * A group fight, so every denominator has a different answer: you and a group-mate both hit two
 * mobs, and one of the mobs hits the group-mate back.
 */
const GROUP_FIGHT = [
  "You slash a coyote for 40 points of damage.", // you → coyote
  "You slash a wild tiger for 10 points of damage.", // you → tiger
  "Bunnyslayer slashes a coyote for 50 points of damage.", // them → coyote
  "A coyote bites Bunnyslayer for 30 points of damage.", // the fight happening *to* your side
];

test("a share is of a stated denominator: the level above, the victim, the attacker, the fight", () => {
  const cells = cellsFrom(GROUP_FIGHT);
  const you = drillDown(cells, "attacker", "You", DEALER_FIRST, (n) => n === "You");
  const coyote = you.find((n) => n.label === "a coyote")!;

  assert.equal(coyote.damage, 40);
  assert.equal(coyote.share, 40 / 50, "of the level above — your 50 damage");
  assert.equal(coyote.of.ofTarget, 40 / 90, "of everything the coyote took, yours and theirs");
  assert.equal(coyote.of.ofAttackerOnTarget, 1, "all of what you did to it");
  assert.equal(coyote.of.ofAttacker, 40 / 50, "of your damage across the fight");
  // The fight is the 100 landed on the two mobs — the 30 the coyote did to Bunnyslayer is not
  // part of "how much of this fight was mine".
  assert.equal(coyote.of.ofFight, 40 / 100);

  // One level down the level-above share changes and the fixed ones don't have to be multiplied.
  const slash = coyote.children[0].children[0];
  assert.equal(slash.label, "Slash");
  assert.deepEqual(
    [slash.of.ofTarget, slash.of.ofAttackerOnTarget, slash.of.ofFight],
    [40 / 90, 1, 40 / 100],
  );
});

test("damage on your own side is not part of the fight, unless you fought them", () => {
  const cells = cellsFrom(GROUP_FIGHT);
  const mine = (n: string) => n === "You";

  // The coyote's damage landed on a player nobody on your side hit, so it has no share *of the
  // fight* — it isn't in that total, and claiming a slice of something you're not in is worse
  // than saying nothing.
  const [hitters] = rollUpDamage(cells.filter((c) => c.target === "Bunnyslayer"), ["attacker"], { mine, all: cells });
  assert.equal(hitters.label, "a coyote");
  assert.equal(hitters.of.ofFight, undefined);
  assert.equal(hitters.of.ofTarget, 1, "it is still all of what Bunnyslayer took");

  // Turn it into a duel — you hit them — and they become something you fought, so it counts.
  const duel = cellsFrom([...GROUP_FIGHT, "You slash Bunnyslayer for 10 points of damage."]);
  const [duelHitters] = rollUpDamage(duel.filter((c) => c.target === "Bunnyslayer"), ["attacker"], { mine, all: duel });
  assert.equal(duelHitters.of.ofFight, 30 / 140, "the fight now includes what landed on them");
});

test("a mob your group killed without you is still your fight", () => {
  // Verbatim shape from a real raid: a group-mate does all the damage to one of the mobs. Judging
  // sides by "what *you* personally hit" left 1,631 damage as a share of nothing.
  const cells = cellsFrom([
    "You slash a gnoll necromancer for 40 points of damage.",
    "A gnoll necromancer bites Kani for 20 points of damage.",
    "Kani slashes a boisterous gnoll for 100 points of damage.",
    "A boisterous gnoll bites Kani for 10 points of damage.",
  ]);
  const [top] = rollUpDamage(cells.filter((c) => c.target === "a boisterous gnoll"), ["attacker"], {
    mine: (n) => n === "You",
    all: cells,
  });
  // You never touched it; Kani (whom the mobs are hitting) did, so it's on the other side.
  assert.equal(top.label, "Kani");
  assert.equal(top.of.ofFight, 100 / 140, "of the 140 landed on the two mobs");
  // And the 30 those mobs did to Kani is not part of the fight's damage.
  const [onKani] = rollUpDamage(cells.filter((c) => c.target === "Kani"), ["attacker"], {
    mine: (n) => n === "You",
    all: cells,
  });
  assert.equal(onKani.of.ofFight, undefined);
});

test("an enemy's pet is an enemy once your side hits it — the strong signal wins", () => {
  // EQ has no friendly fire, so "an ally hit it" settles a side. "A mob hit it" only leans, because
  // mobs *do* hit each other — and applying the lean first put an enemy's pet on your side.
  const cells = cellsFrom([
    "You slash a gnoll necromancer for 40 points of damage.",
    "A gnoll necromancer bites Kani for 20 points of damage.",
    // The pet takes a hit from its own side's necromancer first…
    "A gnoll necromancer bashes a gnoll necromancer pet for 5 points of damage.",
    // …and then Kani, who is on your side, hits it.
    "Kani slashes a gnoll necromancer pet for 30 points of damage.",
  ]);
  const [onPet] = rollUpDamage(cells.filter((c) => c.target === "a gnoll necromancer pet"), ["target"], {
    mine: (n) => n === "You",
    all: cells,
  });
  // 75 is the fight: 40 on the necromancer and 35 on its pet. The 20 it did to Kani is not.
  assert.equal(onPet.of.ofFight, 35 / 75, "the pet is a thing your side fought, so its damage counts");
});

test("with nobody known to be yours, every victim counts — sides can't be told apart", () => {
  const cells = cellsFrom(GROUP_FIGHT);
  const [top] = rollUpDamage(cells, ["target"]); // no `mine`
  assert.equal(top.label, "a coyote");
  assert.equal(top.of.ofFight, 90 / 130, "of everything, because there's no side to exclude");
});

test("a node spanning several victims has no per-victim share, rather than a made-up one", () => {
  const cells = cellsFrom([
    "You hit a coyote for 40 points of fire damage by Firestorm.",
    "You hit a wild tiger for 60 points of fire damage by Firestorm.",
  ]);
  const [spell] = drillDown(cells, "attacker", "You", ABILITY_FIRST, (n) => n === "You");
  const firestorm = spell.children[0];
  assert.equal(firestorm.label, "Firestorm");
  assert.equal(firestorm.onTarget, undefined);
  assert.equal(firestorm.of.ofTarget, undefined);
  assert.equal(firestorm.of.ofAttackerOnTarget, undefined);
  // What it *is* a share of still works: the whole cast, and all of your damage.
  assert.equal(firestorm.of.ofFight, 1);
  assert.equal(firestorm.of.ofAttacker, 1);
  // …and its per-target children each know their victim again.
  assert.deepEqual(
    firestorm.children.map((n) => [n.label, n.of.ofTarget, n.of.ofFight]),
    [
      ["a wild tiger", 1, 0.6],
      ["a coyote", 1, 0.4],
    ],
  );
});

test("one spelling per creature, so a sentence-initial capital doesn't split a victim in two", () => {
  const acc = createDamageCells((name) => name.toLowerCase());
  acc.record(swing("You slash a Coyote for 10 points of damage."));
  acc.record(swing("You slash a coyote for 5 points of damage."));
  assert.deepEqual(acc.cells().map((c) => [c.target, c.damage]), [["a coyote", 15]]);
});
