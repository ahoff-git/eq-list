/**
 * kill-log.ts — what died, where it happened, and how much to believe any of it.
 *
 * A heatmap can only be as accurate as the player is: EQ logs a position **only when you
 * type `/loc`**, so a kill's location is always inferred from the last fix. That's exact at
 * a static camp and a guess the moment you move — so rather than pretend, every kill is
 * stored with the evidence behind it and a confidence figure derived from it:
 *
 *   - the fix used, and **how old it was** when the kill landed;
 *   - the fix before it, giving distance, elapsed time and an **implied speed** — a player
 *     who was demonstrably moving was probably not where the last fix said;
 *   - a **dead-reckoned** guess when both fixes are known: the same course and speed,
 *     carried forward for the age of the fix. Flagged as a guess, because it is one.
 *
 * The log reports every death in earshot, not just yours, so each record also carries
 * **who killed it**. Other people's kills are worth keeping — they are still evidence that
 * the thing spawns here — but they are marked, because counting them as yours would quietly
 * wreck every drop rate: you never looted those corpses.
 *
 * Deliberately generous: everything that went into the guess is recorded, so the display
 * can be reworked — plot only what's trustworthy, fade by confidence, or show the drift —
 * without having to collect it all again.
 *
 * ## Identity survives longer than the record does
 *
 * [ADR 0033](../specs/decisions/0033-eating-a-log-is-idempotent.md) promises that re-reading
 * a log — by hand, or unattended after a release bumps a revision
 * ([ADR 0129](../specs/decisions/0129-a-release-can-ask-for-a-re-read.md)) — records each real
 * event once. That promise used to live entirely on the *held* records: a kill's dedup key was
 * indexed while `kills` held it and forgotten the moment it aged past `MAX_KILLS` and retired
 * into an aggregate. A `MobObservation` has no line identity to re-derive a key from, so a log
 * re-read after that point recognised nothing and recorded, then retired, the same history a
 * second time — a month of real play is tens of thousands of kills, so for a long-lived
 * character this was most of what a re-read would ever touch
 * ([ADR 0207](../specs/decisions/0207-a-retired-kill-still-remembers-its-own-line.md)).
 *
 * Every kill/loot/coin key this log has ever recorded is now kept **forever**, independent of
 * which records currently hold `kills`/`retired` — see `seenKillKeys` et al. below.
 *
 * ## Same second, different mob
 *
 * EQ's timestamp is one-second resolution, and an area spell can kill — or loot — more than one
 * same-named thing inside it. A key built from nothing but the timestamp, the name and who did it
 * collides for two *genuinely different* real events exactly as easily as for a genuine replay,
 * and until now collided the same way: the second one was silently dropped, undercounting the
 * kill and misattributing its corpse's loot onto the survivor. Both `killKey` and `lootKey` now
 * carry an ordinal — **which occurrence of this exact signature this is** — so two real
 * simultaneous events get two rows, while a true replay still lands on the same ordinals it did
 * the first time (ADR 0207 again).
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { createNameRegistry } from "../src/shared/name-registry";
import { isYours } from "../src/shared/combat-parser";
import { observeMobs, sumObservations, withAreas, type MobObservation } from "../src/shared/mob-stats";
import { samePlace } from "../src/shared/zones/place";
import type { ForgetScope, CoinEvent, KillRecord, LocEvent, LootEvent } from "../src/shared/types";

import { createSaver, readJson } from "./json-store";
import { round } from "../src/shared/numbers";
import { createArrayAdminStore, type AdminStore } from "./admin";
const log = createLogger("kill-log");

/** A fix this fresh is treated as exact — you can't have gone far. */
const FRESH_SEC = 10;

/** Past this, the position isn't worth trusting: recorded, but not to be plotted as fact. */
const TRUST_HORIZON_SEC = 60;

/**
 * Movement below this between two fixes reads as standing still. `/loc` is only ever typed
 * by hand, so two fixes a few units apart mean a player who shuffled at their camp, not one
 * who travelled — and a camped player's position is exactly what a heatmap wants to trust.
 */
const STILL_UNITS = 5;

/**
 * How long after a kill a drop is still taken to have come from that corpse. The log puts
 * the loot lines immediately after, and looting a corpse you killed a minute ago is normal,
 * so this is generous — but it's matched by name too, which does the real work.
 */
