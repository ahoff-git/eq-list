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

/**
 * Which way an openable row's marker points. Seven rows in six panels open and close, and each one
 * spelled the pair of glyphs out — so "open" was ▾ in most of them and the *first* branch in one,
 * which is the sort of thing that only reads wrong once someone flips a condition.
 */
export const caretGlyph = (open: boolean): string => (open ? "▾" : "▸");

/** The marker itself, for the rows that give it a column of its own (`.caret`). */
export function Caret({ open, className = "caret" }: { open: boolean; className?: string }) {
  return <span className={className}>{caretGlyph(open)}</span>;
}

/**
 * A panel with nothing to show yet: what's missing, and what would fill it in.
 *
 * Eight of these existed as the same two paragraphs. The **hint is not decoration** — a blank panel
 * that doesn't say what feeds it looks broken, and each of these is really the answer to "why is
 * this empty?": kill something, cast something, widen the filter.
 */
export function Empty({ title, hint }: { title: ReactNode; hint: ReactNode }) {
  return (
    <div className="empty">
      <p>{title}</p>
      <p className="small">{hint}</p>
    </div>
  );
}

/** Join a component's own classes with the caller's, without leaving a stray space behind. */
const cls = (...names: (string | undefined | false)[]): string => names.filter(Boolean).join(" ");

/**
 * A checkbox with a label beside it, as every filter bar and every setting wants one.
 *
 * It was a dozen-odd copies of `<label className="row" style={{ gap: N }}><input type="checkbox" …/>`,
 * with the gap set to 4, 5, 6 or 8 depending on which panel you happened to be in, and every one of
 * them spelling out the `e.target.checked` dance. The state a checkbox reports is a boolean, so that's
 * what `onChange` gets; the spacing is a stylesheet's business (`.check-field`).
 *
 * `indeterminate` is a DOM property rather than an attribute, so it can only be set through a ref;
 * having that here is what lets a "half this group is on" heading be as declarative as the rest.
 */
export function CheckField({
  label,
  checked,
  onChange,
  title,
  className,
  disabled,
  indeterminate,
}: {
  /** A word for the filter bars, a whole line for a setting — hence a node, not a string. */
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** Neither on nor off: some of what this box stands for is on. */
  indeterminate?: boolean;
}) {
  return (
    <label className={cls("row", "check-field", className)} title={title} style={disabled ? { opacity: 0.5 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** One choice a `PickField` offers. `value` is what comes back; `label` is what's read. */
export interface PickOption {
  value: string;
  label: string;
}

/**
 * A dropdown that filters a list, with the "everything" choice at the top of it.
 *
 * The blank option is the point: every one of these pickers means "narrow to one of these, or don't
 * narrow at all". Naming it (`blank`) keeps that phrasing — "any mob", "any corpse", "any position" —
 * with the picker instead of one option deep in each panel's markup.
 *
 * Values come back as the strings the DOM gives; a numeric filter converts at its own call site,
 * where the type it wants is known. Which is also why `blankValue` exists: most filters spell "don't
 * narrow" as the empty string, a numeric floor spells it `0`, and a `<select>` whose value matches no
 * option of its own shows an empty box.
 */
export function PickField({
  value,
  onChange,
  blank,
  blankValue = "",
  options,
  title,
  className = "select-sm",
}: {
  value: string | number;
  onChange: (value: string) => void;
  /** The "no filter" choice, always first. */
  blank: string;
  /** What "no filter" is, in this filter's own vocabulary. */
  blankValue?: string;
  options: PickOption[];
  title?: string;
  /** Which of the app's select widths this is. Defaults to the compact one. */
  className?: string;
}) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} title={title}>
      <option value={blankValue}>{blank}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
