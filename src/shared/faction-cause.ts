/**
 * faction-cause.ts — "why did that faction change?", guessed from what the log wrote just before it.
 *
 * EQ's own faction-standing line names no cause at all — `"Your faction standing with X has been
 * adjusted by -3."` states nothing about what did it, and neither does the floor/ceiling wording. Two
 * signals are available, both **proximity**, not a parsed fact:
 *
 *   - **A kill.** A mob that mattered to a faction lands, in the log, within `CORRELATION_WINDOW_SEC`
 *     of the faction line it caused — **on either side of it**, not only before (see the header's own
 *     note on log order below). Only the most recent kill counted as yours (ADR 0027 — a bystander's
 *     kill at a busy camp must not be blamed) is ever a candidate.
 *   - **A conversation.** A quest turn-in has no kill behind it at all, but it does have an NPC
 *     talking to you — "Bob says, '...'" or "Bob tells you, '...'". When no kill explains a hit, the
 *     most recent such line within `DIALOGUE_WINDOW_SEC` *before* it is offered instead, quoting what
 *     was actually said so the reader can judge it rather than trusting a name alone.
 *
 * **The kill signal is checked both ways because a real log showed it has to be.** A survey of the
 * author's own 52 MB log found that this server logs a kill's faction/XP/coin consequences *before*
 * the "You have slain X!" confirmation and the finishing blow's own damage line — reliably, not as an
 * occasional quirk:
 *
 *     Your faction standing with Frogloks of Guk has been adjusted by -5.
 *     You gain party experience! (0.666%)
 *     You receive 7 gold, 8 silver and 1 copper from the corpse.
 *     You hit a froglok priest for 32 points of magic damage by Lightning Bolt.
 *     A froglok priest's body spasms as the lightning bolt arcs through them.
 *     You have slain a froglok priest!
 *
 * Cross-referencing the same player's real `faction-log.json` against `kill-log.json` found that of
 * every raise/lower hit the ledger had *no* cause for, 83% (896 of 1079) had one of the player's own
 * kills landing at the same logged second or up to a few seconds *after* the hit — this ordering,
 * not the 3-second window being too tight (10 hits) or a genuinely absent signal (173 hits, presumably
 * turn-ins), was the dominant reason coverage was low. Checking only backward, as this module did
 * before that survey, missed the clear majority of real kills for no better reason than which text
 * the server happens to flush to the log first. Callers (`main.ts`, `log-import.ts`) hold a faction
 * event for `CORRELATION_WINDOW_SEC` before calling `resolve` on it, precisely so a kill logged a
 * moment later still gets the chance this finding says it deserves — see their own headers.
 *
 * **This is an inference, not an observation, and it says so everywhere it's carried.** Every parser
 * elsewhere in this app reads a fact the log states outright, checked against a real captured line
 * first (`specs/log-watching/README.md`'s whole discipline). This is different in kind: nothing in a
 * real log has confirmed *how close together* EQ Legends logs a kill (or a conversation) and the
 * standing change it causes — that's a reasoned guess about the game's own ordering, not a verified
 * fact. `FactionCause` is carried as a guess through the ledger and the UI, never folded into a
 * standing's `net` as though it were certain. Tighten or correct either window — or the whole
 * approach — the moment a real log shows the true gap (see
 * [ADR 0219](../../specs/decisions/0219-a-faction-cause-is-a-guess-from-timing.md) and
 * [ADR 0220](../../specs/decisions/0220-a-conversation-can-be-the-guessed-cause-too.md)).
 *
 * **The dialogue signal has a limit the kill signal doesn't, though a narrow window keeps it rare in
 * practice.** `countsKill` (ADR 0027) already tells a bystander's kill from your own; nothing here
 * can tell an NPC's reply from a nearby player's `says` or a friend's private `tells you` — the log
 * writes both exactly the same way, the same ambiguity `cast-alerts.ts`'s `isNamedCaster` documents
 * for a caster's name. A false match needs several things to coincide at once: a faction hit with no
 * kill near it at all (already the minority of hits), someone else's chat landing inside the same
 * `DIALOGUE_WINDOW_SEC` window, and that chat being the only thing said in it — compounding
 * rarities, not a first-order concern, which is why the answer is keeping the window narrow rather
 * than trying to tell speakers apart with data this app doesn't have. Exposed as a clearly-labeled
 * guess regardless, since rare is not the same as never.
 *
 * The **speaker's name** is a much narrower claim than the quoted sentence, and one already-cached,
 * already-tested data answers cleanly: a quest's wiki page states its "Quest giver" in a structured
 * table row (`electron/wiki/parse.ts`'s `parseQuestInfo`), gathered on the same cache walk the Items
 * tab already runs (`electron/wiki/index.ts`'s `buildCatalogue`, ADR 0163) and exposed as
 * `WikiClient.questGiverSource()`. When the dialogue guess's speaker matches a known giver, every
 * quest they're known to give rides along as `FactionCause.quests` — one proper noun against a clean
 * table cell, not prose against prose (ADR 0221).
 *
 * **Narrowing further, from the quoted text itself, only within that giver's own small handful of
 * quests.** A survey of real eqlwiki quest pages found dialogue scattered across `<dl><dd>`, plain
 * `<p>`, `<ul><li>` and `<blockquote>` inconsistently, with hand-transcription errors here and there —
 * so matching a logged line against the *whole wiki's* dialogue would be trusting a lot of unreliable
 * text. But once the giver is already known, the search is a handful of that giver's own quests, not
 * the wiki — a claim small and cheap enough to actually attempt (ADR 0223). `deps.questDialogue`
 * supplies each candidate quest's own extracted lines, and `fuzzyScore`
 * ([src/shared/fuzzy.ts](./fuzzy.ts), already proven for the search box) ranks them against the
 * observed text; a match above `DIALOGUE_MATCH_MIN_SCORE` narrows `FactionCause.quests` to just the
 * quest(s) that resembled it, `questsMatched: true`. No match — including no dialogue cached to check
 * at all — falls back to the giver's full, unnarrowed list, `questsMatched: false`: a second guess is
 * only ever an improvement on the first, never a way to lose information the first guess already had.
 *
 * Both wiki lookups are injected (`FactionCauseTrackerDeps.questGiver`/`questDialogue`) rather than
 * importing the wiki client directly, so this module stays pure and testable without one.
 *
 * Modeled on [dot-attribution.ts](./dot-attribution.ts)'s note/resolve shape: fed every kill and every
 * line worth remembering, asked about every faction hit (or an unattributed coin line — see
 * `explainUnsourcedCoin`), stateless apart from the one kill and one line of dialogue it holds onto.
 *
 * **A guess repeated is a guess corroborated.** `electron/faction-log.ts`'s `foldCause` already keeps
 * a running `hits` count per (kind, source) on every `FactionStanding` — an artifact of folding causes
 * forward (ADR 0056), not something built for this. `causeConfidence`/`causeConfidenceWhy` below just
 * read that count through [estimates.ts](./estimates.ts)'s generic sample-size ladder
 * (`confidenceOf`), the same one this app already leans on for a respawn or a drop rate. The case that
 * actually matters is the dialogue guess: the false-positive story above (a nearby player, a name
 * collision) would have to repeat itself — the *same* name landing beside the *same* faction more than
 * once — to keep producing the same row, which compounds the improbability well past a single hit.
 * Nothing here changes when a `FactionCause` is attached or what it says; it only grades how much the
 * *pattern* across every hit on record is worth believing, never the lone guess on its own.
 */
