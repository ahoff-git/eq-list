/**
 * bis-plan.ts — the loadout builder's plan, assembled: from what the inventory dump says you hold, the
 * item catalogue, the Items tab's own criteria and value weights, and what you've told the builder
 * yourself (`bis-options.ts`). **One loadout**, drawn from what you hold and — with hunting on — from
 * the catalogue, so a pick says either where you have it or where to go and get it (ADR 0329).
 *
 * `bis.ts` picks a loadout and ranks hunt targets; `exaltations.ts` knows the socket rules. This file
 * decides what goes into them:
 *
 * - **Yours** are the dump's wearables (anywhere — bags, bank, depot, hoard, Storage) that one of your
 *   classes can wear, each at its own grade. The criteria's class and race pickers say who you are,
 *   which is the Items tab's own meaning of them: an item is wearable if *any* ticked class can.
 * - **The catalogue** (with hunting on) is every row the Items tab's whole query lets through — the
 *   name box too — at the hunt grade, as many copies as its slots take less those you hold.
 * - **Exclusions** leave the page entirely: never worn, hunted, an effect's carrier or a stone's source.
 * - **Locks** are slots you've decided: held to an item by title (your copy first, else one to hunt),
 *   or held empty. They hold until unlocked — whether hunting is on or the criteria hide the item now.
 *   The rest is solved exactly around them. A lock nothing can satisfy is reported, not dropped.
 * - **Wanted effects** are made to happen, cheapest way first (ADR 0318): already worn → a stone you
 *   hold, into an open socket of anything worn (costs no stats) → wear something that carries it, held
 *   or (hunting on) from the catalogue — a shield for its focus — costing what it displaces → say what
 *   to hunt. Each one met pins the slot that meets it, so a later one can't undo it.
 * - **Upgrades to hunt** are the catalogue rows you don't hold that would beat a slot, at `+0` and at
 *   the grades more copies would buy — the owned-only view's "what next".
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
  type BisPick,
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
import type { EffectKind, StatKey } from "./item-stats";

/** Grades a hunt target is weighed at, beyond `+0`: a couple of merges, a long farm, and the cap — what farming copies buys. */
export const HUNT_GRADES = [2, 5, 10] as const;

/** Things you hold offered per slot for a lock — the slot's best few, which is what a choice needs. */
export const ALTERNATIVES_PER_SLOT = 8;

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

/** Something that could go in a slot, for a lock to choose from — held (`heldAt`), or to hunt. */
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
  /** The best from the same pool with no locks or wanted effects — what those choices cost, by difference. */
  unconstrained: number;
  merges: BisMerge[];
  sockets: SocketPlan[];
  /** Sockets a wanted effect's stone was planned into, so the socket list can show it there too. */
  socketClaims: { host: string; kind: EffectKind; stone: Stone }[];
  hunt: BisHunt[];
  effects: BisEffectPlan[];
  /** Slot index → the wanted effect whose item is held there. */
  pinned: Record<number, string>;
  /** Slot index → what could go there, held or to hunt, best first. */
  alternatives: Record<number, BisSlotChoice[]>;
  /** Locks nothing can satisfy (excluded since, or no copy fits that slot), by slot index. */
  staleLocks: { slotIndex: number; title: string }[];
  /** The catalogue row behind each pick to hunt, by title — where it comes from, what level it is. */
  huntFrom: Record<string, ItemRow>;
  /** Slot index → the pick's numbers at its grade — what its row can explain its value by. */
  pickStats: Record<number, Partial<Record<StatKey, number>>>;
  /** How many picks you'd have to go and get. */
  toHunt: number;
  /** Catalogue rows the criteria let through — 0 is what to explain when a name filter empties it. */
  catalogueMatches: number;
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
export function wearable(row: ItemRow, criteria: ItemCriteria): boolean {
  return row.stats.slots.length > 0 && matchesFacet(row, criteria, "class") && matchesFacet(row, criteria, "race");
}

