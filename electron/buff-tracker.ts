/**
 * buff-tracker.ts — the buff board: what's up on whom, what has lapsed, and saying so.
 *
 * The rules are next door in [buff-tracking.ts](../src/shared/buff-tracking.ts), pure and tested,
 * and the sentence lookup is in [spell-strings.ts](../src/shared/spell-strings.ts). This is the
 * holder: it watches the log, keeps the board, persists the player's choices, and raises the banner.
 *
 * ## What is persisted, and what deliberately isn't
 *
 * **The choices are.** Which spells you watch, which raise a banner, which stay on screen, which
 * wear a style — those are decisions, and a decision that evaporates on restart is not one. They
 * live in `buffs.json` beside every other small store.
 *
 * **The board isn't.** Which buffs are up right now is a fact about *this login*, and the log's own
 * evidence for it is a set of lines that scrolled past hours ago. Nothing in the log says "these are
 * your current buffs" — [ADR 0043](../specs/decisions/0043-state-is-not-news-either.md)'s catch-up
 * recovers your zone and your position for exactly this reason and stops there — and buffs do not
 * survive a logout in EQ anyway. So the board starts empty every launch and fills as the log
 * mentions things. A restart mid-session costs the buffs whose landing lines have already gone by,
 * and that is honest: claiming Thistlecoat is up because it was up when the app closed would be
 * inventing state, and the first fade line would contradict it.
 *
 * This is the mirror image of [spawn-tracker.ts](./spawn-tracker.ts), and the difference is the point
 * of both. A respawn is a **fact about the world** that outlives the app, so it is persisted and
 * uncapped. A buff is a fact about a *session*, so it isn't. What they share is that neither is an
 * `alert-queue.ts` cue — a thing the app means to say — and both raise their banners down the same
 * `raise` path so they wear the ordinary alert styling rather than growing a notification system
 * apiece.
 *
 * ## How a buff is seen going up
 *
 * Three signals, and each is doing something the others can't:
 *
 *  - **A landing line** (`spells_us_str.txt`) names the *target*, which no other line does. It is
 *    also the only evidence that somebody **else** buffed you, since their cast line names them.
 *  - **Your own cast** names the spell and the rank, and nothing else. It enrols the spell as one of
 *    yours and stands in as a rise when no landing line follows — plenty of buffs land in silence.
 *  - **A fade line** proves, retroactively, that the thing was up. A buff first met by its fade
 *    still belongs on the list: that is precisely the reminder the player wanted.
 *
 * And one thing is deliberately **not** seen going up at all: a debuff. A detrimental spell earns a
 * row only when we have watched *you* cast it, because a root on you is somebody else's doing and
 * there is nothing for you to put back on
 * ([ADR 0149](../specs/decisions/0149-a-debuff-is-only-tracked-if-it-is-yours.md)).
 *
 * A cast is held briefly as *pending* so a landing line can be attributed to it, which is what
 * narrows a shared landing sentence to the rank you actually cast. **eql-alerts** found the same gate
 * for zone-visible emotes, and their hard-won second half is honoured here: a pending cast is
 * **withdrawn** on a fizzle, interrupt or resist, because a cast that never landed must not be
 * credited with the next thing that happens.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { BUFF_STYLE_ID, alertStyle } from "../src/shared/alert-styles";
import { SELF, spellName, spellRank } from "../src/shared/combat-parser";
import {
  announceWhen,
  buffKey,
  buffTarget,
  evictable,
  instanceKey,
  isEnemyTarget,
  narrowCandidates,
  newKnownBuff,
  shouldHold,
  doneToYou,
  worthWatching,
  CAST_WINDOW_MS,
  MAX_KNOWN_BUFFS,
  ON_PET,
  ON_UNKNOWN,
  ON_YOU,
  type BuffInstance,
  type BuffLapseReason,
  type BuffView,
  type KnownBuff,
} from "../src/shared/buff-tracking";
import type { BuffLexicon } from "../src/shared/spell-strings";
import type { SpellFacts } from "../src/shared/spell-file";
import type {
  CastAlertEvent,
  CastAlertSettings,
  CombatEvent,
  FightEndReason,
  LogLine,
} from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("buff-tracker");

/** Choices arrive one click at a time; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 2000;

/**
 * What's on disk: the decisions, and nothing derived.
 *
 * Keyed by `buffKey` (rank-stripped, folded), because "do I want to hear about haste" is not a
 * question about which rank of it you happen to be casting this level.
 */
interface Stored {
  known: Record<string, StoredBuff>;
}

