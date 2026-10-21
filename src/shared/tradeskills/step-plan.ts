/**
 * Each guide step's skill span and what one combine of it uses — worked out once, when the guides are
 * generated (`scripts/fetch-tradeskills.mjs`, through the compiled module), and stored on the step.
 *
 * **The span** is where the step starts and ends, read the way a reader reads the guide:
 *
 * - a step that states both ends says so — "1-83", "69 to 90:", a Range column's "88-108";
 * - a step that states only the end ("Trivial 17", "up to 168:", "Flameless Lantern to 68", a
 *   Trivial column's 46) starts where the step before it ended;
 * - a stage heading with a range ("Silver Jewelry (1-34)") starts its first step at the low end;
 * - "you start at 50" (gnomes and Tinkering) moves the start before any step;
 * - a step that starts one past where the last one ended ("1-83" then "84-150") was written end
 *   included, so the last one is taken to run up to it — no skill point falls between two steps.
 *
 * A step never ends above `SKILL_CAP`: a 302-trivial recipe still stops skilling at the cap.
 *
 * **The materials** are `step-materials.ts`'s answer for the step, read against the page cache the
 * generator holds, so the tab can show them for every step at once without a page read per link. Only
 * a step with a span gets them: a bullet with no skill range ("Go to West Freeport", "Acquire a Pie
 * Tin") is an instruction, not something you repeat until it stops skilling up.
 *
 * **A cost the step states for itself** — "Ornate Chain Bracelet to 122 (~32pp per combine)" — is
 * kept too: it is the most direct figure there is, and outranks anything added up from prices.
 */
import type { WikiPage } from "../types";
import type { GuideBlock, GuideRun, SkillSpan, StepCost, TradeskillGuide, WikiPrice } from "./tradeskill-types";
import { lineLinks, rowLinks, stepMaterialsFor, stepTitles, type StepLinks, type StepMaterial, type StepMaterialsFor } from "./step-materials";
import { parsePriceText } from "./wiki-price";

/** The highest a tradeskill goes in this era. */
export const SKILL_CAP = 300;

export type { SkillSpan };

/**
 * A span opens the step — "1 to 21:", "88-108", "up to 168:", "Trivial 17 -" — or is a name followed
 * by "to N" with no number before it ("Flameless Lantern to 68"). A number further into a sentence is
 * almost always something else: "about 40-55 attempts", "(12-20 stacks)", "levels 15-20".
 */