import { confidenceOf, type Confidence, type SampleScale } from "./estimates";
import { count } from "./format";
import { fuzzyRank } from "./fuzzy";
import type { FactionCause, FactionCauseTally, FactionEvent, FactionRecord, LogLine } from "./types";

/**
 * How far apart a kill and the faction line it caused may be, **either direction** (see the module
 * header) — wide enough to survive the log's one-second timestamp resolution, this server's own habit
 * of logging a kill's consequences before its confirmation, and a beat of processing lag; narrow
 * enough that a busy camp's *next* kill can't reach past it and steal credit for an unrelated hit.
 *
 * The direction was wrong until a real log said so (see the module header); the width itself remains
 * a starting guess, not a measurement.
 */
export const CORRELATION_WINDOW_SEC = 3;

/**
 * How long after a line of NPC dialogue a faction (or coin) line can still plausibly be blamed on it.
 * Wider than the kill window on purpose: a turn-in is a multi-step interaction — hailing, clicking
 * through dialogue options, handing an item over — not an instant the way a kill's adjustment is, so
 * the gap between "the NPC last said something" and "the standing changed" is expected to be longer.
 *
 * **Unverified, and more of a guess than `CORRELATION_WINDOW_SEC` even is** — see the module header.
 */
export const DIALOGUE_WINDOW_SEC = 15;

