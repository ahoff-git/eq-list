"use client";
import { useEffect, useState } from "react";
import { statMeta } from "@/shared/items/item-stats";
import { LOADOUT_STATS } from "@/shared/items/loadout-stats";
import { CheckField } from "@/app/components/ui";
import { api } from "@/lib/api";
import { useCapabilities } from "@/lib/hooks";
import { STATS_HOTKEY } from "@/shared/constants";
import type { DerivedRate } from "@/shared/items/derived-stats";
import { GOAL_PRESETS, goalCount, goalsWithoutBase, goalsWithoutPools, priorityOnly, withGoal, type BisGoals, type GoalKey, type GoalRow, type StatGoal } from "@/shared/items/bis-goals";
import { calibrate, isCalibrated, shownNow, type Calibration, type StatTotals } from "@/shared/items/stat-base";

const QUICK: readonly GoalKey[] = ["hp", "mana", "ac", "swing", "rest"];
const labelOf = (key: GoalKey) => (key === "swing" ? "Melee damage" : key === "rest" ? "Everything else" : statMeta(key).label);
const num = (n: number) => Math.round(n).toLocaleString();

/**
 * Goals for the loadout, as sliders (ADR 0353): how much a stat drives the plan (priority), and the
 * least of it you'll accept — in points, or as a share of the most any loadout could give. "2k HP and
 * 100 AC, then the hardest swing" is two floors and a priority; "as tanky as I can, near max mana" is
 * a priority and a 95% floor.
 *
 * Floors are in the game's own numbers (ADR 0366): what the gear gives plus what you have without it. The
 * race and classes account for some of that; the rest — class HP, AAs, buffs — is what the game's Inventory
 * window shows: read off the screen in one go (ADR 0368), or typed, once, and the planner keeps the difference.
 *
 * The solver's work lives in `bis-goals.ts`; this only sets goals and shows how each one came out.
 */
