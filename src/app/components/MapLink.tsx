"use client";
import { showOnMap } from "@/lib/showOnMap";
import { locText } from "@/shared/format";
import { roamWhy, type MobArea } from "@/shared/mob-stats";
import type { MapFocus, MapTarget } from "@/shared/types";

/**
 * MapLink — anything you can click to see it on the map.
 *
 * A page is text, and where a thing lives is the one part of it that belongs on a map
 * ([ADR 0104](../../../specs/decisions/0104-a-position-is-read-and-arrives-with-its-evidence.md)).
 * Five lists had each grown their own version of that click, and they had already drifted: two
 * spellings of the tooltip, three of the coordinate, and a `focus` that only the newest ones passed
 * — so the same gesture explained itself differently depending on which panel you were in.
 *
 * One component, three shapes over it, because a click that opens the map is always one of three
 * things: a **zone** (`ZoneLink`), a **spot** (`MapLink` with a `loc`), or an **observed roam
 * centre** (`RoamLink`, which is a spot that also knows how rough it is and what it rests on).
 *
 * **A click stops here** (`stopPropagation`), like `ItemLink`'s: these sit inside rows that are
 * themselves clickable — a kill group opens, a mob's knowledge unfolds — and a click that did both
 * would open the map *and* toggle the row out from under it.
 */
export default function MapLink({
  target,
  title,
  className,
  as = "link",
  children,
}: {
  target: MapTarget;
  title?: string;
  className?: string;
  /** How it reads: an inline `link` inside a sentence, or a `button` at the end of a row. */
  as?: "link" | "button";
  children: React.ReactNode;
}) {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    showOnMap(target);
  };
  const cls = `${as === "button" ? "btn ghost sm" : "link"}${className ? ` ${className}` : ""}`;
  const label = title ?? describe(target);
  return as === "button" ? (
    <button className={cls} title={label} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={cls} title={label} onClick={onClick}>
      {children}
    </span>
  );
}

/**
 * What a click will do, said once.
 *
 * The tooltip is not decoration here: opening the map is a window appearing, and a focused target
 * *also* narrows the map's own lists — so the row has to say so before it's clicked rather than
 * leave the player to work out why the panel came up filtered.
 */
function describe(target: MapTarget): string {
  const where = target.loc ? `Show this spot on the map (${locText(target.loc)})` : `View ${target.zone} on the map`;
  return target.focus?.mob || target.focus?.drop ? `${where}, with what's known about it picked out` : where;
}

/** A zone name that views that zone — the plainest form, and the one every list has. */
export function ZoneLink({
  zone,
  focus,
  className,
  children,
}: {
  zone: string;
  focus?: MapFocus;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <MapLink target={{ zone, focus }} className={className}>
      {children ?? zone}
    </MapLink>
  );
}

/**
 * An observed roam centre: **the coordinate, printed**, with its spread beside it.
 *
 * The numbers are the point. A roam centre is a figure a player reads and types into the game, so a
 * button that showed only `±30` hid the useful half of it (ADR 0104). The wording underneath is
 * `roamWhy`'s, so this figure means the same thing here as everywhere else it appears.
 */
export function RoamLink({
  zone,
  area,
  mob,
  drop,
  label,
}: {
  zone: string;
  area: MobArea;
  /** Whose roam centre it is — named on the marker, and what the map's lists narrow to. */
  mob: string;
  /** The drop this position was looked up for, when it was looked up from an item. */
  drop?: string;
  /** What to write on the marker (defaults to the mob, or "item · mob" when a drop is named). */
  label?: string;
}) {
  return (
    <MapLink
      as="button"
      className="mk-loc"
      title={`${roamWhy(area)} — click to open the map there, with these kills picked out`}
      target={{
        zone,
        loc: { y: area.y, x: area.x },
        label: label ?? (drop ? `${drop} · ${mob}` : mob),
        focus: { mob, drop },
      }}
    >
      {locText(area)} <span className="muted">±{area.spread}</span>
    </MapLink>
  );
}
