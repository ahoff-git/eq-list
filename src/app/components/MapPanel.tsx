"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerLoc } from "@/lib/hooks";
import { canvasToEqCoords, canvasToImagePx, clampPan, eqToCanvasCoords, imagePxToCanvas } from "@/shared/map/coords";
import { mapBounds, segmentOnFloor, vectorProjection, type EqMap, type MapFloor } from "@/shared/map/eqmap";
import { clearCanvas, drawImageScaled, drawLine, drawCircle } from "@/lib/map/draw";
import type { Loc, MapDimensions, MapView, Point, Zone } from "@/shared/map/types";

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
  /** True for the user's own pins (removable); false for peers' shared pins. */
  mine: boolean;
}

/**
 * Draws a zone's map with the player's location + trail, peers, pings, and pins on
 * two stacked square canvases. A **zoom/pan view** (scroll wheel to zoom toward the
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
  return Math.max(50, Math.round(raw / mag) * mag);
}

/**
 * How far in the view will go. An image runs out of pixels — past ~6× a P99 scan is mush — but the
 * game's own maps are lines, so they stay sharp as far as you care to go, and a dungeon corridor at
 * 6× is still a hairline.
 */
const IMAGE_MAX_ZOOM = 6;
const VECTOR_MAX_ZOOM = 30;
const HIT_RADIUS = 9; // px — how close the cursor must be to hover/select a pin
/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_SLOP = 4;

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
  /** Map geometry the file gave no color for (it said black, which we can't show). */
  mapLine: "#8ba0bd",
  poi: "#9fd0ff",
  poiText: "#dbe7f5",
  pinHalo: "rgba(10, 15, 24, 0.6)",
  pinTitle: "#fff",
  pinTitleOutline: "rgba(10, 15, 24, 0.9)",
} as const;

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
  moveMode = false,
  onPinMove,
  showGrid = false,
  calibrating = false,
  onFix,
  fixes = [],
  vector,
  floor,
}: {
  zone: Zone | undefined;
  redrawKey?: number;
  /** Recorded kills for this zone — the heatmap layer. */
  kills?: RenderKill[];
  /** Draw the little confidence glyph on each kill. */
  showKillConfidence?: boolean;
  /** The `/loc` trail, oldest→newest (owned by the parent so it can be cleared). */
  trail?: { y: number; x: number }[];
  peers?: { y: number; x: number }[];
  /** Peer pings; `at` (ms) is when it arrived, which drives the drop-in animation. */
  pings?: { name: string; y: number; x: number; at?: number }[];
  pins?: RenderPin[];
  placing?: boolean;
  onPlace?: (eq: Loc, clientX: number, clientY: number) => void;
  onPing?: (eq: Loc) => void;
  onPinClick?: (pin: RenderPin, clientX: number, clientY: number) => void;
  /** Move mode (from the toolbar): drag your own pins to relocate them. */
  moveMode?: boolean;
  onPinMove?: (id: string, eq: Loc) => void;
  showGrid?: boolean;
  /**
   * Calibration mode: a click reports the **image pixel** it landed on (`onFix`) instead of
   * placing or pinging. Image pixels, not EQ, because the whole point is that the EQ mapping
   * isn't trustworthy yet — that's what's being established.
   */
  calibrating?: boolean;
  onFix?: (imagePx: Point, image: MapDimensions) => void;
  /** Fixes recorded so far (image pixels), drawn so you can see where your clicks landed. */
  fixes?: Point[];
  /**
   * The game's own map for this zone, drawn instead of an image when present. It needs no
   * calibration — the geometry is already in world coordinates, so it supplies its own
   * scale and centre (`vectorProjection`).
   */
  vector?: EqMap | null;
  /**
   * Show only this floor of a multi-storey vector map (undefined = all of them, which is what
   * the game does). Stairs belong to both floors they touch, so they stay drawn.
   */
  floor?: MapFloor;
}) {
  const loc = usePlayerLoc();
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);
  const [side, setSide] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [hoverEq, setHoverEq] = useState<Loc | null>(null);
  const [hovered, setHovered] = useState<{ pin: RenderPin; x: number; y: number } | null>(null);
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
   * A vector map's self-calibration: the world box it covers, standing in for an image. The
   * zone the coordinate maths sees is the authored one for an image, and this for a map file
   * — after which every marker, pin, ping and grid path below is identical for both.
   */
  const projection = useMemo(() => {
    if (!vector?.segments.length && !vector?.pois.length) return undefined;
    const bounds = mapBounds(vector);
    return bounds ? vectorProjection(bounds) : undefined;
  }, [vector]);

  const projected = useMemo<Zone | undefined>(
    () => (projection && zone ? { ...zone, scale: projection.scale, center: projection.center } : zone),
    [zone, projection],
  );
  const calibrated = !!projected?.scale && !!projected.center;
  // A file-backed zone counts as mapped before its geometry arrives — the file is on disk,
  // so "no map for this zone" would be wrong for the moment it takes to load.
  const hasMap = !!vector || !!zone?.mapImg || !!zone?.file;

  /**
   * What we're measuring against: the map (an image's pixel size, or a vector map's world
   * box) plus the square canvas it's fitted into. Undefined until there's a map to fit,
   * which is also when there's nothing to plot markers onto anyway.
   */
  const view = useMemo<MapView | undefined>(() => {
    if (!side) return undefined;
    const canvas = { width: side, height: side };
    if (projection) return { image: projection.image, canvas };
    return img ? { image: { width: img.naturalWidth, height: img.naturalHeight }, canvas } : undefined;
  }, [img, side, projection]);

  const maxZoom = vector ? VECTOR_MAX_ZOOM : IMAGE_MAX_ZOOM;

  /** The zoom/pan view, applied to a base canvas point. */
  const applyView = useCallback((p: Point): Point => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y }), [zoom, pan]);

  // EQ coordinate → on-screen canvas point (base coord via the pure math, then the view).
  const toScreen = useCallback(
    (eq: Loc): Point | undefined => {
      if (!view) return undefined;
      const b = eqToCanvasCoords(eq, projected, view);
      return b ? applyView(b) : undefined;
    },
    [projected, view, applyView],
  );

  // Fit the largest square into the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSide(Math.max(0, Math.floor(Math.min(el.clientWidth, el.clientHeight))));
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

  // Load the zone image (into state so a load triggers a redraw).
  useEffect(() => {
    setImg(null);
    if (!zone?.mapImg) return;
    const i = new Image();
    let cancelled = false;
    i.onload = () => {
      if (!cancelled) setImg(i);
    };
    i.src = zone.mapImg;
    return () => {
      cancelled = true;
    };
  }, [zone?.mapImg]);

  // Draw the map itself — vector geometry when we have it, else the image — under the
  // current view (zoom/pan). Either way this canvas is static between zone/zoom changes;
  // the moving markers live on the one stacked above it.
  useEffect(() => {
    const c = mapRef.current;
    if (!c || !side) return;
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
        if (floor && !segmentOnFloor(seg, floor)) continue;
        const a = eqToCanvasCoords({ y: seg.y1, x: seg.x1 }, projected, view);
        const b = eqToCanvasCoords({ y: seg.y2, x: seg.x2 }, projected, view);
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
    } else if (img) {
      drawImageScaled(c, img);
    }
    ctx.restore();
  }, [img, vector, floor, projected, view, zoom, pan, side]);

  // Draw the overlay (grid, trail, peers, loc, pings, pins) — coords via `toScreen`,
  // so markers/text stay a constant size while the map zooms/pans under them.
  useEffect(() => {
    const c = dotsRef.current;
    if (!c || !side) return;
    clearCanvas(c);
    if (!projected) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // The grid spans exactly what the image covers: its pixel extent times the scale.
    if (showGrid && view && projected.scale && projected.center) {
      const cx = projected.center.x;
      const cy = projected.center.y;
      const spanX = view.image.width * projected.scale;
      const spanY = view.image.height * projected.scale;
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

    // The map's own labelled points (zone exits, camps, NPCs) go under everything of ours.
    // Drawn here rather than with the geometry so the text stays a constant size as you
    // zoom, the way our other markers do — and the way the game's map behaves.
    if (vector) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "10px sans-serif";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = MAP_COLORS.pinTitleOutline;
      for (const poi of vector.pois) {
        if (floor && (poi.z < floor.minZ || poi.z >= floor.maxZ)) continue;
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

    // Kills go down first: they're history, and everything live belongs on top of them.
    // Confidence drives both size and opacity, so a guess is visibly a guess.
    for (const kill of kills) {
      const p = toScreen(kill);
      if (!p) continue;
      const weight = Math.max(0.15, kill.confidence);
      ctx.save();
      ctx.globalAlpha = 0.15 + weight * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + weight * 8, 0, 2 * Math.PI);
      ctx.fillStyle = kill.color;
      ctx.fill();
      if (kill.peer) {
        // Someone else's: outlined rather than filled, so a shared heatmap stays legible.
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.strokeStyle = kill.color;
        ctx.stroke();
      }
      if (showKillConfidence) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = kill.color;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(kill.glyph, p.x, p.y);
      }
      ctx.restore();
    }

    for (let i = 1; i < trail.length; i++) {
      const a = toScreen(trail[i - 1]);
      const b = toScreen(trail[i]);
      if (a && b) drawLine(a.x, a.y, b.x, b.y, MAP_COLORS.trail, 2, ctx);
    }
    for (const peer of peers) {
      const p = toScreen(peer);
      if (p) drawCircle(p.x, p.y, ctx, { color: MAP_COLORS.peer, size: 4 });
    }
    if (loc) {
      const p = toScreen(loc);
      if (p) drawCircle(p.x, p.y, ctx, { color: MAP_COLORS.self, size: 5 });
    }
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
    // Calibration fixes: a numbered cross where you said a known coordinate sits. Drawn
    // from image pixels, so a resize or a zoom moves them with the map they belong to.
    fixes.forEach((fix, i) => {
      const base = view && imagePxToCanvas(fix, view);
      if (!base) return;
      const p = applyView(base);
      ctx.save();
      ctx.strokeStyle = MAP_COLORS.fix;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y);
      ctx.lineTo(p.x + 7, p.y);
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x, p.y + 7);
      ctx.stroke();
      ctx.fillStyle = MAP_COLORS.fix;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${i + 1}`, p.x + 8, p.y - 2);
      ctx.restore();
    });

    ctx.textBaseline = "alphabetic";
  }, [
    loc, trail, peers, pings, pins, kills, showKillConfidence, projected, side, redrawKey,
    showGrid, toScreen, frame, fixes, view, applyView, vector, floor,
  ]);

  /** Screen point (within the canvas) → base canvas point, inverting the zoom/pan view. */
  function canvasAt(e: React.MouseEvent<HTMLDivElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
  }

  /** Screen point → EQ coordinate. */
  function eqAt(e: React.MouseEvent<HTMLDivElement>): Loc | undefined {
    return view ? canvasToEqCoords(canvasAt(e), projected, view) : undefined;
  }

  /** Screen point → image pixel — what a calibration fix is recorded against. */
  function imagePxAt(e: React.MouseEvent<HTMLDivElement>): Point | undefined {
    return view ? canvasToImagePx(canvasAt(e), view) : undefined;
  }

  /** The pin under the cursor (within a few px), if any. */
  function pinAt(e: React.MouseEvent<HTMLDivElement>): RenderPin | undefined {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const pin of pins) {
      const p = toScreen(pin);
      if (p && Math.hypot(p.x - px, p.y - py) <= HIT_RADIUS) return pin;
    }
    return undefined;
  }

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    // Panning comes first, and works whether or not the zone is calibrated — looking around
    // an uncalibrated map is exactly when you need to.
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
      if (zoom > 1) setPan(clampPan({ x: grab.pan.x + dx, y: grab.pan.y + dy }, zoom, { width: side, height: side }));
      return;
    }
    if (!calibrated) return;
    if (dragging) {
      const eq = eqAt(e);
      if (eq) onPinMove?.(dragging, eq);
      return;
    }
    setHoverEq(eqAt(e) ?? null);
    const pin = pinAt(e);
    setHovered(pin ? { pin, x: e.clientX, y: e.clientY } : null);
  }

  function onDown(e: React.MouseEvent<HTMLDivElement>) {
    draggedRef.current = false;
    // Move mode's pin drag wins over panning — that's what it's for.
    if (calibrated && moveMode) {
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
    // Ahead of the `calibrated` guard on purpose: calibrating a zone that has no
    // calibration yet is exactly the case that has to work.
    if (calibrating) {
      const px = imagePxAt(e);
      if (px && view) onFix?.(px, view.image);
      return;
    }
    if (!calibrated || moveMode) return; // move mode uses drag, not click
    const pin = pinAt(e);
    if (pin) {
      onPinClick?.(pin, e.clientX, e.clientY);
      return;
    }
    const eq = eqAt(e);
    if (!eq) return;
    if (placing) onPlace?.(eq, e.clientX, e.clientY);
    else onPing?.(eq);
  }

  // Scroll to zoom toward the cursor. Clamped to [1, MAX_ZOOM]; at 1 the view resets
  // to fit (pan 0) so the map can't drift off-centre.
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!side) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(maxZoom, Math.max(1, zoom * factor));
    if (next === zoom) return;
    if (next <= 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    // Keep the point under the cursor fixed as zoom changes, without letting the edge of the
    // map pull away from the edge of the canvas.
    const canvas = { width: side, height: side };
    setPan(clampPan({ x: cx - ((cx - pan.x) / zoom) * next, y: cy - ((cy - pan.y) / zoom) * next }, next, canvas));
    setZoom(next);
  }

  const cursor = dragging || panning
    ? "grabbing"
    : moveMode
      ? "grab"
      : hovered
        ? "pointer"
        : calibrating || placing || onPing
          ? "crosshair"
          : zoom > 1
            ? "grab" // zoomed in, so there's somewhere to drag to
            : "default";

  return (
    <div className="map-surface" ref={wrapRef}>
      {side > 0 && (
        <div
          className="map-canvases"
          style={{ width: side, height: side, cursor }}
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
          <canvas ref={mapRef} width={side} height={side} />
          <canvas ref={dotsRef} width={side} height={side} />
        </div>
      )}
      {zoom > 1 && <div className="map-zoom">{zoom.toFixed(1)}×</div>}
      {calibrated && hoverEq && (
        <div className="map-readout" title="Cursor location (EQ y, x)">
          {hoverEq.y}, {hoverEq.x}
        </div>
      )}
      {hovered && (
        <div className="pin-tip" style={{ left: hovered.x + 12, top: hovered.y + 12 }}>
          {hovered.pin.title && <div className="pt-title">{hovered.pin.title}</div>}
          <div className="pt-label">
            {hovered.pin.label}
            {hovered.pin.mine ? " · click to edit" : ""}
          </div>
          {hovered.pin.note && <div className="pt-note">{hovered.pin.note}</div>}
        </div>
      )}
      {!hasMap && <p className="muted small map-note">No map for this zone yet.</p>}
      {/* Only an image can be uncalibrated — a map file brings its own scale and centre. */}
      {zone?.mapImg && !calibrated && (
        <p className="muted small map-note">Map shown, but this zone isn’t calibrated — location can’t be plotted.</p>
      )}
      {hasMap && calibrated && !loc && (
        <p className="muted small map-note">
          Type <kbd>/loc</kbd> in-game to plot your position (it updates each time you do).
        </p>
      )}
    </div>
  );
}