const LOOT_WINDOW_MS = 120_000;

/**
 * How close behind an item line a coin line still counts as the same looting action. Coin and
 * items come off a corpse together, so this is deliberately tight — past it, the coin is from
 * a later corpse and the item line says nothing about it.
 */
const COIN_FOLLOWS_LOOT_MS = 10_000;

/** Kills arrive in bursts; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

/**
 * Keep a generous but bounded history of individual records — enough for a heatmap of many
 * evenings. It bounds the *detail* only: what a record taught is folded into a per-mob
 * observation before it goes, so drop rates and roam areas never shrink (ADR 0056).
 */
const MAX_KILLS = 5000;

export interface KillLog {
  /** Your character's name, so your own kills — and your pet's death — can be told apart. */
  setPlayer(name: string): void;
  /**
   * Say that what follows may be a **replay** — a log read from the top, which can legitimately
   * re-encounter a line already recorded. Live-watching never calls this, because it never
   * replays: every line it sees is, by construction, arriving for the first time. Call it once
   * before digesting a whole file, not per line — see `record`/`noteLoot` and
   * [ADR 0207](../specs/decisions/0207-a-retired-kill-still-remembers-its-own-line.md).
   */
  startReplay(): void;
  /** A `/loc` line, and the zone it was taken in. */
  noteLoc(loc: LocEvent, zone: string | null): void;
  /**
   * A kill, placed at the best guess available and scored for how good that guess is. Returns
   * whether it was newly recorded — `false` when the same log line was already seen (a re-import,
   * or a log eaten after it was watched live), so an importer can count only what it actually added.
   */
  record(
    mob: string,
    killer: string,
    zone: string | null,
    at: string,
    logId: number,
    named?: boolean,
    killerNamed?: boolean,
  ): boolean;
  /** A drop, attached to the kill it most likely came from (by corpse and time). Returns whether
   *  it was newly attached — `false` if this loot line was already folded in. */
  noteLoot(event: LootEvent): boolean;
  /**
   * Coin taken off a corpse, attached to the kill it came from. Returns whether it was newly
   * attached — `false` when the line was already folded in, or when no corpse can claim it.
   * Only `from: "corpse"` coin belongs here; an auto-sold item's is the item's, not the mob's.
   */
  noteCoin(event: CoinEvent): boolean;
  /** Every kill **record** still held, newest first. Bounded — see `observations()`. */
  kills(zone?: string): KillRecord[];
  /**
   * Everything your kills have taught, per mob and zone: the records still held **plus** the ones
   * that have aged out, folded into observations before they went. This — not `kills()` — is what
   * a drop rate or a roam area is derived from, or the cap would quietly delete knowledge
   * ([ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
   */
  observations(): MobObservation[];
  /**
   * How many times the records have changed this run. Cheap by contract — it reads a counter and
   * touches no record — so a caller can ask it on a timer to find out whether a re-derivation is
   * worth paying for.
   */
  version(): number;
  /**
   * Forget the kill records. **Observations survive by default** (ADR 0056): they are every drop
   * rate and roam area you have ever learned, they took months of play to gather, and they cannot
   * be rebuilt from a log you no longer have. Only `"everything"` — a second, explicit answer —
   * takes them too.
   */
  clear(scope?: ForgetScope): void;
  flush(): void;
  /** The hidden admin panel's view of these records — see `electron/admin.ts`. */
  admin: AdminStore;
}

/** Distance in EQ units between two points (the map's own coordinate space). */
function distance(a: { y: number; x: number }, b: { y: number; x: number }): number {
  return Math.round(Math.hypot(a.y - b.y, a.x - b.x));
}

/**
 * The base signature a kill's key is built from — the log line behind it, NUL-joined so a name
 * can't forge a key. Two reads of the same line (a re-import, or a log eaten after it was watched
 * live) yield the same signature, which is what lets the log recognise each real kill.
 *
 * Not the final key on its own: see `nextOrdinal` for why.
 */
function baseKillKey(at: string, mob: string, killer: string): string {
  return `${at}\0${mob.toLowerCase()}\0${killer.toLowerCase()}`;
}

/** The same idea for a loot line's signature. */
function baseLootKey(at: string, item: string, source: string): string {
  return `${at}\0${item.toLowerCase()}\0${source.toLowerCase()}`;
}

