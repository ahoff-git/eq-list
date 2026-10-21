/**
 * What one guide step asks you to go and get — the "+ List" button's answer.
 *
 * A guide step names three kinds of thing without saying which is which: the thing you make
 * ("Skull Ale"), what goes into it ("Cyclops Skull + Short Beer + Spices"), and sometimes where to
 * combine it or a zone to farm in. Two readings settle it:
 *
 * - **A table says, in its header.** A "Recipe"/"Item" column is the result; "Combine in", "Era",
 *   "Trivial" and friends are not things to carry; every other column holds ingredients.
 * - **A bullet with bullets under it says by nesting**: "Skull Ale", then "Cyclops Skull + Short
 *   Beer + Spices" beneath it. What the bullet itself links is the result; what's under it is used.
 * - **A lone bullet doesn't, so the pages do**: an item the wiki shows as *crafted* (it has
 *   components) is the result when anything plain stands beside it ("Platinum Bar + Malachite
 *   Result: Platinum Malachite Ring").
 *
 * Either way each link's own page is read, because a zone, an NPC or a quest is never an ingredient.
 * A step that names only results ("Footwarming Boots to 235") asks you to buy what they're made of.
 *
 * Counts are read off the text in front of a link ("Buy 3 File Mold", "2x Spider Silk"), else off a
 * multiplier right after it ("Small Vial x5"), else one. A count is per combine; the list's own runs
 * control multiplies it.
 *
 * **Pick-one ingredients are one need.** "Ruined Bear or Wolf or Cat Pelts" and "(Small) High Quality
 * Wolf Skin, (Medium) … Cat Pelt, (Large) … Bear Skin" ask for any one of them, not all three: the
 * first is the need and the rest ride along as its `alternatives`.
 */
import type { WikiPage } from "../types";
import type { GuideRun } from "./tradeskill-types";
import type { JudgedLine } from "./tradeskill-era";

export interface StepMaterial {
  name: string;
  qty: number;
  /** The count is for the whole step, not per combine — "Buy 3 File Mold, 53 Water Flask". */
  total?: boolean;
  /** Any of these does instead of `name` — "Ruined Bear or Wolf or Cat Pelts". */
  alternatives?: string[];
}

/** A step's links before any page is read. */
export interface StepLinks {
  label: string;
  results: string[];
  candidates: StepMaterial[];
  /** The step's shape already said these are ingredients (a header, or nesting), so a crafted one
   *  among them is a sub-combine to make, not the step's result. */
  sorted: boolean;
}

const RESULT_COLUMN = /^(?:item|recipe|result|arrow|product)s?$/i;
const NOT_CARRIED_COLUMN = /combine|container|era|trivial|range|description|cost|dmg|notes?|use/i;
const LABEL_MAX = 60;

