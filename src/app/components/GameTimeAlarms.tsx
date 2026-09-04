"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useGameClock } from "@/lib/hooks";
import { formatGameClock, parseGameClockTime } from "@/shared/game-clock";
import { CheckField } from "./ui";

/**
 * "Tell me at 8 PM" — alarms against the running Norrath clock (`GameClock.tsx`, in the status bar,
 * is the readout this is set against). A sibling to the cast-alert watches above rather than a field
 * on one: a time-of-day trigger matches nothing in the log, so it has no spell, no conditions, and no
 * delay — just a time, an optional message, and a switch. A pop goes through the same `raise` path as
 * every other alert, wearing the alert defaults, which is why there is no look picker here (the same
 * call ADR 0092 makes for a spawn timer's pop).
 */
export default function GameTimeAlarms() {
  const { view } = useGameClock();
  const [draftTime, setDraftTime] = useState("");
  const [error, setError] = useState(false);

  const addAlarm = () => {
    const minute = parseGameClockTime(draftTime);
    if (minute === null) {
      setError(true);
      return;
    }
    setError(false);
    setDraftTime("");
    void api()?.gameClock.add(minute);
  };

  return (
    <div className="gametime-alarms">
      <span className="hint" style={{ display: "block", margin: "12px 0 6px" }}>
        <b>Game-time alarms</b> — tell me at a time of day in Norrath (“8pm”, “6:30 am”, “20:00”), read
        off the clock in the status bar. Fires once each game day the clock reaches it — a game day
        runs 72 real minutes, so this is not a long wait.
      </span>
      {view.alarms.map((alarm) => (
        <AlarmRow key={alarm.id} minute={alarm.minute} message={alarm.message} enabled={alarm.enabled} id={alarm.id} />
      ))}
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        <input
          className="field sm"
          style={{ width: 110, borderColor: error ? "var(--bad)" : undefined }}
          placeholder="8pm"
          value={draftTime}
          onChange={(e) => {
            setDraftTime(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && addAlarm()}
        />
        <button className="btn sm" onClick={addAlarm}>
          ＋ Add alarm
        </button>
        {error && <span className="muted small">Couldn’t read that as a time — try “8pm” or “20:00”.</span>}
      </div>
    </div>
  );
}

function AlarmRow({ id, minute, message, enabled }: { id: string; minute: number; message?: string; enabled: boolean }) {
  return (
    <div className="row" style={{ gap: 6, marginBottom: 4 }}>
      <CheckField label="" checked={enabled} onChange={(on) => void api()?.gameClock.toggle(id, on)} title="On or off" />
      <span className="small" style={{ width: 66, fontVariantNumeric: "tabular-nums" }}>
        {formatGameClock(minute)}
      </span>
      <input
        className="field"
        style={{ flex: 1, minWidth: 0 }}
        placeholder="message (optional)"
        defaultValue={message ?? ""}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next !== (message ?? "")) void api()?.gameClock.update(id, minute, next || undefined);
        }}
      />
      <button className="btn ghost sm" title="Remove this alarm" onClick={() => void api()?.gameClock.remove(id)}>
        ✕
      </button>
    </div>
  );
}
