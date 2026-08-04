"use client";
import { ALERT_SOUNDS, playAlertSound } from "@/lib/alertSounds";
import type { AlertAnimation, AlertLocation, AlertPosition, AlertPositionValue, AlertStyle } from "@/shared/types";

/** Preset accent colors for the alert (border + flash). Any CSS color works; these are the picks. */
export const ALERT_COLORS = [
  { name: "Red", value: "#e5534b" },
  { name: "Orange", value: "#f0883e" },
  { name: "Gold", value: "#f0b429" },
  { name: "Green", value: "#46c86b" },
  { name: "Cyan", value: "#4bb3e5" },
  { name: "Purple", value: "#a371f7" },
  { name: "Pink", value: "#e567c4" },
  { name: "White", value: "#e6e8ec" },
];
export const ALERT_POSITIONS: { value: AlertPosition; label: string }[] = [
  { value: "top", label: "Top center" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "center", label: "Center" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];
export const ALERT_ANIMATIONS: { value: AlertAnimation; label: string }[] = [
  { value: "pulse", label: "Pulse" },
  { value: "wiggle", label: "Wiggle" },
  { value: "float", label: "Float" },
  { value: "none", label: "None" },
];

/**
 * The controls for one alert's look and sound — color, beep, where it shows, how it moves, how
 * long it lingers.
 *
 * Used twice: for the **defaults** in Settings, and for a single **watch** that has its own style
 * (see `AlertStyle`). One implementation, so a per-alert style can never offer less than the
 * default it overrides. The monitor is deliberately not here: there's one overlay window, so the
 * display it covers is a global choice rather than something a watch can differ on.
 */
export default function AlertStyleFields({
  style,
  onChange,
  locations = [],
}: {
  style: AlertStyle;
  onChange: (patch: Partial<AlertStyle>) => void;
  /** Custom spots (from `castAlerts.locations`) offered alongside the presets in Position. */
  locations?: AlertLocation[];
}) {
  // `astyle` carries the controls' own styling (swatch size, label column), so they look the
  // same wherever they're used — the rules used to hang off the defaults block's class, which
  // left a watch's own swatches as unstyled specks.
  return (
    <div className="astyle">
      <div className="row wrap astyle-row">
        <span className="astyle-label">Color</span>
        {ALERT_COLORS.map((c) => (
          <button
            key={c.value}
            className={`swatch ${style.color === c.value ? "on" : ""}`}
            style={{ background: c.value }}
            title={c.name}
            aria-label={c.name}
            onClick={() => onChange({ color: c.value })}
          />
        ))}
      </div>

      <div className="row astyle-row">
        <span className="astyle-label">Sound</span>
        <select className="field sm" value={style.soundName} onChange={(e) => onChange({ soundName: e.target.value })}>
          {ALERT_SOUNDS.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn ghost sm" title="Hear this sound" onClick={() => playAlertSound(style.soundName)}>
          ▶ Preview
        </button>
      </div>

      <div className="row wrap astyle-row">
        <span className="astyle-label">Position</span>
        <select
          className="field sm"
          value={style.position}
          onChange={(e) => onChange({ position: e.target.value as AlertPositionValue })}
        >
          {ALERT_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {locations.length > 0 && (
            <optgroup label="Custom spots">
              {locations.map((loc) => (
                <option key={loc.id} value={`loc:${loc.id}`}>
                  {loc.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="astyle-label" style={{ minWidth: 0 }}>
          Motion
        </span>
        <select
          className="field sm"
          value={style.animation}
          onChange={(e) => onChange({ animation: e.target.value as AlertAnimation })}
        >
          {ALERT_ANIMATIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row astyle-row">
        <span className="astyle-label">Duration</span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={Math.round(style.durationMs / 1000)}
          onChange={(e) => onChange({ durationMs: Number(e.target.value) * 1000 })}
        />
        <span className="muted small">{Math.round(style.durationMs / 1000)}s</span>
      </div>
    </div>
  );
}
