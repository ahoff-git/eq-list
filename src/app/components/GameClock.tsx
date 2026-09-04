"use client";
import { useGameClock } from "@/lib/hooks";
import { formatGameClock, isDaytime } from "@/shared/game-clock";

/**
 * The running Norrath clock, for the status bar: what time it is, whether it's day or night, and
 * how far through that half the game currently sits — a glance, not a panel, which is why it lives
 * here rather than as its own tab. Alarms against this clock are set from the Alerts tab
 * (`AlertsPanel`'s "Game-time alarms"); this is only the readout.
 *
 * Blank (with a hint) until a `/time` line has been read this run — there is nothing to extrapolate
 * from before that, and guessing would be a clock that's simply wrong rather than merely absent.
 */
export default function GameClock() {
  const { minutes } = useGameClock();
  if (minutes === null) {
    return (
      <span className="muted small" title="Type /time in-game to start the clock">
        🕒 no /time read yet
      </span>
    );
  }
  const daytime = isDaytime(minutes);
  // How far through the current half (sunrise→sunset, or sunset→sunrise) the clock sits, for the
  // little progress track below the reading — both halves are 12 game-hours in the classic split.
  const halfStart = daytime ? 6 * 60 : 18 * 60;
  const sinceHalfStart = minutes >= halfStart ? minutes - halfStart : minutes + (1440 - halfStart);
  const progress = sinceHalfStart / (12 * 60);

  return (
    <span className={`gameclock ${daytime ? "gc-day" : "gc-night"}`} title={daytime ? "Daytime in Norrath" : "Night in Norrath"}>
      <span className="gc-icon">{daytime ? "☀️" : "🌙"}</span>
      <span className="gc-time">{formatGameClock(minutes)}</span>
      <span className="gc-track">
        <span className="gc-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <span className="muted small">{daytime ? "Day" : "Night"}</span>
    </span>
  );
}
