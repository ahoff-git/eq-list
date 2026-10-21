/**
 * step-needs.ts — what a race-unlock step asks you to hand over, and how much of it you hold.
 *
 * The guide's steps are prose ([ADR 0222](../../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md)),
 * but two shapes in it name a quantity, and those are the ones worth crossing with your inventory
 * dump (ADR 0322):
 *
 * - **An item, counted**: "Give 800 [[Phosphorous Powder]] to [[Zok Zribb]]" — a number directly
 *   before a link.
 * - **A quest, repeated**: "Do [[Tumpy Tonics]] 400 times" — the step's first link, and "N times"
 *   after it. Its materials are the quest page's own turn-ins, times the runs; the page decides
 *   whether the link was a quest at all, so a step whose first link is a zone or an NPC adds nothing.
 *
 * Anything else ("Kill 400 Kobolds", "Trade [[Metal Bits]] … until amiable") names no count of a
 * thing you could hold, and gets no line.
 *
 * Pure: step text, a page and holdings in, needs out.
 */
import { wikiLinksIn } from "./race-unlocks";
import { heldOf, type Holdings } from "../tradeskills/held-materials";
import type { WikiPage } from "../types";

export type StepNeed =
  | { kind: "item"; item: string; qty: number }
  /** `partial` when the guide means only part of the quest ("the first step of …") — the wiki's
   *  turn-ins are the whole quest's, so the totals overstate it and the view says so. */
  | { kind: "quest"; quest: string; runs: number; partial: boolean };

const COUNT_BEFORE = /(\d[\d,]*)\s*$/;
const TIMES = /\b(\d[\d,]*)\s+times\b/i;
const PART_OF = /\bfirst (step|part)\b/i;

const toCount = (s: string) => Number(s.replace(/,/g, ""));

/** The counted thing a step names, or `undefined` when it names none. */
export function stepNeed(raw: string): StepNeed | undefined {
  const segments = wikiLinksIn(raw);
  for (let i = 1; i < segments.length; i++) {
    const before = segments[i - 1].text;
    const link = segments[i].link;
    const m = before?.match(COUNT_BEFORE);
    if (link && m) return { kind: "item", item: link.title, qty: toCount(m[1]) };
  }
  const first = segments.findIndex((s) => s.link);
  if (first < 0) return undefined;
  const after = segments.slice(first + 1).map((s) => s.text ?? s.link?.display ?? "").join("");
  const times = after.match(TIMES);
  if (!times) return undefined;
  return { kind: "quest", quest: segments[first].link!.title, runs: toCount(times[1]), partial: PART_OF.test(raw) };
}

/** One material a step needs, against what you and sharing peers hold. */
export interface StepMaterial {
  name: string;
  wikiPath?: string;
  qty: number;
  mine: number;
  peers: { by: string; count: number }[];
}

/**
 * The materials a step needs in all. A quest step needs its page — `null` until it's read, and empty
 * if the page isn't a quest or recipe, or lists no turn-ins.
 */
export function stepMaterials(need: StepNeed, page: WikiPage | null, holdings: Holdings | null): StepMaterial[] {
  const wanted =
    need.kind === "item"
      ? [{ name: need.item, qty: need.qty }]
      : page && (page.kind === "quest" || page.kind === "recipe")
        ? page.components.map((c) => ({ name: c.name, wikiPath: c.wikiPath, qty: c.qty * need.runs }))
        : [];
  return wanted.map((w) => {
    const held = holdings ? heldOf(holdings, w.name) : undefined;
    return { ...w, mine: held?.mine ?? 0, peers: held?.peers ?? [] };
  });
}

/** Whether what you hold already covers every material — nothing left to put on the list. */
export const stepCovered = (materials: readonly StepMaterial[]): boolean =>
  materials.length > 0 && materials.every((m) => m.mine >= m.qty);
