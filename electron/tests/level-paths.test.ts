/**
 * The level of a thing travels intact from where the game names it to the name a view hands
 * `ItemLink` — checked path by path, not just classified (`item-link-levels.test.ts` lists the call
 * sites; this proves the categories it sorts them into). ADR 0312, ADR 0316.
 *
 * Each test follows one real path: a log line, a dump row, a price row, a ranked cast, a cached wiki
 * page. Re-run when any of those readers changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitLine, parseCombine, parseLoot } from "../../src/shared/log-parser";
import { heldGrades, inventoryTotals, parseInventoryDump } from "../../src/shared/game-export-dumps";
import { rankedSpellTitle, spellName, spellRank } from "../../src/shared/combat/combat-parser";
import { ladderOf, levelInName, pageForName, unrankedSpellTitle } from "../../src/shared/upgrade-view";
import { itemGrade, itemBaseName } from "../../src/shared/names";
import { sumPrices } from "../loot-prices";
import { TRADESKILLS, VENDORS } from "../../src/shared/tradeskills/tradeskills.generated";
import { whereToBuy } from "../../src/shared/tradeskills/where-to-buy";
import { buildHunt, huntInputsFor } from "../../src/shared/mob/hunt";
import { createStore } from "../store";
import { createLootLog, LOOT_LOG_MIGRATIONS } from "../loot-log";
import { openAppDatabase } from "../sqlite-store";
import { createCombatStats } from "../combat-stats";
import { dropKey } from "../../src/shared/mob/mob-stats";
import { reconcileDrops } from "../../src/shared/mob/drop-truth";
import { itemDropSources } from "../../src/shared/items/item-sources";
import { itemRows, NO_CRITERIA } from "../../src/shared/items/item-search";
import { bisPlan } from "../../src/shared/items/bis-plan";
import { shareKind } from "../../src/shared/peers/peer-share";
import { gradedTitle } from "../../src/shared/items/item-upgrade";

const REPO_ROOT = path.join(__dirname, "../../..");

test("loot: a graded drop keeps its grade from the log line to the ledger's item name", () => {
  // Real line shapes from an EQL log — both loot wordings.
  for (const [raw, name] of [
    ["[Tue Jul 21 20:47:20 2026] You looted a Minotaur Battle Axe +1 from a minotaur slaver's corpse and sold it for 2 platinum and 5 gold.", "Minotaur Battle Axe +1"],
    ["[Tue Jul 21 20:54:16 2026] --You have looted a Mechanical Light Emitter +1 from rogue clockwork's corpse.--", "Mechanical Light Emitter +1"],
  ] as const) {
    const loot = parseLoot(splitLine(raw, 1)!);
    assert.equal(loot?.item, name, "the ledger stores — and the Loot tab links — the name as looted");
    assert.equal(levelInName(loot!.item, "item"), 1, "which ItemLink reads as +1");
  }
});

test("prices: graded copies are their own price rows, so each links at its own grade", () => {
  const row = (item: string, copper: number) => ({ item, unitCopper: copper, qty: 1, copper, sales: 1, lastAt: "2026-10-20T10:00:00" });
  const rows = sumPrices([row("Dragoon Dirk", 100), row("Dragoon Dirk +2", 400), row("Dragoon Dirk +2", 600)]);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.item, r.qty])), { "Dragoon Dirk": 1, "Dragoon Dirk +2": 2 });
});

test("inventory dump: a row's name keeps its grade, and the parsed grade agrees with ItemLink's reading", () => {
  const items = parseInventoryDump(["Location\tName\tID\tCount\tSlots", "Fingers\tMoonstone Ring +4\t10150\t1\t11", "Bank1\tBackpack*\t32601\t1\t8"].join("\r\n"));
  for (const item of items) assert.equal(item.grade, levelInName(item.name, "item"), item.name);
  assert.equal(items[0].name, "Moonstone Ring +4");
});

test("spells: a ranked name is read back at its rank, and falls back to the unranked page", () => {
  for (const rank of ["II", "VI", "X"]) {
    const title = rankedSpellTitle("Shock of Lightning", rank);
    assert.equal(spellRank(title), rank);
    assert.equal(unrankedSpellTitle(title), "Shock of Lightning", "the wiki has the base page; ItemLink levels it");
    assert.ok(levelInName(title, "spell") > 0);
  }
  assert.equal(spellName(rankedSpellTitle("Root", undefined)), "Root", "no rank, no change");
  // An item's roman numeral is part of its name, not a level.
  assert.equal(levelInName("Cloak of Flames II", "item"), 0);
});

test("the catalogue: an item page is the +0 thing, so a level is applied once, never twice", () => {
  // Read the shipped cache directly: every item page either has no grade in its title, or is an alias
  // of the base page (same wiki path, same card) — so ItemLink levelling `Cloth Cape +2` applies the
  // grade to +0 numbers exactly once.
  const pages = new Map<string, { wikiPath?: string; lines?: string[] }>();
  const dir = path.join(REPO_ROOT, "public", "data", "wiki-cache", "pages");
  for (const file of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const [title, , json] = line.split("\t");
      if (!json?.startsWith('{"kind":"item"')) continue;
      const page = JSON.parse(json) as { wikiPath?: string; card?: { lines?: string[] } };
      pages.set(title, { wikiPath: page.wikiPath, lines: page.card?.lines });
    }
  }
  assert.ok(pages.size > 1000, "the shipped catalogue was read");
  const graded = [...pages.keys()].filter((t) => itemGrade(t) !== undefined);
  for (const title of graded) {
    const base = pages.get(itemBaseName(title));
    assert.ok(base, `${title} has a base page`);
    assert.equal(pages.get(title)!.wikiPath, base.wikiPath, `${title} is an alias of its base page`);
    assert.deepEqual(pages.get(title)!.lines, base.lines, `${title}'s card is the +0 card, so it's levelled once`);
  }
});

test("shopping list: an entry added by a graded name keeps it, so the List tab links it at that grade", () => {
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "eql-level-list-")));
  const list = store.addEntry({ name: "Dragoon Dirk +2" });
  const entry = list.entries.find((e) => itemBaseName(e.name) === "Dragoon Dirk");
  assert.equal(entry?.name, "Dragoon Dirk +2");
  assert.equal(levelInName(entry!.name, "item"), 2);
});

test("a spell page found under its exact name is that spell, shown as printed — not levelled by its numeral", () => {
  const spell = (title: string) => ({ kind: "spell" as const, title, card: { title, lines: ["Mana: 100"] } });
  const item = (title: string) => ({ kind: "item" as const, title, card: { title, lines: ["AC: 20"] } });
  // A classic sequel has its own page: it is that spell, at level 0.
  assert.deepEqual(pageForName("Burnout II", spell("Burnout II"), null), { page: spell("Burnout II"), level: 0 });
  // A rank of yours has no page; its base page is shown at the rank.
  assert.deepEqual(pageForName("Shock of Lightning VI", null, spell("Shock of Lightning")), { page: spell("Shock of Lightning"), level: 6 });
  // An item alias page is the +0 card, levelled by the name's grade.
  assert.deepEqual(pageForName("Cloth Cape +2", item("Cloth Cape +2"), null)?.level, 2);
  // An item that merely ends in a numeral never borrows a spell's card.
  assert.equal(pageForName("Cloak of Flames II", null, item("Cloak of Flames")), null);
});

test("the catalogue: every spell page titled with a numeral is shown at level 0 under its own name", () => {
  const dir = path.join(REPO_ROOT, "public", "data", "wiki-cache", "pages");
  const numbered: { kind: "spell"; title: string }[] = [];
  for (const file of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const [title, , json] = line.split("\t");
      if (json?.startsWith('{"kind":"spell"') && spellRank(title)) numbered.push({ kind: "spell", title });
    }
  }
  assert.ok(numbered.length > 100, "the shipped catalogue has its numbered spells");
  for (const page of numbered) assert.equal(pageForName(page.title, page, null)?.level, 0, page.title);
});

test("crafting log: a crafted item's name is kept as the log wrote it, so a graded result would keep its grade", () => {
  // A real combine line — a fresh craft is +0, and the name reaches the Crafting log untouched.
  const real = parseCombine(splitLine("[Tue Aug 25 23:57:43 2026] You have fashioned the items together to create something new: Small Brick of High Quality Ore.", 1)!);
  assert.equal(real?.item, "Small Brick of High Quality Ore");
  // Should the game ever write a graded result, nothing on the way strips it.
  const graded = parseCombine(splitLine("[Tue Aug 25 23:57:49 2026] You have fashioned the items together to create something new: Dragoon Dirk +2.", 1)!);
  assert.equal(levelInName(graded!.item, "item"), 2);
});

test("tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing", () => {
  const names: string[] = [];
  const walk = (line: { needs?: { name: string; alternatives?: string[] }[]; makes?: string[]; children?: unknown[] }) => {
    for (const n of line.needs ?? []) names.push(n.name, ...(n.alternatives ?? []));
    names.push(...(line.makes ?? []));
    for (const c of (line.children ?? []) as (typeof line)[]) walk(c);
  };
  for (const skill of TRADESKILLS)
    for (const guide of skill.guides)
      for (const block of guide.blocks) {
        if (block.kind === "list") block.items.forEach(walk);
        if (block.kind === "table") {
          for (const row of block.needs ?? []) for (const n of row) names.push(n.name, ...(n.alternatives ?? []));
          for (const row of block.makes ?? []) names.push(...row);
        }
      }
  assert.ok(names.length > 300, "the shipped guides were read");
  assert.deepEqual(names.filter((n) => itemGrade(n) !== undefined), []);
});

// ─── Per view: each traced from the data or function that view renders ────

/** Every page in the shipped cache, by kind. */
function shippedPages(): { title: string; page: Record<string, unknown> }[] {
  const dir = path.join(REPO_ROOT, "public", "data", "wiki-cache", "pages");
  const out: { title: string; page: Record<string, unknown> }[] = [];
  for (const file of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const [title, , json] = line.split("\t");
      if (json?.startsWith("{")) out.push({ title, page: JSON.parse(json) });
    }
  }
  return out;
}

