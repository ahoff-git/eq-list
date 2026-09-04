"use client";
import { PIN_TYPES, pinType, type PinKind } from "@/shared/map/pins";
import type { Loc } from "@/shared/map/types";
import LocField from "./LocField";

/** A boolean the map window owns, with the setter for it — `useState`'s pair, named. */
export type Flag = [on: boolean, set: (next: (cur: boolean) => boolean) => void];

/**
 * The map's toolbar: pick up a pin on the left, open a panel or share something on the right.
 *
 * Its own component because it was ninety lines of the map window, and because the right-hand half is
 * **eight near-identical buttons** — the same `wc`/`on` class dance, the same toggle — which is now a
 * table walked once. Adding a panel is a row in `PANELS` rather than another five-line button, and no
 * two of them can end up looking different by accident.
 *
 * Presentational: every flag belongs to the window, so the toolbar can't disagree with what's on screen.
 */
export default function MapToolbar({
  tool,
  onTool,
  onPlaceAt,
  onClearTrail,
  trailLength,
  killCount,
  userCount,
  connected,
  panels,
}: {
  /** The pin kind being held, `"move"` while dragging pins, or null. */
  tool: PinKind | "move" | null;
  onTool: (next: (cur: PinKind | "move" | null) => PinKind | "move" | null) => void;
  /** Drop a pin at a typed/pasted location rather than a map click — the held kind, or "star" with none held. */
  onPlaceAt: (loc: Loc) => void;
  onClearTrail: () => void;
  trailLength: number;
  killCount: number;
  userCount: number;
  connected: boolean;
  panels: { filters: Flag; travel: Flag; mobs: Flag; kills: Flag; users: Flag };
}) {
  const heldPin = tool && tool !== "move" ? tool : null;
  const moveMode = tool === "move";

  /**
   * The right-hand buttons, in the order they're read. `peer` marks the ones that only mean anything
   * with the room connected — a user list needs somebody to list.
   *
   * **The two share toggles that used to live here are gone.** ☣ (kill locations) and 🔗 (pins) were
   * views of `settings.share`, which the Peers tab also lists — one decision with two switches, in
   * two windows, and the map is the wrong place to reason about what leaves your machine
   * ([ADR 0146](../../../specs/decisions/0146-one-home-for-the-peer-network.md)). What the map keeps
   * is what the map *draws*.
   */
  const BUTTONS: { flag: Flag; title: string; glyph: string; peer?: boolean; className?: string }[] = [
    {
      flag: panels.filters,
      title: "What's drawn — floors or heights, your pins, the map's own labels, peers' pins",
      glyph: "👁",
    },
    {
      flag: panels.travel,
      title: "How to get from one zone to another — the route, and which ports to assume",
      glyph: "🧭",
    },
    {
      flag: panels.mobs,
      title: "What killing things here has taught us — drop rates and roam areas",
      glyph: "📖",
    },
    {
      flag: panels.kills,
      title: "Kills recorded here — the heatmap and its filters",
      glyph: `☠${killCount ? ` ${killCount}` : ""}`,
    },
    {
      flag: panels.users,
      title: "Who else is connected",
      glyph: `👥${userCount ? ` ${userCount}` : ""}`,
      peer: true,
    },
  ];

  return (
    <div className="map-toolbar no-drag">
      {PIN_TYPES.map((t) => (
        <button
          key={t.key}
          className={`pin-btn ${tool === t.key ? "held" : ""}`}
          style={{ color: t.color }}
          title={`${t.label} pin — pick up, then click the map to drop (click again to put away)`}
          onClick={() => onTool((cur) => (cur === t.key ? null : t.key))}
        >
          {t.glyph}
        </button>
      ))}
      <button
        className={`pin-btn ${moveMode ? "held" : ""}`}
        title="Move tool — drag your pins to reposition them"
        onClick={() => onTool((cur) => (cur === "move" ? null : "move"))}
      >
        ✥
      </button>
      <span className="muted small">
        {heldPin
          ? `holding ${pinType(heldPin).label} — click map to drop`
          : moveMode
            ? "move mode — drag a pin"
            : "pick a pin, or click to ping"}
      </span>
      <span className="row map-toolbar-paste" title="Type or paste a location — the y, x a /loc reports — to drop a pin there without clicking the map">
        <span aria-hidden>📍</span>
        <LocField placeholder="paste a location — y, x" onCommit={onPlaceAt} />
      </span>
      <span className="spacer" />
      <button
        className="wc"
        title="Clear the line drawn between your /loc positions"
        onClick={onClearTrail}
        disabled={trailLength === 0}
      >
        ∿
      </button>
      {BUTTONS.filter((b) => !b.peer || connected).map(({ flag: [on, set], title, glyph, className }) => (
        <button
          key={title}
          className={`wc ${className ?? ""} ${on ? "on" : ""}`}
          title={title}
          onClick={() => set((o) => !o)}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
