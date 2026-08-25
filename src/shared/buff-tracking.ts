/**
 * buff-tracking.ts — which of your buffs are up, which have lapsed, and what to say about it.
 *
 * The question this answers is the one a buffing class asks all evening: *is my Thistlecoat still
 * on?* The log can answer it, and until now nothing collected the answer.
 *
 * ## What the log gives us, and what it doesn't
 *
 * A buff **ending** is well served. [log-watching](../../specs/log-watching/README.md) measured all
 * three shapes on a real 15MB log, and two of them name the spell outright:
 *
 *     Your Thorns spell has worn off of Bloop.        134 lines — spell and target, both named
 *     Your pet's Burst of Strength spell has worn off.  63 lines — spell named, target is the pet
 *     The spirit of wolf leaves you.                  248 lines — names nothing at all
 *
 * The third is the majority and it names nothing, which is what
 * [spell-strings.ts](./spell-strings.ts) is for: the game's own `spells_us_str.txt` holds that
 * sentence against the spell that writes it. So all three become "this spell, on this target,
 * stopped".
 *
 * A buff **starting** is worse served, and the shortfall shapes everything here. `You begin casting
 * Spirit of Wolf.` names the spell and no target; a landing line names the target and no spell. Only
 * together do they say who got what, and neither is guaranteed to appear — plenty of spells land in
 * silence. So a buff going up is assembled from whatever turned up, and an instance whose target we
 * never learned is a legitimate state rather than a hole to fill with a guess.
 *
 * ## The rules that are actually decisions
 *
 * **A sentence is not a spell, and where it is ambiguous the answer is what is already up.** 358
 * obtainable fade sentences belong to more than one spell (`Shield of Thistles` and `Shield of
 * Thorns` share `The brambles fall away.`). The tempting fix is to scale by rank or guess by level;
 * the honest one is free — if one of the candidates is currently up and the others aren't, the fade
 * is about that one. Where that doesn't decide it, the row says *which* it couldn't decide between
 * rather than picking, because a reminder to recast the wrong rank is worse than one that admits it.
 * This is **eql-alerts**' emote gate turned round: they narrow a shared *landing* by your own recent
 * cast, we narrow a shared *fade* by what we already watched land.
 *
 * **A lapse is a state, not an event.** An alert fires once and is gone; "Thorns is down" stays true
 * until you cast it again, and that is the thing worth putting on screen. So a lapse is held until
 * something ends it — a recast, or the player dismissing it — which is why this module models
 * `lapsed` as a list rather than treating a fade as a notification and forgetting it.
 *
 * **Your death lapses your buffs quietly.** Dying strips everything on you, so a death produces a
 * dozen lapses at once — and a dozen banners at once is not information. The lapses are recorded (the
 * panel *is* the answer to "what do I need re-buffed") and the banners are suppressed. Precedent, not
 * invention: [ADR 0082](../../specs/decisions/0082-an-alert-can-be-scheduled.md) already rules that
 * `cancelOnDeath` drops a short cue because "recast it" is noise from a corpse.
 *
 * **Permanent buffs are tracked, and labelled.** On EQL a large set of classic short buffs never
 * expire (`PERMANENT_FORMULAS` in [spell-file.ts](./spell-file.ts)). They are still worth tracking —
 * a permanent buff is still dispelled and still lost on death — but a *lapse* of one means something
 * different, so the row says so instead of implying a timer ran out.
 *
 * **Only buffs, and only yours.** A detrimental spell landing on something is a debuff, which the
 * existing fade watches already cover ([cast-alerts.ts](./cast-alerts.ts)) and which this is not
 * about. And a buff enters the list only on evidence that it *is* a lasting beneficial effect — the
 * spell file saying so, or a landing or fade line existing for it — because a cast alone would
 * enrol every nuke you throw.
 *
 * Pure: no clock of its own, no I/O, no timers. `now` arrives as an argument.
 * [electron/buff-tracker.ts](../../electron/buff-tracker.ts) is the holder that watches the log,
 * persists the choices and raises the alerts.
 */
