/**
 * Quest plans — long, multi-zone quests (the class epics, the Plane of Sky tests) as stages of steps.
 *
 * The plans are generated (`quest-plans.generated.ts`, read off eqlwiki); this is what the app does
 * with one ([ADR 0300](../../../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md)):
 *
 *   - **Progress comes from the shopping list.** Every item a step gets you is one list entry under the
 *     quest; a step is done when everything it gets is obtained. No store of its own, so a loot line
 *     that ticks the entry ticks the step, and the list and the plan can't disagree.
 *   - **Every step has a place**, resolved here: the zone it names, else the zone its NPC or mob
 *     stands in; the spot it states, else that person's own spot (only when it's in the same zone).
 *   - **Era is asked, not stored.** A step in a zone this server hasn't opened is marked, through the
 *     same `zoneUnavailable` every other era flag uses, so a plan fills in as eras open.
 *
 * Pure and DOM-free — tested in `electron/tests/quest-plans.test.ts`.
 */
import type { WikiPage } from "../types";
import { mobKey } from "../mob/mob-stats";
import { zoneUnavailable, type ZoneUnavailable } from "../zones/expansions";
import { CURATED_ZONES, ZONE_NAME_PAIRS } from "../zones/gazetteer";
import { isKnownPlace, placeName, samePlace } from "../zones/place";
import {
  QUEST_PLAN_PEOPLE,
  QUEST_PLAN_ZONE_ERAS,
  QUEST_PLANS,
  QUEST_PLANS_SOURCE,
  type PlanPerson,
  type PlanStage,
  type PlanStep,
  type PlanStepKind,
  type QuestPlan,
} from "./quest-plans.generated";

export { QUEST_PLANS };
export type { PlanPerson, PlanStage, PlanStep, PlanStepKind, QuestPlan };

const BY_QUEST = new Map(QUEST_PLANS.map((p) => [p.quest.toLowerCase(), p]));

/** The plan for a quest, by its title, or `undefined` for a quest without one. */
export function planFor(quest: string | null | undefined): QuestPlan | undefined {
  return quest ? BY_QUEST.get(quest.trim().toLowerCase()) : undefined;
}

/** Every item any step gets you, once each, in the order the plan reaches them — what the list tracks. */
export function planItems(plan: QuestPlan): string[] {
  return [...new Set(plan.stages.flatMap((s) => s.steps.flatMap((st) => st.gets)))];
}

/** Has the list got this item for this quest? Built once per render from the list's own entries. */
export type HasItem = (item: string) => boolean;

/** A step's progress: `done` when it gets things and you have them all; `info` when it gets nothing. */
export type StepStatus = "done" | "todo" | "info";

export function stepStatus(step: PlanStep, has: HasItem): StepStatus {
  if (!step.gets.length) return "info";
  return step.gets.every(has) ? "done" : "todo";
}

/** How many of a stage's (or plan's) item-getting steps are done. Info-only steps don't count either way. */
export function progressOf(steps: readonly PlanStep[], has: HasItem): { done: number; total: number } {
  const counted = steps.filter((s) => s.gets.length);
  return { done: counted.filter((s) => stepStatus(s, has) === "done").length, total: counted.length };
}

/** A stage is current while anything it gets is still missing; the plan's current stage is the first such. */
export function currentStage(plan: QuestPlan, has: HasItem): PlanStage | undefined {
  return plan.stages.find((s) => s.steps.some((st) => stepStatus(st, has) === "todo"));
}

/** Where a step happens, resolved. */
export interface StepPlace {
  /** As the wiki names it — for display, and the map's own matching. */
  zone?: string;
  area?: string;
  loc?: { y: number; x: number; z?: number };
  /** The NPC or mob the step is with, with their own page's facts. */
  who?: PlanPerson;
  /** The map can open this zone. */
  mapped: boolean;
  /** Why you can't go there yet, if you can't: an expansion this server lacks, or one not open. */
  shut?: ZoneUnavailable;
  /** Read from the step before it — "Receive the Jeweled Dragon Head Hilt" happens where the hand-in did. */
  inherited?: boolean;
  /** For a step with no place: why not, so "nowhere" is a statement rather than a gap. */
  why?: NoPlaceReason;
}

/**
 * Why a step names no place. Most are steps that have none: a purchase from any vendor, a combine you do
 * where you stand, foraging, a spell you cast where you are, a line whose sub-steps carry the places, a pointer to another quest, or a
 * note between steps. `unstated` is what's left: a step that should say where and doesn't.
 */
export type NoPlaceReason = "vendor" | "combine" | "forage" | "spell" | "sub-steps" | "quest" | "note" | "various" | "unstated";

