"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useNav } from "@/lib/nav";
import { useItemCard } from "@/lib/hooks";
import type { ItemCard } from "@/shared/types";

/**
 * Hover an item name to see the wiki's stat card — the same "hover for stats" the
 * wiki gives you — and click to open the page in-app (`useNav`). The card is fetched
 * lazily (only while hovering) and cached; non-item names (mobs, zones) simply show
 * none. It's positioned `fixed` and clamped to the viewport so it isn't clipped by
 * the scrolling panel.
 */
export default function ItemLink({
  title,
  label,
  className,
}: {
  title: string;
  label?: React.ReactNode;
  className?: string;
}) {
  const nav = useNav();
  const hover = useCardHover(title);
  return (
    <span
      className={`link item-link${className ? ` ${className}` : ""}`}
      title="Open"
      onClick={() => nav.openPage(title)}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      {label ?? title}
      {hover.tip}
    </span>
  );
}

/** Hover state: a debounced fetch + a positioned, viewport-clamped card. */
function useCardHover(title: string) {
  const [hovering, setHovering] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = useItemCard(hovering ? title : null);

  function onMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (timer.current) clearTimeout(timer.current);
    // Small delay so a quick pass-over doesn't fetch or flash a card.
    timer.current = setTimeout(() => {
      setPos({ x: rect.left, y: rect.bottom });
      setHovering(true);
    }, 160);
  }
  function onMouseLeave() {
    if (timer.current) clearTimeout(timer.current);
    setHovering(false);
  }

  const tip = hovering && card && pos ? <ItemCardTip card={card} x={pos.x} y={pos.y} /> : null;
  return { onMouseEnter, onMouseLeave, tip };
}

function ItemCardTip({ card, x, y }: { card: ItemCard; x: number; y: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; ready: boolean }>({ left: x, top: y + 6, ready: false });

  // Clamp within the viewport (the panel — or the small overlay window) so the card
  // is never clipped: shift left off the right edge, flip above off the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    let left = x;
    let top = y + 6;
    if (left + r.width + pad > window.innerWidth) left = Math.max(pad, window.innerWidth - r.width - pad);
    if (top + r.height + pad > window.innerHeight) top = Math.max(pad, y - r.height - 6);
    setPlace({ left, top, ready: true });
  }, [x, y, card]);

  return (
    <span
      ref={ref}
      className="item-card"
      role="tooltip"
      style={{ left: place.left, top: place.top, visibility: place.ready ? "visible" : "hidden" }}
    >
      <span className="ic-head">
        {card.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ic-icon" src={card.icon} alt="" width={34} height={34} />
        )}
        <span className="ic-title">{card.title}</span>
      </span>
      {card.lines.map((l, i) => (
        <span className="ic-line" key={i}>
          {l}
        </span>
      ))}
    </span>
  );
}