test("Spells tab: every catalogue row opens and hovers as printed, at level 0 — its title is the spell", () => {
  // SpellCatalogTable links `row.spell.title`, which is a spell page's own title.
  const spells = shippedPages().filter((p) => p.page.kind === "spell");
  assert.ok(spells.length > 2000);
  for (const { title, page } of spells) {
    const shown = pageForName(title, { ...(page as object), kind: "spell", title } as never, null);
    assert.equal(shown?.level, 0, title);
  }
});

test("Wiki page view: every component, reward and drop name a page links is a +0 wiki name", () => {
  // WikiPageView links `c.name` (components), `r.item` (rewards) and `m.name`/sources off the page.
  const graded: string[] = [];
  let names = 0;
  for (const { page } of shippedPages()) {
    for (const c of (page.components as { name?: string }[] | undefined) ?? []) if (c.name && (names++, itemGrade(c.name) !== undefined)) graded.push(c.name);
    for (const r of (page.rewards as { item?: string }[] | undefined) ?? []) if (r.item && (names++, itemGrade(r.item) !== undefined)) graded.push(r.item);
  }
  assert.ok(names > 1000, "the shipped pages were read");
  assert.deepEqual(graded, [], "a linked name with a grade would be shown at that grade — none are");
});

test("Hunt tab: an item on your list keeps its name, grade and all, from list entry to the Hunt row", () => {
  // HuntPanel links `it.item` / `g.item`, built by `buildHunt(huntInputsFor(entries, …))`.
  const entry = { id: "e1", name: "Dragoon Dirk +2", needed: 1, obtained: 0, added: "2026-10-20T10:00:00.000Z" };
  const sources = { "Dragoon Dirk +2": [{ kind: "drop" as const, where: "a gnoll", detail: "Blackburrow" }] };
  const zones = buildHunt(huntInputsFor([entry as never], sources as never, {}));
  const shown = JSON.stringify(zones);
  assert.ok(shown.includes('"Dragoon Dirk +2"'), "the Hunt row links the name as listed");
  assert.equal(levelInName("Dragoon Dirk +2", "item"), 2);
});

