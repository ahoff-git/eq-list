"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useGoalFocus, useGoals, useLogVocabulary } from "@/lib/hooks";
import { formatCountdown } from "@/shared/spawn-timers";
import { formatDuration } from "@/shared/duration";
import { parseGoalDuration, parseStreakInterval } from "@/shared/goal-progress";
import { count } from "@/shared/format";
import { CheckField, Empty, segCls } from "./ui";
import ItemNameField from "./ItemNameField";
import SuggestField from "./SuggestField";
import type { GoalTargetKind, GoalTemplate, RunningGoal } from "@/shared/types";

/**
 * The three ways to start a farming goal (ADR 0199 adds the last two to ADR 0198's original):
 *  - **Total**: reach a quantity within one timebox — the original shape.
 *  - **Average**: the exact same shape, entered as a pace ("3 a minute for 10 minutes") instead of a
 *    quantity and a duration — this mode is pure UI sugar, computing `qty`/`durationSec` from the
 *    rate and window and calling the same `goals.start`, so it needs nothing new from the tracker.
 *  - **Streak**: no quantity at all — a window that re-arms on every hit until one is missed.
 */
type ChallengeMode = "total" | "average" | "streak";

/**
 * The Goals tab (ADR 0198, streaks added by ADR 0199): start a timeboxed farming target or a streak
 * challenge, watch it run, and reuse or forget the wants you've saved. The running/finished lists and
 * the floater (`GoalsOverlay`) both read the same `useGoals()` board, so what this tab shows is
 * exactly what's pinned over the game.
 */
