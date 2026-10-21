"use client";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useOptionalNav } from "@/lib/chrome/nav";
import { api } from "@/lib/api";
import { useClosedZones, useItemCard, useWikiPage } from "@/lib/hooks";
import { localSize, localTextBox, localView, scaleRoot } from "@/lib/screen";
import { besideWidth, placeTooltip, type AnchorBox, type Placement } from "@/shared/chrome/tooltip";
import { craftNotes } from "@/shared/tradeskills/craft-notes";
import type { ItemCard } from "@/shared/types";
import LevelledText from "@/app/components/items/LevelledText";
import { itemGrade } from "@/shared/names";
import { cardAtLevel, ladderOf, pageForName, unrankedSpellTitle } from "@/shared/upgrade-view";
import type { ShownName } from "@/shared/shown-name";

/**
 * Hover an item name to see the wiki's stat card — the same "hover for stats" the
 * wiki gives you — and click to open the page in-app (`useNav`). The card is fetched
 * lazily (only while hovering) and cached; non-item names (mobs, zones) simply show
 * none. It's positioned `fixed` so the scrolling panel can't clip it, and placed *beside* the
 * name — right of it, or left when there's no room, narrowing to whatever room there is rather than
 * dropping onto the rows above and below — never over it. `placeTooltip` and `besideWidth` own that
 * rule; `lib/screen.ts` hands them measurements in the units the placement is written in, which is
 * not the same as the units it was measured in (the interface scale is a CSS `zoom`, ADR 0041).
 *
 * The card is portaled to `scaleRoot()` rather than rendered where the name sits. A name inside a
 * `DataGrid` cell (Items, Loot, Faction's standings…) sits under the grid's own root, which carries a
 * `transform` of its own (MUI pins its scrollbars with one) — and a transformed ancestor becomes the
 * containing block for `position: fixed` too, so the card measured itself against the window but was
 * placed against the grid instead, landing well off from the name. `scaleRoot()` is outside anything
 * a table underneath it might have transformed, but still inside the zoomed shell, so the card's own
 * already-zoom-divided math still lands correctly.
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
  craft,
}: {
  /** A name with its level decided — see `shown-name.ts` — so the card is shown at the right one. */
  title: ShownName;
  label?: React.ReactNode;
  className?: string;
  /** Add a crafter's lines under the card — where to buy it, what it's made from, what uses it
   *  (`craft-notes.ts`). For the Tradeskills tab; everywhere else the card alone is the answer. */
  craft?: boolean;
}) {
  const nav = useOptionalNav();
  const hover = useCardHover(title, craft);
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
  /** Each with its level decided by the caller (`shown-name.ts`). */
  names: readonly ShownName[];
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
function useCardHover(title: string, craft = false) {
  const [hovering, setHovering] = useState(false);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A name that states a level (`Dragoon Dirk +2`, `Shock of Lightning VI`) gets the card *at* that level,
  // which needs the whole page (its kind, a spell's category) rather than the bare card.
  const levelled = !craft && (itemGrade(title) !== undefined || !!unrankedSpellTitle(title));
  const card = useItemCard(hovering && !craft && !levelled ? title : null);

  function onMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    // The whole box, not just a corner: which side the card goes on depends on all four edges. And
    // the box of the *words*, not the one CSS gave them — a name in a list row is a stretched flex
    // item, and a card asked to sit beside a row-wide box has nowhere to go (`localTextBox`).
    const box = localTextBox(e.currentTarget);
    if (timer.current) clearTimeout(timer.current);
    // Small delay so a quick pass-over doesn't fetch or flash a card.
    timer.current = setTimeout(() => {
      setAnchor(box);
      setHovering(true);
    }, 160);
  }
  function onMouseLeave() {
    if (timer.current) clearTimeout(timer.current);
    setHovering(false);
  }

  const tip = !hovering || !anchor ? null : craft ? (
    <CraftCardTip title={title} anchor={anchor} />
  ) : levelled ? (
    <LevelledCardTip title={title} anchor={anchor} />
  ) : card ? (
    <ItemCardTip card={card} anchor={anchor} />
  ) : null;
  return { onMouseEnter, onMouseLeave, tip };
}

/**
 * The card plus the crafting lines. Mounted only while hovering, so the page read and the era list it
 * judges vendors against cost nothing for the hundred links a guide holds until one is pointed at.
 * Shown for a page with no stat card too, when it has something to say about buying it.
 */
function CraftCardTip({ title, anchor }: { title: string; anchor: AnchorBox }) {
  const page = useWikiPage(title);
  const closed = useClosedZones();
  const notes = craftNotes(page, closed);
  if (!page || (!page.card && !notes.length)) return null;
  return <ItemCardTip card={page.card ?? { title: page.title, lines: [] }} anchor={anchor} notes={notes} />;
}

/**
 * The card at the level the name states. Mounted only while hovering, like `CraftCardTip`. A ranked
 * spell has no page of its own, so a miss falls back to the base spell — but only to a *spell* page,
 * so an item that merely ends in a numeral never borrows a stranger's card.
 */
function LevelledCardTip({ title, anchor }: { title: string; anchor: AnchorBox }) {
  const asked = useWikiPage(title);
  const unranked = unrankedSpellTitle(title);
  const fallback = useWikiPage(asked === null && unranked ? unranked : null);
  const shown = pageForName(title, asked, fallback);
  const card = useMemo(() => (shown ? cardAtLevel(shown.page, ladderOf(shown.page), shown.level) : undefined), [shown]);
  return card ? <ItemCardTip card={card} anchor={anchor} base={shown?.page.card?.lines} /> : null;
}

function ItemCardTip({
  card,
  anchor,
  notes,
  base,
}: {
  card: ItemCard;
  anchor: AnchorBox;
  notes?: string[];
  /** The level-0 card's lines, when `card` is at a level — so what the level moved is marked. */
  base?: readonly string[];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // How wide it may be is a question about where the name sits, not about the card, so it's answered
  // before the first paint — the measurement below then sees the size the card will keep.
  const avail = useMemo(() => besideWidth(anchor, localView()), [anchor]);
  // Measured at the window's corner rather than at a guessed spot: a card aimed past the right edge
  // has no width to shrink to fit in, so it would measure as a one-word column and place as if it
  // were taller than the window.
  const [place, setPlace] = useState<Placement & { ready: boolean }>({ left: 0, top: 0, ready: false });

  // Measure, then place: the card's own size decides which side of the name it fits beside
  // (`placeTooltip`). Hidden until placed, so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPlace({ ...placeTooltip(anchor, localSize(el), localView()), ready: true });
  }, [anchor, card, notes?.length]);

  return createPortal(
    <span
      ref={ref}
      className="item-card"
      role="tooltip"
      style={{
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        // Only when the card had to give up width to stay beside the name; otherwise the
        // stylesheet's own full width stands.
        ...(avail !== null && { "--tip-avail": `${avail}px` }),
        visibility: place.ready ? "visible" : "hidden",
      } as CSSProperties}
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
          {base ? <LevelledText base={base[i]} line={l} /> : l}
        </span>
      ))}
      {notes && notes.length > 0 && (
        <span className="ic-craft">
          {notes.map((n, i) => (
            <span className="ic-craft-line" key={i}>
              {n}
            </span>
          ))}
        </span>
      )}
    </span>,
    scaleRoot(),
  );
}
