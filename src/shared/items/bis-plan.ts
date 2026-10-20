/**
 * bis-plan.ts — the best-in-slot advice, assembled: from what the inventory dump says you hold, the
 * item catalogue, and the Items tab's own criteria and value weights.
 *
 * `bis.ts` picks a loadout and ranks hunt targets; `exaltations.ts` knows the socket rules. This file
 * decides what goes into them:
 *
 * - **Yours** are the dump's wearables (anywhere — bags, bank, depot, hoard, Storage) that one of your
 *   classes can wear, each at its own grade. The criteria's class and race pickers say who you are,
 *   which is the Items tab's own meaning of them: an item is wearable if *any* ticked class can.
 * - **Targets** are the catalogue rows passing the Items tab's whole query (era, level, slot, …) that
 *   you don't already hold, weighed at `+0` and at the grades more copies would buy.
 * - **Merges** are your spare copies — ones the loadout doesn't wear — fed into the copy it does,
 *   suggested when the re-solved loadout comes out ahead.
 * - **Sockets** are the exaltation sockets your loadout's grades open, with stones that fit.
 *
 * Pure. The panel supplies the rows and the dump; nothing here reads a file.
 */
import { gradedValues, bestLoadout, copiesFor, huntSuggestions, mergedGrade, type BisCandidate, type BisLoadout, type BisSuggestion } from "./bis";
import { openSockets, extractableAt, EXALTATION_SOCKETS, socketPlan, type SocketPlan, type Stone } from "./exaltations";
import { eraCorpus } from "./item-era";
import { matchesFacet, matchesItem, scorer, type ItemCriteria, type ItemRow, type StatWeights } from "./item-search";
import { normalizeItemName } from "./grouping";
import { itemBaseName, itemGrade } from "../names";
import { inventoryPlaceText, type InventoryItem } from "../game-export-dumps";
import type { EffectKind } from "./item-stats";

/** Grades a hunt target is weighed at, beyond `+0` — enough to show what farming copies buys. */
const HUNT_GRADES = [1, 2, 3] as const;

const EXALTATION_RE = /\s*\(Exaltation\)$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BisMerge {
  title: string;
  /** The grades of the copies merged: the one kept first, then the spares fed into it. */
  grades: number[];
  /** The kept copy's grade now, and after. */
  from: number;
  to: number;
  /** Exp left over toward the grade after `to` — already worth something (ADR 0312). */
  toExp: number;
  /** What the best loadout gains, re-solved with the merged copy. */
  gain: number;
}

export interface BisHunt extends BisSuggestion {
  row: ItemRow;
  /** What more copies would buy: the gain at each grade, and how many `+0` copies that grade takes. */
  atGrades: { grade: number; copies: number; gain: number }[];
}

export interface BisPlan {
  loadout: BisLoadout;
  /** What the gear you're wearing right now is worth, by the same weights — the "before". */
  wearing: number;
  merges: BisMerge[];
  sockets: SocketPlan[];
  hunt: BisHunt[];
  /** Things you hold that look wearable but have no item page here, so can't be weighed. */
  unweighed: string[];
}

export interface BisInputs {
  rows: readonly ItemRow[];
  inventory: readonly InventoryItem[];
  criteria: ItemCriteria;
  weights: StatWeights;
  closedZones?: ReadonlySet<string>;
}

/** Can one of the player's classes (and races) wear this? Empty pickers mean "anyone". */
function wearable(row: ItemRow, criteria: ItemCriteria): boolean {
  return row.stats.slots.length > 0 && matchesFacet(row, criteria, "class") && matchesFacet(row, criteria, "race");
}

function candidateOf(id: string, row: ItemRow, grade: number, score: ReturnType<typeof scorer>, heldAt?: string, exp = 0): BisCandidate {
  const { value, anyValue } = gradedValues(row.stats, grade, score, exp);
  return {
    id,
    title: row.item.title,
    grade,
    ...(exp > 0 && { exp }),
    slots: row.stats.slots,
    value,
    anyValue,
    lore: row.stats.flags.includes("LORE"),
    twoHanded: /^2H\b/i.test(row.stats.skill ?? ""),
    heldAt,
  };
}

const kindOfSocket = (socket: number): EffectKind | undefined => EXALTATION_SOCKETS.find((s) => s.socket === socket)?.kind;

