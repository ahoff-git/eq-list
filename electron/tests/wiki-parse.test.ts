/**
 * Black-box tests for the wiki HTML parser, pinned against real eqlwiki pages
 * captured under fixtures/wiki/. Because parse.ts is coupled to the wiki's DOM,
 * these guard against silent breakage if the parser (or a refreshed fixture)
 * changes. Re-capture a fixture only when the wiki's markup genuinely changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseWikiPage } from "../wiki/parse";

const FIXTURES = path.resolve(__dirname, "../../../fixtures/wiki");

function parseFixture(slug: string, title: string) {
  const html = fs.readFileSync(path.join(FIXTURES, `${slug}.html`), "utf8");
  return parseWikiPage(title, `/${title.replace(/ /g, "_")}`, html);
}

test("item page → drop sources with mob and zone", () => {
  const p = parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic");
  assert.equal(p.kind, "item");
  const drops = p.sources.filter((s) => s.kind === "drop");
  assert.ok(drops.some((d) => d.where === "Myconid Spore King" && d.detail === "Old Sebilis"));
  assert.equal(p.components.length, 0);
});

test("item page → stat card for the hover tooltip", () => {
  const item = parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic");
  assert.ok(item.card, "item should have a stat card");
  assert.equal(item.card!.title, "Fungus Covered Scale Tunic");
  assert.ok(item.card!.lines.length > 0);
});

test("quest page → giver/zone sources, turn-in components, rewards", () => {
  const p = parseFixture("quest-aviak-talons", "Aviak Talons");
  assert.equal(p.kind, "quest");
  assert.ok(p.sources.some((s) => s.detail === "Start zone" && s.where === "North Kaladim"));
  assert.ok(p.sources.some((s) => s.detail === "Quest giver"));
  // The prose says "Aviak Talons" (plural) but links to /Aviak_Talon — we store the
  // canonical singular name so it matches loot lines.
  const talon = p.components.find((c) => c.qty === 4);
  assert.equal(talon!.name, "Aviak Talon");
  assert.equal(talon!.wikiPath, "/Aviak_Talon");
  assert.ok(p.rewards.length >= 1);
  // Rewards are structured; these are coin/faction lines, so none is a linked item.
  assert.equal(typeof p.rewards[0].text, "string");
  assert.ok(p.rewards.every((r) => !r.item));
  // Quest info card: Minimum Level / Classes (+ Related NPCs/Zones) from questTopTable,
  // and it must NOT duplicate the giver/start-zone rows (those are sources).
  assert.ok(p.card, "quest should have an info card");
  assert.ok(p.card!.lines.some((l) => /^Minimum Level:\s*8$/.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Classes:\s*All$/.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Related NPCs:/.test(l)));
  assert.ok(!p.card!.lines.some((l) => /quest giver|start zone/i.test(l)));
});

test("quest page → quantity-less turn-ins are caught by the \"loot\" cue", () => {
  const p = parseFixture("quest-gnoll-slayer", "The Gnoll Slayer");
  assert.equal(p.kind, "quest");
  // Every turn-in here is "loot a/the <item>" with no stated quantity — none of the
  // digit-quantity matches the original heuristic relied on ("hand in 4 Aviak Talons").
  assert.ok(p.components.some((c) => c.name === "Baby Joseph Sayer" && c.qty === 1));
  assert.ok(p.components.some((c) => c.name === "Gnoll's Eye" && c.qty === 1));
  assert.ok(p.components.some((c) => c.name === "Journal of Greater Enchantment" && c.qty === 1));
  // "looted from a krag elder"-style source mobs must stay excluded: the cue only
  // fires when the verb sits right against the link (at most one article between).
  assert.ok(!p.components.some((c) => /Lord Elgnub|Lteth Val Scribe|one eyed gnoll/i.test(c.name)));
});

test("quest page → a split \"TLDR / Full\" walkthrough is read as one, not just the first half", () => {
  const p = parseFixture("quest-exotic-drinks", "Exotic Drinks");
  assert.equal(p.kind, "quest");
  // "Full Walkthrough" is the SECOND heading matching /walkthrough/i — a `find` that stopped at
  // "TLDR; Walkthrough" would only ever see the digit-quantity "Get 3 Honeycombs" turn-in and miss
  // every item the full prose names.
  assert.ok(p.components.some((c) => c.name === "Honeycomb" && c.qty === 3));
  // Every other ingredient is named only by a "**Get** <item>" checklist bullet, with neither a
  // quantity nor "loot" — the "get" cue is what catches these.
  for (const name of ["Kiola Nut", "Honey Jum", "Erud's Tonic", "Koalindl Fish", "Barkeep Compendium"]) {
    assert.ok(p.components.some((c) => c.name === name && c.qty === 1), `expected ${name} as a turn-in`);
  }
  // "Get Stein of Moggok" is the same checklist bullet, but Stein of Moggok is the quest's own final
  // reward — something you receive, not something to add to a shopping list — so it must be excluded.
  assert.ok(!p.components.some((c) => c.name === "Stein of Moggok"));
  assert.ok(p.rewards.some((r) => r.item === "Stein of Moggok"));
});

test("quest page → a coordinate ending one <li> is never read as the next <li>'s quantity", () => {
  const p = parseFixture("quest-ivan-mcmannus-remains", "Ivan McMannus' Remains");
  assert.equal(p.kind, "quest");
  // A ground-spawn list ("Barbarian Jaw: +1465, -4500, -230" then "Barbarian Skull: ...") used to
  // flatten into one string where the trailing "-230" read as "230 Barbarian Skull" — a bogus
  // 230-item shopping-list entry. None of these items carry a real quantity or verb cue of their
  // own, so none should be picked up at all (a miss here is far safer than a fabricated count).
  assert.ok(!p.components.some((c) => c.name === "Barbarian Jaw"));
  assert.ok(!p.components.some((c) => c.name === "Barbarian Skull"));
  assert.ok(!p.components.some((c) => c.name === "Barbarian Femur"));
  // The fourth piece, Barbarian Rib, IS named with a cue ("is dropped by a 'goblin diver'") rather
  // than a coordinate, so it should be caught — this is what tells the miss above apart from a
  // heuristic that's simply blind to every link in the section.
  assert.ok(p.components.some((c) => c.name === "Barbarian Rib" && c.qty === 1));
});

test("quest page → an item named only in its own drop-source sentence is still caught", () => {
  const p = parseFixture("quest-shiny-robe-underfoot", "Shiny Robe of the Underfoot Quest");
  assert.equal(p.kind, "quest");
  // The only linked mention of the turn-in item is "The Shining Metallic Robes is dropped rarely
  // off the ghoul arch magi" — no quantity, no "loot"/"get" verb before it. The "is dropped" cue
  // reads it the same way an item page's own "Drops From" section would.
  assert.ok(p.components.some((c) => c.name === "Shining Metallic Robes" && c.qty === 1));
  // The two possible rewards must stay out of the turn-in list.
  assert.ok(!p.components.some((c) => c.name === "Shiny Hunk of Metal" || c.name === "Shiny Robe of the Underfoot"));
});

test("quest page → active-voice \"drop(s) from\" and passive \"may be purchased\" are both caught", () => {
  const p = parseFixture("quest-shovel-of-ponz", "Shovel Of Ponz Quest");
  assert.equal(p.kind, "quest");
  // "A Ruby may be purchased from a jewelry merchant." — a modal-passive "purchase" cue.
  assert.ok(p.components.some((c) => c.name === "Ruby" && c.qty === 1));
  // "A Gargoyle Eye drops from various gargoyles around the world." — bare active "drops from",
  // no "is/are" auxiliary. The trailing "from" is what makes this safe: it's what a mob-as-subject
  // sentence ("the Bixie drops Honeycomb") never has.
  assert.ok(p.components.some((c) => c.name === "Gargoyle Eye" && c.qty === 1));
  // "Hill Giant Toes drop from various hill giants around the world." — same shape, plural verb.
  assert.ok(p.components.some((c) => c.name === "Hill Giant Toes" && c.qty === 1));
  // "A Shovel (identifies as "Shovel of Earth") drops from magicians..." — the parenthetical aside
  // between the link and "drops" sits outside every cue's tight window, so this one is a known,
  // accepted miss rather than something the heuristic is expected to reach.
  assert.ok(!p.components.some((c) => c.name === "A Shovel"));
  // The final reward must stay out of the turn-in list.
  assert.ok(!p.components.some((c) => c.name === "Shovel of Ponz"));
});

test("spell page → classified as spell with a description/details card", () => {
  const p = parseFixture("spell-burst-of-fire", "Burst of Fire");
  assert.equal(p.kind, "spell");
  assert.ok(p.card, "spell should have a card");
  assert.equal(p.card!.title, "Burst of Fire");
  // Description, class list, and casting details all make it into the card lines.
  assert.ok(p.card!.lines.some((l) => /burns your target/i.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Classes:/.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Mana:/.test(l)));
});

test("quest reward items → linkable, with the embedded tooltip stat-dump stripped", () => {
  const p = parseFixture("quest-langseax", "Langseax Quest");
  assert.equal(p.kind, "quest");
  const langseax = p.rewards.find((r) => r.item === "Langseax");
  assert.ok(langseax, "Langseax tagged as an item reward");
  assert.equal(langseax!.text, "Langseax"); // display text only — NOT "Langseax MAGIC ITEM Slot:…"
  assert.equal(langseax!.wikiPath, "/Langseax");
  assert.ok(p.rewards.some((r) => r.item === "Langseax of the Wolves"));
});

test("mob/NPC page → mob kind, Known Loot with rarity, and a location/stats card", () => {
  const p = parseFixture("mob-hill-giant", "A Hill Giant");
  assert.equal(p.kind, "mob");
  assert.ok(p.components.length > 5);
  const toes = p.components.find((c) => c.name === "Hill Giant Toes");
  assert.ok(toes);
  assert.equal(toes!.dropRate, undefined); // rarity word ("Rare"), not a %, so no rate shown

  // Location + key stats are parsed into the card (renders inline + on hover).
  assert.ok(p.card, "mob should have a stats card");
  assert.equal(p.card!.title, "A Hill Giant");
  assert.ok(p.card!.lines.some((l) => /^Location:/.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Level:/.test(l)));
  // This mob's factions are "None" on both lists, so no faction lines are added.
  assert.ok(!p.card!.lines.some((l) => /^(Factions|Opposing factions):/.test(l)));
});

test("mob loot merges all loot sections and reads drop percentages", () => {
  const p = parseFixture("mob-minotaur-slaver", "A minotaur slaver");
  assert.equal(p.kind, "mob");
  // Common Loot carries a "(X%) (low - high)" chance — we keep the point estimate.
  const lapis = p.components.find((c) => c.name === "Lapis Lazuli");
  assert.ok(lapis, "Lapis Lazuli should be parsed from Common Loot");
  assert.equal(lapis!.dropRate, "4.7%");
  // …and Known Loot's items are merged in too (different section, same list).
  assert.ok(p.components.some((c) => c.name === "Minotaur Battle Axe"));
  // Faction impact makes it onto the card (real factions here, unlike Hill Giant's "None").
  assert.ok(p.card!.lines.some((l) => /^Factions:.*Meldrath/.test(l)));
  assert.ok(p.card!.lines.some((l) => /^Opposing factions:.*Gem Choppers/.test(l)));
});

test("mob loot drop % from the `.ddb` drop-data box (not just `.drare`)", () => {
  // On this page `.drare` is a rarity word ("Rare"); the % lives in `.ddb` ("[1] 1x 25%").
  const p = parseFixture("mob-minotaur-lord", "Minotaur Lord");
  assert.equal(p.kind, "mob");
  const horn = p.components.find((c) => c.name === "Minotaur Horn");
  assert.ok(horn, "Minotaur Horn should be parsed");
  assert.equal(horn!.dropRate, "25%");
});

test("player-craftable item → recipe components", () => {
  const p = parseFixture("recipe-batwing-crunchies", "Batwing Crunchies");
  assert.equal(p.kind, "recipe");
  assert.ok(p.components.some((c) => c.name === "Frosting"));
  assert.ok(p.components.some((c) => c.name === "Bat Wing"));
  assert.ok(p.sources.some((s) => s.kind === "recipe"));
});

test("zone page → its NPC roster, which is where an item's level comes from", () => {
  // The cheap rung of the level hierarchy (ADR 0163): a mob's level is on the mob's page, but a
  // *zone* page states it for every mob at once — 177 zone pages against 4,214 mob pages, measured.
  // Blackburrow is the fixture because it has the two shapes that matter: a fixed level and a range.
  const p = parseFixture("zone-blackburrow", "Blackburrow");
  assert.equal(p.kind, "zone");
  const npcs = p.npcs ?? [];
  assert.ok(npcs.length > 20, `expected a roster, got ${npcs.length}`);

  const burly = npcs.find((n) => n.name === "A Burly Gnoll");
  assert.equal(burly?.level, "7-9", "a range is kept as the wiki's own text, for `item-levels` to read");
  const brewer = npcs.find((n) => n.name === "A Gnoll Brewer");
  assert.equal(brewer?.level, "17", "and so is a single level");

  // The header row is not a row, and nothing arrives half-read.
  assert.equal(npcs.some((n) => n.name === "NPC Name"), false);
  assert.ok(npcs.every((n) => n.name && n.level));
});

test("only zone pages carry a roster", () => {
  // The table is found by reading its header row, so a page without one simply has no `npcs` —
  // rather than picking up whatever table happened to be first.
  assert.equal(parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic").npcs, undefined);
  assert.equal(parseFixture("mob-hill-giant", "A Hill Giant").npcs, undefined);
});

// ─── The wiki's shape (ADR 0180) ────────────────────────────────────────────

test("a zone page carries the pages it links to", () => {
  // The links are how a page the category walk never files as an item is found at all: a zone page
  // names what is in the zone, and we already fetch it for the NPC levels.
  const zone = parseFixture("zone-blackburrow", "Blackburrow");
  assert.equal(zone.kind, "zone");
  assert.ok(zone.links?.length, "a zone page links to plenty");
  // Titles, not hrefs — a title is what the roster, the shards and the peers all speak in.
  assert.ok(
    zone.links?.every((l) => !l.startsWith("/") && !l.includes("_")),
    "links are titles, not paths",
  );
  // The same filter the rest of the parser uses, so the namespaces nothing can fetch are gone.
  assert.ok(
    zone.links?.every((l) => !/^(Category|File|Special|Template|Help|Talk):/i.test(l)),
    "no category, file or template links",
  );
  assert.equal(new Set(zone.links).size, zone.links?.length, "de-duplicated");
});

test("a quest page carries its links too", () => {
  const quest = parseFixture("quest-aviak-talons", "Aviak Talons");
  assert.equal(quest.kind, "quest");
  assert.ok(quest.links?.length, "a quest page names what it involves");
});

test("an item page carries no links, and a mob page carries none either", () => {
  // Deliberate: only the two curated kinds carry a shape. Items and mobs are the *targets* of the
  // discovery, and giving them links would have bumped their parse version too — 11,847 pages
  // re-read instead of ~1,700, for links nothing reads.
  const item = parseFixture("item-fungus-tunic", "Fungus Covered Scale Tunic");
  assert.equal(item.links, undefined);
});