test("Tradeskills: the shopping view names each material exactly as the guide does", () => {
  // TradeskillsPanel's "Where to buy" links `s.item`/`item` from `whereToBuy(materials, VENDORS, …)`.
  const materials = ["Bone Chips", "Small Piece of Ore", "Water Flask", "Not A Real Item"];
  const plan = whereToBuy(materials, VENDORS, null, new Set());
  const named = [...plan.here.map((h) => h.item), ...plan.stops.flatMap((s) => s.items.map((i) => i.item)), ...plan.elsewhere, ...plan.notSold];
  for (const name of named) assert.ok(materials.includes(name), `${name} is a guide name, unchanged`);
  assert.ok(named.length >= materials.length, "every material lands somewhere");
});

test("Loot tab: a graded drop is stored and read back as looted, so its row links at its grade", () => {
  // LootPanel links `row.item` from the loot ledger (`recent()`), filled by `add()` from a loot line.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-level-loot-"));
  const loot = createLootLog(openAppDatabase(dir, LOOT_LOG_MIGRATIONS), dir);
  loot.add({ kind: "loot", item: "Dragoon Dirk +2", qty: 1, source: "a gnoll", fate: "kept", logId: 1, raw: "looted", at: "2026-10-20T10:00:00" } as never);
  assert.equal(loot.recent()[0]?.item, "Dragoon Dirk +2");
  assert.equal(levelInName(loot.recent()[0].item, "item"), 2);
});

