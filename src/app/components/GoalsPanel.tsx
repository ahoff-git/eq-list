"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useGoalFocus, useGoals, useLogVocabulary } from "@/lib/hooks";
import { formatCountdown } from "@/shared/spawn-timers";
import { formatDuration } from "@/shared/duration";
import { parseGoalDuration } from "@/shared/goal-progress";
import { count } from "@/shared/format";
import { CheckField, Empty, segCls } from "./ui";
import SuggestField from "./SuggestField";
import type { GoalTargetKind, GoalTemplate, RunningGoal } from "@/shared/types";

/**
 * The Goals tab (ADR 0198): start a timeboxed farming target, watch it run, and reuse or forget the
 * wants you've saved. The running/finished lists and the floater (`GoalsOverlay`) both read the same
 * `useGoals()` board, so what this tab shows is exactly what's pinned over the game.
 */
export default function GoalsPanel() {
  const { view, now } = useGoals();
  const focus = useGoalFocus();
  const vocabulary = useLogVocabulary();

  const [kind, setKind] = useState<GoalTargetKind>("item");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("20");
  const [duration, setDuration] = useState("1h");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const running = view.goals.filter((g) => g.state === "running");
  const finished = view.goals.filter((g) => g.state !== "running");
  const durationSec = parseGoalDuration(duration);
  const qtyNum = Number(qty);
  const canStart = name.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0 && !!durationSec;

  async function start() {
    if (!canStart) return;
    const target = { kind, name: name.trim() };
    await api()?.goals.start(target, qtyNum, durationSec!);
    if (saveAsTemplate) await api()?.goals.saveTemplate(target, qtyNum, durationSec!);
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
        </div>
        {/* A mob's name completes against your own log, the same field the Timers tab's own add form
            uses (`SuggestField` over `useLogVocabulary`) — but an item never appears in that
            vocabulary (it holds spells, casters, targets and zones, not loot), so it stays a plain
            field rather than offering suggestions that would never fire. */}
        {kind === "mob" ? (
          <SuggestField
            className="field"
            value={name}
            onChange={setName}
            vocabulary={vocabulary}
            kind="target"
            placeholder="Mob name"
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        ) : (
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
        )}
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
        <Empty title="No goals running." hint="Start one above — an item to farm, or a mob to kill, in a timebox." />
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

function TemplateRow({ template }: { template: GoalTemplate }) {
  return (
    <div className="goal-template-row">
      <span className="gtr-name">{template.label || template.target.name}</span>
      <span className="gtr-detail">
        {count(template.qty, template.target.kind === "mob" ? "kill" : "needed")} · {formatDuration(template.durationSec)}
      </span>
      <button
        className="btn sm"
        onClick={() => api()?.goals.start(template.target, template.qty, template.durationSec)}
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
  const pct = goal.qty > 0 ? Math.min(1, goal.obtained / goal.qty) : 0;
  const remainingMs = Math.max(0, Date.parse(goal.dueAt) - now);
  return (
    <div className={`goal-row ${goal.state}`}>
      <div className="gr-top">
        <span className="gr-name">
          {goal.target.name}
          {goal.target.kind === "mob" && <em className="gr-kind"> (kills)</em>}
        </span>
        <span className="gr-status">
          {goal.state === "running" && formatCountdown(remainingMs)}
          {goal.state === "completed" && "✔ done"}
          {goal.state === "expired" && "⌛ expired"}
        </span>
      </div>
      <div className="gr-bar">
        <div className="gr-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="gr-bottom">
        <span className="gr-progress">
          {goal.obtained} / {goal.qty}
        </span>
        {goal.state === "running" && (
          <button className="btn sm ghost" title="Abandon this goal" onClick={() => api()?.goals.abandon(goal.id)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
