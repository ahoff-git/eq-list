/**
 * cast-suggestions.ts — a curated menu of crowd-control spells worth alerting on.
 *
 * A cast-alert watch matches by substring against a cast spell's name (see cast-alerts.ts), but
 * EQ names most crowd control off-theme: this server's root is "Instill", a fear is "Screaming
 * Terror", a charm is "Beguile". Typing all of those from memory is the hard part, so the
 * Settings panel offers this list — grouped by what the spell does — as one-click additions.
 *
 * Each suggestion's `spell` is the substring to watch (the same thing a hand-typed watch holds),
 * chosen to catch a whole family: "Terror" catches Screaming Terror and the Terror-of-* fears,
 * "Cajol" catches Cajoling Whispers. Pure data, so the renderer that draws it and the test that
 * pins it down share one source. Categories and picks were checked against eqlwiki.com.
 */

export interface CastSuggestion {
  /** The substring to watch for (case-insensitive), matched against a cast spell's name. */
  spell: string;
  /** What this catches — shown as a tooltip so the substring isn't a mystery. */
  note: string;
}

export interface CastSuggestionGroup {
  /** The crowd-control family this covers. */
  category: string;
  suggestions: CastSuggestion[];
}

export const CAST_SUGGESTIONS: readonly CastSuggestionGroup[] = [
  {
    category: "Fear",
    suggestions: [
      { spell: "Fear", note: "Fear, Invoke Fear, Inspire Fear, Wave of Fear" },
      { spell: "Terror", note: "Screaming Terror, Terror of Death / Darkness / Thule" },
      { spell: "Panic", note: "Panic Animal, Panic the Dead" },
    ],
  },
  {
    category: "Mez",
    suggestions: [
      { spell: "Mesmeri", note: "Mesmerize, Mesmerization" },
      { spell: "Enthrall", note: "Enthrall — enchanted sleep (enchanter mez)" },
    ],
  },
  {
    category: "Charm",
    suggestions: [
      { spell: "Charm", note: "Charm, Charm Animals" },
      { spell: "Beguile", note: "Beguile (enchanter charm)" },
      { spell: "Allure", note: "Allure, Allure of the Wild" },
      { spell: "Cajol", note: "Cajoling Whispers (enchanter charm)" },
      { spell: "Dominate", note: "Dominate Undead" },
    ],
  },
  {
    category: "Root",
    suggestions: [
      { spell: "Root", note: "Root, Engulfing / Grasping / Enveloping Roots" },
      { spell: "Instill", note: "This server's root line — parks a mob in place" },
      { spell: "Enstill", note: "Classic-server spelling of the Instill root" },
      { spell: "Immobil", note: "Immobilize" },
      { spell: "Fetter", note: "Fetter (higher-level root)" },
      { spell: "Paralyz", note: "Paralyzing Earth" },
    ],
  },
];

/** Fold a watch/suggestion substring for comparison — the same trim + case rule matchCast uses. */
function needleOf(spell: string): string {
  return spell.trim().toLowerCase();
}

/**
 * Is this suggestion already on the watch list? True when a watch holds the same substring
 * (case-insensitive), so the UI can show it as added rather than offer a duplicate.
 */
export function isWatched(watches: { spell: string }[], suggestion: CastSuggestion): boolean {
  const needle = needleOf(suggestion.spell);
  return watches.some((w) => needleOf(w.spell) === needle);
}
