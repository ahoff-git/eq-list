"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SessionSummary, StoredFight } from "@/shared/types";

/**
 * Browse past play: sessions (newest first) drill into their fights, and picking a
 * fight hands it back to the panel to render with the same meter/spell views as a live
 * one. Fights are filed by the main process as they end, so this survives restarts.
 */
export default function DamageHistory({
  picked,
  onPick,
}: {
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fights, setFights] = useState<StoredFight[]>([]);

  useEffect(() => {
    void api()?.combat.sessions().then(setSessions);
  }, []);

  // Load a session's fights when it's expanded (the list is per-session, not eager).
  useEffect(() => {
    if (!openId) return void setFights([]);
    void api()?.combat.fights(openId).then(setFights);
  }, [openId]);

  async function clearAll() {
    const remaining = await api()?.combat.clearHistory();
    setSessions(remaining ?? []);
    setOpenId(null);
    onPick(null);
  }

  if (sessions === null) return <div className="muted small">Loading history…</div>;

  if (sessions.length === 0) {
    return (
      <div className="empty">
        <p>No past fights recorded yet.</p>
        <p className="small">Each fight is filed when it ends, so history builds up as you play.</p>
      </div>
    );
  }

  return (
    <div className="history">
      <div className="row">
        <span className="muted small">
          {sessions.length} session{sessions.length === 1 ? "" : "s"} recorded
        </span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={clearAll}>
          Clear history
        </button>
      </div>

      {sessions.map((s) => {
        const open = openId === s.sessionId;
        return (
          <div className={`hist-session ${open ? "open" : ""}`} key={s.sessionId}>
            <div className="hist-head" onClick={() => setOpenId(open ? null : s.sessionId)}>
              <span className="caret">{open ? "▾" : "▸"}</span>
              <span className="hist-when">{dayTime(s.startedAt)}</span>
              <span className="muted small">
                {s.fights} fight{s.fights === 1 ? "" : "s"} · {mins(s.combatSec)} fighting
              </span>
              <span className="spacer" />
              <span className="hist-dmg">{s.yourDealt.toLocaleString()} dealt</span>
            </div>
            {open && (
              <div className="hist-fights">
                {fights.map((f) => (
                  <button
                    className={`hist-fight ${picked?.id === f.id ? "on" : ""}`}
                    key={f.id}
                    onClick={() => onPick(picked?.id === f.id ? null : f)}
                  >
                    <span className="hf-when">{clock(f.stats.startedAt)}</span>
                    <span className="hf-label">{f.label}</span>
                    <span className="muted small">{f.stats.durationSec}s</span>
                    <span className="hf-dmg">{f.stats.yourDealt.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function dayTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function clock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function mins(sec: number): string {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}
