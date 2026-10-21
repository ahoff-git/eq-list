/**
 * held-materials.ts — what a tradeskill guide asks for, against what you (and the people you've
 * asked) already hold.
 *
 * Two answers. **Per material**: how many you have — from your newest `/outputfile inventory` dump,
 * every bag, bank, depot and hoard slot — and which peers have some, from inventories they've shared
 * with you (the `inventory` share kind, ADR 0309). **Per skill level**: the other guide steps that
 * would skill you up from where you are now, ranked by how far your materials and your sharing peers'
 * would carry them — a gentle "you could use what you've got" rather than a route change.
 *
 * Pure: holdings and guide blocks in, answers out.
 */
import { normalizeItemName } from "../items/grouping";
import { lineLinks, rowLinks } from "./step-materials";
import { withoutShut, type JudgedBlock, type JudgedLine } from "./tradeskill-era";
import type { SkillSpan, StepNeed } from "./tradeskill-types";

/** One material's holdings: yours, and each peer's who has shared their inventory. */
export interface Held {
  mine: number;
  peers: { by: string; count: number }[];
}

export type Holdings = ReadonlyMap<string, Held>;

/** Holdings keyed by item name (grades and case folded), from your totals and peers' shared rows. */
export function holdingsOf(
  mine: readonly { baseName: string; count: number }[],
  peers: readonly { by: string; item: string; count: number }[] = [],
): Map<string, Held> {
  const out = new Map<string, Held>();
  const at = (name: string) => {
    const key = normalizeItemName(name);
    const held = out.get(key) ?? { mine: 0, peers: [] };
    out.set(key, held);
    return held;
  };
  for (const m of mine) at(m.baseName).mine += m.count;
  for (const p of peers) {
    const held = at(p.item);
    const same = held.peers.find((x) => x.by === p.by);
    if (same) same.count += p.count;
    else held.peers.push({ by: p.by, count: p.count });
  }
  for (const held of out.values()) held.peers.sort((a, b) => b.count - a.count);
  return out;
}

export function heldOf(holdings: Holdings, name: string): Held | undefined {
  return holdings.get(normalizeItemName(name));
}

/**
 * What's held toward one need: its material and, for a pick-one need ("Ruined Bear or Wolf or Cat
 * Pelts"), every alternative too — any of them makes the combine.
 */
export function heldForNeed(holdings: Holdings, need: Pick<StepNeed, "name" | "alternatives">): Held | undefined {
  const all = [need.name, ...(need.alternatives ?? [])].flatMap((n) => heldOf(holdings, n) ?? []);
  if (all.length <= 1) return all[0];
  const peers = new Map<string, number>();
  for (const h of all) for (const p of h.peers) peers.set(p.by, (peers.get(p.by) ?? 0) + p.count);
  return {
    mine: all.reduce((sum, h) => sum + h.mine, 0),
    peers: [...peers].map(([by, count]) => ({ by, count })).sort((a, b) => b.count - a.count),
  };
}

/** A guide step with a skill span and known materials — something you repeat to skill up. */
export interface GuideStep {
  guide: string;
  /** The step as the guide reads (`lineLinks`/`rowLinks`' label), so it's recognisable when suggested. */
  label: string;
  span: SkillSpan;
  needs: StepNeed[];
}

/** Every step in these guides that states a span and its materials, skipping ones out of era. */
export function guideSteps(guides: readonly { name: string; blocks: readonly JudgedBlock[] }[]): GuideStep[] {
  const out: GuideStep[] = [];
  for (const g of guides) {
    // A shut heading ("Velium is not currently available") shuts the steps under it without marking
    // them, so the line and row checks below can't see it — `withoutShut` drops the whole subsection.
    for (const block of withoutShut(g.blocks).blocks) {
      if (block.kind === "list") {
        const walk = (line: JudgedLine) => {
          if (line.shut) return;
          if (line.skill && line.needs?.length) out.push({ guide: g.name, label: lineLinks(line).label, span: line.skill, needs: line.needs });
          line.children?.forEach(walk);
        };
        block.items.forEach(walk);
      } else if (block.kind === "table") {
        for (const row of block.rows) {
          if (row.shut || !row.skill || !row.needs?.length) continue;
          out.push({ guide: g.name, label: rowLinks(block.header, row.cells, row.makes).label, span: row.skill, needs: row.needs });
        }
      }
    }
  }
  return out;
}

/** A step you could skill up on now, and how far what you — and your peers — hold would take it. */
export interface Alternative {
  step: GuideStep;
  /** Combines your own materials cover — the scarcest per-combine material decides. */
  combines: number;
  /** Combines with peers' shared holdings added to yours: what the group could cover between you. */
  withPeers: number;
  /** Its materials someone holds: how many are yours, and which peers have some. */
  held: { name: string; mine: number; peers: { by: string; count: number }[] }[];
  /** Its materials nobody you can see holds. */
  missing: string[];
}

/**
 * The steps whose span covers `skill` (a step from 100 to 135 covers 100 up to 134), that use at
 * least one thing you or a sharing peer holds — the most combines the group could cover first, then
 * the most you could do alone, then the most of its list already in hand.
 *
 * Peers' shared bags, banks and vaults count (ADR 0314): a materials list half in your bank and half
 * in a friend's is still a trip to the vendor saved. Both figures are kept so the panel can say whose
 * they'd be. A one-off purchase for the whole step (`total`) is a tool or a mould, not what limits how
 * many times you can combine, so it doesn't decide the count.
 */
export function alternativesAt(steps: readonly GuideStep[], skill: number, holdings: Holdings, limit = 3): Alternative[] {
  const seen = new Set<string>();
  const out: Alternative[] = [];
  const peersOf = (h: Held | undefined) => (h?.peers ?? []).reduce((t, p) => t + p.count, 0);
  for (const step of steps) {
    if (!(step.span.from <= skill && skill < step.span.to)) continue;
    const key = step.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const held = step.needs.flatMap((n) => {
      const h = heldForNeed(holdings, n);
      return h && (h.mine > 0 || h.peers.length) ? [{ name: n.name, mine: h.mine, peers: h.peers }] : [];
    });
    if (!held.length) continue;
    const perCombine = step.needs.filter((n) => !n.total);
    const cover = (count: (h: Held | undefined) => number) =>
      perCombine.length ? Math.min(...perCombine.map((n) => Math.floor(count(heldForNeed(holdings, n)) / Math.max(1, n.qty)))) : 0;
    out.push({
      step,
      combines: cover((h) => h?.mine ?? 0),
      withPeers: cover((h) => (h?.mine ?? 0) + peersOf(h)),
      held,
      missing: step.needs.filter((n) => !held.some((h) => h.name === n.name)).map((n) => n.name),
    });
  }
  const share = (a: Alternative) => a.held.length / a.step.needs.length;
  return out.sort((a, b) => b.withPeers - a.withPeers || b.combines - a.combines || share(b) - share(a)).slice(0, limit);
}
