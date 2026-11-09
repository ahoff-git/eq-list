/**
 * Black-box test for walking the whole page cache (`electron/wiki/page-store.ts`'s `each`): two walks that overlap
 * must both finish. `each` yields to the event loop every few hundred pages so main is never blocked for long — and
 * while it is yielded its row iterator is still open on one prepared statement, so a second walk starting then
 * (the Items tab mounting while the Spells tab, the share hub or the shard index asks for the same catalogue) tried to
 * open a second iterator on it, and SQLite refused: "This statement is busy executing a query". The Spells
 * catalogue then failed to load, at startup, on a real launch. Real database in a temp directory; no Electron.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAppDatabase } from "../sqlite-store";
import { createPageStore, WIKI_PAGE_MIGRATIONS } from "../wiki/page-store";
import type { WikiPage } from "../../src/shared/types";

const PAGES = 450; // more than one yield's worth, so a walk really is suspended part-way

function seededStore(dir: string) {
  const db = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
  const store = createPageStore(db, dir);
  for (let i = 0; i < PAGES; i++) {
    const page = { kind: "item", title: `Item ${i}`, sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString() };
    store.put(page.title, 99, page as unknown as WikiPage);
  }
  return { db, store };
}

async function withStore(run: (store: ReturnType<typeof seededStore>["store"]) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-pagewalk-"));
  const { db, store } = seededStore(dir);
  try {
    await run(store);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a walk visits every page once", async () => {
  await withStore(async (store) => {
    let seen = 0;
    await store.each(() => void seen++);
    assert.equal(seen, PAGES);
  });
});

test("two walks started together both finish, each seeing every page", async () => {
  await withStore(async (store) => {
    let a = 0;
    let b = 0;
    await Promise.all([store.each(() => void a++), store.each(() => void b++)]);
    assert.equal(a, PAGES, "the first walk");
    assert.equal(b, PAGES, "the second, which used to throw 'This statement is busy executing a query'");
  });
});

test("a walk that throws doesn't wedge the ones behind it", async () => {
  await withStore(async (store) => {
    const failing = store.each(() => {
      throw new Error("a visitor that fails");
    });
    let after = 0;
    const next = store.each(() => void after++);
    await assert.rejects(failing, /a visitor that fails/);
    await next;
    assert.equal(after, PAGES, "the queue moved on");
  });
});

test("a walk started after another has finished starts fresh", async () => {
  await withStore(async (store) => {
    await store.each(() => {});
    let seen = 0;
    await store.each(() => void seen++);
    assert.equal(seen, PAGES);
  });
});
