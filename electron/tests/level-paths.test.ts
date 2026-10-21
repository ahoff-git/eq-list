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
import { parseInventoryDump } from "../../src/shared/game-export-dumps";
import { rankedSpellTitle, spellName, spellRank } from "../../src/shared/combat/combat-parser";
import { levelInName, pageForName, unrankedSpellTitle } from "../../src/shared/upgrade-view";
import { itemGrade, itemBaseName } from "../../src/shared/names";
import { sumPrices } from "../loot-prices";
import { TRADESKILLS } from "../../src/shared/tradeskills/tradeskills.generated";
import { createStore } from "../store";

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
