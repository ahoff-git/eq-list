"use client";
import { useGoals, useSettings } from "@/lib/hooks";
import { alertPlacement, alertStyle, GOAL_STYLE_ID } from "@/shared/alert-styles";
import { formatCountdown } from "@/shared/spawn-timers";
import type { AlertPositionValue, RunningGoal } from "@/shared/types";

/**
 * The goals a player is actively farming, drawn over the game (ADR 0198).
 *
 * Unlike a spawn timer's countdown (`SpawnOverlay`), this is **on by default** rather than opt-in:
 * starting a goal is itself the deliberate act — there is no second toggle to find first, because
 * the whole reason to start one is to watch it while you play. Only **running** goals show; a
 * finished one drops off here the instant its banner fires; the Goals tab still lists it until
 * cleared.
 *
 * Otherwise the same shape as `SpawnOverlay`, deliberately: each goal sits where its own alert would
 * (`alertStyle`/`alertPlacement`, resolved here rather than sent resolved, since this is a live
 * readout and a restyle should move it at once), and it rides the same `/alert` window rather than
 * opening a fourth.
 */
export default function GoalsOverlay() {
  const { view, now } = useGoals();
  const ca = useSettings()?.castAlerts;
  const running = view.goals.filter((g) => g.state === "running");
  if (!running.length || !ca) return null;

  const looks = running.map((goal) => ({ goal, style: alertStyle(ca, { styleId: goal.styleId ?? GOAL_STYLE_ID }) }));
  const stacks = new Map<AlertPositionValue, typeof looks>();
  for (const look of looks) stacks.set(look.style.position, [...(stacks.get(look.style.position) ?? []), look]);
  const locations = ca.locations ?? [];

  return (
    <>
      {[...stacks].map(([position, stack]) => {
        const place = alertPlacement(position, locations);
        return (
          <div className={`overlay-at goal-hud no-drag ${place.className}`} style={place.style} key={position}>
            {stack.map(({ goal, style }) => (
              <HudRow key={goal.id} goal={goal} now={now} color={style.color} />
            ))}
          </div>
        );
      })}
    </>
  );
}

function HudRow({ goal, now, color }: { goal: RunningGoal; now: number; color: string }) {
  const remainingMs = Math.max(0, Date.parse(goal.dueAt) - now);
  const pct = goal.qty > 0 ? Math.min(1, goal.obtained / goal.qty) : 0;
  return (
    <div className="goal-hud-row" style={{ borderLeftColor: color }}>
      <div className="ghr-top">
        <span className="ghr-name">{goal.target.name}</span>
        <span className="ghr-clock">{formatCountdown(remainingMs)}</span>
      </div>
      <div className="ghr-bar">
        <div className="ghr-fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <span className="ghr-progress">
        {goal.obtained} / {goal.qty}
      </span>
    </div>
  );
}
