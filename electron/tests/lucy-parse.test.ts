/**
 * Black-box tests for the Lucy HTML parser ([electron/lucy/parse.ts](../lucy/parse.ts)), pinned
 * against real pages captured under `fixtures/lucy/`.
 *
 * Same rule as the wiki parser's tests: the parser is coupled to someone else's DOM, so the fixtures
 * are the contract. Re-capture one only when Lucy's markup genuinely changes — and note that Lucy's
 * pages are hand-written HTML from about 2004 (unclosed tags, layout in `style` attributes), which is
 * exactly why the parser reads a table's header row instead of counting tables.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseLucyItem, parseLucyItemList, withoutZoneSuffix } from "../lucy/parse";
import { itemUrlFor } from "../lucy/api";

const FIXTURES = path.resolve(__dirname, "../../../fixtures/lucy");

const fixture = (slug: string) => fs.readFileSync(path.join(FIXTURES, `${slug}.html`), "utf8");

/** The real Lucy ids for the captured pages, so the parsed item matches the page it came from. */
const BRACELET = 1649;
const BLADE = 25210;
const FLASK = 13006;

// ── the stat card ────────────────────────────────────────────────────────────

test("item page → the in-game tooltip, line by line", () => {
  const item = parseLucyItem(BRACELET, fixture("item-loam-encrusted-bracelet"))!;
  assert.equal(item.id, BRACELET);
  assert.equal(item.name, "Loam Encrusted Bracelet");
  assert.ok(item.card);
  // The tooltip's structure is carried entirely by <br>, so these lines are the whole test of it.
  assert.deepEqual(item.card!.lines.slice(0, 5), [
    "Slot: WRIST",
    "AC: 3",
    "CHA: +3 INT: +3 MANA: +15",
    "WT: 0.3 Size: SMALL",
    "Class: NEC WIZ MAG ENC",
  ]);
  assert.match(item.card!.icon ?? "", /pgfx\/item_637\.png$/);
});

test("a weapon's effect keeps its wording once the link is stripped", () => {
  const item = parseLucyItem(BLADE, fixture("item-blade-of-carnage"))!;
  assert.equal(item.name, "Blade of Carnage");
  const lines = item.card!.lines;
  assert.ok(lines.includes("Skill: 1H Slashing Atk Delay: 20"));
  assert.ok(
    lines.some((l) => l === "Effect: Enraging Blow (Combat, Casting Time: Instant) at Level 45"),
    `no effect line in ${JSON.stringify(lines)}`,
  );
  // The flags above the slot line are part of the tooltip and worth keeping.
  assert.equal(lines[0], "Lore Item Placeable");
});

// ── sources, and the era they imply ──────────────────────────────────────────

test("item page → drops as mob + zone, in the shape the wiki's use", () => {
  const item = parseLucyItem(BRACELET, fixture("item-loam-encrusted-bracelet"))!;
  assert.equal(item.sourceRows, 2);
  assert.equal(item.sources.length, 2);
  assert.deepEqual(item.sources[0], {
    kind: "drop",
    where: "an elemental warrior",
    detail: "Ruins of Old Paineel 2.0 (The Hole)",
  });
  // The zone is stored exactly as Lucy wrote it (ADR 0083); placing it is a read-time judgement.
  assert.equal(item.era, "in-era");
  assert.match(item.eraWhy, /The Hole/);
});

test("an item found only in expansions this server hasn't opened is flagged out of era", () => {
  const item = parseLucyItem(BLADE, fixture("item-blade-of-carnage"))!;
  assert.deepEqual(
    item.sources.map((d) => d.detail),
    ["Kael Drakkel", "Kael Drakkel"],
  );
  assert.equal(item.era, "out-of-era");
});

test("merchants are read as well as mobs, and told apart", () => {
  // Lucy puts "Sold by" in an identically-classed table below "Drops from". Reading only the first
  // would lose the answer a shopping list most wants: don't kill anything, go and buy it.
  const flask = parseLucyItem(FLASK, fixture("item-water-flask"))!;
  const kinds = new Set(flask.sources.map((s) => s.kind));
  assert.ok(kinds.has("drop"), "some rows are drops");
  assert.ok(kinds.has("vendor"), "some rows are merchants");
  assert.ok(
    flask.sources.some((s) => s.kind === "vendor" && s.where === "a clockwork grocer" && s.detail === "Ak'Anon"),
    "a real merchant row should survive",
  );
});

test("hundreds of source rows are capped, but the count and the verdict are not", () => {
  const flask = parseLucyItem(FLASK, fixture("item-water-flask"))!;
  assert.equal(flask.name, "Water Flask");
  // 54 mobs drop one of these and 362 merchants sell them — twenty-five years of EverQuest.
  assert.ok(flask.sourceRows > 300, `expected a long list, got ${flask.sourceRows}`);
  assert.equal(flask.sources.length, 50, "the stored list is capped");
  assert.ok(flask.sources.length < flask.sourceRows, "and `sourceRows` still says how many there were");
  // The cap is applied *after* the verdict, so it can never turn an in-era item out-of-era…
  assert.equal(flask.era, "in-era");
  // …and what survives it is the part a player here can act on, drops before sales.
  assert.ok(
    flask.sources.some((d) => d.detail === "Blackburrow"),
    "a placeable zone should be kept ahead of the unplaceable ones",
  );
  const firstVendor = flask.sources.findIndex((s) => s.kind === "vendor");
  const lastDrop = flask.sources.map((s) => s.kind).lastIndexOf("drop");
  assert.ok(firstVendor === -1 || lastDrop < firstVendor, "placeable drops are listed before placeable sales");
});

