/**
 * cast-suggestions.ts — a curated menu of things worth alerting on.
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
 *
 * The same list carries the **raw-text** watches (`onLine`) — a party invite, a tell, a buff
 * leaving you. Those match the whole log line rather than a spell name, and the wording is the part
 * nobody remembers, which is exactly what a suggestion is for.
 *
 * A raw-text suggestion can carry its own `message`, because the words it has to *match* and the
 * words worth reading mid-fight are rarely the same sentence — "the mystical path fades away" is
 * what EQ prints; "Recast Levitate" is what you want on screen.
 */

export interface CastSuggestion {
  /** The substring to watch for (case-insensitive), matched against a cast spell's name. */
  spell: string;
  /** What this catches — shown as a tooltip so the substring isn't a mystery. */
  note: string;
  /**
   * Match whole **log lines** instead of a spell name (see `matchLine`). Such a watch is added
   * with `onCast: false`: it's about what the game said, not about anything being cast.
   */
  onLine?: boolean;
  /** What the chip says, when the substring itself would be cryptic ("invites you" → "Party invite"). */
  label?: string;
  /** The banner's wording, when the sentence being matched isn't one worth reading. */
  message?: string;
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
  {
    // The two fades the parser deliberately won't take: EQ ends both with "fades away.", which is
    // also how it says somebody gated out ("Bunnyslayer fades away."), and no shape tells them
    // apart. As raw text they're unambiguous — the spell's own words can't be a player's name — so
    // the thing a pattern can't do safely, a watch does exactly. Counts are from a real 195k-line
    // log. Neither sentence names its spell, hence the `message`: match EQ's words, read your own.
    category: "Faded",
    suggestions: [
      {
        spell: "mystical path fades away",
        onLine: true,
        label: "Mystical path",
        message: "Mystical path gone",
        note: "“The mystical path fades away.” — 17 in a real log, paired with “A mystical path appears before you.” Raw text, because the sentence ends like a player gating out.",
      },
      {
        spell: "echo of healing fades away",
        onLine: true,
        label: "Echo of healing",
        message: "Echo of healing gone",
        note: "“The echo of healing fades away.” — 15 in a real log. Raw text for the same reason: “fades away.” is also how somebody gating out reads.",
      },
    ],
  },
  {
    // Not spells at all: things said *to you* that are easy to miss with the chat window buried
    // under a fight. Every phrase here was read off a real 95k-line log and checked for what else
    // it would catch — "invites you" hits all six real invites and nothing else, while the shorter
    // "invites" would also fire on players discussing invites in chat.
    category: "Said to you",
    suggestions: [
      { spell: "invites you", onLine: true, label: "Party invite", note: "“<name> invites you to join a group.”" },
      { spell: "asked you to join", onLine: true, label: "Instance invite", note: "“<name> has asked you to join the instance: …” — worded nothing like a group invite, so it needs its own watch" },
      { spell: "tells you", onLine: true, label: "Tell", note: "A private message: “<name> tells you, '…'” — the chattiest of these by far" },
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
