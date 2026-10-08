/**
 * `scripts/mcp-server.mjs`'s tools, driven through the real MCP protocol — a spawned process, a real
 * `--data-dir` temp profile, and the SDK's own `Client`, because the thing worth pinning here is the
 * *wiring*: does a tool's zod schema actually accept what its description promises, does its handler
 * actually call the right `item-search.ts`/`spell-search.ts` function with the right shape, does
 * `--data-dir` actually reach a fresh profile rather than this machine's own. None of that is reachable
 * by unit-testing `src/shared/mcp-catalogue.ts` alone (see `mcp-catalogue.test.ts` for that half) — a
 * schema bug (this suite caught one: `z.record` with an enum key demanded *every* key be present,
 * where `z.partialRecord` was needed) only shows up by actually sending a call through validation.
 *
 * Network is cut for the whole spawned process (`--import` a tiny preload that rejects every `fetch`),
 * the same rule every other wiki test follows — a mirrored index and a page accepted into the cache
 * ahead of time stand in for whatever the live wiki would have answered. `quests_by_zone` has no such
 * cache to seed (`zoneQuestsCache` is in-memory only), so its own test pins the *offline* contract
 * instead: an unreachable wiki is an empty list, never a hang or a throw.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openAppDatabase } from "../sqlite-store";
import { createWikiClient, closeOwnedDatabases } from "../wiki";
import { WIKI_PAGE_MIGRATIONS } from "../wiki/page-store";
import type { SharedItemPage, SharedSpellPage } from "../../src/shared/peers/peer-share";

const REPO_ROOT = path.join(__dirname, "../../..");
const SERVER = path.join(REPO_ROOT, "scripts/mcp-server.mjs");
const DAY = 24 * 60 * 60 * 1000;

function itemPage(title: string, opts: { zone?: string; lines?: string[]; outOfEra?: boolean } = {}): SharedItemPage {
  return {
    kind: "item",
    title,
    wikiPath: `/${title.replace(/ /g, "_")}`,
    sources: opts.zone ? [{ kind: "drop", where: "A Test Mob", detail: opts.zone }] : [],
    components: [],
    rewards: [],
    card: { title, lines: opts.lines ?? [] },
    fetchedAt: new Date().toISOString(),
    ...(opts.outOfEra !== undefined ? { outOfEra: opts.outOfEra } : {}),
  };
}

const spellPage = (title: string, classLine: string): SharedSpellPage => ({
  title,
  wikiPath: `/${title.replace(/ /g, "_")}`,
  card: { title, lines: [`Classes: ${classLine}`] },
  fetchedAt: new Date().toISOString(),
});

function writeIndex(cacheDir: string, name: string, titles: string[]): void {
  fs.writeFileSync(path.join(cacheDir, name), JSON.stringify({ fetchedAt: new Date().toISOString(), titles }), "utf8");
}

/**
 * One temp profile, seeded the same shape `main.ts`/`scripts/mcp-server.mjs` expect
 * (`<dir>/eqlist.db` + `<dir>/wiki-cache/`), with: three items (one zoned and carrying stats, one in a
 * different zone, one sourceless — the `(none)` facet case), one flagged out-of-era in the first
 * item's own zone (so a zone filter and an era filter can be proven together), two spells (different
 * classes/levels), one faction, and the three mirrored indexes pre-warmed so `search`/`searchZones`/
 * `searchFactions` resolve locally with no network. `quests_by_zone` has nothing to seed — see the
 * module note.
 */
