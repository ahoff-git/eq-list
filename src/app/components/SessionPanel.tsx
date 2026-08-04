"use client";
import { useCombatStats, useXpProgress } from "@/lib/hooks";
import { api, resetSession } from "@/lib/api";
import { describeCoins, formatCoins } from "@/shared/money";
import AskValue from "./AskValue";
import CampReport from "./CampReport";
import type { FightStats, XpProgress } from "@/shared/types";

/**
 * The session's "how's it going" screen: experience rate and where it's coming from,
 * how much of the session was actually spent fighting, and which mobs/zones pay best.
 *
 * Rates come from the combat tracker's session window, because that's what knows the
 * difference between elapsed time and time *in combat* — the gap between them being the
 * downtime that decides an evening's real experience rate.
 */
export default function SessionPanel() {
  const combat = useCombatStats();
  const xp = useXpProgress();
  const session = combat.session;

  const xpPerHour = ratePerHour(session);
  const downtimeSec = Math.max(0, session.spanSec - session.durationSec);
  // The two money ledgers are summed only here, for the evening's income — the point of the
  // split is per-mob and per-item comparison, and neither survives being averaged (ADR 0047).
  const coin = (session.copper ?? 0) + (session.soldCopper ?? 0);
  const coinPerHour = session.spanSec ? Math.round(coin / (session.spanSec / 3600)) : 0;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted small">Since {startedLabel(combat.startedAt)}</span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={resetSession} title="Clear the counters and the damage meter (recorded fights are kept)">
          Reset session
        </button>
      </div>

      <div className="stat-row">
        <StatTile label="XP / hour" value={xpPerHour ? `${xpPerHour}%` : "—"} hint="Percent of a level per hour, over elapsed session time" />
        <StatTile
          label="Time to level"
          value={<TimeToLevel xp={xp} xpPerHour={xpPerHour} />}
          hint="Needs how far into the level you are — the log never says"
        />
        <StatTile
          label="Downtime"
          value={session.spanSec ? `${Math.round((downtimeSec / session.spanSec) * 100)}%` : "—"}
          hint={`${fmtDuration(downtimeSec)} not fighting, of ${fmtDuration(session.spanSec)} elapsed`}
        />
        <StatTile label="Kills" value={session.kills} />
      </div>

      <div className="stat-row">
        <StatTile label="XP gains" value={session.xpGains} />
        <StatTile label="Solo / Party" value={`${session.soloXp} / ${session.partyXp}`} />
        <StatTile label="XP earned" value={session.xpPct ? `${session.xpPct}%` : "—"} hint="Percent of a level earned this session" />
        <StatTile
          label="Level"
          value={xp.level ?? "—"}
          hint="From the log's 'Welcome to level N!' line"
        />
      </div>

      <div className="stat-row">
        <StatTile
          label="Coin"
          value={coin ? formatCoins(coin) : "—"}
          hint={
            coin
              ? `${describeCoins(session.copper ?? 0)} off corpses · ${describeCoins(session.soldCopper ?? 0)} from auto-sold drops`
              : "Coin off corpses plus what auto-sold drops fetched"
          }
        />
        <StatTile
          label="Coin / hour"
          value={coinPerHour ? formatCoins(coinPerHour) : "—"}
          hint="Over elapsed session time, downtime included — what an evening here actually pays"
        />
        <StatTile
          label="From corpses"
          value={session.copper ? formatCoins(session.copper) : "—"}
          hint="Money the mobs themselves carried"
        />
        <StatTile
          label="From sales"
          value={session.soldCopper ? formatCoins(session.soldCopper) : "—"}
          hint="What auto-sold drops fetched — only the log's auto-sell lines state a price"
        />
      </div>

      {/* `fight.startedAt` changes when a new fight begins, which is exactly when the
          previous one has been filed into history — so it's a free refresh trigger. */}
      <CampReport byMob={session.byMob} refreshKey={combat.fight.startedAt} />
    </div>
  );
}

/**
 * Time to level, or an invitation to supply the missing piece. The log only ever states
 * experience *gains*, so the app needs the starting point once — after that it keeps
 * itself current (and resets on level-up), so this asks at most once per level.
 */
function TimeToLevel({ xp, xpPerHour }: { xp: XpProgress; xpPerHour: number }) {
  const set = (value: number) => api()?.xp.set(value);

  if (!xp.known) {
    return (
      <AskValue
        prompt="tell me"
        why="Time to level needs how far into this level you are — the log only reports gains, never a total. Give it once and I'll keep it current from your XP gains, then reset it when you level."
        suffix="%"
        onSubmit={set}
      />
    );
  }

  const remaining = Math.max(0, 100 - xp.intoLevel);
  const hours = xpPerHour > 0 ? remaining / xpPerHour : 0;

  return (
    <span className="ttl" title={`${xp.intoLevel.toFixed(1)}% into the level · ${remaining.toFixed(1)}% to go`}>
      {hours > 0 ? fmtHours(hours) : "—"}
      <AskValue
        prompt={`${xp.intoLevel.toFixed(0)}%`}
        why="How far into this level you are, kept current from your XP gains. Click to correct it."
        suffix="%"
        initial={Math.round(xp.intoLevel * 10) / 10}
        onSubmit={set}
      />
    </span>
  );
}

function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="stat-tile" title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Percent of a level per hour, over the session's elapsed (not combat) time. */
function ratePerHour(session: FightStats): number {
  if (!session.spanSec || !session.xpPct) return 0;
  return Math.round((session.xpPct / (session.spanSec / 3600)) * 100) / 100;
}

function fmtHours(hours: number): string {
  if (hours >= 100) return "ages";
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours * 60)}m`;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

function startedLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
}