/** One spell's row, as it survives a restart. */
interface StoredBuff {
  /** The display spelling, so a row can be shown before the spell is next cast. */
  spell: string;
  /** Watch it at all. The durable "no" — see `KnownBuff.tracked`. */
  tracked: boolean;
  notify: boolean;
  onScreen: boolean;
  styleId?: string;
  /** From the game's own file when we had it. Re-read whenever the spell is seen again. */
  permanent?: boolean;
  /** Likewise: something you throw *at* things. Absent means we never had the file to ask. */
  detrimental?: boolean;
  /** We've seen you cast it, rather than only ever receiving it. */
  mine?: boolean;
  rises?: number;
  lastUp?: string;
  lastLapse?: string;
}

export interface BuffTrackerDeps {
  userDataDir: string;
  /** The current alert settings, so a lapse wears whatever the alerts wear. */
  getSettings: () => CastAlertSettings;
  /** Put a banner on the overlay, the same way every other alert reaches it. */
  raise: (alert: CastAlertEvent) => void;
  /**
   * The sentence index and the spell facts, injected rather than read — so the whole tracker tests
   * without a game install, and so it never owns any I/O.
   */
  lexicon: () => BuffLexicon;
  /** Facts for a spell the log named, for `beneficial` and `permanent`. */
  facts: (spell: string, rank?: string) => SpellFacts | undefined;
  /**
   * Your character's name, or blank while it is unknown.
   *
   * Only ever used to recognise **your own pet**: `<Owner>`s warder` is the only ownership the log
   * writes, and telling yours from a group-mate's needs a name to compare. Asked as a function
   * because it changes when the watched log does — switching character must not leave the board
   * folding somebody else's pet into yours.
   */
  player: () => string;
  /**
   * Is a fight open right now? Asked of the damage meter, which is the only thing that decides what a
   * fight is ([ADR 0036](../specs/decisions/0036-a-fight-ends-on-death-not-a-lull.md)) — assembling a
   * second answer here from the same events would be that rule written twice.
   */
  inFight: () => boolean;
  /** Injectable, so a test of a lapse takes no time at all. */
  now?: () => number;
}

export interface BuffTracker {
  /** A combat event: a cast, a fade, an outcome, or your death. */
  combat(event: CombatEvent): void;
  /**
   * A whole log line, for the landing sentences no parser models. Cheap by design: the lexicon's
   * first question is a map lookup on the line's last word, so a line that is not a landing costs
   * almost nothing (see `spell-strings.ts`).
   */
  line(line: LogLine): void;
  /**
   * You changed zone — which keeps some of the board and ends the rest, and the split is the point.
   *
   * **Your buffs survive it**, so this is not a reset. **Debuffs do not**: EQ strips the ones on you
   * at the zone line, and the ones you cast are on mobs left standing in a zone you are no longer in.
   * Anything else aimed at what you were fighting goes with them, a buff on a charmed pet included.
   * The pending-cast memory goes too — it is per moment, and a zone is a hard break in one.
   *
   * Kept as its own call rather than folded into `line` because "what a zone change means" is a
   * decision, and it should be visible as one
   * ([ADR 0150](../specs/decisions/0150-a-zone-line-ends-a-debuff.md)).
   */
  noteZone(zone: string | null): void;
  /**
   * The fight is over, and why. Two things happen, and they are opposite halves of the same idea:
   *
   *  - **Waiting banners are said.** Your own buffs' lapses were held back because nobody stops
   *    fighting to rebuff; this is the moment you would have acted anyway. A fight that ended in your
   *    **death** says nothing instead — you lost everything on you regardless, and "recast it" from a
   *    corpse is the noise [ADR 0082](../specs/decisions/0082-an-alert-can-be-scheduled.md) already
   *    ruled against.
   *  - **Enemy-targeted rows are dropped**, up or lapsed. A root wearing off a mob is a reminder only
   *    while the mob is there; afterwards it is a reminder about a corpse, and left alone those are
   *    what fill the standing list until nobody reads it.
   */
  noteFightEnd(reason: FightEndReason): void;
  /** Everything the panel draws. */
  view(): BuffView;
  /** Watch this spell, or stop. */
  track(key: string, on: boolean): void;
  /** Whether a lapse raises a banner. */
  notify(key: string, on: boolean): void;
  /** Whether a lapse stays on screen until the buff is back. */
  showOnScreen(key: string, on: boolean): void;
  /** Which saved style its banner wears, or `null` for the buff default. */
  style(key: string, styleId: string | null): void;
  /** Forget the row entirely. It returns, fresh, if the spell is cast again. */
  forget(key: string): void;
  /** Stand one lapse down without recasting the spell. */
  dismiss(key: string, target: string): void;
  /** Stand every lapse down. */
  dismissAll(): void;
  /** Told when the board changes, so the panel needn't poll. */
  onChanged(cb: () => void): void;
  /** Write any pending changes now (shutdown). */
  flush(): void;
}

