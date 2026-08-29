"use client";
import { useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/hooks";
import { CheckField } from "./ui";
import { count } from "@/shared/format";

/** Above this many options a menu stops being scannable and wants a box to type into. */
const FILTER_ABOVE = 12;

/**
 * One narrowing question, as a dropdown you can tick more than one answer to.
 *
 * `PickField` is the app's dropdown, and it asks "which **one** of these" — right for "whose corpse",
 * wrong here. "Fingers or neck" is a single thought, and a picker that made you run the search twice
 * to have it would be answering a different question than the one asked.
 *
 * Ticking within one picker therefore widens *that* answer while the picker as a whole still only
 * narrows the results (see `item-search.ts` on what subtractive means here) — which is why the button
 * shows the count rather than a truncated list: what matters at a glance is that this facet is doing
 * something, and how much.
 *
 * A value already ticked is always offered even when nothing in the current results carries it. It
 * has to be: the options are derived from the catalogue, and a tick you can see but cannot untick is
 * a filter you can't get out of.
 */
export default function FacetPicker({
  label,
  any,
  options,
  chosen,
  onChange,
}: {
  label: string;
  /** What "not narrowing by this" reads as — "any slot", "any zone". */
  any: string;
  options: readonly string[];
  chosen: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  useDismiss(box, open, () => setOpen(false));

  const all = useMemo(() => {
    const stale = chosen.filter((c) => !options.includes(c));
    return [...options, ...stale];
  }, [options, chosen]);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? all.filter((o) => o.toLowerCase().includes(needle)) : all;

  const toggle = (value: string, on: boolean) =>
    onChange(on ? [...chosen, value] : chosen.filter((c) => c !== value));

  const summary = chosen.length === 0 ? any : chosen.length === 1 ? chosen[0] : `${label} ×${chosen.length}`;

  return (
    <div className="facet" ref={box}>
      <button
        className={`seg ${chosen.length ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={chosen.length ? `${label}: ${chosen.join(", ")}` : `Narrow by ${label.toLowerCase()}`}
        onClick={() => setOpen((o) => !o)}
        disabled={!all.length}
      >
        {summary} ▾
      </button>

      {open && (
        <div className="facet-menu" role="menu">
          {all.length > FILTER_ABOVE && (
            <input
              className="field sm facet-filter"
              placeholder={`Filter ${label.toLowerCase()}`}
              value={filter}
              autoFocus
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <div className="facet-options">
            {shown.map((o) => (
              <CheckField key={o} label={o} checked={chosen.includes(o)} onChange={(on) => toggle(o, on)} />
            ))}
            {!shown.length && <span className="muted small">Nothing matches that.</span>}
          </div>
          {chosen.length > 0 && (
            <button className="btn sm facet-clear" onClick={() => onChange([])}>
              Clear {count(chosen.length, "choice")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
