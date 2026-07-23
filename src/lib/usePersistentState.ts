"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * `useState` that remembers its value in `localStorage`, so window toggles / selections
 * survive the window closing and reopening (and app restarts). Drop-in for `useState`.
 *
 * Starts from `initial` on the first render (identical to the static-export markup, so
 * no hydration mismatch) and applies any stored value right after mount. The value must
 * be JSON-serializable. No-ops cleanly where `localStorage` is unavailable.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  // A render flag (not a ref) so the persist effect only runs *after* the load — never
  // clobbering the stored value with `initial` on mount.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable or bad JSON — keep initial */
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* best effort */
    }
  }, [key, value, loaded]);

  return [value, setValue];
}
