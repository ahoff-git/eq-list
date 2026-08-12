"use client";
import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

/** A set of things being left off the map, and how to change your mind about them. */
export interface Hidden<T> {
  /** What's hidden. Ask it, don't iterate it — that's the filter panel's job. */
  hidden: ReadonlySet<T>;
  /** Show or hide one, or a whole section at once. */
  setVisible: (items: T | T[], visible: boolean) => void;
}

/**
 * "Which of these am I not looking at" — the map's filters, three times over.
 *
 * Pins by kind, the map's own labels by kind, and peers by name are each a set of things being left
 * off, and each had grown its own copy of the same lines: clone the set, add or delete, hand the clone
 * back. What the copies could drift on is the detail that matters — a **filter is stated as what's
 * hidden, never as what's shown**, so a kind of label that only some maps have is visible by default
 * rather than something you'd have to discover and switch on.
 *
 * Takes the state pair rather than a storage key, so *whether* a filter persists stays a decision at
 * the call site: "I never want to see the furniture" is a preference worth keeping, while a filter you
 * set to look at one thing for a minute should be gone tomorrow. Stored as an array, because a `Set`
 * isn't JSON.
 */
export function useHidden<T>([list, setList]: [T[], Dispatch<SetStateAction<T[]>>]): Hidden<T> {
  const hidden = useMemo(() => new Set(list), [list]);

  const setVisible = useCallback(
    (items: T | T[], visible: boolean) => {
      const all = Array.isArray(items) ? items : [items];
      setList((prev) => (visible ? prev.filter((k) => !all.includes(k)) : [...new Set([...prev, ...all])]));
    },
    [setList],
  );

  return { hidden, setVisible };
}