/**
 * Throw away rows for debuffs that were never shown to be yours.
 *
 * Enrolling a debuff took no evidence at all until `worthWatching`, so a file written by an earlier
 * build holds rows for things that were cast **at** the player — and those are exactly the rows the
 * rule exists to prevent. Leaving them would mean the fix only applied to spells nobody had met yet.
 *
 * It costs a little: a root of your own, enrolled before rows recorded who cast them, also goes. That
 * is the honest trade — the old file cannot tell the two apart — and it is self-healing, since the
 * next time you cast the thing and it wears off the row comes straight back, this time saying whose
 * it is. Rows from before `detrimental` was recorded at all are left alone: absent is *unknown*, and
 * sweeping on a guess is what this whole change is against.
 */
function dropDebuffsNotYours(stored: Stored): number {
  const doomed = Object.entries(stored.known).filter(([, row]) => row.detrimental && !row.mine);
  for (const [key] of doomed) delete stored.known[key];
  if (doomed.length) log.debug("dropped debuff rows that were never yours", doomed.map(([key]) => key));
  return doomed.length;
}

export function createBuffTracker({
  userDataDir,
  getSettings,
  raise,
  lexicon,
  facts,
  player,
  inFight,
  now = Date.now,
}: BuffTrackerDeps): BuffTracker {
  const file = path.join(userDataDir, "buffs.json");
  const stored = readJson<Stored>(file, { known: {} });
  if (!stored.known) stored.known = {};
  const sweptOnLoad = dropDebuffsNotYours(stored);
  // `restart: true` — the choices arrive as clicks, and only where the row *lands* is worth keeping.
  //
  // No `concern`: this file is not a body of *derived* data, so there is nothing for a revision to
  // invalidate and nothing to re-derive if it did. It holds only what the player decided, which no
  // change to our rules can make wrong (`data-provenance.ts` explains what the stamp is for).
  const saver = createSaver(file, "buffs", () => stored, WRITE_DEBOUNCE_MS, {
    pretty: true,
    restart: true,
  });
  // Written back rather than re-swept every launch: the rows are gone, and a file that still holds
  // them would go on being a file that disagrees with the panel.
  if (sweptOnLoad) saver.save();

  /** Up right now, and lapses standing — both keyed by `instanceKey`, so one spell per target. */
  const board = new Map<string, BuffInstance>();
  /** `buffKey` → the moment you were last seen starting to cast it, for narrowing a shared landing. */
  const pending = new Map<string, number>();
  /**
   * Every spell **you** have been seen starting to cast this session.
   *
   * Not `pending`, which is a *moment* — it expires in seconds and is cleared at a zone line, because
   * its job is to attribute a landing sentence arriving right now. This is knowledge about the
   * character: a snare cast twenty minutes and three zones ago is still one of yours when it finally
   * wears off. `combat-stats.ts` keeps the same distinction for the same reason, and its repertoire
   * survives a reset on exactly this argument.
   *
   * Session-scoped and unpersisted, because the durable version already exists: a row that got here
   * once is stored with `mine`, and that is what carries the answer across a restart.
   */
  const castByYou = new Set<string>();
  const listeners: (() => void)[] = [];
  /**
   * Whether anything has yet given us a reason to read the game's files.
   *
   * `line()` sees **every** log line, and the sentence index is behind a lazy read of ~43 MB
   * ([ADR 0080](../specs/decisions/0080-the-game-s-own-spell-file.md) is emphatic that most sessions
   * should never pay for it). Asking it about line one would move that cost onto every launch, into
   * the first poll — which is already the app's tightest budget, and already the thing that stalls
   * when a closed-app gap is replayed.
   *
   * So a landing line is only *looked up* once a **parsed event** has established that spellcasting is
   * happening — any cast, or any fade. Those cost nothing to check, and the load then lands at the
   * same moment the damage meter's own mana lookup already triggers it, rather than one poll earlier.
   * Ordering works out because the watcher emits a line before its parsed event, and a landing is
   * always a *later line* than the cast that caused it — so by the time one arrives, the cast has
   * already warmed the index. A session spent standing in the bank reads neither file.
   */
  let wanted = false;
  /**
   * Lapses whose banner is waiting for the fight to end, by instance key.
   *
   * A *map* rather than a list, so a buff that drops, is rebuffed, and drops again inside one fight
   * leaves one thing to say rather than three. It holds the instance as it was at the moment it
   * lapsed, because that is what the banner is about — and it is deliberately not persisted: a
   * banner is a thing the app means to say, and those do not survive the process
   * ([ADR 0092](../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md) draws
   * the same line between a fact and an intention).
   */
  const held = new Map<string, BuffInstance>();

  function changed(): void {
    for (const cb of listeners) cb();
  }

  function save(): void {
    saver.save();
  }

  /**
   * Is this spell one of **yours** — cast by you, rather than done to you?
   *
   * Two pieces of evidence, and the second is what makes the first survive a restart: a cast seen
   * this session, or a row already stored as `mine` because one was seen in an earlier one.
   */
  function yours(key: string): boolean {
    return castByYou.has(key) || !!stored.known[key]?.mine;
  }

  /** Is this spell one you throw at things? Absent facts read as no, as everywhere else. */
  function isDebuff(key: string): boolean {
    return !!stored.known[key]?.detrimental;
  }

  /**
   * Should this spell get a row, given what the game file says about it and who cast it?
   *
   * The gate `worthWatching` states, with the evidence gathered: a debuff is only ours to be
   * reminded about if we saw you cast it. Asked *before* `knownFor`, so a refused spell leaves no
   * trace at all — an enrolled-then-ignored row would still be a line in the panel to explain.
   */
  function watchable(spell: string, about: SpellFacts | undefined, byYou = false): boolean {
    const detrimental = about ? !about.beneficial : undefined;
    return worthWatching({ detrimental, instant: about?.instant }, byYou || yours(buffKey(spell)));
  }

  /** The row for a spell, creating it the first time the spell is seen. */
  function knownFor(
    spell: string,
    opts: { mine?: boolean; permanent?: boolean; detrimental?: boolean } = {},
  ): KnownBuff {
    const key = buffKey(spell);
    const row = stored.known[key];
    if (row) {
      // The display spelling and the facts from the game file are re-asserted from what we just saw:
      // a row written before the file was findable has neither, and a row is not worth a migration
      // when the next sighting can simply put it right.
      if (opts.permanent !== undefined) row.permanent = opts.permanent;
      if (opts.detrimental !== undefined) row.detrimental = opts.detrimental;
      if (opts.mine) row.mine = true;
      return hydrate(key, row);
    }
    const fresh = newKnownBuff(spell, isoNow(), {
      mine: !!opts.mine,
      permanent: !!opts.permanent,
      detrimental: !!opts.detrimental,
    });
    // Bounded, and only rows nobody has touched may go — see `evictable`.
    const rows = Object.values(stored.known);
    if (rows.length >= MAX_KNOWN_BUFFS) {
      const victim = evictable(Object.entries(stored.known).map(([key, r]) => hydrate(key, r)))[0];
      if (victim) {
        delete stored.known[victim.key];
        log.debug("buff catalogue full; dropped", victim.key);
      }
    }
    stored.known[fresh.key] = {
      spell: fresh.spell,
      tracked: fresh.tracked,
      notify: fresh.notify,
      onScreen: fresh.onScreen,
      permanent: fresh.permanent,
      detrimental: fresh.detrimental,
      mine: fresh.mine,
      rises: 0,
      lastUp: fresh.lastUp,
    };
    save();
    return fresh;
  }

  /** A stored row as the rest of the app sees it. Absent fields read as the default they shipped with. */
  function hydrate(key: string, row: StoredBuff): KnownBuff {
    return {
      key,
      spell: row.spell,
      tracked: row.tracked !== false,
      notify: row.notify !== false,
      onScreen: row.onScreen !== false,
      styleId: row.styleId,
      permanent: !!row.permanent,
      detrimental: !!row.detrimental,
      mine: !!row.mine,
      rises: row.rises ?? 0,
      lastUp: row.lastUp,
      lastLapse: row.lastLapse,
    };
  }

  function isoNow(): string {
    return new Date(now()).toISOString();
  }

  /** The one place a row is edited, so every setter saves and announces alike. */
  function edit(key: string, change: (row: StoredBuff) => void): void {
    const row = stored.known[key];
    if (!row) return;
    change(row);
    save();
    changed();
  }

  /**
   * A buff went up.
   *
   * `at` is the log's own timestamp rather than the wall clock, so a replayed gap reads as the
   * evening it was rather than as now. A rise on a target that already has this buff up is a
   * **refresh**: the instance keeps its identity and its `since`, because "how long have I had
   * haste" is not restarted by topping it up.
   */
  function rise(
    spell: string,
    target: string,
    at: string,
    source: BuffInstance["source"],
    opts: { byYou: boolean; alsoCouldBe?: string[] },
  ): void {
    const spellFacts = facts(spellName(spell), spellRank(spell));
    const detrimental = spellFacts ? !spellFacts.beneficial : undefined;
    if (!watchable(spell, spellFacts, opts.byYou)) return;
    if (doneToYou({ detrimental }, target)) return; // a debuff on your own side is not a buff of yours
    const known = knownFor(spell, {
      mine: opts.byYou,
      permanent: spellFacts?.permanent,
      detrimental,
    });
    if (!known.tracked) return; // unchecked means the app is not watching this one at all
    const key = known.key;
    const id = instanceKey(key, target);
    const existing = board.get(id);
    const instance: BuffInstance = {
      key,
      spell: known.spell,
      target,
      up: true,
      at,
      // A refresh keeps the original moment; a re-cast after a lapse starts again from now.
      since: existing?.up ? existing.since : at,
      source,
      byYou: opts.byYou || !!existing?.byYou,
      permanent: known.permanent,
      onEnemy: isEnemyTarget(target, known.detrimental),
      alsoCouldBe: opts.alsoCouldBe,
    };
    board.set(id, instance);
    // It is back, so a banner still waiting to say it was missing has nothing left to say. Dropped
    // rather than left to fire at the end of the fight, which is the whole point of holding it: the
    // hold exists so the app can tell you what is *still* wrong when you get a moment.
    held.delete(id);
    // A **refresh is not a rise**. The instance above already treats it as one thing continuing —
    // it keeps its `since` — and the count has to agree, or it stops meaning what the row says it
    // means. A bard song re-lands every few seconds, so counting pulses made `Anthem de Arms` read
    // *seen up 7,232×* beside a buff you actually maintain reading 8, which is the figure inverted
    // rather than merely inflated (ADR 0159).
    const refresh = !!existing?.up;
    edit(key, (row) => {
      if (!refresh) row.rises = (row.rises ?? 0) + 1;
      row.lastUp = at;
      if (opts.byYou) row.mine = true;
    });
    log.debug("buff up", { spell: known.spell, target, source, byYou: opts.byYou });
  }

  /**
   * A buff stopped.
   *
   * The target may be unknown: a fade **on you** names one (you), a targeted fade names the
   * character, and a pet fade names the pet — but a spell we only ever saw *cast* has an instance
   * filed under `ON_UNKNOWN`, and a later fade naming a real target should retire that placeholder
   * rather than leave it standing beside the truth. That's what `matchingInstances` is for.
   */
  function lapse(
    spell: string,
    target: string | null,
    at: string,
    reason: BuffLapseReason,
    alsoCouldBe?: string[],
  ): void {
    const key = buffKey(spell);
    const known = stored.known[key] ? hydrate(key, stored.known[key]) : undefined;
    // A spell we have never seen go up can still lapse — a fade is proof it *was* up, and that is
    // exactly the reminder the player asked for. Enrol it so the row exists to be unchecked.
    const spellFacts = facts(spellName(spell));
    const detrimental = spellFacts ? !spellFacts.beneficial : undefined;
    // Asked of the fade as well as of the rise, and it is the arm that does the work: a debuff is
    // nearly always met *by* its fade, since a detrimental cast enrols nothing on its own.
    if (!watchable(spell, spellFacts)) return;
    // And the same question of *this landing*: you can own Root and still not own the one a mob put
    // on your pet. `?? ON_YOU` because an unnamed fade is a fade on you (ADR 0158).
    if (doneToYou({ detrimental }, target ?? ON_YOU)) return;
    const row =
      known ??
      knownFor(spell, {
        permanent: spellFacts?.permanent,
        detrimental,
        // We only reached here because the spell is ours — a debuff by the gate above, a buff by
        // having been on you. Saying so is what stops a row you cast reading "cast on you".
        mine: detrimental || undefined,
      });
    if (!row.tracked) return;

    // Resolved **once**, before anything is touched. Asking again afterwards would find nothing: a
    // held lapse is still on the board with `up: false`, so the same question has a different answer
    // either side of the loop — which made every real lapse fall through to the orphan branch below,
    // announcing twice and replacing its own start time.
    const affected = matchingInstances(row.key, target);
    for (const id of affected) {
      const was = board.get(id);
      if (!was?.up) continue;
      const settled = target ?? was.target;
      const lapsed: BuffInstance = {
        ...was,
        // A fade that named a target is better evidence than the placeholder it is retiring.
        target: settled,
        up: false,
        at,
        reason,
        // Re-decided rather than carried over: the target may only now have been named, and it is
        // half of what makes something an enemy row.
        onEnemy: isEnemyTarget(settled, row.detrimental),
        alsoCouldBe: alsoCouldBe ?? was.alsoCouldBe,
      };
      board.delete(id);
      if (shouldHold(row, reason)) board.set(instanceKey(row.key, lapsed.target), lapsed);
      speak(row, reason, lapsed);
      log.debug("buff lapsed", { spell: lapsed.spell, target: lapsed.target, reason });
    }

    // Nothing was up: the buff was cast before the app was watching, or its landing line was
    // silent. The lapse is still real and still worth holding, filed under whatever the fade named.
    if (!affected.length) {
      const orphan: BuffInstance = {
        key: row.key,
        spell: row.spell,
        target: target ?? ON_YOU,
        up: false,
        at,
        // Nothing observed it going up, so the best we can say is that it went up no later than the
        // moment it ended. That makes "held" read as zero rather than as a fabricated duration.
        since: at,
        reason,
        source: "landed",
        byYou: row.mine,
        permanent: row.permanent,
        onEnemy: isEnemyTarget(target ?? ON_YOU, row.detrimental),
        alsoCouldBe,
      };
      if (shouldHold(row, reason)) board.set(instanceKey(row.key, orphan.target), orphan);
      speak(row, reason, orphan);
    }

    edit(row.key, (r) => {
      r.lastLapse = at;
    });
  }

  /**
   * Which board entries a fade is about.
   *
   * A named target matches its own instance **and** an `ON_UNKNOWN` placeholder for the same spell,
   * because the placeholder is that same buff before we knew where it went. An unnamed fade (a
   * self-fade) matches only the instance on you.
   */
  function matchingInstances(key: string, target: string | null): string[] {
    const wanted = target ?? ON_YOU;
    const ids = [instanceKey(key, wanted)];
    if (wanted !== ON_UNKNOWN) ids.push(instanceKey(key, ON_UNKNOWN));
    return ids.filter((id) => board.get(id)?.up);
  }

  /**
   * Say it now, hold it for the end of the fight, or say nothing — `announceWhen`'s answer, carried out.
   *
   * The "hold" arm is what makes the difference in practice: nobody stops mid-fight to recast a stat
   * buff, so a banner then is an interruption you can only ignore — and an alert you have learned to
   * ignore costs you the next one that mattered. Out of combat there is nothing to wait for, so the
   * same answer means "now".
   *
   * Note the standing on-screen list is not gated by any of this. It is set by `shouldHold` and
   * appears the moment the buff drops, which is what makes holding the *banner* free: the quiet half
   * is already saying it, for anyone who looks.
   */
  function speak(known: KnownBuff, reason: BuffLapseReason, buff: BuffInstance): void {
    switch (announceWhen(known, reason, buff)) {
      case "now":
        announce(buff);
        return;
      case "after-fight":
        if (inFight()) held.set(instanceKey(buff.key, buff.target), buff);
        else announce(buff);
        return;
      default:
        return;
    }
  }

  /**
   * Put the banner up.
   *
   * No wording is sent, only the buff. That is the same choice a record and a drop make: the *facts*
   * are the message, and the overlay can word them itself from shared code — which is what keeps the
   * banner, the panel row and the on-screen line three layouts of one truth rather than three
   * sentences that can drift.
   */
  function announce(buff: BuffInstance): void {
    const settings = getSettings();
    // The overlay only exists while alerts are on, so there is nothing to raise onto otherwise —
    // and the board still holds the lapse, which is the part that doesn't need a window.
    if (!settings.enabled) return;
    const known = stored.known[buff.key];
    raise({
      caster: "",
      spell: buff.spell,
      at: buff.at,
      event: "buff",
      target: buff.target === ON_YOU ? undefined : buff.target,
      buff,
      style: alertStyle(settings, { styleId: known?.styleId ?? BUFF_STYLE_ID }),
    });
  }

  /** Was one of these spells started recently enough to explain a landing line? */
  function castRecently(key: string, at: number): boolean {
    const when = pending.get(key);
    return when !== undefined && at - when <= CAST_WINDOW_MS;
  }

  return {
    combat(event) {
      switch (event.kind) {
        case "cast": {
          // **Any** cast arms the landing lookup, not just yours — see `wanted`. A group-mate buffing
          // you is preceded by their own cast line, and their landing sentence is the only evidence
          // that it reached you, so gating on *your* casting would miss exactly the case the sentence
          // exists for. Arming is free (this event is already parsed) and reads nothing.
          wanted = true;
          if (event.caster !== SELF) return; // but their cast tells us nothing about a target
          const spellFacts = facts(event.spell, event.rank);
          const key = buffKey(event.spell);
          pending.set(key, Date.parse(event.at) || now());
          // Recorded for **every** cast of yours, beneficial or not, and this is the only place a
          // debuff can ever be shown to be yours: your detrimental casts are deliberately not
          // enrolled below (a spell book of nukes is not a buff list), so by the time one wears off
          // the cast that proves it is long past. See `worthWatching`.
          castByYou.add(key);
          // Only enrol on evidence this is a lasting beneficial effect. Without the game file we
          // can't tell a buff from a nuke, so we wait for a landing or a fade line to say so —
          // enrolling every cast would fill the panel with your entire spell book.
          if (!spellFacts?.beneficial) return;
          // …and a lasting one. A heal, a gate, a bind announces itself landing and then never ends,
          // so enrolling it here is how the panel filled with a month of everything you ever cast at
          // anybody (ADR 0157). Same rule as everywhere else, asked in the one place a row can be
          // created without a fade to gate it.
          if (!watchable(event.spell, spellFacts, true)) return;
          // A cast with no landing sentence of its own will never produce a better line, so the cast
          // *is* the rise. One that has one waits: the landing names the target, and a target is
          // worth the second or two.
          if (!lexicon().landsQuietly(event.spell)) {
            knownFor(event.spell, { mine: true, permanent: spellFacts.permanent });
            changed();
            return;
          }
          rise(event.spell, ON_UNKNOWN, event.at, "cast", { byYou: true });
          changed();
          return;
        }
        case "spell-outcome": {
          // Withdrawn, not left to expire. eql-alerts' v0.1.29 note: a fizzle means the cast never
          // landed, so the next landing line is somebody else's spell, and a gate that only expires
          // is wrong at exactly the busy camp it was built for.
          if (event.caster !== SELF) return;
          pending.delete(buffKey(event.spell));
          return;
        }
        case "buff-faded": {
          wanted = true;
          const at = event.at;
          // A pet fade and a targeted fade both name the spell outright — no lookup needed.
          if (event.pet) {
            lapse(event.spell, ON_PET, at, "faded");
            changed();
            return;
          }
          if (event.target) {
            lapse(event.spell, buffTarget(event.target, player()), at, "faded");
            changed();
            return;
          }
          // A fade on **you**. The parser gave us the words the log used, not a spell — so this is
          // the case `spells_us_str.txt` exists for, and it is matched on the whole sentence rather
          // than the parser's capture, because the file holds whole sentences.
          //
          // `message`, not `raw`: the file holds sentences and `raw` still carries the log's
          // `[timestamp]`, so every one of these lookups matched nothing at all (ADR 0155).
          const candidates = lexicon().fadedBy(event.message);
          if (!candidates.length) {
            // Either there's no game install, or no obtainable buff writes that sentence. Nothing to
            // attribute, and nothing to say: guessing which of your buffs it was is exactly what
            // this file was read to avoid.
            log.debug("unattributed fade", event.raw);
            return;
          }
          const narrowed = narrowCandidates(
            candidates.map((c) => c.name),
            (key) => !!board.get(instanceKey(key, ON_YOU))?.up,
            (key) => castRecently(key, Date.parse(at) || now()),
          );
          if (!narrowed) return;
          lapse(narrowed.spell, ON_YOU, at, "faded", narrowed.alsoCouldBe);
          changed();
          return;
        }
        case "death": {
          // Only *your* death strips *your* buffs. A group-mate dying loses the buffs you put on
          // them, and the log tells us so with its own fade lines — so acting on their death here
          // would be counting the same loss twice.
          if (event.victim !== SELF) return;
          const at = event.at;
          let any = false;
          for (const [id, buff] of [...board]) {
            // Buffs you cast on other people survive your death. Yours and your pet's do not.
            if (!buff.up || (buff.target !== ON_YOU && buff.target !== ON_PET)) continue;
            board.delete(id);
            const row = stored.known[buff.key] ? hydrate(buff.key, stored.known[buff.key]) : undefined;
            const lapsed: BuffInstance = { ...buff, up: false, at, reason: "died" };
            if (shouldHold(row, "died")) board.set(id, lapsed);
            any = true;
          }
          if (any) {
            log.debug("death stripped buffs");
            changed();
          }
          return;
        }
        default:
          return;
      }
    },

    line(line) {
      // See `wanted`: a landing is a bonus signal, and must not be what makes every launch read the
      // game's files.
      if (!wanted) return;
      const strings = lexicon();
      if (!strings.size) return;
      const at = Date.parse(line.at) || now();

      // On you: the only evidence anyone else ever buffed you, since their cast line names them.
      const onYou = strings.landedOnYou(line.message);
      if (onYou.length) {
        const narrowed = narrowCandidates(
          onYou.map((s) => s.name),
          (key) => !!board.get(instanceKey(key, ON_YOU))?.up,
          (key) => castRecently(key, at),
        );
        if (narrowed) {
          rise(narrowed.spell, ON_YOU, line.at, "landed", {
            byYou: castRecently(buffKey(narrowed.spell), at),
            alsoCouldBe: narrowed.alsoCouldBe,
          });
          changed();
        }
        return;
      }

      // On somebody else. Only worth recording when *you* were the one casting it: this sentence is
      // zone-visible, so at a busy camp every nearby caster's buffs would otherwise land on your
      // board. That gate is eql-alerts' idea, and it is the same one `matchCast`'s article test
      // approximates for casts — except that here we have the stronger evidence and can use it.
      const onOther = strings.landedOnOther(line.message);
      if (!onOther) return;
      const narrowed = narrowCandidates(
        onOther.spells.map((s) => s.name),
        () => false, // "already up" says nothing about *whose* it is, so it can't gate this one
        (key) => castRecently(key, at),
      );
      if (!narrowed || !castRecently(buffKey(narrowed.spell), at)) return;
      rise(narrowed.spell, buffTarget(onOther.target, player()), line.at, "landed", {
        byYou: true,
        alsoCouldBe: narrowed.alsoCouldBe,
      });
      changed();
    },

    noteZone() {
      // Buffs cross a zone line; a half-finished cast does not. Clearing the pending map is what
      // stops a cast begun in one zone being credited with a landing sentence read in the next.
      pending.clear();
      // And neither does anything that belonged to the zone you left. **Every debuff goes**: zoning
      // strips the ones on you outright, and the ones you cast are on mobs standing where you left
      // them. So does anything else aimed at something you were fighting — a buff on a charmed pet
      // is a row about a pet you no longer have.
      //
      // A stronger sweep than a fight ending's, and for a stronger reason: that one drops rows about
      // a corpse, this one drops rows about a whole zone. Your own buffs are untouched, which is the
      // difference the tracker's header states and the reason this isn't simply a reset.
      let swept = 0;
      for (const [id, buff] of [...board]) {
        if (!buff.onEnemy && !isDebuff(buff.key)) continue;
        board.delete(id);
        held.delete(id);
        swept += 1;
      }
      if (swept) {
        log.debug("zoned; dropped rows that stayed behind", { swept });
        changed();
      }
    },

    noteFightEnd(reason) {
      // Said now, unless the fight ended by killing *you*. Then everything on you went with you, the
      // standing list already says so under "you died", and a stack of "recast it" over a corpse is
      // the exact noise ADR 0082 refuses. `cut` is a reset or a quit — the player's own doing, and
      // not a moment to start talking.
      const worthSaying = reason === "kill" || reason === "timeout";
      for (const [id, buff] of held) {
        // Only if it is *still* missing. A rise removes its held banner, so this is belt and braces
        // for anything that cleared the row another way (a dismissal, an untick) — a banner about a
        // row that no longer exists would be the app contradicting its own list.
        if (worthSaying && board.get(id) && !board.get(id)!.up) announce(buff);
      }
      held.clear();

      // And the other half: an enemy row is a reminder about something you were fighting, so when the
      // fight is over it is a reminder about a corpse. Both lists, because a *lapsed* one is the
      // reminder that nags and an *up* one (a buff on a charmed pet) is a row that would sit in "Up
      // now" claiming something about a mob that is gone.
      let swept = 0;
      for (const [id, buff] of [...board]) {
        if (!buff.onEnemy) continue;
        board.delete(id);
        swept += 1;
      }
      if (swept) log.debug("fight ended; dropped enemy rows", { reason, swept });
      if (swept || held.size) changed();
    },

    view() {
      const known = Object.entries(stored.known)
        .map(([key, row]) => hydrate(key, row))
        .sort((a, b) => a.spell.localeCompare(b.spell));
      const rows = [...board.values()];
      return {
        now: isoNow(),
        // Longest-held first: the ones you have had up all evening are the ones you stop noticing.
        active: rows.filter((b) => b.up).sort((a, b) => Date.parse(a.since) - Date.parse(b.since)),
        // Most recent first: the thing that just dropped is the thing to act on.
        lapsed: rows.filter((b) => !b.up).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
        known,
        lexicon: lexicon().size > 0,
      };
    },

    track(key, on) {
      // The board is cleared **before** the edit, not after: `edit` is what announces the change, and
      // announcing while a lapse this switch has just cancelled is still on the board would broadcast
      // a state that is about to stop being true.
      //
      // Untracking has to clear what it was already saying, or an unchecked buff keeps a standing
      // "you are missing this" on screen with no row left to explain it.
      if (!on) {
        for (const [id, buff] of [...board]) if (buff.key === key) board.delete(id);
        // And anything it was still waiting to say. Unticking a spell has to silence it completely,
        // or the banner it was holding arrives after the row that would explain it has gone.
        for (const [id, buff] of [...held]) if (buff.key === key) held.delete(id);
      }
      edit(key, (row) => {
        row.tracked = on;
      });
    },
    notify(key, on) {
      edit(key, (row) => {
        row.notify = on;
      });
    },
    showOnScreen(key, on) {
      edit(key, (row) => {
        row.onScreen = on;
      });
    },
    style(key, styleId) {
      edit(key, (row) => {
        if (styleId) row.styleId = styleId;
        else delete row.styleId;
      });
    },
    forget(key) {
      if (!stored.known[key]) return;
      delete stored.known[key];
      for (const [id, buff] of [...board]) if (buff.key === key) board.delete(id);
      for (const [id, buff] of [...held]) if (buff.key === key) held.delete(id);
      save();
      changed();
    },
    dismiss(key, target) {
      const id = instanceKey(key, target);
      const buff = board.get(id);
      if (!buff || buff.up) return;
      board.delete(id);
      // Dismissing means "I know" — so a banner still queued for the end of the fight has been
      // answered already and must not arrive later saying it again.
      held.delete(id);
      changed();
    },
    dismissAll() {
      let any = false;
      for (const [id, buff] of [...board]) {
        if (buff.up) continue;
        board.delete(id);
        held.delete(id);
        any = true;
      }
      if (any) changed();
    },
    onChanged(cb) {
      listeners.push(cb);
    },
    flush() {
      saver.flush();
    },
  };
}
