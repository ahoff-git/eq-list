"use client";
import { useCallback, useEffect, useRef } from "react";
import { api } from "./api";
import type { DragEnd } from "@/shared/types";

/**
 * The gesture half of dragging a frameless window: the pointer going down on the titlebar, moving,
 * and coming up. The window half — following the cursor, the snap zones, the preview, pulling a
 * maximized window loose — is the main process's ([window-drag.ts](../../electron/window-drag.ts)),
 * because only it can read the cursor in screen coordinates and set a window's bounds.
 *
 * This replaces `-webkit-app-region: drag`, which moved the window and could do nothing else: it is
 * Chromium's own move loop, so a frameless window got no snap zones, no preview, and no
 * double-click to maximize — none of what a Windows user expects from a titlebar
 * ([ADR 0108](../../specs/decisions/0108-a-frameless-window-snaps-like-a-framed-one.md)).
 *
 * **`no-drag` still means what it always did.** A control in the titlebar carries the class and this
 * hook honours it, so the rule a title bar was written to — every control marked, or the press moves
 * the window instead of pressing it — is unchanged.
 *
 * Nothing here sends a coordinate. Main reads the cursor itself, which keeps the drag honest under a
 * window's CSS `zoom` (`useUiScale`) and on a mixed-DPI desktop, where the renderer's own idea of
 * "screen position" is in the wrong units.
 */
export interface DragHandle {
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

/** Marks a control in the drag handle as a control — anything under it is pressed, never dragged. */
const NO_DRAG = ".no-drag";

function overControl(target: EventTarget | null): boolean {
  // Not an element (the document, a synthetic event) — treat it as the handle: a titlebar that
  // can't be dragged is a window that can't be moved, while a control dragged by mistake is
  // released and pressed again.
  return target instanceof Element && !!target.closest(NO_DRAG);
}

/**
 * Props for the window's drag handle: press to drag (with snapping), double-click to
 * maximize/restore — the same toggle the titlebar's ❐ / ▢ button calls, so the glyph follows a
 * double-click for free (main reports the change; see `useMaximized`).
 */
export function useWindowDrag(): DragHandle {
  // How to stop listening to the drag in flight, and proof that there is one. Null between drags.
  const stop = useRef<(() => void) | null>(null);

  const end = useCallback((how: DragEnd) => {
    if (!stop.current) return;
    stop.current();
    stop.current = null;
    api()?.win.dragEnd(how);
  }, []);

  /**
   * Every way a drag ends. They are not the same ending: a release places the window, Escape puts
   * it back, and a gesture *lost* — focus taken by another app, this window unmounted — leaves it
   * where it got to, since nobody let go of anything.
   *
   * Bound for the window's life rather than per drag: `end` no-ops when there's nothing in flight,
   * and a listener attached late is exactly the one that misses the release it exists for.
   */
  useEffect(() => {
    const released = () => end("snap");
    const lost = () => end("keep");
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") end("cancel");
    };
    window.addEventListener("pointerup", released);
    window.addEventListener("pointercancel", lost);
    window.addEventListener("blur", lost);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerup", released);
      window.removeEventListener("pointercancel", lost);
      window.removeEventListener("blur", lost);
      window.removeEventListener("keydown", key);
      lost(); // never leave main holding a drag this window can no longer end
    };
  }, [end]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || overControl(e.target)) return;
      const a = api();
      if (!a) return; // on the web there's no window to drag
      end("keep"); // a press with another gesture still live: the new one is the real gesture
      // The window lags a fast drag, so the cursor can leave it mid-gesture — captured, the moves
      // keep arriving here instead of stopping at the window's edge.
      if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);
      a.win.dragStart();
      // Sent as they arrive: Chromium already coalesces pointer moves to about one per frame, so
      // this is a message a frame, and each is empty — the position comes from the cursor itself.
      const move = () => api()?.win.dragMove();
      window.addEventListener("pointermove", move);
      stop.current = () => window.removeEventListener("pointermove", move);
    },
    [end],
  );

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (overControl(e.target)) return;
    api()?.win.toggleMaximize();
  }, []);

  return { onPointerDown, onDoubleClick };
}
