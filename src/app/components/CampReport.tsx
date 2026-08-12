"use client";
import { describeCoins, formatCoins } from "@/shared/money";
import type { MobKillStat, ZoneReport } from "@/shared/types";

import { duration, when } from "@/shared/format";
import { useRead } from "@/lib/hooks";
/** A stable empty, so a render that hasn't heard back yet doesn't look like a change. */
const NO_ZONES: ZoneReport[] = [];

/**
 * "Is this camp worth it?" — the two tables that answer it.
 *
 * **Per mob** (this session): how long one takes to kill and what it pays per minute.
 * **Per zone** (all recorded history): the same question across camps, so tonight's
 * spot can be compared with last week's.
 *
 * Experience is in percent of a level, because that's the only form the log gives. Money is
 * the other half of the answer, and comes in two columns rather than one total: coin the mob
 * carried and what its drops vendored for behave differently and are gathered differently
 * (ADR 0047) — a hover breaks the split out where the table shows the sum.
 * `refreshKey` re-reads the zone table — history only changes when a fight ends.
 */
export default function CampReport({ byMob, refreshKey }: { byMob: MobKillStat[]; refreshKey: string }) {


  const zones = useRead((a) => a.combat.zones(), NO_ZONES, [refreshKey]);

  return (
    <>
      <h3 className="section-head" title="From this session's fights">
        Per mob, this session
      </h3>
      {byMob.length === 0 ? (
        <p className="muted small">Nothing killed yet this session.</p>
      ) : (
        <div className="table-scroll">
          <table className="stat-table">
            <thead>
              <tr>
                <th>Mob</th>
                <th>Kills</th>
                <th title="Average time from the previous kill in the fight">Kill time</th>
                <th title="Experience credited to it, in percent of a level">XP</th>
                <th title="Percent of a level per minute spent fighting it — downtime excluded, so it ranks mobs rather than forecasting an evening">
                  XP/min fighting
                </th>
                <th title="Coin off its corpses plus what its drops auto-sold for — hover a figure for the split">
                  Coin
                </th>
                <th title="That coin per minute spent fighting it — same caveat as XP/min: it ranks mobs, it doesn't forecast an evening">
                  Coin/min fighting
                </th>
              </tr>
            </thead>
            <tbody>
              {byMob.map((m) => (
                <tr key={m.mob}>
                  <td>{m.mob}</td>
                  <td>{m.kills}</td>
                  <td>{m.avgKillSec ? `${m.avgKillSec}s` : "—"}</td>
                  <td>{m.xpPct ? `${m.xpPct}%` : "—"}</td>
                  <td className="num-accent">{m.xpPerMin ? `${m.xpPerMin}%` : "—"}</td>
                  <td title={coinSplit(m)}>{coinTotal(m) ? formatCoins(coinTotal(m)) : "—"}</td>
                  <td className="num-accent">{m.copperPerMin ? formatCoins(m.copperPerMin) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-head" title="Every fight ever recorded, grouped by zone">
        Per zone, all time
      </h3>
      {zones.length === 0 ? (
        <p className="muted small">
          No zoned history yet — fights are filed against whatever zone the log last reported.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="stat-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Fights</th>
                <th>Kills</th>
                <th title="Time in combat, downtime excluded">Combat</th>
                <th title="Per minute of combat in the zone, downtime excluded">XP/min fighting</th>
                <th title="Coin and sales per minute of combat. Fights recorded before coin was parsed contribute none, so a long history reads low until it turns over">
                  Coin/min fighting
                </th>
                <th>DPS</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.zone} title={`Last fought ${when(z.lastAt)}`}>
                  <td>{z.zone}</td>
                  <td>{z.fights}</td>
                  <td>{z.kills}</td>
                  <td>{duration(z.combatSec)}</td>
                  <td className="num-accent">{z.xpPerMin ? `${z.xpPerMin}%` : "—"}</td>
                  <td
                    className="num-accent"
                    title={`${describeCoins(z.copper ?? 0)} off corpses · ${describeCoins(z.soldCopper ?? 0)} from auto-sold drops`}
                  >
                    {z.copperPerMin ? formatCoins(z.copperPerMin) : "—"}
                  </td>
                  <td>{z.dps || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}



/** Everything the mob was worth, in copper. */
function coinTotal(m: MobKillStat): number {
  return (m.copper ?? 0) + (m.soldCopper ?? 0);
}

/** The split behind the total, for the hover — the table shows one number, this says why. */
function coinSplit(m: MobKillStat): string {
  return `${describeCoins(m.copper ?? 0)} off its corpses · ${describeCoins(m.soldCopper ?? 0)} from auto-sold drops`;
}
