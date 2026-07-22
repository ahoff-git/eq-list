"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * In-app page navigation for the control window. Clicking an item / mob / quest
 * name anywhere (search results, the list, the hunt) opens that wiki page *inside*
 * the app rather than launching the browser — only the explicit "↗ eqlwiki" button
 * leaves the app. A simple history stack backs the browser-style back/forward
 * (mouse thumb buttons via `app-command`, or Alt+←/→ — see `page.tsx`).
 *
 * `index === -1` means "no page open" (show the search box); back from the first
 * page returns there.
 */
export interface Nav {
  /** The page title currently open, or null when none. */
  current: string | null;
  canBack: boolean;
  canForward: boolean;
  /** Open a page by title — the universal in-app link action. */
  openPage: (title: string) => void;
  back: () => void;
  forward: () => void;
  /** Drop all history (e.g. when a new search starts). */
  clear: () => void;
}

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within <NavProvider>");
  return ctx;
}

/**
 * Owns the history stack. `onOpen` fires whenever a page is shown (openPage /
 * back / forward that lands on a page) so the host can switch to the page view
 * (the Search tab). Kept separate from the tab state it doesn't own.
 */
export function NavProvider({ onOpen, children }: { onOpen?: () => void; children: ReactNode }) {
  const [state, setState] = useState<{ stack: string[]; index: number }>({ stack: [], index: -1 });

  const openPage = useCallback(
    (title: string) => {
      setState((s) => {
        if (s.index >= 0 && s.stack[s.index] === title) return s; // already here
        const stack = s.stack.slice(0, s.index + 1);
        stack.push(title);
        return { stack, index: stack.length - 1 };
      });
      onOpen?.();
    },
    [onOpen],
  );

  // back/forward also fire onOpen so a browser-back from another tab surfaces the
  // page view (or the search box, at the bottom of the stack).
  const back = useCallback(() => {
    setState((s) => (s.index >= 0 ? { ...s, index: s.index - 1 } : s));
    onOpen?.();
  }, [onOpen]);

  const forward = useCallback(() => {
    setState((s) => (s.index < s.stack.length - 1 ? { ...s, index: s.index + 1 } : s));
    onOpen?.();
  }, [onOpen]);

  const clear = useCallback(() => setState({ stack: [], index: -1 }), []);

  const value = useMemo<Nav>(
    () => ({
      current: state.index >= 0 ? state.stack[state.index] : null,
      canBack: state.index >= 0,
      canForward: state.index < state.stack.length - 1,
      openPage,
      back,
      forward,
      clear,
    }),
    [state, openPage, back, forward, clear],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
