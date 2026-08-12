"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Rect } from "@/shared/types";

type Phase = "select" | "loading";

/**
 * Below this (in px, either side) a drag was a click, not a selection.
 *
 * The selector covers the whole screen, so *some* mouse-up always lands on it — including the click of
 * someone who has changed their mind. A few pixels of accidental travel shouldn't send a sliver of
 * screen off to OCR; it should close, which is what the same click would have done on nothing.
 */
const MIN_SELECTION_PX = 6;

/**
 * Fullscreen, transparent region selector for the screengrab lookup — one per
 * display, so you can grab from any monitor. The screen was already captured when
 * the hotkey fired (before this window appeared); dragging a box just tells main
 * which region to crop + OCR. The text then fills the control window's Search box.
 */
export default function Select() {
  const [phase, setPhase] = useState<Phase>("select");
  const [rect, setRect] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const close = () => api()?.lookup.cancel();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  }
  function onMouseMove(e: React.MouseEvent) {
    const s = dragStart.current;
    if (!s) return;
    setRect({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    });
  }
  function onMouseUp() {
    const r = rect;
    dragStart.current = null;
    if (!r || r.width < MIN_SELECTION_PX || r.height < MIN_SELECTION_PX) {
      close();
      return;
    }
    setPhase("loading");
    // Pass the viewport so main can map the selection by ratio (unit-agnostic).
    void api()?.lookup.capture(r, { width: window.innerWidth, height: window.innerHeight });
  }

  if (phase === "loading") {
    return (
      <div className="select-root dimmed">
        <div className="lookup-card">
          <p className="muted">
            Reading text… <span className="small">(the first lookup downloads the OCR model — may take a moment)</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="select-root" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <div className="select-hint">Drag over an item name · Esc to cancel</div>
      {rect && (
        <div className="select-rect" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
      )}
    </div>
  );
}
