"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerLoc } from "@/lib/hooks";
import { canvasToEqCoords, clampPan, eqToCanvasCoords, fitRect } from "@/shared/map/coords";
import { inBands, mapBounds, segmentInBands, vectorProjection, type EqMap, type ZBand } from "@/shared/map/eqmap";
import { POI_KINDS, poiKind, type PoiKind } from "@/shared/map/poi-kinds";
import { zoneLinkName } from "@/shared/map/zone-names";
import { zoneKey } from "@/shared/names";
import { pickHit } from "@/shared/map/hit-test";
import { clearCanvas, drawLine, drawCircle } from "@/lib/map/draw";
import { localPoint } from "@/lib/screen";
import { mobKey } from "@/shared/mob-stats";
import type { CanvasSize, Loc, MapView, Point, Zone } from "@/shared/map/types";
import type { KillEmphasis, TravelSurvey } from "@/shared/types";

/**
 * A kill to plot. `confidence` fades and shrinks it, and `glyph`/`color` come from the
 * shared confidence vocabulary so the map and the kill list say the same thing.
 */
export interface RenderKill {
  y: number;
  x: number;
  confidence: number;
  glyph: string;
  color: string;
  /** Someone else's kill, shared over the room — drawn hollow so it reads as theirs. */
  peer?: string;
  /**
   * What to say when it's hovered, and what it means. Written by the page, which knows what a kill
   * *is* — the panel only knows where the dot goes.
   */
  title?: string;
  detail?: string;
  /** The mob, so a click can act on it without the panel parsing a label. */
  mob?: string;
  /** The kill record's id, so the list can point at exactly this one. */
  id?: string;
}

/** A pin resolved for drawing (the parent maps `MapPin` → this via the palette). */
export interface RenderPin {
  id: string;
  y: number;
  x: number;
  color: string;
  glyph: string;
  label: string;
  /** Short caption drawn under the pin. */
  title?: string;
  /** Free-text note shown on hover. */
  note?: string;
  /** True for the user's own pins (removable); false for peers' and the map's own. */
  mine: boolean;
  /**
   * The mob this pin is *about*, when it is about one — a hunt pin the map placed itself
   * (`hunt-pins.ts`). Not yours to edit, but it does answer a click: the window it belongs to knows
   * what's recorded about that mob, and the pin is the shortest way to ask.
   */
  mob?: string;
}

/**
 * Anything drawn on the map that names itself when hovered. One shape for every kind, so the
 * tooltip and the hit-test don't grow a branch per marker.
 */
interface HoverTarget {
  y: number;
  x: number;
  radius: number;
  /** Settles an overlap — see `pickHit`. */
  priority: number;
  title: string;
  detail?: string;
  /** Set for a pin, which has its own click behaviour (edit / move). */
  pin?: RenderPin;
  /** Set for a kill, which the page may want to act on. */
  kill?: RenderKill;
}

/**
 * Draws a zone's map — the game's own vector geometry — with the player's location + trail,
 * peers, pings, kills and pins, on two stacked canvases that fill the window. A **zoom/pan view** (scroll wheel to zoom toward the
 * cursor, drag to pan once zoomed) is applied to both layers; the pure `src/shared/map`
 * coord math maps EQ↔base-canvas, and this component layers the view on top (and inverts
 * it for the cursor readout + hit-testing).
 *
 * A **click** hit-tests pins first, else places a held pin (`onPlace`) or pings (`onPing`) —
 * but only a click that didn't drag. Panning has to share the left button with pinging, so a
 * press that travels more than `DRAG_SLOP` becomes a pan and the click it ends with is
 * swallowed; otherwise every look around the map would ping the room.
 */
function niceStep(span: number): number {
  const raw = span / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.max(MIN_GRID_STEP, Math.round(raw / mag) * mag);
}

/**
 * How far in the view will go. An image runs out of pixels — past ~6× a P99 scan is mush — but the
 * game's own maps are lines, so they stay sharp as far as you care to go, and a dungeon corridor at
 * 6× is still a hairline.
 */
const IMAGE_MAX_ZOOM = 6;
const VECTOR_MAX_ZOOM = 30;
/**
 * How close the cursor must be, per marker kind. A pin is a thing you aim at, so it's forgiving; a
 * kill dot is one of hundreds, so it isn't — otherwise a busy camp becomes one big hover target.
 */
const HIT_RADIUS = { pin: 9, self: 8, peer: 7, ping: 8, kill: 6, poi: 7, graph: 9 } as const;
/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_SLOP = 4;

/**
 * How a kill dot is drawn from its confidence, which is the whole point of the heatmap: a guess has
 * to *look* like a guess. Both the size and the opacity scale with it, from `weightFloor` (so a kill
 * with no usable position is still a visible dot rather than nothing) up to a measured one.
 */
const KILL_DOT = {
  /** Confidence below this still draws at this size — a dot you can't see says nothing at all. */
  weightFloor: 0.15,
  /** Radius in px at zero weight, and how much a full-confidence kill adds to it. */
  baseRadius: 4,
  weightedRadius: 8,
  /** Opacity, likewise: a floor plus what confidence earns. */
  baseAlpha: 0.15,
  weightedAlpha: 0.45,
  /** What everything unpicked drops to while a mob is hovered — dimmed, never hidden. */
  fadedAlpha: 0.3,
  /** A peer's kill is outlined rather than filled, so a shared heatmap stays legible. */
  peerStroke: 0.7,
  peerStrokeFaded: 0.2,
} as const;

