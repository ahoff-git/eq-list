/**
 * Black-box tests for the wiki page export (`exportAsBuckets` in `electron/wiki/page-store.ts`): a
 * page cached under several names is written as its newest copy under every one of them. Only need
 * re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAppDatabase } from "../sqlite-store";
import { createPageStore, exportAsBuckets, WIKI_PAGE_MIGRATIONS } from "../wiki/page-store";
import type { WikiPage } from "../../src/shared/types";

const visor = (fetchedAt: string, weight: string) =>
  ({
    kind: "item",
    title: "Gilded Mistmoore Visor",
    wikiPath: "/Gilded_Mistmoore_Visor",
    sources: [],
    components: [],
    rewards: [],
    card: { title: "Gilded Mistmoore Visor", lines: ["AC: 7", weight] },
    fetchedAt,
  }) as unknown as WikiPage;

function exported(put: (store: ReturnType<typeof createPageStore>) => void): Map<string, { version: number; page: WikiPage }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-page-export-"));
  const db = openAppDatabase(dir, WIKI_PAGE_MIGRATIONS);
  put(createPageStore(db, path.join(dir, "no-legacy")));
  const out = path.join(dir, "pages");
  exportAsBuckets(db, out);
  db.close();
  const rows = new Map<string, { version: number; page: WikiPage }>();
  for (const file of fs.readdirSync(out))
    for (const line of fs.readFileSync(path.join(out, file), "utf8").split("\n")) {
      const [title, version, json] = line.split("\t");
      if (json) rows.set(title, { version: Number(version), page: JSON.parse(json) as WikiPage });
    }
  return rows;
}

test("an alias pulled after its page carries the newer copy to the page's own name", () => {
  const rows = exported((s) => {
    s.put("Gilded Mistmoore Visor", 25, visor("2026-10-07T11:03:24.988Z", "WT: 2.0 Size: SMALL"));
    s.put("Gilded Mistmoore Visor +5", 27, visor("2026-10-21T03:19:55.233Z", "Size: SMALL WT: 2.0"));
  });
  for (const name of ["Gilded Mistmoore Visor", "Gilded Mistmoore Visor +5"]) {
    assert.equal(rows.get(name)?.version, 27, name);
    assert.deepEqual(rows.get(name)?.page.card?.lines, ["AC: 7", "Size: SMALL WT: 2.0"], name);
  }
});

test("a page pulled after its alias carries the newer copy to the alias, and the same pull goes to the newer parser", () => {
  const rows = exported((s) => {
    s.put("Gilded Mistmoore Visor", 25, visor("2026-10-21T00:00:00.000Z", "new"));
    s.put("Gilded Mistmoore Visor +5", 27, visor("2026-10-01T00:00:00.000Z", "old"));
    s.put("Cloth Cape", 25, { ...visor("2026-10-05T00:00:00.000Z", "v25"), title: "Cloth Cape" });
    s.put("Cloth Cape +2", 27, { ...visor("2026-10-05T00:00:00.000Z", "v27"), title: "Cloth Cape" });
  });
  assert.deepEqual(rows.get("Gilded Mistmoore Visor +5")?.page.card?.lines, ["AC: 7", "new"]);
  assert.equal(rows.get("Gilded Mistmoore Visor +5")?.version, 25);
  assert.deepEqual(rows.get("Cloth Cape")?.page.card?.lines, ["AC: 7", "v27"]);
  assert.equal(rows.size, 4, "every name is still written");
});