/** One thing the solver may wear, weighed at its grade. */
export function candidateOf(id: string, row: ItemRow, grade: number, score: ReturnType<typeof scorer>, heldAt?: string, exp = 0): BisCandidate {
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

/** How many of one item a loadout could wear: one if LORE, else as many as its widest slot pair. */
function copiesWorn(row: ItemRow): number {
  if (row.stats.flags.includes("LORE")) return 1;
  return Math.max(1, ...row.stats.slots.map((s) => WORN_LAYOUT.filter((l) => l === s).length));
}

/** Catalogue items tried per wanted effect (all you hold are) — the few worth most, since a common
 *  effect is on hundreds of cards and each try is a whole re-solve. */
const EFFECT_PROVIDERS = 8;

function effectProviders(carrying: readonly BisCandidate[]): BisCandidate[] {
  const yours = carrying.filter((c) => c.heldAt);
  const toHunt = carrying
    .filter((c) => !c.heldAt)
    .sort((a, b) => Math.max(b.value, b.anyValue) - Math.max(a.value, a.anyValue))
    .slice(0, EFFECT_PROVIDERS);
  return [...yours, ...toHunt];
}

/** Each distinct slot's candidates by value there, best first — and for the hands, the one-handers on
 *  their own too. Sorted once per plan; `contendersIn` reads the front of each per solve. */
type SlotRanks = Map<string, { all: BisCandidate[]; oneHanded?: BisCandidate[] }>;

function rankBySlot(candidates: readonly BisCandidate[]): SlotRanks {
  const ranked = (slot: string, from: readonly BisCandidate[]) =>
    from
      .map((c) => ({ c, v: valueIn(c, slot) }))
      .filter((x): x is { c: BisCandidate; v: number } => x.v !== null && x.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((x) => x.c);
  const ranks: SlotRanks = new Map();
  for (const slot of new Set(WORN_LAYOUT)) {
    const hand = slot === "PRIMARY" || slot === "SECONDARY";
    ranks.set(slot, { all: ranked(slot, candidates), oneHanded: hand ? ranked(slot, candidates.filter((c) => !c.twoHanded)) : undefined });
  }
  return ranks;
}

/**
 * The candidates a solve over `pool` can use: each slot's top `n` still in the pool (`n` = the layout's
 * slots), plus `extra` and whatever the locks hold. Exact — a slot's item in an optimal assignment is
 * always among that slot's top `n`, or one of those would be free to swap in — and it keeps a catalogue
 * of thousands down to the few hundred that matter. The hands keep their top `n` one-handers as well,
 * since the both-hands loadout can't swing a two-hander.
 */
function contendersIn(ranks: SlotRanks, pool: readonly BisCandidate[], extra: readonly BisCandidate[], locks: readonly BisLock[]): BisCandidate[] {
  const n = WORN_LAYOUT.length;
  const inPool = new Set(pool.map((c) => c.id));
  const keep = new Set<BisCandidate>(extra);
  const front = (list: readonly BisCandidate[] | undefined) => {
    let taken = 0;
    for (const c of list ?? []) {
      if (taken >= n) break;
      if (!inPool.has(c.id)) continue;
      keep.add(c);
      taken++;
    }
  };
  for (const { all, oneHanded } of ranks.values()) {
    front(all);
    front(oneHanded);
  }
  for (const l of locks) if (l.item) keep.add(l.item);
  return [...keep];
}

/** One effect a held copy carries now, and where it sits. */
interface HeldEffect {
  name: string;
  kind: EffectKind;
  /** Its own effect (true) or another item's stone socketed into it. */
  own: boolean;
  /** The item it came from: this one, or the stone's source. */
  from: ItemRow;
  /** In a socket, so removable as a stone — an own effect is once the item is ranked up to it. */
  removable: boolean;
}

/**
 * What a held copy really carries ([Exaltations](https://eqlwiki.com/Exaltations)). Once an item is
 * ranked up to a socket's grade, its own effect of that kind *is* a removable exaltation, and the dump
 * lists what that socket holds: the item's own effect still, another item's stone put there instead,
 * or nothing — taken out and moved. So for a ranked kind, the socket is the truth, not the card.
 *
 * Measured on a real dump: 11 ranked items listed their own effect in its socket, 2 held another
 * item's stone there, and one had its own moved out (into another ring's socket). Storage rows carry no
 * socket at all, so for them the card's effects are the only reading there is, and are kept.
 */
function heldEffects(h: Held, rowOf: (name: string) => ItemRow | undefined): HeldEffect[] {
  const socketsKnown = h.item.area !== "storage";
  const out: HeldEffect[] = [];
  for (const e of h.row.stats.effects) {
    const ranked = h.item.grade >= extractableAt(e.kind);
    if (ranked && socketsKnown) continue; // its socket says, below
    out.push({ name: e.name, kind: e.kind, own: true, from: h.row, removable: ranked });
  }
  if (!socketsKnown) return out;
  for (const socketed of h.item.sockets) {
    const kind = kindOfSocket(socketed.socket);
    const source = kind && rowOf(heldName(socketed.name).title);
    if (!source) continue;
    const own = normalizeItemName(source.item.title) === normalizeItemName(h.row.item.title);
    for (const e of source.stats.effects) if (e.kind === kind) out.push({ name: e.name, kind, own, from: source, removable: true });
  }
  return out;
}

/** A slot spec before it meets the candidates: a title to find, or `null` for "keep it empty". */
export type LockSpec = Map<number, string | null>;

/**
 * Turn title locks into candidate locks: each to the best copy of that title that fits the slot and
 * isn't already locked elsewhere — two ring locks on "Moonstone Ring" want two copies. A copy you hold
 * comes before one to hunt, whatever the hunt grade would make the hypothetical one worth.
 */
export function resolveLocks(candidates: readonly BisCandidate[], specs: LockSpec): { locks: BisLock[]; stale: { slotIndex: number; title: string }[] } {
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
      if (v === null) continue;
      const better = !best || (!!c.heldAt !== !!best.heldAt ? !!c.heldAt : v > (valueIn(best, slot) ?? 0));
      if (better) best = c;
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
  const excludedKeys = new Set(options.excluded.map(normalizeItemName));
  const isOut = (title: string) => excludedKeys.has(normalizeItemName(title));
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
  const usable = held.filter((h) => !isOut(h.row.item.title));
  const heldById = new Map(held.map((h) => [h.candidate.id, h]));
  const heldCopies = new Map<string, number>();
  for (const h of usable) heldCopies.set(h.row.item.title, (heldCopies.get(h.row.item.title) ?? 0) + 1);

  // ── The catalogue: what you'd go and get ──
  // Everything the Items tab's whole query lets through — the name box included — less what's ruled
  // out, weighed at the hunt grade. Only the copies you don't already hold: a second Moonstone Ring to
  // hunt when you hold one, never a hypothetical twin of the one in your bank.
  const catalogue = eraCorpus(rows, closedZones, criteria.hideOutOfEra).filter(
    (r) => wearable(r, criteria) && !isOut(r.item.title) && matchesItem(r, criteria),
  );
  const huntCopiesOf = (row: ItemRow, wanted: number) =>
    Array.from({ length: Math.max(0, wanted - (heldCopies.get(row.item.title) ?? 0)) }, (_, i) =>
      candidateOf(`hunt:${row.item.title}:${i}`, row, options.huntGrade, score),
    );
  const hunted = options.includeHunt ? catalogue.flatMap((row) => huntCopiesOf(row, copiesWorn(row))) : [];

  // A lock holds until it's unlocked — on something to hunt too, whether hunting is switched on or the
  // criteria now hide it. Only an exclusion lets one go, and excluding unlocks it.
  const specs: LockSpec = new Map(
    Object.entries(options.locks).map(([k, l]) => [Number(k), "empty" in l ? null : l.title] as const),
  );
  const huntedIds = new Set(hunted.map((c) => c.id));
  const lockCopies = new Map<string, number>();
  for (const title of specs.values()) if (title) lockCopies.set(normalizeItemName(title), (lockCopies.get(normalizeItemName(title)) ?? 0) + 1);
  const lockedToHunt: BisCandidate[] = [];
  for (const [key, count] of lockCopies) {
    const row = byTitle.get(key);
    if (!row || isOut(row.item.title) || !wearable(row, criteria)) continue;
    for (const c of huntCopiesOf(row, count)) if (!huntedIds.has(c.id)) lockedToHunt.push(c);
  }
  const all = [...usable.map((h) => h.candidate), ...hunted, ...lockedToHunt];
  const huntRow = new Map([...hunted, ...lockedToHunt].map((c) => [c.id, rowOf(c.title)!]));

  // ── Locks, then wanted effects on top of them ──
  // `specs` grows as wanted effects are met; `reserved` holds copies promised as stones, which
  // mustn't then be worn.
  const reserved = new Set<string>();
  const rank = rankBySlot(all);
  const solveWith = (pool: readonly BisCandidate[], extra: readonly BisCandidate[] = []) => {
    const { locks, stale } = resolveLocks([...pool, ...extra], specs);
    return { loadout: bestLoadout(contendersIn(rank, pool, extra, locks), WORN_LAYOUT, locks), stale };
  };
  const usableCandidates = () => all.filter((c) => !reserved.has(c.id));
  // What your locks and wanted effects cost, by difference: the same pool, nothing decided for it —
  // so without what's only there because a lock asked for it.
  const unconstrained = bestLoadout(contendersIn(rank, [...usable.map((h) => h.candidate), ...hunted], [], [])).total;
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
  /** Does this candidate carry the effect — a held copy by what it really carries now, one to hunt by its card? */
  const carries = (c: BisCandidate, effect: string) => {
    const h = heldById.get(c.id);
    const effects = h ? heldEffects(h, rowOf) : (rowOf(c.title)?.stats.effects ?? []);
    return effects.some((e) => sameEffect(e.name, effect));
  };

  /** What a pick is, as a socket host: held (its sockets as filled now) or to be hunted (all empty). */
  const hostOf = (pick: BisPick) => {
    const h = heldById.get(pick.item.id);
    if (h) return { name: h.item.name, row: h.row, sockets: h.item.sockets };
    const row = huntRow.get(pick.item.id);
    return row ? { name: gradedTitle(row.item.title, pick.item.grade), row, sockets: [] } : undefined;
  };

  /** Wanted effects the loadout already wears — each pins the item wearing it. */
  const meetNatively = (how: "worn" | "forced", cost?: number) => {
    wanted = wanted.filter((effect) => {
      const pick = loadout.picks.find((p) => carries(p.item, effect));
      if (!pick) return true;
      pin(pick.slotIndex, pick.item.title, effect);
      effects.push({ effect, kind: kindOf.get(effect.toLowerCase()), how, by: gradedTitle(pick.item.title, pick.item.grade), cost, hunt: [] });
      return false;
    });
  };
  meetNatively("worn");

  // A stone into a socket costs no stats, so it's tried before wearing anything new — into anything the
  // loadout wears, held or to be hunted, at a grade that opens the socket.
  const stonesNow = () => stonesFor(inventory, held, usable, loadout, rowOf).filter((s) => !isOut(s.stone.from));
  wanted = wanted.filter((effect) => {
    const stones = stonesNow().filter((s) => sameEffect(s.stone.effect, effect) && !(s.sourceId && reserved.has(s.sourceId)));
    let best: { slotIndex: number; host: NonNullable<ReturnType<typeof hostOf>>; hostId: string; stone: (typeof stones)[number]; replaces?: string; rank: number } | undefined;
    for (const pick of loadout.picks) {
      const host = hostOf(pick);
      if (!host) continue;
      const open = new Set(openSockets(pick.item.grade));
      for (const s of stones) {
        if (!open.has(s.stone.kind) || claimed.has(`${pick.item.id}|${s.stone.kind}`)) continue;
        if (!stoneFits(s.stone.card, host.row.stats, yourClasses)) continue;
        const replaces = host.sockets.find((x) => kindOfSocket(x.socket) === s.stone.kind)?.name;
        // An empty socket beats a filled one; a loose stone beats taking one out; certainty beats a guess.
        const rank = (replaces ? 4 : 0) + (s.sourceId ? 2 : 0) + (s.stone.uncertain ? 1 : 0);
        if (!best || rank < best.rank) best = { slotIndex: pick.slotIndex, host, hostId: pick.item.id, stone: s, replaces, rank };
      }
    }
    if (!best) return true;
    claimed.add(`${best.hostId}|${best.stone.stone.kind}`);
    if (best.stone.sourceId) reserved.add(best.stone.sourceId);
    pin(best.slotIndex, best.host.row.item.title, effect);
    socketClaims.push({ host: best.host.name, kind: best.stone.stone.kind, stone: best.stone.stone });
    effects.push({
      effect,
      kind: best.stone.stone.kind,
      how: "socket",
      by: best.host.name,
      stone: best.stone.stone,
      replaces: best.replaces,
      hunt: [],
    });
    return false;
  });

  // Then wear something for it, two ways, weighed against each other: something that carries it, held
  // or (with hunting on) from the catalogue — a shield for its focus — or something with the right socket
  // open, with a stone of it moved in (https://eqlwiki.com/Exaltations: anything socketed can be taken
  // out and put into any item with that socket free, taking out whatever was there). Every candidate in
  // every open slot it fits; the best loadout kept. A wanted effect can take a slot an item would
  // otherwise win, which is the point: the effect is part of what "best" means here.
  const unmetWhy = new Map<string, string>();
  /** The catalogue or dump row behind a candidate, for fitting a stone to it. */
  const rowOfCandidate = (c: BisCandidate) => heldById.get(c.id)?.row ?? huntRow.get(c.id);
  for (const effect of [...wanted]) {
    if (!wanted.includes(effect)) continue; // met along the way by an earlier one's item
    const before = loadout.total;
    const stones = stonesNow().filter((s) => sameEffect(s.stone.effect, effect) && !(s.sourceId && reserved.has(s.sourceId)));
    /** The stone this candidate could take: one of the effect's that fits a socket its grade opens. */
    const stoneFor = (c: BisCandidate) => {
      const row = rowOfCandidate(c);
      if (!row) return undefined;
      const open = new Set(openSockets(c.grade));
      return stones.find((s) => open.has(s.stone.kind) && s.sourceId !== c.id && stoneFits(s.stone.card, row.stats, yourClasses));
    };
    const carriers = usableCandidates().filter((c) => carries(c, effect));
    const hosts = usableCandidates().filter((c) => !carries(c, effect) && !!stoneFor(c));
    const providers = [...effectProviders(carriers), ...effectProviders(hosts)];
    let best: { loadout: BisLoadout; slotIndex: number; title: string; stone?: (typeof stones)[number] } | undefined;
    for (const c of providers) {
      const stone = carries(c, effect) ? undefined : stoneFor(c);
      const triedSlots = new Set<string>();
      WORN_LAYOUT.forEach((slot, slotIndex) => {
        if (specs.has(slotIndex) || triedSlots.has(slot) || valueIn(c, slot) === null) return;
        triedSlots.add(slot); // the second of a pair is the same choice
        specs.set(slotIndex, c.title);
        const tried = solveWith(usableCandidates().filter((x) => x.id !== stone?.sourceId)).loadout;
        specs.delete(slotIndex);
        if (!best || tried.total > best.loadout.total) best = { loadout: tried, slotIndex, title: c.title, stone };
      });
    }
    if (!best) {
      unmetWhy.set(
        effect,
        carriers.length || hosts.length
          ? "what could carry it only fits slots you've locked"
          : options.includeHunt
            ? "nothing you hold or could hunt under your criteria carries it, and no stone of it fits a socket that's open (a focus socket opens at +1, click +2, worn +3, proc +4)"
            : "nothing you hold carries it, and no stone of it fits an open socket — switch on gear to hunt to look further",
      );
      continue;
    }
    specs.set(best.slotIndex, best.title);
    loadout = best.loadout;
    const cost = round2(Math.max(0, before - loadout.total));
    const pick = loadout.picks.find((p) => p.slotIndex === best!.slotIndex);
    const host = pick && hostOf(pick);
    if (best.stone && pick && host && openSockets(pick.item.grade).includes(best.stone.stone.kind)) {
      // Worn for its socket: the stone moves in, out of wherever it is now.
      const stone = best.stone;
      claimed.add(`${pick.item.id}|${stone.stone.kind}`);
      if (stone.sourceId) reserved.add(stone.sourceId);
      pin(best.slotIndex, best.title, effect);
      socketClaims.push({ host: host.name, kind: stone.stone.kind, stone: stone.stone });
      effects.push({
        effect,
        kind: stone.stone.kind,
        how: "socket",
        by: host.name,
        stone: stone.stone,
        replaces: host.sockets.find((x) => kindOfSocket(x.socket) === stone.stone.kind)?.name,
        cost,
        hunt: [],
      });
      wanted = wanted.filter((e) => e !== effect);
      continue;
    }
    meetNatively("forced", cost);
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
    const after = solveWith(
      usableCandidates().filter((c) => !gone.has(c.id)),
      [candidateOf(`merged:${title}`, into.row, merged.grade, score, into.candidate.heldAt, merged.exp)],
    ).loadout;
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
    .flatMap((p) => {
      const host = hostOf(p);
      if (!host) return [];
      const filled = new Map<EffectKind, string>();
      for (const s of host.sockets) {
        const kind = kindOfSocket(s.socket);
        if (kind) filled.set(kind, s.name);
      }
      return [{ held: host.name, grade: p.item.grade, card: host.row.stats, filled }];
    });
  const sockets = socketPlan(hosts, stonesNow().map((s) => s.stone), wantedNames, yourClasses);

  // ── Upgrades to hunt ──
  // What would beat the loadout from the catalogue, slot by slot. With hunting on, the loadout already
  // took the catalogue's best, so this is mostly empty — it's the owned-only view's "what next".
  const heldTitles = new Set(held.map((h) => h.row.item.title));
  const huntRows = catalogue.filter((r) => !heldTitles.has(r.item.title));
  const huntOver = (from: readonly ItemRow[], keepLosses = false): BisHunt[] => {
    const targets = new Map(from.map((r) => [`target:${r.item.title}`, r]));
    return huntSuggestions(
      loadout,
      from.map((r) => candidateOf(`target:${r.item.title}`, r, 0, score)),
      WORN_LAYOUT,
      keepLosses,
    ).map((s) => withGrades(s, targets.get(s.item.id)!, score));
  };
  const hunt = huntOver(huntRows);

  // ── Wanted effects nothing could give ──
  // Outside your criteria if need be — still never anything excluded — so the reason can be acted on.
  const unexcluded = eraCorpus(rows, closedZones, criteria.hideOutOfEra).filter((r) => wearable(r, criteria) && !isOut(r.item.title));
  for (const effect of wanted) {
    const carrying = (r: ItemRow) => r.stats.effects.some((e) => sameEffect(e.name, effect));
    let found = huntOver(huntRows.filter(carrying), true);
    const broad = !found.length;
    if (broad) found = huntOver(unexcluded.filter((r) => carrying(r) && !heldTitles.has(r.item.title)), true);
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

  const pickStats: Record<number, Partial<Record<StatKey, number>>> = {};
  for (const p of loadout.picks) {
    const row = rowOf(p.item.title);
    if (row) pickStats[p.slotIndex] = gradedItemStats(row.stats, p.item.grade, p.item.exp).stats;
  }

  // The catalogue row behind each pick to hunt — where it comes from, what level it is.
  const huntFrom: Record<string, ItemRow> = {};
  for (const p of loadout.picks) {
    const row = huntRow.get(p.item.id);
    if (row) huntFrom[p.item.title] = row;
  }

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
    alternatives: alternativesFor(usableCandidates()),
    staleLocks: final.stale,
    huntFrom,
    pickStats,
    toHunt: loadout.picks.filter((p) => !p.item.heldAt).length,
    catalogueMatches: catalogue.length,
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
 * The stones you have or could make, given what the loadout wears ([Exaltations](https://eqlwiki.com/Exaltations)):
 *
 * - **loose** ones anywhere — Storage's Exaltation tab, a bag, the bank;
 * - ones **socketed into something the loadout doesn't wear** — an exaltation can always be taken out
 *   again and moved ("you can always move it back"). The dump folds a socketed stone onto its host, and
 *   the socket it sits in says which of its source's effects it is, so there is nothing to guess;
 * - an item's **own** effect, removable once that item is ranked up to the socket's grade (focus +1,
 *   click +2, worn +3, proc +4), from things you hold but the loadout doesn't wear.
 *
 * Taking a stone or an effect out of something the loadout wears isn't a gain, so those aren't
 * offered. `sourceId` is the copy an item's own effect would come out of — which can't then be worn,
 * since the effect would be gone; a stone taken out of a host leaves the host wearable, so has none.
 */
function stonesFor(
  inventory: readonly InventoryItem[],
  held: readonly Held[],
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
  const usableIds = new Set(usable.map((h) => h.candidate.id));
  for (const h of held) {
    if (worn.has(h.candidate.id)) continue;
    for (const e of heldEffects(h, rowOf)) {
      if (!e.removable) continue;
      // An own effect only from a copy you may use; a stone someone else's item put there, from any.
      if (e.own && !usableIds.has(h.candidate.id)) continue;
      out.push({
        stone: { from: e.from.item.title, kind: e.kind, effect: e.name, where: `take it out of ${h.item.name} (${h.candidate.heldAt})`, card: e.from.stats },
        ...(e.own && { sourceId: h.candidate.id }),
      });
    }
  }
  return out;
}

/** For each slot, the best few things that could go there — held or to hunt, one row per title and grade. */
function alternativesFor(candidates: readonly BisCandidate[]): Record<number, BisSlotChoice[]> {
  const out: Record<number, BisSlotChoice[]> = {};
  WORN_LAYOUT.forEach((slot, slotIndex) => {
    const seen = new Set<string>();
    out[slotIndex] = candidates
      .map((c) => ({ c, value: valueIn(c, slot) }))
      .filter((x): x is { c: BisCandidate; value: number } => x.value !== null)
      .sort((a, b) => b.value - a.value)
      .filter(({ c }) => {
        const key = `${c.title}|${c.grade}|${c.heldAt ? "held" : "hunt"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, ALTERNATIVES_PER_SLOT)
      .map(({ c, value }) => ({ title: c.title, grade: c.grade, value, heldAt: c.heldAt }));
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
    const from = !p.item.heldAt ? " (to hunt)" : !p.item.heldAt.startsWith("Worn") ? ` (from ${p.item.heldAt})` : "";
    return `${slotLabel(slot)}: ${gradedTitle(p.item.title, p.item.grade)} [${p.value}]${from}`;
  });
  return [`Loadout — ${plan.loadout.total} (wearing ${plan.wearing})`, ...lines].join("\n");
}
