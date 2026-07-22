"use client";
import { useSessionStats } from "@/lib/hooks";
import { api } from "@/lib/api";

/**
 * Live session tracking from the log: experience gains and kills, with XP
 * attributed to the mob you most recently killed. EQ logs no XP amount, so
 * counts (and the shown %, when present) are what we have.
 */
export default function SessionPanel() {
  const stats = useSessionStats();

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted small">Since {startedLabel(stats.startedAt)}</span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => api()?.stats.reset()}>
          Reset session
        </button>
      </div>

      <div className="stat-row">
        <StatTile label="XP gains" value={stats.totalXp} />
        <StatTile label="Solo / Party" value={`${stats.soloXp} / ${stats.partyXp}`} />
        {stats.totalPct > 0 && <StatTile label="Total %" value={`${stats.totalPct}%`} />}
        <StatTile label="Kills" value={stats.kills} />
      </div>

      {stats.byMob.length === 0 ? (
        <div className="empty">
          <p>No kills or XP yet this session.</p>
          <p className="small">Go kill something — this fills in from the log.</p>
        </div>
      ) : (
        <table className="stat-table">
          <thead>
            <tr>
              <th>Mob</th>
              <th>Kills</th>
              <th>XP</th>
            </tr>
          </thead>
          <tbody>
            {stats.byMob.map((m) => (
              <tr key={m.mob}>
                <td>{m.mob}</td>
                <td>{m.kills}</td>
                <td>{m.xp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function startedLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
}
