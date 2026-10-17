/**
 * Which parts of a tradeskill guide the server can't do yet — the tab's one interpretation of the
 * wiki's prose ([ADR 0302](../../../specs/decisions/0302-tradeskill-guides-are-generated-static-data.md)).
 *
 * Three things can put a line out of era, and the guide's own word counts for all of them:
 *
 * - **an era badge the wiki put on the line** (`{{Velious Era Inline}}`, `{{Era Short|Kunark}}`);
 * - **an item the line links whose page is in a shut era's category** (`Dragon Meat`, Velious), or is a
 *   GM-event item ([ADR 0292](../../../specs/decisions/0292-a-gm-event-item-is-never-in-era.md));
 * - **a subsection the guide says is unavailable** ("Velium is not currently available…").
 *
 * Only a step — a bullet or a table row — is judged by the items it links. A paragraph naming an item
 * in passing ("going beyond this needs Jacinth…") isn't a step, so only its own badges count.
 *
 * Kunark and Velious are judged **live**, the way every other era flag in the app is: through
 * `expansionOpen` over the live out-of-era zone list, so an expansion opening needs no regen. Every
 * other era key (Epic Quests, Hole VP, Unknown…) has no zones to read, so it falls back on what
 * `Template:PageEra` said on the day of the scrape — as does everything while the live list is empty,
 * since "the wiki is unreachable" is not the same as "every era opened".
 */
import { isGmEventItem } from "../items/gm-event-items";
import { SERVER_EXPANSIONS, expansionOpen, type ZoneUnavailable } from "../zones/expansions";
import { ITEM_ERAS, OPEN_ERAS_AT_SCRAPE } from "./tradeskills.generated";
import type { GuideBlock, GuideLine, GuideRun, SkillSpan, StepCost, StepNeed, Tradeskill, TradeskillGuide } from "./tradeskill-types";

/** Era keys that are an expansion, judged live. Luclin is here so it reads "not on this server". */
const EXPANSION_OF_ERA: Readonly<Record<string, string>> = {
  kunark: "The Ruins of Kunark",
  velious: "The Scars of Velious",
  luclin: "The Shadows of Luclin",
};

/** Why a line is shut, and the thing that shut it — for the badge's hover. */
export interface EraVerdict {
  why: ZoneUnavailable;
  because: string;
}

/** Is this era key shut? `closed` is the live out-of-era zone set (`useClosedZones`). */
export function eraShut(key: string, closed: ReadonlySet<string>): ZoneUnavailable | undefined {
  if (key === "classic") return undefined;
  const expansion = EXPANSION_OF_ERA[key];
  if (expansion && !SERVER_EXPANSIONS.includes(expansion)) return "future";
  if (expansion && closed.size) return expansionOpen(expansion, closed) ? undefined : "out-of-era";
  return OPEN_ERAS_AT_SCRAPE.includes(key) ? undefined : "out-of-era";
}

/** `epicquests` → `Epic Quests era`, near enough for a hover. */
function eraLabel(key: string): string {
  const named: Record<string, string> = { epicquests: "Epic Quests", epics: "Epics", holevp: "Hole VP", unknown: "Unknown" };
  return `${named[key] ?? key.charAt(0).toUpperCase() + key.slice(1)} era`;
}

/** The first shut era among `keys`, with what to call it. "Not on this server" outranks "not yet". */
function worst(found: { key: string; because: string }[], closed: ReadonlySet<string>): EraVerdict | undefined {
  let out: EraVerdict | undefined;
  for (const { key, because } of found) {
    const why = eraShut(key, closed);
    if (why === "future") return { why, because };
    if (why && !out) out = { why, because };
  }
  return out;
}

/** A line's verdict. `asStep`: also judge it by the items it links. */
export function runsVerdict(runs: readonly GuideRun[], closed: ReadonlySet<string>, asStep: boolean): EraVerdict | undefined {
  const found: { key: string; because: string }[] = [];
  for (const r of runs) {
    if (typeof r === "string") continue;
    if ("era" in r) found.push({ key: r.era, because: `Marked ${eraLabel(r.era)} on the wiki` });
    else if (asStep && isGmEventItem(r.link)) return { why: "out-of-era", because: `${r.link} is a GM-event item` };
    else if (asStep) for (const key of ITEM_ERAS[r.link] ?? []) found.push({ key, because: `${r.link} is ${eraLabel(key)}` });
  }
  return worst(found, closed);
}

/** A whole page's verdict, off its own era categories (the cultural pages are Epic Quests era). */
export function skillVerdict(skill: Tradeskill, closed: ReadonlySet<string>): EraVerdict | undefined {
  return worst(skill.eras.map((key) => ({ key, because: `${skill.title} is ${eraLabel(key)}` })), closed);
}

