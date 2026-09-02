"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  useCurrentZone,
  useHunt,
  useMobWikiPlaces,
  useKills,
  usePeerKills,
  useMaximized,
  usePlayerLoc,
  usePlayerTrail,
  useRendererDebug,
  useSettings,
  useUiScale,
  useWatcherStatus,
  useWindowOpacity,
  useZoneMobs,
} from "@/lib/hooks";
import { usePersistentShape, usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { PASS_THROUGH, useClickThrough } from "@/lib/clickThrough";
import { useWindowPin } from "@/lib/windowToggles";
import MapPanel, { type RenderKill, type RenderPin } from "../components/MapPanel";
import KillList from "../components/KillList";
import MobKnowledgePanel from "../components/MobKnowledge";
import { DEFAULT_KILL_FILTERS, filterKills, sharedAsKill, windowMoves, type KillFilters } from "@/shared/kill-filters";
import { useMapSource, useVectorMap } from "@/lib/map/useMapSource";
import { useFloors } from "@/lib/map/useFloors";
import { useHidden } from "@/lib/map/useHidden";
import { useAwariRoom } from "@/lib/map/useAwariRoom";
import { sharing } from "@/shared/peer-share";
import { findZone, mapZoneName, onLayer, sortZones } from "@/shared/map/zones";
import { samePlace } from "@/shared/zones/place";
import { zoneDifficultyLabel } from "@/shared/names";
import { poiGroupSummary, type PoiKind } from "@/shared/map/poi-kinds";
import { HUNT_PIN, pinType, type MapPin, type PinKind } from "@/shared/map/pins";
import { huntPins, unplacedHuntMobs } from "@/shared/map/hunt-pins";
import MapFilters from "../components/MapFilters";
import MapTitlebar from "../components/MapTitlebar";
import MapToolbar from "../components/MapToolbar";
import MapUsers from "../components/MapUsers";
import PinEditor from "../components/PinEditor";
import ResizablePanel from "../components/ResizablePanel";
import Toasts from "../components/Toasts";
import TravelPanel from "../components/TravelPanel";
import MapTravelAside from "../components/MapTravelAside";
import { useTravelSurvey } from "@/lib/map/useTravelSurvey";
import { characterFromLogFile } from "@/shared/log-parser";
import { confidenceTier, isPlottable } from "@/shared/kill-confidence";
import { MAP_UI_SCALE } from "@/shared/constants";
import type { KillEmphasis } from "@/shared/types";

import { clock } from "@/shared/format";
import { distinctSorted } from "@/shared/sorting";
/**
 * How often to re-apply a moving kill window. A kill's own resolution is a second and the shortest
 * window is ten minutes, so this only has to be fine enough that a row leaves the list at roughly
 * the time it should — not fine enough to watch it happen.
 */
const KILL_WINDOW_TICK_MS = 30_000;

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
  // What the log (or the picker) said, verbatim — kept only so the difficulty can be read off it.
  const zoneName = override ?? currentZone ?? "";
  const zone = useMemo(() => (zoneName ? findZone(zoneName, zones) : undefined), [zoneName, zones]);
  /**
   * **The zone this window is about**, as the one name every map reference here uses: the map's own
   * where we have a file, the place otherwise, and never the log's wording
   * ([`mapZoneName`](../../shared/map/zones.ts), ADR 0134). Blank until the log says where you are.
   */
  const mapZone = useMemo(() => mapZoneName(zoneName, zones), [zoneName, zones]);
  /**
   * How hard this copy of the zone is — the half of the log's wording `mapZone` folds away. Shown
   * beside the title rather than smuggled into the name, because one map draws the zone at every
   * difficulty and the player still wants to know which one they walked into (ADR 0134).
   */
  const difficulty = zoneName ? zoneDifficultyLabel(zoneName) : undefined;
  // The zone's geometry, loaded through the main process (null until it arrives).
  const vector = useVectorMap(sourceId, zone);
  /**
   * Which storeys are on screen, and everything that follows from it — see `useFloors`. Held there
   * rather than here because the eight values only mean anything together.
   */
  const {
    floors,
    shownLayers,
    setLayers,
    yourFloor,
    zRange,
    height,
    setHeight,
    bands,
    viewLayer,
    viewLayers,
  } = useFloors(vector, loc, mapZone);
  /**
   * Is there a map to draw? The zone is in the list because its file is on disk, so it counts
   * before the geometry arrives — otherwise switching zones flashes "no map for this zone".
   */
  const hasMap = !!zone?.file;
  const sourceLabel = sources.find((s) => s.id === sourceId)?.label ?? "maps";
  const zoneOptions = useMemo(() => sortZones(zones), [zones]);
  // The dropdown's options are places, so its value is a zone *name*; a saved pick may be
  // a key (or a zone we have no map for), so resolve it back to a name where we can.
  const selectValue = override ? mapZoneName(override, zones) : "";
  /**
   * The zone we're scoped to. **Not** `zone?.name`: `zone` is the map we have for the place, and a
   * zone with no map file still has kills and mobs. Keying data off the map object made every "here"
   * panel fall back to `undefined` — which the main process reads as "every zone" — so standing
   * anywhere unmapped quietly showed you the whole kill log and every mob you'd ever seen, under
   * headings that said "here".
   *
   * `mapZone` is exactly that name with the fold underneath it, so an unmapped zone no longer scopes
   * pins and kills to the log's wording — "Blackburrow 3" and "Blackburrow" are one camp (ADR 0134).
   */
  const zoneKey = mapZone || undefined;
  /**
   * Is `z` the zone currently on screen? Declared here, above every user: it was previously
   * defined further down and called from `renderKills`'s memo, which only *reached* the call
   * when a peer actually shared kills — so the temporal dead zone crashed the whole map
   * window the first time someone did, and never otherwise. Stable so the memos below can
   * depend on it honestly instead of silencing the lint rule.
   */
  const zoneMatch = useCallback(
    // Canonicalised through the zone list where we can, then compared the way every other "is this
    // here?" is — by **place**, so a difficulty variant, a peer's pack's spelling and the map's own
    // name for the zone all answer alike (`samePlace`, ADR 0083).
    (z: string) => !!zoneKey && samePlace(mapZoneName(z, zones), zoneKey),
    [zoneKey, zones],
  );
  // The zone list, reachable from the subscribe-once effects below without making them
  // re-subscribe every time a source finishes loading.
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  const settings = useSettings();
  // The map's own scale, separate from the main window's (see `useUiScale`).
  useUiScale(settings?.overlay.mapFontScale, MAP_UI_SCALE);
  // Translucency, on the other hand, is one value for the whole app — but the ◐ that flips *this*
  // window to solid is its own, so the map can be read without clearing the list.
  const sliderOpacity = settings?.overlay.opacity ?? 1;
  const { opaque, toggle: toggleOpaque } = useWindowOpacity(settings ? sliderOpacity : undefined);
  // Clicks over the map itself go to the game — the titlebar, toolbar and any open side panel
  // stay ours. Its own remembered value: seeing through the map and seeing through the list are
  // wanted at different moments (the same reason the ◐ override is per window).
  const clickThrough = useClickThrough();
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
    // Only a *change* clears it, so the toggle can't fight the persisted override on load — and only
    // a change of **place**: re-entering the zone at another difficulty is the same map, so snapping
    // you off the map you were studying would be the difficulty behaving like a zone (ADR 0134).
    if (followZone && previous !== null && !samePlace(previous, currentZone)) setOverride(null);
  }, [currentZone, followZone, setOverride]);

  // The `/loc` trail (the line drawn between your logged positions), owned here so the
  // toolbar can clear it; it also resets itself when you zone.
  const trail = usePlayerTrail(200);

  // A clickable location elsewhere (e.g. a mob's zone or coordinate) asks us to view
  // a zone — and, when a coordinate came along, drop a marker pin there (deduped).
  //
  // A `focus` says what the marker *is*: the mob and the drop the coordinate was derived from. With
  // one, the 📖 panel comes up narrowed to that row and the mob's kills are ringed, so the answer to
  // "where did this drop" arrives with its evidence rather than as a star on a map (ADR 0104).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.map.onViewZone(({ zone, loc, label, focus }) => {
      const zname = mapZoneName(zone, zonesRef.current);
      setOverride(zname); // canonical name so the dropdown reflects it
      if (focus?.mob || focus?.drop) {
        setKillFilters((f) => ({ ...f, mob: focus.mob ?? "", drop: focus.drop ?? "" }));
        setMobsOpen(true);
        // Ringing the kills is the map's own half of the answer — the panel says how often, the
        // rings say where. Cleared by the next hover, like any other emphasis.
        if (focus.mob) setEmphasis({ mobs: [focus.mob] });
      }
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

  // The map window has its own always-on-top pin, remembered against this window (ADR 0074) so it
  // comes back as you left it — and applied by main when it opens, before the renderer is up.
  const { pinned, toggle: togglePinned } = useWindowPin();

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
  // Transient: a filter set to look at one thing shouldn't still be on tomorrow.
  const pinKinds = useHidden(useState<PinKind[]>([]));
  // Which kinds of *map* label to leave off — a busy zone is mostly labels, and which ones matter
  // depends on what you're doing there. Persisted as an array, since a Set isn't JSON.
  const poiKinds = useHidden(usePersistentState<PoiKind[]>(STORAGE_KEYS.mapHiddenPoiKinds, []));
  /** The label kinds this map actually has, in the filter's sections, with the color they wear here. */
  const poiGroups = useMemo(() => (vector ? poiGroupSummary(vector.pois) : []), [vector]);
  // Whose shared pins to leave off. Transient, like the pin-kind filter.
  const hiddenSharers = useHidden(useState<string[]>([]));
  /**
   * Whether we're offering pins — **read only, here.** The switch lives in the Peers tab, which is
   * where every decision about what leaves this machine now lives
   * ([ADR 0146](../../../specs/decisions/0146-one-home-for-the-peer-network.md)); this window only
   * needs to know whether to put them on the wire for the live overlay.
   */
  const sharePinsOn = sharing(settings?.share, "pins");
  /**
   * Whether the map marks the hunt's mobs itself (ADR 0142). On by default — the whole point is that
   * it happens without being asked for — and persisted, because "don't put things on my map" is a
   * standing answer rather than a filter you set to look at one thing.
   */
  const [showHuntPins, setShowHuntPins] = usePersistentState(STORAGE_KEYS.mapHuntPins, true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [killsOpen, setKillsOpen] = usePersistentState(STORAGE_KEYS.mapKillsOpen, false);
  const [mobsOpen, setMobsOpen] = usePersistentState(STORAGE_KEYS.mapMobsOpen, false);
  const [travelOpen, setTravelOpen] = usePersistentState(STORAGE_KEYS.mapTravelOpen, false);
  /** The travel graph over the zone on screen, while — and only while — the 🧭 panel is open. */
  const survey = useTravelSurvey(travelOpen, sourceId, mapZone, settings?.travel);
  /**
   * Whether the survey strip is up. **Off by default**: the markers on the map are the useful half and
   * cost nothing to read, while the strip answers “should I believe this?” — a question worth asking
   * now and then, and not one to keep a panel open for on every trip.
   */
  const [auditOpen, setAuditOpen] = usePersistentState(STORAGE_KEYS.mapTravelAudit, false);
  /** The route on the map: every leg, drawn quietly, with the one under the pointer picked out. */
  const [routeLegs, setRouteLegs] = useState<{ from: string; to: string }[]>([]);
  const [hoverLeg, setHoverLeg] = useState<{ from: string; to: string } | null>(null);
  // Persisted like the rest of this window's controls: the bar shows what is set and carries a Clear,
  // so a narrowing that outlives a session is visible rather than a mystery.
  const [killFilters, setKillFilters] = usePersistentShape<KillFilters>(
    STORAGE_KEYS.mapKillFilters,
    DEFAULT_KILL_FILTERS,
  );
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  // Which kills the map should pick out: set while a name is hovered — a row in the ☠ list, or a
  // mob in the main window's Hunt tab — so pointing at one answers "where did those die?".
  // Transient by nature, so it isn't persisted.
  const [emphasis, setEmphasis] = useState<KillEmphasis | null>(null);

  // The same question asked from the other window. Both write one piece of state, so whichever
  // cursor moved last is the one being answered — which is what a person would expect.
  useEffect(() => api()?.map.onEmphasis(setEmphasis), []);

  /**
   * Keep main's copy of our pins current, so an ask can be answered while this window is shut.
   *
   * Reported **whatever the toggle says**, because handing main a copy is not sharing: the toggle is
   * checked when an ask is answered, which is the only moment it can be checked against the truth
   * ([ADR 0141](../../../specs/decisions/0141-the-room-is-a-meeting-place.md)).
   */
  useEffect(() => {
    api()?.peer.setPins(pins);
  }, [pins]);

  /**
   * …and keep broadcasting them for the *live* overlay, which is a different feature from the copy
   * the Peers tab hands over (see `sharePins`). Gated on the same one switch, since "let people see
   * my markers" is one decision however it reaches them.
   */
  useEffect(() => {
    if (!connected) return;
    broadcastPins(sharePinsOn ? pins : []);
  }, [connected, sharePinsOn, pins, broadcastPins]);

  /** Pins somebody handed us from the Peers tab, folded into our own set. */
  useEffect(
    () =>
      api()?.map.onPinsAdded((added) =>
        // Their ids were regenerated on arrival (`readPin`), so nothing here can collide with a pin
        // already placed — appending is safe and keeps both.
        setPins((prev) => [...prev, ...added]),
      ),
    [setPins],
  );

  // Kills are re-read when the main process says the log changed — see `useKills`.
  const myKills = useKills(zoneKey);
  // Peers' are read from the store, not from the room: they're filed as they arrive and kept, so the
  // pooled half of the heatmap is here on a night nobody else is online (see `usePeerKills`).
  const peerKills = usePeerKills(zoneKey);
  /**
   * **Everything recorded here, mine and peers' together.** A shared kill becomes an ordinary
   * `KillRecord` (`sharedAsKill`) so one filter and one list describe the whole map — they used to go
   * straight to the canvas, which left the dots and the rows disagreeing and made every filter apply to
   * half the markers. `shared: false` in the filters is what takes them out again.
   */
  const allKills = useMemo(
    () => [...myKills, ...peerKills.filter((k) => zoneMatch(k.zone)).map(sharedAsKill)],
    [myKills, peerKills, zoneMatch],
  );
  /**
   * The clock the kill window is measured against. A bounded window is a moving target and
   * `filterKills` reads the time when it's called, so memoizing on the kills and the filters alone
   * froze the cutoff wherever it last landed — pick "10m", stop killing, and the list went on
   * showing half-hour-old kills (and the toolbar's ☠ count with it). Ticks only while there's a
   * bound to enforce, so "all" costs nothing.
   */
  const [filterNow, setFilterNow] = useState(() => Date.now());
  const windowTicks = windowMoves(killFilters.window);
  useEffect(() => {
    if (!windowTicks) return;
    const id = setInterval(() => setFilterNow(Date.now()), KILL_WINDOW_TICK_MS);
    return () => clearInterval(id);
  }, [windowTicks]);
  const kills = useMemo(() => filterKills(allKills, killFilters, filterNow), [allKills, killFilters, filterNow]);
  const showKillConfidence = settings?.overlay.showKillConfidence ?? true;

  // Only placed kills can go on the map; the rest stay in the list, labelled.
  const renderKills = useMemo<RenderKill[]>(
    () =>
      kills
        .filter(isPlottable)
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
            ...(k.sharedBy ? { peer: k.sharedBy } : {}),
            // The hover says what the dot is, when it happened, what dropped, and — the part a
            // marker can't show — how much of its *position* to believe (see ADR 0023). A shared one
            // says whose it was instead of when: the position came from *their* `/loc`, and no time
            // travels with it.
            title: k.mob,
            detail: [
              k.sharedBy ? `${k.sharedBy}'s kill` : clock(k.at),
              k.drops?.length ? `dropped ${k.drops.join(", ")}` : "",
              `${tier.label}: ${tier.why}`,
            ]
              .filter(Boolean)
              .join(" · "),
          };
        }),
    [kills],
  );

  // Kills and what they taught are **no longer broadcast from here**. Both are read straight out of
  // the kill log by main and handed over when a peer asks (`electron/peer-share.ts`), which fixes
  // two things this window could never fix: it only ever shared the zone on screen, and it shared
  // nothing at all while it was closed. The toggle above is the same decision, in the same place
  // the Peers tab makes it (ADR 0141).

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

  /**
   * **The two halves of a hunt pin** (ADR 0142): what your list is after, and what this zone's kills
   * can say about where those mobs are.
   *
   * Read here rather than in the 📖 panel because both want the same rows and the panel is often
   * shut — the marks on the canvas are the useful half, and a reader who never opens the panel is
   * exactly who they're for. The panel is handed them (`known`), so the two can't disagree.
   */
  const { zones: huntZones } = useHunt();
  const zoneMobs = useZoneMobs(zoneKey, `${myKills.length}:${peerKills.length}`);
  /**
   * **The wiki, asked only where our own kills are silent.**
   *
   * A page lookup per hunted mob would be a lot of lookups for a long list; `unplacedHuntMobs` cuts
   * it to the mobs an answer could change, which is the same ranking `mobPlace` applies read
   * forwards. Gated on the switch too, so turning the marks off stops the asking rather than just
   * the drawing.
   */
  const unplaced = useMemo(
    () => (showHuntPins ? unplacedHuntMobs({ hunt: huntZones, ...zoneMobs }) : []),
    [showHuntPins, huntZones, zoneMobs],
  );
  const wikiPlaces = useMobWikiPlaces(unplaced);
  /**
   * A roam centre you marked by hand is the same spot with the same meaning, so the automatic mark
   * stands aside rather than drawing over it (`huntPins`).
   */
  const huntMarks = useMemo(
    () =>
      showHuntPins
        ? huntPins({
            hunt: huntZones,
            zone: zoneKey,
            ...zoneMobs,
            wiki: wikiPlaces,
            placed: pins.filter((p) => zoneMatch(p.zone)),
          })
        : [],
    [showHuntPins, huntZones, zoneKey, zoneMobs, wikiPlaces, pins, zoneMatch],
  );

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
  // Distinct people currently sharing pins — each gets its own visibility toggle, listed the way
  // every other picker of names is (`distinctSorted`), so the toggles don't reorder as pins arrive.
  const sharers = useMemo(
    () => distinctSorted(room.peerPins.map((p) => p.by).filter((b): b is string => !!b)),
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
      .filter((p) => zoneMatch(p.zone) && onLayer(p, viewLayers) && !pinKinds.hidden.has(p.kind))
      .map((p) => mk(p, true));
    const peer = room.peerPins
      .filter(
        (p) =>
          zoneMatch(p.zone) && onLayer(p, viewLayers) && !pinKinds.hidden.has(p.kind) && !hiddenSharers.hidden.has(p.by ?? ""),
      )
      .map((p) => mk(p, false));
    /**
     * The hunt's own, drawn like a pin and behaving like one everywhere it matters — hovered, and
     * clicked for what's known about the mob — but never yours: `mine: false` is what keeps it out
     * of the editor and the move tool, which is right for a mark you didn't place and can't keep.
     *
     * Unlayered, like every position read out of the log: a roam centre is averaged from kills, and
     * a kill has no idea which floor it happened on, so it belongs to the zone.
     */
    const hunt = huntMarks.map(
      (h): RenderPin => ({
        id: h.id,
        y: h.y,
        x: h.x,
        color: HUNT_PIN.color,
        glyph: HUNT_PIN.glyph,
        label: HUNT_PIN.label,
        title: h.title,
        note: h.note,
        mine: false,
        mob: h.mob,
        // The one thing on this map the reader came looking for, so it is drawn to be found — with
        // how rough the position is drawn around it (ADR 0142).
        loud: true,
        spread: h.spread,
      }),
    );
    return [...local, ...peer, ...hunt];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, room.peerPins, zoneKey, viewLayers, pinKinds.hidden, hiddenSharers.hidden, huntMarks]);

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
  const selectedPin = selected ? pins.find((p) => p.id === selected.id) : undefined;
  function clearZonePins() {
    setPins((prev) => prev.filter((p) => !zoneMatch(p.zone)));
    setFiltersOpen(false);
  }

  return (
    <div className={`map-win ${maximized ? "maximized" : ""}`}>
      <MapTitlebar
        zone={zone}
        zoneName={mapZone}
        difficulty={difficulty}
        sources={sources}
        sourceId={sourceId}
        sourceLabel={sourceLabel}
        onSource={setSourceId}
        mapsDir={mapsDir}
        zoneOptions={zoneOptions}
        pickedZone={selectValue}
        currentZone={currentZone}
        onZone={setOverride}
        peerCount={peers.length}
        connected={connected}
        floorCount={floors.length}
        shownFloors={shownLayers.length}
        filtered={!!bands}
        onFloors={() => setFiltersOpen(true)}
        followZone={followZone}
        onFollowZone={setFollowZone}
        scale={settings?.overlay.mapFontScale ?? 1}
        onScale={(next) => api()?.settings.update({ overlay: { mapFontScale: next } })}
        opaque={opaque}
        opacity={sliderOpacity}
        onOpaque={toggleOpaque}
        pinned={pinned}
        onPinned={togglePinned}
        clickThrough={clickThrough.on}
        onClickThrough={clickThrough.toggle}
      />

      <MapToolbar
        tool={tool}
        onTool={setTool}
        onClearTrail={trail.clear}
        trailLength={trail.points.length}
        killCount={kills.length}
        userCount={room.users.length}
        connected={connected}
        panels={{
          filters: [filtersOpen, setFiltersOpen],
          travel: [travelOpen, setTravelOpen],
          mobs: [mobsOpen, setMobsOpen],
          kills: [killsOpen, setKillsOpen],
          users: [usersOpen, setUsersOpen],
        }}
      />

      {/* Each of these opens over the map, so each is a box the reader can size — the default is what
          the panel was designed to take, and dragging its bottom edge says otherwise (`ResizablePanel`). */}
      {usersOpen && connected && (
        <ResizablePanel id="map.users" share={30}>
          <MapUsers users={room.users} onZone={(zone) => setOverride(mapZoneName(zone, zones))} />
        </ResizablePanel>
      )}

      {/* The off-map half of the graph — the networks, and the borders nobody drew the far side of.
          Beside the panel it belongs to, only while that panel is open, and only when asked for. */}
      {survey && auditOpen && <MapTravelAside survey={survey} />}

      {travelOpen && (
        <ResizablePanel id="map.travel" share={45}>
          <TravelPanel
            zones={zones}
            sourceId={sourceId}
            currentZone={currentZone}
            viewedZone={mapZone}
            loc={loc}
            travel={settings?.travel ?? { druid: false, wizard: false, gnome: true, succor: false, avoid: [] }}
            onTravel={(patch) => void api()?.settings.update({ travel: patch })}
            // A zone in the route opens its map, which also turns "follow me" off — the same override
            // the titlebar's picker sets, so the two can't disagree about what you're looking at.
            onViewZone={setOverride}
            onHoverLeg={setHoverLeg}
            onRouteLegs={setRouteLegs}
            audit={auditOpen}
            onAudit={setAuditOpen}
          />
        </ResizablePanel>
      )}

      {mobsOpen && (
        <ResizablePanel id="map.mobs" share={40}>
          <MobKnowledgePanel
            zone={zoneKey}
            known={zoneMobs.known}
            filters={killFilters}
            onFilters={setKillFilters}
            onMarkMob={markMobArea}
            onEmphasize={setEmphasis}
          />
        </ResizablePanel>
      )}

      {killsOpen && (
        <ResizablePanel id="map.kills" share={40}>
          <KillList
            kills={kills}
            filters={killFilters}
            onFilters={setKillFilters}
            showConfidence={showKillConfidence}
            onEmphasize={setEmphasis}
          />
        </ResizablePanel>
      )}

      {filtersOpen && (
        <ResizablePanel id="map.filters" share={45}>
          <MapFilters
            floors={floors}
            shownLayers={shownLayers}
            onLayers={setLayers}
            yourFloor={yourFloor}
            zRange={zRange}
            height={height}
            onHeight={setHeight}
            hiddenPinKinds={pinKinds.hidden}
            onPinKind={pinKinds.setVisible}
            huntPins={huntMarks.length}
            showHuntPins={showHuntPins}
            onHuntPins={setShowHuntPins}
            poiGroups={poiGroups}
            hiddenPoiKinds={poiKinds.hidden}
            onPoiKinds={poiKinds.setVisible}
            sharers={sharers}
            hiddenSharers={hiddenSharers.hidden}
            onSharer={hiddenSharers.setVisible}
            zone={zoneKey}
            onClearPins={clearZonePins}
          />
        </ResizablePanel>
      )}

      {/* The one region click-through hands to the game — see `PASS_THROUGH`. */}
      <div className="map-body" {...PASS_THROUGH}>
        {hasMap ? (
          <MapPanel
            zone={zone}
            vector={vector}
            bands={bands}
            hiddenPoiKinds={poiKinds.hidden}
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
              if (pin.mine) return setSelected({ id: pin.id, x, y });
              // A hunt pin isn't editable, but it is *about* something: it answers with the evidence
              // behind it, exactly as arriving from another window does (ADR 0104) — the 📖 panel
              // narrowed to that mob, and its kills ringed on the map.
              if (!pin.mob) return;
              setKillFilters((f) => ({ ...f, mob: pin.mob! }));
              setMobsOpen(true);
              setEmphasis({ mobs: [pin.mob] });
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
            survey={survey}
            routeLegs={routeLegs}
            highlight={hoverLeg}
          />
        ) : (
          <div className="map-empty">
            <p className="map-empty-title">{mapZone ? `No map file for ${mapZone}` : "No zone selected"}</p>
            <p className="muted small">
              {!mapZone
                ? "Your zone will appear once the log reports it — or pick one above."
                : sources.length === 0
                  ? "No maps folder found. The app looks beside the EverQuest log folder in Settings, so point that at your install and its maps will appear."
                  : `${sourceLabel} has no file for it. Another map set may, or the zone's name may differ from its file name — pick it by hand above.`}
            </p>
            <p className="muted small">
              Markers you jump to here are saved and will appear once this zone has a map.
            </p>
            {!!mapZone && (
              <button className="btn sm" onClick={() => api()?.map.openP99(mapZone)}>
                View {mapZone} on Project 1999 ↗
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
        <PinEditor
          pin={selectedPin}
          at={selected}
          onChange={(patch) => updatePin(selectedPin.id, patch)}
          onRemove={() => removePin(selectedPin.id)}
          onDone={() => setSelected(null)}
        />
      )}

      {/* Once per window is all it takes for anything in it to be able to say "that worked"
          (`lib/toast.ts`). Each window has its own bus, so a notice appears where it was raised. */}
      <Toasts />
    </div>
  );
}