import { SELF, spellName } from "./combat-parser";

/** The target of a buff on you. Folded to one spelling, since the log writes "you" three ways. */
export const ON_YOU = "you";

/**
 * The target of a buff on your pet. The log says `Your pet's X spell has worn off.` and never names
 * it, so this is the *only* thing it can be called — and it is deliberately the same string
 * `matchFade` puts in front of a `target` condition, so a rule and a buff row read alike.
 */
export const ON_PET = "your pet";

/** A target we never learned: a cast with no landing line and no fade yet. Shown, never guessed at. */
export const ON_UNKNOWN = "";

/**
 * How many buffs the catalogue will hold before the oldest untracked one is dropped.
 *
 * Bounded for the reason every store here is bounded: this grows from observation, and a character
 * who plays for a year should not find a list nothing can scroll. Generous next to a real buff set
 * (a triple-class character maintaining twenty spells is a lot), and it evicts only rows nobody has
 * touched — an unchecked row is a decision and is never evicted, since dropping it would silently
 * re-enable the thing the player switched off.
 */
export const MAX_KNOWN_BUFFS = 200;

/**
 * How long after a cast of yours a landing line can still be attributed to it.
 *
 * Its job is narrowing a *shared* landing sentence to the rank you actually cast, so it needs to
 * cover a cast time plus the gap to the landing line and nothing more. Generous next to the longest
 * buff cast in the game, tight next to anything that could pick up an unrelated cast — and the same
 * order as `LIVE_WITHIN_MS` in [cast-alerts.ts](./cast-alerts.ts), which is bounding the same kind of
 * "these two lines belong together" question.
 */
export const CAST_WINDOW_MS = 20_000;

/** Why a buff stopped. */
export type BuffLapseReason =
  /** The log said it wore off. The ordinary case, and the only one that means a timer ran out. */
  | "faded"
  /** You died, so everything on you went with you. Recorded; deliberately not announced. */
  | "died"
  /** Replaced by a fresh cast of the same spell on the same target — not a lapse anyone wants told. */
  | "recast";

/** What told us a buff went up. */
export type BuffRiseSource =
  /** A landing sentence from the game's own string file — the strong evidence, since it names a target. */
  | "landed"
  /** Your own cast line. Names the spell and no target, so it stands in until a better line arrives. */
  | "cast";

/** One buff, on one target, as the tracker holds it. */
export interface BuffInstance {
  /** `spellKey` — what this is a buff *of*. Several instances can share it (one per target). */
  key: string;
  /** The spell's display spelling, as the file or the log gave it. */
  spell: string;
  /** Who it's on: `ON_YOU`, `ON_PET`, a character's name, or `ON_UNKNOWN`. */
  target: string;
  /** Up now, or lapsed. */
  up: boolean;
  /** When it last changed state, ISO, from the log's clock. */
  at: string;
  /** When it went up, ISO — kept across a lapse so a row can say how long it lasted. */
  since: string;
  /** Why it stopped, when it has. */
  reason?: BuffLapseReason;
  /** How we learned it was up. */
  source: BuffRiseSource;
  /** You cast it, as opposed to somebody buffing you. */
  byYou: boolean;
  /** It has no duration to run out (see `SpellFacts.permanent`), so a lapse means something else. */
  permanent: boolean;
  /**
   * The other spells this could have been, when a shared sentence couldn't be narrowed. Absent is
   * the ordinary case — one sentence, one spell — and a populated list is the row admitting it
   * doesn't know rather than picking.
   */
  alsoCouldBe?: string[];
}

