"use client";
import type { ReactNode } from "react";
import { useWindowDrag } from "@/lib/windowDrag";

/**
 * A frameless window's title bar: what it says on the left, its controls on the right, and the
 * **drag handle** for the whole window.
 *
 * One component so "the titlebar drags the window, snaps at the edges, and maximizes on a
 * double-click" is one fact in one place — both windows had written the bare `<div className="titlebar">`
 * and would otherwise each have to remember to wire the gesture (see `useWindowDrag`).
 *
 * The rule for anything put inside: **every control carries `no-drag`**, or a press on it moves the
 * window instead of pressing it.
 */
export default function Titlebar({ children }: { children: ReactNode }) {
  const drag = useWindowDrag();
  return (
    <div className="titlebar" {...drag}>
      {children}
    </div>
  );
}