/**
 * "Name says, '...'" / "Name tells you, '...'" — the two shapes a captured real line
 * (`Bristlebane tells you, 'The trickster smiles upon you.'`, `fixtures/sample-eqlog.txt`) and the
 * wiki's own quest-dialogue transcriptions both use. Deliberately loose about the trailing
 * punctuation (a wiki transcription is inconsistent about a closing period; nothing has confirmed
 * whether the live log always includes one either) and about a comma before the quote (seen both
 * ways in the fixtures examined for ADR 0220).
 *
 * Matches **any** name, not just known NPCs — there is no registry of NPC names to check against
 * (unlike a mob, which `mob-knowledge.ts` has learned from kills), so this cannot and does not try to
 * exclude a player's chat. See the module header's limit.
 */
const DIALOGUE_RE = /^(?<npc>.+?) (?:tells you|says),?\s+'(?<text>.+?)'\.?$/;

/**
 * How well the observed line has to resemble a candidate quest's own dialogue before that quest is
 * trusted over its siblings. `fuzzyScore` was tuned for short item-name queries, not sentence-length
 * prose, so this is a starting guess the same way the two time windows are — not a measurement.
 */
export const DIALOGUE_MATCH_MIN_SCORE = 0.5;

/**
 * Where a cause's own `hits` count stops reading as a single coincidence and starts reading as a
 * pattern — see the module header's "a guess repeated is a guess corroborated". A kill's cause is
 * already fairly trustworthy on its first hit (ADR 0027 already excludes a bystander's kill); this
 * bar is really about the dialogue guess, where a false match needs the *same* name to land beside
 * the *same* faction more than once by coincidence — meaningfully rarer than a single false positive.
 * That's why the ladder sits far lower than [drop-truth.ts](./drop-truth.ts)'s 15/50 or
 * [spawn-timers.ts](./spawn-timers.ts)'s 3/8: two hits already says something here. Unverified, the
 * same way the two time windows above are — a starting guess about *how much* more to trust a repeat,
 * not a measurement.
 */
export const FACTION_CAUSE_SAMPLES: SampleScale = { fair: 2, solid: 4 };

/**
 * How much to trust one line of `FactionStanding.causes` — the same mob or NPC named as the cause of
 * `tally.hits` separate faction hits, not the single, isolated guess the module header worries about.
 */
export function causeConfidence(tally: Pick<FactionCauseTally, "hits">): Confidence {
  return confidenceOf(tally.hits, FACTION_CAUSE_SAMPLES);
}

/** The tooltip behind `causeConfidence` — spells out what the count means so "solid" doesn't read as
 *  proof, only as a pattern worth more than a lone guess. */
export function causeConfidenceWhy(tally: Pick<FactionCauseTally, "kind" | "hits">): string {
  const seen = count(tally.hits, "hit");
  const repeat = tally.kind === "kill" ? "the same mob" : "the same name";
  switch (causeConfidence(tally)) {
    case "solid":
      return `Named across ${seen} — ${repeat} keeps landing beside this faction, which a coincidence would have to repeat every time to fake.`;
    case "fair":
      return `Named across ${seen} — more than a single coincidence, though still a small sample.`;
    default:
      return `Named across only ${seen} so far — could easily be a one-off. More hits would say more.`;
  }
}

export interface FactionCauseTrackerDeps {
  /**
   * Every quest `npc` is a known giver of, from the wiki's own cache (see the module header). Best-
   * effort and optional: no dependency given, or an empty/absent result, just means the dialogue
   * guess names the speaker and nothing more.
   */
  questGiver?: (npc: string) => string[] | undefined;
  /**
   * A quest's own dialogue lines, by title — used to narrow `questGiver`'s candidates down to
   * whichever one's own text the observed line actually resembles. Optional: without it (or with
   * nothing cached for every candidate), `quests` stays every quest the giver is known for, unnarrowed.
   */
  questDialogue?: (questTitle: string) => { npc: string; text: string }[] | undefined;
}

/**
 * Narrow `candidates` (every quest a giver is known for) to whichever ones a candidate quest's own
 * dialogue resembles `text` — or hand `candidates` back unnarrowed, `matched: false`, when there's
 * nothing to compare against or nothing beat the threshold. A single candidate is returned as-is
 * without spending a comparison on it: there is nothing left to narrow *to*.
 */