export function bisPlan({ rows, inventory, criteria, weights, closedZones }: BisInputs): BisPlan {
  const score = scorer(weights);
  const byTitle = new Map(rows.map((r) => [normalizeItemName(r.item.title), r]));
  const rowOf = (name: string) => byTitle.get(normalizeItemName(name));

  // ── Yours ──
  const held: { item: InventoryItem; row: ItemRow; candidate: BisCandidate }[] = [];
  const unweighed = new Set<string>();
  inventory.forEach((item, i) => {
    if (EXALTATION_RE.test(item.name)) return; // a loose stone is an effect, not gear
    const row = rowOf(item.baseName);
    if (!row) {
      if (item.area === "worn") unweighed.add(item.baseName);
      return;
    }
    if (!wearable(row, criteria)) return;
    const grade = itemGrade(item.name) ?? 0;
    held.push({ item, row, candidate: candidateOf(`held:${i}`, row, grade, score, inventoryPlaceText(item)) });
  });
  const loadout = bestLoadout(held.map((h) => h.candidate));
  const inLoadout = new Set(loadout.picks.map((p) => p.item.id));

  // ── What you're wearing now ──
  const wearing = round2(
    held.filter((h) => h.item.area === "worn").reduce((t, h) => t + (h.item.slot === "Any Slot" ? h.candidate.anyValue : h.candidate.value), 0),
  );

  // ── Merges ──
  // Merge your *spare* copies — the ones the loadout doesn't wear — into the best copy it does. The
  // gain is exact: the whole loadout re-solved with the merged copy in place of all of them, since the
  // slots spares were filling get refilled by whatever is next best rather than left empty.
  const copies = new Map<string, typeof held>();
  for (const h of held) copies.set(h.row.item.title, [...(copies.get(h.row.item.title) ?? []), h]);
  const merges: BisMerge[] = [];
  for (const [title, group] of copies) {
    const worn = group.filter((h) => inLoadout.has(h.candidate.id)).sort((a, b) => b.candidate.value - a.candidate.value);
    const spares = group.filter((h) => !inLoadout.has(h.candidate.id));
    const into = worn[0] ?? spares.sort((a, b) => b.candidate.grade - a.candidate.grade)[0];
    const consumed = spares.filter((h) => h !== into);
    if (!into || !consumed.length) continue;
    const grades = [into, ...consumed].map((h) => h.candidate.grade);
    const merged = mergedGrade(grades);
    // Leftover exp toward the next grade already lifts the bigger stats, so a merge that doesn't reach
    // a whole grade can still pay — only one that changes nothing at all is skipped.
    if (merged.grade <= into.candidate.grade && merged.exp === 0) continue;
    const gone = new Set([into, ...consumed].map((h) => h.candidate.id));
    const after = bestLoadout([
      ...held.filter((h) => !gone.has(h.candidate.id)).map((h) => h.candidate),
      candidateOf(`merged:${title}`, into.row, merged.grade, score, into.candidate.heldAt, merged.exp),
    ]);
    const gain = round2(after.total - loadout.total);
    if (gain > 0) merges.push({ title, grades, from: into.candidate.grade, to: merged.grade, toExp: merged.exp, gain });
  }
  merges.sort((a, b) => b.gain - a.gain);

  // ── Sockets ──
  const wanted = new Set([...criteria.facets.worn, ...criteria.facets.click, ...criteria.facets.proc, ...criteria.facets.focus]);
  const yourClasses = criteria.facets.class;
  const stones: Stone[] = [];
  for (const item of inventory) {
    if (item.area === "storage" && EXALTATION_RE.test(item.name)) {
      const source = rowOf(itemBaseName(item.name.replace(EXALTATION_RE, "")));
      if (!source) continue;
      const effects = source.stats.effects;
      for (const e of effects) {
        stones.push({ from: source.item.title, kind: e.kind, effect: e.name, where: inventoryPlaceText(item), card: source.stats, uncertain: effects.length > 1 || undefined });
      }
    }
  }
  for (const h of held) {
    if (inLoadout.has(h.candidate.id)) continue; // taking an effect out of worn gear isn't a gain
    for (const e of h.row.stats.effects) {
      if (h.candidate.grade < extractableAt(e.kind)) continue;
      stones.push({ from: h.row.item.title, kind: e.kind, effect: e.name, where: `take it out of ${h.item.name} (${h.candidate.heldAt})`, card: h.row.stats });
    }
  }
  const heldById = new Map(held.map((h) => [h.candidate.id, h]));
  const hosts = loadout.picks
    .filter((p) => openSockets(p.item.grade).length > 0)
    .map((p) => {
      const h = heldById.get(p.item.id)!;
      const filled = new Map<EffectKind, string>();
      for (const s of h.item.sockets) {
        const kind = kindOfSocket(s.socket);
        if (kind) filled.set(kind, s.name);
      }
      return { held: h.item.name, grade: p.item.grade, card: h.row.stats, filled };
    });
  const sockets = socketPlan(hosts, stones, wanted, yourClasses);

  // ── Targets ──
  const heldTitles = new Set(held.map((h) => h.row.item.title));
  const pool = eraCorpus(rows, closedZones, criteria.hideOutOfEra).filter(
    (r) => !heldTitles.has(r.item.title) && wearable(r, criteria) && matchesItem(r, criteria),
  );
  const targets = new Map(pool.map((r) => [`target:${r.item.title}`, r]));
  const suggestions = huntSuggestions(
    loadout,
    pool.map((r) => candidateOf(`target:${r.item.title}`, r, 0, score)),
  );
  const hunt: BisHunt[] = suggestions.map((s) => {
    const row = targets.get(s.item.id)!;
    // What it pushes out stays the same at every grade; only its own value moves.
    const valueThere = (c: BisCandidate) => (s.slot === "ANY" ? c.anyValue : c.value);
    const displaced = valueThere(s.item) - s.gain;
    const atGrades = HUNT_GRADES.map((grade) => ({
      grade,
      copies: copiesFor(grade),
      gain: round2(valueThere(candidateOf(s.item.id, row, grade, score)) - displaced),
    }));
    return { ...s, row, atGrades };
  });

  return { loadout, wearing, merges, sockets, hunt, unweighed: [...unweighed].sort() };
}
