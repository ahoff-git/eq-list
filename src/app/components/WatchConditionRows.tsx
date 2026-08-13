"use client";
import { WATCH_FIELDS, WATCH_OPS } from "@/shared/watch-conditions";
import type { WatchCondition, WatchField, WatchOp } from "@/shared/types";

/**
 * The editor for a list of conditions — one row each, a field, an operator and some text.
 *
 * Used twice, which is the reason it exists: the conditions that decide whether a watch **fires**,
 * and the words that **call off** a waiting cue. They are the same idea pointed in opposite
 * directions, so they get the same rows; `allowExclude` is the one real difference, since "cancel
 * unless" would end a cue on the very next line and is refused rather than offered.
 */
export default function WatchConditionRows({
  conditions,
  onChange,
  allowExclude = true,
  addLabel,
  empty,
}: {
  conditions: WatchCondition[];
  onChange: (next: WatchCondition[]) => void;
  /** Offer the ✓/✕ invert toggle. Off for cancels, where inverting is meaningless. */
  allowExclude?: boolean;
  addLabel: string;
  /** What to say when there are none — the place to explain what these rows would be for. */
  empty: string;
}) {
  const patch = (i: number, p: Partial<WatchCondition>) =>
    onChange(conditions.map((c, at) => (at === i ? { ...c, ...p } : c)));
  const remove = (i: number) => onChange(conditions.filter((_, at) => at !== i));
  const add = () => onChange([...conditions, { field: "line", op: "contains", text: "" }]);

  return (
    <div className="watch-conds">
      {conditions.length === 0 && <span className="hint">{empty}</span>}
      {conditions.map((c, i) => (
        <div className="row watch-cond" key={i}>
          {allowExclude && (
            <button
              className={`btn ghost sm cond-not ${c.exclude ? "on" : ""}`}
              title={
                c.exclude
                  ? "Excluding: the alert is held back when this matches. Click to require it instead."
                  : "Requiring: this has to match. Click to exclude — never alert when it does."
              }
              onClick={() => patch(i, { exclude: !c.exclude })}
            >
              {c.exclude ? "not" : "and"}
            </button>
          )}
          <select
            className="field sm cond-field"
            value={c.field}
            title={WATCH_FIELDS.find((f) => f.value === c.field)?.hint}
            onChange={(e) => patch(i, { field: e.target.value as WatchField })}
          >
            {WATCH_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="field sm cond-op"
            value={c.op}
            onChange={(e) => patch(i, { op: e.target.value as WatchOp })}
          >
            {WATCH_OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="field"
            style={{ flex: 1, minWidth: 0 }}
            value={c.text}
            placeholder="words to look for"
            onChange={(e) => patch(i, { text: e.target.value })}
          />
          <button className="btn ghost sm" title="Remove this condition" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={add}>
        {addLabel}
      </button>
    </div>
  );
}
