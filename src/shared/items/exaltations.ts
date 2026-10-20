/**
 * exaltations.ts — EQL's exaltation sockets: which a grade opens, which stones fit which host, and
 * what to put in an empty one.
 *
 * The rules, from eqlwiki's [Exaltations](https://eqlwiki.com/Exaltations) page and eqltools'
 * `exalt-core.js` (which cites the developers and the game's own refusal message):
 *
 * - An exaltation moves **one effect** — focus, click, worn or proc — from a source item into a host.
 *   It carries none of the source's stats, AC or grade, so it is valued by what it does, not by the
 *   weight sheet.
 * - A host's grade opens one socket of each kind: focus at `+1`, click at `+2`, worn at `+3`, proc at
 *   `+4`. At the same grades the source's own effect of that kind becomes removable — so an item you
 *   hold at `+3` can give up its worn effect as a stone.
 * - A stone fits a host only if at least one class can use both (and the result is usable by only
 *   those), and their slot lists overlap. For a player, the overlap must still include one of *their*
 *   classes, or the result is something they can't wear.
 * - In an inventory dump, a socket's number is its type: 7 focus, 8 click, 9 worn, 10 proc, 1/2
 *   ornament (looks only).
 *
 * Pure. What the stones *are* comes from the dump and the catalogue; this only applies the rules.
 */
import type { EffectKind } from "./item-stats";

/** Each effect socket: its kind, its number in a dump, and the grade that opens it. */
export const EXALTATION_SOCKETS: readonly { kind: EffectKind; socket: number; grade: number }[] = [
  { kind: "focus", socket: 7, grade: 1 },
  { kind: "click", socket: 8, grade: 2 },
  { kind: "worn", socket: 9, grade: 3 },
  { kind: "proc", socket: 10, grade: 4 },
];

/** A dump socket number in words. */
export function socketName(socket: number): string {
  if (socket === 1 || socket === 2) return "ornament";
  return EXALTATION_SOCKETS.find((s) => s.socket === socket)?.kind ?? `#${socket}`;
}

/** The effect sockets a host at this grade has open. */
export function openSockets(grade: number): EffectKind[] {
  return EXALTATION_SOCKETS.filter((s) => grade >= s.grade).map((s) => s.kind);
}

/** The grade at which an item's own effect of this kind can be taken out as a stone. */
export function extractableAt(kind: EffectKind): number {
  return EXALTATION_SOCKETS.find((s) => s.kind === kind)?.grade ?? Infinity;
}

/** What a stone or a host is, for fitting: who can use it and where it's worn. */
export interface ExaltationCard {
  classes: readonly string[];
  slots: readonly string[];
}

/**
 * Does a stone from `source` fit `host` for a player of `yourClasses`? Classes overlap — and include
 * one of yours, when you've said which — and slots overlap. An empty class or slot list on either card
 * means the card didn't say, which is treated as no restriction rather than as "nobody".
 */
export function stoneFits(source: ExaltationCard, host: ExaltationCard, yourClasses: readonly string[] = []): boolean {
  const overlap = (a: readonly string[], b: readonly string[]) => !a.length || !b.length || a.some((x) => b.includes(x));
  if (!overlap(source.slots, host.slots)) return false;
  // Who could wear the result: the classes both cards allow (one silent card allows what the other does).
  const shared = !source.classes.length
    ? host.classes
    : !host.classes.length
      ? source.classes
      : source.classes.filter((c) => host.classes.includes(c));
  if (source.classes.length && host.classes.length && !shared.length) return false;
  return overlap(shared, yourClasses);
}

/** A stone you have, or could make: which effect, of what kind, from which item, and where it is. */
export interface Stone {
  /** The source item's page title. */
  from: string;
  kind: EffectKind;
  effect: string;
  /** "Storage: Exaltation", or "take it out of Gnoll Slayer +3 (Bank 4)". */
  where: string;
  /** The source card, for fitting. */
  card: ExaltationCard;
  /**
   * True when the dump can't say which of the source's effects this stone holds — a loose stone from
   * an item with more than one effect. Shown as a possibility rather than a fact.
   */
  uncertain?: boolean;
}

/** One empty or filled socket on a loadout item, with what could go in it. */
export interface SocketPlan {
  /** The host, as held (`Keg Mallet +4`). */
  host: string;
  kind: EffectKind;
  /** What's in it now, by name, when something is. */
  filled?: string;
  /** Stones that fit, wanted effects first. */
  options: Stone[];
}

/**
 * For each loadout item, each socket its grade opens: what's in it, and the stones that could be.
 * `wanted` is the effect names the player has picked in the Items tab's effect filters — those come
 * first, since "worth" for an effect is the player's call, not ours. A stone already sitting in a
 * socket isn't offered elsewhere.
 */
export function socketPlan(
  hosts: readonly { held: string; grade: number; card: ExaltationCard; filled: ReadonlyMap<EffectKind, string> }[],
  stones: readonly Stone[],
  wanted: ReadonlySet<string>,
  yourClasses: readonly string[] = [],
  perSocket = 5,
): SocketPlan[] {
  const rank = (s: Stone) => (wanted.has(s.effect) ? 0 : 1) + (s.uncertain ? 0.5 : 0);
  const plans: SocketPlan[] = [];
  for (const host of hosts) {
    for (const kind of openSockets(host.grade)) {
      const options = stones
        .filter((s) => s.kind === kind && stoneFits(s.card, host.card, yourClasses))
        .sort((a, b) => rank(a) - rank(b) || a.effect.localeCompare(b.effect))
        .slice(0, perSocket);
      plans.push({ host: host.held, kind, filled: host.filled.get(kind), options });
    }
  }
  return plans;
}
