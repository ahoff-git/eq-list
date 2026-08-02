/**
 * hp-estimate.ts — bounds on your maximum hit points, inferred from the log.
 *
 * EQ never states your health. But it states every hit you take, every heal you receive
 * (including how much of it was *wasted*), and when you die — and those squeeze the
 * answer from both sides:
 *
 *   **At least.** If you absorbed 640 damage inside one fight with nobody healing you,
 *   you had more than 640 hit points when it started, so your maximum is at least that.
 *   No assumptions needed — you demonstrably survived it.
 *
 *   **At most.** If you were at *full* and then died taking 780, your maximum can't
 *   exceed 780. This needs a moment where full health is known, which the log gives two
 *   ways: an **overheal** on you ("healed Kainos for 8 (20) hit points" — the 20 was
 *   capped, so you finished exactly full), or a respawn after death.
 *
 * Both are windows, and a window is only usable if nothing invalidated it:
 *
 *   - **A heal on you** ends an "at least" window — healing lets you absorb more than you
 *     have, which would inflate the floor.
 *   - **Time.** Health regenerates out of combat, so a stretch is cut when damage stops
 *     for `WINDOW_IDLE_MS`; otherwise an evening of sitting would read as one huge window.
 *   - **A buff fading or a level-up** changes the maximum itself, so observations are
 *     dropped and collection starts over (level is recorded, so stale data can't leak in).
 *
 * The result is deliberately a **soft** estimate: stored, refined as more play arrives,
 * and overridable — if the player states their maximum outright, that's authoritative
 * until they level. Buffs the log doesn't announce are the main source of drift, which is
 * exactly why the number is presented as an estimate with its evidence.
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import type { CombatEvent, HpEstimate } from "../src/shared/types";

const log = createLogger("hp-estimate");

/** No incoming damage for this long ends a window (health regenerates in the gap). */
const WINDOW_IDLE_MS = 10_000;

/**
 * How long an unhealed stretch may run before it stops being evidence of anything.
 *
 * A "stretch" is damage with gaps under `WINDOW_IDLE_MS`, which at a camp chains pull after
 * pull into one run lasting minutes — and you regenerate throughout. Summing it claims you
 * absorbed the lot on one health bar: a real log produced "survived at least 815" for a level
 * 2 character, while deaths at the same levels put the ceiling at 198. A floor above a known
 * ceiling isn't a rough figure, it's a wrong one.
 *
 * So a long stretch is discarded rather than banked, unless the player has told us their
 * regeneration rate and it can actually be subtracted. A minute is a judgement call: long
 * enough to cover a real fight, short enough that ten ticks of regen can't dominate.
 */
const MAX_UNHEALED_SPAN_MS = 60_000;

/**
 * How often health ticks back. Regeneration is the reason a window's *duration* matters
 * and not just its damage: over a minute of fighting you can absorb noticeably more than
 * you have. The rate is unknowable from the log (it varies with level, gear, sitting and
 * combat state), so it's discounted only when the player states it — and the estimate is
 * presented as rough either way.
 */
const REGEN_TICK_MS = 6000;

/** Observations land in clusters; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

export interface HpTracker {
  state(): HpEstimate;
  /** Feed a combat event. Damage on you, heals on you and your deaths all count. */
  record(event: CombatEvent): void;
  /** Who "you" are, so heals and damage aimed at you can be recognized by name. */
  setPlayer(name: string): void;
  /** A level-up: maximum hit points changed, so the evidence starts over. */
  levelUp(level?: number): void;
  /** The player states their maximum outright — believed over any inference. */
  set(max: number): HpEstimate;
  /** The player states their in-combat regeneration per tick, so windows can discount it. */
  setRegen(perTick: number): HpEstimate;
  onChange(cb: (estimate: HpEstimate) => void): void;
  flush(): void;
}

const empty = (level?: number): HpEstimate => ({ atLeast: 0, level, samples: 0, updatedAt: "" });

