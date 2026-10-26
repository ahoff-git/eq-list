/**
 * Every place the app links an item or a spell has decided its level (ADR 0312, ADR 0316).
 *
 * The decision is a **type**: `ItemLink`'s `title` (and `NameList`'s `names`) take only a `ShownName`
 * (`src/shared/shown-name.ts`), which a name becomes by a level writer (`gradedTitle`,
 * `rankedSpellTitle`) or by a marker saying why it needs none (`heldAsNamed`, `wikiName`,
 * `dropTableName`, `notAnItem`). So the compiler checks every call site, and `level-paths.test.ts`
 * checks what each marker promises against real data.
 *
 * This file pins the two halves of that: a plain string cannot pass for a `ShownName` (the compile
 * of this very file fails if it could), and every `<ItemLink title={…}>` in the renderer is built by
 * one of the six — not cast around them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { heldAsNamed, type ShownName } from "../../src/shared/shown-name";

const REPO_ROOT = path.join(__dirname, "../../..");
const COMPONENTS = path.join(REPO_ROOT, "src", "app");
const DECIDERS = ["gradedTitle", "rankedSpellTitle", "heldAsNamed", "wikiName", "dropTableName", "notAnItem"];

/**
 * Each call site, and the test in `level-paths.test.ts` that traces it — the data or function that
 * view renders from, run against real data. A site with no trace, or a trace that no longer exists,
 * fails below: every view that links an item or a spell is individually verified, not just typed.
 */