const BOTH_ENDS = /^\s*(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})(?![\d.])/i;
const END_ONLY = /^\s*(?:trivial|up\s+to)\s*:?\s*(\d{1,3})\b/i;
/** "Stalking Probes to 102" — a Title Case name, then "to N". Prose ("Banded covers you to 115") isn't. */
const NAME_TO = /^\s*((?:[A-Z][\w'`-]*\s+){0,5}[A-Z][\w'`-]*)\s+to\s+(\d{1,3})\b/;

/** The name a "<Name> to N" step opens with, if it does. */
export function nameBeforeTo(text: string): string | undefined {
  return NAME_TO.exec(text)?.[1];
}
/** A stage heading's range sits anywhere in it: "Silver Jewelry (1-34)". */
const HEADING_RANGE = /(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})(?![\d.])/i;
const START_AT = /\bstart(?:s|ing)?\s+(?:at|with)\s+(\d{1,3})\b/i;
/** "(~32pp per combine)", "costs about 7pp per combine" — the price just before "per combine". */
const PER_COMBINE = /([~\d][^()]*?)\s*(?:per|a|each)\s+combine/i;

/** A cost per combine that the step's own words state, in copper. */
export function statedPerCombine(text: string): number | undefined {
  const m = PER_COMBINE.exec(text);
  const copper = m ? parsePriceText(m[1].slice(-24)) : null;
  return copper ?? undefined;
}

const plain = (runs: readonly GuideRun[]) =>
  runs.map((r) => (typeof r === "string" ? r : "text" in r ? r.text : "")).join("").replace(/\s+/g, " ").trim();

/** A span stated in text, given where the guide had got to. */
export function spanIn(text: string, cursor: number): SkillSpan | undefined {
  const both = BOTH_ENDS.exec(text);
  if (both) {
    const from = Number(both[1]);
    const to = Math.min(Number(both[2]), SKILL_CAP);
    if (to > from) return { from, to };
  }
  const end = END_ONLY.exec(text) ?? NAME_TO.exec(text);
  if (end) return { from: cursor, to: Math.min(Number(end[2] ?? end[1]), SKILL_CAP) };
  return undefined;
}

/** A table row's span: its Range column, else its Trivial column, read as text. */
function rowSpan(header: readonly string[], cells: readonly GuideRun[][], cursor: number): SkillSpan | undefined {
  const at = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const range = at(/^range$/i);
  if (range >= 0) {
    const s = spanIn(plain(cells[range] ?? []), cursor);
    if (s) return s;
  }
  const trivial = at(/^triv(?:ial)?$/i);
  if (trivial >= 0) {
    const text = plain(cells[trivial] ?? []);
    const both = spanIn(text, cursor);
    if (both) return both;
    const n = /^\s*(\d{1,3})\b/.exec(text);
    if (n) return { from: cursor, to: Math.min(Number(n[1]), SKILL_CAP) };
  }
  return undefined;
}

/** The page cache, by title — `undefined` for a title it doesn't hold. */
export type PageLookup = { get(title: string): WikiPage | undefined };

/**
 * A step's materials, read against just its own titles: one the cache lacks is `null`, so
 * `stepMaterials`' "nothing could be read" fallback means the same here as it does in the app.
 */
function needsOf(step: StepLinks, pages: PageLookup): StepMaterialsFor {
  return stepMaterialsFor(step, new Map(stepTitles(step).map((t) => [t, pages.get(t) ?? null])));
}

/**
 * A step that names what it makes in plain text rather than as a link — Tinkering's "Stalking Probes
 * to 102" — made into a result when the cache knows the name, or its singular, as something crafted.
 */
function craftedByName(name: string | undefined, pages: PageLookup): string | undefined {
  if (!name) return undefined;
  const forms = [name, name.replace(/es$/, ""), name.replace(/s$/, "")];
  return forms.find((f) => (pages.get(f)?.components.length ?? 0) > 0);
}

/**
 * Write `skill` and `needs` onto every step of a guide. Mutates the guide — the generator's own fresh
 * parse — and returns it. Only a top-level bullet is a step; what's nested under it is part of it.
 */
export function planGuide(guide: TradeskillGuide, pages: PageLookup): TradeskillGuide {
  let cursor = 0;
  // A bold label's range ("1 - 202 Skill" over a one-bullet list) waits for the next step to claim it.
  let labelled: SkillSpan | undefined;
  let last: SkillSpan | undefined;
  const advance = (span: SkillSpan | undefined) => {
    if (!span) return span;
    if (span.to > span.from) {
      // Alchemy's table writes "1-83" then "84-150": skill points you make it *at*, end included, where
      // a span here is where you start and the skill you *reach* (`to` itself is the next step's).
      // Read that way, 83 belonged to no step — so a step starting one past the last one's end means
      // the last one really ran up to it. Spans sharing an end ("15-26" then "26-36") already meet.
      if (last && span.from === last.to + 1) last.to = span.from;
      last = span;
    }
    cursor = Math.max(cursor, span.to);
    return span;
  };
  for (const b of guide.blocks as GuideBlock[]) {
    if (b.kind === "heading") {
      labelled = undefined;
      const both = HEADING_RANGE.exec(b.text);
      if (both && Number(both[2]) > Number(both[1])) cursor = Number(both[1]);
    } else if (b.kind === "text") {
      const text = plain(b.runs);
      const start = START_AT.exec(text);
      if (start) cursor = Number(start[1]);
      if (b.strong) labelled = spanIn(text, cursor);
    } else if (b.kind === "list") {
      for (const line of b.items) {
        const text = plain(line.runs);
        const span = advance(spanIn(text, cursor) ?? labelled);
        labelled = undefined;
        if (!span || span.to <= span.from) continue;
        line.skill = span;
        const named = !line.makes?.length && !lineLinks(line).candidates.length ? craftedByName(nameBeforeTo(text), pages) : undefined;
        if (named) line.makes = [named];
        const { materials, forResult, options } = needsOf(lineLinks(line), pages);
        if (materials.length) line.needs = materials;
        if (forResult && options) line.needsFor = { result: forResult, options };
      }
    } else if (b.kind === "table") {
      const spans = b.rows.map((cells) => {
        const s = advance(rowSpan(b.header, cells, cursor));
        return s && s.to > s.from ? s : null;
      });
      const needs = b.rows.map((cells, i) => (spans[i] ? needsOf(rowLinks(b.header, cells, b.makes?.[i] ?? []), pages).materials : []));
      if (spans.some(Boolean)) b.skill = spans;
      if (needs.some((n) => n.length)) b.needs = needs;
    }
  }
  return guide;
}

// ─── What a combine costs ───────────────────────────────────────────────────────────────────────

/** Material prices and whole-combine costs, by title, as the generator harvested them. */
export interface PriceBook {
  prices: Readonly<Record<string, WikiPrice>>;
  combineCosts: Readonly<Record<string, WikiPrice>>;
}

/**
 * What a step makes, for looking up a whole-combine cost: what the generator found it makes, what its
 * shape says it makes, and — for a lone bullet — anything it links that the wiki shows as crafted.
 */
function resultsOf(step: StepLinks, makes: readonly string[] | undefined, pages: PageLookup): string[] {
  const crafted = step.sorted ? [] : step.candidates.flatMap((c) => [c.name, ...(c.alternatives ?? [])]).filter((t) => (pages.get(t)?.components.length ?? 0) > 0);
  return [...new Set([...(makes ?? []), ...step.results, ...crafted])];
}

/** One step's cost per combine, most direct source first (see `StepCost`). */
export function stepCost(
  text: string,
  results: readonly string[],
  needs: readonly StepMaterial[],
  book: PriceBook,
): StepCost | undefined {
  const stated = statedPerCombine(text);
  if (stated) return { copper: stated, how: "stated" };
  for (const r of results) {
    const whole = book.combineCosts[r];
    if (whole) return { copper: whole.copper, how: "recipe", source: whole.source };
  }
  // A "Buy 3 File Mold" count is the whole step's shopping, not one combine's — it isn't a per-combine cost.
  const each = needs.filter((n) => !n.total);
  if (!each.length) return undefined;
  const unpriced = each.filter((n) => !book.prices[n.name]).map((n) => n.name);
  const copper = each.reduce((sum, n) => sum + (book.prices[n.name]?.copper ?? 0) * n.qty, 0);
  if (!unpriced.length) return { copper, how: "materials" };
  return copper > 0 ? { copper, how: "partial", unpriced } : undefined;
}

/**
 * A pick-one material ("Ruined Bear or Wolf or Cat Pelts") stood for by its cheapest priced choice,
 * the others kept as its alternatives in the guide's order. Unpriced choices only stand in when none
 * is priced, and then the guide's first does.
 */
export function cheapestChoice<T extends StepMaterial>(need: T, prices: PriceBook["prices"]): T {
  if (!need.alternatives?.length) return need;
  const names = [need.name, ...need.alternatives];
  const priced = names.filter((n) => prices[n]);
  if (!priced.length) return need;
  const name = priced.reduce((a, b) => (prices[b].copper < prices[a].copper ? b : a));
  return { ...need, name, alternatives: names.filter((n) => n !== name) };
}

/**
 * Write `cost` onto every step that has a span — a second pass, after `planGuide`, because which
 * materials need a price is what decides which prices the generator goes and reads. It also settles
 * which choice of a pick-one material stands for it, now that there are prices to choose by.
 */
export function costGuide(guide: TradeskillGuide, pages: PageLookup, book: PriceBook): TradeskillGuide {
  const cheapest = (needs: StepMaterial[] | undefined) => needs?.map((n) => cheapestChoice(n, book.prices));
  for (const b of guide.blocks as GuideBlock[]) {
    if (b.kind === "list") {
      for (const line of b.items) {
        if (!line.skill) continue;
        if (line.needs) line.needs = cheapest(line.needs);
        const cost = stepCost(plain(line.runs), resultsOf(lineLinks(line), line.makes, pages), line.needs ?? [], book);
        if (cost) line.cost = cost;
      }
    } else if (b.kind === "table" && b.skill) {
      if (b.needs) b.needs = b.needs.map((n) => cheapest(n) ?? []);
      const costs = b.rows.map((cells, i) => {
        if (!b.skill?.[i]) return null;
        const step = rowLinks(b.header, cells, b.makes?.[i] ?? []);
        return stepCost(cells.map(plain).join(" "), resultsOf(step, b.makes?.[i], pages), b.needs?.[i] ?? [], book) ?? null;
      });
      if (costs.some(Boolean)) b.cost = costs;
    }
  }
  return guide;
}
