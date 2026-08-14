"use client";
import { ALERT_ANIMATIONS, ALERT_POSITIONS } from "./AlertStyleFields";

import type { AlertStyle } from "@/shared/types";

/**
 * One look, as a line you can read: its name, what it actually looks like, who wears it, and the
 * button that opens the editor.
 *
 * It exists because the editor doesn't fit anywhere it was being put. Six controls is the right size
 * for *changing* a look and far too big for *choosing between* them — the swatches of three styles
 * side by side say nothing about which is which, and push everything else off the screen. So the
 * decision moved into the row: a colour dot, the sound, the position and the motion, which is the
 * whole of a look in a dozen characters and is what you actually scan for.
 *
 * `onRename`/`onRemove` are absent for the defaults, which are neither.
 */
export default function StyleRow({
  name,
  style,
  note,
  open,
  onOpen,
  onRename,
  onRemove,
}: {
  name: string;
  style: AlertStyle;
  /** Who wears it — the thing that decides whether editing it here is safe. */
  note: string;
  open: boolean;
  onOpen: () => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
}) {
  const position = ALERT_POSITIONS.find((p) => p.value === style.position)?.label ?? "Custom spot";
  const motion = ALERT_ANIMATIONS.find((a) => a.value === style.animation)?.label ?? style.animation;

  return (
    <div className={`style-row ${open ? "open" : ""}`}>
      {/* The dot is the fastest way to tell two looks apart, so it leads. */}
      <span className="style-dot" style={{ background: style.color }} aria-hidden />
      {onRename ? (
        <input className="field" style={{ flex: 1, minWidth: 0 }} value={name} onChange={(e) => onRename(e.target.value)} />
      ) : (
        <b className="small" style={{ flex: 1, minWidth: 0 }}>
          {name}
        </b>
      )}
      <span className="muted small style-what">
        {style.sound ? style.soundName : "silent"} · {position} · {motion}
        {style.flash ? " · flash" : ""}
      </span>
      <span className="muted small" style={{ whiteSpace: "nowrap" }}>
        {note}
      </span>
      {/* One button, and it's the same 🎨 that opens a rule's look — with the `on` state the rule
          row's buttons use, so "this is the open one" reads identically in both places. A caret
          beside it would be a second control for the one action. */}
      <button className={`btn ghost sm ${open ? "on" : ""}`} title={open ? "Close" : "Edit this look"} onClick={onOpen}>
        🎨
      </button>
      {onRemove && (
        <button
          className="btn ghost sm"
          title="Delete this style — rules wearing it fall back to the defaults"
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </div>
  );
}
