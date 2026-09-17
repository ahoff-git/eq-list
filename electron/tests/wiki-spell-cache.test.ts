/**
 * The spell catalogue's cache-and-walk behaviour ([ADR 0195](../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md)).
 *
 * `spellCatalogueJson` shares `buildCatalogue`'s single page-store walk with the item catalogue
 * rather than paying for a second one — so the thing worth pinning is that the walk still sorts
 * pages into the right pile (a spell never becomes an item row or vice versa), and that asking twice
 * at once doesn't trigger the walk twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { createWikiClient, closeOwnedDatabases } from "../wiki";
import { createPageStore, WIKI_PAGE_MIGRATIONS, type PageStore } from "../wiki/page-store";
import { openAppDatabase } from "../sqlite-store";
import type { WikiPage } from "../../src/shared/types";
import type { ItemRow } from "../../src/shared/item-search";
import type { SpellRow } from "../../src/shared/spell-search";

const DAY = 24 * 60 * 60 * 1000;
const TTL_DAYS = 14;

const seeders = new Map<string, PageStore>();
/** The database each entry in `seeders` opened for itself — closed by `cleanup` before its rmdir. */
const seededDbs = new Map<string, Database>();

/**
 * Writes straight into the page store, bypassing the client's own fetch/write path — same trick
 * `wiki-cache-share.test.ts` uses to seed a cache without a network.
 *
 * Opens the same `eqlist.db` a later `createWikiClient(dir, ...)` call falls back to when given no
 * explicit `db` (see `createWikiClient`'s own doc), so the two see the same rows — and, one store per
 * directory, so seeding twice doesn't open a second connection to the same file.
 */
function seed(dir: string, page: Record<string, unknown> & { kind: string; title: string }) {
  let store = seeders.get(dir);
  if (!store) {
    const db = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
    seededDbs.set(dir, db);
    store = createPageStore(db, dir);
    seeders.set(dir, store);
  }
  const full = { sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), ...page };
  // A version well above every kind's floor — this test isn't about version gating.
  store.put(page.title, 99, full as unknown as WikiPage);
}

async function cleanup(dir: string): Promise<void> {
  // Release whatever database `seed()` or a self-opened `createWikiClient` holds open for `dir` —
  // Windows refuses to remove a directory containing a file some process still has open.
  seededDbs.get(dir)?.close();
  seededDbs.delete(dir);
  seeders.delete(dir);
  closeOwnedDatabases(dir);
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (attempt >= 20) throw e;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

test("the shared walk sorts a spell page into the spell catalogue and an item page into the item one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-spellcat-"));
  try {
    seed(dir, {
      kind: "spell",
      title: "Burst of Fire",
      wikiPath: "/Burst_of_Fire",
      card: { title: "Burst of Fire", lines: ["Decrease Hitpoints by 14", "Mana: 7", "Classes: Druid - Level 3"] },
    });
    seed(dir, { kind: "item", title: "Cloth Cape", wikiPath: "/Cloth_Cape", card: { title: "Cloth Cape", lines: ["AC: 2"] } });

    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const spells = JSON.parse(await wiki.spellCatalogueJson()) as SpellRow[];
    assert.deepEqual(spells.map((s) => s.spell.title), ["Burst of Fire"]);
    assert.equal(spells[0].stats.mana, 7);
    assert.equal(spells[0].stats.damage, 14);

    const items = JSON.parse(await wiki.catalogueJson()) as ItemRow[];
    assert.deepEqual(items.map((r) => r.item.title), ["Cloth Cape"], "the spell never became an item row");
  } finally {
    await cleanup(dir);
  }
});

test("concurrent callers share one walk", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-spellcat-concurrent-"));
  try {
    seed(dir, { kind: "spell", title: "Minor Healing", wikiPath: "/Minor_Healing", card: { title: "Minor Healing", lines: ["Mana: 10"] } });
    const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const [a, b] = await Promise.all([wiki.spellCatalogueJson(), wiki.spellCatalogueJson()]);
    assert.equal(a, b, "both callers got the one build's own JSON, not two different builds");
  } finally {
    await cleanup(dir);
  }
});

test("a fresh client walks the store fresh, rather than inheriting another client's catalogue", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-spellcat-fresh-"));
  try {
    const first = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    assert.deepEqual(JSON.parse(await first.spellCatalogueJson()), []);

    seed(dir, { kind: "spell", title: "Spirit of Wolf", wikiPath: "/Spirit_of_Wolf", card: { title: "Spirit of Wolf", lines: ["Mana: 40"] } });

    // `first` cached "nothing" and has no way to know a page landed underneath it — a fresh client,
    // the way a relaunch is, is what has to see the new page.
    const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const spells = JSON.parse(await next.spellCatalogueJson()) as SpellRow[];
    assert.deepEqual(spells.map((s) => s.spell.title), ["Spirit of Wolf"]);
  } finally {
    await cleanup(dir);
  }
});
