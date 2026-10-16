/**
 * fetch-quest-plans.mjs — regenerate the bundled plans for long, multi-zone quests.
 *
 * A quest pickup (`fetch-quest-pickups.mjs`) is one thing on the ground. A class epic or a Plane of
 * Sky test is a *route*: stages of steps across a dozen zones, each step handing something in or
 * getting something back, from somebody, somewhere. This reads each one off eqlwiki into that shape
 * — stages, steps, items, people, places — so the app can show a quest as a plan you work through,
 * pin the next stops on the map, and tick steps off as their items reach your list
 * ([ADR 0300](../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md)).
 *
 * Two page shapes (`scripts/lib/quest-plan-parse.mjs`):
 *   - `checklist` — the quest page's own `{{CheckboxList}}` (every class epic).
 *   - `sky`       — one class's table on the Plane of Sky page (the class tests are transcluded from it).
 *
 * Every page a step links is fetched once, to learn what it is (item, NPC/mob, zone, quest) and, for a
 * person, where their page says they stand.
 *
 *   node scripts/fetch-quest-plans.mjs            # rewrite the generated plans
 *   node scripts/fetch-quest-plans.mjs --dry-run  # report what would change, write nothing
 *   node scripts/fetch-quest-plans.mjs --report   # print every step as parsed, write nothing
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, flag, helpIfAsked, writeGenerated } from "./lib/cli.mjs";
import { pagesByLink } from "./lib/eqlwiki.mjs";
import { npcPlace, npcZone } from "./lib/quest-npc-parse.mjs";
import { labelPlace, mapLabels, mapNamesFor } from "./lib/map-labels.mjs";
import {
  checklistStages,
  describeStep,
  skyCodeCandidates,
  skyIslands,
  skyTestSection,
  skyTestStages,
  stepLinks,
} from "./lib/quest-plan-parse.mjs";

helpIfAsked(import.meta.url);

const EPIC_CLASSES = [
  "Bard", "Cleric", "Druid", "Enchanter", "Magician", "Monk", "Necromancer", "Paladin",
  "Ranger", "Rogue", "Shadow Knight", "Shaman", "Warrior", "Wizard",
];
/** The classes the Plane of Sky page has a tests table for, and the quest page each one transcludes it into. */
const SKY_CLASSES = [
  "Bard", "Beastlord", "Berserker", "Cleric", "Druid", "Enchanter", "Magician", "Monk", "Necromancer",
  "Paladin", "Ranger", "Rogue", "Shadow Knight", "Shaman", "Warrior", "Wizard",
];

const PLANS = [
  ...EPIC_CLASSES.map((cls) => ({ quest: `${cls} Epic Quest`, page: `${cls} Epic Quest`, from: "checklist" })),
  ...SKY_CLASSES.map((cls) => ({ quest: `${cls} Plane of Sky Tests`, page: "Plane of Sky", from: "sky", cls })),
];

const WIKI = "https://eqlwiki.com";
const OUT = path.join(ROOT, "src/shared/quests/quest-plans.generated.ts");
const MAPS = path.join(ROOT, "public/data/maps");
const GAZETTEER = JSON.parse(fs.readFileSync(path.join(ROOT, "src/shared/zones/eql-classic-zone-maps.json"), "utf8"));
const dryRun = flag("dry-run");
const report = flag("report");

