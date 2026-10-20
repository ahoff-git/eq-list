/**
 * Tests for the spell catalog's I/O half: finding the file beside a log dir, matching a log's
 * spell name (with or without its rank) to a row, and staying quiet when there's no file.
 *
 * Uses the synthetic fixture — see `spell-file.test.ts` on why that's the honest limit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSpellCatalog, findSpellFile } from "../spells";

const FIXTURE = path.join(__dirname, "../../../fixtures/spells_us_sample.txt");

/** A throwaway `<EQ>/Logs` layout, optionally with a spell file in the install beside it. */
function install(withSpells = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-spells-"));
  const logs = path.join(root, "Logs");
  fs.mkdirSync(logs);
  if (withSpells) fs.copyFileSync(FIXTURE, path.join(root, "spells_us.txt"));
  return logs;
}

test("the file is found in the install beside the Logs folder", () => {
  const logs = install();
  const found = findSpellFile(logs);
  assert.ok(found?.endsWith("spells_us.txt"));
  assert.equal(fs.existsSync(found!), true);
});

test("being pointed straight at the install works too", () => {
  const logs = install();
  const root = path.dirname(logs);
  assert.ok(findSpellFile(root), "a moved Logs folder shouldn't be a dead end");
});

test("no install, no file, no error", () => {
  assert.equal(findSpellFile(""), undefined);
  assert.equal(findSpellFile(install(false)), undefined);
});

test("a spell the log named finds its row", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  assert.equal(spells.ready(), true);
  assert.equal(spells.find("Burst of Fire")?.mana, 7);
  // The log's own casing varies; the lookup shouldn't care.
  assert.equal(spells.find("burst of fire")?.mana, 7);
});

test("a ranked row that is the same spell is the answer, not the base spell's cost", () => {
  // A castable row in the same spellbook category is the spell at that rank — a classic sequel like
  // `Burnout II` is the real case; the fixture's `Shock of Lightning VI` stands in for it. (In the real
  // file that name has no row at all; that case is the next tests', ADR 0312.)
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  assert.equal(spells.find("Shock of Lightning", "VI")?.mana, 110);
  assert.equal(spells.find("Shock of Lightning")?.mana, 20);
});

test("an unknown rank falls back to the base spell rather than to nothing", () => {
  // A rank the file doesn't list is better answered with the base spell's figure than a blank —
  // and the caller can see which it got from the returned `name`.
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  const found = spells.find("Shock of Lightning", "XCIX");
  assert.equal(found?.mana, 20);
  assert.equal(found?.name, "Shock of Lightning");
});

test("with no spell file every answer is undefined and nothing throws", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(install(false));
  assert.equal(spells.ready(), false);
  assert.equal(spells.find("Burst of Fire"), undefined);
  assert.equal(spells.file(), undefined);
});

test("changing log folder forgets the previous install's spells", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  assert.equal(spells.ready(), true);
  spells.setLogDir(install(false));
  assert.equal(spells.ready(), false, "the old install's file must not answer for a new one");
});

test("an unknown spell is undefined, not a zero-cost spell", () => {
  // A blank must stay tellable apart from "costs nothing", or a bard song and an unknown spell
  // become the same row.
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  assert.equal(spells.find("Nonexistent Spell"), undefined);
  assert.equal(spells.find("Chant of Battle")?.mana, 0);
});

test("a spell's category is its file row's ids, named by dbstr_us.txt — under the wiki's spelling too", () => {
  const logs = install(false);
  const root = path.dirname(logs);
  const row = (id: number, name: string) => {
    const fields = new Array(100).fill("0");
    fields[0] = String(id);
    fields[1] = name;
    for (let i = 0; i < 16; i++) fields[36 + i] = "255";
    fields[36 + 13] = "20"; // Enchanter
    fields[87] = "126";
    fields[88] = "13";
    return fields.join("^");
  };
  fs.writeFileSync(path.join(root, "spells_us.txt"), [row(1, "Cajoling Whispers"), row(2, "Al`Kabor's Charm")].join("\n"));
  fs.writeFileSync(path.join(root, "dbstr_us.txt"), "13^5^Charm^0^\n126^5^Utility Detrimental^0^\n");
  const spells = createSpellCatalog();
  spells.setLogDir(logs);
  const charm = { category: "Utility Detrimental", subcategory: "Charm" };
  assert.deepEqual(spells.category("Cajoling Whispers"), charm);
  // The wiki types an apostrophe and disambiguates with "(Spell)"; the file writes a backtick.
  assert.deepEqual(spells.category("Al'Kabor's Charm (Spell)"), charm);
  assert.equal(spells.category("Nothing Like It"), undefined);
});