test("MobKills: your kills' drops are keyed by case only, so a graded drop shows as looted", () => {
  // MobKills links `drop.item` from your kill log's per-mob drops, keyed by `dropKey`.
  assert.equal(dropKey("Copper Amulet +2"), "copper amulet +2", "the grade is part of the key — not folded");
});

test("MobKnowledge: a mob's reconciled drop table folds a graded drop into its item — by design", () => {
  // MobKnowledge links `drop.item` from `reconcileDrops`: a +2 drop is the same drop (ADR 0057).
  const truth = reconcileDrops({ "Gnoll Slayer": "5%" }, { "Gnoll Slayer +2": 1 }, 10);
  assert.deepEqual(truth.map((t) => t.item), ["Gnoll Slayer"]);
});

test("ItemDrops: each row links the mob that dropped the item — a mob name, whatever the item's grade", () => {
  // ItemDrops links `row.mob` from `itemDropSources(item, knowledge)`.
  const known = [
    { mob: "a gnoll pup", zone: "Blackburrow", kills: 4, myKills: 4, contributors: [], lastAt: "2026-10-20T10:00:00", drops: [{ item: "gnoll slayer", count: 1, rate: 0.25 }] },
  ];
  const rows = itemDropSources("Gnoll Slayer +2", known as never);
  assert.deepEqual(rows.map((r) => r.mob), ["a gnoll pup"]);
});

test("Camp report: its mob column is the name a kill was recorded under — a mob, never an item", () => {
  // CampReport links `row.mob` from the session's `byMob`, keyed by `recordKill(mob)`.
  const stats = createCombatStats(() => "2026-07-29T00:00:00.000Z");
  stats.recordKill("a gnoll pup", "2026-07-29T00:00:05");
  assert.deepEqual(stats.snapshot().session.byMob.map((m) => m.mob), ["a gnoll pup"]);
});

test("Search tab: every graded title in the search index is an alias of its +0 page", () => {
  // SearchPanel links `r.title` from the wiki's title index; a `+N` title must be the base page's alias.
  const index = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "public", "data", "wiki-cache", "title-index.json"), "utf8")) as { titles: string[] };
  const titles = new Set(index.titles);
  assert.ok(titles.size > 5000, "the search index was read");
  const graded = [...titles].filter((t) => itemGrade(t) !== undefined);
  for (const t of graded) assert.ok(titles.has(itemBaseName(t)), `${t} has its +0 page in the index`);
});

