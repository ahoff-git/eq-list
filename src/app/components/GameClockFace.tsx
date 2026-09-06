"use client";
import { formatGameClock, isDaytime, minuteDelta, GAME_DAY_MINUTES } from "@/shared/game-clock";

/**
 * The clock's face — icon, reading, day/night progress and label. Shared by the status-bar widget
 * (`GameClock.tsx`) and the pinned overlay (`GameClockOverlay.tsx`), so the two always agree on what
 * "the clock" looks like: click one to toggle the other into existence, and it should read as the
 * same clock, not a second design.
 */
export default function GameClockFace({ minutes }: { minutes: number }) {
  const daytime = isDaytime(minutes);
  // How far through the current half (sunrise→sunset, or sunset→sunrise) the clock sits, for the
  // little progress track below the reading — both halves are 12 game-hours in the classic split.
  const halfStart = daytime ? 6 * 60 : 18 * 60;
  const sinceHalfStart = minuteDelta(halfStart, minutes);
  const progress = sinceHalfStart / (GAME_DAY_MINUTES / 2);

  return (
    // No `title` here: both call sites wrap this in their own interactive element with a more
    // useful tooltip ("Pin the clock...", "Drag to move"), and a nested `title` would shadow it for
    // any pointer over this face — which is most of the clickable area. Day/night is already legible
    // from the icon and the "Day"/"Night" label, so nothing is lost by not repeating it as a tooltip.
    <span className={`gameclock-face ${daytime ? "gc-day" : "gc-night"}`}>
      <span className="gc-icon">{daytime ? "☀️" : "🌙"}</span>
      <span className="gc-time">{formatGameClock(minutes)}</span>
      <span className="gc-track">
        <span className="gc-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <span className="muted small">{daytime ? "Day" : "Night"}</span>
    </span>
  );
}