/** What a linked page is, by its infobox and categories. */
function pageKind(text) {
  if (/\{\{\s*Itempage\b/i.test(text)) return "item";
  if (/\{\{\s*\w*(?:mob|npc|merchant)\w*page\b/i.test(text)) return "npc";
  if (/\[\[\s*Category\s*:\s*Zones\s*\]\]/i.test(text)) return "zone";
  if (/questTopTable|\[\[\s*Category\s*:\s*Quests\s*\]\]/i.test(text)) return "quest";
  return undefined;
}

/** The era a page is tagged with — `{{Kunark Era}}` → "Kunark", `{{Chardok Revamp Era}}` → "Chardok Revamp". */
function pageEra(text) {
  return /\{\{\s*([\w ]+?)\s+Era\s*\}\}/.exec(text)?.[1];
}

async function main() {
  console.log(`Reading ${PLANS.length} plans…`);
  const sources = await pagesByLink([...new Set(PLANS.map((p) => p.page))]);
  const plane = sources.get("Plane of Sky")?.text ?? "";
  const islands = skyIslands(plane);
  const bossFor = await skyBosses(plane);

  const raw = PLANS.map((p) => {
    const text = sources.get(p.page)?.text;
    if (!text) throw new Error(`eqlwiki has no page "${p.page}"`);
    const stages = p.from === "sky" ? skyTestStages(skyTestSection(text, p.cls), islands, bossFor) : checklistStages(text, p.quest);
    if (!stages.length) throw new Error(`"${p.quest}": no stages read from "${p.page}"`);
    return { ...p, era: p.from === "sky" ? pageEra(plane) : pageEra(text), stages };
  });

  const targets = raw.flatMap((p) => p.stages.flatMap((s) => s.steps.flatMap((st) => stepLinks(st.text).map((l) => l.target))));
  console.log(`  fetching ${new Set(targets).size} linked pages…`);
  const linked = await pagesByLink(targets);
  const kindOf = (target) => {
    const page = linked.get(target);
    return page ? pageKind(page.text) : undefined;
  };

  const people = {};
  const plans = raw.map((p) => ({
    quest: p.quest,
    page: p.from === "sky" ? `${p.cls} Plane of Sky Tests` : p.page,
    ...(p.era ? { era: p.era } : {}),
    stages: p.stages.map((s) => ({
      title: s.title,
      ...(s.trigger ? { trigger: s.trigger } : {}),
      steps: s.steps.map((st) => {
        const facts = describeStep(st.text, kindOf);
        if (facts.who && !people[facts.who]) {
          const page = linked.get(facts.who);
          const place = page && npcPlace(page.text);
          const zone = !place && page ? npcZone(page.text) : undefined;
          people[facts.who] = { name: page?.title ?? facts.who, ...(place ?? (zone ? { zone } : {})) };
        }
        return { depth: st.depth, ...facts, ...(st.area ? { area: st.area } : {}) };
      }),
    })),
  }));

  // Someone whose page states no spot, placed by their zone's own map label instead (the Plane of Sky's
  // island bosses, for one). Only a single, unambiguous zone, and only a label that is their name.
  let labelled = 0;
  for (const person of Object.values(people)) {
    if (person.loc || !person.zone || /[/,;]/.test(person.zone)) continue;
    const labels = mapNamesFor(person.zone, GAZETTEER).flatMap((m) => mapLabels(MAPS, m));
    const loc = labelPlace(labels, person.name);
    if (!loc) continue;
    person.loc = loc;
    person.note = [person.note, "Placed by the zone map's own label; the wiki states no spot."].filter(Boolean).join(" ");
    labelled++;
  }
  console.log(`  ${labelled} people placed by a map label`);

  // The era each zone's own page is tagged with — what tells "Burning Woods" (a Kunark zone this
  // server's gazetteer doesn't carry) from a classic zone the map simply spells differently.
  const zoneNames = new Set();
  for (const p of plans) for (const s of p.stages) for (const st of s.steps) if (st.zone) zoneNames.add(st.zone);
  for (const person of Object.values(people)) for (const z of (person.zone ?? "").split(/\s*(?:\/|,|;)\s*/)) if (z) zoneNames.add(z);
  const zonePages = await pagesByLink([...zoneNames]);
  const zoneEras = {};
  for (const [name, page] of zonePages) {
    const era = pageKind(page.text) === "zone" ? pageEra(page.text) : undefined;
    if (era) zoneEras[name] = era;
  }

  for (const p of plans) {
    const steps = p.stages.flatMap((s) => s.steps);
    const unplaced = steps.filter((st) => !st.zone && !st.loc && !(st.who && people[st.who]?.zone)).length;
    console.log(`  ${p.quest}: ${p.stages.length} stages, ${steps.length} steps, ${unplaced} with no place`);
    if (report) {
      for (const s of p.stages) {
        console.log(`    ## ${s.title}`);
        for (const st of s.steps) {
          const where = [st.zone ?? (st.who && people[st.who]?.zone), st.area, st.loc && `${st.loc.y}, ${st.loc.x}`].filter(Boolean).join(" · ");
          console.log(`      [${st.kind}] ${st.gives.length ? `gives ${st.gives.join(", ")} ` : ""}${st.gets.length ? `gets ${st.gets.join(", ")} ` : ""}${st.who ? `· ${st.who} ` : ""}${where ? `@ ${where}` : ""}`);
        }
      }
    }
  }
  if (report) return;

  const scrapedAt = new Date().toISOString();
  const body = `/**
 * Long, multi-zone quests as plans — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/fetch-quest-plans.mjs\` (scraped ${scrapedAt}). Read it through
 * \`quest-plans.ts\`, which owns progress, places and era — see
 * [ADR 0300](../../../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md).
 *
 * ${plans.length} plans, ${plans.reduce((n, p) => n + p.stages.reduce((k, s) => k + s.steps.length, 0), 0)} steps, ${Object.keys(people).length} people.
 */

/** What a step has you do — read off its verb ("Loot", "Give", "Tell", …). */
export type PlanStepKind = "give" | "loot" | "kill" | "talk" | "buy" | "combine" | "ground" | "get" | "quest" | "other";

export interface PlanStep {
  /** How deep the wiki nests it — a sub-step of the one before it is deeper. */
  depth: number;
  kind: PlanStepKind;
  /** The step as the wiki words it, as plain text. */
  text: string;
  /** Items handed in. */
  gives: string[];
  /** Items this step gets you — what the list tracks. */
  gets: string[];
  /** The NPC or mob it's with, by wiki title — placed in \`QUEST_PLAN_PEOPLE\`. */
  who?: string;
  /** The zone, as linked or stated. Falls back to \`who\`'s zone when absent. */
  zone?: string;
  /** Part of the zone — a Plane of Sky island. */
  area?: string;
  /** Where, when the step states it. */
  loc?: { y: number; x: number; z?: number };
  /** Other quests it sends you to. */
  quests?: string[];
}

export interface PlanStage {
  title: string;
  /** What to say to start it, where the wiki gives one (the Plane of Sky tests). */
  trigger?: string;
  steps: PlanStep[];
}

export interface QuestPlan {
  quest: string;
  /** The wiki page the plan is read from — its "open on eqlwiki". */
  page: string;
  /** The era the wiki tags the quest with ("Classic", "Epics", "Kunark"). */
  era?: string;
  stages: PlanStage[];
}

/** Someone a plan step is with, and where their own page says they stand. */
export interface PlanPerson {
  name: string;
  zone?: string;
  loc?: { y: number; x: number; z?: number };
  note?: string;
}

export const QUEST_PLANS_SOURCE = { wiki: ${JSON.stringify(WIKI)}, scrapedAt: ${JSON.stringify(scrapedAt)} };

export const QUEST_PLANS: QuestPlan[] = ${JSON.stringify(plans, null, 2)};

export const QUEST_PLAN_PEOPLE: Record<string, PlanPerson> = ${JSON.stringify(people, null, 2)};

/** The era each zone a plan names is tagged with on its own wiki page ("Classic", "Kunark", …). */
export const QUEST_PLAN_ZONE_ERAS: Record<string, string> = ${JSON.stringify(zoneEras, null, 2)};
`;
  writeGenerated(OUT, body, { dryRun });
}

/**
 * `code` → the Plane of Sky boss it abbreviates ("KoS" → "Keeper of Souls"), from the zone page's own
 * links, keeping only candidates whose page is a person — "KoS" also abbreviates "Key of Swords".
 */
async function skyBosses(plane) {
  const codes = [...new Set([...plane.matchAll(/\(\d+(?:\.\d+)?-([^)]+)\)/g)].map((m) => m[1]))];
  const candidates = Object.fromEntries(codes.map((c) => [c, skyCodeCandidates(plane, c)]));
  const pages = await pagesByLink(Object.values(candidates).flat());
  const resolved = {};
  for (const [code, list] of Object.entries(candidates)) {
    const people = list.filter((t) => pages.get(t) && pageKind(pages.get(t).text) === "npc");
    if (people.length === 1) resolved[code] = people[0];
  }
  console.log(`  sky codes: ${Object.entries(resolved).map(([c, b]) => `${c}=${b}`).join(", ")}`);
  return (code) => resolved[code];
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
