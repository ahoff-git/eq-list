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
 * - **Restrictions compound.** Every stone's classes and slots are applied to the host it goes into
 *   ([Restrictions](https://eqlwiki.com/Exaltations#Restrictions): a two-handed weapon's proc makes the
 *   host Primary-only, a proc from a four-class weapon takes a six-class sword down to four). A host
 *   with four stones in it has been narrowed four times, so a stone fits only the host *as the stones
 *   already in it have left it* — two stones that each fit a sword alone can still be impossible together.
 *   On real catalogue cards, 1,714 of the 7,700 focus + proc pairs that fit the Short Sword of the Ykesha
 *   individually were.
 * - In an inventory dump, a socket's number is its type: 7 focus, 8 click, 9 worn, 10 proc, 1/2
 *   ornament (looks only).
 *
 * Pure. What the stones *are* comes from the dump and the catalogue; this only applies the rules.
 */
import { CLASS_SEARCH_ALIASES } from "../class-names";
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

/** The values both lists allow. An empty list says nothing, which restricts nothing, so the other stands. */
const common = (a: readonly string[], b: readonly string[]): string[] => (!a.length ? [...b] : !b.length ? [...a] : a.filter((x) => b.includes(x)));

/**
 * What a host reads as once a stone is in it, or `undefined` when it can't go in at all: the classes
 * both allow and the slots both allow ([Restrictions](https://eqlwiki.com/Exaltations#Restrictions)).
 * An empty class or slot list on either card means the card didn't say, which restricts nothing — so
 * the answer for two silent cards is a silent card, and a card that *did* say never becomes silent by
 * being emptied: two lists that say something and share nothing are `undefined`, not `[]`.
 *
 * Folding it over each stone in turn is how a host with several stones is read, and the order doesn't
 * matter: an intersection is the same whichever way round it is taken.
 */
export function withStone(host: ExaltationCard, stone: ExaltationCard): ExaltationCard | undefined {
  const classes = common(host.classes, stone.classes);
  const slots = common(host.slots, stone.slots);
  const emptied = (a: readonly string[], b: readonly string[], left: readonly string[]) => a.length > 0 && b.length > 0 && !left.length;
  if (emptied(host.classes, stone.classes, classes) || emptied(host.slots, stone.slots, slots)) return undefined;
  return { classes, slots };
}

/**
 * Does a stone from `source` fit `host` for a player of `yourClasses`? Classes overlap — and include
 * one of yours, when you've said which — and slots overlap.
 *
 * `host` is the host **as it stands**: to ask about a second stone, pass `withStone(host, first)`.
 */
export function stoneFits(source: ExaltationCard, host: ExaltationCard, yourClasses: readonly string[] = []): boolean {
  const result = withStone(host, source);
  return !!result && (!result.classes.length || !yourClasses.length || result.classes.some((c) => yourClasses.includes(c)));
}

/**
 * What taking a stone costs the host, in words — `undefined` when it costs nothing. The classes that can
 * no longer use it, and the slots it is now confined to: the part of the
 * [Restrictions](https://eqlwiki.com/Exaltations#Restrictions) a reader acts on ("Rogues and Bards can no
 * longer equip the sword", "primary slot only"). Classes are shown by their three-letter code, as the
 * wiki's own cards write them.
 */
export function narrowing(base: ExaltationCard, result: ExaltationCard): string | undefined {
  const code = (name: string) => CLASS_SEARCH_ALIASES.get(name) ?? name;
  const slot = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();
  const parts: string[] = [];
  const lost = base.classes.filter((c) => !result.classes.includes(c));
  if (lost.length) parts.push(`not ${lost.map(code).join(" ")}`);
  else if (!base.classes.length && result.classes.length) parts.push(`only ${result.classes.map(code).join(" ")}`);
  if (result.slots.length && result.slots.length !== base.slots.length) parts.push(`${result.slots.map(slot).join(" / ")} only`);
  return parts.length ? parts.join(", ") : undefined;
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

/** A stone that could go in a socket, with what the host reads as once it has. */
export interface SocketOption extends Stone {
  /** The host with this stone in: who can still use it, and where it can be worn. */
  result: ExaltationCard;
}

/** One empty or filled socket on a loadout item, with what could go in it. */
export interface SocketPlan {
  /** The host, as held (`Keg Mallet +4`). */
  host: string;
  kind: EffectKind;
  /** What's in it now, by name, when something is. */
  filled?: string;
  /**
   * The host as its *other* sockets leave it — what any stone for this one has to fit. Narrower than the
   * item's own card whenever another socket holds, or is suggested to hold, a stone with restrictions.
   */
  base: ExaltationCard;
  /** Stones that fit `base`, wanted effects first. */
  options: SocketOption[];
}

/**
 * For each loadout item, each socket its grade opens: what's in it, and the stones that could be.
 * `wanted` is the effect names the player has picked in the Items tab's effect filters — those come
 * first, since "worth" for an effect is the player's call, not ours. A stone already sitting in a
 * socket isn't offered elsewhere.
 *
 * **The sockets are judged together, because the restrictions compound** (see the header). Each socket's
 * options have to fit the host as its *other* sockets leave it, and what narrows it is what is already
 * decided: the stones in them now (`filledCards`, for a socket the caller can name the stone of) and the
 * effects you `wanted`. So the wanted effects together are a build that can still be worn, where checking
 * each socket alone offered stones that excluded one another. A suggestion nobody asked for narrows
 * nothing — it is one alternative among several, and letting the alphabetically first one constrain the
 * rest would hide pairings that work. The socket whose best stone is wanted is decided first (a tie goes
 * to the lower grade), so what you asked for is what narrows the others; a wanted stone also takes the
 * place of whatever the socket holds now. Plans come back in socket order.
 */
export function socketPlan(
  hosts: readonly {
    held: string;
    grade: number;
    card: ExaltationCard;
    filled: ReadonlyMap<EffectKind, string>;
    /** The cards of the stones already in it, by socket — for the ones whose source is known. */
    filledCards?: ReadonlyMap<EffectKind, ExaltationCard>;
  }[],
  stones: readonly Stone[],
  wanted: ReadonlySet<string>,
  yourClasses: readonly string[] = [],
  perSocket = 5,
): SocketPlan[] {
  const rank = (s: Stone) => (wanted.has(s.effect) ? 0 : 1) + (s.uncertain ? 0.5 : 0);
  const plans: SocketPlan[] = [];
  for (const host of hosts) {
    const kinds = openSockets(host.grade);
    /** What each socket contributes to the host: the stone in it now, or the wanted one that replaces it. */
    const holds = new Map(host.filledCards ?? []);
    const without = (kind: EffectKind): ExaltationCard =>
      [...holds].filter(([k]) => k !== kind).reduce((card, [, held]) => withStone(card, held) ?? card, host.card);
    const candidates = (kind: EffectKind) => {
      const base = without(kind);
      const options = stones
        .filter((s) => s.kind === kind && stoneFits(s.card, base, yourClasses))
        .sort((a, b) => rank(a) - rank(b) || a.effect.localeCompare(b.effect));
      return { kind, base, options };
    };
    const bestRank = (c: { options: Stone[] }) => (c.options.length ? rank(c.options[0]) : Infinity);

    const decided = new Map<EffectKind, SocketPlan>();
    for (const undecided = new Set(kinds); undecided.size; ) {
      let next: ReturnType<typeof candidates> | undefined;
      for (const kind of kinds) {
        if (!undecided.has(kind)) continue;
        const c = candidates(kind); // in socket order, so a tie goes to the lower grade
        if (!next || bestRank(c) < bestRank(next)) next = c;
      }
      const { kind, base, options } = next!;
      decided.set(kind, {
        host: host.held,
        kind,
        filled: host.filled.get(kind),
        base,
        options: options.slice(0, perSocket).map((o) => ({ ...o, result: withStone(base, o.card)! })),
      });
      if (options.length && wanted.has(options[0].effect)) holds.set(kind, options[0].card);
      undecided.delete(kind);
    }
    for (const kind of kinds) plans.push(decided.get(kind)!);
  }
  return plans;
}
