"use client";
import { api } from "@/lib/api";
import { useMobZones } from "@/lib/hooks";
import { dropRate, rateConfidence, rateWhy } from "@/shared/drop-truth";
import { count, locText } from "@/shared/format";
import { describeCoins, formatCoins } from "@/shared/money";
import { roamWhy, type MobKnowledge } from "@/shared/mob-stats";
import ItemLink from "./ItemLink";

/**
 * What **your** kills say about the mob whose page you're reading — one block per zone you've killed
 * it in, with the observed drop rates and where it turned out to live.
 *
 * The page above it is the wiki's claim; this is the evidence
 * ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)). Until now that evidence
 * only existed in the map window's 📖 panel, which answers "what's in this zone" — so a mob you were
 * *reading about* couldn't tell you that you've killed it ninety times and never seen the drop the
 * page lists. Same data, asked the other way round: by mob rather than by zone.
 *
 * **Every position here opens the map**, which is the other half of what a page can't do. The zone
 * name views that zone, and the roam centre — a real coordinate, averaged from your own kills — drops
 * a marker on it, exactly as clicking a wiki `Location:` does. Pointing at a block rings that mob's
 * kills on an already-open map (the Hunt tab's gesture); it never opens one, since a window that
 * appears because the cursor crossed a name is one nobody asked for.
 */
export default function MobKills({ mob }: { mob: string }) {
  const zones = useMobZones(mob);
  const kills = zones.reduce((n, z) => n + z.kills, 0);
  /** Ring this mob's kills on a map that's already open (null takes the ask back). */
  const emphasize = (on: boolean) => api()?.map.emphasize(on ? { mobs: [mob] } : null);

  if (zones.length === 0) {
    return (
      <p className="muted small" style={{ marginTop: 12 }}>
        You haven&apos;t killed this yet — the rates above are the wiki&apos;s, from an older build.
        Kill it and your own turn up here.
      </p>
    );
  }

  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>
        Your kills · {count(kills, "kill")} in {count(zones.length, "zone")}
      </h4>
      <div className="mob-kills" onMouseLeave={() => emphasize(false)}>
        {zones.map((z) => (
          <div className="mk-zone" key={z.zone} onMouseEnter={() => emphasize(true)}>
            <div className="mk-head">
              <span
                className="link"
                title={`View ${z.zone} on the map, with this mob's kills picked out`}
                onClick={() => api()?.map.openAt(z.zone, undefined, undefined, { mob })}
              >
                {z.zone}
              </span>
              <span className="muted small" title={whoseKills(z)}>
                {count(z.kills, "kill")}
                {z.kills > z.myKills ? ` (${z.myKills} yours)` : ""}
              </span>
              {z.copper > 0 && (
                <span
                  className="muted small"
                  title={`${describeCoins(z.copper)} off ${z.kills} corpses — the coin it carried, not what its drops sell for`}
                >
                  {formatCoins(z.copperPerKill)}/kill
                </span>
              )}
              <span className="spacer" />
              {z.area && (
                // Readable as well as clickable: the numbers are what you type into the game, and
                // the click opens the map there with this mob's kills picked out (ADR 0104).
                <button
                  className="btn ghost sm mk-loc"
                  title={`${roamWhy(z.area)} — click to open the map there and show these kills`}
                  onClick={() =>
                    api()?.map.openAt(z.zone, { y: z.area!.y, x: z.area!.x }, mob, { mob })
                  }
                >
                  {locText(z.area)} <span className="muted">±{z.area.spread}</span>
                </button>
              )}
            </div>
            <div className="mob-drops">
              {z.drops.length === 0 ? (
                <span className="muted small">Nothing has dropped here yet.</span>
              ) : (
                z.drops.map((drop) => (
                  <div className="mob-drop" key={drop.item}>
                    <ItemLink title={drop.item} />
                    <span className="spacer" />
                    <span className="md-count muted small">
                      {drop.count}/{z.kills}
                    </span>
                    <span className={`md-rate ${rateConfidence(z.kills)}`} title={rateWhy(z.kills)}>
                      {dropRate(drop.rate)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Whose kills are behind a zone's tally — the provenance every pooled figure carries. */
function whoseKills(zone: MobKnowledge): string {
  const pooled = zone.kills - zone.myKills;
  return pooled > 0
    ? `${zone.myKills} of these were yours; ${pooled} came from ${zone.contributors.join(", ")}`
    : "All your own kills";
}
