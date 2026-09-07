/**
 * The spell harvest's cache/shard wiring ([ADR 0196](../../specs/decisions/0196-spells-get-their-own-shard-addressed-mirror.md)).
 *
 * Mirrors `wiki-cache-share.test.ts`'s item-side coverage of `wiki.items.accept/status/shard/
 * shardTitles/learnTitles`, over `wiki.spells.*` instead — a roster seeded directly into
 * `spell-harvest.json`, the same trick that file uses for `harvest.json`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWikiClient } from "../wiki";
import { shardOf } from "../../src/shared/item-shards";
import type { SharedSpellPage } from "../../src/shared/peer-share";
import type { SpellRow } from "../../src/shared/spell-search";

const DAY = 24 * 60 * 60 * 1000;
const TTL_DAYS = 14;

function rig(opts: { roster?: string[] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-spellharvest-"));
  if (opts.roster) {
    const at = new Date().toISOString();
    fs.writeFileSync(
      path.join(dir, "spell-harvest.json"),
      JSON.stringify({ roster: opts.roster, listedAt: at, fetched: 0, fromPeers: 0, failed: [], startedAt: at, updatedAt: at }),
      "utf8",
    );
  }
  const wiki = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
  return {
    wiki,
    async mana(title: string) {
      const rows = JSON.parse(await wiki.spellCatalogueJson()) as SpellRow[];
      return rows.find((s) => s.spell.title === title)?.stats.mana;
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString();

const page = (title: string, fetchedAt: string, mana: number): SharedSpellPage => ({
  title,
  wikiPath: `/${title.replace(/ /g, "_")}`,
  card: { title, lines: [`Mana: ${mana}`] },
  fetchedAt,
});

/** Let the async shard-index build (kicked off by `.status()`) settle before reading it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
}

test("a spell page we don't hold is taken, keeping the age the sender pulled it", async () => {
  const r = rig();
  try {
    assert.equal(r.wiki.spells.accept([page("Chant of Battle", daysAgo(10), 0)]), 1);
    assert.equal(await r.mana("Chant of Battle"), 0);
  } finally {
    r.cleanup();
  }
});

test("an older copy than ours is refused", () => {
  const r = rig();
  try {
    r.wiki.spells.accept([page("Chant of Battle", daysAgo(10), 0)]);
    assert.equal(r.wiki.spells.accept([page("Chant of Battle", daysAgo(12), 99)]), 0);
  } finally {
    r.cleanup();
  }
});

test("a newer copy replaces ours", async () => {
  const r = rig();
  try {
    r.wiki.spells.accept([page("Chant of Battle", daysAgo(10), 0)]);
    assert.equal(r.wiki.spells.accept([page("Chant of Battle", daysAgo(1), 5)]), 1);
    assert.equal(await r.mana("Chant of Battle"), 5);
  } finally {
    r.cleanup();
  }
});

test("a copy already past our own TTL is not cached at all", async () => {
  const r = rig();
  try {
    assert.equal(r.wiki.spells.accept([page("Stale Spell", daysAgo(TTL_DAYS + 6), 5)]), 0);
    assert.equal(await r.mana("Stale Spell"), undefined);
  } finally {
    r.cleanup();
  }
});

test("a spell page never becomes an item row", async () => {
  // The shared page-store walk that feeds both catalogues has to keep sorting pages into the right
  // pile — see spell-search.test.ts and wiki-spell-cache.test.ts for the read side; this pins the
  // shard-accept side.
  const r = rig();
  try {
    r.wiki.spells.accept([page("Chant of Battle", daysAgo(1), 0)]);
    const items = JSON.parse(await r.wiki.catalogueJson()) as { item: { title: string } }[];
    assert.deepEqual(items.map((i) => i.item.title), []);
  } finally {
    r.cleanup();
  }
});

test("the shard we'd hand a peer carries only what status/shardTitles agree we hold", async () => {
  const r = rig({ roster: ["Chant of Battle"] });
  try {
    r.wiki.spells.accept([page("Chant of Battle", daysAgo(1), 0)], shardOf("Chant of Battle"));
    r.wiki.spells.status();
    await settle();

    assert.equal(r.wiki.spells.status().pages, 1);

    const shard = shardOf("Chant of Battle");
    assert.deepEqual(r.wiki.spells.shard(shard).map((p) => p.title), ["Chant of Battle"]);
    assert.deepEqual(r.wiki.spells.shardTitles(shard), ["Chant of Battle"]);
  } finally {
    r.cleanup();
  }
});

test("learning a peer's titles grows the roster and re-checks the shard it lands in", async () => {
  const r = rig({ roster: ["Chant of Battle"] });
  try {
    r.wiki.spells.status();
    await settle();

    const learned = r.wiki.spells.learnTitles(["Minor Healing"]);
    assert.equal(learned, 1);
    assert.deepEqual(r.wiki.spells.shardTitles(shardOf("Minor Healing")), ["Minor Healing"]);
  } finally {
    r.cleanup();
  }
});

test("a fresh client walks the spell-harvest checkpoint fresh, same as items", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-spellharvest-fresh-"));
  try {
    const first = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    assert.equal(first.spells.status().pages, 0);

    first.spells.accept([page("Chant of Battle", daysAgo(1), 0)]);

    const next = createWikiClient(dir, { ttlMs: () => TTL_DAYS * DAY });
    const rows = JSON.parse(await next.spellCatalogueJson()) as SpellRow[];
    assert.deepEqual(rows.map((s) => s.spell.title), ["Chant of Battle"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