/**
 * The one zone a person's page means for this step. A page can name several ("Lake Rathetear /
 * Timorous Deep" — Natasha appears in both, at different points of the epic); the step's own
 * sentence usually says which, and failing that the first is where they're met first.
 */
function personZones(who: PlanPerson | undefined): string[] {
  return who?.zone?.split(/\s*(?:\/|,|;|\bor\b)\s*/i).filter(Boolean) ?? [];
}

function personZone(who: PlanPerson | undefined, text: string): string | undefined {
  const zones = personZones(who);
  const said = text.toLowerCase();
  return zones.find((z) => said.includes(z.toLowerCase())) ?? zones[0];
}

/** Every zone the map knows, longest name first, so "East Freeport" is found before "Freeport". */
const MAPPED_NAMES = [
  ...new Set([...CURATED_ZONES.map((z) => z.name), ...ZONE_NAME_PAIRS.flatMap((p) => [p.alias, p.canonical])]),
]
  // Aliases too ("North Kaladim" is one), but only real words: "Kaladim A" is a file's name, not prose.
  .filter((name) => name.length >= 5 && !/\s[A-Z]$/.test(name) && isKnownPlace(name))
  .sort((a, b) => b.length - a.length);

/**
 * A zone the map knows, named in the step's own sentence: Kargek's page says only "Freeport", but the
 * step says "Hail Kargek Redblade … in East Freeport".
 */
function zoneSaid(text: string): string | undefined {
  return firstSaid(text, MAPPED_NAMES);
}

/** Every zone a plan's pages name, mapped or not — so an unlinked "in City of Mist" still finds its era. */
const PAGE_ZONE_NAMES = Object.keys(QUEST_PLAN_ZONE_ERAS).sort((a, b) => b.length - a.length);

/**
 * Everyone a plan places, longest name first — for a step that names someone in plain words, without a
 * link: "Give the Head to Kazen Fecae", where Kazen is linked (and placed) in another step. Short names
 * are left out, since "Serra" or "Jark" are as likely to be ordinary words in someone else's sentence.
 */
const PEOPLE_NAMES = Object.keys(QUEST_PLAN_PEOPLE)
  .filter((name) => name.length >= 8 && QUEST_PLAN_PEOPLE[name].zone)
  .sort((a, b) => b.length - a.length);

