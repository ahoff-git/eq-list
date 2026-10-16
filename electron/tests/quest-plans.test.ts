/**
 * Long quests as plans (ADR 0300): the committed `quest-plans.generated.ts` (a bad regenerate has to
 * pass this too), and what `quest-plans.ts` does with it — progress off the list, places, era, pins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentStage,
  planByZone,
  planFor,
  planItems,
  planPins,
  planQuestPage,
  progressOf,
  QUEST_PLANS,
  stagePlaces,
  stepPlace,
  stepStatus,
  withQuestPlan,
  type HasItem,
} from "../../src/shared/quests/quest-plans";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../store";
import { parseLine } from "../../src/shared/parse-line";
import type { LootEvent } from "../../src/shared/types";
import { outOfEraSet } from "../../src/shared/zones/expansions";
import { CURATED_ZONES } from "../../src/shared/zones/gazetteer";
import { samePlace } from "../../src/shared/zones/place";

const step = (quest: string, find: (text: string) => boolean) =>
  planFor(quest)!.stages.flatMap((s) => s.steps).find((st) => find(st.text))!;

test("every class epic and every Plane of Sky test has a plan of stages and steps", () => {
  for (const cls of ["Bard", "Cleric", "Druid", "Enchanter", "Magician", "Monk", "Necromancer", "Paladin", "Ranger", "Rogue", "Shadow Knight", "Shaman", "Warrior", "Wizard"]) {
    const plan = planFor(`${cls} Epic Quest`);
    assert.ok(plan && plan.stages.length && plan.stages.every((s) => s.steps.length), cls);
  }
  assert.equal(QUEST_PLANS.filter((p) => p.quest.endsWith("Plane of Sky Tests")).length, 16);
  for (const p of QUEST_PLANS) for (const s of p.stages) for (const st of s.steps) assert.ok(st.text, `${p.quest} / ${s.title}`);
});

test("a step reads what it hands in, what it gets back, who and where", () => {
  const crown = step("Cleric Epic Quest", (t) => t.startsWith("Loot Lord Bergurgle's Crown"));
  assert.equal(crown.kind, "loot");
  assert.deepEqual(crown.gets, ["Lord Bergurgle's Crown"]);
  assert.equal(crown.who, "Lord Bergurgle");
  assert.equal(crown.zone, "Lake Rathetear");

  // "…receive [[Orb of Frozen Water]] (…wait until you have [[Lord Gimblox's Signet Ring]])": the aside isn't a reward.
  const orb = step("Cleric Epic Quest", (t) => t.startsWith("Give the Blood Soaked Plasmatic Priest Robe"));
  assert.equal(orb.kind, "give");
  assert.deepEqual(orb.gives, ["Blood Soaked Plasmatic Priest Robe"]);
  assert.deepEqual(orb.gets, ["Orb of Frozen Water"]);
  assert.equal(orb.who, "Omat Vastsea");

  // "[[Tainted Darksteel Sword]] - [[Keeper of the Tombs]], the Hole.": the shorthand for a drop.
  const sword = step("Paladin Epic Quest", (t) => t.startsWith("Tainted Darksteel Sword"));
  assert.equal(sword.kind, "loot");
  assert.deepEqual(sword.gets, ["Tainted Darksteel Sword"]);
  assert.equal(sword.who, "Keeper of the Tombs");
});

test("a Plane of Sky test: its items by island, then the hand-in for the reward", () => {
  const plan = planFor("Wizard Plane of Sky Tests")!;
  const concentration = plan.stages.find((s) => s.title === "Wizard Test of Concentration")!;
  assert.equal(concentration.trigger, "concentration");
  const cloak = concentration.steps.find((s) => s.gets.includes("Grey Damask Cloak"))!;
  assert.equal(cloak.area, "Island 3: Harpy Island");
  assert.equal(cloak.zone, "Plane of Sky");
  const handIn = concentration.steps[concentration.steps.length - 1];
  assert.equal(handIn.kind, "give");
  assert.equal(handIn.who, "Wizard Schrock");
  assert.deepEqual(handIn.gives, ["Wind Rune Dena", "Grey Damask Cloak"]);
  assert.deepEqual(handIn.gets, ["Augmentor's Mask"]);
});

test("progress is the list's: a step is done when everything it gets is obtained", () => {
  const plan = planFor("Paladin Epic Quest")!;
  const nothing: HasItem = () => false;
  const swordStage = plan.stages.find((s) => s.title === "Gleaming Crested Sword")!;
  assert.equal(stepStatus(swordStage.steps[0], nothing), "todo");
  const got = new Set(["Tainted Darksteel Sword", "Bucket of Water"]);
  const has: HasItem = (i) => got.has(i);
  assert.equal(stepStatus(swordStage.steps[0], has), "done");
  assert.deepEqual(progressOf(swordStage.steps, has), { done: 2, total: 4 });
  // The first stage still missing anything is the one you're on.
  assert.equal(currentStage(plan, nothing)?.title, plan.stages[0].title);
  const everything: HasItem = () => true;
  assert.equal(currentStage(plan, everything), undefined);
});

test("a step's place: its own zone and spot, else its person's — and whether it's open", () => {
  const omat = stepPlace(step("Cleric Epic Quest", (t) => t.startsWith("Give Ornate Sea Shell to Omat")));
  assert.ok(samePlace(omat.zone, "Timorous Deep"));
  assert.equal(omat.who?.name, "Omat Vastsea");
  const closed = outOfEraSet(["Timorous Deep"]);
  assert.equal(stepPlace(step("Cleric Epic Quest", (t) => t.startsWith("Give Ornate Sea Shell to Omat")), closed).shut, "out-of-era");

  // Natasha's page names two zones; the step's sentence says which one this is.
  const natasha = stepPlace(step("Cleric Epic Quest", (t) => t.startsWith("Give Damaged Goblin Crown to Natasha")));
  assert.equal(natasha.zone, "Lake Rathetear");
  // …and her page's one spot can't be pinned on either: nothing says which zone it's in.
  assert.equal(natasha.loc, undefined);

  const peasant = stepPlace(step("Paladin Epic Quest", (t) => t.startsWith("Tell a peasant woman")));
  assert.deepEqual(peasant.loc, { y: -190, x: -725 });
  assert.equal(peasant.mapped, true);
});

test("by zone: every step in a zone together, zones in the order the plan reaches them", () => {
  const zones = planByZone(planFor("Cleric Epic Quest")!);
  assert.equal(zones[0].zone, "Lake Rathetear");
  assert.ok(zones[0].steps.length >= 3);
  assert.equal(new Set(zones.map((z) => z.zone)).size, zones.length, "each zone once");
  // One zone split by area: a Plane of Sky test groups by island.
  const sky = planByZone(planFor("Wizard Plane of Sky Tests")!);
  assert.ok(sky.some((z) => z.area === "Island 3: Harpy Island" && z.steps.some(({ step }) => step.gets.includes("Grey Damask Cloak"))));
});

test("pins: the stops a listed quest still needs in the zone on screen — one per person per spot", () => {
  const paladin = { kind: "quest", name: "Paladin Epic Quest" };
  const inFreeport = (z: string) => samePlace(z, "West Freeport");
  const pins = planPins([{ name: "Bucket of Water", origin: paladin }, { name: "Bucket of Pure Water", origin: paladin }], inFreeport);
  assert.deepEqual(pins.map((p) => [p.y, p.x]).sort(), [[-190, -725], [-245, -710]].sort());
  assert.match(pins.find((p) => p.y === -245)!.about, /for Paladin Epic Quest — 1 step here/);
  const otherQuest = { kind: "quest", name: "Tarton's Wheel" };
  assert.deepEqual(planPins([{ name: "Bucket of Water", origin: otherQuest }], inFreeport), []);
  assert.deepEqual(planPins([{ name: "Bone Chips" }], inFreeport), []);
});

test("an epic's page carries its route as turn-ins, once each, keeping what the parser found", () => {
  const plan = planFor("Warrior Epic Quest")!;
  const items = planItems(plan);
  assert.ok(items.includes("Unjeweled Dragon Head Hilt") && items.includes("Red Scabbard"));
  assert.equal(new Set(items).size, items.length);
  const bare = { ...planQuestPage(plan), components: [{ name: "Diamond", qty: 1 }] };
  const page = withQuestPlan(bare)!;
  assert.equal(page.components[0].name, "Diamond");
  assert.equal(page.components.length, 1 + items.filter((i) => i !== "Diamond").length);
  // A Plane of Sky test page parses as an item (its table is transcluded); with a plan it's a quest.
  const sky = withQuestPlan({ ...planQuestPage(planFor("Wizard Plane of Sky Tests")!), kind: "item", components: [] })!;
  assert.equal(sky.kind, "quest");
  assert.ok(sky.components.some((c) => c.name === "Augmentor's Mask"));
  const notAPlan = { ...bare, title: "Bone Chip Quest" };
  assert.equal(withQuestPlan(notAPlan), notAPlan);
});

test("a real loot line, through the real list, ticks the step that gets the item", () => {
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "eql-plan-")));
  const plan = planFor("Paladin Epic Quest")!;
  store.addFromPage(planQuestPage(plan));
  const loot = parseLine("[Fri Jul 17 18:41:14 2026] --You have looted a Tainted Darksteel Sword from Keeper of the Tombs's corpse.--");
  assert.equal(loot?.kind, "loot");
  assert.deepEqual(store.applyLoot(loot as LootEvent).map((e) => e.name), ["Tainted Darksteel Sword"]);

  // The plan reads progress straight off the list's entries for this quest — no store of its own.
  const mine = store.getList().entries.filter((e) => e.origin?.name === plan.quest);
  const has: HasItem = (item) => mine.some((e) => e.name === item && e.obtained >= e.needed);
  const swordStage = plan.stages.find((s) => s.title === "Gleaming Crested Sword")!;
  assert.equal(stepStatus(swordStage.steps[0], has), "done");
  assert.equal(stepStatus(swordStage.steps[2], has), "todo");
});

test("places the map can't name are resolved: a zone said in the step, an era off the zone's page, a boss off the map", () => {
  // Kargek's page says only "Freeport"; the step says East Freeport.
  const kargek = stepPlace(step("Warrior Epic Quest", (t) => t.startsWith("Hail Kargek Redblade")));
  assert.equal(kargek.zone, "East Freeport");
  assert.equal(kargek.mapped, true);

  // "Burning Woods" isn't a zone this server's map carries, and its page is Kunark: out of era, with
  // no closed-zone list needed to say so.
  const naxot = stepPlace(step("Cleric Epic Quest", (t) => t.startsWith("Give Ornate Sea Shell(v2) to Naxot")));
  assert.equal(naxot.zone, "Burning Woods");
  assert.equal(naxot.shut, "out-of-era");

  // A Plane of Sky item names the boss that drops it ("(3-Gorga)"), placed by the map's own label.
  const cloak = step("Wizard Plane of Sky Tests", (t) => t.includes("Grey Damask Cloak") && !t.startsWith("Give"));
  assert.equal(cloak.kind, "loot");
  assert.equal(cloak.who, "Gorgalosk");
  const where = stepPlace(cloak);
  assert.equal(where.area, "Island 3: Harpy Island");
  assert.deepEqual(where.loc, { y: 547, x: 474 });
});

test("a step that links no zone or person still finds both in its own words", () => {
  // "Felwithe" is a city of two map zones; the NPC's own page says which.
  const elia = stepPlace(step("Paladin Epic Quest", (t) => t.startsWith("Give to Elia the Pure, in Felwithe")));
  assert.equal(elia.zone, "Northern Felwithe");
  assert.equal(elia.mapped, true);
  // Kazen Fecae is linked in another step; here he is only named.
  const kazen = stepPlace(step("Necromancer Epic Quest", (t) => t.startsWith("Give the Head to Kazen Fecae")));
  assert.equal(kazen.who?.name, "Kazen Fecae");
  assert.equal(kazen.zone, "Lake Rathetear");
});

test("every plan's stops land inside the zone map they're pinned on", (t) => {
  // Reads the map files the app draws (public/data/maps, built per install); skipped where they aren't.
  const maps = path.join(__dirname, "../../../public/data/maps");
  if (!fs.existsSync(maps)) return t.skip("no map files on disk");
  const bounds = (file: string) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const src of ["brewall", "stock"]) for (const layer of ["", "_1", "_2", "_3"]) {
      const f = path.join(maps, src, `${file}${layer}.txt`);
      if (!fs.existsSync(f)) continue;
      for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        if (!l.startsWith("L")) continue;
        const n = l.slice(1).split(",").map(Number);
        for (const [x, y] of [[n[0], n[1]], [n[3], n[4]]]) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : undefined;
  };
  let pins = 0;
  for (const plan of QUEST_PLANS) {
    const needed = planItems(plan).map((name) => ({ name, origin: { kind: "quest", name: plan.quest } }));
    for (const { zone } of planByZone(plan)) {
      const file = zone && CURATED_ZONES.find((z) => samePlace(z.name, zone))?.file;
      const b = file && bounds(file);
      if (!b) continue;
      for (const p of planPins(needed, (z) => samePlace(z, zone))) {
        pins++;
        // Map coordinates are /loc's negated; a little slack for a spot on the very edge of a drawing.
        const [mx, my] = [-p.x, -p.y];
        assert.ok(mx >= b.minX - 150 && mx <= b.maxX + 150 && my >= b.minY - 150 && my <= b.maxY + 150, `${plan.quest}: ${p.title} @ ${p.y}, ${p.x} is off the ${zone} map`);
      }
    }
  }
  assert.ok(pins > 500, `only ${pins} pins checked`);
});

test("in a stage's company: a continuation is placed where the step before it was, a first name finds its person, and every placeless step says why", () => {
  const placed = (quest: string, find: (t: string) => boolean) => {
    const plan = planFor(quest)!;
    for (const stage of plan.stages) {
      const i = stage.steps.findIndex((s) => find(s.text));
      if (i >= 0) return stagePlaces(stage, undefined, plan)[i];
    }
    throw new Error(`no step in ${quest}`);
  };
  // "Receive the Jeweled Dragon Head Hilt" follows the hand-in to Wenden in East Freeport.
  const hilt = placed("Warrior Epic Quest", (t) => t.startsWith("Receive the Jeweled Dragon Head Hilt"));
  assert.equal(hilt.inherited, true);
  assert.equal(hilt.zone, "East Freeport");
  // "…Find Jark in North Kaladim. Tell him…" names its own zone (an alias), and a "him" mid-sentence
  // doesn't make it a continuation of the Plane of Hate step before it.
  const jark = placed("Paladin Epic Quest", (t) => t.startsWith("Do the Pure Crystal Quest"));
  assert.equal(jark.zone, "North Kaladim");
  assert.equal(jark.inherited, undefined);
  // "Return Translated Parchment to Stanos": the one Stanos this plan places.
  assert.equal(placed("Rogue Epic Quest", (t) => t.startsWith("Return Translated Parchment to Stanos")).who?.name, "Stanos Herkanor");
  // No place, and a reason for it.
  assert.equal(placed("Enchanter Epic Quest", (t) => t.startsWith("Purchase a Quill")).why, "vendor");
  assert.equal(placed("Druid Epic Quest", (t) => t.startsWith("Create a Summoned: Firefly Globe")).why, "spell");

  // Across every plan, a step is placed or says why — and few are left with nothing to say.
  let unstated = 0;
  for (const plan of QUEST_PLANS)
    for (const stage of plan.stages)
      for (const p of stagePlaces(stage, undefined, plan)) {
        assert.ok(p.zone || p.why, `${plan.quest} / ${stage.title}: a step with neither a place nor a reason`);
        if (p.why === "unstated") unstated++;
      }
  assert.ok(unstated <= 10, `${unstated} steps that should name a place and don't`);
});