const TRACES: Record<string, string> = {
  "chrome/StatusBar.tsx|heldAsNamed(last.item)": "Loot tab: a graded drop is stored and read back as looted, so its row links at its grade",
  "chrome/StatusBar.tsx|notAnItem(last.source)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/BisDamage.tsx|gradedTitle(best.title, best.grade)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisDamage.tsx|gradedTitle(line.title, line.grade)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisHuntTable.tsx|gradedTitle(p.row.item.title, grade)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisHuntTable.tsx|gradedTitle(p.row.replaces.item.title, p.row.replaces.item.grade)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisHuntTable.tsx|wikiName(p.row.item.title)": "best in slot: hunt targets are catalogue items you don't hold, named at +0",
  "items/BisEffects.tsx|wikiName(p.stone.from)": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "items/BisEffects.tsx|heldAsNamed(p.by)": "inventory dump: a row's name keeps its grade, and the parsed grade agrees with ItemLink's reading",
  "items/BisView.tsx|wikiName(t)": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "items/BisView.tsx|wikiName(o.from)": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "map/ZoneName.tsx|notAnItem(zonePageTitle(zone))": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "peers/PeerTray.tsx|notAnItem(e.name)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "peers/PeerTray.tsx|heldAsNamed(e.name)": "shopping list: an entry added by a graded name keeps it, so the List tab links it at that grade",
  "tradeskills/TradeskillsPanel.tsx|wikiName(needsFor.result)": "tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing",
  "buffs/BuffPanel.tsx|rankedSpellTitle(buff.spell, buff.rank)": "spells: a ranked name is read back at its rank, and falls back to the unranked page",
  "combat/CampReport.tsx|notAnItem(p.row.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "combat/SpellTable.tsx|rankedSpellTitle(p.row.spell, p.row.rank)": "spells: a ranked name is read back at its rank, and falls back to the unranked page",
  "exports/InventoryDumpView.tsx|gradedTitle(t.baseName, t.bestGrade)": "Exports by item: a total is linked at the best grade among the copies it counts",
  "exports/InventoryDumpView.tsx|heldAsNamed(item.name)": "inventory dump: a row's name keeps its grade, and the parsed grade agrees with ItemLink's reading",
  "faction/FactionPanel.tsx|notAnItem(c.source)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/FactionPanel.tsx|notAnItem(causeSource(hit)!)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/FactionPanel.tsx|notAnItem(p.row.faction)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/RaceUnlocksView.tsx|notAnItem(RACE_UNLOCK_SOURCE.title)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/RaceUnlocksView.tsx|notAnItem(f.faction)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/RaceUnlocksView.tsx|notAnItem(h.faction)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/RaceUnlocksView.tsx|notAnItem(seg.link.title)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "faction/RaceUnlocksView.tsx|wikiName(m.name)": "race unlock guide: a step's counted materials are the guide's own links or its quest's turn-ins, +0 wiki names",
  "items/BisEffects.tsx|wikiName(h.item.title)": "best in slot: hunt targets are catalogue items you don't hold, named at +0",
  "items/BisView.tsx|gradedTitle(m.title, m.to)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisWearTable.tsx|gradedTitle(r.pick.item.title, r.pick.item.grade)": "best in slot: a held graded item is picked and shown at its grade",
  "items/BisWearTable.tsx|wikiName(r.hunt.item.title)": "best in slot: hunt targets are catalogue items you don't hold, named at +0",
  "items/FindAcross.tsx|gradedTitle(t.baseName, t.bestGrade)": "Exports by item: a total is linked at the best grade among the copies it counts",
  "items/ItemDrops.tsx|notAnItem(row.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/ItemLink.tsx|name": "inventory dump: a row's name keeps its grade, and the parsed grade agrees with ItemLink's reading",
  "items/ItemTable.tsx|gradedTitle(p.row.item.title, p.row.grade ?? 0)": "Items tab: an owned item's row is weighed and linked at the best grade you hold",
  "items/ItemTable.tsx|notAnItem(row.quests[0])": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/ListPanel.tsx|heldAsNamed(entry.name)": "shopping list: an entry added by a graded name keeps it, so the List tab links it at that grade",
  "items/ListPanel.tsx|notAnItem(bestOther.where)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/ListPanel.tsx|notAnItem(g.label)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/ListPanel.tsx|notAnItem(source.where)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/LootPanel.tsx|heldAsNamed(p.row.item)": "Loot tab: a graded drop is stored and read back as looted, so its row links at its grade",
  "items/LootPanel.tsx|notAnItem(p.row.source)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/PickupPageView.tsx|notAnItem(n.npc)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/PickupPageView.tsx|notAnItem(p.quest)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/PickupPageView.tsx|wikiName(p.item)": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "items/PickupPageView.tsx|wikiName(pickupEntryName(s))": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "items/QuestPlanView.tsx|notAnItem(place.who.name)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/QuestPlanView.tsx|wikiName(g)": "Wiki page view: every component, reward and drop name a page links is a +0 wiki name",
  "items/QuestSteps.tsx|wikiName(part.title)": "Wiki page view: every component, reward and drop name a page links is a +0 wiki name",
  "items/SearchPanel.tsx|wikiName(f.title)": "Search tab: every graded title in the search index is an alias of its +0 page",
  "items/SearchPanel.tsx|wikiName(q.title)": "Search tab: every graded title in the search index is an alias of its +0 page",
  "items/SearchPanel.tsx|wikiName(r.title)": "Search tab: every graded title in the search index is an alias of its +0 page",
  "items/WikiPageView.tsx|notAnItem(q)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/WikiPageView.tsx|notAnItem(q.title)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/WikiPageView.tsx|notAnItem(s.where)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "items/WikiPageView.tsx|wikiName(c.name)": "Wiki page view: every component, reward and drop name a page links is a +0 wiki name",
  "items/WikiPageView.tsx|wikiName(effect.name)": "Spells tab: every catalogue row opens and hovers as printed, at level 0 — its title is the spell",
  "items/WikiPageView.tsx|wikiName(m.name)": "Wiki page view: every component, reward and drop name a page links is a +0 wiki name",
  "items/WikiPageView.tsx|wikiName(r.item)": "Wiki page view: every component, reward and drop name a page links is a +0 wiki name",
  "items/WikiPageView.tsx|wikiName(title)": "the catalogue: an item page is the +0 thing, so a level is applied once, never twice",
  "kills/KillList.tsx|notAnItem(group.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "kills/KillList.tsx|notAnItem(kill.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "mob/MobFactionHits.tsx|notAnItem(c.faction)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "mob/HuntPanel.tsx|heldAsNamed(e.name)": "Hunt tab: an item on your list keeps its name, grade and all, from list entry to the Hunt row",
  "mob/HuntPanel.tsx|heldAsNamed(g.item)": "Hunt tab: an item on your list keeps its name, grade and all, from list entry to the Hunt row",
  "mob/HuntPanel.tsx|heldAsNamed(it.item)": "Hunt tab: an item on your list keeps its name, grade and all, from list entry to the Hunt row",
  "mob/HuntPanel.tsx|notAnItem(m.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "mob/HuntPanel.tsx|notAnItem(place.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "mob/MobKills.tsx|dropTableName(drop.item)": "MobKills: a mob's drop table pools every grade under its +0 item",
  "mob/MobKnowledge.tsx|dropTableName(drop.item)": "MobKnowledge: a mob's reconciled drop table folds a graded drop into its item — by design",
  "now/NowOverview.tsx|rankedSpellTitle(b.spell, b.rank)": "spells: a ranked name is read back at its rank, and falls back to the unranked page",
  "mob/MobKnowledge.tsx|notAnItem(mob.mob)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "peers/PeerInventories.tsx|gradedTitle(f.item, f.bestGrade)": "Who has it: a peer's row carries their best grade and is linked at it",
  "spells/SpellCatalogTable.tsx|notAnItem(quest)": "not-an-item links: a page that isn't an item, recipe or spell never levels, whatever name opens it",
  "spells/SpellCatalogTable.tsx|wikiName(p.row.spell.title)": "Spells tab: every catalogue row opens and hovers as printed, at level 0 — its title is the spell",
  "tradeskills/CraftingLogView.tsx|heldAsNamed(p.row.item)": "crafting log: a crafted item's name is kept as the log wrote it, so a graded result would keep its grade",
  "tradeskills/TradeskillsPanel.tsx|wikiName(item)": "Tradeskills: the shopping view names each material exactly as the guide does",
  "tradeskills/TradeskillsPanel.tsx|wikiName(m.name)": "tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing",
  "tradeskills/TradeskillsPanel.tsx|wikiName(name)": "tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing",
  "tradeskills/TradeskillsPanel.tsx|wikiName(r.link)": "tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing",
  "tradeskills/TradeskillsPanel.tsx|wikiName(s.item)": "Tradeskills: the shopping view names each material exactly as the guide does",
  "tradeskills/TradeskillsPanel.tsx|wikiName(t)": "tradeskill guides: every material, choice and result is an ungraded wiki name, so it's the +0 thing",
};

test("a plain string is not a ShownName — the level has to be decided to link it", () => {
  // @ts-expect-error a bare string carries no decision about its level
  const bare: ShownName = "Dragoon Dirk";
  const decided: ShownName = heldAsNamed("Dragoon Dirk +2");
  assert.equal(`${bare} ${decided}`, "Dragoon Dirk Dragoon Dirk +2", "markers are the identity at runtime");
});

/** Every `.tsx` under `dir`. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

/** The `title={…}` expression of each `<ItemLink …>` in a file, braces balanced, across lines. */
function titlesIn(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf("<ItemLink", from);
    if (at === -1) return out;
    from = at + 1;
    const t = text.indexOf("title={", at);
    // This tag's own attribute only: a `title={` past the next `<ItemLink` belongs to that one.
    const next = text.indexOf("<ItemLink", from);
    if (t === -1 || (next !== -1 && t > next)) continue;
    let depth = 0;
    let i = t + "title=".length;
    const start = i + 1;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) break;
    }
    out.push(text.slice(start, i).replace(/\s+/g, " ").trim());
  }
}

