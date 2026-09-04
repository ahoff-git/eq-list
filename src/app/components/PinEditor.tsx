"use client";
import { PIN_TYPES, pinType, type MapPin } from "@/shared/map/pins";
import LocField from "./LocField";

/**
 * The little editor that opens over a pin you clicked: what kind it is, where it sits, what to
 * call it, what to remember about it.
 *
 * Positioned at the click rather than docked, because it's about **that** pin and a panel elsewhere on
 * screen would make you look away from it. Title and note are separate because they're shown
 * differently — the title is drawn on the map, the note waits for a hover — so a long note doesn't turn
 * the map into a wall of text.
 */
export default function PinEditor({
  pin,
  at,
  onChange,
  onRemove,
  onDone,
}: {
  pin: MapPin;
  /** Where to put it, in window pixels — the click that opened it. */
  at: { x: number; y: number };
  onChange: (patch: Partial<MapPin>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const kind = pinType(pin.kind);
  return (
    <div className="pin-menu" style={{ left: at.x, top: at.y }}>
      <div className="pin-menu-head">
        <span style={{ color: kind.color }}>{kind.glyph}</span>
        {kind.label}
      </div>
      <div className="row pin-menu-kinds">
        {PIN_TYPES.map((t) => (
          <button
            key={t.key}
            className={`pin-btn ${pin.kind === t.key ? "held" : ""}`}
            style={{ color: t.color }}
            title={t.label}
            onClick={() => onChange({ kind: t.key })}
          >
            {t.glyph}
          </button>
        ))}
      </div>
      <label className="row pin-menu-loc" title="Type or paste a location (the same y, x a /loc reports) to move the pin there — or drag it with the map's move tool.">
        <span className="muted small">at</span>
        <LocField value={{ y: pin.y, x: pin.x }} onCommit={(loc) => onChange(loc)} />
      </label>
      <input
        className="field"
        placeholder="Title (shown on the map)"
        value={pin.title ?? ""}
        onChange={(e) => onChange({ title: e.target.value })}
        autoFocus
      />
      <textarea
        className="field"
        placeholder="Note (shown on hover)"
        rows={2}
        value={pin.note ?? ""}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost sm" onClick={onRemove}>
          Remove
        </button>
        <span className="spacer" />
        <button className="btn sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
