"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { usePersistentState } from "@/lib/usePersistentState";
import { clampPanelPct, nudgePanelPct, panelPct, PANEL_PCT, storedPanelPct } from "@/shared/panel-size";

/**
 * A panel that opens over another view, with the seam under it as a drag handle.
 *
 * Every one of these panels used to be a fixed share of its window — 40% for the kill list, 45% for
 * the route — chosen so the view underneath stayed the point. That's the right *default* and the wrong
 * *rule*: a forty-step route or a dungeon's worth of floor toggles wants more, and a glance at who's
 * connected wants less, and which of those you're doing is not something a stylesheet can know. So the
 * default stands until someone drags it, and after that the panel is exactly as tall as they said and
 * **scrolls whatever doesn't fit** — the size is the reader's, the content is the panel's.
 *
 * The wrapper owns the *box* and nothing else: each panel keeps its own padding, colours and inner
 * scrolling (`.panel-resize > :not(.panel-grip)` gives it the box to fill). That's what makes this
 * general — anything that opens over something else can be wrapped in one, in either window.
 *
 * The height is remembered per `id` (`STORAGE_KEYS.panelHeight`) because these panels are toggled open
 * and shut all session: a size that reset every time the ☠ went off and on again would be a size
 * nobody bothers to set. It's a **share of the window** rather than a pixel height — see
 * `shared/panel-size.ts` for why that's the only form that survives the interface scale.
 */
export default function ResizablePanel({
  id,
  share,
  children,
}: {
  /** Which panel this is, for remembering its height. Window-scoped, e.g. `map.kills`. */
  id: string;
  /** How much of the window the panel takes before anyone drags it, as a % — a ceiling, not a size. */
  share: number;
  children: ReactNode;
}) {
  const [stored, setStored] = usePersistentState<number | null>(STORAGE_KEYS.panelHeight(id), null);
  // Only for the handle's look: a grip you're actively dragging stays lit even when the pointer has
  // run past the edge of it, which is most of a drag.
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pct = storedPanelPct(stored);

  /** This panel's box and the window it takes a share of, as the screen currently has them. */
  const measure = useCallback(() => {
    const el = box.current;
    // The flex parent *is* the window's column — the panels and the view underneath are its children.
    const total = el?.parentElement?.getBoundingClientRect().height ?? 0;
    return { height: el?.getBoundingClientRect().height ?? 0, total };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const { height, total } = measure();
      if (!(total > 0)) return; // nothing to be a share of — leave the panel as it is
      // A drag over a list of rows would otherwise highlight half of them on the way past.
      e.preventDefault();
      const grip = e.currentTarget;
      const from = e.clientY;
      // Captured, so the moves keep arriving here once the pointer has left a 6px-tall handle —
      // which it does immediately.
      grip.setPointerCapture(e.pointerId);
      setDragging(true);
      const move = (ev: PointerEvent) => {
        const next = panelPct(height + ev.clientY - from, total);
        if (next !== null) setStored(next);
      };
      // Every ending is the same ending: where the pointer got to is where the panel stays. There's
      // nothing to put back, so a cancelled gesture needs no special case — only `lostpointercapture`,
      // which is what a release *and* an interruption both come through.
      const done = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("lostpointercapture", done);
        setDragging(false);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("lostpointercapture", done);
    },
    [measure, setStored],
  );

  /** The handle is a control, so it answers the arrow keys — and a drag is a poor gesture for 2%. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const steps = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!steps) return;
      e.preventDefault();
      const { height, total } = measure();
      // Never dragged: nudge from where the default happens to have put it, so the first press moves
      // the panel a step rather than jumping it to some number the reader never chose.
      const now = pct ?? panelPct(height, total);
      if (now !== null) setStored(nudgePanelPct(now, steps));
    },
    [measure, pct, setStored],
  );

  return (
    <div
      ref={box}
      className={`panel-resize ${dragging ? "resizing" : ""}`}
      // Undragged, the panel is as tall as its content and no taller than it was designed to be;
      // dragged, it is exactly what was asked for, whether the content fills it or overflows it.
      style={pct === null ? { maxHeight: `${clampPanelPct(share)}%` } : { height: `${pct}%` }}
    >
      {children}
      <div
        className="panel-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Panel height"
        aria-valuenow={Math.round(pct ?? clampPanelPct(share))}
        aria-valuemin={PANEL_PCT.min}
        aria-valuemax={PANEL_PCT.max}
        tabIndex={0}
        title="Drag to resize this panel · double-click to reset"
        onPointerDown={onPointerDown}
        onDoubleClick={() => setStored(null)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
