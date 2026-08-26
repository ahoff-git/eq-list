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

/**
 * The mirror image, for a window whose resting state is **click-through**: the alert overlay, which
 * is a sheet of glass over the game and must stay one. Spread onto a control that has to take a
 * click anyway — the ✕ on a standing buff reminder, the layer you click to place a custom spot —
 * and the window hands itself back for exactly as long as the cursor is on it.
 *
 * Islands rather than one region, because that is what an overlay is: mostly nothing, with a few
 * small things drawn on it. Everything unmarked keeps passing clicks to the game, which is the
 * behaviour the overlay exists to have.
 */
export const SOLID = { "data-solid": "" } as const;

const PASS_THROUGH_SELECTOR = "[data-passthrough]";
const SOLID_SELECTOR = "[data-solid]";

/** Is what the cursor is on inside a marked region? Anything we can't place is outside every one. */
function within(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && !!target.closest(selector);
}

/**
 * Should clicks pass to the game, given what the cursor is on? One per mode, and the difference
 * between them is the whole difference between the two modes — including what an *unplaceable*
 * target means, where the failure modes are not equal:
 *
 *   - A solid window that wrongly eats a click can be clicked again; one that wrongly passes its own
 *     titlebar through can't be turned off. So the pass-through region is the narrow case, and
 *     unknown reads as a control.
 *   - An overlay has no titlebar and covers a whole display, so a wrongly-solid one is the state
 *     with no way out. There, unknown reads as glass.
 */
const throughOverRegion = (target: EventTarget | null) => within(target, PASS_THROUGH_SELECTOR);
const throughOffIslands = (target: EventTarget | null) => !within(target, SOLID_SELECTOR);

/**
 * The same question asked of where the cursor *already* is, rather than of a move.
 *
 * Turning a mode on is itself a click on a control, so assuming "the cursor is elsewhere" would put
 * the window straight into click-through under the pointer and eat the click that turns it off
 * again — until you wiggled the mouse. `:hover` is what the browser already knows; its deepest match
 * is the element under the cursor, and no match at all means the cursor is outside the window, where
 * click-through is the right resting state in either mode.
 */
function throughAtCursor(through: (target: EventTarget | null) => boolean): boolean {
  const hovered = document.querySelectorAll(":hover");
  const deepest = hovered[hovered.length - 1];
  return deepest ? through(deepest) : true;
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
  useTrackCursor(loaded && on, throughOverRegion, false);
  return { on, toggle };
}

/**
 * The alert overlay's standing arrangement: glass over the game, solid only on a `SOLID` island.
 *
 * Always on — there is no toggle, because there is nothing to toggle *between*. The overlay's whole
 * job is to be ignorable, and an island is a thing the player put there by asking for a control on a
 * reminder; it takes the click it looks like it takes and nothing else does.
 *
 * The overlay is `focusable: false`, and stays that way: a click on an island lands without pulling
 * focus off the game, which is the only reason a control on this window is affordable at all.
 */
export function useSolidIslands(): void {
  useTrackCursor(true, throughOffIslands, true);
}

/**
 * Track the cursor and tell main, on each crossing, whether this window's clicks belong to it.
 *
 * Electron's `setIgnoreMouseEvents(true, { forward: true })` still delivers mouse **moves** to
 * the renderer, so the DOM knows where the cursor is even while it can't be clicked. That's the
 * whole trick: on every move we ask `through` what the cursor is on now, and hand the window back to
 * the user the moment it reaches something clickable. Only the crossings are sent, not the moves.
 *
 * Two consequences worth knowing. **Only moves are forwarded** — the wheel isn't — so nothing that
 * passes clicks through can be scrolled or zoomed meanwhile. And **a drag is never interrupted**: a
 * press that started on a control (dragging the window by its titlebar, a slider) holds the window
 * solid until it's released, or crossing the map mid-drag would drop the gesture on the floor.
 *
 * `off` is what the window is when nobody is tracking it, restored on unmount and while disabled —
 * solid for an app window that would otherwise be unclickable, glass for an overlay that would
 * otherwise be a sheet over the screen.
 */
function useTrackCursor(
  enabled: boolean,
  through: (target: EventTarget | null) => boolean,
  off: boolean,
): void {
  // What we last told the main process, so a move across a region isn't an IPC message per pixel.
  // `null` is *unknown*, and it is why the cache can't go stale into a window nobody can click:
  // main flips the overlay itself to have a custom spot placed on it, so what we last said is only
  // reliable for as long as we've been tracking without interruption.
  const sentRef = useRef<boolean | null>(null);
  // A press that began on a control: hold the window until it's released (see above).
  const pressedRef = useRef(false);

  useEffect(() => {
    const a = api();
    if (!a) return;
    sentRef.current = null; // assert on every (re)enable rather than trusting an old answer
    const set = (value: boolean) => {
      if (sentRef.current === value) return;
      sentRef.current = value;
      a.win.setClickThrough(value);
      log.debug(value ? "clicks → game" : "clicks → window");
    };

    if (!enabled) {
      set(off);
      return;
    }
    set(throughAtCursor(through));

    const onMove = (e: MouseEvent) => {
      if (pressedRef.current) return;
      set(through(e.target));
    };
    const onDown = () => {
      pressedRef.current = true;
    };
    const onUp = (e: MouseEvent) => {
      pressedRef.current = false;
      set(through(e.target));
    };
    // Left the window entirely: click-through is the resting state either way.
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
      set(off);
    };
  }, [enabled, through, off]);
}
