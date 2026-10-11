"use client";
import { useState } from "react";
import { formatDuration } from "@/shared/duration";
import { parseInterval } from "@/shared/mob/spawn-timers";

/**
 * A number of seconds, typed — the respawn you're claiming, how early you want telling, or how long
 * one of your debuffs really lasts (`BuffPanel`).
 *
 * One component for all of them because they are the same act and the same syntax, and copies of it
 * would have drifted the moment one grew a rule. It reads `parseInterval` — `20m`, `4h`, `6m 30s`, a
 * bare number of seconds — which is the alert rules' syntax with this feature's own limits: hours and
 * days, and no thirty-minute ceiling. Borrowing the *cue* parser is what used to make a typed `4h`
 * unreadable and a typed `240m` quietly become 30m
 * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
 *
 * Unreadable text is refused *here* rather than saved and ignored, which is the opposite of the
 * call [ADR 0082](../../specs/decisions/0082-an-alert-can-be-scheduled.md) makes for a cue —
 * there, firing late beats never firing; here, a wrong number quietly outranks everything observed.
 */
export default function SecondsField({
  initial,
  placeholder,
  whenSet,
  whenBlank,
  onSave,
  onDone,
}: {
  initial?: number;
  placeholder: string;
  /** What committing a value would mean. */
  whenSet: string;
  /** What committing an empty box would mean — never "nothing happens"; it always falls back to something. */
  whenBlank: string;
  onSave: (seconds: number | null) => void;
  onDone: () => void;
}) {
  // `formatDuration`, not `formatInterval`: a box you type in has to round-trip, and the figure
  // rounds to whole minutes because nobody camps to the second. Right for reading, wrong for editing.
  const [text, setText] = useState(initial ? formatDuration(initial) : "");
  const seconds = parseInterval(text);
  const blank = !text.trim();
  const bad = !blank && (seconds === null || seconds <= 0);

  const submit = () => {
    if (bad) return;
    onSave(blank ? null : seconds);
    onDone();
  };

  // What the field would do if you committed it now, computed before the markup so the JSX stays
  // a shape rather than a decision.
  const hint = bad ? "Can't read that — try 22m, 4h, 6m 30s, or a number of seconds." : blank ? whenBlank : whenSet;

  return (
    <div className="spawn-edit">
      <input
        autoFocus
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
      />
      <button className="btn sm" disabled={bad} onClick={submit}>
        Save
      </button>
      {/* An explicit way out, offered only when there's something to undo. Emptying the box and
          saving does the same thing, but nobody discovers that — which made a figure you'd typed
          feel permanent even though clearing it always worked. A setting you can't see how to
          unset is a setting you can't change your mind about. */}
      {initial !== undefined && (
        <button
          className="btn ghost sm"
          onClick={() => {
            onSave(null);
            onDone();
          }}
        >
          Clear
        </button>
      )}
      <button className="btn ghost sm" onClick={onDone}>
        Cancel
      </button>
      <small className={bad ? "bad" : ""}>{hint}</small>
    </div>
  );
}
