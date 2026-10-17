/**
 * The shape `scripts/fetch-tradeskills.mjs` writes. A guide is kept as the wiki wrote it — headings,
 * text, lists, tables — because the nine skill pages write their steps nine ways; see the parser's
 * header (`scripts/lib/tradeskills-parse.mjs`).
 */

/** One piece of a line: text, a link to a wiki page, or an era badge the wiki put on the line. */
export type GuideRun = string | { link: string; text: string } | { era: string };

/** A bullet, with whatever the guide nested under it. */
export interface GuideLine {
  runs: GuideRun[];
  children?: GuideLine[];
  /** What the step makes, when the guide named only its ingredients — found by matching them against
   *  the cached recipes (`scripts/lib/tradeskill-results.mjs`). More than one when several match. */
  makes?: string[];
  /** The skill this step takes you across (`step-plan.ts`), when the guide says. */
  skill?: SkillSpan;
  /** What one combine of this step uses (`step-materials.ts`, read against the page cache). */
  needs?: StepNeed[];
  /** When the step offers several things to make ("Banded Belt, Banded Boots, …"), whose materials
   *  `needs` are, and how many it offers. */
  needsFor?: { result: string; options: number };
  /** What one combine costs, settled when the guides are generated (`step-plan.ts`'s `costGuide`). */
  cost?: StepCost;
}

/**
 * One combine's cost in copper, and how it was arrived at — most direct first:
 * - `stated`: the step says so itself ("~32pp per combine");
 * - `recipe`: a skill page prices the whole combine of what the step makes (`source` names the page);
 * - `materials`: every material has a price, summed;
 * - `partial`: only some do — `copper` is a floor, and `unpriced` names the rest.
 */
export interface StepCost {
  copper: number;
  how: "stated" | "recipe" | "materials" | "partial";
  source?: string;
  unpriced?: string[];
}

/** A skill range, `from` up to `to`. */
export interface SkillSpan {
  from: number;
  to: number;
}

/** One material and how many one combine takes. */
export interface StepNeed {
  name: string;
  qty: number;
  /** The count is for the whole step ("Buy 3 File Mold"), not per combine. */
  total?: boolean;
}

/** A vendor price, in copper, and the page the wiki stated it on. */
export interface WikiPrice {
  copper: number;
  source: string;
}

export type GuideBlock =
  /** `level` 1 is the first heading *under* the guide's own. `unavailable` is the guide's own
   *  sentence saying the server can't do this part ("Velium is not currently available…"). */
  | { kind: "heading"; level: number; text: string; anchor: string; unavailable?: string }
  /** `strong`: the wiki set the whole paragraph in bold — a label for what follows ("1 - 202 Skill"). */
  | { kind: "text"; runs: GuideRun[]; strong?: boolean }
  | { kind: "list"; items: GuideLine[] }
  /** `makes`, when present, is one list per row, as on `GuideLine` (empty where nothing matched). */
  | {
      kind: "table";
      header: string[];
      rows: GuideRun[][][];
      makes?: string[][];
      /** Per row, as on `GuideLine`; `null` where a row states no span. */
      skill?: (SkillSpan | null)[];
      needs?: StepNeed[][];
      cost?: (StepCost | null)[];
    };

export interface TradeskillGuide {
  /** The guide's heading on the page ("Recommended Leveling"). */
  name: string;
  /** Its HTML id, so a link can land on it. */
  anchor: string;
  blocks: GuideBlock[];
}

export interface Tradeskill {
  name: string;
  /** The wiki page title. */
  title: string;
  /** `skill`: a tradeskill with a leveling guide. `cultural`: one race's cultural recipes.
   *  `reference`: anything else in the category (gear for tradeskill stats). */
  kind: "skill" | "cultural" | "reference";
  /** The page's own era keys (`Template:PageEra`'s, e.g. `epicquests`). */
  eras: string[];
  guides: TradeskillGuide[];
}
