/**
 * difficulty-scaling.ts — what a mob's wiki HP and damage become at another difficulty.
 *
 * A mob card's `HP:` and `Damage per hit:` are one reading, taken at one difficulty in one kind of
 * instance. EQL scales them by both ([Difficulty Level](https://eqlwiki.com/Difficulty_Level)), so
 * the figure is only right where it was measured. Scaling it is two steps:
 *
 *   1. **Generalise** the stated figure back to the baseline, dividing by the multiplier where it
 *      was measured (`statedAt`).
 *   2. **Scale** that baseline to the setting asked for.
 *
 * Two sources, deliberately kept apart because they are not the same kind of claim:
 *
 *   - **`HEALTH_STEPS`** is the wiki's table, transcribed: for each instance type and difficulty, how
 *     many steps above or below baseline enemy health is (`Reduced --` is −2, `Increased +++` is +3).
 *     The wiki says these are *relative only* and gives no percentages.
 *   - **`STEP_MULTIPLIER`** turns a step into a number. **Nothing measured it.** Steps 0–4 are the
 *     "EQL Adaptive Scaling Matrix" (100/130/170/220/300%) noted in `specs/todo.md`; the reduced
 *     steps are its inverses and +5 continues its last ratio. It is one table so a derived formula
 *     can replace it without touching anything else, and every scaled figure is shown as an estimate.
 *
 * Health and damage are scaled alike, as the matrix does — the wiki's table speaks only of health.
 * Party size, which the wiki says also scales a multiplayer raid's health, is not modelled.
 *
 * Pure: card lines in, card lines out.
 */

/** EQL's five difficulty tiers: D0 (base) to D4 (Refined). */
export const DIFFICULTIES = [0, 1, 2, 3, 4] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The wiki's names for the tiers above D0. */
export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = {
  0: "D0",
  1: "D1 Awakened",
  2: "D2 Adaptive",
  3: "D3 Fused",
  4: "D4 Refined",
};

/** The kinds of instance the wiki's table has a column for. */
export type InstanceType = "public" | "personalSolo" | "personalMulti" | "raidSolo" | "raidMulti";

export const INSTANCE_TYPES: readonly { key: InstanceType; label: string }[] = [
  { key: "public", label: "Public" },
  { key: "personalSolo", label: "Personal, solo" },
  { key: "personalMulti", label: "Personal, group" },
  { key: "raidSolo", label: "Raid, solo" },
  { key: "raidMulti", label: "Raid, group" },
];

/** A difficulty setting: where a figure was read, or where you want to see it. */
export interface DifficultySetting {
  difficulty: Difficulty;
  instance: InstanceType;
  /** A multi-class mob (dual, triple…), which the wiki scales on its own table. */
  multiClass: boolean;
}

/** Where a wiki figure is taken to have been read: an ordinary public zone at D0. */
export const WIKI_STATED: DifficultySetting = { difficulty: 0, instance: "public", multiClass: false };

/** One row of the wiki's table: steps from baseline per instance type, `null` where it says N/A. */
type StepRow = Readonly<Record<InstanceType, number | null>>;
const row = (pub: number | null, ps: number | null, pm: number | null, rs: number | null, rm: number | null): StepRow => ({
  public: pub,
  personalSolo: ps,
  personalMulti: pm,
  raidSolo: rs,
  raidMulti: rm,
});

/**
 * Enemy health relative to baseline, in steps, from eqlwiki's Difficulty Level page (read
 * 2026-10-28). Single-class enemies have no D4 row; multi-class ones have no D0 row.
 */
export const HEALTH_STEPS: Readonly<Record<"single" | "multi", Readonly<Record<Difficulty, StepRow>>>> = {
  single: {
    0: row(0, -2, -1, -2, 1),
    1: row(1, -1, 0, -1, 2),
    2: row(2, 0, 1, 0, 3),
    3: row(3, 1, 2, 1, 4),
    4: row(null, null, null, null, null),
  },
  multi: {
    0: row(null, null, null, null, null),
    1: row(0, -1, 0, -1, 2),
    2: row(1, 0, 1, 0, 3),
    3: row(2, 1, 2, 1, 4),
    4: row(3, 2, 3, 2, 5),
  },
};

/** A step as a multiplier on baseline. Unmeasured — see the file's header before trusting a digit. */
export const STEP_MULTIPLIER: Readonly<Record<number, number>> = {
  [-2]: 1 / 1.7,
  [-1]: 1 / 1.3,
  0: 1,
  1: 1.3,
  2: 1.7,
  3: 2.2,
  4: 3,
  5: 3 * (3 / 2.2),
};

/** Steps from baseline at a setting, or undefined where the wiki says that combination doesn't exist. */
export function healthStep(setting: DifficultySetting): number | undefined {
  return HEALTH_STEPS[setting.multiClass ? "multi" : "single"][setting.difficulty][setting.instance] ?? undefined;
}

/** The multiplier on baseline at a setting, or undefined where the combination doesn't exist. */
export function difficultyMultiplier(setting: DifficultySetting): number | undefined {
  const step = healthStep(setting);
  return step === undefined ? undefined : STEP_MULTIPLIER[step];
}

/**
 * How much a figure read at `statedAt` grows at `target` — generalised to baseline, then scaled.
 * Undefined when either end is a combination the wiki says doesn't exist.
 */
export function scaleFactor(target: DifficultySetting, statedAt: DifficultySetting = WIKI_STATED): number | undefined {
  const to = difficultyMultiplier(target);
  // A multi-class figure stated at D0 has no D0 of its own; its baseline is where its table says 0.
  const from = difficultyMultiplier(statedAt) ?? difficultyMultiplier({ ...statedAt, multiClass: !statedAt.multiClass });
  return to === undefined || from === undefined ? undefined : to / from;
}

const NUMBER = /\d[\d,]*/g;

/** Every number in `text` times `factor`, rounded, keeping a thousands comma where one was written. */
function scaleNumbers(text: string, factor: number): string {
  return text.replace(NUMBER, (n) => {
    const scaled = Math.round(Number(n.replace(/,/g, "")) * factor);
    return n.includes(",") ? scaled.toLocaleString("en-US") : String(scaled);
  });
}

/**
 * A mob card's lines at a setting: `HP:` (not the bracketed figure after it, which isn't health) and
 * every `Damage per …` figure scaled, the rest as written. The lines come back unchanged where the
 * setting doesn't exist or matches where the card was read.
 */
export function mobLinesAtDifficulty(lines: readonly string[], target: DifficultySetting, statedAt: DifficultySetting = WIKI_STATED): string[] {
  const factor = scaleFactor(target, statedAt);
  if (factor === undefined || factor === 1) return [...lines];
  return lines.map((line) => {
    const hp = /^(HP:)([^(]*)(.*)$/.exec(line);
    if (hp) return hp[1] + scaleNumbers(hp[2], factor) + hp[3];
    return line.startsWith("Damage per") ? scaleNumbers(line, factor) : line;
  });
}
