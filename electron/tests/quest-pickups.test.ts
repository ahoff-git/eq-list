/**
 * The committed `quest-pickups.generated.ts` (a hand edit or a bad regenerate has to pass this too),
 * the lookup beside it (`quest-pickups.ts`), and the map pins derived from it (`pickup-pins.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  npcsForQuest,
  PICKUP_QUESTS,
  QUEST_NPCS,
  QUEST_PICKUPS,
  pickupEntryName,
  pickupFor,
  pickupLocText,
  pickupQuestPage,
  pickupSources,
  pickupsForQuest,
  withQuestPickups,
} from "../../src/shared/quests/quest-pickups";
import { pickupPins } from "../../src/shared/map/pickup-pins";
import { questNpcPins } from "../../src/shared/map/quest-npc-pins";
import { isKnownPlace, samePlace } from "../../src/shared/zones/place";

test("every pickup has a label, a zone and a real location", () => {
  for (const p of QUEST_PICKUPS) {
    assert.ok(p.quest && p.item && p.label && p.zone, JSON.stringify(p));
    assert.ok(Number.isFinite(p.loc.y) && Number.isFinite(p.loc.x), `${p.label} has no loc`);
    assert.ok(p.loc.y !== 0 || p.loc.x !== 0, `${p.label} sits at 0, 0`);
  }
});

test("every pickup's zone is one the map can open", () => {
  for (const p of QUEST_PICKUPS) assert.ok(isKnownPlace(p.zone), `${p.label}: "${p.zone}"`);
});

test("list names are unique, so no two pickups fold into one entry", () => {
  const names = QUEST_PICKUPS.map((p) => pickupEntryName(p).toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("the wizard epic's ten Rods are there, named by their label", () => {
  const rods = pickupsForQuest("Tarton's Wheel");
  assert.equal(rods.length, 10);
  assert.ok(PICKUP_QUESTS.includes("Tarton's Wheel"));
  const azia = pickupFor("rod (azia)");
  assert.equal(azia?.zone, "Erud's Crossing");
  assert.deepEqual(azia?.loc, { y: -1159, x: 2329 });
  assert.equal(pickupLocText(pickupFor("Rod (Caza)")!), "2782, 142, -372");
  assert.equal(pickupFor("Rod"), undefined);
});

test("the enchanter's ten Old Silver Coins are there, read off the page's checklist bullets", () => {
  const coins = pickupsForQuest("Coin of Tash (Tashania)");
  assert.equal(coins.length, 10);
  assert.deepEqual(
    coins.map((c) => c.label),
    ["Azia", "Beza", "Caza", "Dena", "Ena", "Fana", "Geza", "Heda", "Izah", "Jaka"],
  );
  const beza = pickupFor("Old Silver Coin (Beza)");
  assert.equal(beza?.zone, "Erudin Palace");
  assert.deepEqual(beza?.loc, { y: 703, x: 740, z: 44 });
  // The spot is lifted out of the directions, and the page's "(not in water)" aside is left in.
  assert.equal(pickupFor("Old Silver Coin (Azia)")?.note.startsWith("Near great wheel (not in water). It's"), true);
});

test("Coin of Tash's four NPCs are placed by their own pages, with the steps that name them", () => {
  const npcs = npcsForQuest("Coin of Tash (Tashania)");
  assert.deepEqual(
    npcs.map((n) => [n.npc, n.zone, n.loc.y, n.loc.x]),
    [
      ["Romar Sunto", "Temple of Solusek Ro", 393, 90],
      ["Tarn Visilin", "High Keep", 65, -223],
      ["Mizr N`Mar", "Neriak Third Gate", 913, -1314],
      ["Raine Beteria", "Erudin", -1050, -212],
    ],
  );
  // "(393, 90), 2nd floor" — the words after the spot are directions, never a z.
  assert.match(npcs[0].note, /^2nd floor\./);
  assert.equal(npcs[0].steps.length, 2);
  assert.match(npcs[1].steps[0], /to receive the Glowing Coin of Tash\.$/);
  // A page with nothing to say says nothing, rather than "Description needed."
  assert.equal(npcs[2].note, "");
});

test("every quest NPC's zone is one the map can open", () => {
  for (const n of QUEST_NPCS) assert.ok(isKnownPlace(n.zone), `${n.npc}: "${n.zone}"`);
});

test("a quest's NPCs are pinned while anything under that quest is still needed", () => {
  const inZone = (z: string) => samePlace(z, "High Keep");
  const coinQuest = { kind: "quest", name: "Coin of Tash (Tashania)" };
  const pins = questNpcPins([{ name: "Old Silver Coin (Azia)", origin: coinQuest }], inZone);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].title, "Tarn Visilin");
  assert.deepEqual([pins[0].y, pins[0].x], [65, -223]);
  assert.equal(pins[0].about, "Tarn Visilin for Coin of Tash (Tashania) — 65, -223");
  assert.match(pins[0].note, /^Give Coin of Tash to Tarn Visilin/);
  assert.deepEqual(questNpcPins([{ name: "Bone Chips" }], inZone), []);
  assert.deepEqual(questNpcPins([{ name: "Rod (Azia)", origin: { name: "Tarton's Wheel" } }], inZone), []);
});

test("a pickup's source is a ground source in its zone; anything else has none", () => {
  assert.deepEqual(pickupSources("Rod (Azia)"), [
    { kind: "ground", where: "Azia at -1159, 2329", detail: "Erud's Crossing" },
  ]);
  assert.equal(pickupSources("Bone Chips"), undefined);
});

test("a quest's pickups add as that quest's turn-ins, one of each", () => {
  const page = pickupQuestPage("Tarton's Wheel");
  assert.equal(page.kind, "quest");
  assert.equal(page.title, "Tarton's Wheel");
  assert.equal(page.components.length, 10);
  assert.ok(page.components.every((c) => c.qty === 1 && pickupFor(c.name)));
});

test("pins only the needed pickups in the zone on screen, captioned by label", () => {
  const inZone = (z: string) => samePlace(z, "The Estate of Unrest");
  const pins = pickupPins([{ name: "Rod (Jaka)" }, { name: "Rod (Azia)" }, { name: "Bone Chips" }], inZone);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].title, "Jaka");
  assert.deepEqual([pins[0].y, pins[0].x], [520, -285]);
  assert.equal(pins[0].about, "Rod (Jaka) for Tarton's Wheel — 520, -285");
  assert.match(pins[0].note, /^Underwater on the hidden cavern floor/);
  assert.match(pins[0].note, /Enduring Breath Recommended: No$/);
  assert.deepEqual(pickupPins([], inZone), []);
});

test("a quest page the parser found no turn-ins on gets its pickups as turn-ins", () => {
  // "Tarton's Wheel" as eqlwiki's parse returns it: a quest, no components.
  const bare = { ...pickupQuestPage("Tarton's Wheel"), components: [] };
  const page = withQuestPickups(bare)!;
  assert.equal(page.kind, "quest");
  assert.deepEqual(
    page.components.map((c) => c.name),
    pickupsForQuest("Tarton's Wheel").map(pickupEntryName),
  );
  assert.equal(bare.components.length, 0, "the page it was given is left alone");
});

test("turn-ins the parser did find are kept, and none is added twice", () => {
  const found = { ...pickupQuestPage("Tarton's Wheel"), components: [{ name: "Glowing Chest", qty: 1 }, { name: "rod (azia)", qty: 1 }] };
  const names = withQuestPickups(found)!.components.map((c) => c.name);
  assert.equal(names.length, 11);
  assert.equal(names[0], "Glowing Chest");
  assert.equal(names.filter((n) => n.toLowerCase() === "rod (azia)").length, 1);
});

test("a page with no bundled pickups is returned untouched", () => {
  const other = { ...pickupQuestPage("Tarton's Wheel"), title: "Some Other Quest", components: [] };
  assert.equal(withQuestPickups(other), other);
  assert.equal(withQuestPickups(null), null);
});
