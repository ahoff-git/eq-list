"use client";
import type { ReactNode } from "react";

/**
 * A frameless window's title bar: what it says on the left, its controls on the right, and the
 * **drag handle** for the whole window.
 *
 * The gesture is Windows'. `-webkit-app-region: drag` (in `globals.css`) makes this element
 * hit-test as the window's caption, so the OS runs the move loop — and with it every snap gesture
 * a caption has: drag to an edge, double-click to maximize, Win+Arrow, snap layouts, shake. The app
 * used to run that drag itself; it does not any more
 * ([ADR 0182](../../../specs/decisions/0182-window-management-is-windows-job.md)).
 *
 * The rule for anything put inside is unchanged: **every control carries `no-drag`**, or a press on
 * it moves the window instead of pressing it.
 */
export default function Titlebar({ children }: { children: ReactNode }) {
  return <div className="titlebar">{children}</div>;
}
