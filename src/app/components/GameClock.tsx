"use client";
import { api } from "@/lib/api";
import { useGameClock } from "@/lib/hooks";
import GameClockFace from "./GameClockFace";

/**
 * The running Norrath clock, for the status bar: what time it is, whether it's day or night, and
 * how far through that half the game currently sits — a glance, not a panel, which is why it lives
 * here rather than as its own tab. Alarms against this clock are set from the Alerts tab
 * (`AlertsPanel`'s "Game-time alarms"); this reads it and, clicked, pins a copy of it over the game
 * (`GameClockOverlay`, in the click-through alert overlay) — the same clock either place, since both
 * render `GameClockFace`.
 *
 * Blank (with a hint) until a `/time` line has been read this run — there is nothing to extrapolate
 * from before that, and guessing would be a clock that's simply wrong rather than merely absent.
 */
export default function GameClock() {
  const { view, minutes } = useGameClock();
  if (minutes === null) {
    return (
      <span className="muted small" title="Type /time in-game to start the clock">
        🕒 no /time read yet
      </span>
    );
  }
  return (
    <button
      type="button"
      className="gameclock-toggle"
      title={view.pinned ? "Hide the floating clock over the game" : "Pin the clock over the game — click-through, drag to place"}
      onClick={() => void api()?.gameClock.setPinned(!view.pinned)}
    >
      <GameClockFace minutes={minutes} />
    </button>
  );
}