/** What the player has decided about one spell, and what we've seen of it. */
export interface KnownBuff {
  key: string;
  spell: string;
  /**
   * Watch this one. **On by default** — the whole point of the feature is being told, and unlike a
   * spawn timer (where everything you kill is enrolled) the only things here are buffs you cast or
   * were given, which is a set you chose by playing.
   *
   * Unchecking is durable and keeps the row, because that is the difference between the two controls:
   * **uncheck** to silence a spell for good and still see it, **clear** to forget it entirely. A
   * cleared row comes back if you cast the spell again; an unchecked one never speaks again until you
   * check it. Silencing something by deleting it is the mistake
   * [ADR 0092](../../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md) had to
   * fix for dismissed mobs — a dismissal you can't see is one you can't undo.
   */
  tracked: boolean;
  /** Raise a banner when it lapses. On by default, for the same reason as `tracked`. */
  notify: boolean;
  /** Keep "this is down" on screen over the game until it's back up. On by default. */
  onScreen: boolean;
  /** A saved style (`CastAlertSettings.styles`) for its banner; absent wears the buff default. */
  styleId?: string;
  /** It never expires on a clock — read from the game's own file, not guessed. */
  permanent: boolean;
  /** We have seen *you* cast it, as opposed to only ever receiving it. */
  mine: boolean;
  /** How many times we've watched it go up. A rough "is this one you actually maintain". */
  rises: number;
  /** Last seen going up / lapsing, ISO. */
  lastUp?: string;
  lastLapse?: string;
}

/** Everything the Buffs panel draws. `now` travels with it, as `SpawnView`'s does and for the same reason. */
export interface BuffView {
  now: string;
  /** Up right now, longest-held first. */
  active: BuffInstance[];
  /** Lapsed and not yet back — the persistent "not active" list. Most recent first. */
  lapsed: BuffInstance[];
  /** Every spell we know about, and what the player decided about it. */
  known: KnownBuff[];
  /**
   * Whether the game's own string file was found. Without it a fade **on you** names no spell and
   * cannot be attributed, so the panel has to be able to say why it is quieter than expected rather
   * than looking broken.
   */
  lexicon: boolean;
}

/**
 * The catalogue key for a spell: its rank stripped and folded.
 *
 * Rank goes because the log itself is inconsistent about it — a cast line says "Shock of Lightning
 * VI" and every other line says "Shock of Lightning", which is exactly why `spellName` exists — and
 * because "am I still hasted" is not a question about which rank. Where the rank *does* matter it is
 * carried on the instance's display name, not smuggled into the identity.
 */
export function buffKey(spell: string): string {
  return spellName(spell).trim().toLowerCase();
}

/**
 * The canonical form of who a buff is on.
 *
 * The log writes you as `You`, `YOU` and `your`, and a reflexive target ("worn off of yourself") is
 * still you — `combatant` already folds the first three and `matchFade` already folds the reflexive,
 * so this is one more place agreeing with them rather than a fourth opinion.
 */
export function buffTarget(target: string | undefined, pet = false): string {
  if (pet) return ON_PET;
  const trimmed = (target ?? "").trim();
  if (!trimmed) return ON_YOU;
  if (/^(?:you|your|yourself|myself)$/i.test(trimmed)) return ON_YOU;
  if (trimmed === SELF) return ON_YOU;
  return trimmed;
}

/** One buff on one target. Two instances of a spell on two people are two things to keep up. */
export function instanceKey(key: string, target: string): string {
  return `${key} ${target}`;
}

/** How a target reads in a sentence: "you", "your pet", a name, or an admission. */
export function targetLabel(target: string): string {
  return target === ON_UNKNOWN ? "someone" : target;
}

/**
 * Narrow a shared sentence to the spell it was actually about.
 *
 * The candidates come from [spell-strings.ts](./spell-strings.ts), which cannot tell two spells with
 * one sentence apart even in principle. Two things outside that file can, and this applies them in
 * order of how much they prove:
 *
 *  1. **One of them is up.** If the sentence is a fade and exactly one candidate is currently
 *     tracked as active on that target, that is the one that stopped. This is the strong signal, and
 *     it is free — we watched it land.
 *  2. **You just cast one of them.** If a cast of one candidate is still inside `CAST_WINDOW_MS`,
 *     the landing is that one's. **eql-alerts** arrived at this gate independently for zone-visible
 *     land emotes, and their v0.1.29 note is the important half: a cast has to be *withdrawn* on a
 *     fizzle, or the gate credits you with somebody else's spell.
 *
 * Where neither decides it, **every candidate is returned** and the caller is expected to say so.
 * Picking the first would be a coin toss that reads like knowledge, and the whole value of a recast
 * reminder is that you can trust the name on it.
 */
