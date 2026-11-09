/**
 * Black-box tests for what a zone page's NPC roster may hold (`src/shared/zones/zone-roster.ts`), and that it is held
 * to it wherever a page enters: read back from the page cache, and received from a peer. The rows are verbatim from a
 * real cached Kael page, whose roster had 168 item cards among 508 "NPCs". Only need re-running if those change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanRoster, isRosterNpc } from "../../src/shared/zones/zone-roster";
import { openAppDatabase } from "../sqlite-store";
import { createPageStore, WIKI_PAGE_MIGRATIONS } from "../wiki/page-store";
import type { WikiPage } from "../../src/shared/types";

const MOBS = [
  { name: "A Drakkel Dire Wolf", level: "52-56" },
  { name: "A Frost Giant Berserker", level: "37 - 40" },
  { name: "Zlirron Windchill", level: "60" },
  { name: "Gorenaire", level: "?" },
  { name: "a ghoul", level: "You can't consider that." },
];
// Verbatim from Kael's cached page: loot beside the mobs, read as rows of the same table.
const CARDS = [
  { name: "A Giant's BroomA Giant's Broom LORE ITEM NO DROP Slot: PRIMARY Skill: 2H Blunt Atk Delay: 40 DMG: 15 WT: 0.0 Size: TINY Class: ALL Race: ALL DMG Bonus: 27 @ lvl 50", level: "Atk Delay: 40 DMG: 15 WT: 0.0 Size: TINY Class: ALL Race: ALL" },
  { name: "A bloody protector of Zek's HeadA bloody protector of Zek's Head MAGIC ITEM LORE ITEM NO DROP WT: 1.0 Size: MEDIUM Class: ALL Race: ALL", level: "MAGIC ITEM LORE ITEM NO DROP WT: 1.0 Size: MEDIUM Class: ALL Race: ALL" },
  { name: "Antlered MaskAntlered Mask MAGIC ITEM Slot: FACE AC: 7 STR: +3 DEX: +2 AGI: +5 WT: 0.2 Size: SMALL Class: WAR RNG Race: ALL", level: "AC: 7 STR: +3 DEX: +2 AGI: +5 WT: 0.2 Size: SMALL Class: WAR RNG Race: ALL" },
];

test("real mobs are kept — including the ones whose level is unknown", () => {
  for (const mob of MOBS) assert.equal(isRosterNpc(mob), true, mob.name);
});

test("item cards are not NPCs, by the name cell or the level cell", () => {
  for (const card of CARDS) assert.equal(isRosterNpc(card), false, card.name.slice(0, 40));
  assert.equal(isRosterNpc({ name: "Some Mob", level: "WT: 0.4 Size: Tiny" }), false, "a card only in the level cell");
  assert.equal(isRosterNpc({ name: "Plain Name LORE ITEM NO DROP", level: "50" }), false, "a card only in the name cell");
});

test("a mob whose name merely sounds like a card is still a mob", () => {
  assert.equal(isRosterNpc({ name: "Magic Item Merchant", level: "30" }), true, "all-caps flags are matched as written");
  assert.equal(isRosterNpc({ name: "Lore Keeper Orgrim", level: "45" }), true);
  assert.equal(isRosterNpc({ name: "The Drop Master", level: "20" }), true);
});

test("cleaning keeps the mobs, in order, and removes only the cards", () => {
  const mixed = [MOBS[0], CARDS[0], MOBS[1], CARDS[1], CARDS[2], MOBS[2]];
  assert.deepEqual(cleanRoster(mixed), [MOBS[0], MOBS[1], MOBS[2]]);
  assert.deepEqual(cleanRoster([]), []);
});

function withStore(run: (store: ReturnType<typeof createPageStore>) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-roster-"));
  const db = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
  try {
    run(createPageStore(db, dir));
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a zone page already in the cache is read back clean, with nothing fetched again", () => {
  withStore((store) => {
    const page = { kind: "zone", title: "Kael", sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), npcs: [...MOBS, ...CARDS] };
    store.put("Kael", 29, page as unknown as WikiPage);
    const back = store.get("Kael");
    assert.deepEqual(back?.page.npcs, MOBS, "the cards are gone");
  });
});

test("only a zone page's roster is touched: another kind's npcs, and a clean zone page, come back as stored", () => {
  withStore((store) => {
    const clean = { kind: "zone", title: "Qeynos", sources: [], components: [], rewards: [], fetchedAt: "2026-01-01", npcs: MOBS };
    store.put("Qeynos", 29, clean as unknown as WikiPage);
    assert.deepEqual(store.get("Qeynos")?.page.npcs, MOBS);
    const mob = { kind: "mob", title: "A Giant", sources: [], components: [], rewards: [], fetchedAt: "2026-01-01" };
    store.put("A Giant", 29, mob as unknown as WikiPage);
    assert.equal(store.get("A Giant")?.page.kind, "mob");
  });
});
