"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { describeCoins, formatCoins } from "@/shared/money";
import ItemLink from "./ItemLink";
import type { MobKnowledge } from "@/shared/mob-stats";
import { dropRate, rateConfidence } from "@/shared/drop-truth";
import { filterMobKnowledge, type KillFilters } from "@/shared/kill-filters";
import KillFilterBar from "./KillFilterBar";

/**
 * What killing things has taught us: how often each mob drops what, what it carries, and
 * roughly where it lives. All three are *observed* — the wiki's rates are someone else's
 * sample, these are yours (pooled with any peers sharing theirs).
 *
 * Coin here is the mob's own money per kill, never what its drops vendor for: those come from
 * different lines, pool differently, and answer different questions (ADR 0047).
 *
 * A rate is only as good as its denominator, so every row leads with the kill count and says
 * how much of it you saw yourself. Three kills is not a drop rate, and the display shouldn't
 * let anyone pretend otherwise.
 *
 * Headed by the **same bar as the ☠ kill list** (`KillFilterBar`), sharing the map window's one set of
 * filters. It used to spend a whole row on "14 mobs observed in Kerra Ridge" and a button, so opening
 * both panels cost two rows that said two different things before either list began. The count now sits
 * in a bar that also filters, and the 📖 in front of it is what says which toolbar button you're looking
 * at the panel for.
 */
export default function MobKnowledgePanel({
  zone,
  refreshKey,
  filters,
  onFilters,
  onMarkMob,
}: {
  zone: string | undefined;
  refreshKey: unknown;
  /** The map window's one set of kill filters — see `filterMobKnowledge` for which apply here. */
  filters: KillFilters;
  onFilters: (next: KillFilters) => void;
  /** Mark a mob's roam area on the map. */
  onMarkMob?: (mob: MobKnowledge) => void;
}) {
  const [all, setAll] = useState<MobKnowledge[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const mobs = useMemo(() => filterMobKnowledge(all, filters), [all, filters]);
  // The picker offers what's here *before* filtering, or choosing a mob would empty its own list.
  const names = useMemo(() => [...new Set(all.map((m) => m.mob))].sort(), [all]);

  useEffect(() => {
    const a = api();
    if (!a) return;
    const load = () => void a.mobs.all(zone).then(setAll);
    load();
    // Refetch when the kill log changes in bulk (an imported "eaten" log / a clear), not only
    // when the caller's zone/refreshKey ticks — otherwise digested data waits for a reopen.
    return a.kills.onChanged(load);
  }, [zone, refreshKey]);

  if (all.length === 0) {
    return (
      <div className="mob-knowledge no-drag">
        <p className="muted small">
          Nothing learned here yet. Kill something — drop rates and roam areas build up from your
          own kills, and pool with anyone sharing theirs.
        </p>
      </div>
    );
  }

  return (
    <div className="mob-knowledge no-drag">
      {/* The same bar the ☠ list is headed by. A time window and a position floor are facts about one
          kill, and this is a lifetime tally of many, so neither is offered here. */}
      <KillFilterBar
        icon="📖"
        what="learned"
        toggledBy="shows and hides this"
        filters={filters}
        onFilters={onFilters}
        mobs={names}
        withWindow={false}
        withPosition={false}
        tally={
          <>
            {mobs.length}
            {mobs.length === all.length ? "" : ` of ${all.length}`} mob{all.length === 1 ? "" : "s"} observed
            {zone ? ` in ${zone}` : ""}
          </>
        }
      >
        <button
          className="btn ghost sm"
          title="Forget what peers have told us. Your own observations are kept."
          onClick={() => void api()?.mobs.forgetPeers().then(() => api()?.mobs.all(zone).then(setAll))}
        >
          Forget peers&apos;
        </button>
      </KillFilterBar>

      {mobs.length === 0 && (
        <p className="muted small">
          Nothing here matches the filters — {all.length} mob{all.length === 1 ? " is" : "s are"} known in this
          zone.
        </p>
      )}

      {mobs.map((mob) => {
        const key = `${mob.mob}|${mob.zone}`;
        const pooled = mob.kills - mob.myKills;
        return (
          <div className={`mob-row ${open === key ? "open" : ""}`} key={key}>
            <div className="mob-head" onClick={() => setOpen(open === key ? null : key)}>
              <span className="caret">{open === key ? "▾" : "▸"}</span>
              <span className="mob-name">{mob.mob}</span>
              <span
                className="muted small"
                title={
                  pooled > 0
                    ? `${mob.myKills} of these were yours; ${pooled} came from ${mob.contributors.join(", ")}`
                    : "All your own kills"
                }
              >
                {mob.kills} kill{mob.kills === 1 ? "" : "s"}
                {pooled > 0 ? ` (${mob.myKills} yours)` : ""}
              </span>
              {mob.copper > 0 && (
                <span
                  className="muted small"
                  title={`${describeCoins(mob.copper)} off ${mob.kills} corpses — the coin it carried, not what its drops sell for`}
                >
                  {formatCoins(mob.copperPerKill)}/kill
                </span>
              )}
              <span className="spacer" />
              {mob.area && onMarkMob && (
                <button
                  className="btn ghost sm"
                  title={`Roams within about ${mob.area.spread} units of ${Math.round(mob.area.y)}, ${Math.round(mob.area.x)} — click to pin it on the map`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkMob(mob);
                  }}
                >
                  ±{mob.area.spread}
                </button>
              )}
            </div>

            {open === key && (
              <div className="mob-drops">
                {mob.drops.length === 0 ? (
                  <span className="muted small">Never seen it drop anything.</span>
                ) : (
                  mob.drops.map((drop) => (
                    <div className="mob-drop" key={drop.item}>
                      <ItemLink title={drop.item} />
                      <span className="spacer" />
                      <span className="md-count muted small">
                        {drop.count}/{mob.kills}
                      </span>
                      <span className={`md-rate ${rateConfidence(mob.kills)}`} title={rateWhy(mob.kills)}>
                        {dropRate(drop.rate)}
                      </span>
                    </div>
                  ))
                )}
                {mob.contributors.length > 0 && (
                  <span className="muted small">pooled with {mob.contributors.join(", ")}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Why a rate is dimmed or not — the wording for each rung of `rateConfidence`'s ladder.
 *
 * The thresholds themselves are `drop-truth`'s: they're the same decision as "when do our own kills
 * beat the wiki's figure", and were stated here as bare numbers in two places.
 */
function rateWhy(kills: number): string {
  switch (rateConfidence(kills)) {
    case "solid":
      return `Out of ${kills} kills — a rate worth trusting.`;
    case "fair":
      return `Out of ${kills} kills — indicative, not settled.`;
    default:
      return `Out of only ${kills} kills. Treat this as a hint; kill more (or pool with peers).`;
  }
}