export default function BisGoals({
  goals,
  rows,
  rates = [],
  driven = true,
  counted,
  calibration = {},
  readWaiting = false,
  onGoals,
  onCalibration,
}: {
  goals: BisGoals;
  rows: readonly GoalRow[];
  rates?: readonly DerivedRate[];
  /** Whether anything but floors steers the plan (`GoalOutcome.driven`); false says what's left is arbitrary. */
  driven?: boolean;
  /** What the model counts for you now — race and class base plus what you wear. Absent (no dump, or planning for a peer) hides the boxes that calibrate it. */
  counted?: StatTotals;
  calibration?: Calibration;
  /** A stats grab has been read but can't be applied yet — it is measured against what you wear, which needs your dump. */
  readWaiting?: boolean;
  onGoals: (next: BisGoals) => void;
  onCalibration?: (next: Calibration) => void;
}) {
  const keys = Object.keys(goals) as GoalKey[];
  const poolless = goalsWithoutPools(goals, rates);
  const baseless = goalsWithoutBase(goals, rates, calibration);
  const calibratable = keys.filter(isCalibrated);
  // Reading the stats page off the screen needs the desktop app's screen capture.
  const capabilities = useCapabilities();
  const addable = [...QUICK, ...LOADOUT_STATS.filter((k) => !QUICK.includes(k))].filter((k) => !goals[k]);
  const rowOf = (key: GoalKey) => rows.find((r) => r.key === key);
  // A new goal starts as a priority, which is always satisfiable; the floor is the second slider's job.
  const add = (key: GoalKey) => onGoals(withGoal(goals, key, { priority: 50 }));

  return (
    <div className="bis-goals">
      <div className="row wrap">
        <span className="muted small">Start from</span>
        {GOAL_PRESETS.map((p) => (
          <button key={p.id} className="btn sm" title={p.hint} onClick={() => onGoals(p.goals)}>
            {p.label}
          </button>
        ))}
        {keys.length > 0 && (
          <button className="btn ghost sm" onClick={() => onGoals({})} title="Drop every goal">
            Clear {goalCount(goals)}
          </button>
        )}
      </div>

      {keys.map((key) => (
        <GoalLine key={key} stat={key} goal={goals[key]!} row={rowOf(key)} onChange={(change) => onGoals(withGoal(goals, key, change))} />
      ))}

      {!driven && (
        <p className="small warn">
          Only floors are set, so they are met and everything past them is arbitrary.{" "}
          <button className="btn sm" onClick={() => add("rest")} title="Spread what the floors leave over HP, AC, regen and resists — whichever you haven't set a goal on">
            Maximise everything else
          </button>{" "}
          or add a priority or value weights.
        </p>
      )}
      {poolless.length > 0 && (
        <p className="small warn">
          Tick your class(es) in the Class picker: {poolless.map(labelOf).join(" and ")} also come from {poolless.map((k) => (k === "hp" ? "STA" : "INT/WIS")).join(" and ")}, and the plan only counts that once it knows your classes.
        </p>
      )}
      {baseless.length > 0 && (
        <p className="small warn">
          Tick your race in the Race picker: a floor on {baseless.map(labelOf).join(" and ")} is in the game&apos;s numbers, and the attributes your race and classes start with count toward it only once the plan knows your race. Until then it counts gear alone.
        </p>
      )}
      {readWaiting && (
        <p className="small warn">
          A stats read is waiting for your inventory dump: it is measured against what you wear, so it can&apos;t be applied until the app has seen what that is.
        </p>
      )}
      {counted && onCalibration && (capabilities.lookup || calibratable.length > 0) && (
        <div className="row wrap small bis-calibrate">
          {capabilities.lookup && (
            <button
              className="btn sm"
              onClick={() => void api()?.lookup.open("stats")}
              title={`Open your Inventory window's stats page, press ${STATS_HOTKEY.label} (or this), and drag a box over Character Vitals and Stats and Resists. The numbers are read off the screen and the plan keeps the difference from what it counts for what you wear — HP, mana, AC, endurance, attributes and resists in one go. Anything it isn't sure of is left for you to confirm.`}
            >
              Read my stats from the game · {STATS_HOTKEY.label}
            </button>
          )}
          {calibratable.length > 0 && (
            <>
              <span className="muted" title="Floors count the whole character, as the game's Inventory window shows it. The plan knows what your race, classes and gear give; read or type what the game shows for the rest — class and level HP, AAs, a standing buff — and it keeps the difference, so it stays right when your gear changes. Clear a box to go back to what the plan counts.">
                The game shows you, in what you wear now:
              </span>
              {calibratable.map((key) => (
                <label key={key} className="row small">
                  <span className="muted">{labelOf(key)}</span>
                  <Points
                    label={`${labelOf(key)} the game shows`}
                    value={calibration[key] ? shownNow(counted, calibration, key) : ""}
                    placeholder={num(counted[key] ?? 0)}
                    onCommit={(shown) => onCalibration(calibrate(calibration, key, shown, counted[key] ?? 0))}
                  />
                </label>
              ))}
            </>
          )}
        </div>
      )}
      <div className="row wrap">
        {addable.length > 0 && (
          <select className="select-sm" value="" aria-label="Add a goal" onChange={(e) => e.target.value && add(e.target.value as GoalKey)}>
            <option value="">+ Add a goal…</option>
            {addable.map((k) => (
              <option key={k} value={k}>
                {labelOf(k)}
              </option>
            ))}
          </select>
        )}
        {QUICK.filter((k) => !goals[k]).map((k) => (
          <button key={k} className="btn ghost sm" onClick={() => add(k)}>
            + {labelOf(k)}
          </button>
        ))}
      </div>
      {keys.length === 0 && (
        <p className="muted small">
          Pick what matters and the plan chases it — on top of your value weights, if you set any. A priority pulls a stat up; <i>at least</i> holds it
          above a floor, however it costs the rest.
        </p>
      )}
    </div>
  );
}