/**
 * The stable identity of a kill — its signature plus which occurrence of it this is. `ordinal` is
 * almost always `0`; see `ordinalFor` for the one case it isn't.
 */
function killKey(at: string, mob: string, killer: string, ordinal: number): string {
  return `${baseKillKey(at, mob, killer)}#${ordinal}`;
}

/** The same idea for a loot line, so re-reading it doesn't add the drop to a corpse twice. */
function lootKey(at: string, item: string, source: string, ordinal: number): string {
  return `${baseLootKey(at, item, source)}#${ordinal}`;
}

/**
 * How many occurrences of `base` are already on permanent record — `seen` holds `base#0`,
 * `base#1`, ... for however many real ones have ever been recorded, so this is just how far that
 * run goes. Also, incidentally, the next ordinal a genuinely new occurrence should take.
 */
function recordedCount(base: string, seen: ReadonlySet<string>): number {
  let n = 0;
  while (seen.has(`${base}#${n}`)) n++;
  return n;
}

/**
 * Which ordinal this occurrence of `base` should take — or `null`, meaning it already has one and
 * this call is a duplicate.
 *
 * **Not replaying (`pass` is `null`)**: always the next ordinal `seen` doesn't hold yet. Correct
 * because a live call is, by construction, a genuinely new occurrence — the log-watcher never
 * revisits a byte it has already consumed — so "not yet recorded" and "new" mean the same thing.
 *
 * **Replaying**: the same file can legitimately be read more than once (twice by hand, or once
 * live and once on an eaten log later — ADR 0033's own examples), so "not yet recorded" no longer
 * proves anything: a second pass hasn't recorded *anything* at its own start. What it can trust
 * instead is **which occurrence of `base` this is within the current pass** — `pass`, reset once
 * per replay by `startReplay` — compared against how many are already on permanent record. The Kth
 * occurrence this pass is new only once fewer than K are already recorded; otherwise a prior pass
 * already accounted for it. Given the identical file read in the identical order, this reproduces
 * the exact same ordinals a second time rather than inventing new ones — which is what makes a
 * signature that collided once still dedupe correctly on every later re-read
 * ([ADR 0207](../specs/decisions/0207-a-retired-kill-still-remembers-its-own-line.md)).
 */
function ordinalFor(base: string, seen: ReadonlySet<string>, pass: Map<string, number> | null): number | null {
  const already = recordedCount(base, seen);
  if (!pass) return already;
  const occurrence = (pass.get(base) ?? 0) + 1;
  pass.set(base, occurrence);
  return occurrence <= already ? null : already;
}

/**
 * And for a coin line. It names no item or source — the log says only how much and that it
 * came off "the corpse" — so the timestamp and the amount are the whole identity available.
 * Two identical amounts in the same second would collapse into one, which is the right way
 * to be wrong: under-counting coin is a smaller lie than doubling it on every re-import.
 */
function coinKey(at: string, copper: number): string {
  return `${at}\0coin\0${copper}`;
}