/** The first of `names` the text says as whole words, case-insensitively. */
function firstSaid(text: string, names: readonly string[]): string | undefined {
  const said = ` ${text.toLowerCase()} `;
  return names.find((name) => new RegExp(`[^a-z]${escapeRe(name.toLowerCase())}[^a-z]`).test(said));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Out of era by the zone's own wiki page, for a zone the map doesn't know at all. The gazetteer holds
 * every zone this server runs, so a zone missing from it whose page is tagged with a later era
 * ("Burning Woods": Kunark) is one you can't go to yet. `zoneUnavailable` can't say so for a spelling
 * its table doesn't carry, and fails open.
 */
function eraShut(zone: string): ZoneUnavailable | undefined {
  const era = QUEST_PLAN_ZONE_ERAS[zone];
  return era && era !== "Classic" && !isKnownPlace(zone) ? "out-of-era" : undefined;
}

/**
 * The zone a step happens in, best answer first: the one it links or its person's, when the map knows
 * it; else a mapped zone its sentence names ("in East Freeport"); else its person's own zone when that
 * one is mapped (the step linked a city of several districts, "Felwithe"); else any zone page it names
 * (so an unmapped Kunark zone still says its era); else whatever it linked.
 */
function stepZone(step: PlanStep, who: PlanPerson | undefined): string | undefined {
  const named = step.zone ?? personZone(who, step.text);
  if (named && isKnownPlace(named)) return named;
  const theirs = personZone(who, step.text);
  return (
    zoneSaid(step.text) ??
    (theirs && isKnownPlace(theirs) ? theirs : undefined) ??
    firstSaid(step.text, PAGE_ZONE_NAMES) ??
    named
  );
}

export function stepPlace(step: PlanStep, closed?: ReadonlySet<string>): StepPlace {
  // Linked, or failing that a placed person the sentence names in plain words.
  const said = step.who ? undefined : firstSaid(step.text, PEOPLE_NAMES);
  const who = step.who ? QUEST_PLAN_PEOPLE[step.who] : said ? QUEST_PLAN_PEOPLE[said] : undefined;
  const zone = stepZone(step, who);
  // Their own spot only places the step when they stand in one zone and it's this one: a page naming
  // two zones gives one spot, and nothing says which zone it's in.
  const own = personZones(who);
  const theirs = who?.loc && own.length === 1 && (!zone || samePlace(zone, own[0])) ? who.loc : undefined;
  const loc = step.loc ?? theirs;
  return {
    ...(zone ? { zone } : {}),
    ...(step.area ? { area: step.area } : {}),
    ...(loc ? { loc } : {}),
    ...(who ? { who } : {}),
    mapped: !!zone && isKnownPlace(zone),
    ...(zone && (zoneUnavailable(zone, closed) ?? eraShut(zone)) ? { shut: zoneUnavailable(zone, closed) ?? eraShut(zone) } : {}),
  };
}

/** "Receive …", "Return …", "1. Give him …": a step that carries on where the one before it happened. */
const CONTINUES = /^(?:\d+\.\s*)?(?:receive|recieve|return|hand\b|take\b|then\b|(?:give|tell|talk to|hail) (?:him|her|it)\b)/i;
const NOTE = /^(?:save |note|super |lots of |\(optional\)\s*acquire level)|\bimportant\b/i;
const QUEST_POINTER = /\b(?:via quests?|sub-quest|quest for|complete quest|do the .* quest)\b/i;

/**
 * Every step of a stage placed, reading each in the company of the steps around it — what a single
 * step can't know on its own:
 *
 *   - **a continuation** ("Receive the Jeweled Dragon Head Hilt", "1. Give him Cazic's Skin") happens
 *     where the step before it did;
 *   - **someone named by first name** ("Return Translated Parchment to Stanos") is the one person of that
 *     first name this plan places elsewhere;
 *   - **a step with no place says why** — a vendor, a combine, foraging, its sub-steps, another quest, a
 *     note — and only a step that should name somewhere and doesn't is `unstated`.
 */
export function stagePlaces(stage: PlanStage, closed?: ReadonlySet<string>, plan?: QuestPlan): StepPlace[] {
  const firstNames = plan ? planFirstNames(plan) : new Map<string, string>();
  const out: StepPlace[] = [];
  stage.steps.forEach((step, i) => {
    let place = stepPlace(step, closed);
    if (!place.zone && !step.who) {
      const first = [...firstNames.keys()].find((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(step.text));
      if (first) place = stepPlace({ ...step, who: firstNames.get(first) }, closed);
    }
    const before = out[i - 1];
    if (!place.zone && before?.zone && CONTINUES.test(step.text) && !QUEST_POINTER.test(step.text))
      place = { ...before, inherited: true, why: undefined };
    if (!place.zone || /^various/i.test(place.zone)) place = { ...place, why: noPlaceReason(stage, i) };
    out.push(place);
  });
  return out;
}

function noPlaceReason(stage: PlanStage, i: number): NoPlaceReason {
  const step = stage.steps[i];
  const next = stage.steps[i + 1];
  if (step.zone && /^various/i.test(step.zone)) return "various";
  if (next && next.depth > step.depth) return "sub-steps";
  if (step.kind === "buy") return "vendor";
  if (step.kind === "combine") return "combine";
  if (/\bforag/i.test(step.text)) return "forage";
  if (/^(?:create|scribe|summon|cast)\b/i.test(step.text)) return "spell";
  if (step.kind === "quest" || QUEST_POINTER.test(step.text)) return "quest";
  if (NOTE.test(step.text)) return "note";
  return "unstated";
}

/** A plan's people by first name, where that first name is theirs alone in the plan: "Stanos" → Stanos Herkanor. */
function planFirstNames(plan: QuestPlan): Map<string, string> {
  const count = new Map<string, string[]>();
  for (const s of plan.stages)
    for (const st of s.steps) {
      if (!st.who || !QUEST_PLAN_PEOPLE[st.who]?.zone) continue;
      const first = st.who.split(/\s+/)[0];
      if (first.length < 4 || /^(?:an?|the)$/i.test(first)) continue;
      const list = count.get(first) ?? [];
      if (!list.includes(st.who)) list.push(st.who);
      count.set(first, list);
    }
  return new Map([...count].filter(([, who]) => who.length === 1).map(([first, who]) => [first, who[0]]));
}

/** One zone's (or one island's) share of a plan: every step there, with the stage it belongs to. */
export interface PlanZone {
  /** The place, named the way the rest of the app names it ("" for steps that name nowhere). */
  zone: string;
  /** Part of the zone, where the plan splits it — a Plane of Sky island. */
  area?: string;
  /** For the steps that name no zone: why not — one group per reason. */
  why?: NoPlaceReason;
  steps: { stage: PlanStage; step: PlanStep; place: StepPlace }[];
}

/**
 * The plan regrouped by where you'd be standing — what a long, many-zone quest needs when you are
 * already somewhere: "while I'm in Lake Rathetear, what else is there?" Zones in the order the plan
 * first sends you to them; steps that name no place last. A zone the plan splits into areas (the
 * Plane of Sky's islands) groups by area too, since that's where you'd be standing.
 */
export function planByZone(plan: QuestPlan, closed?: ReadonlySet<string>): PlanZone[] {
  const out = new Map<string, PlanZone>();
  for (const stage of plan.stages) {
    const places = stagePlaces(stage, closed, plan);
    stage.steps.forEach((step, i) => {
      const place = places[i];
      // "Various" is a zone in name only; it groups with the other steps that name nowhere, by reason.
      const zone = place.zone && !place.why ? placeName(place.zone) : "";
      const key = `${zone}|${place.area ?? ""}|${zone ? "" : place.why}`.toLowerCase();
      if (!out.has(key)) out.set(key, { zone, ...(place.area ? { area: place.area } : {}), ...(zone ? {} : { why: place.why }), steps: [] });
      out.get(key)!.steps.push({ stage, step, place });
    });
  }
  const zones = [...out.values()];
  return [...zones.filter((z) => z.zone), ...zones.filter((z) => !z.zone)];
}

/** A map stop for a plan — one per person (or stated spot) per zone, carrying every step still to do there. */
export interface PlanPin {
  id: string;
  y: number;
  x: number;
  title: string;
  about: string;
  note: string;
}

/**
 * The stops the quests on your list still send you to, in the zone on screen.
 *
 * A step is still to do when an item it gets is on the list and not yet obtained (`needed` is exactly
 * that list, scoped to its quest by `origin`). A step that gets nothing — "Hail Kargek", "Kill
 * Shmendrik to spawn the spirit" — is pinned only in the stage you're on, so the map shows the next
 * move rather than every conversation in the epic.
 */
export function planPins(
  needed: readonly { name: string; origin?: { name: string } }[],
  inZone: (zone: string) => boolean,
): PlanPin[] {
  const wanted = new Map<string, Set<string>>();
  for (const e of needed) {
    if (!e.origin) continue;
    const key = e.origin.name.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, new Set());
    wanted.get(key)!.add(e.name.toLowerCase());
  }
  const pins = new Map<string, PlanPin>();
  const stepsAt = new Map<string, string[]>();
  for (const [quest, missing] of wanted) {
    const plan = planFor(quest);
    if (!plan) continue;
    const has: HasItem = (item) => !missing.has(item.toLowerCase());
    const current = currentStage(plan, has);
    for (const stage of plan.stages) {
      const places = stagePlaces(stage, undefined, plan);
      for (const [i, step] of stage.steps.entries()) {
        const status = stepStatus(step, has);
        if (status === "done" || (status === "info" && stage !== current)) continue;
        const place = places[i];
        if (!place.zone || !place.loc || !inZone(place.zone)) continue;
        const name = place.who?.name ?? step.gets[0] ?? stage.title;
        const id = `plan:${plan.quest}:${mobKey(name)}:${Math.round(place.loc.y)},${Math.round(place.loc.x)}`;
        const steps = [...(stepsAt.get(id) ?? []), `${stage.title}: ${step.text}`];
        stepsAt.set(id, steps);
        pins.set(id, {
          id,
          y: place.loc.y,
          x: place.loc.x,
          title: name,
          about: `${name} for ${plan.quest} — ${steps.length} step${steps.length === 1 ? "" : "s"} here`,
          note: [...steps, place.who?.note].filter(Boolean).join(" · "),
        });
      }
    }
  }
  return [...pins.values()];
}

/**
 * A quest page with its plan's items added as turn-ins — the same move `withQuestPickups` makes, so
 * **+ Add** on an epic's page puts every item of the route on the list, under the quest, to tick off.
 * Turn-ins the parser already found are kept and none is added twice.
 *
 * **A page with a plan is a quest**, whatever the parser made of it: a Plane of Sky test page has no
 * quest infobox of its own (its table is transcluded from the zone page), so it parses as an item —
 * and **+ Add** would put "Wizard Plane of Sky Tests" on the list as a thing to loot.
 */
export function withQuestPlan(page: WikiPage | null): WikiPage | null {
  const plan = page ? planFor(page.title) : undefined;
  if (!page || !plan) return page;
  const have = new Set(page.components.map((c) => c.name.toLowerCase()));
  const added = planItems(plan)
    .filter((name) => !have.has(name.toLowerCase()))
    .map((name) => ({ name, qty: 1 }));
  return { ...page, kind: "quest", components: [...page.components, ...added] };
}

/** A plan shaped as the quest page `list.addFromPage` takes, for adding it without its wiki page. */
export function planQuestPage(plan: QuestPlan): WikiPage {
  return {
    kind: "quest",
    title: plan.quest,
    wikiPath: plan.page,
    sources: [],
    components: planItems(plan).map((name) => ({ name, qty: 1 })),
    rewards: [],
    fetchedAt: QUEST_PLANS_SOURCE.scrapedAt,
  };
}