test("a mob name Lucy suffixed with its own zone loses the suffix, and keeps the rest", () => {
  // `a gnoll pup - Blackburrow`, in a row whose zone cell already says Blackburrow. The suffix is
  // Lucy disambiguating for its own list; kept, it would match nothing the log ever prints.
  const flask = parseLucyItem(FLASK, fixture("item-water-flask"))!;
  assert.ok(
    flask.sources.some((s) => s.where === "a gnoll pup" && s.detail === "Blackburrow"),
    "the zone suffix should be gone",
  );
  assert.ok(!flask.sources.some((s) => s.where.includes(" - Blackburrow")));
  // A tail that isn't the zone is Lucy telling you *which* spawn, so it stays — even though the row's
  // own zone cell writes the name with a revamp version the tail doesn't have.
  assert.equal(
    withoutZoneSuffix("a skeleton - Innothule Swamp - Captain Bones", "Innothule Swamp 2.0"),
    "a skeleton - Captain Bones",
  );
  assert.equal(withoutZoneSuffix("a zombie - Befallen", "Befallen 2.0"), "a zombie");
  // A mob genuinely named after a place keeps its name: only a *tail* segment is ever dropped.
  assert.equal(withoutZoneSuffix("Befallen - Befallen", "Befallen"), "Befallen");
});

// ── refusing a page that isn't one ───────────────────────────────────────────

test("a page with no item tooltip parses to null rather than a nameless item", () => {
  // What Lucy serves without a session cookie. Caching this as an item would poison the entry for a
  // month, so the parser has to recognise it as "not an answer".
  const noCookie = '<head><meta HTTP-EQUIV="Refresh" CONTENT="0; URL=/item.html?id=1649&setcookie=1"></head>';
  assert.equal(parseLucyItem(1649, noCookie), null);
  assert.equal(parseLucyItem(1649, "<html><body><center>No cookies for Lucy?</center></body></html>"), null);
});

test("an item Lucy names no source for is unknown-era, not out-of-era", () => {
  // Synthetic, and deliberately so: every real item in these fixtures has source rows, and the case
  // that matters here is structural — the page simply has neither table. Quest rewards and crafted
  // goods land here.
  const html = `
    <table class="shottopbg"><tr><td class="shottitle">Bone Chips</td></tr></table>
    <table class="eqitem"><tr><td class="shotdata">WT: 0.1  Size: SMALL<br>Class: ALL<br></td></tr></table>`;
  const item = parseLucyItem(9999, html)!;
  assert.equal(item.name, "Bone Chips");
  assert.deepEqual(item.sources, []);
  assert.equal(item.sourceRows, 0);
  assert.equal(item.era, "unknown");
});

// ── linking out ──────────────────────────────────────────────────────────────

test("an item links to Lucy by id when we have one, and by name when we don't", () => {
  // The name form is what lets *every* item in the app offer the link. It works because Lucy
  // redirects a one-hit search to the item itself — so the browser resolves the name and this app
  // makes no request to put the link on screen.
  assert.equal(itemUrlFor(1649), "https://lucy.allakhazam.com/item.html?id=1649");
  assert.equal(
    itemUrlFor("Rusty Short Sword"),
    "https://lucy.allakhazam.com/itemlist.html?searchtext=Rusty+Short+Sword",
  );
});

test("a name with characters that need escaping still makes a usable URL", () => {
  // Apostrophes and ampersands are ordinary in EQ item names, and a hand-built query string is
  // exactly where they break. `URLSearchParams` is doing the work; this pins that it is being used.
  assert.equal(
    itemUrlFor("Tarnished Bronze Sword of Ykesha's Bane"),
    "https://lucy.allakhazam.com/itemlist.html?searchtext=Tarnished+Bronze+Sword+of+Ykesha%27s+Bane",
  );
  assert.ok(!itemUrlFor("Flask of Water & Oil").includes(" "));
});

// ── the results list ─────────────────────────────────────────────────────────

test("search page → id, name and type per row, sidebar links ignored", () => {
  const rows = parseLucyItemList(fixture("itemlist-loam-encrusted"));
  assert.equal(rows.length, 12, "the page says 12 found");
  assert.deepEqual(rows[1], { id: 1649, name: "Loam Encrusted Bracelet", type: "Armor", era: "unknown" });
  // Era is never guessed from a list: it carries no zones (ADR 0124).
  assert.ok(rows.every((r) => r.era === "unknown"));
  // Each row appears once even though the icon cell links to the same item.
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("a search that found nothing parses to nothing", () => {
  const empty = '<center> Search Results (0 found) </center><table class="sidebar"></table>';
  assert.deepEqual(parseLucyItemList(empty), []);
});
