"use client";
import { useMemo, useState } from "react";
import { useCurrentItemCatalog } from "@/lib/hooks";
import { useItemQuery } from "@/lib/items/useItemQuery";
import ItemTable from "@/app/components/items/ItemTable";
import { facetOptions, NO_CRITERIA, type ItemCriteria, type ItemSortKey } from "@/shared/items/item-search";
import type { Sort } from "@/shared/sorting";
import { spellingsOfZone } from "@/shared/zones/zone-page";

const NO_WEIGHTS = {};

/**
 * A zone page's items: the Items tab's search with only its Zone picker set, to this zone under every
 * spelling the catalogue holds (`spellingsOfZone`). The same rows and table as the tab, so an item
 * reads the same here as there.
 *
 * The era toggle is off: the page is about this zone, open or not. Like the tab, it lists only the
 * items already cached, and the From column says whether each drops, is sold or is a quest reward.
 */
export default function ZoneItems({ zone }: { zone: string }) {
  const { rows, loading } = useCurrentItemCatalog();
  const [sort, setSort] = useState<Sort<ItemSortKey>>({ key: "name", desc: false });
  const spellings = useMemo(() => spellingsOfZone(zone, facetOptions(rows, "zone")), [zone, rows]);
  const criteria = useMemo<ItemCriteria>(
    () => ({ ...NO_CRITERIA, hideOutOfEra: false, facets: { ...NO_CRITERIA.facets, zone: spellings } }),
    [spellings],
  );
  const { found } = useItemQuery(rows, criteria, NO_WEIGHTS, sort);

  if (loading) return <p className="muted small">Reading the item cache…</p>;
  // An empty Zone picker means "any zone", so with no spelling to tick there is nothing to show.
  if (!spellings.length) return null;
  return (
    <div className="zone-items">
      <h4 className="muted small">Items from here · {found.length}</h4>
      <ItemTable rows={found} columns={[]} sort={sort} onSort={setSort} scored={false} pickedZones={spellings} />
    </div>
  );
}
