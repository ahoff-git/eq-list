"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { describeCoins, formatCoins } from "@/shared/money";
import ItemLink from "./ItemLink";
import type { MobKnowledge } from "@/shared/mob-stats";

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
 */
export default function MobKnowledgePanel({
  zone,
  refreshKey,
  onMarkMob,
}: {
  zone: string | undefined;
  refreshKey: unknown;
  /** Mark a mob's roam area on the map. */
  onMarkMob?: (mob: MobKnowledge) => void;
}) {
  const [mobs, setMobs] = useState<MobKnowledge[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const a = api();
    if (!a) return;
    const load = () => void a.mobs.all(zone).then(setMobs);
    load();
    // Refetch when the kill log changes in bulk (an imported "eaten" log / a clear), not only
    // when the caller's zone/refreshKey ticks — otherwise digested data waits for a reopen.
    return a.kills.onChanged(load);
  }, [zone, refreshKey]);

  if (mobs.length === 0) {
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
      <div className="row">
        <span className="muted small">
          {mobs.length} mob{mobs.length === 1 ? "" : "s"} observed{zone ? ` in ${zone}` : ""}
        </span>
        <span className="spacer" />
        <button
          className="btn ghost sm"
          title="Forget what peers have told us. Your own observations are kept."
          onClick={() => void api()?.mobs.forgetPeers().then(() => api()?.mobs.all(zone).then(setMobs))}
        >
          Forget peers&apos;
        </button>
      </div>

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
                      <span className={`md-rate ${confidenceClass(mob.kills)}`} title={rateWhy(mob.kills)}>
                        {(drop.rate * 100).toFixed(drop.rate < 0.1 ? 1 : 0)}%
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

/** Dim a rate that rests on too few kills to mean much. */
function confidenceClass(kills: number): string {
  if (kills >= 50) return "solid";
  if (kills >= 15) return "fair";
  return "thin";
}

function rateWhy(kills: number): string {
  if (kills >= 50) return `Out of ${kills} kills — a rate worth trusting.`;
  if (kills >= 15) return `Out of ${kills} kills — indicative, not settled.`;
  return `Out of only ${kills} kills. Treat this as a hint; kill more (or pool with peers).`;
}