function GoalLine({ stat, goal, row, onChange }: { stat: GoalKey; goal: StatGoal; row?: GoalRow; onChange: (change: Partial<StatGoal> | null) => void }) {
  const max = row?.max ?? 0;
  const floorPct = !goal.floor ? 0 : "pct" in goal.floor ? goal.floor.pct : max > 0 ? Math.min(100, Math.round((goal.floor.min / max) * 100)) : 0;
  const floorPoints = !goal.floor ? "" : "min" in goal.floor ? goal.floor.min : Math.round((goal.floor.pct / 100) * max);

  return (
    <div className="bis-goal">
      <b className="bis-goal-name">{labelOf(stat)}</b>
      {/* Past an "enough" floor the stat counts for nothing, so there is no priority left to set. */}
      {!goal.enough && <Slide label="Priority" value={goal.priority ?? 0} onCommit={(priority) => onChange({ priority })} />}
      {!priorityOnly(stat) && (
        <>
          <Slide label="At least" value={floorPct} onCommit={(pct) => onChange({ floor: pct ? { pct } : undefined })} suffix="% of max" />
          <Points label={`${labelOf(stat)} floor in points`} value={floorPoints} onCommit={(min) => onChange({ floor: min > 0 ? { min } : undefined })} />
          {goal.floor && (
            <CheckField
              label="Stop at floor"
              className="small"
              checked={!!goal.enough}
              onChange={(enough) => onChange({ enough: enough || undefined })}
              title="Once the floor is met, this stat stops counting — neither its priority nor its weight on your sheet — so the plan maximises everything else instead of more of it"
            />
          )}
        </>
      )}
      <button className="btn ghost sm" title="Drop this goal" onClick={() => onChange(null)}>
        ×
      </button>
      {row && <GoalResult stat={stat} row={row} />}
    </div>
  );
}

/**
 * How the goal came out: what the plan reaches against what it could at best, and whether the floor held —
 * in the game's own numbers, the hover saying how much of them is gear.
 */
function GoalResult({ stat, row }: { stat: GoalKey; row: GoalRow }) {
  if (priorityOnly(stat)) return null;
  if (row.max <= 0) return <span className="small warn">nothing in the pool gives {labelOf(stat)}</span>;
  const tone = row.floor === undefined ? "muted" : row.met ? "good" : "warn";
  const own = row.base ? `${num((row.got ?? 0) - row.base)} from gear + ${num(row.base)} you have without it (race and classes, and what you've typed from the game)` : undefined;
  return (
    <span className={`small ${tone}`} title={own}>
      {num(row.got ?? 0)} <span className="muted">of {num(row.max)} possible</span>
      {row.floor !== undefined && (row.met ? " ✓" : ` — short of ${num(row.floor)}; the other goals leave no room`)}
      {row.unreachable && " (more than any loadout gives)"}
    </span>
  );
}

/**
 * The floor as a number, committed on Enter or leaving the box. Committing each keystroke planned
 * for every prefix of "2000" — and clearing the box to retype dropped the floor, which removed a
 * floor-only goal from under the cursor.
 */
function Points({ label, value, placeholder = "points", onCommit }: { label: string; value: number | ""; placeholder?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => draft !== String(value) && onCommit(Number(draft) || 0);
  return (
    <input
      className="field sm bis-goal-box"
      type="number"
      min={0}
      placeholder={placeholder}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/**
 * A 0–100 slider that plans on release, not on every pixel of the drag — each move is a whole search
 * for the best loadout, and the number follows the thumb meanwhile.
 */
function Slide({ label, value, onCommit, suffix = "%" }: { label: string; value: number; onCommit: (value: number) => void; suffix?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <label className="bis-slide">
      <span className="muted small">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="small bis-slide-value">
        {draft}
        {suffix}
      </span>
    </label>
  );
}
