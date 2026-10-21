/**
 * bis-plan.ts — the best-in-slot advice, assembled: from what the inventory dump says you hold, the
 * item catalogue, the Items tab's own criteria and value weights, and what you've told best in slot
 * yourself (`bis-options.ts`).
 *
 * `bis.ts` picks a loadout and ranks hunt targets; `exaltations.ts` knows the socket rules. This file
 * decides what goes into them:
 *
 * - **Yours** are the dump's wearables (anywhere — bags, bank, depot, hoard, Storage) that one of your
 *   classes can wear, each at its own grade, less anything you've **benched**. The criteria's class
 *   and race pickers say who you are, which is the Items tab's own meaning of them: an item is
 *   wearable if *any* ticked class can.
 * - **Locks** are slots you've decided: held to an item by title (its best copy that fits), or held
 *   empty. The rest is solved exactly around them. A lock whose item you no longer hold is reported,
 *   not silently dropped.
 * - **Wanted effects** are made to happen, cheapest way first (ADR 0318): already worn → a stone you
 *   hold, into an open socket of something worn (costs no stats) → wear something you hold that
 *   carries it (costs what it displaces; every slot and copy tried, the best kept) → say what to
 *   hunt. Each one met pins the slot that meets it, so a later one can't undo it.
 * - **Targets** are the catalogue rows passing the Items tab's whole query (era, level, slot, …) that
 *   you don't already hold and haven't skipped, weighed at `+0` and at the grades more copies would buy.
 * - **Merges** are your spare copies — ones the loadout doesn't wear — fed into the copy it does,
 *   suggested when the re-solved loadout comes out ahead.
 * - **Sockets** are the exaltation sockets your loadout's grades open, with stones that fit.
 *
 * Pure. The panel supplies the rows, the dump and the options; nothing here reads a file.
 */
import {
  gradedValues,
  bestLoadout,
  isTwoHanded,
  copiesFor,
  huntSuggestions,
  mergedGrade,
  valueIn,
  WORN_LAYOUT,
  type BisCandidate,
  type BisLoadout,
  type BisLock,
  type BisSuggestion,
} from "./bis";
import { openSockets, extractableAt, EXALTATION_SOCKETS, socketPlan, stoneFits, type SocketPlan, type Stone } from "./exaltations";
import { eraCorpus } from "./item-era";
import { matchesFacet, matchesItem, scorer, type ItemCriteria, type ItemRow, type StatWeights } from "./item-search";
import { normalizeItemName } from "./grouping";
import { heldName, isExaltation } from "./held-name";
import { gradedItemStats, gradedTitle } from "./item-upgrade";
import { loadoutStats, type LoadoutStats } from "./loadout-stats";
import { inventoryPlaceText, type InventoryItem } from "../game-export-dumps";
import { NO_BIS_OPTIONS, type BisOptions } from "./bis-options";
import type { EffectKind } from "./item-stats";

/** Grades a hunt target is weighed at, beyond `+0`: a couple of merges, a long farm, and the cap — what farming copies buys. */
export const HUNT_GRADES = [2, 5, 10] as const;

/** Things you hold offered per slot for a lock — the slot's best few, which is what a choice needs. */
const ALTERNATIVES_PER_SLOT = 8;

/** Catalogue items offered for a wanted effect nothing you hold can give you. */
const EFFECT_HUNTS = 5;

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

/** How a wanted effect is (or isn't) met. */
export interface BisEffectPlan {
  effect: string;
  /** Its kind, as the catalogue files it — absent for a name no cached card carries. */
  kind?: EffectKind;
  /**
   * `worn` — something the loadout wears already carries it. `socket` — put `stone` in `host`'s
   * socket. `forced` — wear `by`, at `cost` in stats. `missing` — nothing you hold gets it; `hunt` says
   * what would.
   */
  how: "worn" | "socket" | "forced" | "missing";
  /** The loadout item carrying it (`worn`, `forced`) or taking the stone (`socket`), as held. */
  by?: string;
  stone?: Stone;
  /** What's in that socket now, which the stone would replace. */
  replaces?: string;
  /** Stats given up to wear it (`forced`). */
  cost?: number;
  /** Why it's missing, in words. */
  why?: string;
  /** Catalogue items carrying it, best gain first (`missing` only). Gains here may be losses. */
  hunt: BisHunt[];
  /** True when nothing under your criteria carries it, so `hunt` looked outside them. */
  broad?: boolean;
}

