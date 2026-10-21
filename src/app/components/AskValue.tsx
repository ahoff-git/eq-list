"use client";
import { useState } from "react";

/**
 * A number the app can't work out on its own, asked for at the point it's needed.
 *
 * Some figures simply aren't in the log — your current experience into the level being
 * the first — so instead of showing a permanent "—", the gap itself becomes the
 * affordance: hover to find out *why* it's needed, click to fill it in. Kept generic
 * because this won't be the last such gap.
 */
export default function AskValue({
  prompt,
  why,
  suffix,
  initial,
  min = 0,
  max = 100,
  step = 0.1,
  className,
  onSubmit,
}: {
  /** Short call to action, e.g. "set XP %". */
  prompt: string;
  /** Shown on hover: what it's for, and what the app does with it afterwards. */
  why: string;
  suffix?: string;
  initial?: number;
  min?: number;
  max?: number;
  /** The input's step — a whole count wants 1. */
  step?: number;
  /** Extra classes on the closed button, so a figure keeps the look of the text it replaces. */
  className?: string;
  onSubmit: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial?.toString() ?? "");

  function submit() {
    const value = Number(text);
    if (Number.isFinite(value)) onSubmit(Math.min(max, Math.max(min, value)));
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        className={className ? `ask ${className}` : "ask"}
        title={why}
        onClick={() => {
          setText(initial?.toString() ?? "");
          setOpen(true);
        }}
      >
        {prompt}
      </button>
    );
  }

  return (
    <span className="ask-open" title={why}>
      <input
        className="field sm"
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={submit}
      />
      {suffix}
    </span>
  );
}
