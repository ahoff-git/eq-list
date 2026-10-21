/**
 * held-name.ts — what the name of a thing you hold says about it.
 *
 * The game names a held item with everything it is: `Gnoll Slayer +3` (its grade), `Backpack*` (a
 * variant marker), `Minotaur Horn (Exaltation)` (a stone carrying one of that item's effects). Every
 * reader that shows, counts or weighs a held thing needs the same three answers — which page it is,
 * at what grade, and whether it's a stone — so they're read here, once, rather than with a regex
 * apiece (ADR 0312: shown and counted at its level).
 */
import { itemBaseName, itemGrade } from "../names";

const EXALTATION_RE = /\s*\(Exaltation\)\s*$/i;

export interface HeldName {
  /** The item page's title: no grade, no marker, no `(Exaltation)`. */
  title: string;
  /** Its `+N`; 0 when the name states none. A stone has no grade of its own. */
  grade: number;
  /** An exaltation stone (`… (Exaltation)`) — an effect from `title`, not the item itself. */
  exaltation: boolean;
}

/** Is this the name of an exaltation stone? */
export function isExaltation(name: string): boolean {
  return EXALTATION_RE.test(name);
}

export function heldName(name: string): HeldName {
  const exaltation = isExaltation(name);
  const bare = name.replace(EXALTATION_RE, "").replace(/\*\s*$/, "").trim();
  return { title: itemBaseName(bare), grade: exaltation ? 0 : (itemGrade(bare) ?? 0), exaltation };
}