/** Something you hold that could go in a slot, for a lock to choose from. */
export interface BisSlotChoice {
  title: string;
  grade: number;
  value: number;
  heldAt?: string;
}

export interface BisPlan {
  loadout: BisLoadout;
  /** What the gear you're wearing right now is worth, by the same weights — the "before". */
  wearing: number;
  /** The stats behind those two numbers: what you're wearing adds up to, and what the loadout would. */
  stats: { wearing: LoadoutStats; loadout: LoadoutStats };
  /** The best from what you hold with no locks, benches or wanted effects — what your choices cost, by difference. */
  unconstrained: number;
  merges: BisMerge[];
  sockets: SocketPlan[];
  /** Sockets a wanted effect's stone was planned into, so the socket list can show it there too. */
  socketClaims: { host: string; kind: EffectKind; stone: Stone }[];
  hunt: BisHunt[];
  effects: BisEffectPlan[];
  /** Slot index → the wanted effect whose item is held there. */
  pinned: Record<number, string>;
  /** Slot index → what you hold that could go there, best first. */
  alternatives: Record<number, BisSlotChoice[]>;
  /** Locks on an item you no longer hold (or that can't go in that slot), by slot index. */
  staleLocks: { slotIndex: number; title: string }[];
  /** Things you've benched that are in the dump. */
  benched: string[];
  /** Things you hold that look wearable but have no item page here, so can't be weighed. */
  unweighed: string[];
}

export interface BisInputs {
  rows: readonly ItemRow[];
  inventory: readonly InventoryItem[];
  criteria: ItemCriteria;
  weights: StatWeights;
  closedZones?: ReadonlySet<string>;
  options?: BisOptions;
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
    twoHanded: isTwoHanded(row.stats),
    heldAt,
  };
}

