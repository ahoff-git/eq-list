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

test("another store can run a transaction while a walk is yielded", async () => {
  // The cache shares one connection with the ledgers (ADR 0232). The faction recheck opens a transaction at startup,
  // at the very moment the catalogue warm is walking — and a walk that holds its row iterator open across its
  // yield made SQLite refuse: "This database connection is busy executing a query". The recheck was then skipped
  // for that launch, and a fresh-launch error went to the log.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-pagewalk-"));
  const { db, store } = seededStore(dir);
  try {
    let seen = 0;
    let ran = 0;
    let other: Promise<void> = Promise.resolve();
    await store.each(() => {
      // Scheduled early in the first chunk, so it is queued ahead of the walk's own yield and runs inside it.
      if (++seen === 10) {
        other = new Promise<void>((resolve, reject) =>
          setImmediate(() => {
            try {
              db.transaction(() => void ran++)();
              resolve();
            } catch (err) {
              reject(err);
            }
          }),
        );
      }
    });
    await other;
    assert.equal(ran, 1, "the other store's transaction ran");
    assert.equal(seen, PAGES, "and the walk still saw every page");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a page added behind a walk's position is not visited twice, and none is skipped", async () => {
  await withStore(async (store) => {
    const titles: string[] = [];
    await store.each((entry) => {
      titles.push(entry.page.title);
      // A re-put of a page already visited replaces its row; it must not make the walk revisit anything.
      if (titles.length === 50) store.put(titles[0], 99, entry.page);
    });
    assert.equal(titles.length, PAGES);
    assert.equal(new Set(titles).size, PAGES, "no page twice");
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
