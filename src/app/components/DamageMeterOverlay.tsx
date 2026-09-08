"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCombatStats, useDamageOverlay } from "@/lib/hooks";
import { SOLID } from "@/lib/clickThrough";
import { clampUnit } from "@/shared/game-clock";
import { overlayDealers, CATEGORY_COLOR, sourceColor, type OverlayDealer, type OverlaySegment } from "@/shared/damage-overlay";
import { figure } from "@/shared/format";

/**
 * The floating damage meter, pinned over the game — toggled from the Damage tab (`DamagePanel`'s
 * 📌 button), placed by dragging its grip. Ranked by your side's damage dealers (the enemy is
 * excluded — see `damage-overlay.ts`), each row two bars deep: the dealer's Melee/Spell/Other
 * split, and beneath it the individual skill or spell behind it.
 *
 * **Click-through except its grip.** Unlike `GameClockOverlay`, where the whole face is the drag
 * target, this panel exists to be read *while* clicking and moving through the game underneath
 * it — so only the small `⠿` handle is a `SOLID` island; the bars themselves take no clicks and
 * pass them straight through, the same glass-except-islands rule every control on this window
 * follows (`useSolidIslands`, `clickThrough.ts`).
 *
 * Rides the existing alert overlay window rather than one of its own, for the reason every other
 * HUD here does: frameless, transparent, always-on-top, click-through is what a standing readout
 * wants, and a second window is a second lot of state to place and remember.
 *
 * Shows `stats.fight` — the current pull, or the last one, since `combat-stats.ts` deliberately
 * keeps a finished fight's window up until the next pull starts ("the panel goes on showing the
 * last pull until the next one starts, which is what a damage meter is for").
 */
export default function DamageMeterOverlay() {
  const { pinned, pinAt } = useDamageOverlay();
  const stats = useCombatStats();
  // Where the meter stood, and where the pointer was, the instant the drag started — a move is
  // then applied as a delta off the grab point rather than a teleport to the cursor (see
  // `GameClockOverlay`, which this mirrors).
  const [dragPos, setDragPos] = useState<{ fx: number; fy: number } | null>(null);
  const origin = useRef({ fx: 0, fy: 0 });
  const grabbedAt = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);

  useEffect(() => {
    if (!dragPos) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      const dx = (e.clientX - grabbedAt.current.x) / window.innerWidth;
      const dy = (e.clientY - grabbedAt.current.y) / window.innerHeight;
      setDragPos({ fx: clampUnit(origin.current.fx + dx), fy: clampUnit(origin.current.fy + dy) });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      activePointerId.current = null;
      setDragPos((last) => {
        if (last && (last.fx !== origin.current.fx || last.fy !== origin.current.fy)) {
          void api()?.damageOverlay.setPinPosition(last.fx, last.fy);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Only the start/end of a drag should re-arm these — see `GameClockOverlay`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPos !== null]);

  if (!pinned) return null;
  const at = dragPos ?? pinAt;
  const dealers = overlayDealers(stats.fight);
  const topDealt = dealers[0]?.dealt ?? 0;

  return (
    <div className="dmg-hud no-drag" style={{ left: `${at.fx * 100}%`, top: `${at.fy * 100}%` }}>
      <div className="dmg-hud-head">
        <span
          {...SOLID}
          className="dmg-hud-grip"
          title="Drag to move"
          onPointerDown={(e) => {
            // Left button only — a right-click reaching for a context menu shouldn't arm a drag.
            if (e.button !== 0) return;
            // Deliberately no `preventDefault()` — see `GameClockOverlay` for why: this window's
            // solid/glass state is tracked off the browser's compatibility mouse events, and
            // suppressing those would freeze it mid-drag instead of releasing on mouseup.
            e.currentTarget.setPointerCapture(e.pointerId);
            activePointerId.current = e.pointerId;
            origin.current = pinAt;
            grabbedAt.current = { x: e.clientX, y: e.clientY };
            setDragPos(pinAt);
          }}
        >
          ⠿
        </span>
        <span className="dmg-hud-title">Damage</span>
      </div>
      {dealers.length === 0 ? (
        <div className="dmg-hud-empty muted small">No combat yet</div>
      ) : (
        dealers.map((d) => <DealerRow key={d.name} dealer={d} topDealt={topDealt} />)
      )}
    </div>
  );
}

/** One dealer: name and total, then the two bars — by category, then by what actually did it. */
function DealerRow({ dealer, topDealt }: { dealer: OverlayDealer; topDealt: number }) {
  const widthPct = topDealt > 0 ? Math.max(2, (dealer.dealt / topDealt) * 100) : 0;
  return (
    <div className={`dmg-hud-row ${dealer.mine ? "mine" : ""}`}>
      <div className="dmg-hud-label">
        <span className="dmg-hud-name">{dealer.name}</span>
        <span className="dmg-hud-nums">
          {figure(dealer.dealt)} <span className="dmg-hud-dps">{dealer.dps}/s</span>
        </span>
      </div>
      <SegmentBar width={widthPct} segments={dealer.categories} color={(seg) => CATEGORY_COLOR[seg.label] ?? "#888"} />
      <SegmentBar width={widthPct} segments={dealer.sources} color={(_, i) => sourceColor(i)} />
    </div>
  );
}

/**
 * A bar sized to `width` (this dealer's rank against the top one), sliced into `segments` whose own
 * widths are each already a share (0-1) of that bar — the two percentages compose correctly because
 * a slice's on-screen width is `width * share`, exactly its damage over the top dealer's.
 */
function SegmentBar({
  width,
  segments,
  color,
}: {
  width: number;
  segments: OverlaySegment[];
  color: (segment: OverlaySegment, index: number) => string;
}) {
  if (!segments.length) return <div className="dmg-hud-bar-outer" style={{ width: `${width}%` }} />;
  return (
    <div className="dmg-hud-bar-outer" style={{ width: `${width}%` }}>
      {segments.map((seg, i) => (
        <div
          key={seg.label}
          className="dmg-hud-seg"
          style={{ width: `${seg.share * 100}%`, background: color(seg, i) }}
          title={`${seg.label} — ${figure(seg.damage)}`}
        />
      ))}
    </div>
  );
}
