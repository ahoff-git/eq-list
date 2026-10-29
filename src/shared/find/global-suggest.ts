import { fuzzyScore } from "../fuzzy";
import { gradedTitle } from "../items/item-upgrade";
import type { AcrossMatches } from "./find-across";
import type { SearchResult } from "../types";
import type { InventoryTotal } from "../game-export-dumps";

/** Where picking a suggestion takes you. */
export type SuggestionTarget = { section: string } | { page: string } | { lookUp: string };

export type SuggestionKind = "section" | "page" | "held" | "stance" | "invocation" | "aa";

/** One line of the search bar's autocomplete. */
export interface Suggestion {
  kind: SuggestionKind;
  /** What the line says, and what the ghost completes towards. */
  label: string;
  /** The muted half: an area, where you hold it, what kind of thing it is. */
  detail: string;
  target: SuggestionTarget;
}

/** A section the bar can jump to, as the shell names it. */
export interface SectionChoice {
  key: string;
  label: string;
  area: string;
}

export interface SuggestInputs {
  text: string;
  sections: readonly SectionChoice[];
  /** The wiki's title matches for the settled text (`wiki.search`). */
  wiki: readonly SearchResult[];
  /** Your inventory, stances and AAs matched the way Search's box matches them (`findAcross`). */
  across: AcrossMatches;
  /** What you picked lately, most recent first. */
  recent: readonly Suggestion[];
}

/** How many lines the bar shows, and how many of them may be sections. */
export const SUGGEST_LIMIT = 8;
const SECTION_LIMIT = 3;

/**
 * Nudges on top of the fuzzy score, so the likelier of two equal matches comes first: something
 * you picked before, then something you own. An out-of-era page is pushed down, not hidden — it
 * is still the page for that name.
 */
const BOOST = { recent: 0.15, held: 0.1, outOfEra: -0.1, namePrefix: 0.3, wordPrefix: 0.1 };
/** A sections match below this is noise: "moonstone" half-matching "Mounts". */
const SECTION_MIN_SCORE = 0.6;
/** `findAcross` matched it (maybe in a description), so it's worth a line even when the name scores low. */
const ACROSS_FLOOR = 0.5;

/** Where a held item is, briefly: the first two places, and how many more. */
function placesText(h: InventoryTotal): string {
  const labels = h.places.map((p) => p.label);
  return labels.slice(0, 2).join(", ") + (labels.length > 2 ? ` +${labels.length - 2}` : "");
}

/**
 * How well a name answers what's typed, for autocomplete: the fuzzy score, plus a lift when the name
 * *starts* with it and a smaller one when a word in it does. The fuzzy score alone rates "moon" as a
 * perfect hit on every name with the word Moon in it, which put Chase the Moon above Moonstone.
 */
function matchScore(q: string, label: string): number {
  const lq = norm(q);
  const ll = norm(label);
  const lift = ll.startsWith(lq) ? BOOST.namePrefix : ll.split(/\s+/).some((w) => w.startsWith(lq)) ? BOOST.wordPrefix : 0;
  return fuzzyScore(q, label) + lift;
}

const sectionSuggestion = (c: SectionChoice): Suggestion => ({ kind: "section", label: c.label, detail: c.area, target: { section: c.key } });

const keyOf = (s: Pick<Suggestion, "target">) => JSON.stringify(s.target);
const norm = (s: string) => s.trim().toLowerCase();

/**
 * The search bar's autocomplete: sections, wiki pages, what you hold, stances, invocations and AAs,
 * ranked together by one fuzzy score with small nudges (`BOOST`) rather than group by group — so
 * "moon" puts your Moonstone Ring above a section called Mounts.
 *
 * A wiki page you also hold is one line, not two: the held line (it says where) opens the page.
 * With nothing typed, it's what you picked lately — or, before you've picked anything, every section.
 */
export function globalSuggestions({ text, sections, wiki, across, recent }: SuggestInputs): Suggestion[] {
  const q = text.trim();
  if (!q) return recent.length ? recent.slice(0, SUGGEST_LIMIT) : sections.map(sectionSuggestion);

  const scored = new Map<string, { s: Suggestion; score: number }>();
  const offer = (s: Suggestion, score: number) => {
    const key = keyOf(s);
    const had = scored.get(key);
    if (!had || score > had.score) scored.set(key, { s, score });
  };
  const recentKeys = new Set(recent.map(keyOf));
  const nudge = (s: Suggestion) => (recentKeys.has(keyOf(s)) ? BOOST.recent : 0);

  const sectionHits = sections
    .map((c) => ({ c, score: matchScore(q, c.label) }))
    .filter((h) => h.score >= SECTION_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, SECTION_LIMIT);
  for (const { c, score } of sectionHits) {
    const s = sectionSuggestion(c);
    offer(s, score + nudge(s));
  }

  const heldByName = new Map(across.held.shown.map((h) => [norm(h.baseName), h]));
  for (const r of wiki) {
    if (heldByName.has(norm(r.title))) continue; // the held line below stands for it
    const s: Suggestion = { kind: "page", label: r.title, detail: r.outOfEra ? "wiki · out of era" : "wiki", target: { page: r.title } };
    offer(s, matchScore(q, r.title) + (r.outOfEra ? BOOST.outOfEra : 0) + nudge(s));
  }
  for (const h of across.held.shown) {
    const title = gradedTitle(h.baseName, h.bestGrade);
    const s: Suggestion = { kind: "held", label: title, detail: `you hold ${h.count} · ${placesText(h)}`, target: { page: title } };
    offer(s, Math.max(ACROSS_FLOOR, matchScore(q, h.baseName)) + BOOST.held + nudge(s));
  }
  for (const a of across.abilities.shown) {
    const s: Suggestion = { kind: a.kind, label: a.name, detail: a.kind, target: { lookUp: a.name } };
    offer(s, Math.max(ACROSS_FLOOR, matchScore(q, a.name)) + nudge(s));
  }
  for (const aa of across.aas.shown) {
    const s: Suggestion = { kind: "aa", label: aa.name, detail: "AA", target: { lookUp: aa.name } };
    offer(s, Math.max(ACROSS_FLOOR, matchScore(q, aa.name)) + nudge(s));
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.s.label.length - b.s.label.length || a.s.label.localeCompare(b.s.label))
    .slice(0, SUGGEST_LIMIT)
    .map((x) => x.s);
}

/**
 * The rest of the best suggestion that *starts* with what you typed, for the greyed ghost behind
 * the caret — or undefined when none does. Only a prefix can be ghosted; a contains or near-miss
 * match is in the list instead.
 */
export function ghostCompletion(text: string, suggestions: readonly Suggestion[]): string | undefined {
  if (!text.trim()) return undefined;
  const hit = suggestions.find((s) => s.label.toLowerCase().startsWith(text.toLowerCase()) && s.label.length > text.length);
  return hit?.label.slice(text.length);
}

/** `recent` with `picked` moved to the front, without duplicates, capped. */
export function rememberPick(recent: readonly Suggestion[], picked: Suggestion): Suggestion[] {
  return [picked, ...recent.filter((s) => keyOf(s) !== keyOf(picked))].slice(0, SUGGEST_LIMIT);
}
