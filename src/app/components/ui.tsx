"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/**
 * A text box whose caret survives being typed in.
 *
 * The bug it fixes, which every field bound straight to Settings had: a keystroke goes
 * `onChange` → IPC → the main store → a broadcast back → `useSettings` → re-render, and until that
 * lap finishes React re-renders the input with the value it had *before* the keystroke. The DOM
 * value is rewritten under the cursor, and a rewritten value puts the caret at the end — so editing
 * the middle of "Mesmerization" threw you to the end of it on every letter.
 *
 * So the box owns its own text and only *pushes* upward. An upstream value is adopted when it isn't
 * the echo of what we last sent — which is what keeps a rule loaded from elsewhere (an import, a
 * library rule, a duplicate) landing in the field, without the round trip fighting the typist.
 */
export function TextField({
  value,
  onChange,
  className = "field",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value);
  /** The last value this field put upstream — anything else arriving is a genuine outside change. */
  const sent = useRef(value);
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setText(value);
  }, [value]);
  return (
    <input
      {...rest}
      className={className}
      value={text}
      onChange={(e) => {
        sent.current = e.target.value;
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

/**
 * One labelled row of a settings block: a name in a fixed column, the controls beside it, and an
 * optional aside that says what the current choice *means*.
 *
 * Every alert panel was spelling this out as `<div className="row astyle-row"><span
 * className="astyle-label">…`, which is how the label column ended up 62px in one place and
 * unstyled in another. It matters more than it looks: these rows are read down the left edge, so a
 * label that doesn't line up is a row that gets skipped.
 *
 * `note` is deliberately not a tooltip — for a rule's timing, "re-cast it and the countdown
 * restarts" is the difference between a setting you pick and a setting you guess at.
 */
export function ConfigRow({
  label,
  note,
  children,
  align,
}: {
  label: ReactNode;
  /** What this choice does, in the panel rather than behind a hover. */
  note?: ReactNode;
  children: ReactNode;
  /** Top-align for a row whose control is a list rather than a single widget. */
  align?: "top";
}) {
  return (
    <div className="row astyle-row" style={align === "top" ? { alignItems: "flex-start" } : undefined}>
      <span className="astyle-label">{label}</span>
      {children}
      {note && <span className="muted small cfg-note">{note}</span>}
    </div>
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

/** How long an add button holds its "done" look. Long enough to see, short enough to press again. */
const ADDED_MS = 1100;

/**
 * A "+ Add" that answers back.
 *
 * The list it adds to lives on another tab, so every one of these used to be a button that visibly
 * did nothing — the only confirmation was to go and look. It swaps to a tick and pops for a moment
 * (`.btn.added` in globals.css), which says *this press landed* the instant it happens; what was
 * added, and how many you now need, is the toast the add itself raises (`lib/addToList.ts`).
 *
 * The look is set on click rather than when the add resolves, because the two answer different
 * questions: the button answers "did it hear me", which is true immediately, and the toast answers
 * "what did it do", which the main process has to be asked.
 *
 * A component rather than a class, because it holds a timer and there are six of these buttons.
 */
export function AddButton({
  children,
  onAdd,
  className = "btn sm primary",
  title,
  done = "✓ Added",
}: {
  children: ReactNode;
  onAdd: () => void;
  className?: string;
  title?: string;
  /** What it says while it's showing that it worked. */
  done?: ReactNode;
}) {
  // A counter, not a boolean: pressing again while the tick is up has to restart the timer, and a
  // flag that's already true changes nothing for the effect to react to.
  const [press, setPress] = useState(0);
  useEffect(() => {
    if (!press) return;
    const id = setTimeout(() => setPress(0), ADDED_MS);
    return () => clearTimeout(id);
  }, [press]);
  const added = press > 0;
  return (
    <button
      className={cls(className, added && "added")}
      title={title}
      onClick={() => {
        setPress((n) => n + 1);
        onAdd();
      }}
    >
      {added ? done : children}
    </button>
  );
}
