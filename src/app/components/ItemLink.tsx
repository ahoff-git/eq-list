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
 *
 * **A click stops here.** Names sit inside rows that are themselves clickable — a kill group opens,
 * a mob's knowledge unfolds — and a click that did both would open the page *and* toggle the row
 * out from under it. Clicking a name means one thing: look this up.
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
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nav) nav.openPage(title);
    else void api()?.search.show(title);
  };
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

/**
 * Several names on one line — "what it dropped", "who drops it here" — comma-separated.
 *
 * Four lists were building this by hand, each with its own `{i > 0 && ", "}` and its own answer to
 * what a name's React key is (one of them the item name, one the index, one both). The separator is a
 * detail of how a list of names is written, not of what any panel means, so it lives here with the
 * link itself.
 *
 * `extra` is what a list has to say about an individual name — a count, a rate — placed after it and
 * outside the link, so it isn't part of what you click.
 */
export function NameList({
  names,
  extra,
  className,
}: {
  names: readonly string[];
  /** Given the position too, so a caller with a parallel list of counts needn't search it. */
  extra?: (name: string, index: number) => React.ReactNode;
  /** The wrapper's class — each list has its own idea of how wide and how wrapped it is. */
  className?: string;
}) {
  return (
    <span className={className}>
      {names.map((name, i) => (
        // Keyed by position as well as name: a mob can drop two of a thing, and the same name twice
        // in one list is two rows claiming one key.
        <span key={`${name}-${i}`}>
          {i > 0 && ", "}
          <ItemLink title={name} />
          {extra?.(name, i)}
        </span>
      ))}
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
