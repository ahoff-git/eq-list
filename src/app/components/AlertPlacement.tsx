"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * The custom-spot placement layer, shown only in the alert overlay window while the user is
 * placing a spot (Settings → Alert style → Place a spot). Main makes the normally click-through
 * overlay interactive + focusable and sends `onPlaceBegin`; a preview banner tracks the cursor,
 * a click reports the point back as fractions of the display, and Esc cancels. Renders nothing
 * otherwise, so the overlay stays invisible.
 */
export default function AlertPlacement() {
  const [placing, setPlacing] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.alerts.onPlaceBegin(() => {
      setCursor(null);
      setPlacing(true);
    });
  }, []);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      api()?.alerts.placed(null);
      setPlacing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  if (!placing) return null;

  const place = (e: React.MouseEvent) => {
    // Fractions of the display, so the spot survives a resolution change (see AlertLocation).
    api()?.alerts.placed({ fx: e.clientX / window.innerWidth, fy: e.clientY / window.innerHeight });
    setPlacing(false);
  };

  return (
    <div className="alert-place" onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })} onClick={place}>
      <div className="alert-place-hint">Click where alerts should appear · Esc to cancel</div>
      {cursor && (
        <div className="alert-place-preview" style={{ left: cursor.x, top: cursor.y }}>
          <span className="ca-icon">⚠</span> alerts appear here
        </div>
      )}
    </div>
  );
}
