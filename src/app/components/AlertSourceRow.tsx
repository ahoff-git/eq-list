"use client";
import type { AlertSource, AlertUsage } from "@/shared/alert-styles";
import { describeArmed } from "@/shared/alert-styles";

import type { AlertStyle } from "@/shared/types";

/**
 * One of the things that alerts **without a rule** — a personal best, a spawn window, a tracked item
 * dropping — as a row you can read.
 *
 * The Alerts tab used to list rules and nothing else, which made three features invisible in the tab
 * named after them: the only way to learn that a loot banner exists, let alone which of the saved
 * styles it wears, was to read the source. So each one gets a row that says what sets it off, where
 * its on/off lives, how many things are armed, and — the question this started from — **which look it
 * wears**, with the same 🎨 that opens every other editor in the tab.
 *
 * Deliberately shaped like a `StyleRow` rather than like a rule: it is a *look plus a sentence*, not a
 * trigger with drawers, and the arming switch stays on the thing being armed (a list row, a timer)
 * where the player is when they decide. It carries no ✕ at all — the feature is part of the app, and
 * there is nothing for deleting its row to mean.
 */
export default function AlertSourceRow({
  source,
  usage,
  style,
  styleName,
  open,
  onOpen,
}: {
  source: AlertSource;
  /** Who is wearing and arming what, for the live "2 list rows armed". */
  usage: AlertUsage;
  /** The look it wears, resolved — absent if its style has somehow gone from the list. */
  style?: AlertStyle;
  /** That look's name, for "wears Loot". */
  styleName?: string;
  open: boolean;
  onOpen: () => void;
}) {
  const armed = describeArmed(source, usage);
  const silent = source.armed(usage) === 0;

  return (
    <div className={`style-row asource ${open ? "open" : ""}`}>
      {/* The dot leads for the same reason it does on a style row: it is the fastest way to tell two
          looks apart, and telling a loot banner from a dispel warning at a glance is the whole point
          of the built-in colours. */}
      <span className="style-dot" style={{ background: style?.color ?? "transparent" }} aria-hidden />
      <b className="small asource-name">{source.label}</b>
      <span className="muted small style-what" title={source.hint}>
        {styleName ? `wears ${styleName}` : "wears the alert defaults"}
      </span>
      {/* Said out loud, because "0" and "off" are the same word to a number and very different news.
          Dimmed when nothing is armed: the row is then a description, not a thing that will happen. */}
      <span className={`muted small asource-armed${silent ? " off" : ""}`} title={source.hint}>
        {armed}
      </span>
      <button
        className={`btn ghost sm ${open ? "on" : ""}`}
        title={open ? "Close" : `Edit the look ${source.label.toLowerCase()} wear`}
        onClick={onOpen}
        disabled={!style}
      >
        🎨
      </button>
    </div>
  );
}
