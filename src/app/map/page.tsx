"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  useCurrentZone,
  useKills,
  useMaximized,
  usePlayerLoc,
  usePlayerTrail,
  useRendererDebug,
  useSettings,
  useUiScale,
  useWatcherStatus,
} from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import MapPanel, { type RenderKill, type RenderPin } from "../components/MapPanel";
import KillList from "../components/KillList";
import MobKnowledgePanel from "../components/MobKnowledge";
import { DEFAULT_KILL_FILTERS, filterKills, type KillFilters } from "@/shared/kill-filters";
import MapKey from "../components/MapKey";
import PinButton from "../components/PinButton";
import MaximizeButton from "../components/MaximizeButton";
import ScaleButtons from "../components/ScaleButtons";
import { useCalibration } from "@/lib/map/useCalibration";
import { useMapSource, useVectorMap } from "@/lib/map/useMapSource";
import { useAwariRoom } from "@/lib/map/useAwariRoom";
import { collapseLayers, findZone, layerLabel, onLayer, zoneLayers } from "@/shared/map/zones";
import { IMAGE_SOURCE } from "@/shared/map/map-sources";
import { detectFloors, floorAt } from "@/shared/map/eqmap";
import { poiKindSummary, type PoiKind } from "@/shared/map/poi-kinds";
import { PIN_TYPES, pinType, type MapPin, type PinKind } from "@/shared/map/pins";
import { characterFromLogFile } from "@/shared/log-parser";
import { confidenceTier, PLOTTABLE_CONFIDENCE } from "@/shared/kill-confidence";
import { MAP_UI_SCALE } from "@/shared/constants";

/**
 * The sibling map window (route `/map`, opened by the main window's 🗺 button).
 * Follows the log's current zone (with a dropdown to view any mapped zone), plots
 * your location/peers, and lets you drop pins from a toolbar (pick a pin up, click
 * the map to place; with none held, a click pings). Pins persist in localStorage and
 * can be shared to peers over awari. Frameless: the titlebar is the drag handle.
 *
 * A zone with several maps (RunnyEye's four floors) is listed **once** in the dropdown
 * and gets a second **layer** dropdown beside it. Pins and pings are stamped with the
 * layer they were made on; everything read out of the log — your position, peers, kills —
 * stays zone-wide, because the log never says which floor you're on.
 */
