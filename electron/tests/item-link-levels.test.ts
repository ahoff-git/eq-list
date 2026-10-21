/**
 * Every place the app names an item or a spell is accounted for: it either shows the thing at its
 * level, or there is no level to show (ADR 0312, ADR 0316).
 *
 * `ItemLink` shows a name's card *at the level the name states* (`Gnoll Slayer +3`, `Shock of
 * Lightning VI`), so a view gets levels right by handing it the name as held — and gets them wrong
 * only by handing it a name it stripped, or one from a store that folded the level away. This test
 * finds every `<ItemLink title={…}>` in the renderer and requires each to be classified below. A new
 * or changed call site fails here until someone decides how its rank is handled, which is the point:
 * "everywhere" stays true without a person re-auditing seventy call sites.
 *
 * Re-run when a component that uses `ItemLink` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "../../..");
const COMPONENTS = path.join(REPO_ROOT, "src", "app");

/** How a call site's title gets its level right. */
type Level =
  /** Built at its level by a shared writer — `gradedTitle`, `rankedSpellTitle`. */
  | "levelled"
  /** A held name passed through as the game wrote it — a loot line, a dump row, a crafted result, a
   *  list entry, a price row — so any `+N` it had reaches `ItemLink` intact. */
  | "as-named"
  /** A wiki or catalogue title: the page itself, which is the `+0` thing. */
  | "wiki"
  /** A mob's drop table, folded by grade on purpose — a `+2` copy is the same drop (ADR 0057). */
  | "drop-table"
  /** Not an item or a spell: a mob, zone, NPC, faction, quest or guide page. */
  | "not-item";

const SITES: Record<string, Level> = {
  "buffs/BuffPanel.tsx|rankedSpellTitle(buff.spell, buff.rank)": "levelled",
  "combat/SpellTable.tsx|rankedSpellTitle(p.row.spell, p.row.rank)": "levelled",
  "exports/InventoryDumpView.tsx|gradedTitle(t.baseName, t.bestGrade)": "levelled",
  "exports/InventoryDumpView.tsx|item.name": "as-named",
  "items/BisView.tsx|gradedTitle(m.title, m.to)": "levelled",
  "items/BisWearTable.tsx|gradedTitle(r.pick.item.title, r.pick.item.grade)": "levelled",
  // Hunt targets are catalogue items you don't hold, weighed at +0 (the table shows +1/+2/+3 apart).
  "items/BisHuntTable.tsx|h.item.title": "wiki",
  "items/BisWearTable.tsx|r.hunt.item.title": "wiki",
  "items/BisEffects.tsx|h.item.title": "wiki", // a catalogue item carrying a wanted effect, not held
  "items/ItemTable.tsx|gradedTitle(p.row.item.title, p.row.grade ?? 0)": "levelled",
  "items/ItemTable.tsx|row.quests[0]": "not-item",
  "peers/PeerInventories.tsx|gradedTitle(f.item, f.bestGrade)": "levelled",

  "items/LootPanel.tsx|p.row.item": "as-named", // the loot ledger and price rows keep the name as looted
  "items/LootPanel.tsx|p.row.source": "not-item",
  "items/ListPanel.tsx|entry.name": "as-named",
  "items/ListPanel.tsx|g.label": "not-item",
  "items/ListPanel.tsx|bestOther.where": "not-item",
  "items/ListPanel.tsx|source.where": "not-item",
  "tradeskills/CraftingLogView.tsx|p.row.item": "as-named", // what the log says you made
  "items/ItemLink.tsx|name": "as-named", // a list of names handed in, shown as given

  "mob/MobKills.tsx|drop.item": "drop-table",
  "mob/MobKnowledge.tsx|drop.item": "drop-table",
  "mob/HuntPanel.tsx|it.item": "drop-table",
  "mob/HuntPanel.tsx|g.item": "wiki",
  "mob/HuntPanel.tsx|e.name": "wiki",

  "items/SearchPanel.tsx|r.title": "wiki",
  "items/SearchPanel.tsx|q.title": "wiki",
  "items/SearchPanel.tsx|f.title": "wiki",
  "items/WikiPageView.tsx|c.name": "wiki",
  "items/WikiPageView.tsx|effect.name": "wiki",
  "items/WikiPageView.tsx|m.name": "wiki",
  "items/WikiPageView.tsx|r.item": "wiki",
  "items/WikiPageView.tsx|q.title": "not-item",
  "items/WikiPageView.tsx|q": "not-item",
  "items/WikiPageView.tsx|s.where": "not-item",
  "items/WikiPageView.tsx|title": "wiki",
  "items/PickupPageView.tsx|p.item": "wiki",
  "items/PickupPageView.tsx|pickupEntryName(s)": "wiki",
  "items/PickupPageView.tsx|p.quest": "not-item",
  "items/PickupPageView.tsx|n.npc": "not-item",
  "items/QuestPlanView.tsx|g": "wiki",
  "items/QuestPlanView.tsx|place.who.name": "not-item",
  "items/QuestSteps.tsx|part.title": "wiki",
  "spells/SpellCatalogTable.tsx|p.row.spell.title": "wiki",
  "spells/SpellCatalogTable.tsx|quest": "not-item",
  "tradeskills/TradeskillsPanel.tsx|item": "wiki",
  "tradeskills/TradeskillsPanel.tsx|m.name": "wiki",
  "tradeskills/TradeskillsPanel.tsx|name": "wiki",
  "tradeskills/TradeskillsPanel.tsx|r.link": "wiki",
  "tradeskills/TradeskillsPanel.tsx|s.item": "wiki",
  "tradeskills/TradeskillsPanel.tsx|t": "wiki",

  "combat/CampReport.tsx|p.row.mob": "not-item",
  "combat/CampReport.tsx|p.row.zone": "not-item",
  "faction/FactionPanel.tsx|c.source": "not-item",
  "faction/FactionPanel.tsx|causeSource(hit)!": "not-item",
  "faction/FactionPanel.tsx|p.row.faction": "not-item",
  "faction/RaceUnlocksView.tsx|RACE_UNLOCK_SOURCE.title": "not-item",
  "faction/RaceUnlocksView.tsx|f.faction": "not-item",
  "faction/RaceUnlocksView.tsx|h.faction": "not-item",
  "faction/RaceUnlocksView.tsx|seg.link.title": "not-item",
  "items/ItemDrops.tsx|row.mob": "not-item",
  "kills/KillList.tsx|group.mob": "not-item",
  "kills/KillList.tsx|kill.mob": "not-item",
  "mob/HuntPanel.tsx|m.mob": "not-item",
  "mob/HuntPanel.tsx|place.mob": "not-item",
  "mob/HuntPanel.tsx|zone": "not-item",
  "mob/MobKnowledge.tsx|mob.mob": "not-item",
};

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

test("every ItemLink call site says how its item's level is shown", () => {
  const found = new Set<string>();
  const unknown: string[] = [];
  for (const file of sources(COMPONENTS)) {
    const rel = path.relative(path.join(COMPONENTS, "components"), file).replace(/\\/g, "/");
    for (const title of titlesIn(fs.readFileSync(file, "utf8"))) {
      const key = `${rel}|${title}`;
      found.add(key);
      if (!(key in SITES)) unknown.push(key);
    }
  }
  assert.deepEqual(
    unknown,
    [],
    "classify each new call site in SITES: pass the held name (or gradedTitle / rankedSpellTitle) to show its level",
  );
  const stale = Object.keys(SITES).filter((k) => !found.has(k));
  assert.deepEqual(stale, [], "these call sites are gone — remove them from SITES");
});
