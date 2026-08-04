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
import KillList, { clock, type KillEmphasis } from "../components/KillList";
import MobKnowledgePanel from "../components/MobKnowledge";
import { DEFAULT_KILL_FILTERS, filterKills, type KillFilters } from "@/shared/kill-filters";
import PinButton from "../components/PinButton";
import MaximizeButton from "../components/MaximizeButton";
import ScaleButtons from "../components/ScaleButtons";
import ZonePicker from "../components/ZonePicker";
import { useMapSource, useVectorMap } from "@/lib/map/useMapSource";
import { useAwariRoom } from "@/lib/map/useAwariRoom";
import { findZone, onLayer, sortZones } from "@/shared/map/zones";
import { detectFloors, floorAt, mapZRange, type ZBand } from "@/shared/map/eqmap";
import { poiGroupSummary, type PoiKind } from "@/shared/map/poi-kinds";
import { PIN_TYPES, pinType, type MapPin, type PinKind } from "@/shared/map/pins";
import MapFilters, { type HeightPick } from "../components/MapFilters";
import { characterFromLogFile } from "@/shared/log-parser";
import { confidenceTier, PLOTTABLE_CONFIDENCE } from "@/shared/kill-confidence";
import { MAP_UI_SCALE } from "@/shared/constants";

/**
 * The sibling map window (route `/map`, opened by the main window's 🗺 button).
 * Follows the log's current zone (with a type-to-find picker for any other), plots your
 * location/peers, and lets you drop pins from a toolbar (pick a pin up, click the map to place;
 * with none held, a click pings). Pins persist in localStorage and can be shared to peers over
 * awari. Frameless: the titlebar is the drag handle.
 *
 * Every map is one of the game's own **map files** (ADR 0042) — there are no bundled images and
 * nothing to calibrate. A map that labels its **floors** gets a picker for them; pins and pings are
 * stamped with the floor they were made on, while everything read out of the log — your position,
 * peers, kills — stays zone-wide, because the log never says which floor you're on.
 */
