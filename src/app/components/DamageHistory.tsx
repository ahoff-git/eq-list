"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRead } from "@/lib/hooks";
import type { SessionSummary, StoredFight } from "@/shared/types";

import { clock, dayTime, duration } from "@/shared/format";
/** A stable empty, so a render before the answer lands doesn't look like a change. */
const NO_FIGHTS: StoredFight[] = [];

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
  const [openId, setOpenId] = useState<string | null>(null);
  /** Bumped when history changes underneath us (a log was eaten), to re-read both lists. */
  const [refresh, setRefresh] = useState(0);

  // `null` until the first answer lands, which is what tells "no history yet" from "not asked yet".
  const sessions = useRead<SessionSummary[] | null>((a) => a.combat.sessions(), null, [refresh]);

  // A session's fights, read when it's expanded (the list is per-session, not eager). Reading through
  // the hook is what makes expanding B while A is still in flight safe — A's answer is discarded
  // rather than landing under B's heading.
  const fights = useRead((a) => (openId ? a.combat.fights(openId) : Promise.resolve(NO_FIGHTS)), NO_FIGHTS, [
    openId,
    refresh,
  ]);

  // Eating a log files whole evenings at once, and it happens on another tab — without this the
  // new sittings only appear on a reopen.
  useEffect(() => api()?.app.onDataChanged(() => setRefresh((n) => n + 1)), []);

  async function clearAll() {
    await api()?.combat.clearHistory();
    setOpenId(null);
    onPick(null);
    // Re-read rather than trusting the returned list: main owns history, and one path to it is enough.
    setRefresh((n) => n + 1);
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

      {/* The list scrolls inside itself: it's an index, and a fortnight of play in an
          always-on-top float otherwise pushes the fight you picked off the bottom of the tab. */}
      <div className="hist-list">
        {sessions.map((s) => (
          <Session
            key={s.sessionId}
            summary={s}
            open={openId === s.sessionId}
            onToggle={() => setOpenId(openId === s.sessionId ? null : s.sessionId)}
            fights={openId === s.sessionId ? fights : []}
            picked={picked}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/** One sitting: when it was, what it came to, and — open — the fights in it. */
function Session({
  summary,
  open,
  onToggle,
  fights,
  picked,
  onPick,
}: {
  summary: SessionSummary;
  open: boolean;
  onToggle: () => void;
  fights: StoredFight[];
  picked: StoredFight | null;
  onPick: (fight: StoredFight | null) => void;
}) {
  return (
    <div className={`hist-session ${open ? "open" : ""}`}>
      <div className="hist-head" onClick={onToggle}>
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="hist-when">{dayTime(summary.startedAt)}</span>
        <span className="muted small">
          {summary.fights} fight{summary.fights === 1 ? "" : "s"} · {duration(summary.combatSec, { seconds: true })} fighting
        </span>
        <span className="spacer" />
        <span className="hist-dmg">{summary.yourDealt.toLocaleString()} dealt</span>
      </div>
      {open && (
        <div className="hist-fights">
          {fights.map((f) => (
            <button
              className={`hist-fight ${picked?.id === f.id ? "on" : ""}`}
              key={f.id}
              onClick={() => onPick(picked?.id === f.id ? null : f)}
            >
              <span className="hf-when">{clock(f.stats.startedAt, { seconds: true })}</span>
              <span className="hf-label">{f.label}</span>
              <span className="muted small">{f.stats.durationSec}s</span>
              <span className="hf-dmg">{f.stats.yourDealt.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}




