"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useGameClock } from "@/lib/hooks";
import { SOLID } from "@/lib/clickThrough";
import { clampUnit } from "@/shared/game-clock";
import GameClockFace from "./GameClockFace";

/**
 * The running clock, pinned over the game — toggled by clicking the status-bar clock
 * (`GameClock.tsx`), placed by dragging it. **Stationary** once placed: no pulse, no float, none of
 * an alert's motion, because this answers a standing question ("what time is it right now") rather
 * than raising one that needs noticing.
 *
 * Rides the existing alert overlay window rather than a window of its own — the same reasoning
 * `SpawnOverlay` gives: frameless, transparent, always-on-top and click-through over the game is
 * exactly what this wants too, and a second window would be a second lot of state to place and
 * remember.
 *
 * **Placeable without a trip to Settings.** Marked `SOLID` (`clickThrough.ts`), so it's a clickable
 * island in a window that is otherwise glass to the game beneath it — and a press that starts on a
 * solid island holds the window solid for the rest of the gesture, which is what makes a drag that
 * crosses back onto click-through territory still land cleanly. The position tracks the pointer's
 * *movement* locally while dragging (a delta off the grab point, not the pointer's raw coordinate —
 * see `origin`/`grabbedAt` below), so it moves with no round trip to main, and is written back once,
 * on release — not on every pixel, and not at all for a plain click that never moved.
 */
export default function GameClockOverlay() {
  const { view, minutes } = useGameClock();
  const [dragPos, setDragPos] = useState<{ fx: number; fy: number } | null>(null);
  // Where the clock stood, and where the pointer was, the instant the drag started — so a move is
  // applied as a **delta** from the grab point rather than a teleport to the cursor's own position.
  // Grabbing the clock anywhere off its exact center (its `left`/`top` anchor, per `translate(-50%,
  // -50%)`) would otherwise snap it to recenter under the cursor the moment it moves at all, the same
  // bug a raw-position assignment would give `ResizablePanel.tsx`'s drag if it didn't already track a
  // delta off its own start point.
  const origin = useRef({ fx: 0, fy: 0 });
  const grabbedAt = useRef({ x: 0, y: 0 });
  // The pointer that started this drag — captured on `pointerdown` (below), but capture only
  // redirects *that* pointer's events to the element; it doesn't stop a second pointer (another
  // touch contact, a stray pen-hover) from also dispatching `pointermove`/`pointerup` on `window`
  // while the drag is in progress. Without filtering by id here, such a second pointer's event
  // would move the clock using the wrong coordinates or end the drag early even though the pointer
  // that was actually captured never released.
  const activePointerId = useRef<number | null>(null);

  useEffect(() => {
    if (!dragPos) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      const dx = (e.clientX - grabbedAt.current.x) / window.innerWidth;
      const dy = (e.clientY - grabbedAt.current.y) / window.innerHeight;
      setDragPos({ fx: clampUnit(origin.current.fx + dx), fy: clampUnit(origin.current.fy + dy) });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      activePointerId.current = null;
      setDragPos((last) => {
        if (last && (last.fx !== origin.current.fx || last.fy !== origin.current.fy)) {
          void api()?.gameClock.setPinPosition(last.fx, last.fy);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Only the start/end of a drag should re-arm these listeners — re-running per pixel moved would
    // tear them down and rebuild them on every `pointermove` they themselves are handling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPos !== null]);

  if (!view.pinned || minutes === null) return null;
  const at = dragPos ?? view.pinAt;

  return (
    <div
      {...SOLID}
      className="gameclock-hud no-drag"
      style={{ left: `${at.fx * 100}%`, top: `${at.fy * 100}%` }}
      title="Drag to move"
      onPointerDown={(e) => {
        // Left button (or an equivalent single-point touch/pen contact) only — a right-click
        // reaching for a context menu shouldn't arm the drag and relocate the clock.
        if (e.button !== 0) return;
        // **Deliberately no `preventDefault()` here.** This window's click-through/solid state
        // (`useSolidIslands`, `clickThrough.ts`) is tracked entirely off the browser's *compatibility*
        // mouse events (`mousedown`/`mousemove`/`mouseup`), which is what holds the whole HUD solid
        // for the length of a press. Calling `preventDefault()` on a `pointerdown` suppresses exactly
        // those compatibility events for the rest of the gesture — the click-through tracker would
        // then never see the press start or end, and would stay frozen at whatever it last was rather
        // than staying solid through the drag and re-checking where the cursor lands on release. There
        // is nothing here for it to prevent anyway: `.gameclock-hud` already sets `user-select: none`.
        // Captured so the drag still ends cleanly even if the pointer leaves this window's
        // bounds mid-gesture (e.g. dragged toward another monitor) — without it, a mouseup
        // delivered to whatever the cursor is over instead of us would never reach `onUp`,
        // leaving the HUD stuck following a pointer it can no longer hear from.
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointerId.current = e.pointerId;
        origin.current = view.pinAt;
        grabbedAt.current = { x: e.clientX, y: e.clientY };
        setDragPos(view.pinAt);
      }}
    >
      <GameClockFace minutes={minutes} />
    </div>
  );
}
