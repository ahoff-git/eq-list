"use client";
import { useMemo, useRef, useState } from "react";
import { fuzzyRank } from "@/shared/fuzzy";
import { useDismiss } from "@/lib/hooks";
import { CheckField } from "./ui";
import { count, figure } from "@/shared/format";
import { NO_FACET_VALUE } from "@/shared/item-search";

/** Above this many options a menu stops being scannable and wants a box to type into. */
const FILTER_ABOVE = 12;

/** Once the literal hits reach this many, the reader has enough and the fuzzy pass is noise. */
const FUZZY_BELOW = 12;

/** The same bar the wiki's index and your own loot ledger are searched at — one app, one standard. */
const FUZZY_SCORE = 0.45;

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
  missing = 0,
}: {
  label: string;
  /** What "not narrowing by this" reads as — "any slot", "any zone". */
  any: string;
  options: readonly string[];
  chosen: readonly string[];
  onChange: (next: string[]) => void;
  /**
   * How many items have **no value at all** for this facet — see `facetlessCount`. It is both the
   * count beside the *(none)* row and the reason that row exists: with 4,560 of 11,171 items naming
   * no zone, "the ones from nowhere" is a large and perfectly reasonable thing to ask for.
   */
  missing?: number;
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
  /**
   * The filter box, **substring first and fuzzy after**.
   *
   * Substring alone is what a filter box normally is, and it is wrong for effects: the same thing is
   * spelled a dozen ways across the catalogue (`Spell Haste I`, `Improved Haste II`, `Hastening of
   * Salik`), so typing "haste" has to reach the ones that do not contain the word in that order — and
   * a misspelt spell name has to reach it at all. Two passes because they cost differently and mean
   * differently: the literal hits are what you asked for and lead, the fuzzy ones are offered under
   * them rather than mixed in.
   *
   * The same two-pass shape the Lucy mirror uses, and it improves the other pickers for free: "Feerot"
   * still finds The Feerrott.
   */
  const shown = useMemo(() => {
    if (!needle) return all;
    const literal = all.filter((o) => o.toLowerCase().includes(needle));
    if (literal.length >= FUZZY_BELOW) return literal;
    const seen = new Set(literal);
    const near = fuzzyRank(filter.trim(), all, (o) => o, { limit: FUZZY_BELOW, minScore: FUZZY_SCORE })
      .map((m) => m.item)
      .filter((o) => !seen.has(o));
    return [...literal, ...near];
  }, [all, needle, filter]);

  const toggle = (value: string, on: boolean) =>
    onChange(on ? [...chosen, value] : chosen.filter((c) => c !== value));

  /**
   * Tick everything **currently shown**, which with a filter typed is the useful version: "Karana",
   * *All*, and the four Karanas are ticked without hunting for them.
   *
   * A union rather than a replacement, so filtering twice and pressing it twice builds a selection up
   * instead of throwing the first half away.
   */
  const noneChosen = chosen.includes(NO_FACET_VALUE);
  const showNone = missing > 0 && (!needle || "(none)".includes(needle) || "none".includes(needle));

  /**
   * *All* means **all**, `(none)` included — because it is a starting point, not a filter.
   *
   * The workflow it serves is *tick everything, then un-tick what I can't do yet*, and for that the
   * only sensible opening position is the whole catalogue. An *All* that quietly held back the 4,560
   * items with no zone would leave the reader deselecting from a set they didn't know was already
   * short.
   *
   * A union rather than a replacement, so filtering twice and pressing it twice builds a selection up
   * instead of throwing the first half away.
   */
  const pending = [...shown, ...(showNone ? [NO_FACET_VALUE] : [])].filter((o) => !chosen.includes(o));
  const selectAll = () => onChange([...chosen, ...pending]);

  /** The sentinel is an implementation detail; nobody should ever see it on a button. */
  const shownName = (value: string) => (value === NO_FACET_VALUE ? `no ${label.toLowerCase()}` : value);
  const summary =
    chosen.length === 0 ? any : chosen.length === 1 ? shownName(chosen[0]) : `${label} ×${chosen.length}`;

  return (
    <div className="facet" ref={box}>
      <button
        className={`seg ${chosen.length ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={chosen.length ? `${label}: ${chosen.map(shownName).join(", ")}` : `Narrow by ${label.toLowerCase()}`}
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
            {/* First and set apart by a rule, because it is not one of the values — it is the
                absence of all of them, and reading it as another zone is exactly the confusion the
                separation prevents. */}
            {showNone && (
              <CheckField
                className="facet-none"
                label={
                  <>
                    (none) <span className="muted">· {figure(missing)}</span>
                  </>
                }
                title={`Items the wiki gives no ${label.toLowerCase()} for at all`}
                checked={noneChosen}
                onChange={(on) => toggle(NO_FACET_VALUE, on)}
              />
            )}
            {shown.map((o) => (
              <CheckField key={o} label={o} checked={chosen.includes(o)} onChange={(on) => toggle(o, on)} />
            ))}
            {!shown.length && !showNone && <span className="muted small">Nothing matches that.</span>}
          </div>
          {(pending.length > 0 || chosen.length > 0) && (
            <div className="row facet-actions">
              {pending.length > 0 && (
                <button
                  className="btn sm"
                  onClick={selectAll}
                  title={
                    needle
                      ? `Tick the ${shown.length} matching this filter`
                      : "Tick everything, then un-tick what you can't do yet"
                  }
                >
                  {needle ? `All ${shown.length} shown` : `All ${all.length + (showNone ? 1 : 0)}`}
                </button>
              )}
              {chosen.length > 0 && (
                <button className="btn sm" onClick={() => onChange([])}>
                  Clear {count(chosen.length, "choice")}
                </button>
              )}
            </div>
          )}
          {/* The consequence nobody expects, and — since there is now something to do about it —
              phrased as the action rather than the warning. */}
          {missing > 0 && chosen.length > 0 && !noneChosen && (
            <span className="muted small facet-note">
              {count(missing, "item")} with no {label.toLowerCase()} {missing === 1 ? "is" : "are"} hidden.
              Tick <b>(none)</b> to include {missing === 1 ? "it" : "them"}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
