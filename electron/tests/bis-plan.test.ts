/**
 * Black-box tests for the exaltation rules (`src/shared/items/exaltations.ts`) and the assembled
 * best-in-slot plan (`src/shared/items/bis-plan.ts`), over item cards written the way eqlwiki writes
 * them and inventory rows the way the EQL client dumps them. Only need re-running if either changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openSockets, socketName, socketPlan, stoneFits, type Stone } from "../../src/shared/items/exaltations";
import { bisPlan, loadoutText } from "../../src/shared/items/bis-plan";
import { itemRows, NO_CRITERIA, type ItemCriteria } from "../../src/shared/items/item-search";
import { parseInventoryDump } from "../../src/shared/game-export-dumps";
import type { CachedItem } from "../../src/shared/types";

test("a grade opens sockets: focus +1, click +2, worn +3, proc +4; dump numbers are socket types", () => {
  assert.deepEqual(openSockets(0), []);
  assert.deepEqual(openSockets(2), ["focus", "click"]);
  assert.deepEqual(openSockets(10), ["focus", "click", "worn", "proc"]);
  assert.deepEqual([7, 8, 9, 10, 1].map(socketName), ["focus", "click", "worn", "proc", "ornament"]);
});

test("a stone fits when classes and slots overlap, and one of your classes can still wear it", () => {
  const ring = { classes: ["Wizard", "Bard"], slots: ["FINGER"] };
  assert.equal(stoneFits({ classes: ["Bard"], slots: ["FINGER", "EAR"] }, ring), true);
  assert.equal(stoneFits({ classes: ["Bard"], slots: ["PRIMARY"] }, ring), false, "no slot in common");
  assert.equal(stoneFits({ classes: ["Warrior"], slots: ["FINGER"] }, ring), false, "no class in common");
  assert.equal(stoneFits({ classes: ["Bard"], slots: ["FINGER"] }, ring, ["Wizard"]), false, "only a Bard could wear the result");
  assert.equal(stoneFits({ classes: [], slots: [] }, ring, ["Wizard"]), true, "a silent card doesn't restrict");
});

test("socket plans list wanted effects first and only stones of the socket's kind", () => {
  const card = { classes: [], slots: ["FINGER"] };
  const stones: Stone[] = [
    { from: "A", kind: "focus", effect: "Zeta Focus", where: "Storage: Exaltation", card },
    { from: "B", kind: "focus", effect: "Alpha Focus", where: "Storage: Exaltation", card },
    { from: "C", kind: "worn", effect: "Worn Thing", where: "Storage: Exaltation", card },
  ];
  const [plan] = socketPlan([{ held: "Ring +1", grade: 1, card, filled: new Map() }], stones, new Set(["Zeta Focus"]));
  assert.equal(plan.kind, "focus");
  assert.deepEqual(plan.options.map((o) => o.effect), ["Zeta Focus", "Alpha Focus"]);
});

// ─── The assembled plan ─────────────────────────────────────────────────────

function page(title: string, lines: string[]): CachedItem {
  return { title, origin: "wiki", card: { title, lines }, sources: [], outOfEra: false } as unknown as CachedItem;
}
const rows = itemRows([
  page("Moonstone Ring", ["MAGIC ITEM", "Slot: FINGER", "STR: +3 MANA: +30", "Class: ALL", "Race: ALL", "Focus Effect: Extended Range II"]),
  page("Iron Ring", ["Slot: FINGER", "MANA: +5", "Class: ALL", "Race: ALL"]),
  page("Gnoll Slayer", ["LORE ITEM NO DROP", "Slot: PRIMARY SECONDARY", "Skill: 1H Slashing Atk Delay: 28", "DMG: 6", "Class: WAR BRD", "Race: ALL"]),
  page("Minotaur Horn", ["Slot: PRIMARY SECONDARY", "Class: ALL", "Race: ALL", "Focus Effect: Wind Resonance 10"]),
  page("Cap of Mana", ["Slot: HEAD", "MANA: +40", "Class: ALL", "Race: ALL"]),
  page("Warrior Helm", ["Slot: HEAD", "MANA: +90", "Class: WAR", "Race: ALL"]),
]);
const dump = [
  "Location\tName\tID\tCount\tSlots",
  "Fingers\tMoonstone Ring +1\t10150\t1\t11",
  "Fingers-Slot7\tMoonstone Ring (Exaltation)\t10150\t1\t11",
  "Fingers\tIron Ring\t1\t1\t11",
  "Bank1\tBackpack\t17005\t1\t8",
  "Bank1-Slot1\tMoonstone Ring\t10150\t1\t11",
  "Bank1-Slot2\tMoonstone Ring\t10150\t1\t11",
  "KeyRing\tName\tID\t",
  "Augmentation\tMinotaur Horn (Exaltation)\t13077",
].join("\r\n");
const wizard: ItemCriteria = { ...NO_CRITERIA, hideOutOfEra: false, facets: { ...NO_CRITERIA.facets, class: ["Wizard"] } };

test("the plan: wear the best of what you hold, merge where it pays, fill sockets, hunt what you can wear", () => {
  const plan = bisPlan({ rows, inventory: parseInventoryDump(dump), criteria: wizard, weights: { mana: 1 } });

  // Two fingers and two Any Slots: all three Moonstones (+1 is 33 mana, +0 is 30) and the Iron Ring.
  assert.deepEqual(plan.loadout.picks.map((p) => `${p.item.title}+${p.item.grade}:${p.value}`).sort(), [
    "Iron Ring+0:5",
    "Moonstone Ring+0:30",
    "Moonstone Ring+0:30",
    "Moonstone Ring+1:33",
  ]);
  assert.equal(plan.wearing, 38, "what's worn now: Moonstone +1 (33) and Iron Ring (5)");
  assert.equal(plan.loadout.total, 98);

  // Every copy is worn, so there are no spares to merge.
  assert.deepEqual(plan.merges, []);

  // The worn Moonstone +1 has its focus socket open and filled.
  const focus = plan.sockets.find((s) => s.host === "Moonstone Ring +1");
  assert.equal(focus?.filled, "Moonstone Ring (Exaltation)");
  // The loose horn stone is Primary/Secondary — no slot in common with a ring, so it isn't offered.
  assert.deepEqual(focus?.options, []);

  // Hunting: the cap fills an empty head slot; the warrior's helm is worth more but a Wizard can't
  // wear it; rings you already hold aren't targets.
  assert.deepEqual(plan.hunt.map((h) => [h.item.title, h.slot, h.gain]), [["Cap of Mana", "HEAD", 40]]);
  // +2 / +5 / +10: 40 mana is over 10, so +10% a grade, rounded half up.
  assert.deepEqual(plan.hunt[0].atGrades, [
    { grade: 2, copies: 4, gain: 48 },
    { grade: 5, copies: 32, gain: 60 },
    { grade: 10, copies: 1024, gain: 80 },
  ]);
});

test("the Search box's name text never narrows the hunt — the other criteria still do", () => {
  // A name typed to look one item up ("Troll Green", from a quest lookup) used to stay in the shared
  // criteria and empty the whole Hunt, since no wearable upgrade is called that.
  const looked = bisPlan({ rows, inventory: parseInventoryDump(dump), criteria: { ...wizard, text: "Troll Green" }, weights: { mana: 1 } });
  assert.deepEqual(looked.hunt.map((h) => h.item.title), ["Cap of Mana"]);
  const capped = bisPlan({ rows, inventory: parseInventoryDump(dump), criteria: { ...wizard, text: "Troll Green", mins: { ac: 99 } }, weights: { mana: 1 } });
  assert.deepEqual(capped.hunt, [], "a stat floor is a real criterion and still applies");
});

test("spare copies the loadout doesn't wear are suggested for merging into the one it does", () => {
  // Six +0 Moonstones in the bank and four ring-capable slots: two are spare. Fed into a worn one,
  // three units make a +1 with one exp of two toward +2 — and that half-grade already counts:
  // 30 mana at an effective 1.5 grades is 30 + round(4.5) = 35 (ADR 0312). Nothing else changes.
  const tsv = (...cols: (string | number)[]) => cols.join("\t");
  const six = Array.from({ length: 6 }, (_, i) => tsv(`Bank1-Slot${i + 1}`, "Moonstone Ring", 10150, 1, 11));
  const plan = bisPlan({
    rows,
    inventory: parseInventoryDump([tsv("Location", "Name", "ID", "Count", "Slots"), tsv("Bank1", "Backpack", 17005, 1, 8), ...six].join("\r\n")),
    criteria: wizard,
    weights: { mana: 1 },
  });
  assert.equal(plan.loadout.total, 120);
  assert.deepEqual(plan.merges, [{ title: "Moonstone Ring", grades: [0, 0, 0], from: 0, to: 1, toExp: 1, gain: 5 }]);
});

test("a merge that stays at the same grade still pays for its leftover exp", () => {
  // A worn +2 and four +0s for four ring-capable slots: one +0 is spare. Fed in, it is one exp of four
  // toward +3 — still a +2, but 30 mana at an effective 2.25 grades is 37, not 36.
  const tsv = (...cols: (string | number)[]) => cols.join("\t");
  const copies = [tsv("Fingers", "Moonstone Ring +2", 10150, 1, 11), ...Array.from({ length: 4 }, (_, i) => tsv(`Bank1-Slot${i + 1}`, "Moonstone Ring", 10150, 1, 11))];
  const plan = bisPlan({
    rows,
    inventory: parseInventoryDump([tsv("Location", "Name", "ID", "Count", "Slots"), tsv("Bank1", "Backpack", 17005, 1, 8), ...copies].join("\r\n")),
    criteria: wizard,
    weights: { mana: 1 },
  });
  assert.deepEqual(plan.merges, [{ title: "Moonstone Ring", grades: [2, 0], from: 2, to: 2, toExp: 1, gain: 1 }]);
});

test("a loose exaltation stone in a bag or the bank is offered, not only one in Storage", () => {
  const ringRows = itemRows([
    page("Moonstone Ring", ["Slot: FINGER", "MANA: +30", "Class: ALL", "Race: ALL", "Focus Effect: Extended Range II"]),
    page("Pearl Ring", ["Slot: FINGER", "Class: ALL", "Race: ALL", "Focus Effect: Pearl Focus"]),
  ]);
  const inventory = parseInventoryDump(
    [
      ["Location", "Name", "ID", "Count", "Slots"],
      ["Fingers", "Moonstone Ring +1", "10150", "1", "11"],
      ["Bank1", "Backpack", "17005", "1", "8"],
      ["Bank1-Slot1", "Pearl Ring (Exaltation)", "1", "1", "11"],
    ]
      .map((r) => r.join("\t"))
      .join("\r\n"),
  );
  const plan = bisPlan({ rows: ringRows, inventory, criteria: wizard, weights: { mana: 1 } });
  const focus = plan.sockets.find((s) => s.host === "Moonstone Ring +1" && s.kind === "focus");
  assert.deepEqual(focus?.options.map((o) => [o.effect, o.where]), [["Pearl Focus", "Bank 1"]]);
});

// ─── What the player told it ────────────────────────────────────────────────

const tsvDump = (...lines: string[][]) => [["Location", "Name", "ID", "Count", "Slots"], ...lines].map((r) => r.join("\t")).join("\r\n");

test("locks hold by title across dumps, report one you no longer hold, and benching keeps a thing out", () => {
  const inventory = parseInventoryDump(dump);
  // FINGER is index 16 in the layout. Lock the Iron Ring there; lock the head to a cap you don't own.
  const plan = bisPlan({
    rows,
    inventory,
    criteria: wizard,
    weights: { mana: 1 },
    options: { locks: { 16: { title: "Iron Ring" }, 4: { title: "Cap of Mana" } }, wantEffects: [], benched: [], skipHunt: [] },
  });
  assert.equal(plan.loadout.picks.find((p) => p.slotIndex === 16)?.item.title, "Iron Ring");
  assert.deepEqual(plan.staleLocks, [{ slotIndex: 4, title: "Cap of Mana" }]);
  assert.equal(plan.unconstrained, 98, "what no choices would have got");
  // The head is free again (the stale lock frees it), so the cap is still a hunt.
  assert.deepEqual(plan.hunt.map((h) => h.item.title), ["Cap of Mana"]);

  const benched = bisPlan({
    rows,
    inventory,
    criteria: wizard,
    weights: { mana: 1 },
    options: { locks: {}, wantEffects: [], benched: ["Iron Ring"], skipHunt: ["Cap of Mana"] },
  });
  assert.ok(!benched.loadout.picks.some((p) => p.item.title === "Iron Ring"));
  assert.deepEqual(benched.benched, ["Iron Ring"]);
  assert.deepEqual(benched.hunt, [], "a skipped hunt isn't suggested");
  assert.equal(benched.wearing, 38, "what you wear now still counts the benched ring");
});

test("a wanted effect already worn pins its item; one nothing gives you says what to hunt", () => {
  const plan = bisPlan({
    rows,
    inventory: parseInventoryDump(dump),
    criteria: wizard,
    weights: { mana: 1 },
    options: { locks: {}, wantEffects: ["Extended Range II", "Wind Resonance 10"], benched: [], skipHunt: [] },
  });
  const [range, wind] = plan.effects;
  assert.equal(range.how, "worn");
  assert.match(range.by ?? "", /^Moonstone Ring/);
  assert.equal(plan.pinned[Number(Object.keys(plan.pinned)[0])], "Extended Range II");
  // The horn's stone is Primary/Secondary and nothing in the loadout is graded for it; the horn
  // itself is only a stone here, not a held item — so it's missing.
  assert.equal(wind.how, "missing");
});

test("a wanted effect is socketed from a stone before anything is worn for it", () => {
  const ringRows = itemRows([
    page("Moonstone Ring", ["Slot: FINGER", "MANA: +30", "Class: ALL", "Race: ALL"]),
    page("Pearl Ring", ["Slot: FINGER", "MANA: +1", "Class: ALL", "Race: ALL", "Focus Effect: Pearl Focus"]),
  ]);
  const inventory = parseInventoryDump(
    tsvDump(["Fingers", "Moonstone Ring +1", "10150", "1", "11"], ["Bank1", "Backpack", "17005", "1", "8"], ["Bank1-Slot1", "Pearl Ring (Exaltation)", "1", "1", "11"]),
  );
  const plan = bisPlan({
    rows: ringRows,
    inventory,
    criteria: wizard,
    weights: { mana: 1 },
    options: { locks: {}, wantEffects: ["Pearl Focus"], benched: [], skipHunt: [] },
  });
  assert.deepEqual(
    plan.effects.map((e) => [e.effect, e.how, e.by, e.stone?.where]),
    [["Pearl Focus", "socket", "Moonstone Ring +1", "Bank 1"]],
  );
  assert.deepEqual(plan.socketClaims.map((c) => [c.host, c.kind]), [["Moonstone Ring +1", "focus"]]);
});

test("a wanted effect only a held item carries is worn, at the cost of what it displaces", () => {
  const headRows = itemRows([
    page("Cap of Mana", ["Slot: HEAD", "MANA: +40", "Class: ALL", "Race: ALL"]),
    page("Hasted Hat", ["Slot: HEAD", "MANA: +10", "Class: ALL", "Race: ALL", "Worn Effect: Haste"]),
    page("Mana Charm", ["Slot: CHARM", "MANA: +50", "Class: ALL", "Race: ALL"]),
  ]);
  const inventory = parseInventoryDump(
    tsvDump(
      ["Head", "Cap of Mana", "1", "1", "1"],
      ["Bank1", "Backpack", "17005", "1", "8"],
      ["Bank1-Slot1", "Hasted Hat", "2", "1", "1"],
      ["Bank1-Slot2", "Mana Charm", "3", "1", "1"],
      ["Bank1-Slot3", "Mana Charm", "3", "1", "1"],
    ),
  );
  const plan = bisPlan({
    rows: headRows,
    inventory,
    criteria: wizard,
    weights: { mana: 1 },
    options: { locks: {}, wantEffects: ["Haste"], benched: [], skipHunt: [] },
  });
  // The charms fill both Any Slots and the cap the head, so the hat is left out — until Haste is
  // wanted. Cheapest is the head (losing the cap, 40 → 10), not an Any Slot (losing a charm, 50 → 10).
  assert.equal(plan.unconstrained, 140);
  assert.deepEqual([plan.effects[0].how, plan.effects[0].by, plan.effects[0].cost], ["forced", "Hasted Hat", 30]);
  assert.equal(plan.loadout.picks.find((p) => p.slot === "HEAD")?.item.title, "Hasted Hat");
  assert.equal(plan.loadout.total, 110);
});

test("the loadout as text: one line a slot, graded names, and where to fetch what isn't worn", () => {
  const plan = bisPlan({ rows, inventory: parseInventoryDump(dump), criteria: wizard, weights: { mana: 1 } });
  const lines = loadoutText(plan).split("\n");
  assert.equal(lines[0], "Best in slot — 98 (wearing 38)");
  assert.equal(lines.length, 24, "a title and every slot of the layout");
  assert.ok(lines.includes("Head: —"));
  assert.ok(lines.some((l) => /^Any Slot: Moonstone Ring \[30\] \(from Bank 1/.test(l)), lines.join("\n"));
});
