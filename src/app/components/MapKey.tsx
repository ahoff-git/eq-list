"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The zone's map key / legend, zoomable. The bundled key images are scans sized for a
 * full screen, so at sidebar width the labels are unreadable — scroll to zoom toward
 * the cursor, drag to pan, double-click (or the ⤢ badge) to reset.
 *
 * Deliberately CSS-transform based rather than canvas: it's a static image, so the
 * browser does the sampling and the DOM keeps it selectable/inspectable.
 */
const MAX_ZOOM = 8;
const MIN_ZOOM = 1;

export default function MapKey({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  // Latest zoom/pan for the native wheel handler, which is attached once (below).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = useCallback((e: WheelEvent) => {
    const el = viewRef.current;
    if (!el) return;
    e.preventDefault(); // zoom the key, don't scroll the sidebar
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const zoom = zoomRef.current;
    const pan = panRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    if (next === zoom) return;
    if (next === MIN_ZOOM) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    // Keep the point under the cursor put, same as the map canvas does.
    setPan({ x: cx - ((cx - pan.x) / zoom) * next, y: cy - ((cy - pan.y) / zoom) * next });
    setZoom(next);
  }, []);

  // React registers `wheel` as a passive listener (preventDefault would no-op), so attach
  // it natively as non-passive — otherwise scroll-to-zoom also scrolls the sidebar.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const from = dragRef.current;
    if (!from) return;
    setPan((p) => ({ x: p.x + e.clientX - from.x, y: p.y + e.clientY - from.y }));
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  // Panning is available at any zoom: these keys are often taller than the pane, so
  // dragging is how you reach the bottom even at 1×.
  const moved = zoom > 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <aside className="map-key">
      <div
        className="map-key-view"
        ref={viewRef}
        onMouseDown={(e) => {
          e.preventDefault(); // no text/image selection while panning
          dragRef.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseMove={onMove}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
        onDoubleClick={reset}
        title="Scroll to zoom · drag to pan · double-click to reset"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        />
      </div>
      {moved && (
        <button className="map-key-reset" onClick={reset} title="Reset the key's zoom and position">
          {zoom.toFixed(1)}× ⤢
        </button>
      )}
    </aside>
  );
}
