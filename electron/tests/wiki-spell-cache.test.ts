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
import { createWikiClient } from "../wiki";
import { createPageStore } from "../wiki/page-store";
import type { WikiPage } from "../../src/shared/types";
import type { ItemRow } from "../../src/shared/item-search";
import type { SpellRow } from "../../src/shared/spell-search";

const DAY = 24 * 60 * 60 * 1000;
const TTL_DAYS = 14;

/** Writes straight into the page store, bypassing the client's own fetch/write path — same trick
 *  `wiki-cache-share.test.ts` uses to seed a cache without a network. */
function seed(dir: string, page: Record<string, unknown> & { kind: string; title: string }) {
  const store = createPageStore(dir);
  const full = { sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString(), ...page };
  // A version well above every kind's floor — this test isn't about version gating.
  store.put(page.title, 99, full as unknown as WikiPage);
}

async function cleanup(dir: string): Promise<void> {
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
