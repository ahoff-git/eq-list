"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useOptionalNav } from "@/lib/nav";
import { api } from "@/lib/api";
import { useItemCard } from "@/lib/hooks";
import { placeTooltip, type AnchorBox, type Placement } from "@/shared/tooltip";
import type { ItemCard } from "@/shared/types";

/**
 * Hover an item name to see the wiki's stat card — the same "hover for stats" the
 * wiki gives you — and click to open the page in-app (`useNav`). The card is fetched
 * lazily (only while hovering) and cached; non-item names (mobs, zones) simply show
 * none. It's positioned `fixed` so the scrolling panel can't clip it, and placed *beside* the
 * name — right of it, or left when there's no room — rather than over it. `placeTooltip` owns
 * that rule.
 *
 * The map window has no page view of its own, so a click there hands the name to the
 * control window's Search instead of navigating in place.
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
  const nav = useOptionalNav();
  const hover = useCardHover(title);
  const open = () => (nav ? nav.openPage(title) : void api()?.search.show(title));
  return (
    <span
      className={`link item-link${className ? ` ${className}` : ""}`}
      title={nav ? "Open" : "Look up in the main window"}
      onClick={open}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      {label ?? title}
      {hover.tip}
    </span>
  );
}

/** Hover state: a debounced fetch + a card placed beside the name, never over it. */
function useCardHover(title: string) {
  const [hovering, setHovering] = useState(false);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = useItemCard(hovering ? title : null);

  function onMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (timer.current) clearTimeout(timer.current);
    // Small delay so a quick pass-over doesn't fetch or flash a card.
    timer.current = setTimeout(() => {
      // The whole box, not just a corner: which side the card goes on depends on all four edges.
      setAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      setHovering(true);
    }, 160);
  }
  function onMouseLeave() {
    if (timer.current) clearTimeout(timer.current);
    setHovering(false);
  }

  const tip = hovering && card && anchor ? <ItemCardTip card={card} anchor={anchor} /> : null;
  return { onMouseEnter, onMouseLeave, tip };
}

function ItemCardTip({ card, anchor }: { card: ItemCard; anchor: AnchorBox }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<Placement & { ready: boolean }>({ left: anchor.right + 6, top: anchor.top, ready: false });

  // Measure, then place: the card's own size decides which side of the name it fits beside
  // (`placeTooltip`). Hidden until placed, so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const view = { width: window.innerWidth, height: window.innerHeight };
    setPlace({ ...placeTooltip(anchor, { width: r.width, height: r.height }, view), ready: true });
  }, [anchor, card]);

  return (
    <span
      ref={ref}
      className="item-card"
      role="tooltip"
      style={{
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        visibility: place.ready ? "visible" : "hidden",
      }}
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