/** The coarsest the coordinate grid gets, so a huge zone doesn't draw two lines and call it a grid. */
const MIN_GRID_STEP = 50;

/**
 * How long a fresh ping animates. A ping is a "look here" gesture, so it announces
 * itself with expanding rings and then settles into a plain marker that stays put —
 * long enough to catch your eye across the room, short enough not to distract.
 */
const PING_ANIM_MS = 2400;
const PING_RINGS = 3;

/** Overlay marker colors, kept together so they're named + tweakable in one place. */
const MAP_COLORS = {
  self: "crimson",
  peer: "limegreen",
  ping: "gold",
  trail: "steelblue",
  gridOrigin: "orange",
  gridRing: "rgba(235, 244, 255, 0.95)",
  gridCore: "rgba(10, 15, 24, 0.85)",
  fix: "#ff5cf0",
  /** The ring around a kill picked out from the list. */
  emphasis: "#ffffff",
  /** Map geometry the file gave no color for (it said black, which we can't show). */
  mapLine: "#8ba0bd",
  poi: "#9fd0ff",
  poiText: "#dbe7f5",
  pinHalo: "rgba(10, 15, 24, 0.6)",
  pinTitle: "#fff",
  pinTitleOutline: "rgba(10, 15, 24, 0.9)",
  /** The travel graph, drawn while the 🧭 panel is open: a border you cross, and a place you arrive at. */
  graphBorder: "#a78bfa",
  graphPlace: "#4dd4c4",
  graphText: "#efeaff",
  /** The leg under the pointer. Dashed, deliberately: a solid line reads as a way through. */
  graphLeg: "#ffd166",
  /** The rest of the route, present but quiet — there to be seen, not to be followed. */
  graphPath: "rgba(203, 213, 225, 0.4)",
} as const;

/** How big a travel node is drawn. Bigger than a POI dot: while navigating, this is the subject. */
const GRAPH_NODE = { border: 6, place: 5 } as const;