export function narrowCandidates(
  candidates: readonly string[],
  isUp: (key: string) => boolean,
  castRecently: (key: string) => boolean,
): { spell: string; alsoCouldBe?: string[] } | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return { spell: candidates[0] };
  for (const decide of [isUp, castRecently]) {
    const hits = candidates.filter((c) => decide(buffKey(c)));
    if (hits.length === 1) return { spell: hits[0] };
  }
  // Undecided: name the first for want of anywhere else to put it, and carry the rest so the row can
  // admit the ambiguity. The order is the file's, which is stable, so the same line always reads the
  // same way rather than shuffling between sessions.
  return { spell: candidates[0], alsoCouldBe: candidates.slice(1) };
}

/**
 * Should this lapse put a banner up?
 *
 * Three gates, and each is a different question: is the app watching this spell at all, did the
 * player ask to be *interrupted* about it, and is this lapse the kind worth announcing. The third is
 * where the rules live — a death strips everything at once, and a recast is not a lapse at all.
 */
export function shouldAnnounce(known: KnownBuff | undefined, reason: BuffLapseReason): boolean {
  if (!known?.tracked || !known.notify) return false;
  // A recast *replaced* the buff, so nothing is missing. A death removed everything at once, and a
  // dozen banners is not a dozen pieces of news — the panel and the on-screen list carry it instead.
  return reason === "faded";
}

/** Should this lapse be held as a standing "you are missing this"? */
export function shouldHold(known: KnownBuff | undefined, reason: BuffLapseReason): boolean {
  if (!known?.tracked) return false;
  // Unlike a banner, a death's lapses *are* wanted here: "what do I need re-buffed" is the question
  // a corpse most wants answered, and it stays a good question until the buffs are back.
  return reason !== "recast";
}

/**
 * A fresh catalogue row for a spell first seen now.
 *
 * Everything defaults to on. That is the opposite of a spawn timer's `notify`, and deliberately: a
 * timer is created by *killing* something, which you do hundreds of times an evening to things you
 * are not camping — while a buff row is created by casting a buff or being given one, which is
 * already the set you care about. Enrolling silently would mean the feature did nothing until the
 * player found and ticked twenty boxes.
 */
export function newKnownBuff(spell: string, at: string, opts: { mine: boolean; permanent: boolean }): KnownBuff {
  return {
    key: buffKey(spell),
    spell: spellName(spell).trim() || spell,
    tracked: true,
    notify: true,
    onScreen: true,
    permanent: opts.permanent,
    mine: opts.mine,
    rises: 0,
    lastUp: at,
  };
}

/** How long a buff has been up (or was up, for a lapsed one), in ms. Negative clock skew reads as 0. */
export function heldMs(buff: BuffInstance, now: number): number {
  const since = Date.parse(buff.since);
  if (Number.isNaN(since)) return 0;
  const end = buff.up ? now : Date.parse(buff.at);
  return Math.max(0, (Number.isNaN(end) ? now : end) - since);
}

/**
 * Which rows may be evicted when the catalogue is full, worst candidate first.
 *
 * Only rows the player has left alone: an unchecked row is a decision, and dropping it would
 * silently switch tracking back on for the one spell somebody went out of their way to silence.
 * Among the rest the least recently useful goes, which is the same rule every bounded store here
 * uses ([ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md) — except that
 * a buff row teaches nothing beyond itself, so there is nothing to fold into a summary on the way
 * out).
 */
export function evictable(known: readonly KnownBuff[]): KnownBuff[] {
  return known
    .filter((k) => k.tracked && k.notify && k.onScreen && !k.styleId)
    .sort((a, b) => Date.parse(a.lastUp ?? "") - Date.parse(b.lastUp ?? ""));
}