async function rig() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-mcp-server-test-"));
  const cacheDir = path.join(userDataDir, "wiki-cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  // Seeded *before* the client exists: construction itself warms every index
  // (`titleIndex.ensureFresh()` etc.) and, finding no file yet, would fire a real background refetch
  // against the live wiki — a race that can overwrite these fixtures moments later with whatever
  // `Category:Zones` actually holds. Written first, each index's freshness check finds a file already
  // on disk and never calls out at all. Belt-and-braces: fetch is cut for this process too (the same
  // rule every other wiki test follows), in case anything else here ever reaches for it.
  writeIndex(cacheDir, "title-index.json", ["Test Velium Dirk", "Test Plain Sword", "Test Unsourced Ring", "Test Old Era Cloak"]);
  writeIndex(cacheDir, "zone-index.json", ["Test Zone Alpha", "Test Zone Beta"]);
  writeIndex(cacheDir, "faction-index.json", ["Test Faction Rats"]);

  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network disabled for this test"))) as typeof fetch;
  const db = openAppDatabase(userDataDir, WIKI_PAGE_MIGRATIONS);
  const wiki = createWikiClient(cacheDir, { db, ttlMs: () => 999 * DAY });
  try {
    wiki.items.accept([
      itemPage("Test Velium Dirk", { zone: "Test Zone Alpha", lines: ["INT: 15", "AC: 10"] }),
      itemPage("Test Plain Sword", { zone: "Test Zone Beta", lines: ["AC: 5"] }),
      itemPage("Test Unsourced Ring", {}),
      itemPage("Test Old Era Cloak", { zone: "Test Zone Alpha", outOfEra: true }),
    ]);
    wiki.spells.accept([spellPage("Test Firebolt", "Wizard - Level 10"), spellPage("Test Heal", "Cleric - Level 5")]);
    wiki.factions.accept([
      { kind: "faction", title: "Test Faction Rats", wikiPath: "/Test_Faction_Rats", sources: [], components: [], rewards: [], fetchedAt: new Date().toISOString() },
    ]);
    // Built once here so the spawned process's first real call isn't also the first-ever catalogue
    // build — this suite is about tool wiring, not catalogue-construction cost (that's `wiki-cache-share.test.ts`'s).
    await wiki.catalogueJson();
    await wiki.spellCatalogueJson();
  } finally {
    globalThis.fetch = realFetch;
  }
  db.close();
  closeOwnedDatabases(cacheDir); // a no-op here (an explicit `db` was given, so nothing self-opened) — harmless either way.

  // Disables `fetch` for the *spawned* process (a preload can't reach across the process boundary any
  // other way) — the in-process `globalThis.fetch = …` stub every other wiki test uses doesn't apply
  // to a child process at all.
  const noNetworkFile = path.join(userDataDir, "no-network-preload.mjs");
  fs.writeFileSync(noNetworkFile, 'globalThis.fetch = () => Promise.reject(new Error("network disabled for this test"));\n', "utf8");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", pathToFileURL(noNetworkFile).href, SERVER, "--data-dir", userDataDir],
    cwd: REPO_ROOT,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
  const client = new Client({ name: "mcp-server-test", version: "0.0.1" });
  await client.connect(transport);

  return {
    client,
    stderrSoFar: () => stderr,
    async cleanup() {
      await client.close().catch(() => {});
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/** `callTool` plus the one unwrap every test needs — parsed JSON, or the raw error text when flagged. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { type: string; text: string }[])[0].text;
  if (r.isError) throw new Error(text);
  return JSON.parse(text);
}

test("lists all nine tools", async () => {
  const { client, cleanup } = await rig();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      [
        "get_wiki_page",
        "item_facet_options",
        "list_item_catalogue",
        "list_spell_catalogue",
        "list_spell_classes",
        "quests_by_zone",
        "search_factions",
        "search_wiki",
        "search_zones",
      ],
    );
  } finally {
    await cleanup();
  }
});

test("search_wiki finds a seeded title via the mirrored index", async () => {
  const { client, cleanup } = await rig();
  try {
    const hits = (await call(client, "search_wiki", { term: "Test Velium Dirk" })) as { title: string }[];
    assert.ok(hits.some((h) => h.title === "Test Velium Dirk"));
  } finally {
    await cleanup();
  }
});

test("search_zones finds a seeded zone", async () => {
  const { client, cleanup } = await rig();
  try {
    // The exact seeded title, not a partial — `fuzzy.ts`'s own scoring is somebody else's tested
    // black box; this is only proving the tool reaches the mirrored zone index at all.
    const hits = (await call(client, "search_zones", { term: "Test Zone Alpha" })) as { title: string }[];
    assert.ok(hits.some((h) => h.title === "Test Zone Alpha"));
  } finally {
    await cleanup();
  }
});

test("search_factions finds a seeded faction", async () => {
  const { client, cleanup } = await rig();
  try {
    const hits = (await call(client, "search_factions", { term: "Test Faction Rats" })) as { title: string }[];
    assert.ok(hits.some((h) => h.title === "Test Faction Rats"));
  } finally {
    await cleanup();
  }
});

test("get_wiki_page returns the cached page, no network reached", async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "get_wiki_page", { title: "Test Velium Dirk" })) as { kind: string; card?: { lines: string[] } };
    assert.equal(page.kind, "item");
    assert.deepEqual(page.card?.lines, ["INT: 15", "AC: 10"]);
  } finally {
    await cleanup();
  }
});

test("quests_by_zone degrades to an empty list rather than hanging or throwing offline", async () => {
  const { client, cleanup } = await rig();
  try {
    const quests = await call(client, "quests_by_zone", { zone: "Test Zone Alpha" });
    assert.deepEqual(quests, []);
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue filters by zone", async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { zone: ["Test Zone Alpha"] })) as { total: number; items: { item: { title: string } }[] };
    assert.equal(page.total, 1, "the out-of-era item in the same zone is excluded by the default hideOutOfEra");
    assert.equal(page.items[0].item.title, "Test Velium Dirk");
  } finally {
    await cleanup();
  }
});

test('list_item_catalogue\'s "(none)" sentinel matches the sourceless item', async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { zone: ["(none)"] })) as { total: number; items: { item: { title: string } }[] };
    assert.equal(page.total, 1);
    assert.equal(page.items[0].item.title, "Test Unsourced Ring");
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue's stat floor (mins) excludes a card silent about the stat", async () => {
  const { client, cleanup } = await rig();
  try {
    const hit = (await call(client, "list_item_catalogue", { mins: { int: 10 } })) as { total: number };
    assert.equal(hit.total, 1, "only the dirk states INT at all");
    const none = (await call(client, "list_item_catalogue", { mins: { int: 999 } })) as { total: number };
    assert.equal(none.total, 0);
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue's mins/weights accept a sparse stat map — not every StatKey required", async () => {
  // Regression: `z.record(z.enum(STAT_KEYS), z.number())` demands *every* enum key be present; only
  // `z.partialRecord` makes a one-key object valid. Caught once by hand, pinned here so it can't return.
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { mins: { int: 1 }, weights: { ac: 2 } })) as { total: number };
    assert.ok(page.total >= 0, "the call must validate and resolve at all, not reject on the 20 stats left unmentioned");
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue rejects an invalid source value instead of silently matching nothing", async () => {
  const { client, cleanup } = await rig();
  try {
    await assert.rejects(call(client, "list_item_catalogue", { source: ["bogus"] }), /drop.*quest.*recipe|Invalid option/i);
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue sorts by a stat, descending, undefined-for-that-stat rows last", async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { sortBy: "int", sortDesc: true, hideOutOfEra: false })) as {
      items: { item: { title: string } }[];
    };
    assert.equal(page.items[0].item.title, "Test Velium Dirk", "the one row with an INT value sorts first");
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue pages: total reflects the filtered set, not the page", async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { hideOutOfEra: false, limit: 1, offset: 1 })) as { total: number; items: unknown[] };
    assert.equal(page.total, 4, "all four seeded items, era toggle off");
    assert.equal(page.items.length, 1);
  } finally {
    await cleanup();
  }
});

test("list_item_catalogue's hideOutOfEra defaults on, matching the Items tab's default view", async () => {
  const { client, cleanup } = await rig();
  try {
    const withDefault = (await call(client, "list_item_catalogue", { zone: ["Test Zone Alpha"] })) as { total: number };
    const shown = (await call(client, "list_item_catalogue", { zone: ["Test Zone Alpha"], hideOutOfEra: false })) as { total: number };
    assert.equal(withDefault.total, 1);
    assert.equal(shown.total, 2, "the out-of-era item in the same zone reappears once asked for");
  } finally {
    await cleanup();
  }
});

test("item_facet_options lists exactly the seeded zones", async () => {
  const { client, cleanup } = await rig();
  try {
    const zones = (await call(client, "item_facet_options", { facet: "zone" })) as string[];
    assert.deepEqual([...zones].sort(), ["Test Zone Alpha", "Test Zone Beta"]);
  } finally {
    await cleanup();
  }
});

test("list_spell_catalogue filters by class", async () => {
  const { client, cleanup } = await rig();
  try {
    const wiz = (await call(client, "list_spell_catalogue", { class: ["Wizard"] })) as { total: number; items: { spell: { title: string } }[] };
    assert.equal(wiz.total, 1);
    assert.equal(wiz.items[0].spell.title, "Test Firebolt");
    const none = (await call(client, "list_spell_catalogue", { class: ["Druid"] })) as { total: number };
    assert.equal(none.total, 0);
  } finally {
    await cleanup();
  }
});

test("list_spell_catalogue sorts by level ascending", async () => {
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_spell_catalogue", { sortBy: "level" })) as { items: { spell: { title: string } }[] };
    assert.deepEqual(
      page.items.map((i) => i.spell.title),
      ["Test Heal", "Test Firebolt"],
    );
  } finally {
    await cleanup();
  }
});

test("list_spell_classes lists exactly the seeded classes", async () => {
  const { client, cleanup } = await rig();
  try {
    const classes = (await call(client, "list_spell_classes")) as string[];
    assert.deepEqual([...classes].sort(), ["Cleric", "Wizard"]);
  } finally {
    await cleanup();
  }
});

test("--data-dir reaches the given profile, not this machine's own %APPDATA%", async () => {
  // Every test above already proves this by construction (each gets back only its own temp fixture's
  // data), but this one states it as the thing being checked rather than as a side effect.
  const { client, cleanup } = await rig();
  try {
    const page = (await call(client, "list_item_catalogue", { hideOutOfEra: false })) as { total: number };
    assert.equal(page.total, 4, "exactly the fixture's own four items — not whatever this machine's real cache holds");
  } finally {
    await cleanup();
  }
});
