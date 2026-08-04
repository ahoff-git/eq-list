/**
 * Black-box tests for classifying a map label. **Every input here is a real label** from the
 * bundled packs — that's the point: the classifier exists so the map can offer to hide the kinds
 * you don't want, and it has to agree with what the mapmakers actually wrote.
 *
 * The colors those labels wear corroborate it (zone lines are red, quest givers teal/blue, forges
 * purple), but the color is a per-author convention — the same kind comes in `255,0,0` and
 * `240,0,0` — so the text is what's trusted. See `poi-kinds.ts` and
 * [ADR 0048](../../specs/decisions/0048-a-map-label-is-read-by-its-words.md).
 *
 * The counts quoted below are from a tally of the whole corpus (760 files, ~19,000 distinct
 * labels), which is what earns a rule its place.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { POI_GROUPS, POI_KINDS, poiGroupSummary, poiKind, poiKindSummary } from "../../src/shared/map/poi-kinds";
import type { MapPoi } from "../../src/shared/map/eqmap";

const poi = (label: string, color?: string, z = 0): MapPoi => ({ y: 0, x: 0, z, label, color, size: 2 });

test("a zone line, an arrival or a succor point is a zone line", () => {
  for (const label of [
    "to The Steamfont Mountains",
    "to Grimling Forest",
    "To Plane of Knowledge", // packs are inconsistent about the capital
    "Succor",
    "to A", // an intra-map link, written the same way
    "from The Plane of Tranquility",
    "Zone In/Out",
    "Instance Zone Out",
    "Entrance to Thurgadin",
  ])
    assert.equal(poiKind(label), "zoneline", label);
});

test("how you work a zone line doesn't stop it being one", () => {
  // 30 markers say "click the book"; the bracket is an instruction, not the thing.
  assert.equal(poiKind("to The Plane of Knowledge (Click Book)"), "zoneline");
  assert.equal(poiKind("to Muramite Proving Grounds (click Post)"), "zoneline");
  assert.equal(poiKind("to The Buried Sea (Long Boat)"), "zoneline");
  assert.equal(poiKind("to Direwind Cliffs (Fall)"), "zoneline");
});

test("the magical and nautical ways out are transport, not zone lines", () => {
  for (const label of [
    "Druid Ring",
    "Wizard Spires",
    "Great Spires",
    "Teleport Pad",
    "Teleporter Down",
    "Knowledge Portal",
    "Portal 3",
    "Boat Dock",
    "Portal to Island 2 Azarack (Key of the Misplaced)",
  ])
    assert.equal(poiKind(label), "transport", label);
});

test("the physical ways between levels are their own kind", () => {
  for (const label of [
    "Up",
    "DOWN",
    "Ladder",
    "Elevator to 3rd",
    "Elevator (click)",
    "Stairs Down",
    "Ramp to Caves",
    "Lift",
    "Swim Out (Underwater)",
    "Jump In",
    "Drop to Basement",
    "Climb over ice to continue up",
    "One-Way (to East)",
    "nest (up)",
  ])
    assert.equal(poiKind(label), "passage", label);
});

test("doors, the walls that are really doors, and the things that work them", () => {
  for (const label of [
    "Fake Wall", // 138 of them, the commonest feature label in the corpus
    "Secret Door",
    "Locked Door (Picklock 200+)",
    "Locked Door (Droga Jail Key,Picklock 100)",
    "Locked Door (Jade Inlaid Key,Unpickable)",
    "Blocked Door",
    "Bridge Lever",
    "Hidden Door (Click to Open)",
    "Trapdoor (locked until Life and Death finished)",
  ])
    assert.equal(poiKind(label), "door", label);
});

test("a trap is a trap, whatever it's dressed as", () => {
  for (const label of ["TRAP", "Trap", "TRAP: Swinging Axe", "TRAP: Fake Door", "TRAP: Fake Floor", "TRAP: Spawn"])
    assert.equal(poiKind(label), "trap", label);
  // The one hazard the packs mark in brackets.
  assert.equal(poiKind("Merci`s Feeding Pit (KOS)"), "trap");
});

test("a quest, task, mission or Heroic Adventure marker is a quest", () => {
  for (const label of [
    "Gorbak (Quests)",
    "Tesil Gludien (Task Master)",
    "Spirit Hunter Azmaro (Missions)",
    "Artisan Vivian Selgan (Tradeskill Quests)",
    "Poison Master Telkos (Poison Tasks)", // "poison" is a trade word; "tasks" outranks it
    "Lady Caroline of Thex (Epic Memories)",
  ])
    assert.equal(poiKind(label), "quest", label);
});

test("GS is Ground Spawn, not a quest prefix", () => {
  // 422 distinct labels. Reading "GS:" as a quest marker filed a zone's whole foraging map under
  // Quests, which is where this classifier's worst mistake used to live alongside the merchants.
  for (const label of ["GS: Yew Leaf", "GS: Brell`s Bounty", "GS (Vial of Swamp Water)"])
    assert.equal(poiKind(label), "loot", label);
  for (const label of ["Fiery Peppers Ground Spawn: west side", "Hero`s Forge Tools Mob Drop"])
    assert.equal(poiKind(label), "loot", label);
});

test("a trade in parentheses is a merchant — the commonest shape in the whole corpus", () => {
  for (const label of [
    "Gruppip (Wizard Spells)",
    "Ermden (Weapons)",
    "Willaen (Banker)",
    "Tialechaety (Tinkering Supplies)",
    "Yuggom (GM Wizard)", // a GuildMaster, i.e. the class trainer
    "Zebuxoruk (Chronobines Vendor)",
    "Bartender (Bar)",
    "a spell research merchant (Research)",
  ])
    assert.equal(poiKind(label), "merchant", label);
});

test("a shop word beats a word that only sounds like a spawn or a quest", () => {
  // Both brackets carry a word another rule wants; naming a shop is the more specific claim.
  assert.equal(poiKind("Bakaak (Raid Merchant)"), "merchant");
  assert.equal(poiKind("Xerix (Adventure Merchant)"), "merchant");
  // And a shop named after the portal it stands beside is still a shop.
  assert.equal(poiKind("Portal Merchant"), "merchant");
});

test("a service labelled without a bracket is still a service", () => {
  for (const label of ["Merchants", "Spell Merchants", "Bankers", "Bank", "Soulbinder", "Priest of Discord"])
    assert.equal(poiKind(label), "merchant", label);
});

test("a notable spawn is told from an ordinary one by the bracket, not the name", () => {
  // `(Hunter)` and its variants are the corpus's single most common parenthetical — 4,119 distinct
  // labels — and the old classifier recognised only the bare form, filing the rest as merchants.
  for (const label of [
    "Xalgoti (Hunter)",
    "Shoon (Hunter,Roam)",
    "a timid harpy (Hunter,Roam,HS)",
    "Vaniki (Hunter,5days+2hours)",
    "Gullerback (Hunter", // a real label: the pack forgot the closing bracket
    "Prince Jerranad (Boss)",
    "Mujaki the Devourer (Raid)",
    "War Forge Assistant (Roam)",
    "Kilidna (SHD:2.0)", // an epic target's class and tier
    "Shilur Scaletine (Epic)",
    "Boss",
    "Mini-Boss",
    "Deathleaper PH=a rampaging wyvern", // named it stands in for, so the named is the marker
  ])
    assert.equal(poiKind(label), "spawn", label);
});

test("an article means an ordinary spawn; a bare proper name doesn't", () => {
  // The same a/an/the signal the cast-alert matcher uses to tell a mob from a player.
  for (const label of ["a grimling arcanist", "a waterlogged chest", "The Sleeper"])
    assert.equal(poiKind(label), "mob", label);
  for (const label of ["Hexxt Shadowslayer", "Arias", "Grimling Forest", "Ring of Fire", "Bandit Camp"])
    assert.equal(poiKind(label), "named", label);
  // `X PH=Y` marks the spot where X spawns and says what stands there meanwhile, so the marker is
  // about X — even when X's own name carries an article, as a Hunter target's often does.
  assert.equal(poiKind("a drolvarg captain PH=a drovlarg lieutenant"), "spawn");
});

test("a tradeskill station is named by the object, not a person", () => {
  for (const label of ["Forge", "Loom", "Kiln", "Oven", "Pottery Wheel", "Brew Barrel", "Fletching Table"])
    assert.equal(poiKind(label), "craft", label);
  // A station keeps being a station even when it wears a trade's brackets.
  assert.equal(poiKind("Feir`Dal Forge (Cultural)"), "craft");
  assert.equal(poiKind("Tinmizer`s Stupendous Contraption (Pottery Wheel)"), "craft");
  // And an article-led name isn't dragged into a station by a word inside it.
  assert.equal(poiKind("a barrel golem"), "mob");
  // The generic object words are anchored to the whole label, or these two become furniture.
  assert.equal(poiKind("Cauldron of Hate Overseer"), "named");
  assert.equal(poiKind("Still Sky`s Scholar"), "named");
});

test("what's left is a note, not a guess", () => {
  for (const label of ["map by Cardiac of Drinal", "-1200, 400 tunnel", "101 Market Street", ".", ""])
    assert.equal(poiKind(label), "note", label);
  // A long sentence isn't somebody's name.
  assert.equal(poiKind("TIP: Stand here and kill golem. Snake will not add."), "note");
  // Credits and tooling occasionally leak onto the drawn layer instead of the credits layer.
  assert.equal(poiKind("Original Map: Brewall Rainsinger"), "note");
  assert.equal(poiKind("Height Filter: 25/25"), "note");
});

test("the mapmaker's floor labels are their own kind, not notes", () => {
  // They're also what drives the floor filter (`detectFloors`), so they're recognised by the same
  // test rather than a second guess at the same thing.
  for (const label of ["1st Floor", "4th Floor", "Level 2", "Level 1 (Top)"])
    assert.equal(poiKind(label), "floor", label);
  // While a feature that merely *mentions* a level is not a storey marker — which bucket it lands
  // in is a judgement call ("Water - LVL 3" reads as a place), but it must never be a floor, or
  // hiding the floor legend would take real features with it.
  for (const label of ["Water - LVL 3", "Bridge - LVL 2", "TRAP: Fake Floor"])
    assert.notEqual(poiKind(label), "floor", label);
});

test("a bracket it can't read falls through to the label's own words", () => {
  // The rule this replaced was "anything in brackets names the trade they deal in", which made
  // merchants of 5,749 distinct labels. Deferring is what keeps the merchant list honest.
  assert.equal(poiKind("Arena (PvP)"), "named");
  assert.equal(poiKind("Fake Wall (uppermost level)"), "door");
  assert.equal(poiKind("a reanimating hand (Hunter)"), "spawn");
});

test("the summary lists only the kinds a map has, in display order, with counts", () => {
  const summary = poiKindSummary([
    poi("to Lake Rathetear", "rgb(255, 0, 0)"),
    poi("Succor", "rgb(255, 0, 0)"),
    poi("Forge", "rgb(128, 0, 128)"),
    poi("a grimling arcanist"),
  ]);
  assert.deepEqual(
    summary.map((s) => [s.kind, s.count]),
    [
      ["zoneline", 2],
      ["mob", 1],
      ["craft", 1],
    ],
  );
  // Order follows POI_KINDS, so the panel doesn't reshuffle between zones.
  const order = POI_KINDS.map((k) => k.kind);
  assert.deepEqual(
    summary.map((s) => s.kind),
    order.filter((k) => summary.some((s) => s.kind === k)),
  );
  // A zone with no quest markers doesn't offer to hide them.
  assert.ok(!summary.some((s) => s.kind === "quest"));
});

test("each row reports the color those labels actually wear here, not one we assumed", () => {
  const summary = poiKindSummary([
    poi("to A", "rgb(255, 0, 0)"),
    poi("to B", "rgb(255, 0, 0)"),
    poi("to C", "rgb(240, 0, 0)"), // the same kind, a different author's red
    poi("a bat"), // no color in the file at all
  ]);
  assert.equal(summary.find((s) => s.kind === "zoneline")?.color, "rgb(255, 0, 0)");
  assert.equal(summary.find((s) => s.kind === "mob")?.color, undefined);
});

test("every kind belongs to exactly one section, and the sections cover them all", () => {
  const groups = new Set(POI_GROUPS.map((g) => g.group));
  for (const kind of POI_KINDS) assert.ok(groups.has(kind.group), `${kind.kind} has no section`);
  for (const group of POI_GROUPS)
    assert.ok(POI_KINDS.some((k) => k.group === group.group), `${group.group} has no kinds`);
});

test("the grouped summary drops empty sections and totals the ones it keeps", () => {
  const groups = poiGroupSummary([
    poi("to Lake Rathetear"),
    poi("Druid Ring"),
    poi("Forge"),
    poi("Gorbak (Quests)"),
    poi("Willaen (Banker)"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.group, g.count]),
    [
      ["travel", 2],
      ["people", 2],
      ["zone", 1],
    ],
  );
  // No doors and no traps on this map, so there's no "Doors & traps" heading to fold.
  assert.ok(!groups.some((g) => g.group === "features"));
  assert.deepEqual(
    groups.find((g) => g.group === "travel")?.kinds.map((k) => k.kind),
    ["zoneline", "transport"],
  );
});