export function createHpEstimate(
  userDataDir: string,
  nowIso: () => string = () => new Date().toISOString(),
): HpTracker {
  const file = path.join(userDataDir, "hp-estimate.json");
  const bus = new EventEmitter();
  let timer: NodeJS.Timeout | null = null;
  let state: HpEstimate = read();
  let player = "";

  /** Damage taken since the last heal/gap — the "at least" window. */
  let sinceHeal = 0;
  /** Damage taken since a moment we knew you were full — the "at most" window. */
  let sinceFull = 0;
  /** False once a buff faded (or we never had a full anchor): `sinceFull` is unusable. */
  let fullKnown = false;
  let lastHitAt = 0;
  /** The most recent hit's size — the blow that killed you isn't damage you survived. */
  let lastAmount = 0;
  /** When each window opened, so regeneration over its span can be discounted. */
  let healWindowStart = 0;
  let fullWindowStart = 0;

  function read(): HpEstimate {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<HpEstimate>;
      return {
        atLeast: Math.max(0, Number(parsed.atLeast) || 0),
        regenPerTick: typeof parsed.regenPerTick === "number" ? parsed.regenPerTick : undefined,
        atMost: typeof parsed.atMost === "number" ? parsed.atMost : undefined,
        stated: typeof parsed.stated === "number" ? parsed.stated : undefined,
        level: typeof parsed.level === "number" ? parsed.level : undefined,
        samples: Math.max(0, Number(parsed.samples) || 0),
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    } catch {
      return empty();
    }
  }

  function write(): void {
    timer = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state), "utf8");
    } catch (e) {
      log.warn("could not save hp estimate:", (e as Error).message);
    }
  }

  function changed(): HpEstimate {
    state = { ...state, updatedAt: nowIso() };
    if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
    bus.emit("change", state);
    return state;
  }

  const isMe = (name: string): boolean => name === "You" || (!!player && name === player);

  /** Start both windows over — after a level-up, a buff change, or a fresh anchor. */
  function resetWindows(full: boolean): void {
    sinceHeal = 0;
    sinceFull = 0;
    fullKnown = full;
    lastHitAt = 0;
    lastAmount = 0;
    healWindowStart = 0;
    fullWindowStart = 0;
  }

  /**
   * Health regained over a window, as far as we can tell. Zero unless the player has
   * stated a rate — a guessed rate would quietly bias every bound.
   */
  function regenOver(fromMs: number, toMs: number): number {
    const rate = state.regenPerTick;
    if (!rate || !fromMs || toMs <= fromMs) return 0;
    return Math.floor((toMs - fromMs) / REGEN_TICK_MS) * rate;
  }

  /**
   * Raise the floor: you lived through this much damage between `fromMs` and `toMs`, so your
   * maximum exceeds it — less whatever ticked back while it happened. A stretch too long to
   * be trusted is discarded rather than banked; see `MAX_UNHEALED_SPAN_MS`.
   */
  function observeSurvived(damage: number, fromMs: number, toMs: number): void {
    const span = fromMs && toMs > fromMs ? toMs - fromMs : 0;
    if (!state.regenPerTick && span > MAX_UNHEALED_SPAN_MS) {
      log.debug("unhealed stretch too long to trust; discarded", { damage, seconds: Math.round(span / 1000) });
      return;
    }
    const net = damage - regenOver(fromMs, toMs);
    if (net <= state.atLeast) return;
    damage = net;
    // A floor above a known ceiling means the ceiling came from a stale buff state; the
    // demonstrated floor is the more trustworthy of the two, so the ceiling is dropped.
    const atMost = state.atMost !== undefined && state.atMost <= damage ? undefined : state.atMost;
    state = { ...state, atLeast: damage, atMost, samples: state.samples + 1 };
    log.debug("hp floor raised", { atLeast: damage, atMost });
    changed();
  }

  /** Lower the ceiling: full health minus this much *net* damage was fatal. */
  function observeDied(damage: number, regen = 0): void {
    damage -= regen;
    if (damage <= 0) return;
    if (state.atMost !== undefined && state.atMost <= damage) return;
    // A ceiling below the floor is a contradiction, and the ceiling is the sounder half: it
    // runs from a known-full anchor to a death, while the floor only assumes nothing healed
    // you. Scripted fights break that assumption — a real log banked "survived at least 813"
    // from a 15-second mauling the game kept the player alive through, and because a floor
    // could only ever rise, that reading was permanent. So a tighter ceiling clears it and
    // collection starts again.
    const atLeast = state.atLeast > damage ? 0 : state.atLeast;
    if (atLeast !== state.atLeast) log.debug("floor discarded — it exceeded a measured ceiling", { was: state.atLeast, atMost: damage });
    state = { ...state, atMost: damage, atLeast, samples: state.samples + 1 };
    log.debug("hp ceiling lowered", { atMost: damage });
    changed();
  }

  return {
    state: () => state,
    setPlayer(name) {
      player = name.trim();
    },

    record(event) {
      switch (event.kind) {
        case "damage": {
          if (!isMe(event.target)) return;
          const at = Date.parse(event.at);
          if (Number.isNaN(at)) return;
          // Out-of-combat regeneration would let a long stretch exceed your real maximum,
          // so a lull banks what we have and starts a fresh window.
          if (lastHitAt && at - lastHitAt > WINDOW_IDLE_MS) {
            observeSurvived(sinceHeal, healWindowStart, lastHitAt);
            sinceHeal = 0;
            healWindowStart = at;
          }
          if (!healWindowStart) healWindowStart = at;
          if (!fullWindowStart) fullWindowStart = at;
          lastHitAt = at;
          lastAmount = event.amount;
          sinceHeal += event.amount;
          sinceFull += event.amount;
          return;
        }
        case "heal": {
          if (!isMe(event.target)) return;
          // A heal invalidates the floor window (you can absorb more than you have)…
          observeSurvived(sinceHeal, healWindowStart, lastHitAt);
          sinceHeal = 0;
          healWindowStart = 0;
          // …and an *overheal* is the one thing that proves full health outright: the
          // surplus had nowhere to go.
          if (event.attempted && event.attempted > event.amount) {
            resetWindows(true);
          } else {
            // A plain heal puts health back, so the ceiling window tracks *net* damage
            // since full — otherwise a healed fight would claim a maximum far too high.
            sinceFull = Math.max(0, sinceFull - event.amount);
          }
          return;
        }
        case "death": {
          if (!isMe(event.victim)) return;
          if (fullKnown) observeDied(sinceFull, regenOver(fullWindowStart, lastHitAt));
          // The killing blow is *not* damage you survived — but everything before it is,
          // so the floor is the window minus that last hit. (Overkill would otherwise
          // credit you with absorbing a blow that in fact ended you.)
          observeSurvived(sinceHeal - lastAmount, healWindowStart, lastHitAt);
          // Respawning puts you back at full — the assumption behind every later ceiling.
          resetWindows(true);
          return;
        }
        case "buff-faded": {
          // A pet's buff can't move *your* maximum; one of yours can, so any window that
          // spans the change is no longer comparable.
          if (event.pet) return;
          observeSurvived(sinceHeal, healWindowStart, lastHitAt);
          resetWindows(false);
          return;
        }
        default:
          return;
      }
    },

    levelUp(level) {
      // More hit points now: every bound collected at the old level is wrong. (The floor is
      // arguably still valid — you don't lose health by levelling — but carrying it forward
      // would also carry any bad reading forward for good, and the floor is the bound most
      // exposed to healing the log never mentions. The regen rate is a fact about the
      // character, not an observation, so it stays.)
      state = { ...empty(level ?? state.level), regenPerTick: state.regenPerTick };
      resetWindows(true);
      log.debug("hp estimate reset by level up", state);
      changed();
    },

    set(max) {
      state = { ...state, stated: Math.max(1, Math.round(max)) };
      log.debug("hp stated by player", state);
      return changed();
    },

    setRegen(perTick) {
      state = { ...state, regenPerTick: Math.max(0, perTick) || undefined };
      log.debug("regen stated by player", state);
      return changed();
    },

    onChange: (cb) => void bus.on("change", cb),

    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