export default function MapPanel({
  zone,
  redrawKey,
  kills = [],
  showKillConfidence = true,
  trail = [],
  peers = [],
  pings = [],
  pins = [],
  placing = false,
  onPlace,
  onPing,
  onPinClick,
  onKillClick,
  moveMode = false,
  onPinMove,
  showGrid = false,
  vector,
  bands,
  hiddenPoiKinds,
  emphasis,
  survey,
  routeLegs,
  highlight,
}: {
  zone: Zone | undefined;
  redrawKey?: number;
  /** Recorded kills for this zone — the heatmap layer. */
  kills?: RenderKill[];
  /** Draw the little confidence glyph on each kill. */
  showKillConfidence?: boolean;
  /** The `/loc` trail, oldest→newest (owned by the parent so it can be cleared). */
  trail?: { y: number; x: number }[];
  /** Peers' live locations. `name` is theirs, for the hover label. */
  peers?: { y: number; x: number; name?: string }[];
  /** Peer pings; `at` (ms) is when it arrived, which drives the drop-in animation. */
  pings?: { name: string; y: number; x: number; at?: number }[];
  pins?: RenderPin[];
  placing?: boolean;
  onPlace?: (eq: Loc, clientX: number, clientY: number) => void;
  onPing?: (eq: Loc) => void;
  onPinClick?: (pin: RenderPin, clientX: number, clientY: number) => void;
  /** A kill marker was clicked — the page decides what "go and see it" means. */
  onKillClick?: (kill: RenderKill) => void;
  /** Move mode (from the toolbar): drag your own pins to relocate them. */
  moveMode?: boolean;
  onPinMove?: (id: string, eq: Loc) => void;
  showGrid?: boolean;
  /**
   * The game's own map for this zone. It needs no calibration — the geometry is already in world
   * coordinates, so it states its own projection (`vectorProjection`).
   */
  vector?: EqMap | null;
  /**
   * The height bands to draw — the checked floors of a multi-storey map, or a hand-set window on
   * one that names no storeys. Undefined or empty draws the whole map, which is what the game does.
   * Stairs belong to both floors they touch, so they stay drawn.
   */
  bands?: ZBand[];
  /** Label kinds to leave off the map (see `poiKind`) — a busy zone is mostly labels. */
  hiddenPoiKinds?: ReadonlySet<PoiKind>;
  /**
   * The **travel graph, from this zone's point of view** — drawn while the 🧭 panel is open, and only
   * then, because it answers a question you are only asking while navigating: not "how do I get
   * there" but "does the graph deserve to be believed about this map".
   *
   * Only the nodes with a position here are drawn. Everything else about it — the teleport networks,
   * the borders nobody drew the far side of — is the aside's, since neither can be put on a map (see
   * `MapTravelAside`, and specs/travel).
   */
  survey?: TravelSurvey | null;
  /**
   * **The leg of a route under the pointer**, drawn as the straight line its distance was measured
   * along — see `drawGraph`. Node ids from the same survey; either end being absent from this map (or
   * unplaced on it) simply draws nothing, which is the honest answer for a leg that isn't here.
   */
  /**
   * **The whole route, as the pairs its distances were measured between.** Drawn quietly so the trip is
   * visible without hunting for it; the one under the pointer is picked out by `highlight`.
   *
   * Node ids from the same survey. A leg with an end that isn't on this map — a hub, your own
   * position, a border nobody placed here — draws nothing, which is the honest answer for a leg that
   * isn't here.
   */
  routeLegs?: readonly { from: string; to: string }[];
  /** The leg under the pointer, out of `routeLegs`. */
  highlight?: { from: string; to: string } | null;
  /**
   * Kills to pick out — one mob's, or a single kill by id. Set while a name is hovered, in the
   * kill list or the main window's Hunt tab, so pointing at it answers "where did those die?".
   * An emphasis matching nothing on this map is ignored rather than fading everything.
   */
  emphasis?: KillEmphasis | null;
}) {
  const loc = usePlayerLoc();
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);
  /**
   * The drawing surface, in pixels — **the whole container**, not the largest square in it. A square
   * threw away the difference between the window's width and its height, which on a wide window is
   * most of the screen; a map that can fill the space should.
   */
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [hoverEq, setHoverEq] = useState<Loc | null>(null);
  const [hovered, setHovered] = useState<{ target: HoverTarget; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where a pan started (pointer + the pan at the time), while the button is held. */
  const panFrom = useRef<{ x: number; y: number; pan: Point } | null>(null);
  /** Set once a press has moved far enough to be a drag, so the click it ends with is ignored. */
  const draggedRef = useRef(false);
  // Mirrors the ref for the cursor only — a ref can't re-render, and this flips just twice
  // per drag rather than per mouse move.
  const [panning, setPanning] = useState(false);
  // Bumped per animation frame while a ping is still expanding; the overlay redraw
  // depends on it. Nothing animates most of the time, so the loop is usually off.
  const [frame, setFrame] = useState(0);
  const animating = pings.some((p) => p.at && Date.now() - p.at < PING_ANIM_MS);

  useEffect(() => {
    if (!animating) return;
    let raf = requestAnimationFrame(function tick() {
      setFrame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  /**
   * The map states its own projection: its geometry is world coordinates, so the world box it
   * covers *is* its calibration (`vectorProjection`). Nothing here is authored or tuned — that
   * went with the bundled scans (ADR 0042).
   */
  /** What `vectorProjection` hands back: the scale, the centre, and the extent it fitted. */
  type MapProjection = NonNullable<ReturnType<typeof vectorProjection>>;

  const projection = useMemo(() => {
    if (!vector?.segments.length && !vector?.pois.length) return undefined;
    const bounds = mapBounds(vector);
    return bounds ? vectorProjection(bounds) : undefined;
  }, [vector]);

  /** Can anything be plotted? Only once the geometry has arrived and stated where it is. */
  const plottable = !!projection;
  // The file being on disk is what makes a zone mapped; the geometry lands a moment later, and
  // "no map for this zone" would be wrong in between.
  const hasMap = !!vector || !!zone?.file;

  /**
   * What we're measuring against: the map's own extent plus the canvas it's fitted into.
   * Undefined until there's a map to fit, which is also when there's nothing to plot onto.
   */
  const view = useMemo<MapView | undefined>(
    () => (canvasSize.width && canvasSize.height && projection ? { image: projection.image, canvas: canvasSize } : undefined),
    [canvasSize, projection],
  );

  const maxZoom = vector ? VECTOR_MAX_ZOOM : IMAGE_MAX_ZOOM;

  /**
   * Where the map lands on the canvas. Passed to `clampPan` so panning is bounded by the *map*
   * rather than by the canvas — otherwise a zoomed map still lets you drag onto its letterbox bars.
   */
  const mapRect = useMemo(() => (view ? fitRect(view.image, view.canvas) : undefined), [view]);

  /**
   * Is this kill one of the ones being pointed at? By id when there is one, else by mob — folded
   * through `mobKey`, because the name being pointed at may be the wiki's ("a Gnoll Pup") while
   * the kill log strips the article and keeps the log's case ("gnoll pup"). It's the same mob.
   *
   * Several mobs can be asked for at once (a drop's sources), and they're one ask: a kill matching
   * any of them is rung, and the rest of the map fades once, not once per name.
   */
  const matches = useCallback((kill: RenderKill, want: KillEmphasis): boolean => {
    if (want.id) return kill.id === want.id;
    if (!kill.mob) return false;
    const key = mobKey(kill.mob);
    return !!want.mobs?.some((mob) => mobKey(mob) === key);
  }, []);

  /**
   * The emphasis actually in force. An ask that picks out nothing here — the Hunt tab pointing at a
   * mob that died in another zone, or that we've never killed — is dropped rather than honoured,
   * since honouring it would dim every marker on the map to say "no".
   */
  const picking = useMemo(
    () => (emphasis && kills.some((k) => matches(k, emphasis)) ? emphasis : null),
    [emphasis, kills, matches],
  );

  const emphasized = useCallback(
    (kill: RenderKill): boolean => !!picking && matches(kill, picking),
    [picking, matches],
  );

  /**
   * The labels actually drawn: the ones at a visible height, of the kinds not hidden. Worked out
   * here rather than in the draw loop, which runs on every `/loc`, ping frame and pan.
   */
  const visiblePois = useMemo(() => {
    if (!vector) return [];
    /**
     * **A way out to somewhere the server hasn't got is not a way out.** Every pack marks
     * `to The Plane of Knowledge (Click Book)` in half the world, and the Plane of Knowledge is six
     * expansions past this server: the graph already refuses to build a border into it, but the map
     * kept drawing the label — noise sitting exactly where the exits are, which is where you look when
     * you're finding your way out.
     *
     * Only while the 🧭 panel is open, because that is when the survey is here to say which zones those
     * are, and when a map is being read as a way through rather than as a picture of a place.
     */
    const gone = new Set((survey?.absent ?? []).map((name) => zoneKey(name)));
    const goesNowhere = (label: string): boolean => {
      if (!gone.size) return false;
      const to = zoneLinkName(label);
      return !!to && gone.has(zoneKey(to));
    };
    /**
     * **A point the graph already marks is drawn once.** A travel node's position is the label's own,
     * copied verbatim by the harvest — so while the graph is on screen, `to The Lesser Faydark` sits
     * underneath a diamond reading `→ Lesser Faydark`, and the zone is written twice in the same spot.
     * The marker is the better of the two: it says where it takes you rather than what the label said,
     * and it answers to the pointer with the node's own figures.
     *
     * Matched on the rounded position rather than on the words, because that is what makes it exact:
     * these are the same point, not two labels that happen to agree.
     */
    const marked = new Set(
      (survey?.nodes ?? []).flatMap((n) => n.at.map((p) => `${Math.round(p.y)},${Math.round(p.x)}`)),
    );
    return vector.pois.filter(
      (poi) =>
        inBands(poi.z, bands) &&
        !hiddenPoiKinds?.has(poiKind(poi.label)) &&
        !goesNowhere(poi.label) &&
        !marked.has(`${Math.round(poi.y)},${Math.round(poi.x)}`),
    );
  }, [vector, bands, hiddenPoiKinds, survey]);

  /**
   * Everything on the map that answers to the cursor. Built in one place so hovering doesn't need
   * a special case per marker kind, and so overlaps resolve consistently (`pickHit`): what you
   * placed yourself outranks what the log inferred, which outranks the map's own labels.
   */
  const targets = useMemo<HoverTarget[]>(() => {
    const list: HoverTarget[] = [];
    for (const pin of pins) {
      list.push({
        y: pin.y,
        x: pin.x,
        radius: HIT_RADIUS.pin,
        priority: 4,
        title: pin.title || pin.label,
        detail: [
          pin.title ? pin.label : "",
          pin.note ?? "",
          pin.mine ? "click to edit" : pin.mob ? "click for what's known about it" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        pin,
      });
    }
    for (const kill of kills) {
      if (!kill.title) continue; // unlabelled: nothing worth saying, so nothing to hover
      list.push({
        y: kill.y,
        x: kill.x,
        radius: HIT_RADIUS.kill,
        priority: 2,
        title: kill.title,
        detail: kill.detail,
        kill,
      });
    }
    for (const ping of pings) {
      list.push({ y: ping.y, x: ping.x, radius: HIT_RADIUS.ping, priority: 3, title: `${ping.name} pinged here` });
    }
    for (const peer of peers) {
      list.push({
        y: peer.y,
        x: peer.x,
        radius: HIT_RADIUS.peer,
        priority: 3,
        title: peer.name ?? "A peer",
        detail: "sharing their location",
      });
    }
    if (loc) {
      list.push({ y: loc.y, x: loc.x, radius: HIT_RADIUS.self, priority: 3, title: "You", detail: `${loc.y}, ${loc.x}` });
    }
    // The travel graph, when it's on screen. Hovering one is the **audit**: a marker says a node is
    // here, and only its figures say whether that's right — so the tip carries the exact `/loc` to
    // compare against the game, the node's own id, and, for a border, where it comes out.
    for (const node of survey?.nodes ?? []) {
      const many = node.at.length > 1;
      node.at.forEach((at, i) => {
        list.push({
          y: at.y,
          x: at.x,
          radius: HIT_RADIUS.graph,
          priority: 5,
          title: node.beyond ? `to ${node.beyond.name}` : node.label,
          detail: [
            `${Math.round(at.y)}, ${Math.round(at.x)}`,
            // A zone can offer several crossings of one border, and they are one node — worth saying
            // out loud, since two markers with one name otherwise read as a duplicate.
            many ? `crossing ${i + 1} of ${node.at.length}` : "",
            node.via ?? node.kind,
            node.id,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      });
    }
    // The map's own labels last: they're already written on the map, so hovering is for the ones
    // that overlap into illegibility — and for saying which kind they are.
    for (const poi of visiblePois) {
      const kind = POI_KINDS.find((k) => k.kind === poiKind(poi.label));
      list.push({ y: poi.y, x: poi.x, radius: HIT_RADIUS.poi, priority: 1, title: poi.label, detail: kind?.label });
    }
    return list;
  }, [pins, kills, pings, peers, loc, visiblePois, survey]);

  /** The zoom/pan view, applied to a base canvas point. */
  const applyView = useCallback((p: Point): Point => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y }), [zoom, pan]);

  // EQ coordinate → on-screen canvas point (base coord via the pure math, then the view).
  const toScreen = useCallback(
    (eq: Loc): Point | undefined => {
      if (!view) return undefined;
      const b = eqToCanvasCoords(eq, projection, view);
      return b ? applyView(b) : undefined;
    },
    [projection, view, applyView],
  );

  // Fill the container. `fitRect` still letterboxes the map inside it when their shapes differ, but
  // that's a gap you can now zoom into rather than dead canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCanvasSize({
        width: Math.max(0, Math.floor(el.clientWidth)),
        height: Math.max(0, Math.floor(el.clientHeight)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset the view whenever a different map comes up. Keyed on `key`, not `name`: the
  // layers of one zone share a name but are separately scaled images, so a held crop
  // would land somewhere unrelated on the next floor.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [zone?.key]);

  // A pan is only valid for the canvas and map it was clamped against, so re-clamp when either
  // changes — resizing the window, or a new zone's geometry arriving with a different shape.
  useEffect(() => {
    setPan((p) => clampPan(p, zoom, canvasSize, mapRect));
  }, [canvasSize, mapRect, zoom]);

  // Draw the map's geometry under the current view (zoom/pan). This canvas is static between
  // zone/zoom changes; the moving markers live on the one stacked above it.
  useEffect(() => {
    const c = mapRef.current;
    if (!c || !canvasSize.width) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    if (vector && view) {
      // Batched into one path per color: a few thousand segments with a stroke each would
      // be thousands of context switches, and the biggest zones carry twenty thousand.
      const paths = new Map<string, Path2D>();
      for (const seg of vector.segments) {
        if (!segmentInBands(seg, bands)) continue;
        const a = eqToCanvasCoords({ y: seg.y1, x: seg.x1 }, projection, view);
        const b = eqToCanvasCoords({ y: seg.y2, x: seg.x2 }, projection, view);
        if (!a || !b) continue;
        const key = seg.color ?? MAP_COLORS.mapLine;
        let path = paths.get(key);
        if (!path) paths.set(key, (path = new Path2D()));
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
      }
      // Hairlines: the view is already scaled, so undo it to keep strokes one pixel wide.
      ctx.lineWidth = 1 / zoom;
      for (const [color, path] of paths) {
        ctx.strokeStyle = color;
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }, [vector, bands, projection, view, zoom, pan, canvasSize]);

  // Draw the overlay (grid, trail, peers, loc, pings, pins) — coords via `toScreen`,
  // so markers/text stay a constant size while the map zooms/pans under them.
  useEffect(() => {
    const c = dotsRef.current;
    if (!c || !canvasSize.width) return;
    clearCanvas(c);
    if (!projection || !view) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Layers, bottom to top. **The order is the whole point**: what's drawn later covers
    // what came before, so history sits under anything live and your own pins sit over all of it.
    if (showGrid) drawGrid(ctx, projection, view);
    drawPois(ctx);
    drawKills(ctx);
    drawGraph(ctx);
    drawTrail(ctx);
    drawPeers(ctx);
    drawPings(ctx);
    drawPins(ctx);

    /**
     * The coordinate grid, spanning exactly what the map covers.
     *
     * Takes the projection and the view rather than closing over them: the effect's own guard proves
     * they exist, but that proof doesn't reach inside a nested function.
     */
    function drawGrid(ctx: CanvasRenderingContext2D, projection: MapProjection, view: MapView): void {
      const cx = projection.center.x;
      const cy = projection.center.y;
      const spanX = view.image.width * projection.scale;
      const spanY = view.image.height * projection.scale;
      const stepX = niceStep(spanX);
      const stepY = niceStep(spanY);
      const halfX = spanX / 2;
      const halfY = spanY / 2;
      for (let ex = Math.ceil((cx - halfX) / stepX) * stepX; ex <= cx + halfX; ex += stepX) {
        for (let ey = Math.ceil((cy - halfY) / stepY) * stepY; ey <= cy + halfY; ey += stepY) {
          const p = toScreen({ y: ey, x: ex });
          if (!p) continue;
          const origin = ex === 0 && ey === 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, origin ? 5 : 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = MAP_COLORS.gridCore;
          ctx.fill();
          ctx.lineWidth = origin ? 2 : 1;
          ctx.strokeStyle = origin ? MAP_COLORS.gridOrigin : MAP_COLORS.gridRing;
          ctx.stroke();
        }
    }
    }

    /**
     * **The travel graph on the map it was read from** — a diamond where you cross into another zone,
     * a circle where you arrive without walking.
     *
     * This is not a route and draws no path: it is the graph's *claims about this map*, at the
     * coordinates it holds them at, so they can be checked against the map under them. A border marked
     * where no line is drawn, or three of them where the map shows one way out, is a fault you can see
     * in a second here and can't see at all in a list of steps.
     *
     * Above the kills so the heatmap can't bury it, below anything live: while the 🧭 panel is open
     * this is the subject, but your own position still wins.
     */
    function drawGraph(ctx: CanvasRenderingContext2D): void {
      if (!survey?.nodes.length) return;
      ctx.save();
      /**
       * **The route's legs, under the markers.** Straight and dashed in both states, deliberately: the
       * line is the *measurement* — `dist3d` between two points — and drawing it any other way would
       * claim a way through that the geometry cannot support (see specs/map's non-responsibilities).
       *
       * The nearest pair of positions, because that is the pair `zoneDistance` priced when a zone
       * offers several crossings of one border.
       */
      const leg = (from: string, to: string, color: string, width: number): void => {
        const [a, b] = [from, to].map((id) => survey.nodes.find((n) => n.id === id));
        if (!a?.at.length || !b?.at.length) return;
        let best: [Point, Point] | undefined;
        let shortest = Infinity;
        for (const here of a.at) {
          for (const there of b.at) {
            const gap = Math.hypot(here.y - there.y, here.x - there.x, here.z - there.z);
            const [p, q] = [toScreen(here), toScreen(there)];
            if (p && q && gap < shortest) {
              shortest = gap;
              best = [p, q];
            }
          }
        }
        if (!best) return;
        ctx.setLineDash([6, 4]);
        drawLine(best[0].x, best[0].y, best[1].x, best[1].y, color, width, ctx);
        ctx.setLineDash([]);
      };

      // Quiet first, then the hovered one over it — so a leg the route uses twice still lights up.
      for (const step of routeLegs ?? []) leg(step.from, step.to, MAP_COLORS.graphPath, 2);
      const lit = new Set([highlight?.from, highlight?.to].filter(Boolean) as string[]);
      if (highlight && lit.size === 2) leg(highlight.from, highlight.to, MAP_COLORS.graphLeg, 2.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "10px sans-serif";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
      for (const node of survey.nodes) {
        const border = node.kind === "boundary";
        const color = border ? MAP_COLORS.graphBorder : MAP_COLORS.graphPlace;
        const r = border ? GRAPH_NODE.border : GRAPH_NODE.place;
        // A border is named by where it takes you, not by the pair of zones it joins — the same
        // reading a route's own rows use, and the only one that's an instruction.
        const text = node.beyond ? `→ ${node.beyond.name}` : node.label;
        for (const at of node.at) {
          const p = toScreen(at);
          if (!p) continue;
          ctx.beginPath();
          if (border) {
            ctx.moveTo(p.x, p.y - r);
            ctx.lineTo(p.x + r, p.y);
            ctx.lineTo(p.x, p.y + r);
            ctx.lineTo(p.x - r, p.y);
            ctx.closePath();
          } else {
            ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
          }
          ctx.fillStyle = lit.has(node.id) ? MAP_COLORS.graphLeg : color;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
          ctx.stroke();

          ctx.lineWidth = 2.5;
          ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
          ctx.strokeText(text, p.x + r + 4, p.y);
          ctx.fillStyle = MAP_COLORS.graphText;
          ctx.fillText(text, p.x + r + 4, p.y);
        }
      }
      ctx.restore();
    }

    // The map's own labelled points (zone exits, camps, NPCs) go under everything of ours.
    // Drawn here rather than with the geometry so the text stays a constant size as you
    // zoom, the way our other markers do — and the way the game's map behaves.
    function drawPois(ctx: CanvasRenderingContext2D): void {
      if (vector) {
        ctx.save();
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "10px sans-serif";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
        for (const poi of visiblePois) {
          const p = toScreen(poi);
          if (!p) continue;
          ctx.fillStyle = poi.color ?? MAP_COLORS.poi;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeText(poi.label, p.x + 4, p.y);
          ctx.fillStyle = poi.color ?? MAP_COLORS.poiText;
          ctx.fillText(poi.label, p.x + 4, p.y);
        }
        ctx.restore();
    }
    }

    // Kills go down first: they're history, and everything live belongs on top of them.
    // Confidence drives both size and opacity, so a guess is visibly a guess.
    function drawKills(ctx: CanvasRenderingContext2D): void {
      for (const kill of kills) {
        const p = toScreen(kill);
        if (!p) continue;
        const weight = Math.max(KILL_DOT.weightFloor, kill.confidence);
        // Hovering a mob's name picks its kills out here. Everything else fades rather than
        // vanishing — a marker you can still see is context; one that disappears is a lie about
        // what's on the map.
        const picked = emphasized(kill);
        const faded = !!picking && !picked;
        const radius = KILL_DOT.baseRadius + weight * KILL_DOT.weightedRadius;
        ctx.save();
        ctx.globalAlpha =
          (KILL_DOT.baseAlpha + weight * KILL_DOT.weightedAlpha) * (faded ? KILL_DOT.fadedAlpha : 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = kill.color;
        ctx.fill();
        if (kill.peer) {
          // Someone else's: outlined rather than filled, so a shared heatmap stays legible.
          ctx.globalAlpha = faded ? KILL_DOT.peerStrokeFaded : KILL_DOT.peerStroke;
          ctx.lineWidth = 1;
          ctx.strokeStyle = kill.color;
          ctx.stroke();
        }
        if (picked) {
          // A ring outside the dot, so it reads at a glance without changing what the dot itself
          // says about confidence — the size and colour still mean what they always did.
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = MAP_COLORS.emphasis;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 4, 0, 2 * Math.PI);
          ctx.stroke();
        }
        if (showKillConfidence) {
          ctx.globalAlpha = faded ? 0.35 : 0.9;
          ctx.fillStyle = kill.color;
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(kill.glyph, p.x, p.y);
        }
        ctx.restore();
    }
    }

    /** Your own path, from the /loc lines you typed. */
    function drawTrail(ctx: CanvasRenderingContext2D): void {
      for (let i = 1; i < trail.length; i++) {
        const a = toScreen(trail[i - 1]);
        const b = toScreen(trail[i]);
        if (a && b) drawLine(a.x, a.y, b.x, b.y, MAP_COLORS.trail, 2, ctx);
    }
    }

    /** Everyone else sharing a position, then you on top of them. */
    function drawPeers(ctx: CanvasRenderingContext2D): void {
      for (const peer of peers) {
        const p = toScreen(peer);
        if (p) drawCircle(p.x, p.y, ctx, { color: MAP_COLORS.peer, size: 4 });
    }
    if (loc) {
      const p = toScreen(loc);
      if (p) drawCircle(p.x, p.y, ctx, { color: MAP_COLORS.self, size: 5 });
    }
    }

    /** Pings: expanding rings while fresh, a plain marker once settled. */
    function drawPings(ctx: CanvasRenderingContext2D): void {
      ctx.textAlign = "center";
      ctx.font = "12px sans-serif";
      const now = Date.now();
      for (const ping of pings) {
        const p = toScreen(ping);
        if (!p) continue;
        // Fresh pings throw off expanding rings and a swollen dot that settles; older
        // ones are just markers, so a ping stays findable after the animation ends.
        const t = ping.at ? Math.min(1, (now - ping.at) / PING_ANIM_MS) : 1;
        if (t < 1) {
          ctx.save();
          ctx.strokeStyle = MAP_COLORS.ping;
          ctx.lineWidth = 2;
          for (let i = 0; i < PING_RINGS; i++) {
            const rt = t * PING_RINGS - i; // each ring starts a beat after the last
            if (rt <= 0 || rt >= 1) continue;
            ctx.globalAlpha = (1 - rt) * 0.9;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 + rt * 26, 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.restore();
        }
        drawCircle(p.x, p.y, ctx, { color: MAP_COLORS.ping, size: 4 + (1 - t) * 3 });
        ctx.fillStyle = MAP_COLORS.ping;
        ctx.fillText(ping.name, p.x, p.y - 7 - (1 - t) * 3);
    }
    }

    /** Pins last, because they're the thing you put there deliberately. */
    function drawPins(ctx: CanvasRenderingContext2D): void {
      for (const pin of pins) {
        const p = toScreen(pin);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = MAP_COLORS.pinHalo;
        ctx.fill();
        ctx.textBaseline = "middle";
        ctx.font = "14px sans-serif";
        ctx.fillStyle = pin.color;
        ctx.fillText(pin.glyph, p.x, p.y);
        if (pin.title) {
          ctx.textBaseline = "top";
          ctx.font = "11px sans-serif";
          ctx.lineWidth = 3;
          ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
          ctx.strokeText(pin.title, p.x, p.y + 9);
          ctx.fillStyle = MAP_COLORS.pinTitle;
          ctx.fillText(pin.title, p.x, p.y + 9);
        }
    }

    ctx.textBaseline = "alphabetic";
    }
  }, [
    loc, trail, peers, pings, pins, kills, showKillConfidence, canvasSize, redrawKey,
    showGrid, toScreen, frame, view, applyView, vector, visiblePois, picking, emphasized, projection, survey,
    routeLegs, highlight,
  ]);

  /** Screen point (within the canvas) → base canvas point, inverting the zoom/pan view. */
  function canvasAt(e: React.MouseEvent<HTMLDivElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
  }

  /** Screen point → EQ coordinate. */
  function eqAt(e: React.MouseEvent<HTMLDivElement>): Loc | undefined {
    return view ? canvasToEqCoords(canvasAt(e), projection, view) : undefined;
  }

  /** The pin under the cursor (within a few px), if any. */
  function pinAt(e: React.MouseEvent<HTMLDivElement>): RenderPin | undefined {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const pin of pins) {
      const p = toScreen(pin);
      if (p && Math.hypot(p.x - px, p.y - py) <= HIT_RADIUS.pin) return pin;
    }
    return undefined;
  }

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    // Panning comes first, and works before the geometry has landed — looking around a map that
    // hasn't finished loading is exactly when you'd try.
    const grab = panFrom.current;
    if (grab) {
      const dx = e.clientX - grab.x;
      const dy = e.clientY - grab.y;
      // Under the slop this is still a click in progress; a twitch mustn't eat the ping.
      if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!draggedRef.current) setPanning(true);
      // Marked on the *attempt*, not on movement: at fit zoom there's nowhere to pan, so the
      // map stays put — and a drag that visibly did nothing must still not fire a ping.
      draggedRef.current = true;
      if (zoom > 1) setPan(clampPan({ x: grab.pan.x + dx, y: grab.pan.y + dy }, zoom, canvasSize, mapRect));
      return;
    }
    if (!plottable) return;
    if (dragging) {
      const eq = eqAt(e);
      if (eq) onPinMove?.(dragging, eq);
      return;
    }
    setHoverEq(eqAt(e) ?? null);
    const target = targetAt(e);
    // The cursor in the units the tip's own `left`/`top` are written in, which under this window's
    // interface scale (a CSS `zoom`, ADR 0041) are not the pixels the event reports: a length
    // written into a zoomed document is multiplied by the zoom, so the tip landed at `scale` of the
    // cursor — on the map's far side at 2×.
    setHovered(target ? { target, ...localPoint({ x: e.clientX, y: e.clientY }) } : null);
  }

  /** The marker under the cursor — any kind, nearest first (see `pickHit`). */
  function targetAt(e: React.MouseEvent<HTMLDivElement>): HoverTarget | undefined {
    const rect = e.currentTarget.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const projected = targets.flatMap((t) => {
      const at = toScreen(t);
      return at ? [{ ...t, at }] : [];
    });
    return pickHit(projected, cursor);
  }

  function onDown(e: React.MouseEvent<HTMLDivElement>) {
    draggedRef.current = false;
    // Move mode's pin drag wins over panning — that's what it's for.
    if (plottable && moveMode) {
      const pin = pinAt(e);
      if (pin?.mine) {
        e.preventDefault(); // don't start a text selection while dragging
        setDragging(pin.id);
        return;
      }
    }
    // Recorded even at fit zoom, where there's nothing to pan: the press still has to be able to
    // become a drag, so that trying to drag an unzoomed map doesn't ping the room instead.
    e.preventDefault();
    panFrom.current = { x: e.clientX, y: e.clientY, pan };
  }

  function endDrag() {
    panFrom.current = null;
    setPanning(false);
    setDragging(null);
  }

  function onClickCanvas(e: React.MouseEvent<HTMLDivElement>) {
    // A click that panned the map was a drag, and a drag is not a ping, a pin, or a fix.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (!plottable || moveMode) return; // move mode uses drag, not click
    // A marker under the cursor is what the click was aimed at — placing a pin or pinging is what
    // you do with the empty map.
    const target = targetAt(e);
    if (target?.pin) {
      onPinClick?.(target.pin, e.clientX, e.clientY);
      return;
    }
    if (target?.kill) {
      onKillClick?.(target.kill);
      return;
    }
    if (target) return; // hovering something unclickable shouldn't ping through it
    const eq = eqAt(e);
    if (!eq) return;
    if (placing) onPlace?.(eq, e.clientX, e.clientY);
    else onPing?.(eq);
  }

  // Scroll to zoom toward the cursor. Clamped to [1, MAX_ZOOM]; at 1 the view resets
  // to fit (pan 0) so the map can't drift off-centre.
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!canvasSize.width) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(maxZoom, Math.max(1, zoom * factor));
    if (next === zoom) return;
    // Keep the point under the cursor fixed as zoom changes, without letting the edge of the
    // map pull away from the edge of the canvas. Even at fit this goes through `clampPan`, which
    // centres what it can't fill — a zero pan would only be centred on a map that fills the canvas.
    setPan(clampPan({ x: cx - ((cx - pan.x) / zoom) * next, y: cy - ((cy - pan.y) / zoom) * next }, next, canvasSize, mapRect));
    setZoom(next);
  }

  const cursor = dragging || panning
    ? "grabbing"
    : moveMode
      ? "grab"
      : hovered?.target.pin || hovered?.target.kill
        ? "pointer"
        : placing || onPing
          ? "crosshair"
          : zoom > 1
            ? "grab" // zoomed in, so there's somewhere to drag to
            : "default";

  return (
    <div className="map-surface" ref={wrapRef}>
      {canvasSize.width > 0 && canvasSize.height > 0 && (
        <div
          className="map-canvases"
          style={{ width: canvasSize.width, height: canvasSize.height, cursor }}
          onMouseMove={onMove}
          onMouseDown={onDown}
          onMouseUp={endDrag}
          onMouseLeave={() => {
            setHoverEq(null);
            setHovered(null);
            endDrag();
          }}
          onClick={onClickCanvas}
          onWheel={onWheel}
        >
          <canvas ref={mapRef} width={canvasSize.width} height={canvasSize.height} />
          <canvas ref={dotsRef} width={canvasSize.width} height={canvasSize.height} />
        </div>
      )}
      {zoom > 1 && <div className="map-zoom">{zoom.toFixed(1)}×</div>}
      {plottable && hoverEq && (
        <div className="map-readout" title="Cursor location (EQ y, x)">
          {hoverEq.y}, {hoverEq.x}
        </div>
      )}
      {hovered && (
        <div className="pin-tip" style={{ left: hovered.x + 12, top: hovered.y + 12 }}>
          <div className="pt-title">{hovered.target.title}</div>
          {hovered.target.detail && <div className="pt-label">{hovered.target.detail}</div>}
        </div>
      )}
      {!hasMap && <p className="muted small map-note">No map for this zone yet.</p>}
      {hasMap && plottable && !loc && (
        <p className="muted small map-note">
          Type <kbd>/loc</kbd> in-game to plot your position (it updates each time you do).
        </p>
      )}
    </div>
  );
}