const kindOfSocket = (socket: number): EffectKind | undefined => EXALTATION_SOCKETS.find((s) => s.socket === socket)?.kind;
const sameEffect = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every effect the catalogue knows, by name, with its kind and how many cards carry it — the picker's options. */
export function effectIndex(rows: readonly ItemRow[]): { name: string; kind: EffectKind; count: number }[] {
  const seen = new Map<string, { name: string; kind: EffectKind; count: number }>();
  for (const r of rows) {
    for (const e of r.stats.effects) {
      const key = e.name.toLowerCase();
      const at = seen.get(key);
      if (at) at.count++;
      else seen.set(key, { name: e.name, kind: e.kind, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A held thing: the dump row, its card, and how it's weighed. */
interface Held {
  item: InventoryItem;
  row: ItemRow;
  candidate: BisCandidate;
}

/** A slot spec before it meets the candidates: a title to find, or `null` for "keep it empty". */
type LockSpec = Map<number, string | null>;

/**
 * Turn title locks into candidate locks: each to the best copy of that title that fits the slot and
 * isn't already locked elsewhere — two ring locks on "Moonstone Ring" want two copies.
 */
function resolveLocks(candidates: readonly BisCandidate[], specs: LockSpec): { locks: BisLock[]; stale: { slotIndex: number; title: string }[] } {
  const locks: BisLock[] = [];
  const stale: { slotIndex: number; title: string }[] = [];
  const used = new Set<string>();
  for (const [slotIndex, title] of [...specs].sort(([a], [b]) => a - b)) {
    if (title === null) {
      locks.push({ slotIndex, item: null });
      continue;
    }
    const slot = WORN_LAYOUT[slotIndex];
    const key = normalizeItemName(title);
    let best: BisCandidate | undefined;
    for (const c of candidates) {
      if (used.has(c.id) || normalizeItemName(c.title) !== key) continue;
      const v = valueIn(c, slot);
      if (v !== null && (!best || v > (valueIn(best, slot) ?? 0))) best = c;
    }
    if (best) {
      used.add(best.id);
      locks.push({ slotIndex, item: best });
    } else stale.push({ slotIndex, title });
  }
  return { locks, stale };
}

export function bisPlan({ rows, inventory, criteria, weights, closedZones, options = NO_BIS_OPTIONS }: BisInputs): BisPlan {
  const score = scorer(weights);
  const byTitle = new Map(rows.map((r) => [normalizeItemName(r.item.title), r]));
  const rowOf = (name: string) => byTitle.get(normalizeItemName(name));
  const benchedKeys = new Set(options.benched.map(normalizeItemName));
  const yourClasses = criteria.facets.class;

  // ── Yours ──
  const held: Held[] = [];
  const unweighed = new Set<string>();
  inventory.forEach((item, i) => {
    if (isExaltation(item.name)) return; // a loose stone is an effect, not gear
    const row = rowOf(item.baseName);
    if (!row) {
      if (item.area === "worn") unweighed.add(item.baseName);
      return;
    }
    if (!wearable(row, criteria)) return;
    held.push({ item, row, candidate: candidateOf(`held:${i}`, row, item.grade, score, inventoryPlaceText(item)) });
  });
  const isBenched = (h: Held) => benchedKeys.has(normalizeItemName(h.row.item.title));
  const usable = held.filter((h) => !isBenched(h));
  const heldById = new Map(held.map((h) => [h.candidate.id, h]));
  const carries = (title: string, effect: string) => rowOf(title)?.stats.effects.some((e) => sameEffect(e.name, effect)) ?? false;

  // ── Locks, then wanted effects on top of them ──
  // `specs` grows as wanted effects are met; `reserved` holds copies promised as stones, which
  // mustn't then be worn.
  const specs: LockSpec = new Map(
    Object.entries(options.locks).map(([k, l]) => [Number(k), "empty" in l ? null : l.title] as const),
  );
  const reserved = new Set<string>();
  const solveWith = (pool: readonly BisCandidate[]) => {
    const { locks, stale } = resolveLocks(pool, specs);
    return { loadout: bestLoadout(pool, WORN_LAYOUT, locks), stale };
  };
  const usableCandidates = () => usable.map((h) => h.candidate).filter((c) => !reserved.has(c.id));
  // Benches count among your choices too, so the baseline is everything you hold.
  const unconstrained = bestLoadout(held.map((h) => h.candidate)).total;
  let { loadout } = solveWith(usableCandidates());

  const pinned: Record<number, string> = {};
  const pin = (slotIndex: number, title: string, effect: string) => {
    if (!specs.has(slotIndex)) specs.set(slotIndex, title);
    pinned[slotIndex] ??= effect;
  };
  const effects: BisEffectPlan[] = [];
  const kindOf = new Map(effectIndex(rows).map((e) => [e.name.toLowerCase(), e.kind]));
  const socketClaims: BisPlan["socketClaims"] = [];
  const claimed = new Set<string>(); // `${candidate id}|${kind}`
  let wanted = [...new Set(options.wantEffects)];

  /** Wanted effects the loadout already wears — each pins the item wearing it. */
  const meetNatively = (how: "worn" | "forced", cost?: number) => {
    wanted = wanted.filter((effect) => {
      const pick = loadout.picks.find((p) => carries(p.item.title, effect));
      if (!pick) return true;
      pin(pick.slotIndex, pick.item.title, effect);
      effects.push({ effect, kind: kindOf.get(effect.toLowerCase()), how, by: gradedTitle(pick.item.title, pick.item.grade), cost, hunt: [] });
      return false;
    });
  };
  meetNatively("worn");

  // A stone into a socket costs no stats, so it's tried before wearing anything new.
  const stonesNow = () => stonesFor(inventory, usable, loadout, rowOf);
  wanted = wanted.filter((effect) => {
    const stones = stonesNow().filter((s) => sameEffect(s.stone.effect, effect) && !(s.sourceId && reserved.has(s.sourceId)));
    let best: { slotIndex: number; host: Held; stone: (typeof stones)[number]; replaces?: string; rank: number } | undefined;
    for (const pick of loadout.picks) {
      const host = heldById.get(pick.item.id);
      if (!host) continue;
      const open = new Set(openSockets(pick.item.grade));
      for (const s of stones) {
        if (!open.has(s.stone.kind) || claimed.has(`${pick.item.id}|${s.stone.kind}`)) continue;
        if (!stoneFits(s.stone.card, host.row.stats, yourClasses)) continue;
        const replaces = host.item.sockets.find((x) => kindOfSocket(x.socket) === s.stone.kind)?.name;
        // An empty socket beats a filled one; a loose stone beats taking one out; certainty beats a guess.
        const rank = (replaces ? 4 : 0) + (s.sourceId ? 2 : 0) + (s.stone.uncertain ? 1 : 0);
        if (!best || rank < best.rank) best = { slotIndex: pick.slotIndex, host, stone: s, replaces, rank };
      }
    }
    if (!best) return true;
    claimed.add(`${best.host.candidate.id}|${best.stone.stone.kind}`);
    if (best.stone.sourceId) reserved.add(best.stone.sourceId);
    pin(best.slotIndex, best.host.row.item.title, effect);
    socketClaims.push({ host: best.host.item.name, kind: best.stone.stone.kind, stone: best.stone.stone });
    effects.push({
      effect,
      kind: best.stone.stone.kind,
      how: "socket",
      by: best.host.item.name,
      stone: best.stone.stone,
      replaces: best.replaces,
      hunt: [],
    });
    return false;
  });

  // Then wear something you hold that carries it: every copy in every open slot it fits, best kept.
  const unmetWhy = new Map<string, string>();
  for (const effect of [...wanted]) {
    if (!wanted.includes(effect)) continue; // met along the way by an earlier one's item
    const before = loadout.total;
    let best: { loadout: BisLoadout; slotIndex: number; title: string } | undefined;
    const providers = usableCandidates().filter((c) => carries(c.title, effect));
    for (const c of providers) {
      const triedSlots = new Set<string>();
      WORN_LAYOUT.forEach((slot, slotIndex) => {
        if (specs.has(slotIndex) || triedSlots.has(slot) || valueIn(c, slot) === null) return;
        triedSlots.add(slot); // the second of a pair is the same choice
        specs.set(slotIndex, c.title);
        const tried = solveWith(usableCandidates()).loadout;
        specs.delete(slotIndex);
        if (!best || tried.total > best.loadout.total) best = { loadout: tried, slotIndex, title: c.title };
      });
    }
    if (!best) {
      unmetWhy.set(
        effect,
        providers.length ? "what you hold that carries it only fits slots you've locked" : "nothing you hold carries it, and no stone of it fits an open socket",
      );
      continue;
    }
    specs.set(best.slotIndex, best.title);
    loadout = best.loadout;
    meetNatively("forced", round2(Math.max(0, before - loadout.total)));
  }

  const final = solveWith(usableCandidates());
  loadout = final.loadout;
  const inLoadout = new Set(loadout.picks.map((p) => p.item.id));

  // ── What you're wearing now ──
  const wearing = round2(
    held.filter((h) => h.item.area === "worn").reduce((t, h) => t + (h.item.slot === "Any Slot" ? h.candidate.anyValue : h.candidate.value), 0),
  );

  // Each piece at its own grade — the same reading its value above was weighed at.
  const stats = {
    wearing: loadoutStats(held.filter((h) => h.item.area === "worn").map((h) => gradedItemStats(h.row.stats, h.item.grade))),
    loadout: loadoutStats(
      loadout.picks.flatMap((p) => {
        const row = rowOf(p.item.title);
        return row ? [gradedItemStats(row.stats, p.item.grade, p.item.exp)] : [];
      }),
    ),
  };

  // ── Merges ──
  // Merge your *spare* copies — the ones the loadout doesn't wear — into the best copy it does. The
  // gain is exact: the whole loadout re-solved (locks and all) with the merged copy in place of all of
  // them, since the slots spares were filling get refilled by whatever is next best rather than left empty.
  const copies = new Map<string, Held[]>();
  for (const h of usable) {
    if (reserved.has(h.candidate.id)) continue;
    copies.set(h.row.item.title, [...(copies.get(h.row.item.title) ?? []), h]);
  }
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
    const after = solveWith([
      ...usableCandidates().filter((c) => !gone.has(c.id)),
      candidateOf(`merged:${title}`, into.row, merged.grade, score, into.candidate.heldAt, merged.exp),
    ]).loadout;
    const gain = round2(after.total - loadout.total);
    if (gain > 0) merges.push({ title, grades, from: into.candidate.grade, to: merged.grade, toExp: merged.exp, gain });
  }
  merges.sort((a, b) => b.gain - a.gain);

  // ── Sockets ──
  const wantedNames = new Set([
    ...criteria.facets.worn,
    ...criteria.facets.click,
    ...criteria.facets.proc,
    ...criteria.facets.focus,
    ...options.wantEffects,
  ]);
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
  const sockets = socketPlan(hosts, stonesNow().map((s) => s.stone), wantedNames, yourClasses);

  // ── Targets ──
  const heldTitles = new Set(held.map((h) => h.row.item.title));
  const skipped = new Set(options.skipHunt.map(normalizeItemName));
  const reachable = eraCorpus(rows, closedZones, criteria.hideOutOfEra).filter(
    (r) => !heldTitles.has(r.item.title) && !skipped.has(normalizeItemName(r.item.title)) && wearable(r, criteria),
  );
  // Narrowed by what you can get — level band, zones, era, stat floors — but never by the Search
  // box's name text: a name typed to look one item up is a lookup, and left in the box it silently
  // emptied the whole Hunt ("Troll Green" from a quest lookup matched nothing wearable).
  const huntCriteria = { ...criteria, text: "" };
  const pool = reachable.filter((r) => matchesItem(r, huntCriteria));
  const huntOver = (from: readonly ItemRow[], keepLosses = false): BisHunt[] => {
    const targets = new Map(from.map((r) => [`target:${r.item.title}`, r]));
    return huntSuggestions(
      loadout,
      from.map((r) => candidateOf(`target:${r.item.title}`, r, 0, score)),
      WORN_LAYOUT,
      keepLosses,
    ).map((s) => withGrades(s, targets.get(s.item.id)!, score));
  };
  const hunt = huntOver(pool);

  // ── Wanted effects nothing you hold can give ──
  for (const effect of wanted) {
    const carrying = (r: ItemRow) => r.stats.effects.some((e) => sameEffect(e.name, effect));
    let found = huntOver(pool.filter(carrying), true);
    const broad = !found.length;
    if (broad) found = huntOver(reachable.filter(carrying), true);
    effects.push({
      effect,
      kind: kindOf.get(effect.toLowerCase()),
      how: "missing",
      why: unmetWhy.get(effect) ?? "nothing you hold carries it, and no stone of it fits an open socket",
      hunt: found.slice(0, EFFECT_HUNTS),
      ...(broad && found.length > 0 && { broad: true }),
    });
  }
  const order = new Map(options.wantEffects.map((e, i) => [e, i]));
  effects.sort((a, b) => (order.get(a.effect) ?? 0) - (order.get(b.effect) ?? 0));

  return {
    loadout,
    wearing,
    stats,
    unconstrained,
    merges,
    sockets,
    socketClaims,
    hunt,
    effects,
    pinned,
    alternatives: alternativesFor(usable.filter((h) => !reserved.has(h.candidate.id))),
    staleLocks: final.stale,
    benched: [...new Set(held.filter(isBenched).map((h) => h.row.item.title))].sort(),
    unweighed: [...unweighed].sort(),
  };
}

/** A hunt suggestion with what more copies of it would buy. What it pushes out is the same at every grade. */
function withGrades(s: BisSuggestion, row: ItemRow, score: ReturnType<typeof scorer>): BisHunt {
  const valueThere = (c: BisCandidate) => (s.slot === "ANY" ? c.anyValue : c.value);
  const displaced = valueThere(s.item) - s.gain;
  const atGrades = HUNT_GRADES.map((grade) => ({
    grade,
    copies: copiesFor(grade),
    gain: round2(valueThere(candidateOf(s.item.id, row, grade, score)) - displaced),
  }));
  return { ...s, row, atGrades };
}

/**
 * The stones you have or could make, given what the loadout wears: loose ones anywhere (Storage's
 * Exaltation tab, a bag, the bank — socketed ones are already folded onto their host by the parser),
 * and the effects removable from things you hold but don't wear. Taking an effect out of worn gear
 * isn't a gain, so those aren't offered. `sourceId` is the copy a removable one would come out of.
 */
function stonesFor(
  inventory: readonly InventoryItem[],
  usable: readonly Held[],
  loadout: BisLoadout,
  rowOf: (name: string) => ItemRow | undefined,
): { stone: Stone; sourceId?: string }[] {
  const out: { stone: Stone; sourceId?: string }[] = [];
  for (const item of inventory) {
    if (!isExaltation(item.name)) continue;
    const source = rowOf(heldName(item.name).title);
    if (!source) continue;
    const effects = source.stats.effects;
    for (const e of effects) {
      out.push({
        stone: { from: source.item.title, kind: e.kind, effect: e.name, where: inventoryPlaceText(item), card: source.stats, uncertain: effects.length > 1 || undefined },
      });
    }
  }
  const worn = new Set(loadout.picks.map((p) => p.item.id));
  for (const h of usable) {
    if (worn.has(h.candidate.id)) continue;
    for (const e of h.row.stats.effects) {
      if (h.candidate.grade < extractableAt(e.kind)) continue;
      out.push({
        stone: { from: h.row.item.title, kind: e.kind, effect: e.name, where: `take it out of ${h.item.name} (${h.candidate.heldAt})`, card: h.row.stats },
        sourceId: h.candidate.id,
      });
    }
  }
  return out;
}

/** For each slot, the best few things you hold that could go there — one row per title and grade. */
function alternativesFor(usable: readonly Held[]): Record<number, BisSlotChoice[]> {
  const out: Record<number, BisSlotChoice[]> = {};
  WORN_LAYOUT.forEach((slot, slotIndex) => {
    const seen = new Set<string>();
    out[slotIndex] = usable
      .map((h) => ({ h, value: valueIn(h.candidate, slot) }))
      .filter((x): x is { h: Held; value: number } => x.value !== null)
      .sort((a, b) => b.value - a.value)
      .filter(({ h }) => {
        const key = `${h.candidate.title}|${h.candidate.grade}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, ALTERNATIVES_PER_SLOT)
      .map(({ h, value }) => ({ title: h.candidate.title, grade: h.candidate.grade, value, heldAt: h.candidate.heldAt }));
  });
  return out;
}

/** A slot in words — the card's uppercase, read as a reader would say it. */
export const slotLabel = (slot: string): string => (slot === "ANY" ? "Any Slot" : slot.charAt(0) + slot.slice(1).toLowerCase());

/**
 * The loadout as plain text, one slot a line, for pasting into a guild chat or a note — the same rows
 * the Wear table shows, in the layout's order, with where to fetch each one from.
 */
export function loadoutText(plan: Pick<BisPlan, "loadout" | "wearing">): string {
  const bySlot = new Map(plan.loadout.picks.map((p) => [p.slotIndex, p]));
  const lines = WORN_LAYOUT.map((slot, i) => {
    const p = bySlot.get(i);
    if (!p) return `${slotLabel(slot)}: —`;
    const from = p.item.heldAt && !p.item.heldAt.startsWith("Worn") ? ` (from ${p.item.heldAt})` : "";
    return `${slotLabel(slot)}: ${gradedTitle(p.item.title, p.item.grade)} [${p.value}]${from}`;
  });
  return [`Best in slot — ${plan.loadout.total} (wearing ${plan.wearing})`, ...lines].join("\n");
}