export function createKillLog(userDataDir: string): KillLog {
  const file = path.join(userDataDir, "kill-log.json");
  const stored = read();
  let kills: KillRecord[] = stored.kills;
  /**
   * What the records that have aged out taught, per mob and zone. Small — one entry per mob you
   * have ever killed in a zone, however many times — which is the point: the detail is bounded,
   * the knowledge isn't (ADR 0056).
   */
  let retired: MobObservation[] = stored.retired;
  /**
   * Every kill/loot/coin key this log has ever recorded, kept **forever** — independent of whether
   * the record it came from still sits in `kills` or has retired into `retired`, and never reset by
   * `clear("records")` either, since `retired`'s counts depend on these never being seen as new
   * again. Only `clear("everything")` clears them, because that's the one time nothing is left that
   * needs protecting. See the module doc and ADR 0207.
   */
  const killKeys = new Set<string>(stored.seenKillKeys);
  const lootKeys = new Set<string>(stored.seenLootKeys);
  const coinKeys = new Set<string>(stored.seenCoinKeys);
  // `schema` is **written back untouched**, and that matters more than it looks. It belongs to
  // `migrations.ts`, not to this store — but this store owns the file, so a snapshot that left the
  // field out silently deleted it on the first save after a migration. The migration then found an
  // unstamped file next launch and re-read *every log in the folder* (19 MB on a real install) to
  // repair nothing, at every launch, for ever. A store must carry fields it doesn't own.
  const saver = createSaver(
    file,
    "kill log",
    () => ({
      schema: stored.schema,
      kills,
      retired,
      seenKillKeys: [...killKeys],
      seenLootKeys: [...lootKeys],
      seenCoinKeys: [...coinKeys],
    }),
    WRITE_DEBOUNCE_MS,
    { concern: "kill-log" },
  );
  /**
   * How many times the records have changed, for a reader that would otherwise have to re-derive
   * them to find out ([`peer-share.ts`](./peer-share.ts)'s `ShareSource`).
   *
   * Bumped in `save`, which is the one place every writer already funnels through — a counter kept
   * anywhere else would be a second thing to remember on every new writer, and the one a writer
   * forgot would be a peer never hearing about a kill.
   *
   * In memory and never persisted: it exists to answer "has this changed **since you last asked**",
   * a question that only has meaning within one run. Declared here, ahead of most of this
   * function's own state, because the one-time migration below needs `save()` already usable.
   */
  let version = 0;

  function save(): void {
    version++;
    saver.save();
  }
  let player = "";
  /**
   * The last two position fixes, newest first, each tagged with the zone it was taken in —
   * a fix from the zone you just left says nothing about where you are now.
   */
  let fixes: { y: number; x: number; at: number; zone: string | null }[] = [];
  /**
   * The corpse an item was last taken from, and when. It's the best evidence available for
   * where a coin line's money came from — see `noteCoin`.
   */
  let lastLooted: { kill: KillRecord; at: number } | null = null;
  /**
   * One spelling per mob. Seeded from what's already stored so the canonical name survives
   * a restart — otherwise the spelling the file uses and the spelling this session picks
   * could differ, and the same mob would show up twice.
   */
  const { canon } = createNameRegistry(kills.map((k) => k.mob));
  /**
   * `null` outside a replay — see `startReplay` and `ordinalFor`. A `Map` while one is active,
   * counting each signature's occurrences within *this* pass so a colliding one can still be told
   * from a duplicate rather than either always trusting the permanent count (which would invent a
   * new occurrence on every re-read) or never advancing past it (which would refuse a genuine one).
   */
  let replayKills: Map<string, number> | null = null;
  let replayLoot: Map<string, number> | null = null;

  // A file from before ADR 0207 has no permanent key store to seed from — best-effort seeding from
  // whatever's still on the held records, since a kill that had already retired past the cap by
  // then has no key left to recover; only what happens from here on is fully protected. Records'
  // own keys predate the `#ordinal` suffix where they have one at all, migrated in place: the
  // lowest ordinal not yet claimed, rather than assuming `#0`, since an ancient signature that
  // collided before this fix existed left more than one un-suffixed key for this loop to meet.
  const seeding = !stored.seenKillKeys;
  let migrated = false;
  for (const k of kills) {
    if (k.key && /#\d+$/.test(k.key)) {
      if (seeding) killKeys.add(k.key);
    } else {
      const base = baseKillKey(k.at, k.mob, k.killer ?? "");
      k.key = killKey(k.at, k.mob, k.killer ?? "", recordedCount(base, killKeys));
      killKeys.add(k.key);
      migrated = true;
    }
    for (const dk of k.dropKeys ?? []) {
      if (/#\d+$/.test(dk)) {
        if (seeding) lootKeys.add(dk);
      } else {
        lootKeys.add(`${dk}#0`); // dropKeys carry no fields to recompute a base+ordinal from outside `noteLoot`
        migrated = true;
      }
    }
    if (seeding) for (const ck of k.coinKeys ?? []) coinKeys.add(ck);
  }
  if (migrated || seeding) save();

  /** Fold a loot line into a corpse: record the item and the line's key, so a replay is a no-op. */
  function attachDrop(kill: KillRecord, item: string, key: string, at: number): void {
    kill.drops = [...(kill.drops ?? []), item];
    kill.dropKeys = [...(kill.dropKeys ?? []), key];
    lootKeys.add(key);
    lastLooted = { kill, at }; // this corpse is the one a coin line just after is about
    save();
  }

  /** The same for coin: added to whatever this corpse has already paid out. */
  function attachCoin(kill: KillRecord, copper: number, key: string): void {
    kill.coin = (kill.coin ?? 0) + copper;
    kill.coinKeys = [...(kill.coinKeys ?? []), key];
    coinKeys.add(key);
    save();
  }

  function read(): {
    schema?: number;
    kills: KillRecord[];
    retired: MobObservation[];
    seenKillKeys?: string[];
    seenLootKeys?: string[];
    seenCoinKeys?: string[];
  } {
    // Absent or unreadable is an empty log — a heatmap is a nicety, never a hard failure.
    const parsed = readJson<{
      schema?: number;
      kills?: KillRecord[];
      retired?: MobObservation[];
      seenKillKeys?: string[];
      seenLootKeys?: string[];
      seenCoinKeys?: string[];
    }>(file, {});
    return {
      // Read only to be written back — see the saver above on why dropping it was expensive.
      schema: parsed.schema,
      kills: Array.isArray(parsed.kills) ? parsed.kills : [],
      // `withAreas`: a `retired` row written before ADR 0228 has only a single `area`, not `areas`.
      retired: Array.isArray(parsed.retired) ? parsed.retired.map(withAreas) : [],
      // `undefined` (not `[]`) when absent, so callers can tell "no file yet" from "empty on
      // purpose" — the migration below only runs once, on the former.
      seenKillKeys: Array.isArray(parsed.seenKillKeys) ? parsed.seenKillKeys : undefined,
      seenLootKeys: Array.isArray(parsed.seenLootKeys) ? parsed.seenLootKeys : undefined,
      seenCoinKeys: Array.isArray(parsed.seenCoinKeys) ? parsed.seenCoinKeys : undefined,
    };
  }

  /**
   * A record is leaving the log. Fold what it taught into the retired observations first — its
   * kill counts towards the mob's drop rate whether or not we still hold the row it came from,
   * and its position is part of where that mob lives.
   */
  function retire(leaving: KillRecord[]): void {
    if (!leaving.length) return;
    retired = sumObservations(retired, observeMobs(leaving));
    log.debug("retired", leaving.length, "kill records into", retired.length, "observations");
  }

  /**
   * The `n` records to drop when the cap is reached, **oldest by the log's own clock** — which is not
   * the same as oldest by insertion, and the difference is a real one.
   *
   * Eating a past log appends records that are *older* than everything already stored (`log-import.ts`
   * replays it through this very path), so taking them off the front discarded tonight's kills and
   * kept a fortnight-ago's. What they taught survived either way, as observations — but the heatmap,
   * the time windows and the respawn gaps all read the records themselves, so the app forgot the
   * evening it had just watched. `combat-history.ts` drops by the same rule, for the same reason.
   *
   * A record whose timestamp won't parse sorts oldest: it can't be placed in time at all, so it is
   * the least useful thing here to keep.
   */
  function oldest(n: number): KillRecord[] {
    // A sentinel rather than a branch in the comparator: `NaN` on either side makes a comparator
    // that disagrees with itself, and `sort` is entitled to do anything with one.
    const when = (k: KillRecord): number => {
      const at = Date.parse(k.at);
      return Number.isNaN(at) ? Number.MIN_SAFE_INTEGER : at;
    };
    return [...kills].sort((a, b) => when(a) - when(b)).slice(0, n);
  }

  /** You or anything of yours, against the current `player` — `isYours` is shared with the
   *  damage meter so the two can't disagree about what counts as yours. */
  const isMine = (name: string): boolean => isYours(name, player);

  return {
    setPlayer(name) {
      player = name.trim();
      if (!player) return;
      // Now that we know who you are, records that were only ever your pet dying can go.
      // They were filed before the killer was captured and read as mobs you farm — one with
      // an observed drop rate of nothing, dragging down a camp report it was never part of.
      const dropped = kills.filter((k) => isMine(k.mob));
      if (!dropped.length) return;
      log.debug("dropped", dropped.length, "of your own deaths from the kill log");
      kills = kills.filter((k) => !isMine(k.mob));
      lastLooted = null; // it may point at one of the records just dropped
      // Their keys stay — see the module doc. `isMine(mob)` below refuses the same line again
      // regardless, once `player` is set, so nothing is lost by no longer forgetting them.
      save();
    },

    startReplay() {
      replayKills = new Map();
      replayLoot = new Map();
    },

    noteLoc(loc, zone) {
      const at = Date.parse(loc.at);
      if (Number.isNaN(at)) return;
      fixes = [{ y: loc.y, x: loc.x, at, zone }, ...fixes].slice(0, 2);
    },

    record(rawMob, killer, zone, atIso, logId, named, killerNamed) {
      const at = Date.parse(atIso);
      if (Number.isNaN(at)) return false;
      const mob = canon(rawMob);
      // "Kainos`s warder has been slain by a kobold!" reads as a kill to the line parser,
      // but your own pet dying is not something you killed — and left in, it becomes a mob
      // you appear to farm, complete with an observed drop rate of nothing.
      if (isMine(mob)) return false;

      // The same log line read twice — a re-import, or a log eaten after it was watched live —
      // must record one kill, not two, while a genuinely different kill sharing this exact second,
      // mob and killer still gets its own row. `ordinalFor` is what tells them apart; `null` means
      // this exact occurrence is already on record.
      const base = baseKillKey(atIso, mob, killer);
      const ordinal = ordinalFor(base, killKeys, replayKills);
      if (ordinal === null) return false;
      const key = killKey(atIso, mob, killer, ordinal);

      // Only fixes from this zone can place this kill: zoning teleports you, so the last
      // `/loc` from the zone you left is not a stale position, it's a wrong one.
      //
      // The one place the zone is compared **verbatim** rather than folded (ADR 0059). Stepping
      // from Steamfont 2 to Steamfont 3 is the same teleport as any other — you arrive at the
      // zone-in point — so the fix you took before it is wrong in exactly the way this guards
      // against, even though both names fold to one zone everywhere else. Both strings come from
      // the same zone tracker, so there's no spelling to reconcile here either.
      //
      // A fix with **no** zone is one taken before we knew where you were — the catch-up path that
      // finds a `/loc` but no zone line (`log-watcher.ts`). Unknown is not a wildcard: letting it
      // match every zone put nine Kerra Isle kills at a Steamfont camp's exact coordinates in a
      // real log, three minutes after zoning. It matches only a kill whose zone is equally
      // unknown, which is the same state rather than a guess across one.
      const usable = fixes.filter((f) => f.zone === zone);
      const [fix, prev] = usable;

      // No fix at all: still worth recording that the kill happened, with no position.
      const ageSec = fix ? Math.max(0, Math.round((at - fix.at) / 1000)) : undefined;
      const movedSec = fix && prev ? Math.max(0, Math.round((fix.at - prev.at) / 1000)) : undefined;
      const movedUnits = fix && prev ? distance(fix, prev) : undefined;
      const speed = movedSec && movedUnits !== undefined ? Math.round(movedUnits / movedSec) : undefined;

      // Dead reckoning: same course and speed, carried on for as long as the fix is old.
      // Only offered when there's a course to extend and the player was actually moving.
      const moved = movedUnits !== undefined && movedUnits > STILL_UNITS;
      const guessed =
        fix && prev && ageSec !== undefined && movedSec && moved
          ? {
              y: Math.round(fix.y + ((fix.y - prev.y) / movedSec) * ageSec),
              x: Math.round(fix.x + ((fix.x - prev.x) / movedSec) * ageSec),
            }
          : undefined;

      const record: KillRecord = {
        id: randomUUID(),
        logId,
        at: atIso,
        mob,
        killer,
        key,
        mine: isMine(killer),
        // Whether the log wrote it without an article — the only evidence a kill line gives that
        // this was a named, and gone from `mob` above by the time anything else could read it
        // (ADR 0092). Left absent rather than defaulted, so an old record stays *unknown*.
        named,
        // And the same about the killer, which is what separates a boss dying from a person dying.
        killerNamed,
        zone: zone ?? undefined,
        y: fix?.y,
        x: fix?.x,
        fixAgeSec: ageSec,
        prevY: prev?.y,
        prevX: prev?.x,
        movedUnits,
        movedSec,
        speed,
        guessedY: guessed?.y,
        guessedX: guessed?.x,
        confidence: confidenceFor(ageSec, moved, isMine(killer)),
      };

      kills.push(record);
      killKeys.add(key);
      if (kills.length > MAX_KILLS) {
        // The oldest records go, but their keys don't — see the module doc (ADR 0207). What they
        // taught stays as observations (`retire`), so the cap costs detail and never knowledge, and
        // now costs no idempotency either.
        const leaving = oldest(kills.length - MAX_KILLS);
        const gone = new Set(leaving.map((k) => k.id));
        kills = kills.filter((k) => !gone.has(k.id));
        retire(leaving);
      }
      save();
      return true;
    },

    noteLoot(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || !event.source) return false;
      const source = event.source.toLowerCase();
      // The same loot line read twice must not add the drop twice, while two corpses genuinely
      // dropping the identical item in the identical second must both count — the same
      // signature-plus-ordinal question `record` asks, recognised before any corpse-matching.
      const base = baseLootKey(event.at, event.item, source);
      const ordinal = ordinalFor(base, lootKeys, replayLoot);
      if (ordinal === null) return false;
      const key = lootKey(event.at, event.item, source, ordinal);
      // Corpses linger and are looted in any order, so which one an item came from is a
      // guess whenever the same mob died more than once nearby. Prefer the newest corpse
      // that isn't already holding this item: two identical items and two corpses is far
      // more likely one each than both from one — and piling every drop onto the newest
      // kill would leave its neighbours looking like they dropped nothing, which is what
      // an observed drop rate is built from.
      let fallback: KillRecord | null = null;
      for (let i = kills.length - 1; i >= 0; i--) {
        const kill = kills[i];
        const killAt = Date.parse(kill.at);
        if (Number.isNaN(killAt)) continue; // a bad timestamp shouldn't end the search
        if (at - killAt > LOOT_WINDOW_MS) break; // older than the window: so is everything past it
        if (kill.mob.toLowerCase() !== source) continue;
        if (!fallback) fallback = kill;
        if (kill.drops?.includes(event.item)) continue;
        attachDrop(kill, event.item, key, at);
        return true;
      }
      // Every candidate corpse already holds one. For a corpse whose drops we've been keying that
      // means a genuine second drop; for one recorded before keying (no dropKeys) it's far more
      // likely this same line replayed — so don't inflate the rate, just remember we've seen it.
      if (fallback) {
        if (fallback.dropKeys) {
          attachDrop(fallback, event.item, key, at);
          return true;
        }
        lootKeys.add(key);
      }
      return false;
    },

    /**
     * Coin off a corpse. Harder to place than an item, because the line names nothing —
     * "You receive 3 gold from the corpse." — so there's no name to match on and the guess
     * has to come from what the log was doing at the time.
     *
     * Two signals, best first. **The corpse you were just looting**: coin arrives as part of
     * one looting action, so an item line moments earlier names the corpse the money came
     * from, and that beats any timing argument. Failing that, **the newest kill of yours in
     * the window** — the same reasoning as a drop, minus the name check that normally does
     * the real work, so it's the weaker answer and only used when there's nothing better.
     *
     * Strangers' corpses are never candidates: you didn't loot them, and crediting a mob with
     * money you never took would inflate exactly the figure this exists to get right. Coin
     * that finds no corpse is dropped here and still counted in the session total, which is
     * derived separately — a mob-level blank rather than a session-level lie.
     */
    noteCoin(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || event.from !== "corpse" || event.copper <= 0) return false;
      const key = coinKey(event.at, event.copper);
      if (coinKeys.has(key)) return false;

      // The same "strangers' corpses are never candidates" rule the fallback below applies —
      // missing here, a stranger's corpse you happened to loot just before this coin line would
      // credit their kill with money you never took (ADR 0027: only your own kills count).
      if (lastLooted && lastLooted.kill.mine !== false && at - lastLooted.at <= COIN_FOLLOWS_LOOT_MS && at >= lastLooted.at) {
        attachCoin(lastLooted.kill, event.copper, key);
        return true;
      }
      for (let i = kills.length - 1; i >= 0; i--) {
        const kill = kills[i];
        const killAt = Date.parse(kill.at);
        if (Number.isNaN(killAt)) continue;
        if (at - killAt > LOOT_WINDOW_MS) break;
        if (kill.mine === false) continue;
        attachCoin(kill, event.copper, key);
        return true;
      }
      return false;
    },

    // Asked by **place**, answered from records that each keep the log's own wording (ADR 0083).
    // One Steamfont is drawn by one map file, and the kills that happened there belong on it whichever
    // difficulty the door was set to (ADR 0059); the name asked with is usually a map pack's label
    // rather than the log's, so it may also be a letter out (ADR 0075). All of that lives in
    // `samePlace` — the record is never rewritten, and the question is never guessed at twice.
    kills: (zone) => (zone ? kills.filter((k) => samePlace(k.zone, zone)) : [...kills]).reverse(),

    // Held records and retired ones, added together — the same arithmetic either way, so a mob
    // whose kills straddle the cap reads as one observation rather than two.
    observations: () => sumObservations(observeMobs(kills), retired),

    version: () => version,

    clear(scope = "records") {
      // Retire the records on the way out, exactly as the cap does — otherwise "clear the records,
      // keep what I've learned" would still lose everything the records currently held taught,
      // which is most of it.
      if (scope === "records") {
        retire(kills);
        // The keys stay: `retired` just absorbed these records' counts, and a re-eaten log must
        // still recognise them as already accounted for, or "clear records, keep what I've
        // learned" would double them the moment the same log crossed this app again (ADR 0207).
      } else {
        retired = [];
        // A full wipe is the one time nothing is left to protect, so this is also the one time
        // starting fresh means forgetting every key too.
        killKeys.clear();
        lootKeys.clear();
        coinKeys.clear();
      }
      kills = [];
      // The fixes describe where the cleared kills happened; keeping them would place the
      // next kill using evidence the player just asked us to forget.
      fixes = [];
      lastLooted = null; // it points at a record that no longer exists
      // Bumped by hand: a clear flushes rather than saving, and a forgetting that nobody was told
      // about would leave peers being offered a count of records that are gone.
      version++;
      saver.flush();
    },

    flush() {
      saver.flush();
    },

    // `id`/`key`/`dropKeys`/`drops` are absent because they're identity a patch must never touch
    // (ADR 0033's dedup depends on them, and the last is a nested list this editor doesn't attempt)
    // — and so, for the same reason, are `mob` and `killer`: `killKeys` (above) dedupes on exactly
    // those two plus `at`, outside this store's view, so editing either here would leave that Set
    // keyed to a mob/killer the record no longer says, risking a real future kill misread as a
    // duplicate. `zone` — the field this panel exists for — carries no such key anywhere.
    admin: createArrayAdminStore("Kills", () => kills, {
      idOf: (k) => k.id,
      summaryOf: (k) => `${k.mob} — ${k.zone ?? "no zone"} (${k.at})`,
      editable: ["zone", "y", "x", "confidence", "named", "killerNamed", "mine"],
      // Removed outright, not just uneditable: unlike a bad `zone`, a whole misrecorded kill has
      // nothing worth keeping. `killKeys` is left alone on purpose (same reasoning as `clear`'s own
      // comment above) — a deleted row staying deduped means replaying the same log can't quietly
      // bring it back.
      remove: (k) => {
        const i = kills.indexOf(k);
        if (i >= 0) kills.splice(i, 1);
      },
      save,
    }),
  };
}

/**
 * How much to believe a kill's position, 0–1.
 *
 * Age is the main term: exact while the fix is fresh, sliding to nothing by the trust
 * horizon. Movement is the second: a player who covered ground between their last two
 * fixes was probably not standing where the newer one says, so the score is halved —
 * whereas one who hadn't moved at all is credible even with an older fix, which is exactly
 * the camp case a heatmap is for.
 *
 * Someone else's kill is halved for the same reason: your `/loc` is evidence about where
 * *you* were standing, and the stranger who killed it was somewhere else in earshot. Still
 * worth plotting off a good fix — the mob was nearby — but never as well placed as your own.
 */
function confidenceFor(ageSec?: number, moved?: boolean, mine = true): number {
  if (ageSec === undefined) return 0;
  const byAge =
    ageSec <= FRESH_SEC
      ? 1
      : Math.max(0, 1 - (ageSec - FRESH_SEC) / (TRUST_HORIZON_SEC - FRESH_SEC));
  const penalty = (moved ? 0.5 : 1) * (mine ? 1 : 0.5);
  return round(byAge * penalty, 2);
}
