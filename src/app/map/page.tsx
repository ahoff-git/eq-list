"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCurrentZone, usePlayerTrail, useSettings, useWatcherStatus } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import MapPanel, { type RenderPin } from "../components/MapPanel";
import MapKey from "../components/MapKey";
import PinButton from "../components/PinButton";
import { useCalibration } from "@/lib/map/useCalibration";
import { useAwariRoom } from "@/lib/map/useAwariRoom";
import { baseZones, findZone, sortZones } from "@/shared/map/zones";
import { PIN_TYPES, pinType, type MapPin, type PinKind } from "@/shared/map/pins";
import { characterFromLogFile } from "@/shared/log-parser";
import { setRendererDebug } from "@/shared/logging";

/**
 * The sibling map window (route `/map`, opened by the main window's 🗺 button).
 * Follows the log's current zone (with a dropdown to view any mapped zone), plots
 * your location/peers, and lets you drop pins from a toolbar (pick a pin up, click
 * the map to place; with none held, a click pings). Pins persist in localStorage and
 * can be shared to peers over awari. Frameless: the titlebar is the drag handle.
 */
export default function MapWindow() {
  const currentZone = useCurrentZone();
  // The viewed-zone override persists so reopening the map returns to the zone you were
  // looking at (blank = follow your current zone).
  const [override, setOverride] = usePersistentState<string | null>(STORAGE_KEYS.mapZone, null);
  const zoneName = override ?? currentZone ?? "";
  const zone = useMemo(() => (zoneName ? findZone(zoneName, baseZones) : undefined), [zoneName]);
  const zoneOptions = useMemo(() => sortZones(baseZones).filter((z) => z.mapImg), []);
  const zoneKey = zone?.name;

  const settings = useSettings();

  // Mirror the tray's "Debug logging" toggle into the renderer's log gate, so
  // `createLogger(...).debug()` (e.g. the ping broadcast) prints to this window's console.
  useEffect(() => {
    setRendererDebug(settings?.debug ?? false);
  }, [settings?.debug]);

  // Travelling puts the map back on you (on by default): picking a zone by hand — or
  // jumping to one from another window — holds only until the log says you've actually
  // zoned. Turn it off to keep studying one map while you travel.
  const [followZone, setFollowZone] = usePersistentState(STORAGE_KEYS.mapFollowZone, true);
  const seenZoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentZone) return;
    const previous = seenZoneRef.current;
    seenZoneRef.current = currentZone;
    // Only a *change* clears it, so the toggle can't fight the persisted override on load.
    if (followZone && previous !== null && previous !== currentZone) setOverride(null);
  }, [currentZone, followZone, setOverride]);

  // The `/loc` trail (the line drawn between your logged positions), owned here so the
  // toolbar can clear it; it also resets itself when you zone.
  const trail = usePlayerTrail(200);

  // A clickable location elsewhere (e.g. a mob's zone or coordinate) asks us to view
  // a zone — and, when a coordinate came along, drop a marker pin there (deduped).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.map.onViewZone(({ zone, loc, label }) => {
      const zname = findZone(zone, baseZones)?.name ?? zone;
      setOverride(zname); // canonical name so the dropdown reflects it
      if (!loc) return;
      setPins((prev) =>
        prev.some((p) => p.zone === zname && p.y === loc.y && p.x === loc.x && p.title === label)
          ? prev
          : [...prev, { id: crypto.randomUUID(), kind: "star", zone: zname, y: loc.y, x: loc.x, title: label }],
      );
    });
    // Subscribe once — the only "deps" are stable state setters (setOverride/setPins).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map window has its own always-on-top pin and a key/legend toggle (on by default);
  // both persist so the window comes back the way you left it.
  const [pinned, setPinned] = usePersistentState(STORAGE_KEYS.mapPinned, true);
  const [showKey, setShowKey] = usePersistentState(STORAGE_KEYS.mapShowKey, true);
  useEffect(() => {
    api()?.win.setAlwaysOnTop(pinned);
  }, [pinned]);

  // Dev-only calibration (Debug logging on → 📐 button → calibration mode + grid).
  const debug = settings?.debug ?? false;
  const [calibrateOn, setCalibrateOn] = useState(false);
  const canCalibrate = debug && !!zone?.size;
  const calibrating = canCalibrate && calibrateOn;
  const cal = useCalibration(zone, calibrating);

  // Peer networking (awari). The WebRTC connection lives in the main window
  // (AwariHost); here we just read the brokered peer stream and send our pings/pins.
  // `connectPeers` gates the sharing UI (intent); the room self-clears if it drops.
  const watcher = useWatcherStatus();
  const connected = settings?.connectPeers ?? false;
  const myName = (settings?.playerName || "").trim() || characterFromLogFile(watcher.file) || "";
  const room = useAwariRoom({ name: myName });
  const broadcastPins = room.sharePins;

  // ── Pins ──────────────────────────────────────────────────────────────────
  const [pins, setPins] = usePersistentState<MapPin[]>(STORAGE_KEYS.mapPins, []);
  // The active toolbar tool: a pin kind to drop, "move" to drag pins, or none.
  const [tool, setTool] = useState<PinKind | "move" | null>(null);
  const heldPin = tool && tool !== "move" ? (tool as PinKind) : null;
  const moveMode = tool === "move";
  const [hiddenKinds, setHiddenKinds] = useState<Set<PinKind>>(new Set());
  const [hiddenSharers, setHiddenSharers] = useState<Set<string>>(new Set());
  const [sharePinsOn, setSharePinsOn] = usePersistentState(STORAGE_KEYS.mapSharePins, false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);

  // Broadcast (or un-share) pins to peers when connected + sharing.
  useEffect(() => {
    if (!connected) return;
    broadcastPins(sharePinsOn ? pins : []);
  }, [connected, sharePinsOn, pins, broadcastPins]);

  const zoneMatch = (z: string) => !!zoneKey && findZone(z, baseZones)?.name === zoneKey;

  // Peers/pings/pins filtered to the viewed zone (and pins to the visible kinds).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const peers = useMemo(() => room.peers.filter((p) => zoneMatch(p.zone)), [room.peers, zoneKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pings = useMemo(() => room.pings.filter((p) => zoneMatch(p.zone)), [room.pings, zoneKey]);
  // Distinct people currently sharing pins — each gets its own visibility toggle.
  const sharers = useMemo(
    () => [...new Set(room.peerPins.map((p) => p.by).filter((b): b is string => !!b))],
    [room.peerPins],
  );

  const renderPins = useMemo<RenderPin[]>(() => {
    const mk = (p: MapPin, mine: boolean): RenderPin => {
      const t = pinType(p.kind);
      return {
        id: p.id,
        y: p.y,
        x: p.x,
        color: t.color,
        glyph: t.glyph,
        label: mine ? t.label : `${t.label} · ${p.by ?? "peer"}`,
        title: p.title,
        note: p.note,
        mine,
      };
    };
    const local = pins.filter((p) => zoneMatch(p.zone) && !hiddenKinds.has(p.kind)).map((p) => mk(p, true));
    const peer = room.peerPins
      .filter((p) => zoneMatch(p.zone) && !hiddenKinds.has(p.kind) && !hiddenSharers.has(p.by ?? ""))
      .map((p) => mk(p, false));
    return [...local, ...peer];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, room.peerPins, zoneKey, hiddenKinds, hiddenSharers]);

  function placePin(eq: { y: number; x: number }, clientX: number, clientY: number) {
    if (!heldPin || !zoneKey) return;
    const pin: MapPin = { id: crypto.randomUUID(), kind: heldPin, zone: zoneKey, y: eq.y, x: eq.x };
    setPins((prev) => [...prev, pin]);
    setSelected({ id: pin.id, x: clientX, y: clientY }); // open the editor to title/note it
  }
  function updatePin(id: string, patch: Partial<MapPin>) {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removePin(id: string) {
    setPins((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
  }
  function toggleSharer(name: string, visible: boolean) {
    setHiddenSharers((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  const selectedPin = selected ? pins.find((p) => p.id === selected.id) : undefined;
  function clearZonePins() {
    setPins((prev) => prev.filter((p) => !zoneMatch(p.zone)));
    setLayersOpen(false);
  }
  function toggleKind(kind: PinKind, visible: boolean) {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <div className="map-win">
      <div className="titlebar">
        <h1>
          <span className="mark">🗺</span> {zone?.name ?? zoneName ?? "Map"}
        </h1>
        {connected && (
          <span className="muted small" title="Peers sharing their location in this zone">
            · {peers.length} nearby
          </span>
        )}
        <span className="spacer" />
        <select
          className="map-zone-select no-drag"
          value={override ?? ""}
          onChange={(e) => setOverride(e.target.value || null)}
          title="View a zone (blank = follow your current zone)"
        >
          <option value="">Follow current{currentZone ? ` · ${currentZone}` : ""}</option>
          {/* The viewed zone has no map — keep the dropdown showing it, flagged. */}
          {override && !zoneOptions.some((z) => z.name === override) && (
            <option value={override}>{override} (no map)</option>
          )}
          {zoneOptions.map((z) => (
            <option key={z.name} value={z.name}>
              {z.name}
            </option>
          ))}
        </select>
        <label className="map-follow no-drag" title="Snap the map to your zone when you travel">
          <input type="checkbox" checked={followZone} onChange={(e) => setFollowZone(e.target.checked)} />
          follow
        </label>
        <div className="win-controls no-drag">
          {canCalibrate && (
            <button
              className={`wc ${calibrating ? "on" : ""}`}
              title="Calibrate this map's alignment"
              onClick={() => setCalibrateOn((c) => !c)}
            >
              📐
            </button>
          )}
          {zone?.mapKeyImg && (
            <button className={`wc ${showKey ? "on" : ""}`} title="Toggle the map key / legend" onClick={() => setShowKey((s) => !s)}>
              ▤
            </button>
          )}
          <PinButton pinned={pinned} onToggle={() => setPinned((p) => !p)} />
          <button className="wc" title="Close map" onClick={() => api()?.win.close()}>
            ✕
          </button>
        </div>
      </div>

      {/* Pin toolbar: pick a pin up (click map to drop), or Move to drag pins. */}
      <div className="map-toolbar no-drag">
        {PIN_TYPES.map((t) => (
          <button
            key={t.key}
            className={`pin-btn ${tool === t.key ? "held" : ""}`}
            style={{ color: t.color }}
            title={`${t.label} pin — pick up, then click the map to drop (click again to put away)`}
            onClick={() => setTool((cur) => (cur === t.key ? null : t.key))}
          >
            {t.glyph}
          </button>
        ))}
        <button
          className={`pin-btn ${moveMode ? "held" : ""}`}
          title="Move tool — drag your pins to reposition them"
          onClick={() => setTool((cur) => (cur === "move" ? null : "move"))}
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
        <span className="spacer" />
        <button
          className="wc"
          title="Clear the line drawn between your /loc positions"
          onClick={trail.clear}
          disabled={trail.points.length === 0}
        >
          ∿
        </button>
        <button className={`wc ${layersOpen ? "on" : ""}`} title="Show / hide pin types" onClick={() => setLayersOpen((o) => !o)}>
          👁
        </button>
        {connected && (
          <button
            className={`wc ${usersOpen ? "on" : ""}`}
            title="Who else is connected"
            onClick={() => setUsersOpen((o) => !o)}
          >
            👥{room.users.length ? ` ${room.users.length}` : ""}
          </button>
        )}
        {connected && (
          <button className={`wc pin ${sharePinsOn ? "on" : ""}`} title="Share my pins with peers" onClick={() => setSharePinsOn((s) => !s)}>
            🔗
          </button>
        )}
      </div>

      {usersOpen && connected && (
        <div className="map-users no-drag">
          <div className="muted small">Connected users</div>
          {room.users.length === 0 ? (
            <p className="muted small">
              Nobody else is in the room yet. Anyone else running EQ List with peer networking on
              shows up here.
            </p>
          ) : (
            room.users.map((u) => (
              <div className="user-row" key={u.peerId}>
                <span
                  className={`dot ${u.sharingLoc ? "on" : ""}`}
                  title={u.sharingLoc ? "Sharing their location" : "Connected, not sharing location"}
                />
                <span className="u-name">{u.name}</span>
                {u.zone ? (
                  <button
                    className="btn ghost sm"
                    title={`View ${u.zone}`}
                    onClick={() => setOverride(findZone(u.zone, baseZones)?.name ?? u.zone)}
                  >
                    {u.zone}
                  </button>
                ) : (
                  <span className="muted small">zone unknown</span>
                )}
                {u.pins > 0 && <span className="muted small">· {u.pins} pin{u.pins === 1 ? "" : "s"}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {layersOpen && (
        <div className="pin-layers no-drag">
          <div className="muted small">Pin types</div>
          {PIN_TYPES.map((t) => (
            <label key={t.key} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={!hiddenKinds.has(t.key)} onChange={(e) => toggleKind(t.key, e.target.checked)} />
              <span style={{ color: t.color }}>{t.glyph}</span> {t.label}
            </label>
          ))}
          {sharers.length > 0 && (
            <>
              <div className="muted small" style={{ marginTop: 4 }}>Shared by</div>
              {sharers.map((name) => (
                <label key={name} className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={!hiddenSharers.has(name)} onChange={(e) => toggleSharer(name, e.target.checked)} />
                  {name}
                </label>
              ))}
            </>
          )}
          <button className="btn ghost sm" onClick={clearZonePins} disabled={!zoneKey} style={{ marginTop: 4 }}>
            Clear pins in {zone?.name ?? "zone"}
          </button>
        </div>
      )}

      <div className="map-body">
        {zone?.mapImg ? (
          <MapPanel
            zone={zone}
            redrawKey={cal.tick}
            trail={trail.points}
            peers={peers}
            pings={pings}
            pins={renderPins}
            placing={heldPin !== null}
            onPlace={placePin}
            onPing={connected && zoneKey ? (eq) => room.sendPing(eq, zoneKey) : undefined}
            onPinClick={(pin, x, y) => {
              if (pin.mine) setSelected({ id: pin.id, x, y });
            }}
            moveMode={moveMode}
            onPinMove={(id, eq) => updatePin(id, { y: eq.y, x: eq.x })}
            showGrid={calibrating}
          />
        ) : (
          <div className="map-empty">
            <p className="map-empty-title">
              {zoneName ? `No map configured for ${zone?.name ?? zoneName}` : "No zone selected"}
            </p>
            <p className="muted small">
              {zoneName
                ? "Pick a mapped zone from the dropdown above"
                : "Your zone will appear once the log reports it — or pick one above"}
              {debug ? " · or add it to zones.ts and calibrate (📐)." : "."}
            </p>
            <p className="muted small">
              Markers you jump to here are saved and will appear once this zone has a calibrated map.
            </p>
            {(zone?.name || zoneName) && (
              <button className="btn sm" onClick={() => api()?.map.openP99(zone?.name ?? zoneName)}>
                View {zone?.name ?? zoneName} on Project 1999 ↗
              </button>
            )}
          </div>
        )}
        {showKey && zone?.mapKeyImg && <MapKey src={zone.mapKeyImg} alt={`${zone.name} map key`} />}
      </div>

      {selected && selectedPin && (
        <div className="pin-menu" style={{ left: selected.x, top: selected.y }}>
          <div className="pin-menu-head">
            <span style={{ color: pinType(selectedPin.kind).color }}>{pinType(selectedPin.kind).glyph}</span>
            {pinType(selectedPin.kind).label}
          </div>
          <input
            className="field"
            placeholder="Title (shown on the map)"
            value={selectedPin.title ?? ""}
            onChange={(e) => updatePin(selectedPin.id, { title: e.target.value })}
            autoFocus
          />
          <textarea
            className="field"
            placeholder="Note (shown on hover)"
            rows={2}
            value={selectedPin.note ?? ""}
            onChange={(e) => updatePin(selectedPin.id, { note: e.target.value })}
          />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={() => removePin(selectedPin.id)}>
              Remove
            </button>
            <span className="spacer" />
            <button className="btn sm" onClick={() => setSelected(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {calibrating && (
        <div className="map-cal">
          <div className="map-cal-head">
            <span>Calibrating {zone?.name}</span>
            <span className="map-cal-step">Step size: {cal.step}</span>
          </div>
          <code className="map-cal-values">{cal.values}</code>
          <span className="muted small">
            <kbd>W/A/S/D</kbd> resize · <kbd>I/J/K/L</kbd> offset · <kbd>−</kbd>/<kbd>=</kbd> step size.
            Stand somewhere, <kbd>/loc</kbd>, then nudge until the grid/dot lines up; paste the values
            into zones.ts.
          </span>
        </div>
      )}
    </div>
  );
}
