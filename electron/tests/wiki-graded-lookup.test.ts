/**
 * A graded name reads its base page, and nothing is ever cached under the grade (ADR 0057): the grade
 * is arithmetic applied where the page is shown (`pageForName`), so a second copy could only drift.
 * Covers `getPage` in `electron/wiki/index.ts` and the purge migration in `electron/wiki/page-store.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWikiClient, closeOwnedDatabases } from "../wiki";
import { createPageStore, WIKI_PAGE_MIGRATIONS } from "../wiki/page-store";
import { openAppDatabase } from "../sqlite-store";
import type { WikiPage } from "../../src/shared/types";

const cape = (fetchedAt: string) =>
  ({
    kind: "item",
    title: "Cloth Cape",
    wikiPath: "/Cloth_Cape",
    sources: [],
    components: [],
    rewards: [],
    card: { title: "Cloth Cape", lines: ["AC: 2"] },
    fetchedAt,
  }) as unknown as WikiPage;

async function removeDir(dir: string): Promise<void> {
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

test("a graded name is answered from the base page, with no fetch for the graded one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-graded-"));
  const seedDb = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
  createPageStore(seedDb, dir).put("Cloth Cape", 99, cape(new Date().toISOString()));
  seedDb.close();
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = ((url: string) => {
    asked.push(String(url));
    return Promise.reject(new Error("network disabled for this test"));
  }) as typeof fetch;
  try {
    const wiki = createWikiClient(dir, { ttlMs: () => 14 * 24 * 60 * 60 * 1000 });
    const page = await wiki.getPage("Cloth Cape +2");
    assert.equal(page?.title, "Cloth Cape");
    assert.deepEqual(page?.card?.lines, ["AC: 2"], "the +0 card — the caller levels it");
    assert.deepEqual(asked.filter((u) => /Cloth_Cape|Cloth%20Cape/.test(u)), [], "the wiki was never asked for either name");
  } finally {
    globalThis.fetch = realFetch;
    await removeDir(dir);
  }
});

test("an install's copies held under a graded name are dropped; the base and other aliases stay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-graded-purge-"));
  try {
    // The store as it stood before the purge: the base, two graded copies and a redirect alias.
    const before = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS.filter((m) => m.version < 11));
    const old = createPageStore(before, dir);
    old.put("Cloth Cape", 27, cape("2026-10-07T00:00:00.000Z"));
    old.put("Cloth Cape +2", 27, cape("2026-10-02T00:00:00.000Z"));
    old.put("Cloth Cape +10", 27, cape("2026-10-20T00:00:00.000Z"));
    old.put("Cloth Cloak", 27, cape("2026-10-07T00:00:00.000Z"));
    before.close();

    const after = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
    const titles = (after.prepare(`SELECT title FROM wiki_pages ORDER BY title`).all() as { title: string }[]).map((r) => r.title);
    after.close();
    assert.deepEqual(titles, ["Cloth Cape", "Cloth Cloak"]);
  } finally {
    await removeDir(dir);
  }
});
