"use client";
import type { ReactNode } from "react";

/**
 * ui.tsx — the small presentational bits more than one panel uses.
 *
 * Nothing here knows anything about the app; it's markup and class names that were being copied between
 * panels. `StatTile` existed twice with identical markup and two different prop types, and `segCls`
 * twice as the same one-liner.
 */

/**
 * One figure with its name under it — the tile a panel's summary row is made of.
 *
 * `hint` is the hover, and it's where the *why* goes: a figure a person can't interrogate is one they
 * either believe or ignore, and the app's whole habit is to say where a number came from.
 */
export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat-tile" title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** A segmented-control button's classes. One definition, so the two panels can't drift apart. */
export const segCls = (active: boolean): string => `seg ${active ? "active" : ""}`;
