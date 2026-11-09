/**
 * stat-read-apply.ts — a stats read, applied to the plan as the character it says you are.
 *
 * A figure on the stats page is the game's total; the plan keeps it as an offset from what it counts
 * (`stat-base.ts`), and what it counts depends on the classes and level it was told. If the window's corner
 * says "31 WIZ/DRU/MAG" and the planner still has one class ticked at the level cap, measuring the read against
 * the planner would bake that difference into every offset. So a read is measured against **what it says
 * you are** — its classes and level where it has them, the planner's own where it doesn't — and the planner
 * is told to follow (`set`). Done in one step, from the read, rather than "put the classes in, wait for the
 * planner to settle, then measure": there is no moment when the offsets and the pickers disagree.
 *
 * Offsets are only true against the basis they were measured under ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)),
 * so a read under a *different* basis than the calibration it lands on replaces that calibration rather than
 * mixing two bases in one plan. Only when it actually applied something: a read that was sure of nothing has
 * refreshed nothing, and wiping what the player had would be a loss for no gain.
 *
 * Pure → a tested black box.
 */
import { derivedRates } from "./derived-stats";
import { MAX_PLAYER_LEVEL } from "./item-levels";
import { effectiveStats, type LoadoutStats } from "./loadout-stats";
import { applyRead, countedNow, modelledBase, type Calibration } from "./stat-base";
import { basisChange, basisOf, type Basis } from "./stats-drift";
import { confidentValues, type StatsRead, type StatsValues } from "./stats-page";

/** What the planner has ticked now. */
export interface Planner {
  race?: string;
  classes: readonly string[];
  level: number;
}

export interface AppliedRead {
  calibration: Calibration;
  /** What the figures were measured against — the read's classes and level where it had them. */
  basis: Basis;
  /** Pickers to move so the planner agrees with the read; absent when it already does. */
  set?: { classes?: string[]; level?: number };
  /** The figures that went in. */
  applied: StatsValues;
  /** The figures the read was unsure of — for the player to confirm, never applied unasked. */
  held: StatsValues;
}

const lower = (names: readonly string[]) => [...names].map((c) => c.toLowerCase()).sort().join(",");

/** The level a read's number means to the planner: the cap, where the slider means "no cap". */
const capped = (level: number) => Math.min(MAX_PLAYER_LEVEL, Math.max(1, Math.round(level)));

/**
 * `read` applied to `calibration`. `measuredAs` is what that calibration was measured against, when known —
 * a read that changes it starts over; without it the read merges, as a typed figure does.
 */
export function applyStatsRead(input: { read: StatsRead; planner: Planner; worn: LoadoutStats; calibration: Calibration; measuredAs?: Basis }): AppliedRead {
  const { read, planner, worn, calibration, measuredAs } = input;
  const who = read.who;
  const classes = who?.classes.length ? who.classes : [...planner.classes];
  const level = who?.level !== undefined ? capped(who.level) : planner.level;
  const basis = basisOf(planner.race, classes, level);

  const sure = confidentValues(read);
  const set: AppliedRead["set"] = {
    ...(who?.classes.length && lower(who.classes) !== lower(planner.classes) && { classes: [...who.classes] }),
    ...(who?.level !== undefined && level !== planner.level && { level }),
  };

  const rates = derivedRates({ classes, level, race: planner.race, worn });
  const counted = countedNow(modelledBase({ rates, race: planner.race, classes }), effectiveStats(worn, rates).total);
  const fresh = !!measuredAs && !!basisChange(measuredAs, basis);
  // Only what the plan keeps an offset for counts: the regen rows, say, are read but not calibrated — and so
  // are neither applied nor worth asking the player to confirm.
  const applied: StatsValues = {};
  const held: StatsValues = {};
  for (const [key, value] of Object.entries(read.values) as [keyof StatsValues, number][]) {
    if (key in counted) (key in sure ? applied : held)[key] = value;
  }
  const anything = Object.keys(applied).length > 0;
  return {
    calibration: anything ? applyRead(fresh ? {} : calibration, sure, counted) : calibration,
    basis,
    ...(set.classes || set.level !== undefined ? { set } : {}),
    applied,
    held,
  };
}
