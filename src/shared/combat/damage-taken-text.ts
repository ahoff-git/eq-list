/**
 * damage-taken-text.ts — the words for a resist suggestion, in one place so the status bar's pill and
 * the loadout builder's section say the same thing the same way.
 *
 * Pure → a tested black box.
 */
import { statMeta } from "../items/item-stats";
import { figure, percent } from "../format";
import type { AcSuggestion } from "./ac-headroom";
import { DAMAGE_WINDOWS, type DamageWindow } from "./damage-window";
import type { ResistRow } from "./resist-worth";
import type { HpSuggestion, ManaSuggestion, Strain } from "./strain";

/** A damage type as a heading: "fire" → "Fire". */
export const typeLabel = (type: string): string => `${type[0]!.toUpperCase()}${type.slice(1)}`;

/**
 * What the words are about: one of the windows the builder reads over, or a single `"fight"` — the one on
 * show in the fight analytics, where a death is itself the evidence and "N of M fights" would be silly.
 */
export type AdviceScope = DamageWindow | "fight";

/** The scope as a phrase to end a sentence with: "since you arrived here", "this sitting", "in this fight". */
const windowPhrase = (scope: AdviceScope): string =>
  scope === "fight" ? "in this fight" : (DAMAGE_WINDOWS.find((w) => w.key === scope)?.phrase ?? "");

/** What to call the resist that answers a type: the item stat's own label ("SV Fire"). */
export function resistLabel(row: Pick<ResistRow, "type" | "stat">): string {
  return row.stat ? statMeta(row.stat).label : `${typeLabel(row.type)} resist`;
}

/** The AC suggestion as a sentence: melee is no resist's business, and the builder's loadout reaches more armour. */
export function describeAcSuggestion(s: AcSuggestion, scope: AdviceScope): string {
  return `Melee is ${percent(s.share)} of the damage that landed on you ${windowPhrase(scope)}, and no resist touches it. You wear ${s.wearing} AC; the loadout the builder planned for your goals reaches ${s.loadout} (+${s.gain}).`;
}

/**
 * The health suggestion as a sentence: you keep dying — or, for one fight, you died in it and here is what
 * landed on you first — and more health helps whatever did it.
 */
export function describeHpSuggestion(s: HpSuggestion, scope: AdviceScope): string {
  const died =
    scope === "fight"
      ? `You died in this fight${s.burst ? `, after ${figure(s.burst.taken)} damage in the last ${s.burst.windowSec}s` : ""}.`
      : `You died in ${s.died} of ${s.fights} fights ${windowPhrase(scope)}.`;
  // Said against the burst when there is one, so a gain too small to have mattered reads as exactly that
  // rather than leaving the reader to set +59 beside 3,723.
  const against = s.burst ? `, about ${percent(s.gain / s.burst.taken, { places: 1 })} of that burst` : "";
  return `${died} More health helps whatever did it: your gear gives ${s.wearing} and the loadout the builder planned for your goals reaches ${s.loadout} (+${s.gain}${against}).`;
}

/** The mana suggestion as a sentence: you ran dry mid-fight, and the loadout reaches a bigger pool. */
export function describeManaSuggestion(s: ManaSuggestion, scope: AdviceScope): string {
  const ran = scope === "fight" ? "You ran out of mana in this fight." : `You ran out of mana in ${s.dry} of the ${s.casting} fights you cast in ${windowPhrase(scope)}.`;
  return `${ran} Your gear gives ${s.wearing} mana; the loadout the builder planned for your goals reaches ${s.loadout} (+${s.gain}).`;
}

/** One suggestion, as the short label the pill and the section's header carry and the sentence behind it. */
export interface Advice {
  label: string;
  sentence: string;
}

/**
 * Whatever has been found worth suggesting, however it was found — over a window of fights (`useDamageTaken`)
 * or in the one on show (`survival.ts`) — so the words and their order are the same everywhere.
 */
export interface Found {
  ac: AcSuggestion | null;
  resists: readonly ResistRow[];
  mana: ManaSuggestion | null;
  hp: HpSuggestion | null;
}

/**
 * Everything worth saying, in the order it is said: armour (when it applies, melee is most of what you
 * take), the resists, mana — and health last, the one that helps whatever did it. The first is the pill's
 * face, so it is what the player is told first.
 */
export function adviceOf(found: Found, scope: AdviceScope): Advice[] {
  return [
    ...(found.ac ? [{ label: `AC +${found.ac.gain}`, sentence: describeAcSuggestion(found.ac, scope) }] : []),
    ...found.resists.map((r) => ({ label: `${resistLabel(r)} ${percent(r.share)}`, sentence: describeSuggestion(r, scope) })),
    ...(found.mana ? [{ label: `Mana +${found.mana.gain}`, sentence: describeManaSuggestion(found.mana, scope) }] : []),
    ...(found.hp ? [{ label: `HP +${found.hp.gain}`, sentence: describeHpSuggestion(found.hp, scope) }] : []),
  ];
}

/**
 * What the window's fights say about dying and running dry, flagged or not — so the figures are there
 * to read before they are enough to suggest anything. Empty when there is nothing to report.
 */
export function describeStrain(s: Strain): string {
  if (!s.fights) return "";
  const died = `Died in ${s.died} of ${s.fights} fights`;
  return s.casting ? `${died}; ran out of mana in ${s.dry} of the ${s.casting} you cast in.` : `${died}.`;
}

/** The suggestion as a sentence — the pill's hover and the section's own line. */
export function describeSuggestion(row: ResistRow, scope: AdviceScope): string {
  const phrase = windowPhrase(scope);
  const label = resistLabel(row);
  const gear = row.points === undefined ? "" : ` Your gear gives ${row.points} ${label}.`;
  return `${typeLabel(row.type)} is ${percent(row.share)} of the damage that landed on you ${phrase}.${gear} +30 ${label} would cut about ${percent(row.saved, { places: 1 })} of what you take.`;
}
