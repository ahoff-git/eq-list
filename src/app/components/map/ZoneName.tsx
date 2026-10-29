"use client";
import ItemLink from "@/app/components/items/ItemLink";
import { notAnItem } from "@/shared/shown-name";
import { zonePageTitle } from "@/shared/zones/zone-page";

/**
 * A zone, named in a view: shown as its source wrote it, opening the zone's own page.
 *
 * **The one way a list or a table names a zone**, so what a zone name does is decided here and
 * nowhere else — to make one open the map instead, change this. `ZoneLink` (`MapLink.tsx`) is this
 * name with a 🗺 beside it, for a row that is about *where something is*.
 *
 * The name is resolved to the wiki's title before it's opened (`zonePageTitle`), because the log's
 * `Nagafen's Lair - Group` and a gazetteer's `Castle Mistmoore` aren't titles the wiki has.
 */
export function ZoneName({ zone, className, children }: { zone: string; className?: string; children?: React.ReactNode }) {
  return <ItemLink title={notAnItem(zonePageTitle(zone))} label={children ?? zone} className={className} />;
}

/**
 * Several zones in a cell that has room for one: the first linked, `+N` for the rest with every
 * name in its hover — the shape the Items and best-in-slot tables both want.
 */
export function ZoneNames({ zones, empty = "—", className }: { zones: readonly string[]; empty?: React.ReactNode; className?: string }) {
  if (!zones.length) return <span className={className}>{empty}</span>;
  const rest = zones.length - 1;
  return (
    <span className={className}>
      <ZoneName zone={zones[0]} />
      {rest > 0 && <span title={`In ${zones.length} zones: ${zones.join(", ")}`}> +{rest}</span>}
    </span>
  );
}