test("with no dbstr_us.txt a spell simply has no category", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(install());
  assert.equal(spells.category("Burst of Fire"), undefined);
});

// ── a rank is an upgrade level (ADR 0312) ─────────────────────────────────────────────────────────

/** One spells_us.txt row: everything 0, no class can cast it unless `wizardLevel` says so. */
function row(id: number, name: string, f: { mana?: number; castMs?: number; wizardLevel?: number; cat?: number; sub?: number; formula?: number; ticks?: number }): string {
  const cols = Array.from({ length: 171 }, () => "0");
  cols[0] = String(id);
  cols[1] = name;
  cols[8] = String(f.castMs ?? 0);
  cols[11] = String(f.formula ?? 0);
  cols[12] = String(f.ticks ?? 0);
  cols[14] = String(f.mana ?? 0);
  for (let c = 36; c < 52; c++) cols[c] = "255";
  if (f.wizardLevel) cols[47] = String(f.wizardLevel);
  cols[87] = String(f.cat ?? 0);
  cols[88] = String(f.sub ?? 0);
  return cols.join("^");
}

/** An install whose spell file holds exactly `rows`, with the category names they file under. */
function installWith(rows: string[]): string {
  const logs = install(false);
  const root = path.dirname(logs);
  fs.writeFileSync(path.join(root, "spells_us.txt"), rows.join("\n"));
  fs.writeFileSync(
    path.join(root, "dbstr_us.txt"),
    ["25^5^Direct Damage^0^", "58^5^Magic^0^", "126^5^Utility Detrimental^0^", "81^5^Root^0^", "125^5^Utility Beneficial^0^", "62^5^Melee Guard^0^"].join("\n"),
  );
  return logs;
}

test("a rank the file has no row for is the base spell at that level", () => {
  // `You begin casting Lightning Bolt VI`: the server applies the level, so the file only has the base.
  const spells = createSpellCatalog();
  spells.setLogDir(installWith([row(1, "Lightning Bolt", { mana: 50, castMs: 2200, wizardLevel: 10, cat: 25, sub: 58 })]));
  const vi = spells.find("Lightning Bolt", "VI");
  assert.equal(vi?.mana, 44, "a nuke is 2% cheaper a level");
  assert.equal(vi?.castMs, 1940);
  assert.equal(spells.find("Lightning Bolt")?.mana, 50);
});

test("a ranked debuff's duration ceiling grows with the level — what the buff timers count down", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(installWith([row(2, "Root", { mana: 20, castMs: 2000, wizardLevel: 4, cat: 126, sub: 81, formula: 3, ticks: 8 })]));
  assert.equal(spells.find("Root")?.maxDurationSeconds, 48);
  assert.equal(spells.find("Root", "V")?.maxDurationSeconds, 72, "+10% a level for a debuff");
});

test("a stranger that only shares the ranked name is not the spell", () => {
  // `Guard VI` in the real file is a free NPC row; pricing a cast of Guard at rank VI off it made a
  // paid spell read as free.
  const spells = createSpellCatalog();
  spells.setLogDir(
    installWith([
      row(3, "Guard", { mana: 80, castMs: 3000, wizardLevel: 20, cat: 125, sub: 62 }),
      row(4, "Guard VI", { mana: 0, castMs: 0 }),
    ]),
  );
  assert.equal(spells.find("Guard", "VI")?.mana, 61, "Guard at level VI, not the stranger's 0");
});

test("an AA's ranks are rows of their own and stay the answer", () => {
  const spells = createSpellCatalog();
  spells.setLogDir(installWith([row(5, "Harm Touch", { castMs: 0 }), row(6, "Harm Touch III", { castMs: 0, mana: 0 })]));
  assert.equal(spells.find("Harm Touch", "III")?.name, "Harm Touch III");
});
