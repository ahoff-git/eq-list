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

test("a rank gets the ranked row, not the base spell's cost", () => {
  // The whole point: a rank VI nuke costs 110, not the base spell's 20. `spellName()` strips the
  // rank so cast and damage lines agree, and `spellRank()` is what puts it back for this lookup.
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