function narrowByDialogue(
  candidates: string[],
  text: string,
  questDialogue?: (questTitle: string) => { npc: string; text: string }[] | undefined,
): { quests: string[]; matched: boolean } {
  if (candidates.length <= 1 || !questDialogue) return { quests: candidates, matched: false };
  const lines: { quest: string; text: string }[] = [];
  for (const quest of candidates) {
    for (const line of questDialogue(quest) ?? []) lines.push({ quest, text: line.text });
  }
  if (!lines.length) return { quests: candidates, matched: false };
  const ranked = fuzzyRank(text, lines, (l) => l.text, { minScore: DIALOGUE_MATCH_MIN_SCORE, limit: lines.length });
  if (!ranked.length) return { quests: candidates, matched: false };
  // A quest can win on more than one of its own lines; keep each candidate once, best match first.
  const seen = new Set<string>();
  const quests: string[] = [];
  for (const r of ranked) {
    if (seen.has(r.item.quest)) continue;
    seen.add(r.item.quest);
    quests.push(r.item.quest);
  }
  return { quests, matched: true };
}

export interface FactionCauseTracker {
  /** A kill worth remembering as a possible cause. The caller decides which ones count — typically
   *  only a kill that already counts as yours (ADR 0027), the same gate scores and goals use. */
  noteKill(mob: string, at: string): void;
  /**
   * Offer every raw line a look, so a line of NPC dialogue can be remembered without needing its own
   * event kind. Cheap on purpose — this is a single regex test and, on a match, overwriting one slot;
   * nothing here searches or accumulates a history of dialogue (see the module header).
   */
  noteLine(line: LogLine): void;
  /**
   * The event, with a likely cause attached if a noted kill or line of dialogue landed within its
   * window — a kill checked first, dialogue only when nothing was close enough to blame on a kill.
   * Never mutates its input; hands back the same shape unchanged when nothing was close enough.
   */
  resolve(event: FactionEvent): FactionRecord;
  /**
   * The same guess, for a coin line `kill-log.ts` couldn't tie to any of your own kills — a real,
   * ordinary case (ADR 0047), not a hypothetical one. There is no ledger that tracks *why* you got
   * money the way `faction-log.ts` tracks a faction's standing, so this is for a debug-log line
   * only — `undefined` when nothing was close enough either.
   */
  explainUnsourcedCoin(at: string): FactionCause | undefined;
}

export function createFactionCauseTracker(deps: FactionCauseTrackerDeps = {}): FactionCauseTracker {
  let lastKill: { mob: string; at: number } | null = null;
  let lastDialogue: { npc: string; text: string; at: number } | null = null;

  /** The shared guess behind both `resolve` and `explainUnsourcedCoin`: a kill first, then dialogue. */
  function guess(atIso: string): FactionCause | undefined {
    const at = Date.parse(atIso);
    if (lastKill) {
      // Both directions, deliberately — see the module header. `gapSec` reports how far apart the
      // two lines are, not which came first: the log's own order here is an artifact of how this
      // server flushes its output, not a fact worth asserting to the reader.
      const gapSec = Math.abs(at - lastKill.at) / 1000;
      if (gapSec <= CORRELATION_WINDOW_SEC) return { kind: "kill", mob: lastKill.mob, gapSec };
    }
    if (lastDialogue) {
      const gapSec = (at - lastDialogue.at) / 1000;
      if (gapSec >= 0 && gapSec <= DIALOGUE_WINDOW_SEC) {
        const givenBy = deps.questGiver?.(lastDialogue.npc) ?? [];
        const { quests, matched } = narrowByDialogue(givenBy, lastDialogue.text, deps.questDialogue);
        return {
          kind: "dialogue",
          npc: lastDialogue.npc,
          text: lastDialogue.text,
          gapSec,
          ...(quests.length ? { quests, questsMatched: matched } : {}),
        };
      }
    }
    return undefined;
  }

  return {
    noteKill(mob, at) {
      lastKill = { mob, at: Date.parse(at) };
    },

    noteLine(line) {
      const m = line.message.match(DIALOGUE_RE);
      if (!m?.groups) return;
      lastDialogue = { npc: m.groups.npc.trim(), text: m.groups.text.trim(), at: Date.parse(line.at) };
    },

    resolve(event) {
      const causedBy = guess(event.at);
      return causedBy ? { ...event, causedBy } : event;
    },

    explainUnsourcedCoin: (at) => guess(at),
  };
}