test("every ItemLink title is built by a level writer or a marker, never cast around them", () => {
  const sites: string[] = [];
  const undecided: string[] = [];
  for (const file of sources(COMPONENTS)) {
    const rel = path.relative(COMPONENTS, file).replace(/\\/g, "/");
    for (const title of titlesIn(fs.readFileSync(file, "utf8"))) {
      sites.push(`${rel}|${title}`);
      // `NameList`'s own `name` is already a ShownName — its callers decided (they're checked by type).
      const decided = DECIDERS.some((d) => title.startsWith(`${d}(`)) || (rel.endsWith("items/ItemLink.tsx") && title === "name");
      if (!decided || /\bas ShownName\b/.test(title)) undecided.push(`${rel}|${title}`);
    }
  }
  assert.ok(sites.length > 60, "the renderer's ItemLinks were found");
  assert.deepEqual(undecided, [], "build each title with gradedTitle / rankedSpellTitle, or mark why it needs no level");
});

test("every call site is traced: each maps to a level-paths test that exists", () => {
  const traces = fs.readFileSync(path.join(REPO_ROOT, "electron", "tests", "level-paths.test.ts"), "utf8");
  const sites = new Set<string>();
  for (const file of sources(COMPONENTS)) {
    const rel = path.relative(path.join(COMPONENTS, "components"), file).split(path.sep).join("/");
    for (const title of titlesIn(fs.readFileSync(file, "utf8"))) sites.add(`${rel}|${title}`);
  }
  const untraced = [...sites].filter((s) => !(s in TRACES));
  assert.deepEqual(untraced, [], "add each new call site to TRACES with the level-paths test that verifies it");
  const missing = [...new Set(Object.values(TRACES))].filter((name) => !traces.includes(`test(${JSON.stringify(name)}`));
  assert.deepEqual(missing, [], "these traces don't exist in level-paths.test.ts");
  const stale = Object.keys(TRACES).filter((k) => !sites.has(k));
  assert.deepEqual(stale, [], "these call sites are gone — remove them from TRACES");
});
