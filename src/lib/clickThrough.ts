"use client";
import { useEffect, useRef } from "react";
import { api } from "./api";
import { useWindowToggle } from "./windowToggles";
import { createLogger } from "@/shared/logging";

const log = createLogger("click-through");

/**
 * Spread onto the **one** region of a window whose clicks should reach the game while
 * click-through is on — the list's panel, the map's canvas. Everything outside it (the
 * titlebar, the tab bar, the toolbar, an open side panel) stays clickable, which is what
 * keeps the mode escapable: the button that turns it off is in the titlebar.
 *
 * One region per window, marked at the window's own composition site, so "what passes
 * through" is a single line to read and a single line to move.
 */
export const PASS_THROUGH = { "data-passthrough": "" } as const;

const PASS_THROUGH_SELECTOR = "[data-passthrough]";

/** Is the cursor over the pass-through region? Anything we can't place counts as a control. */
function overPassThrough(target: EventTarget | null): boolean {
  // Not an element (the document itself, a leave event) — treat it as solid. The failure
  // modes are not equal: a window that wrongly eats a click can be clicked again, while one
  // that wrongly passes its own titlebar through can't be turned off.
  return target instanceof Element && !!target.closest(PASS_THROUGH_SELECTOR);
}

/**
 * The same question asked of where the cursor *already* is, rather than of a move.
 *
 * Turning the mode on is itself a click on a control, so assuming "the cursor is elsewhere"
 * would put the window straight into click-through under the pointer and eat the click that
 * turns it off again — until you wiggled the mouse. `:hover` is what the browser already
 * knows; its deepest match is the element under the cursor, and no match at all means the
 * cursor is outside the window, where click-through is the right resting state.
 */
function cursorOverPassThrough(): boolean {
  const hovered = document.querySelectorAll(":hover");
  const deepest = hovered[hovered.length - 1];
  return deepest ? overPassThrough(deepest) : true;
}

/**
 * The 👻 toggle: this window's remembered click-through mode, applied while it's on.
 *
 * Remembered per window like the pin and the ◐ ([ADR 0074](../../specs/decisions/0074-how-a-window-was-left-is-window-state.md)),
 * and applied by the main process at creation too, so the first click after launch already lands
 * where you left it pointing rather than waiting for the renderer to load.
 */
export function useClickThrough(): { on: boolean; toggle: () => void } {
  const { on, loaded, toggle } = useWindowToggle("clickThrough");
  // Not before the saved value lands: the window may already *be* click-through (main applied it),
  // and taking that back for a tick is a click through the glass that the user meant for the game.
  useTrackCursor(loaded && on);
  return { on, toggle };
}

/**
 * Let this window's clicks fall through to the game, except over its controls.
 *
 * Electron's `setIgnoreMouseEvents(true, { forward: true })` still delivers mouse **moves** to
 * the renderer, so the DOM knows where the cursor is even while it can't be clicked. That's the
 * whole trick: on every move we ask "is this the pass-through region?" and hand the window back
 * to the user the moment the cursor reaches a control. Only the crossings are sent, not the moves.
 *
 * Two consequences worth knowing. **Only moves are forwarded** — the wheel isn't — so a
 * pass-through region can't be scrolled or zoomed while the mode is on; it's a glance mode, and
 * you turn it off to work in the window. And **a drag is never interrupted**: a press that started
 * on a control (dragging the window by its titlebar, a slider) holds the window solid until it's
 * released, or crossing the map mid-drag would drop the gesture on the floor.
 */
function useTrackCursor(enabled: boolean): void {
  // What we last told the main process, so a move across a region isn't an IPC message per pixel.
  const throughRef = useRef(false);
  // A press that began on a control: hold the window until it's released (see above).
  const pressedRef = useRef(false);

  useEffect(() => {
    const a = api();
    if (!a) return;
    const set = (through: boolean) => {
      if (throughRef.current === through) return;
      throughRef.current = through;
      a.win.setClickThrough(through);
      log.debug(through ? "clicks → game" : "clicks → window");
    };

    if (!enabled) {
      set(false);
      return;
    }
    set(cursorOverPassThrough());

    const onMove = (e: MouseEvent) => {
      if (pressedRef.current) return;
      set(overPassThrough(e.target));
    };
    const onDown = () => {
      pressedRef.current = true;
    };
    const onUp = (e: MouseEvent) => {
      pressedRef.current = false;
      set(overPassThrough(e.target));
    };
    // Left the window entirely: click-through is the resting state of the mode.
    const onLeave = () => {
      if (!pressedRef.current) set(true);
    };
    // Capture, so a handler that stops propagation can't leave the window in the wrong mode.
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("mouseleave", onLeave);
      pressedRef.current = false;
      set(false); // never leave a window that can't be clicked behind
    };
  }, [enabled]);
}
