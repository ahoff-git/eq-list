/**
 * Black-box tests for the wiki HTML parser, pinned against real eqlwiki pages
 * captured under fixtures/wiki/. Because parse.ts is coupled to the wiki's DOM,
 * these guard against silent breakage if the parser (or a refreshed fixture)
 * changes. Re-capture a fixture only when the wiki's markup genuinely changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseWikiPage } from "../wiki/parse";

const FIXTURES = path.resolve(__dirname, "../../../fixtures/wiki");

function parseFixture(slug: string, title: string) {
  const html = fs.readFileSync(path.join(FIXTURES, `${slug}.html`), "utf8");
  return parseWikiPage(title, `/${title.replace(/ /g, "_")}`, html);
}

test("item page → drop sources with mob and zone", () => {
  const p = parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic");
  assert.equal(p.kind, "item");
  const drops = p.sources.filter((s) => s.kind === "drop");
  assert.ok(drops.some((d) => d.where === "Myconid Spore King" && d.detail === "Old Sebilis"));
  assert.equal(p.components.length, 0);
});

test("item page → stat card for the hover tooltip; mob page has none", () => {
  const item = parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic");
  assert.ok(item.card, "item should have a stat card");
  assert.equal(item.card!.title, "Fungus Covered Scale Tunic");
  assert.ok(item.card!.lines.length > 0);
  // A mob's loot cards live inside .hb tooltips, so the mob page itself has no own card.
  const mob = parseFixture("mob-hill-giant", "A Hill Giant");
  assert.equal(mob.card, undefined);
});

test("quest page → giver/zone sources, turn-in components, rewards", () => {
  const p = parseFixture("quest-aviak-talons", "Aviak Talons");
  assert.equal(p.kind, "quest");
  assert.ok(p.sources.some((s) => s.detail === "Start zone" && s.where === "North Kaladim"));
  assert.ok(p.sources.some((s) => s.detail === "Quest giver"));
  // The prose says "Aviak Talons" (plural) but links to /Aviak_Talon — we store the
  // canonical singular name so it matches loot lines.
  const talon = p.components.find((c) => c.qty === 4);
  assert.equal(talon!.name, "Aviak Talon");
  assert.equal(talon!.wikiPath, "/Aviak_Talon");
  assert.ok(p.rewards.length >= 1);
});

test("mob/NPC page → classified as mob with Known Loot", () => {
  const p = parseFixture("mob-hill-giant", "A Hill Giant");
  assert.equal(p.kind, "mob");
  assert.ok(p.components.length > 5);
  assert.ok(p.components.some((c) => c.name === "Hill Giant Toes"));
});

test("player-craftable item → recipe components", () => {
  const p = parseFixture("recipe-batwing-crunchies", "Batwing Crunchies");
  assert.equal(p.kind, "recipe");
  assert.ok(p.components.some((c) => c.name === "Frosting"));
  assert.ok(p.components.some((c) => c.name === "Bat Wing"));
  assert.ok(p.sources.some((s) => s.kind === "recipe"));
});
