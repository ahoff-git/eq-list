"use client";
import { useEffect, useRef, useState } from "react";

/** How long an input must hold still before work that's costly to redo starts over it. */
export const SETTLE_MS = 250;

/**
 * `value`, once it has stopped changing for `ms`. Dragging a slider or typing a number moves the live
 * value on every tick; whatever filters or plans from it should read this instead, and the live value
 * stays for the control itself so it follows the hand. Compared by identity, so pass a memoized object.
 *
 * **The first change after a quiet spell is taken at once**; only a burst after it waits. That is what
 * keeps a click (a ticked zone, a toggled era) and a panel's stored settings arriving after mount from
 * sitting behind the delay — which, for the latter, meant planning from defaults for a quarter second.
 */
export function useSettled<T>(value: T, ms: number = SETTLE_MS): T {
  const [settled, setSettled] = useState(value);
  const seen = useRef(value);
  const changedAt = useRef(0);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    let quiet = false;
    if (!Object.is(value, seen.current)) {
      const now = Date.now();
      quiet = now - changedAt.current >= ms;
      changedAt.current = now;
      seen.current = value;
    }
    if (quiet) {
      setSettled(value);
      return;
    }
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, settled, ms]);
  return settled;
}