export default function MapWindow() {
  const currentZone = useCurrentZone();
  // Your last `/loc`. Needed early: it says which floor you're on, and it's the coordinate a
  // calibration fix is paired with.
  const loc = usePlayerLoc();
  // Squares the window's corners while maximized (see globals.css).
  const maximized = useMaximized();
  // Which set of maps we're drawing, and the zones it offers — the bundled images, or a
  // folder of the game's own map files. Persisted; everything below works off `zones`
  // rather than the bundled catalogue, so both kinds of source flow through one path.
  const { sources, sourceId, setSourceId, mapsDir, zones } = useMapSource();
  // The viewed-zone override persists so reopening the map returns to the zone you were
  // looking at (blank = follow your current zone).
  const [override, setOverride] = usePersistentState<string | null>(STORAGE_KEYS.mapZone, null);
  // Which floor of a multi-layer zone we're looking at. Persisted like the zone override,
  // and validated below rather than reset by an effect.
  const [layerPick, setLayerPick] = usePersistentState<number | null>(STORAGE_KEYS.mapLayer, null);
  const zoneName = override ?? currentZone ?? "";
  // The maps we have for this place. More than one means the zone has layers (RunnyEye's
  // four floors), which is what puts the layer dropdown on screen.
  const layers = useMemo(() => zoneLayers(zoneName, zones), [zoneName, zones]);
  // A layer pick belongs to the zone it was made in, so travelling to a zone that doesn't
  // have that layer falls back to the first map instead of showing nothing.
  const pickedLayer = layers.some((z) => z.layer === layerPick) ? layerPick : null;
  const zone = useMemo(
    () => (zoneName ? findZone(zoneName, zones, pickedLayer ?? undefined) : undefined),
    [zoneName, zones, pickedLayer],
  );
  // A file-backed zone's geometry, loaded through the main process (null for image zones).
  const vector = useVectorMap(sourceId, zone);
  /**
   * Storeys the map's author labelled ("Level 3", "2nd Floor"). A vector map holds every floor
   * at once — which is what the game draws — so these let you isolate one. Read from the file's
   * own labels, never guessed, so a zone that doesn't name its levels simply has none.
   */
  const floors = useMemo(() => (vector ? detectFloors(vector) : []), [vector]);
  // The same persisted pick serves both kinds of layer: a zone is either several map files or
  // one file with floors, never both.
  const floorPick = floors.some((f) => f.layer === layerPick) ? layerPick : null;
  const floor = floors.find((f) => f.layer === floorPick);
  /** The floor you're standing on, from your `/loc` height — marked in the picker. */
  const yourFloor = loc ? floorAt(floors, loc.z) : undefined;
  /**
   * Is there a map to draw? A file-backed zone counts before its geometry arrives — it's in
   * the list because the file is on disk — so switching zones shows a blank map for a moment
   * rather than flashing "no map for this zone".
   */
  const hasMap = !!zone?.mapImg || !!zone?.file;
  const sourceLabel = sources.find((s) => s.id === sourceId)?.label ?? "maps";
  /**
   * The layer actually on screen, and what markers are filed under and filtered by — not
   * `pickedLayer`, so "no pick yet" and "picked layer 1" mean the same thing. Three cases:
   * a floored map showing one storey (its number), a floored map showing all of them
   * (`null`), or an image zone, where the layer is simply which map file is open.
   */
  const viewLayer = floors.length ? floorPick : zone?.layer;
  // One option per place: layered zones are collapsed so a zone is never listed twice.
  const zoneOptions = useMemo(() => collapseLayers(zones), [zones]);
  // The dropdown's options are places, so its value is a zone *name*; a saved pick may be
  // a key (or a zone we have no map for), so resolve it back to a name where we can.
  const selectValue = override ? (findZone(override, zones)?.name ?? override) : "";
  /**
   * The zone we're scoped to, canonical where we can be. **Not** `zone?.name`: `zone` is the
   * *map* we have for the place, and plenty of real zones have no bundled map. Keying data off
   * the map object made every "here" panel fall back to `undefined` — which the main process
   * reads as "every zone" — so standing anywhere unmapped quietly showed you the whole kill
   * log and every mob you'd ever seen, under headings that said "here".
   */
  const zoneKey = zone?.name ?? zoneName ?? undefined;
  /**
   * Is `z` the zone currently on screen? Declared here, above every user: it was previously
   * defined further down and called from `renderKills`'s memo, which only *reached* the call
   * when a peer actually shared kills — so the temporal dead zone crashed the whole map
   * window the first time someone did, and never otherwise. Stable so the memos below can
   * depend on it honestly instead of silencing the lint rule.
   */
  const zoneMatch = useCallback(
    (z: string) => !!zoneKey && (findZone(z, zones)?.name ?? z) === zoneKey,
    [zoneKey, zones],
  );
  // The zone list, reachable from the subscribe-once effects below without making them
  // re-subscribe every time a source finishes loading.
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  const settings = useSettings();
  // The map's own scale, separate from the main window's (see `useUiScale`).
  useUiScale(settings?.overlay.mapFontScale, MAP_UI_SCALE);
  useRendererDebug();

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
      const zname = findZone(zone, zonesRef.current)?.name ?? zone;
      setOverride(zname); // canonical name so the dropdown reflects it
      if (!loc) return;
      // Unlayered like a mob's roam centre: the coordinate came from somewhere that has
      // no idea which floor it's on, so the marker shows on every layer.
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

  // Dev-only calibration (Debug logging on → 📐 button → calibration mode + grid). Any
  // zone with a map can be calibrated, including one that has never been — that's the case
  // the click flow exists for.
  const debug = settings?.debug ?? false;
  const [calibrateOn, setCalibrateOn] = useState(false);
  const canCalibrate = debug && !!zone?.mapImg;
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
  // Which kinds of *map* label to leave off — a busy zone is mostly labels, and which ones matter
  // depends on what you're doing there. Persisted as an array, since a Set isn't JSON.
  const [hiddenPoiList, setHiddenPoiList] = usePersistentState<PoiKind[]>(STORAGE_KEYS.mapHiddenPoiKinds, []);
  const hiddenPoiKinds = useMemo(() => new Set(hiddenPoiList), [hiddenPoiList]);
  /** The label kinds this map actually has, with the color they wear here. */
  const poiKinds = useMemo(() => (vector ? poiKindSummary(vector.pois) : []), [vector]);
  const togglePoiKind = (kind: PoiKind, visible: boolean) =>
    setHiddenPoiList((prev) => (visible ? prev.filter((k) => k !== kind) : [...new Set([...prev, kind])]));
  const [hiddenSharers, setHiddenSharers] = useState<Set<string>>(new Set());
  const [sharePinsOn, setSharePinsOn] = usePersistentState(STORAGE_KEYS.mapSharePins, false);
  const [pinTypesOpen, setPinTypesOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [killsOpen, setKillsOpen] = usePersistentState(STORAGE_KEYS.mapKillsOpen, false);
  const [mobsOpen, setMobsOpen] = usePersistentState(STORAGE_KEYS.mapMobsOpen, false);
  const [killFilters, setKillFilters] = useState<KillFilters>(DEFAULT_KILL_FILTERS);
  const [shareKillsOn, setShareKillsOn] = usePersistentState(STORAGE_KEYS.mapShareKills, false);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);

  // Broadcast (or un-share) pins to peers when connected + sharing.
  useEffect(() => {
    if (!connected) return;
    broadcastPins(sharePinsOn ? pins : []);
  }, [connected, sharePinsOn, pins, broadcastPins]);

  // Kills are re-read when a new one could have landed (the current zone's kill count moves
  // with play, so the trail's length is a cheap "something happened" signal).
  const allKills = useKills(zoneKey, `${zoneKey}:${trail.points.length}`);
  const kills = useMemo(() => filterKills(allKills, killFilters), [allKills, killFilters]);
  const showKillConfidence = settings?.overlay.showKillConfidence ?? true;

  // Only placed kills can go on the map; the rest stay in the list, labelled.
  const renderKills = useMemo<RenderKill[]>(() => {
    const local = kills
      .filter((k) => k.y !== undefined && k.x !== undefined && k.confidence >= PLOTTABLE_CONFIDENCE)
      .map((k) => {
        const tier = confidenceTier(k.confidence);
        return { y: k.y!, x: k.x!, confidence: k.confidence, glyph: tier.glyph, color: tier.color };
      });
    const theirs = room.peerKills
      .filter((k) => zoneMatch(k.zone))
      .map((k) => {
        const tier = confidenceTier(k.confidence);
        return { y: k.y, x: k.x, confidence: k.confidence, glyph: tier.glyph, color: tier.color, peer: k.by };
      });
    return [...local, ...theirs];
  }, [kills, room.peerKills, zoneMatch]);

  // Share the placed kills for the zone in view (empty un-shares), so a camp's heatmap can
  // be pooled. Only the conclusion travels — the evidence behind it stays local.
  const broadcastKills = room.shareKills;
  useEffect(() => {
    if (!connected) return;
    broadcastKills(
      shareKillsOn && zoneKey
        ? kills
            .filter((k) => k.y !== undefined && k.x !== undefined && k.confidence >= PLOTTABLE_CONFIDENCE)
            .map((k) => ({ zone: zoneKey, y: k.y!, x: k.x!, mob: k.mob, confidence: k.confidence }))
        : [],
    );
  }, [connected, shareKillsOn, kills, zoneKey, broadcastKills]);

  // Sharing kills and sharing what they taught us are one intent, so one toggle drives both.
  // Observations are counts, so they pool by addition — see `mob-stats.ts`.
  const broadcastMobs = room.shareMobs;
  useEffect(() => {
    if (!connected) return;
    if (!shareKillsOn) return void broadcastMobs([]);
    void api()
      ?.mobs.mine()
      .then((mine) => broadcastMobs(mine));
    // Re-shared as the kill count moves, which is when there's anything new to say.
  }, [connected, shareKillsOn, allKills.length, broadcastMobs]);

  /**
   * Pin where a mob lives. The roam centre is a real coordinate, so this reuses the pin
   * machinery rather than adding a one-off "centre the view" path into the canvas.
   */
  function markMobArea(mob: { mob: string; area?: { y: number; x: number; spread: number } }) {
    if (!mob.area || !zoneKey) return;
    const title = `${mob.mob} ±${mob.area.spread}`;
    // No layer: a roam centre is averaged from kills, and a kill doesn't know which floor
    // it happened on — so the pin belongs to the zone and shows on all of them.
    setPins((prev) =>
      prev.some((p) => p.title === title && p.zone === zoneKey)
        ? prev
        : [...prev, { id: crypto.randomUUID(), kind: "star", zone: zoneKey, y: mob.area!.y, x: mob.area!.x, title }],
    );
  }

  // Peers/pings/pins filtered to the viewed zone (and pins to the visible kinds).
  // Peers are zone-wide on purpose: a `/loc` doesn't say which floor they're on, so
  // hiding them per layer would just lose people. A ping carries the layer its sender
  // was looking at, so it lands on that floor only.
  const peers = useMemo(() => room.peers.filter((p) => zoneMatch(p.zone)), [room.peers, zoneMatch]);
  const pings = useMemo(
    () => room.pings.filter((p) => zoneMatch(p.zone) && onLayer(p, viewLayer)),
    [room.pings, zoneMatch, viewLayer],
  );
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
    const local = pins
      .filter((p) => zoneMatch(p.zone) && onLayer(p, viewLayer) && !hiddenKinds.has(p.kind))
      .map((p) => mk(p, true));
    const peer = room.peerPins
      .filter(
        (p) =>
          zoneMatch(p.zone) && onLayer(p, viewLayer) && !hiddenKinds.has(p.kind) && !hiddenSharers.has(p.by ?? ""),
      )
      .map((p) => mk(p, false));
    return [...local, ...peer];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, room.peerPins, zoneKey, viewLayer, hiddenKinds, hiddenSharers]);

  function placePin(eq: { y: number; x: number }, clientX: number, clientY: number) {
    if (!heldPin || !zoneKey) return;
    // Stamped with the layer in view: you dropped it on this floor, so it lives here. With
    // every floor on screen there's no one floor to claim, so it belongs to the zone.
    const pin: MapPin = {
      id: crypto.randomUUID(),
      kind: heldPin,
      zone: zoneKey,
      layer: viewLayer ?? undefined,
      y: eq.y,
      x: eq.x,
    };
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
    setPinTypesOpen(false);
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
    <div className={`map-win ${maximized ? "maximized" : ""}`}>
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
          className="map-source-select no-drag"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
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
        <select
          className="map-zone-select no-drag"
          value={selectValue}
          onChange={(e) => setOverride(e.target.value || null)}
          title="View a zone (blank = follow your current zone)"
        >
          <option value="">Follow current{currentZone ? ` · ${currentZone}` : ""}</option>
          {/* The viewed zone has no map — keep the dropdown showing it, flagged. */}
          {selectValue && !zoneOptions.some((z) => z.name === selectValue) && (
            <option value={selectValue}>{selectValue} (no map)</option>
          )}
          {zoneOptions.map((z) => (
            <option key={z.key} value={z.name}>
              {z.name}
              {/* Name the file too when it isn't obvious from the zone name, so a zone we
                  could only name after its file isn't ambiguous. */}
              {z.file && z.file !== z.name.toLowerCase() ? ` · ${z.file}` : ""}
            </option>
          ))}
        </select>
        {/* One dropdown, two kinds of layer: separate map files (an image zone) or the storeys
            a map file's author labelled. Only shown when there's actually a choice. */}
        {(floors.length > 1 || layers.length > 1) && (
          <select
            className="map-zone-select no-drag"
            value={viewLayer ?? ""}
            onChange={(e) => setLayerPick(e.target.value === "" ? null : Number(e.target.value))}
            title={
              floors.length > 1
                ? "Which floor to show — the map file holds them all at once, as the game draws it.\nPins and pings you make belong to the floor you made them on."
                : "Which layer of this zone to view — pins and pings are per layer"
            }
          >
            {/* Floors can be shown together; separate map files can't. */}
            {floors.length > 1 && <option value="">All floors</option>}
            {floors.length > 1
              ? floors.map((f) => (
                  <option key={f.layer} value={f.layer}>
                    {f.label}
                    {yourFloor?.layer === f.layer ? " · you" : ""}
                  </option>
                ))
              : layers.map((z) => (
                  <option key={z.key} value={z.layer}>
                    {layerLabel(z)}
                  </option>
                ))}
          </select>
        )}
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
          {/* The map's own scale, separate from the main window's — see `mapFontScale`. */}
          <ScaleButtons
            scale={settings?.overlay.mapFontScale ?? 1}
            onScale={(next) => api()?.settings.update({ overlay: { mapFontScale: next } })}
            what="map"
            range={MAP_UI_SCALE}
          />
          <PinButton pinned={pinned} onToggle={() => setPinned((p) => !p)} />
          <button className="wc" title="Minimize" onClick={() => api()?.win.minimize()}>
            —
          </button>
          <MaximizeButton />
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
        <button className={`wc ${pinTypesOpen ? "on" : ""}`} title="Show / hide pin types" onClick={() => setPinTypesOpen((o) => !o)}>
          👁
        </button>
        <button
          className={`wc ${mobsOpen ? "on" : ""}`}
          title="What killing things here has taught us — drop rates and roam areas"
          onClick={() => setMobsOpen((o) => !o)}
        >
          📖
        </button>
        <button
          className={`wc ${killsOpen ? "on" : ""}`}
          title="Kills recorded here — the heatmap and its filters"
          onClick={() => setKillsOpen((o) => !o)}
        >
          ☠{kills.length ? ` ${kills.length}` : ""}
        </button>
        {connected && (
          <button
            className={`wc pin ${shareKillsOn ? "on" : ""}`}
            title="Share your kill locations, so the camp's heatmap is everyone's"
            onClick={() => setShareKillsOn((s) => !s)}
          >
            ☣
          </button>
        )}
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
                    onClick={() => setOverride(findZone(u.zone, zones)?.name ?? u.zone)}
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

      {mobsOpen && (
        <MobKnowledgePanel
          zone={zoneKey}
          refreshKey={`${allKills.length}:${room.peerKills.length}`}
          onMarkMob={markMobArea}
        />
      )}

      {killsOpen && (
        <KillList
          kills={kills}
          filters={killFilters}
          onFilters={setKillFilters}
          showConfidence={showKillConfidence}
        />
      )}

      {pinTypesOpen && (
        <div className="pin-layers no-drag">
          <div className="muted small">Pin types</div>
          {PIN_TYPES.map((t) => (
            <label key={t.key} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={!hiddenKinds.has(t.key)} onChange={(e) => toggleKind(t.key, e.target.checked)} />
              <span style={{ color: t.color }}>{t.glyph}</span> {t.label}
            </label>
          ))}
          {poiKinds.length > 0 && (
            <>
              <div className="muted small" style={{ marginTop: 4 }}>
                Map labels
              </div>
              {poiKinds.map((k) => (
                <label key={k.kind} className="row" style={{ gap: 6 }} title={k.hint}>
                  <input
                    type="checkbox"
                    checked={!hiddenPoiKinds.has(k.kind)}
                    onChange={(e) => togglePoiKind(k.kind, e.target.checked)}
                  />
                  {/* The color these wear on *this* map — how you recognise them on screen. */}
                  <span className="poi-dot" style={{ background: k.color ?? "#8ba0bd" }} />
                  {k.label} <span className="muted small">{k.count}</span>
                </label>
              ))}
            </>
          )}
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
            Clear pins in {zoneKey ?? "zone"}
          </button>
        </div>
      )}

      <div className="map-body">
        {hasMap ? (
          <MapPanel
            zone={zone}
            vector={vector}
            floor={floor}
            hiddenPoiKinds={hiddenPoiKinds}
            redrawKey={cal.tick}
            kills={renderKills}
            showKillConfidence={showKillConfidence}
            trail={trail.points}
            peers={peers}
            pings={pings}
            pins={renderPins}
            placing={heldPin !== null}
            onPlace={placePin}
            onPing={connected && zoneKey ? (eq) => room.sendPing(eq, zoneKey, viewLayer ?? undefined) : undefined}
            onPinClick={(pin, x, y) => {
              if (pin.mine) setSelected({ id: pin.id, x, y });
            }}
            moveMode={moveMode}
            onPinMove={(id, eq) => updatePin(id, { y: eq.y, x: eq.x })}
            showGrid={calibrating}
            calibrating={calibrating}
            onFix={(px, image) => {
              // No `/loc` yet means there's no EQ coordinate to pair the click with; the
              // calibration panel says so rather than recording a fix against nothing.
              if (loc) cal.addFix(loc, px, image);
            }}
            fixes={cal.fixes}
          />
        ) : (
          <div className="map-empty">
            <p className="map-empty-title">
              {zoneName ? `No map configured for ${zone?.name ?? zoneName}` : "No zone selected"}
            </p>
            <p className="muted small">
              {!zoneName
                ? "Your zone will appear once the log reports it — or pick one above."
                : sourceId === IMAGE_SOURCE
                  ? "Only the bundled images are this sparse — switch the map source above to the game's own maps for every zone."
                  : `${sourceLabel} has no file for it. Another map set may, or the zone's name may differ from its file name — pick it by hand above.`}
            </p>
            <p className="muted small">
              Markers you jump to here are saved and will appear once this zone has a map.
            </p>
            {(zone?.name || zoneName) && (
              <button className="btn sm" onClick={() => api()?.map.openP99(zone?.name ?? zoneName)}>
                View {zone?.name ?? zoneName} on Project 1999 ↗
              </button>
            )}
          </div>
        )}
        {showKey && zone?.mapKeyImg && <MapKey src={zone.mapKeyImg} alt={`${zone.name} map key`} />}
        {/* Someone drew this map by hand and shipped it for free; name them. */}
        {!!vector?.credits.length && (
          <p className="map-credits muted small" title="From the map file's credits layer">
            {vector.credits.join(" · ")}
          </p>
        )}
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
            <span>
              Calibrating {zone?.name}
              {zone?.layer ? ` · ${layerLabel(zone)}` : ""}
            </span>
            <span className="map-cal-step">Step size: {cal.step}</span>
          </div>
          {/* The one thing a fix can't be made without, so it's said first and plainly. */}
          <div className="row" style={{ gap: 8 }}>
            <span className={loc ? "small" : "muted small"}>
              {loc ? `Your /loc: ${loc.y}, ${loc.x}` : "Type /loc in-game to record a fix"}
            </span>
            <span className="spacer" />
            <span className="muted small">
              {cal.fixes.length === 0
                ? "no fixes yet"
                : cal.fixes.length === 1
                  ? "1 fix — placed, scale unchanged"
                  : `${cal.fixes.length} fixes — placed and scaled`}
            </span>
            {cal.fixes.length > 0 && (
              <button className="btn ghost sm" onClick={cal.clearFixes}>
                Clear fixes
              </button>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <code className="map-cal-values">{cal.values}</code>
            <button
              className="btn ghost sm"
              title="Copy the calibration for zones.ts"
              onClick={() => void navigator.clipboard?.writeText(cal.values)}
            >
              ⧉
            </button>
          </div>
          <span className="muted small">
            Stand somewhere, <kbd>/loc</kbd>, then <b>click that spot</b> on the map. One click places
            the map; a second click somewhere far away sets its scale too — that&apos;s the whole
            calibration. Fine-tune with <kbd>I/J/K/L</kbd> (move) and <kbd>W/S</kbd> (scale ±1%),
            <kbd>−</kbd>/<kbd>=</kbd> for step size, then paste the values into zones.ts.
          </span>
        </div>
      )}
    </div>
  );
}
