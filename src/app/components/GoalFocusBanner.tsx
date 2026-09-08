"use client";
import { count } from "@/shared/format";

/**
 * The warning a hiding goal focus (ADR 0198) draws at the top of the tab it's narrowing — leads with
 * what it did and offers the undo in the same breath, so "where did the rest of my list go" is
 * answered before it has to be asked. Shared by the List and Hunt tabs, the two it narrows.
 *
 * `onShowAll` is exactly `focus.setHiding(false)` — nothing here decides that; this only draws the
 * warning and the button, the same "go and look" restraint a toast's own action follows.
 */
export default function GoalFocusBanner({
  hidden,
  noun = "other item",
  onShowAll,
}: {
  hidden: number;
  noun?: string;
  onShowAll: () => void;
}) {
  return (
    <div className="goal-focus-banner">
      <span>🎯 Focused on your goals — {count(hidden, noun)} hidden.</span>
      <button className="btn sm" onClick={onShowAll}>
        Show all
      </button>
    </div>
  );
}