/** "Buy 3 ", "2x ", "(Small) 1 " → the count in front of the link. */
function countBefore(text: string | undefined): number | undefined {
  const m = text ? /(?:^|[\s(])(\d+)\s*x?\s*$/i.exec(text) : null;
  return m && Number(m[1]) > 0 ? Number(m[1]) : undefined;
}

/**
 * " x5", "x 5", " (x5)" → a multiplier written right after the link (Alchemy's "Small Vial x5"). Only
 * with the "x": a bare "(92)" after a name is how the guides write a trivial ("Banded Gorget (92)").
 */
function countAfter(text: string | undefined): number | undefined {
  const m = text ? /^\s*\(?\s*[x×]\s*(\d+)\s*\)?(?![\w.])/i.exec(text) : null;
  return m && Number(m[1]) > 0 ? Number(m[1]) : undefined;
}

/** Between two links, a word saying "either": " or ", ", or ", " / ". */
const EITHER = /^\s*,?\s*(?:or|\/)\s*$/i;
/** A size tag in front of a link — "(Small) ", ", (Medium) 1 " — one of a set of size variants. */
const SIZE_TAG = /\((?:small|medium|large)\)\s*(?:\d+\s*x?\s*)?$/i;

/** "1 [[Pie Tin]] (returned)" — a tool the combine hands back, so not something it uses up. */
const RETURNED = /^\s*\(returned\)/i;

/**
 * "Buy 3 File Mold, 53 Water Flask", "Need to buy 40 Lantern Casing Mold and 40 Bottles" — a shopping
 * trip for the whole step, not one combine's needs.
 */
const BUY_LINE = /^\s*(?:you\s+)?(?:will\s+)?(?:need\s+to\s+)?buy\b/i;

const textAt = (runs: readonly GuideRun[], i: number) => {
  const r = runs[i];
  return typeof r === "string" ? r : undefined;
};

function linksOf(runs: readonly GuideRun[]): StepMaterial[] {
  const out: StepMaterial[] = [];
  const total = typeof runs[0] === "string" && BUY_LINE.test(runs[0]);
  let previous: { at: number; sized: boolean } | undefined;
  runs.forEach((r, i) => {
    const before = textAt(runs, i - 1);
    const after = textAt(runs, i + 1);
    if (typeof r !== "object" || !("link" in r) || (after !== undefined && RETURNED.test(after))) return;
    const sized = before !== undefined && SIZE_TAG.test(before);
    // Only "or" (or the next size tag) between this link and the last one: the same choice, not a new need.
    const choice = previous?.at === i - 2 ? out[out.length - 1] : undefined;
    if (choice && ((before !== undefined && EITHER.test(before)) || (sized && previous?.sized))) {
      choice.alternatives = [...(choice.alternatives ?? []), r.link];
    } else {
      const qty = countBefore(before) ?? countAfter(after) ?? 1;
      out.push(total ? { name: r.link, qty, total: true } : { name: r.link, qty });
    }
    previous = { at: i, sized };
  });
  return out;
}

/** A material's name and every alternative to it. */
const namesOf = (m: StepMaterial) => [m.name, ...(m.alternatives ?? [])];

const plainText = (runs: readonly GuideRun[]) =>
  runs.map((r) => (typeof r === "string" ? r : "text" in r ? r.text : "")).join("").replace(/\s+/g, " ").trim();

function shorten(text: string): string {
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trimEnd()}…` : text;
}

/** A bullet and everything nested under it. */
export function lineLinks(line: JudgedLine): StepLinks {
  const label = shorten(plainText(line.runs));
  const own = linksOf(line.runs);
  const under: StepMaterial[] = [];
  const walk = (l: JudgedLine) => {
    under.push(...linksOf(l.runs));
    l.children?.forEach(walk);
  };
  line.children?.forEach(walk);
  const made = line.makes ?? [];
  // A step the generator found a recipe for has said what it makes, so what it links is all ingredient.
  if (!under.length) return { label: made.length ? shorten(made.join(" / ")) : label, results: made, candidates: own, sorted: made.length > 0 };
  return { label, results: own.flatMap(namesOf), candidates: under, sorted: true };
}

/** A table row, read by its header. */
export function rowLinks(header: readonly string[], cells: readonly GuideRun[][], makes: readonly string[] = []): StepLinks {
  const results: string[] = [...makes];
  const candidates: StepMaterial[] = [];
  let label = makes.join(" / ");
  cells.forEach((cell, i) => {
    const h = header[i]?.trim() ?? "";
    const links = linksOf(cell);
    if (RESULT_COLUMN.test(h)) {
      results.push(...links.flatMap(namesOf));
      label ||= plainText(cell);
    } else if (!NOT_CARRIED_COLUMN.test(h)) candidates.push(...links);
  });
  return { label: shorten(label || plainText(cells.find((c) => linksOf(c).length) ?? cells[0] ?? [])), results, candidates, sorted: true };
}

const isThing = (p: WikiPage) => p.kind === "item" || p.kind === "recipe";
const isCrafted = (p: WikiPage | null | undefined) => !!p && p.components.length > 0;

/** Same name twice (a guide repeats itself, the wiki lists an ingredient twice) is one line, the larger count. */
function merged(list: StepMaterial[]): StepMaterial[] {
  const by = new Map<string, StepMaterial>();
  for (const m of list) {
    const seen = by.get(m.name);
    if (seen && m.qty <= seen.qty) continue;
    const one: StepMaterial = m.total ? { name: m.name, qty: m.qty, total: true } : { name: m.name, qty: m.qty };
    if (m.alternatives?.length) one.alternatives = [...m.alternatives];
    by.set(m.name, one);
  }
  return [...by.values()];
}

/** A pick-one material cut down to the names `keep` allows, the first left standing as the need. */
function narrowed(m: StepMaterial, keep: (name: string) => boolean): StepMaterial[] {
  const [name, ...alternatives] = namesOf(m).filter(keep);
  if (!name) return [];
  const one: StepMaterial = { ...m, name };
  if (alternatives.length) one.alternatives = alternatives;
  else delete one.alternatives;
  return [one];
}

/**
 * The materials, once every linked page has been read. `pages` maps a title to its page, `null` when
 * it couldn't be read.
 *
 * Every link in a guide is to a page that exists — the parser drops the wiki's red links — so `null`
 * means "couldn't read it just now" (offline, or a web snapshot that never held it), not "no such
 * page", and an unread name is left off: it is as likely an NPC ("an undead cyclops") as an
 * ingredient. Unless *nothing* could be read — then the guide's own words are all there is to go on,
 * and every candidate stays.
 */
export function stepMaterials(step: StepLinks, pages: ReadonlyMap<string, WikiPage | null>): StepMaterial[] {
  return stepMaterialsFor(step, pages).materials;
}

/** A step's materials, and — when they're one of several alternatives' — whose they are. */
export interface StepMaterialsFor {
  materials: StepMaterial[];
  /** The result the materials are for, when the step names several to choose from. */
  forResult?: string;
  /** How many it names. */
  options?: number;
}

/** `stepMaterials`, also saying whose materials they are when the step offers alternatives. */
export function stepMaterialsFor(step: StepLinks, pages: ReadonlyMap<string, WikiPage | null>): StepMaterialsFor {
  const results = new Set(step.results);
  const blind = ![...pages.values()].some(Boolean);
  const keep = (name: string) => {
    const p = pages.get(name);
    return p ? isThing(p) : blind;
  };
  const things = step.candidates.flatMap((c) => narrowed(c, (name) => !results.has(name) && keep(name)));
  const plain = step.sorted ? things : things.flatMap((c) => narrowed(c, (name) => !isCrafted(pages.get(name))));
  if (plain.length) return { materials: merged(plain) };
  return madeOf(step, things, pages);
}

/**
 * Only results named: buy what they're made of. Several named are alternatives — "69 to 90: Banded
 * Belt, Banded Boots, … Banded Mask" means make any of them, and each combine makes one — so the
 * materials are the first one's, never the six recipes' molds added together.
 */
function madeOf(step: StepLinks, things: StepMaterial[], pages: ReadonlyMap<string, WikiPage | null>): StepMaterialsFor {
  const options = [...new Set([...step.results, ...things.flatMap(namesOf)])].filter((t) => isCrafted(pages.get(t)));
  const first = options.length ? pages.get(options[0]) : undefined;
  if (!first) return { materials: [] };
  const materials = merged(first.components.map((c) => ({ name: c.name, qty: c.qty })));
  return options.length > 1 ? { materials, forResult: options[0], options: options.length } : { materials };
}

/** Every title a step could need a page for. */
export function stepTitles(step: StepLinks): string[] {
  return [...new Set([...step.results, ...step.candidates.flatMap(namesOf)])];
}