export default function MapWindow() {
  const currentZone = useCurrentZone();
  // Your last `/loc`. Needed early: it says which floor you're on.
  const loc = usePlayerLoc();
  // Squares the window's corners while maximized (see globals.css).
  const maximized = useMaximized();
  // Which folder of map files we're drawing, and the zones in it — the game's own `maps`, or a
  // pack installed beside it. Persisted.
  const { sources, sourceId, setSourceId, mapsDir, zones } = useMapSource();
  // The viewed-zone override persists so reopening the map returns to the zone you were
  // looking at (blank = follow your current zone).
  const [override, setOverride] = usePersistentState<string | null>(STORAGE_KEYS.mapZone, null);
  // Which floors we're looking at (empty = all of them). Persisted like the zone override, and
  // validated below rather than reset by an effect.
  const [layerPicks, setLayerPicks] = usePersistentState<number[]>(STORAGE_KEYS.mapLayers, []);
  const zoneName = override ?? currentZone ?? "";
  const zone = useMemo(() => (zoneName ? findZone(zoneName, zones) : undefined), [zoneName, zones]);
  // The zone's geometry, loaded through the main process (null until it arrives).
  const vector = useVectorMap(sourceId, zone);
  /**
   * Storeys the map's author labelled ("Level 3", "2nd Floor"). A map file holds every floor at
   * once — which is what the game draws — so these let you isolate one. Read from the file's own
   * labels, never guessed, so a zone that doesn't name its levels simply has none.
   */
  const floors = useMemo(() => (vector ? detectFloors(vector) : []), [vector]);
  /**
   * The floors actually drawn. A floor pick belongs to the map it was made on, so travelling
   * somewhere without those storeys falls back to showing all of them — which is also what an
   * empty pick means, since hiding every floor would just blank the map.
   */
  const shownLayers = useMemo(() => {
    const valid = layerPicks.filter((l) => floors.some((f) => f.layer === l));
    return valid.length ? valid : floors.map((f) => f.layer);
  }, [layerPicks, floors]);
  /** The floor you're standing on, from your `/loc` height — marked in the picker. */
  const yourFloor = loc ? floorAt(floors, loc.z) : undefined;
  /** The height span this map covers, which is the scale a hand-set window is chosen within. */
  const zRange = useMemo(() => (vector ? mapZRange(vector) : undefined), [vector]);
  /**
   * A hand-set height window, for a map whose author labelled no storeys. Held **with its zone**
   * and ignored the moment you look at another: a z of 40 means a treetop in one zone and a sewer
   * in the next, so this is the one filter that can't sensibly persist or travel.
   */
  const [heightPick, setHeightPick] = useState<{ zone: string; lo: number; hi: number } | null>(null);
  const height: HeightPick | null = heightPick?.zone && heightPick.zone === zoneName ? heightPick : null;
  /**
   * Is there a map to draw? The zone is in the list because its file is on disk, so it counts
   * before the geometry arrives — otherwise switching zones flashes "no map for this zone".
   */
  const hasMap = !!zone?.file;
  const sourceLabel = sources.find((s) => s.id === sourceId)?.label ?? "maps";
  /**
   * The heights drawn, and the heights a label has to sit in to be drawn: the checked floors, or a
   * hand-set window on a map that names none. Undefined draws the whole map, which is the default
   * and what the game does.
   */
  const bands = useMemo<ZBand[] | undefined>(() => {
    if (floors.length > 1) {
      if (shownLayers.length === floors.length) return undefined;
      return floors.filter((f) => shownLayers.includes(f.layer)).map(({ minZ, maxZ }) => ({ minZ, maxZ }));
    }
    if (!height || !zRange) return undefined;
    // The outermost edges open out to infinity, so a handle at the end of its scale can't clip the
    // top or bottom of the map by a rounding unit — the same reason `detectFloors` does it.
    return [
      {
        minZ: height.lo <= zRange.minZ ? -Infinity : height.lo,
        maxZ: height.hi >= zRange.maxZ ? Infinity : height.hi,
      },
    ];
  }, [floors, shownLayers, height, zRange]);
  /**
   * The floor a pin or a ping you make now belongs to: the one floor in view, or none while several
   * are — with more than one on screen there's no single storey to claim, so it belongs to the zone.
   */
  const viewLayer = floors.length > 1 && shownLayers.length === 1 ? shownLayers[0] : undefined;
  /** The floors markers are filtered to. Undefined is every floor, so nothing is filtered out. */
  const viewLayers = useMemo(
    () => (floors.length > 1 && shownLayers.length < floors.length ? new Set(shownLayers) : undefined),
    [floors.length, shownLayers],
  );
  const zoneOptions = useMemo(() => sortZones(zones), [zones]);
  // The dropdown's options are places, so its value is a zone *name*; a saved pick may be
  // a key (or a zone we have no map for), so resolve it back to a name where we can.
  const selectValue = override ? (findZone(override, zones)?.name ?? override) : "";
  /**
   * The zone we're scoped to, canonical where we can be. **Not** `zone?.name`: `zone` is the map
   * we have for the place, and a zone with no map file still has kills and mobs. Keying data off
   * the map object made every "here" panel fall back to `undefined` — which the main process reads
   * as "every zone" — so standing anywhere unmapped quietly showed you the whole kill log and every
   * mob you'd ever seen, under headings that said "here".
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

  // The map window has its own always-on-top pin, persisted so it comes back as you left it.
  const [pinned, setPinned] = usePersistentState(STORAGE_KEYS.mapPinned, true);
  useEffect(() => {
    api()?.win.setAlwaysOnTop(pinned);
  }, [pinned]);


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
  /** The label kinds this map actually has, in the filter's sections, with the color they wear here. */
  const poiGroups = useMemo(() => (vector ? poiGroupSummary(vector.pois) : []), [vector]);
  /** Several kinds at once, so switching a whole section is one action rather than one per row. */
  const togglePoiKinds = (kinds: PoiKind[], visible: boolean) =>
    setHiddenPoiList((prev) =>
      visible ? prev.filter((k) => !kinds.includes(k)) : [...new Set([...prev, ...kinds])],
    );
  const [hiddenSharers, setHiddenSharers] = useState<Set<string>>(new Set());
  const [sharePinsOn, setSharePinsOn] = usePersistentState(STORAGE_KEYS.mapSharePins, false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [killsOpen, setKillsOpen] = usePersistentState(STORAGE_KEYS.mapKillsOpen, false);
  const [mobsOpen, setMobsOpen] = usePersistentState(STORAGE_KEYS.mapMobsOpen, false);
  const [killFilters, setKillFilters] = useState<KillFilters>(DEFAULT_KILL_FILTERS);
  const [shareKillsOn, setShareKillsOn] = usePersistentState(STORAGE_KEYS.mapShareKills, false);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  // Which kills the map should pick out: set while a row in the ☠ list is hovered, so pointing at
  // a name answers "where did those die?". Transient by nature, so it isn't persisted.
  const [emphasis, setEmphasis] = useState<KillEmphasis | null>(null);

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
        return {
          y: k.y!,
          x: k.x!,
          confidence: k.confidence,
          glyph: tier.glyph,
          color: tier.color,
          mob: k.mob,
          id: k.id,
          // The hover says what the dot is, when it happened, what dropped, and — the part a
          // marker can't show — how much of its *position* to believe (see ADR 0023).
          title: k.mob,
          detail: [clock(k.at), k.drops?.length ? `dropped ${k.drops.join(", ")}` : "", `${tier.label}: ${tier.why}`]
            .filter(Boolean)
            .join(" · "),
        };
      });
    const theirs = room.peerKills
      .filter((k) => zoneMatch(k.zone))
      .map((k) => {
        const tier = confidenceTier(k.confidence);
        return {
          y: k.y,
          x: k.x,
          confidence: k.confidence,
          glyph: tier.glyph,
          color: tier.color,
          peer: k.by,
          mob: k.mob,
          title: k.mob,
          // Someone else's kill: say whose, since the position came from *their* `/loc`.
          detail: `${k.by ?? "a peer"}'s kill · ${tier.label}: ${tier.why}`,
        };
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
  const peers = useMemo(
    () =>
      room.peers
        .filter((p) => zoneMatch(p.zone))
        // Named from the roster, so hovering a green dot says who it is.
        .map((p) => ({ ...p, name: room.users.find((u) => u.peerId === p.peerId)?.name })),
    [room.peers, room.users, zoneMatch],
  );
  const pings = useMemo(
    () => room.pings.filter((p) => zoneMatch(p.zone) && onLayer(p, viewLayers)),
    [room.pings, zoneMatch, viewLayers],
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
      .filter((p) => zoneMatch(p.zone) && onLayer(p, viewLayers) && !hiddenKinds.has(p.kind))
      .map((p) => mk(p, true));
    const peer = room.peerPins
      .filter(
        (p) =>
          zoneMatch(p.zone) && onLayer(p, viewLayers) && !hiddenKinds.has(p.kind) && !hiddenSharers.has(p.by ?? ""),
      )
      .map((p) => mk(p, false));
    return [...local, ...peer];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, room.peerPins, zoneKey, viewLayers, hiddenKinds, hiddenSharers]);

  function placePin(eq: { y: number; x: number }, clientX: number, clientY: number) {
    if (!heldPin || !zoneKey) return;
    // Stamped with the layer in view: you dropped it on this floor, so it lives here. With
    // every floor on screen there's no one floor to claim, so it belongs to the zone.
    const pin: MapPin = {
      id: crypto.randomUUID(),
      kind: heldPin,
      zone: zoneKey,
      layer: viewLayer,
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
    setFiltersOpen(false);
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
        <ZonePicker
          zones={zoneOptions}
          value={selectValue}
          currentZone={currentZone}
          onPick={setOverride}
        />
        {/* The storeys a map's author labelled — only when it declares more than one. There are no
            per-file layers any more: one map file is one zone. A dropdown could only ever show one
            floor at a time, so the picking happens in the 👁 panel and this says what's showing and
            takes you there. */}
        {floors.length > 1 && (
          <button
            className={`wc no-drag ${bands ? "on" : ""}`}
            title="Which floors are drawn — the map file holds them all at once, as the game draws it."
            onClick={() => setFiltersOpen(true)}
          >
            ⌂ {bands ? `${shownLayers.length}/${floors.length}` : "all"}
          </button>
        )}
        <label className="map-follow no-drag" title="Snap the map to your zone when you travel">
          <input type="checkbox" checked={followZone} onChange={(e) => setFollowZone(e.target.checked)} />
          follow
        </label>
        <div className="win-controls no-drag">
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
        <button
          className={`wc ${filtersOpen ? "on" : ""}`}
          title="What's drawn — floors or heights, your pins, the map's own labels, peers' pins"
          onClick={() => setFiltersOpen((o) => !o)}
        >
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
          onEmphasize={setEmphasis}
        />
      )}

      {filtersOpen && (
        <MapFilters
          floors={floors}
          shownLayers={shownLayers}
          onLayers={setLayerPicks}
          yourFloor={yourFloor}
          zRange={zRange}
          height={height}
          onHeight={(pick) => setHeightPick(pick && zoneName ? { zone: zoneName, ...pick } : null)}
          hiddenPinKinds={hiddenKinds}
          onPinKind={toggleKind}
          poiGroups={poiGroups}
          hiddenPoiKinds={hiddenPoiKinds}
          onPoiKinds={togglePoiKinds}
          sharers={sharers}
          hiddenSharers={hiddenSharers}
          onSharer={toggleSharer}
          zone={zoneKey}
          onClearPins={clearZonePins}
        />
      )}

      <div className="map-body">
        {hasMap ? (
          <MapPanel
            zone={zone}
            vector={vector}
            bands={bands}
            hiddenPoiKinds={hiddenPoiKinds}
            emphasis={emphasis}
            kills={renderKills}
            showKillConfidence={showKillConfidence}
            trail={trail.points}
            peers={peers}
            pings={pings}
            pins={renderPins}
            placing={heldPin !== null}
            onPlace={placePin}
            onPing={connected && zoneKey ? (eq) => room.sendPing(eq, zoneKey, viewLayer) : undefined}
            onPinClick={(pin, x, y) => {
              if (pin.mine) setSelected({ id: pin.id, x, y });
            }}
            onKillClick={(kill) => {
              // Open the kill list scoped to that mob: the marker says where, the list says what
              // happened there — and the filter drives both, so the map narrows to it as well.
              if (!kill.mob) return;
              setKillFilters((f) => ({ ...f, mob: kill.mob! }));
              setKillsOpen(true);
            }}
            moveMode={moveMode}
            onPinMove={(id, eq) => updatePin(id, { y: eq.y, x: eq.x })}
          />
        ) : (
          <div className="map-empty">
            <p className="map-empty-title">
              {zoneName ? `No map file for ${zone?.name ?? zoneName}` : "No zone selected"}
            </p>
            <p className="muted small">
              {!zoneName
                ? "Your zone will appear once the log reports it — or pick one above."
                : sources.length === 0
                  ? "No maps folder found. The app looks beside the EverQuest log folder in Settings, so point that at your install and its maps will appear."
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

    </div>
  );
}
