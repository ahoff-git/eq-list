"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerLoc } from "@/lib/hooks";
import { eqToCanvasCoords, canvasToEqCoords } from "@/shared/map/coords";
import { clearCanvas, drawImageScaled, drawLine, drawCircle } from "@/lib/map/draw";
import type { Loc, Point, Zone } from "@/shared/map/types";

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
 * cursor) is applied to both layers; the pure `src/shared/map` coord math maps
 * EQ↔base-canvas, and this component layers the view on top (and inverts it for the
 * cursor readout + hit-testing). A click hit-tests pins first, else places a held
 * pin (`onPlace`) or pings (`onPing`).
 */
function niceStep(span: number): number {
  const raw = span / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.max(50, Math.round(raw / mag) * mag);
}

const MAX_ZOOM = 6;
const HIT_RADIUS = 9; // px — how close the cursor must be to hover/select a pin

/**
 * How long a fresh ping animates. A ping is a "look here" gesture, so it announces
 * itself with expanding rings and then settles into a plain marker that stays put —
 * long enough to catch your eye across the room, short enough not to distract.
 */
const PING_ANIM_MS = 2400;
const PING_RINGS = 3;

/** Overlay marker colours, kept together so they're named + tweakable in one place. */
const MAP_COLORS = {
  self: "crimson",
  peer: "limegreen",
  ping: "gold",
  trail: "steelblue",
  gridOrigin: "orange",
  gridRing: "rgba(235, 244, 255, 0.95)",
  gridCore: "rgba(10, 15, 24, 0.85)",
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

  const calibrated = !!zone?.size && !!zone.centerOffset;

  // EQ coordinate → on-screen canvas point (base coord via the pure math, then the view).
  const toScreen = useCallback(
    (eq: Loc): Point | undefined => {
      const b = eqToCanvasCoords(eq, zone, { width: side, height: side });
      return b ? { x: b.x * zoom + pan.x, y: b.y * zoom + pan.y } : undefined;
    },
    [zone, side, zoom, pan],
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

  // Reset the view when the zone changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [zone?.name]);

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

  // Draw the map image under the current view (zoom/pan).
  useEffect(() => {
    const c = mapRef.current;
    if (!c || !side) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!img) return;
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    zone!.mapDims = drawImageScaled(c, img);
    ctx.restore();
  }, [img, zoom, pan, side, zone]);

  // Draw the overlay (grid, trail, peers, loc, pings, pins) — coords via `toScreen`,
  // so markers/text stay a constant size while the map zooms/pans under them.
  useEffect(() => {
    const c = dotsRef.current;
    if (!c || !side) return;
    clearCanvas(c);
    if (!zone) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    if (showGrid && zone.size && zone.centerOffset) {
      const cx = -zone.centerOffset.x;
      const cy = -zone.centerOffset.y;
      const stepX = niceStep(zone.size.width);
      const stepY = niceStep(zone.size.height);
      const halfX = zone.size.width / 2;
      const halfY = zone.size.height / 2;
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
    ctx.textBaseline = "alphabetic";
  }, [loc, trail, peers, pings, pins, kills, showKillConfidence, zone, side, redrawKey, showGrid, toScreen, frame]);

  /** Screen point (within the canvas) → EQ coordinate, inverting the view. */
  function eqAt(e: React.MouseEvent<HTMLDivElement>): Loc | undefined {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left - pan.x) / zoom;
    const py = (e.clientY - rect.top - pan.y) / zoom;
    return canvasToEqCoords({ x: px, y: py }, zone, { width: el.clientWidth, height: el.clientHeight });
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
    if (!calibrated || !moveMode) return;
    const pin = pinAt(e);
    if (pin?.mine) {
      e.preventDefault(); // don't start a text selection while dragging
      setDragging(pin.id);
    }
  }

  function onClickCanvas(e: React.MouseEvent<HTMLDivElement>) {
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
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
    if (next === zoom) return;
    if (next <= 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    // Keep the point under the cursor fixed as zoom changes.
    setPan({ x: cx - ((cx - pan.x) / zoom) * next, y: cy - ((cy - pan.y) / zoom) * next });
    setZoom(next);
  }

  const cursor = dragging
    ? "grabbing"
    : moveMode
      ? "grab"
      : hovered
        ? "pointer"
        : placing || onPing
          ? "crosshair"
          : "default";

  return (
    <div className="map-surface" ref={wrapRef}>
      {side > 0 && (
        <div
          className="map-canvases"
          style={{ width: side, height: side, cursor }}
          onMouseMove={onMove}
          onMouseDown={onDown}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => {
            setHoverEq(null);
            setHovered(null);
            setDragging(null);
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
      {!zone?.mapImg && <p className="muted small map-note">No map for this zone yet.</p>}
      {zone?.mapImg && !calibrated && (
        <p className="muted small map-note">Map shown, but this zone isn’t calibrated — location can’t be plotted.</p>
      )}
      {zone?.mapImg && calibrated && !loc && (
        <p className="muted small map-note">
          Type <kbd>/loc</kbd> in-game to plot your position (it updates each time you do).
        </p>
      )}
    </div>
  );
}