test("best in slot: a held graded item is picked and shown at its grade", () => {
  // BisWearTable links `gradedTitle(pick.item.title, pick.item.grade)` from `bisPlan`'s picks.
  const rows = itemRows([{ title: "Gnoll Slayer", origin: "wiki", card: { title: "Gnoll Slayer", lines: ["Slot: PRIMARY", "STR: +5", "Class: ALL", "Race: ALL"] }, sources: [], outOfEra: false } as never]);
  const inventory = parseInventoryDump(["Location\tName\tID\tCount\tSlots", "Primary\tGnoll Slayer +3\t5417\t1\t11"].join("\r\n"));
  const plan = bisPlan({ rows, inventory, criteria: { ...NO_CRITERIA, hideOutOfEra: false }, weights: { str: 1 } });
  const pick = plan.loadout.picks.find((p) => p.item.title === "Gnoll Slayer");
  assert.equal(pick?.item.grade, 3);
  assert.equal(gradedTitle(pick!.item.title, pick!.item.grade), "Gnoll Slayer +3");
});

test("not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it", () => {
  // Every `notAnItem(...)` link — a mob, zone, NPC, faction, quest or guide — opens a page whose card
  // `ladderOf` gives no ladder, so no level in the name can change what is shown.
  const others = shippedPages().filter((p) => !["item", "recipe", "spell"].includes(String(p.page.kind)));
  assert.ok(others.length > 1000, "the shipped mob, zone and quest pages were read");
  for (const { title, page } of others) assert.equal(ladderOf(page as never), undefined, `${title} (${String(page.kind)})`);
});

test("best in slot: hunt targets are catalogue items you don't hold, named at +0", () => {
  // BisHuntTable / BisWearTable / BisEffects link `wikiName(hunt.item.title)`, a catalogue row's title.
  const card = (title: string, str: number) => ({ title, origin: "wiki", card: { title, lines: ["Slot: HEAD", `STR: +${str}`, "Class: ALL", "Race: ALL"] }, sources: [], outOfEra: false });
  const rows = itemRows([card("Old Cap", 1), card("Better Cap", 9)] as never);
  const inventory = parseInventoryDump(["Location\tName\tID\tCount\tSlots", "Head\tOld Cap +2\t1\t1\t11"].join("\r\n"));
  const plan = bisPlan({ rows, inventory, criteria: { ...NO_CRITERIA, hideOutOfEra: false }, weights: { str: 1 } });
  assert.deepEqual(plan.hunt.map((h) => [h.item.title, h.item.grade]), [["Better Cap", 0]]);
});

test("Items tab: an owned item's row is weighed and linked at the best grade you hold", () => {
  // ItemTable links `gradedTitle(row.item.title, row.grade)`; `row.grade` is `heldGrades`' answer.
  const items = parseInventoryDump(["Location\tName\tID\tCount\tSlots", "Fingers\tMoonstone Ring +1\t1\t1\t11", "Bank1\tMoonstone Ring +4\t1\t1\t11"].join("\r\n"));
  const grade = heldGrades(items, (n) => n.toLowerCase()).get("moonstone ring") ?? 0;
  assert.equal(gradedTitle("Moonstone Ring", grade), "Moonstone Ring +4");
});

test("Exports by item: a total is linked at the best grade among the copies it counts", () => {
  // InventoryDumpView links `gradedTitle(t.baseName, t.bestGrade)` from `inventoryTotals`.
  const totals = inventoryTotals(parseInventoryDump(["Location\tName\tID\tCount\tSlots", "General 1\tGnoll Slayer\t1\t1\t11", "Bank1\tGnoll Slayer +3\t1\t1\t11"].join("\r\n")));
  const t = totals.find((x) => x.baseName === "Gnoll Slayer")!;
  assert.equal(gradedTitle(t.baseName, t.bestGrade), "Gnoll Slayer +3");
});

test("Who has it: a peer's row carries their best grade and is linked at it", () => {
  // PeerInventories links `gradedTitle(f.item, f.bestGrade)` from the peer's inventory row's `grade`.
  const [row] = shareKind("inventory")!.read([{ item: "Gnoll Slayer", count: 2, grade: 3, places: [], asOf: "2026-10-20T10:00:00.000Z" }], () => "id") as {
    item: string;
    grade?: number;
  }[];
  assert.equal(gradedTitle(row.item, row.grade ?? 0), "Gnoll Slayer +3");
});
