"use client";
import type { ReactNode } from "react";
import { useAchievements, useBuffs, useCombatStats, useGoals, useSettings, useSpawns } from "@/lib/hooks";
import { useNav } from "@/lib/chrome/nav";
import { countdownMs, formatCountdown } from "@/shared/mob/spawn-timers";
import { targetLabel } from "@/shared/buffs/buff-tracking";
import { rankedSpellTitle } from "@/shared/combat/combat-parser";
import { count, duration, percent } from "@/shared/format";
import { over } from "@/shared/numbers";
import { ratePerHour } from "@/app/components/combat/SessionPanel";
import { StatTile } from "@/app/components/ui";
import ItemLink from "@/app/components/items/ItemLink";
import type { RunningGoal } from "@/shared/types";

/** How many rows a card shows before it says "and N more" — a glance, not the full board. */
const ROWS = 4;

/**
 * The Now area's first section: every board of what is running or running out, one card each, so
 * mid-fight you read one screen instead of visiting five
 * ([ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 *
 * A card only summarises: its heading opens the full section, which is where anything is changed.
 * Every figure comes from the same hook the section itself reads, so the two can't disagree.
 */
export default function NowOverview() {
  return (
    <div className="now-grid">
      <BuffsCard />
      <TimersCard />
      <GoalsCard />
      <SessionCard />
      <AchievementsCard />
      <AlertsCard />
    </div>
  );
}

function Card({ section, title, children }: { section: string; title: ReactNode; children: ReactNode }) {
  const nav = useNav();
  return (
    <section className="now-card">
      <button className="now-card-head" onClick={() => nav.openTab(section)} title="Open the full view">
        {title}
        <span className="spacer" />›
      </button>
      {children}
    </section>
  );
}

/** "and 3 more", or nothing when everything fitted. */
function More({ shown, total }: { shown: number; total: number }) {
  return total > shown ? <div className="muted small">and {total - shown} more</div> : null;
}

function BuffsCard() {
  const view = useBuffs();
  const down = view.lapsed;
  return (
    <Card section="buffs" title={down.length ? <b className="now-warn">{count(down.length, "buff")} down</b> : "Buffs"}>
      {down.slice(0, ROWS).map((b) => (
        <div key={`${b.key}|${b.target}`} className="now-row">
          <ItemLink title={rankedSpellTitle(b.spell, b.rank)} label={rankedSpellTitle(b.spell, b.rank)} />
          <span className="muted small">{targetLabel(b.target)}</span>
        </div>
      ))}
      <More shown={Math.min(ROWS, down.length)} total={down.length} />
      {!down.length && <div className="muted small">{view.active.length ? `All ${view.active.length} up` : "Nothing tracked yet"}</div>}
    </Card>
  );
}

function TimersCard() {
  const { view, now } = useSpawns();
  const next = [...view.running].sort((a, b) => countdownMs(a, now) - countdownMs(b, now));
  return (
    <Card section="timers" title="Timers">
      {next.slice(0, ROWS).map((t) => (
        <div key={t.id} className="now-row">
          <span className="now-clock">{t.state === "alive" ? "alive" : t.state === "up" ? "up" : formatCountdown(countdownMs(t, now))}</span>
          <span>{t.mob}</span>
        </div>
      ))}
      <More shown={Math.min(ROWS, next.length)} total={next.length} />
      {!next.length && <div className="muted small">No timers running</div>}
    </Card>
  );
}

function GoalsCard() {
  const { view, now } = useGoals();
  const running = view.goals.filter((g) => g.state === "running");
  return (
    <Card section="goals" title="Goals">
      {running.slice(0, ROWS).map((g) => (
        <div key={g.id} className="now-row">
          <span>{goalName(g)}</span>
          {g.mode !== "streak" && <span className="muted small">{`${g.obtained}/${g.qty}`}</span>}
          <span className="spacer" />
          <span className="now-clock">{formatCountdown(Math.max(0, Date.parse(g.dueAt) - now))}</span>
        </div>
      ))}
      <More shown={Math.min(ROWS, running.length)} total={running.length} />
      {!running.length && <div className="muted small">No goals running</div>}
    </Card>
  );
}

const goalName = (g: RunningGoal): string => (g.target.kind === "any" ? "Any kill" : g.target.name);

function SessionCard() {
  const { session } = useCombatStats();
  const xpPerHour = ratePerHour(session);
  const downtimeSec = Math.max(0, session.spanSec - session.durationSec);
  return (
    <Card section="session" title="Session">
      <div className="stat-row">
        <StatTile label="XP / hour" value={xpPerHour ? `${xpPerHour}%` : "—"} />
        <StatTile label="Kills" value={session.kills} />
        <StatTile label="Downtime" value={percent(over(downtimeSec, session.spanSec))} hint={`${duration(downtimeSec)} not fighting`} />
      </div>
    </Card>
  );
}

function AchievementsCard() {
  const { achievements } = useAchievements();
  const open = achievements.filter((a) => a.done.length < a.total).sort((a, b) => b.done.length / b.total - a.done.length / a.total);
  return (
    <Card section="achievements" title="Achievements">
      {open.slice(0, ROWS).map((a) => (
        <div key={a.definition.id} className="now-row">
          <span>{a.definition.title}</span>
          <span className="spacer" />
          <span className="muted small">{`${a.done.length}/${a.total}`}</span>
        </div>
      ))}
      <More shown={Math.min(ROWS, open.length)} total={open.length} />
      {!open.length && <div className="muted small">None in progress</div>}
    </Card>
  );
}

function AlertsCard() {
  const alerts = useSettings()?.castAlerts;
  const live = alerts?.watches.filter((w) => w.enabled).length ?? 0;
  return (
    <Card section="alerts" title="Alerts">
      <div className="muted small">
        {!alerts ? "…" : !alerts.enabled ? <b className="now-warn">Alerts are off</b> : `${count(live, "rule")} watching`}
      </div>
    </Card>
  );
}
