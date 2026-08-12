"use client";
import { api } from "@/lib/api";
import { MAP_UI_SCALE } from "@/shared/constants";
import OpacityButton from "./OpacityButton";
import PinButton from "./PinButton";
import ScaleButtons from "./ScaleButtons";
import WindowButtons from "./WindowButtons";
import ZonePicker from "./ZonePicker";
import { stockOnly, type MapSource } from "@/shared/map/map-sources";
import type { Zone } from "@/shared/map/types";

/**
 * The map window's title bar: what you're looking at on the left, what to look at on the right.
 *
 * It is also the window's **drag handle**, which is why every control in it carries `no-drag` — a
 * missing one makes that control impossible to click, because the press moves the window instead. Kept
 * together in one component so that rule applies in one place.
 *
 * Two things are stated rather than left to be noticed: a zone borrowed from another pack
 * ([ADR 0063](../../../specs/decisions/0063-a-zone-the-pack-lacks-is-borrowed.md)) — otherwise "this
 * map looks different" is a mystery — and how many floors of a multi-storey map are showing, which is
 * the one filter that changes what the map *is* rather than what's drawn on it.
 */
export default function MapTitlebar({
  zone,
  zoneName,
  sources,
  sourceId,
  sourceLabel,
  onSource,
  mapsDir,
  zoneOptions,
  pickedZone,
  currentZone,
  onZone,
  peerCount,
  connected,
  floorCount,
  shownFloors,
  filtered,
  onFloors,
  followZone,
  onFollowZone,
  scale,
  onScale,
  opaque,
  opacity,
  onOpaque,
  pinned,
  onPinned,
}: {
  zone: Zone | undefined;
  zoneName: string;
  sources: MapSource[];
  sourceId: string;
  sourceLabel: string;
  onSource: (id: string) => void;
  /** Where the map files were found, for the picker's hover. */
  mapsDir?: string;
  zoneOptions: Zone[];
  /** The zone name the picker shows (blank while following your own zone). */
  pickedZone: string;
  currentZone: string | null;
  onZone: (zone: string | null) => void;
  peerCount: number;
  connected: boolean;
  /** Storeys this map labels. The floor button only appears when there's more than one. */
  floorCount: number;
  shownFloors: number;
  /** Whether a height filter is on at all — "3/5" rather than "all". */
  filtered: boolean;
  /** Open the 👁 panel, where the picking actually happens. */
  onFloors: () => void;
  followZone: boolean;
  onFollowZone: (on: boolean) => void;
  scale: number;
  onScale: (next: number) => void;
  /** Whether the transient "fully opaque" override is on, and the saved value it flips back to. */
  opaque: boolean;
  opacity: number;
  onOpaque: () => void;
  pinned: boolean;
  onPinned: () => void;
}) {
  const drawnBy = sources.find((s) => s.id === zone?.source)?.label ?? zone?.source;
  // Two reasons a zone comes from elsewhere, and they mean opposite things about your pack: it hasn't
  // got this zone, or it has one we deliberately don't use (`STOCK_ONLY_ZONES`).
  const why = stockOnly(zone?.file)
    ? `This zone is always drawn from ${drawnBy} — the game's own map for it is the one to use`
    : `${sourceLabel} has no map for this zone, so it's drawn from ${drawnBy}`;

  return (
    <div className="titlebar">
      <h1>
        <span className="mark">🗺</span> {zone?.name ?? zoneName ?? "Map"}
      </h1>
      {zone?.source && zone.source !== sourceId && (
        <span className="muted small" title={why}>
          · from {drawnBy}
        </span>
      )}
      {connected && (
        <span className="muted small" title="Peers sharing their location in this zone">
          · {peerCount} nearby
        </span>
      )}
      <span className="spacer" />
      <select
        className="map-source-select no-drag"
        value={sourceId}
        onChange={(e) => onSource(e.target.value)}
        title={
          "Which set of maps to draw.\n\n" +
          "• Bundled images — the P99 scans that ship with EQ List. Hand-calibrated, and only ~15 zones.\n" +
          "• Game maps — the .txt maps EverQuest itself draws, from <EverQuest>\\maps\\. Every zone, with labels, and no calibration needed.\n" +
          "• A pack — any subfolder of maps\\ holding .txt maps: unzip Brewall's into <EverQuest>\\maps\\Brewall\\, Goodurden's into its own subfolder, and it appears here.\n\n" +
          (mapsDir ? `Reading: ${mapsDir}` : "No maps folder found — it's located from your log folder in Settings (<EverQuest>\\Logs).")
        }
      >
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.files.length ? ` · ${s.files.length}` : ""}
          </option>
        ))}
      </select>
      <ZonePicker zones={zoneOptions} value={pickedZone} currentZone={currentZone} onPick={onZone} />
      {/* One map file is one zone and holds every storey at once, so a dropdown could only ever show
          one floor at a time. The picking happens in the 👁 panel; this says what's showing and takes
          you there. */}
      {floorCount > 1 && (
        <button
          className={`wc no-drag ${filtered ? "on" : ""}`}
          title="Which floors are drawn — the map file holds them all at once, as the game draws it."
          onClick={onFloors}
        >
          ⌂ {filtered ? `${shownFloors}/${floorCount}` : "all"}
        </button>
      )}
      <label className="follow-toggle no-drag" title="Snap the map to your zone when you travel">
        <input type="checkbox" checked={followZone} onChange={(e) => onFollowZone(e.target.checked)} />
        follow
      </label>
      <div className="win-controls no-drag">
        {/* The map's own scale, separate from the main window's — see `mapFontScale`. */}
        <ScaleButtons scale={scale} onScale={onScale} what="map" range={MAP_UI_SCALE} />
        {/* The saved opacity is app-wide; this flips *this* window solid — see `useWindowOpacity`. */}
        <OpacityButton opaque={opaque} opacity={opacity} onToggle={onOpaque} />
        <PinButton pinned={pinned} onToggle={onPinned} />
        {/* Closed for real, not hidden — the map is opened on demand. */}
        <WindowButtons dismissTitle="Close map" dismiss={() => api()?.win.close()} />
      </div>
    </div>
  );
}
