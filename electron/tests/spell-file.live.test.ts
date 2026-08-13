/**
 * Live checks of the spell-file reader against a **real** EverQuest Legends install.
 *
 * These skip unless one is configured — see `game-data.ts` for how, and for why nothing about
 * your machine ends up in the repo. `spell-file.test.ts` next door is the everyday suite and runs
 * against a synthetic fixture; this is the one that can catch the fixture being *wrong about the
 * world*, which is the failure a synthetic fixture is structurally blind to.
 *
 * Everything asserted here is **Daybreak's game data** — spell names, mana costs, class levels —
 * which is identical for every player and safe to write down. Nothing asserts, prints or names the
 * install path, a character, or anything out of a log.
 *
 * The values below were read off a real install on 2026-08-13 and cross-checked against classic
 * EverQuest knowledge, so a failure means one of two things: the game changed a spell (fine, and
 * worth knowing), or **a column moved and we are now reading the wrong field** — which is the
 * whole point, because that failure is otherwise a confidently wrong number on screen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gameFile, liveOnly } from "./game-data";
import { isObtainable, parseSpellFile, parseSpellLine } from "../../src/shared/spell-file";

/** Parsed once — the file is ~38 MB, and every test below wants the same map. */
let cached: Map<string, ReturnType<typeof parseSpellLine>> | null = null;
function spells() {
  if (!cached) cached = parseSpellFile(fs.readFileSync(gameFile("spells_us.txt"), "utf8")) as never;
  return cached as unknown as ReturnType<typeof parseSpellFile>;
}

test("the real file parses into a plausible catalog", liveOnly(), () => {
  const all = spells();
  // Tens of thousands. A few hundred would mean we're mis-splitting rows; zero, mis-finding them.
  assert.ok(all.size > 50_000, `expected a large catalog, got ${all.size}`);
  const obtainable = [...all.values()].filter(isObtainable).length;
  assert.ok(obtainable > 5_000, `expected thousands obtainable at level 50, got ${obtainable}`);
  // The file ships far more than the server can grant — if *everything* looks obtainable, the
  // class-level columns aren't where we think they are.
  assert.ok(obtainable < all.size / 2, "class levels look wrong: nearly everything reads castable");
});

test("known spells have the costs and levels they have always had", liveOnly(), () => {
  const all = spells();
  // Classic values, stable across every version of EverQuest these spells have existed in.
  const minorHealing = all.get("minor healing");
  assert.equal(minorHealing?.mana, 10);
  assert.equal(minorHealing?.beneficial, true);
  assert.equal(minorHealing?.levels.Cleric, 1);

  const sow = all.get("spirit of wolf");
  assert.equal(sow?.mana, 40);
  assert.equal(sow?.levels.Druid, 10);
  assert.equal(sow?.levels.Shaman, 9);

  const burst = all.get("burst of flame");
  assert.equal(burst?.mana, 4);
  assert.equal(burst?.beneficial, false, "a nuke must not read as beneficial");
});

test("a free spell really is free, not merely unread", liveOnly(), () => {
  // The distinction the whole API rests on: 0 is an answer, absent is not knowing.
  const chant = spells().get("chant of battle");
  assert.equal(chant?.mana, 0);
  assert.equal(chant?.levels.Bard, 1);
});

test("ranks cost their own mana, and the spread is wide enough to matter", liveOnly(), () => {
  // Why we read the ranked row instead of scaling the base by a percentage: Burnout more than
  // quadruples across three ranks. A rule of thumb would be wrong by 4x.
  const all = spells();
  const base = all.get("burnout")?.mana;
  const two = all.get("burnout ii")?.mana;
  const three = all.get("burnout iii")?.mana;
  assert.ok(base && two && three, "all three ranks of Burnout should be present");
  assert.ok(two > base!, "rank II should cost more than the base");
  assert.ok(three > two!, "rank III should cost more than rank II");
  assert.ok(three! >= base! * 3, `expected a wide spread, got ${base} → ${two} → ${three}`);
});

test("a shared name still resolves to a spell a player can hold", liveOnly(), () => {
  // Thousands of names carry more than one row (NPC and out-of-era versions). Every name we can
  // look up should either be castable by somebody, or be one of the genuinely unreachable ones —
  // what must never happen is a *castable* spell losing its name to an unreachable row.
  const all = spells();
  for (const name of ["minor healing", "spirit of wolf", "burst of flame", "chant of battle"]) {
    assert.ok(isObtainable(all.get(name)!), `${name} resolved to a row nobody can cast`);
  }
});