// ─── A guide, judged ────────────────────────────────────────────────────────────────────────────

/** A bullet with its verdict — and the plan the generator stored on it (span, materials, cost). */
export interface JudgedLine extends Omit<GuideLine, "children"> {
  shut?: EraVerdict;
  children?: JudgedLine[];
}

/** A table row with its verdict, carrying the plan the generator stored for it. */
export interface JudgedRow {
  cells: GuideRun[][];
  makes?: string[];
  skill?: SkillSpan;
  needs?: StepNeed[];
  cost?: StepCost;
  shut?: EraVerdict;
}

export type JudgedBlock =
  | { kind: "heading"; level: number; text: string; anchor: string; shut?: EraVerdict }
  | { kind: "text"; runs: GuideRun[]; strong?: boolean; shut?: EraVerdict }
  | { kind: "list"; items: JudgedLine[] }
  | { kind: "table"; header: string[]; rows: JudgedRow[] };

/** A step's runs plus what it was found to make, as links — so a step making a shut era's item is shut. */
const withMade = (runs: readonly GuideRun[], makes?: readonly string[]): GuideRun[] => [
  ...runs,
  ...(makes ?? []).map((t) => ({ link: t, text: t })),
];

function judgeLine(line: GuideLine, closed: ReadonlySet<string>): JudgedLine {
  const { children, ...own } = line;
  const out: JudgedLine = { ...own, shut: runsVerdict(withMade(line.runs, line.makes), closed, true) };
  if (children) out.children = children.map((c) => judgeLine(c, closed));
  return out;
}

function judgeBlock(b: GuideBlock, closed: ReadonlySet<string>): JudgedBlock {
  switch (b.kind) {
    case "heading": {
      const { unavailable, ...rest } = b;
      return { ...rest, shut: unavailable ? { why: "out-of-era", because: unavailable } : undefined };
    }
    case "text":
      return { ...b, shut: runsVerdict(b.runs, closed, false) };
    case "list":
      return { kind: "list", items: b.items.map((i) => judgeLine(i, closed)) };
    case "table":
      return {
        kind: "table",
        header: b.header,
        rows: b.rows.map((cells, i): JudgedRow => {
          const makes = b.makes?.[i]?.length ? b.makes[i] : undefined;
          const row: JudgedRow = { cells, shut: runsVerdict(withMade(cells.flat(), makes), closed, true) };
          if (makes) row.makes = makes;
          if (b.skill?.[i]) row.skill = b.skill[i]!;
          if (b.needs?.[i]?.length) row.needs = b.needs[i];
          if (b.cost?.[i]) row.cost = b.cost[i]!;
          return row;
        }),
      };
  }
}

/** Every block of a guide with its verdict. A heading's verdict covers what's under it. */
export function judgeGuide(guide: TradeskillGuide, closed: ReadonlySet<string>): JudgedBlock[] {
  return guide.blocks.map((b) => judgeBlock(b, closed));
}

function keptLines(lines: JudgedLine[], hidden: { n: number }): JudgedLine[] {
  const out: JudgedLine[] = [];
  for (const l of lines) {
    if (l.shut) {
      hidden.n++;
      continue;
    }
    out.push(l.children ? { ...l, children: keptLines(l.children, hidden) } : l);
  }
  return out;
}

/**
 * The guide with everything shut taken out, and how many steps went. A shut heading takes its whole
 * subsection with it — down to the next heading as high — and a list or table left empty goes too.
 */
export function withoutShut(blocks: readonly JudgedBlock[]): { blocks: JudgedBlock[]; hidden: number } {
  const hidden = { n: 0 };
  const out: JudgedBlock[] = [];
  let skipBelow: number | undefined;
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (skipBelow !== undefined && b.level > skipBelow) continue;
      skipBelow = undefined;
      if (b.shut) {
        skipBelow = b.level;
        hidden.n++;
        continue;
      }
      out.push(b);
      continue;
    }
    if (skipBelow !== undefined) continue;
    if (b.kind === "text") {
      if (b.shut) hidden.n++;
      else out.push(b);
    } else if (b.kind === "list") {
      const items = keptLines(b.items, hidden);
      if (items.length) out.push({ ...b, items });
    } else {
      const rows = b.rows.filter((r) => (r.shut ? (hidden.n++, false) : true));
      if (rows.length) out.push({ ...b, rows });
    }
  }
  return { blocks: out, hidden: hidden.n };
}

/** The page on eqlwiki, landing on the guide when there is one — for `wiki.openInBrowser`. */
export function guidePath(title: string, anchor?: string): string {
  return `/${title.replace(/ /g, "_")}${anchor ? `#${anchor}` : ""}`;
}