export default function GoalsPanel() {
  const { view, now } = useGoals();
  const focus = useGoalFocus();
  const vocabulary = useLogVocabulary();

  const [kind, setKind] = useState<GoalTargetKind>("item");
  const [challenge, setChallenge] = useState<ChallengeMode>("total");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("20");
  const [duration, setDuration] = useState("1h");
  const [rate, setRate] = useState("3");
  const [avgWindow, setAvgWindow] = useState("10m");
  const [intervalText, setIntervalText] = useState("10s");
  const [autoRestart, setAutoRestart] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const running = view.goals.filter((g) => g.state === "running");
  const finished = view.goals.filter((g) => g.state !== "running");

  const qtyNum = Number(qty);
  const durationSec = parseGoalDuration(duration);
  const rateNum = Number(rate);
  const avgWindowSec = parseGoalDuration(avgWindow);
  // "Average" reduces to "Total" the moment it's typed: X a minute for Y minutes is exactly
  // round(X*Y) within Y minutes, the same math the tracker already runs.
  const avgQty = rateNum > 0 && avgWindowSec ? Math.round(rateNum * (avgWindowSec / 60)) : 0;
  const intervalSec = parseStreakInterval(intervalText);

  const effectiveQty = challenge === "average" ? avgQty : qtyNum;
  const effectiveDurationSec = challenge === "average" ? avgWindowSec : durationSec;
  // "Any kill" has nothing to type — every kill is the target — so it's the one kind that doesn't
  // need the name field filled in.
  const canStart =
    (kind === "any" || name.trim().length > 0) &&
    (challenge === "streak"
      ? !!intervalSec
      : Number.isFinite(effectiveQty) && effectiveQty > 0 && !!effectiveDurationSec);

  async function start() {
    if (!canStart) return;
    const target = { kind, name: name.trim() };
    if (challenge === "streak") {
      await api()?.goals.startStreak(target, intervalSec!, autoRestart);
      if (saveAsTemplate) await api()?.goals.saveStreakTemplate(target, intervalSec!, autoRestart);
    } else {
      await api()?.goals.start(target, effectiveQty, effectiveDurationSec!);
      if (saveAsTemplate) await api()?.goals.saveTemplate(target, effectiveQty, effectiveDurationSec!);
    }
    setName("");
    // A one-time choice about *this* goal, not a standing preference — left checked, it would
    // silently save a duplicate template for every goal started afterward.
    setSaveAsTemplate(false);
  }

  return (
    <div className="goals">
      <div className="goals-add">
        <div className="segmented" role="tablist">
          <button className={segCls(kind === "item")} onClick={() => setKind("item")}>
            Item
          </button>
          <button className={segCls(kind === "mob")} onClick={() => setKind("mob")}>
            Mob kills
          </button>
          <button
            className={segCls(kind === "any")}
            onClick={() => setKind("any")}
            title="Every kill counts — no name to type"
          >
            Any kill
          </button>
        </div>
        <div
          className="segmented"
          role="tablist"
          title="Total: reach a quantity within a timebox. Average: the same thing, entered as a pace. Streak: keep hitting the target before its own window closes, for as long as you can."
        >
          <button className={segCls(challenge === "total")} onClick={() => setChallenge("total")}>
            Total
          </button>
          <button className={segCls(challenge === "average")} onClick={() => setChallenge("average")}>
            Average
          </button>
          <button className={segCls(challenge === "streak")} onClick={() => setChallenge("streak")}>
            Streak
          </button>
        </div>
        {/* A mob's name completes against your own log, the same field the Timers tab's own add form
            uses (`SuggestField` over `useLogVocabulary`) — but an item never appears in that
            vocabulary (it holds spells, casters, targets and zones, not loot), so it draws on the
            same wiki/log/Lucy search the Search tab uses instead (`ItemNameField`). Matched as
            **plain text** — the same substring rule an alert's own trigger uses (`goalWantsMob`) —
            so "gnoll" alone reaches every gnoll variant a camp turns up, rather than needing the
            exact name a spawn timer keys on. "Any kill" needs no name at all: every kill counts. */}
        {kind === "any" ? (
          <span className="field goal-any-kill" title="Every kill counts toward this goal">
            Any kill
          </span>
        ) : kind === "mob" ? (
          <SuggestField
            className="field"
            value={name}
            onChange={setName}
            vocabulary={vocabulary}
            kind="target"
            placeholder={'Mob name — plain text, e.g. "gnoll"'}
            title="Matched as plain text: a substring of the mob's name, the same rule an alert trigger uses"
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        ) : (
          <ItemNameField
            className="field"
            value={name}
            onChange={setName}
            placeholder="Item name"
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        )}
        {challenge === "total" && (
          <>
            <input
              className="field qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              title="How many to reach"
            />
            <input
              className="field dur"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="1h, 30m"
              title="How long — e.g. 1h, 30m, 1h 30m"
            />
          </>
        )}
        {challenge === "average" && (
          <>
            <input
              className="field qty"
              type="number"
              min={1}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Rate"
              title={`Per minute — e.g. 3 for "3 ${kind === "item" ? "loots" : "kills"} a minute"`}
            />
            <span className="muted small">per min over</span>
            <input
              className="field dur"
              value={avgWindow}
              onChange={(e) => setAvgWindow(e.target.value)}
              placeholder="10m"
              title="How long to average over — e.g. 10m, 1h"
            />
          </>
        )}
        {challenge === "streak" && (
          <>
            <input
              className="field dur"
              value={intervalText}
              onChange={(e) => setIntervalText(e.target.value)}
              placeholder="10s, 2m"
              title="How long you have after each hit before the streak breaks"
            />
            <CheckField
              label="Auto-restart"
              checked={autoRestart}
              onChange={setAutoRestart}
              title="When the streak breaks, reset to 0 and keep running instead of finishing"
            />
          </>
        )}
        <CheckField label="Save for reuse" checked={saveAsTemplate} onChange={setSaveAsTemplate} />
        <button className="btn sm primary" disabled={!canStart} onClick={start}>
          ＋ Start goal
        </button>
      </div>

      {view.templates.length > 0 && (
        <div className="goals-templates">
          <h2>Saved goals</h2>
          {view.templates.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </div>
      )}

      <div className="goal-focus-controls">
        <CheckField
          label="Focus the List and Hunt tabs on my goals"
          checked={focus.active}
          onChange={focus.setActive}
          title="Emphasize the items and mobs your running goals want, on the List and Hunt tabs"
        />
        {focus.active && (
          <CheckField
            label="Also hide everything else there"
            checked={focus.hiding}
            onChange={focus.setHiding}
            title="Hide rows that aren't part of a running goal, instead of just dimming them"
          />
        )}
      </div>

      <h2>Running</h2>
      {running.length === 0 ? (
        <Empty title="No goals running." hint="Start one above — an item to farm or a mob to kill, as a total, a pace, or a streak." />
      ) : (
        running.map((g) => <GoalRow key={g.id} goal={g} now={now} />)
      )}

      {finished.length > 0 && (
        <>
          <div className="goals-finished-head">
            <h2>Finished</h2>
            <button className="btn sm" onClick={() => api()?.goals.clearFinished()}>
              Clear finished
            </button>
          </div>
          {finished.map((g) => (
            <GoalRow key={g.id} goal={g} now={now} />
          ))}
        </>
      )}
    </div>
  );
}

/** "mob" and "any" are both kill-counted — the same rule `goalWantsMob` and `runningGoalTargets`
 *  already apply, said once here so a row's wording doesn't drift from what actually counts it. */
const isKillTarget = (kind: GoalTargetKind) => kind === "mob" || kind === "any";

function TemplateRow({ template }: { template: GoalTemplate }) {
  const isStreak = template.mode === "streak";
  const detail = isStreak
    ? `every ${formatDuration(template.durationSec)}${template.autoRestart ? " · auto-restart" : ""}`
    : `${count(template.qty, isKillTarget(template.target.kind) ? "kill" : "needed")} · ${formatDuration(template.durationSec)}`;
  return (
    <div className="goal-template-row">
      <span className="gtr-name">{template.label || template.target.name}</span>
      <span className="gtr-detail">{detail}</span>
      <button
        className="btn sm"
        onClick={() =>
          isStreak
            ? api()?.goals.startStreak(template.target, template.durationSec, template.autoRestart ?? false)
            : api()?.goals.start(template.target, template.qty, template.durationSec)
        }
      >
        Start
      </button>
      <button className="btn sm ghost" title="Forget this saved goal" onClick={() => api()?.goals.deleteTemplate(template.id)}>
        ✕
      </button>
    </div>
  );
}

function GoalRow({ goal, now }: { goal: RunningGoal; now: number }) {
  const isStreak = goal.mode === "streak";
  const remainingMs = Math.max(0, Date.parse(goal.dueAt) - now);
  // A streak has no quantity to fill toward — the bar instead drains as its window closes, so a run
  // about to break reads the same way a target goal running short of time would.
  const pct = isStreak
    ? goal.state === "running"
      ? remainingMs / (goal.durationSec * 1000)
      : 0
    : goal.qty > 0
      ? Math.min(1, goal.obtained / goal.qty)
      : 0;
  const kindLabel = isStreak
    ? isKillTarget(goal.target.kind)
      ? "streak, kills"
      : "streak, loot"
    : isKillTarget(goal.target.kind)
      ? "kills"
      : null;
  const status = isStreak
    ? goal.state === "running"
      ? `🔥 ${formatCountdown(remainingMs)}`
      : "💔 broken"
    : goal.state === "running"
      ? formatCountdown(remainingMs)
      : goal.state === "completed"
        ? "✔ done"
        : "⌛ expired";
  const progress = isStreak
    ? `streak ${goal.obtained}` + (goal.bestStreak && goal.bestStreak > goal.obtained ? ` · best ${goal.bestStreak}` : "")
    : `${goal.obtained} / ${goal.qty}`;

  return (
    <div className={`goal-row ${goal.state}`}>
      <div className="gr-top">
        <span className="gr-name">
          {goal.target.name}
          {kindLabel && <em className="gr-kind"> ({kindLabel})</em>}
        </span>
        <span className="gr-status">{status}</span>
      </div>
      <div className="gr-bar">
        <div className="gr-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="gr-bottom">
        <span className="gr-progress">{progress}</span>
        {goal.state === "running" && (
          <button className="btn sm ghost" title="Abandon this goal" onClick={() => api()?.goals.abandon(goal.id)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
