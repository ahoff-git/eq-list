"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { WindowToggles } from "@/shared/types";

/** A title-bar toggle: what it reads, whether that's been loaded yet, and how to flip it. */
export interface WindowToggle {
  on: boolean;
  /**
   * Has the saved value arrived? Until it has, **nothing may be applied**: the window was already
   * opened in the right state by the main process, and asserting a fallback over it is a visible
   * flash (and, for click-through, a mode that turns itself off on launch).
   */
  loaded: boolean;
  toggle: () => void;
}

/**
 * One of the title bar's remembered toggles — pinned, ◐ opaque, 👻 click-through.
 *
 * Each is a fact about *this* window rather than a preference for the app, so it lives in
 * `window-state.json` beside the window's bounds and comes back with it
 * ([ADR 0074](../../specs/decisions/0074-how-a-window-was-left-is-window-state.md)). The renderer
 * never says which window it is — main reads that off the sender — so a hook is all a title bar
 * needs, and the same one serves both windows without either knowing about the other.
 *
 * This holds the value and remembers it. **Applying it is the caller's job**, because each toggle
 * applies differently (an opacity number, an always-on-top flag, a cursor-tracking mode); the
 * wrappers below and `useClickThrough` are the three that do it.
 */
export function useWindowToggle(key: keyof WindowToggles, fallback = false): WindowToggle {
  const [on, setOn] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  // The current value, for `toggle` — reading it from state would make the callback churn, and
  // flipping inside the state updater would double-write under React's strict double-invoke.
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    const a = api();
    if (!a) {
      setLoaded(true); // on the web there's nothing to restore
      return;
    }
    let live = true;
    void a.win.getState().then((state) => {
      if (!live) return;
      setOn(state[key] ?? fallback);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [key, fallback]);

  const toggle = useCallback(() => {
    const next = !onRef.current;
    setOn(next);
    api()?.win.saveState({ [key]: next });
  }, [key]);

  return { on, loaded, toggle };
}

/**
 * The 📌 always-on-top toggle, applied to this window and remembered.
 *
 * **On by default**, and per window: the app is a float over the game, and a float that falls
 * behind it is no use — but the map and the list are pinned at different moments, which is why this
 * is window state rather than the one app-wide setting it used to be (ADR 0074).
 */
export function useWindowPin(): { pinned: boolean; toggle: () => void } {
  const { on: pinned, loaded, toggle } = useWindowToggle("pinned", true);
  useEffect(() => {
    if (!loaded) return; // the window opened pinned as it was left; don't assert the fallback over it
    api()?.win.setAlwaysOnTop(pinned);
  }, [pinned, loaded]);
  return { pinned, toggle };
}
