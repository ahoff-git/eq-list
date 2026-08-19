"use client";
import { useItemDrops, useItemPrices } from "@/lib/hooks";
import { ringMob, ringOnHover } from "@/lib/showOnMap";
import { dropRate, rateConfidence, rateWhy } from "@/shared/drop-truth";
import { count } from "@/shared/format";
import { itemDropTotals, priceOfItem, type ItemDropSource } from "@/shared/item-sources";
import { describeCoins, formatCoins } from "@/shared/money";
import ItemLink from "./ItemLink";
import { RoamLink, ZoneLink } from "./MapLink";
import type { ItemSource } from "@/shared/types";

/**
 * What **your** kills say about the item whose page you're reading — who drops it, where, and what
 * it has sold for.
 *
 * The item-page twin of [MobKills](./MobKills.tsx), and it exists because this is the page the wiki
 * answers worst. Its "Drops From" names a mob and a zone and never a rate, and it describes an older
 * build — so an item this game drops off something the wiki never linked has, until now, had nowhere
 * on its own page to say so ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)).
 * Every row here is evidence: a mob we watched give it up, the camps we killed it in, and — from the
 * positions on those kills — roughly *where* in the camp it was standing.
 *
 * **Every position opens the map** (`MapLink`), exactly as a mob page's does: the zone views that
 * zone, and the roam centre — printed, since a coordinate is a figure you read as well as click —
 * marks the spot and brings up what dropped there. Pointing at a mob rings its kills on an
 * already-open map; it never opens one, since a window that appears because the cursor crossed a
 * name is one nobody asked for.
 */
export default function ItemDrops({ item, sources }: { item: string; sources: ItemSource[] }) {
  const rows = useItemDrops(item, sources);
  // Only a sale can teach a price, and the open page is the cheapest key there is: it re-reads when
  // you navigate rather than per drop, which is right for a figure that changes about never.
  const prices = useItemPrices(item);
  const price = priceOfItem(item, prices);
  const totals = itemDropTotals(rows);
  const wikiClaimsDrops = sources.some((s) => s.kind === "drop");

  const priceLine = price && (
    <p className="muted small" style={{ marginTop: 8 }}>
      Vendors for{" "}
      <span title={`${describeCoins(price.unitCopper)} each, from ${count(price.sales, "auto-sell")} of your own`}>
        {formatCoins(price.unitCopper)}
      </span>
      {price.item.toLowerCase() !== item.toLowerCase() ? ` — what your “${price.item}” sold for` : ""}
    </p>
  );

  if (rows.length === 0) {
    // A vendor item or a quest reward has nothing to be missing, so it gets no notice at all —
    // only a thing the wiki says drops has an absence worth remarking on.
    if (!wikiClaimsDrops) return priceLine || null;
    return (
      <>
        <p className="muted small" style={{ marginTop: 12 }}>
          You haven&apos;t seen this drop yet — the sources above are the wiki&apos;s, from an older
          build. Kill what it lists and your own turn up here.
        </p>
        {priceLine}
      </>
    );
  }

  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>
        {totals.seen > 0
          ? `Where you've seen it drop · ${count(totals.seen, "drop")} from ${count(totals.mobs, "mob")} in ${count(totals.kills, "kill")}`
          : `What your kills say · ${count(totals.kills, "kill")} and none of them dropped it`}
      </h4>
      {/* Leaving the block clears the ringing outright — the backstop every list that rings kills
          keeps, since switching tabs fires no `mouseleave` on the row the cursor was on. */}
      <div className="mob-kills" onMouseLeave={() => ringMob(null)}>
        {rows.map((row) => (
          <div className="mk-zone" key={row.mob} {...ringOnHover(row.mob)}>
            <div className="mk-head">
              <ItemLink title={row.mob} className="name" />
              {row.verdict === "undocumented" && (
                <span
                  className="badge rate-observed"
                  title="No source on this page names it. Something this build does that the wiki doesn't know."
                >
                  not on the wiki
                </span>
              )}
              {row.suspicious && (
                <span
                  className="badge era-out"
                  title={`The wiki lists this as a source, but ${row.kills} kills haven't produced one. Treat the claim with suspicion.`}
                >
                  unseen in {row.kills}
                </span>
              )}
              <span className="spacer" />
              <span className={`md-rate ${rateConfidence(row.kills)}`} title={rateWhy(row.kills)}>
                {dropRate(row.rate)}
              </span>
              <span className="muted small" title={whoseKills(row)}>
                {row.seen}/{row.kills}
                {row.kills > row.myKills ? ` (${row.myKills} yours)` : ""}
              </span>
            </div>
            <div className="mob-drops">
              {row.places.map((place) => (
                <div className="mob-drop" key={place.zone}>
                  <ZoneLink zone={place.zone} focus={{ mob: row.mob, drop: item }} />
                  <span className="spacer" />
                  <span className="md-count muted small">
                    {place.seen}/{place.kills}
                  </span>
                  {/* The coordinate itself is the control: a rough y,x is worth reading — it goes
                      straight into the game — as well as clicking. */}
                  {place.area && <RoamLink zone={place.zone} area={place.area} mob={row.mob} drop={item} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {priceLine}
    </>
  );
}

/** Whose kills are behind a row's tally — the provenance every pooled figure carries. */
function whoseKills(row: ItemDropSource): string {
  const pooled = row.kills - row.myKills;
  return pooled > 0
    ? `${row.myKills} of these were yours; ${pooled} came from ${row.contributors.join(", ")}`
    : "All your own kills";
}
