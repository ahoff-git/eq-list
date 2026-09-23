"use client";
import { useMemo } from "react";
import { useParty } from "@/lib/hooks";
import { rowsOf, usePeerShare } from "@/lib/usePeerShare";
import type { FightShare } from "@/shared/peer-share";
import type { FightStats } from "@/shared/types";
import { ratio } from "@/shared/numbers";
import { when } from "@/shared/format";
import { Empty } from "./ui";

/**
 * How stale a party-mate's shared fight may be and still count as **the same pull** you're in.
 *
 * A peer's `fight` row travels on the share hub's ordinary catalogue tick (`OFFER_TICK_MS`, 60s)
 * plus one ask/give round trip, so "just swung" can legitimately read as half a minute old by the
 * time it reaches you. Generous headroom over that, not a guess at how long a real pull lasts.
 */
const PEER_LIVE_MS = 120_000;

/** One metric this section can show, and how to read it off a fight's own figures. */
interface Metric {
  label: string;
  pick: (f: { yourDealt: number; yourTaken: number; yourHealed: number; yourHealReceived: number; durationSec: number }) => number;
  /** Whether the highest column is worth calling out — not "Taken", where more isn't a win. */
  callOut: boolean;
}

const METRICS: Metric[] = [
  { label: "Damage", pick: (f) => f.yourDealt, callOut: true },
  { label: "DPS", pick: (f) => ratio(f.yourDealt, f.durationSec, 1), callOut: true },
  { label: "Healing", pick: (f) => f.yourHealed, callOut: true },
  { label: "HPS", pick: (f) => ratio(f.yourHealed, f.durationSec, 1), callOut: true },
  { label: "Taken", pick: (f) => f.yourTaken, callOut: false },
  { label: "Healing received", pick: (f) => f.yourHealReceived, callOut: false },
];

/**
 * Compare your live fight with your group's, as they report it — never merged into your own
 * figures, the same rule `PeerScores` holds high scores to
 * ([ADR 0274](../../../specs/decisions/0274-a-fight-is-compared-live-with-your-party.md)).
 *
 * **Party-scoped, not room-wide.** Matching is otherwise unsolved — the log gives no shared fight
 * id, so nothing here can prove two installs are in the same pull. Restricting to your own roster
 * (`useParty`, folded from your log's own group lines) makes the remaining question answerable by a
 * much weaker signal: a party-mate who's sharing, in your zone, recently active, almost certainly
 * *is* the fight you're in — a stranger at the same camp is exactly the case ADR 0067 already
 * excludes everywhere else on this tab.
 *
 * Renders nothing when you aren't grouped: a comparison section with nobody to compare against is
 * noise for the large share of fights nobody groups for.
 */
export default function PeerFightCompare({ window, zone }: { window: FightStats; zone: string | null | undefined }) {
  const { received } = usePeerShare();
  const party = useParty();

  const mates = useMemo(() => {
    if (!party.length) return [];
    const inParty = new Set(party.map((n) => n.toLowerCase()));
    return rowsOf<FightShare>(received, "fight").filter((r) => inParty.has(r.by.toLowerCase()));
  }, [received, party]);

  if (!party.length) return null;

  const now = Date.now();
  const freshEnough = (row: FightShare): boolean => {
    const at = Date.parse(row.endedAt || row.startedAt);
    return !Number.isNaN(at) && now - at < PEER_LIVE_MS;
  };
  const live = mates.filter((m) => (!zone || m.row.zone === zone) && freshEnough(m.row));
  const elsewhere = mates.filter((m) => !live.includes(m));
  // Older stored figures predate healing (absent, not zero) — normalized here rather than at every
  // `Metric.pick`, the same `?? 0` fallback `DamagePanel`'s own stat tiles already use.
  const mine = {
    yourDealt: window.yourDealt,
    yourTaken: window.yourTaken,
    yourHealed: window.yourHealed ?? 0,
    yourHealReceived: window.yourHealReceived ?? 0,
    durationSec: window.durationSec,
  };

  return (
    <section className="peers-block peer-fight">
      <h3>Compare with your group</h3>
      {!mates.length ? (
        <Empty
          title="Nobody in your group is sharing their fight."
          hint={'Ask them to turn on "Current fight" under What you share, on their Peers tab.'}
        />
      ) : (
        <>
          {!!live.length && (
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="mine">You</th>
                  {live.map((m) => (
                    <th key={m.peerId}>{m.by}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.filter(
                  (m) => m.pick(mine) > 0 || live.some((p) => m.pick(p.row) > 0),
                ).map((metric) => {
                  const values = [mine, ...live.map((p) => p.row)].map(metric.pick);
                  const top = metric.callOut ? Math.max(...values) : -1;
                  return (
                    <tr key={metric.label}>
                      <td>{metric.label}</td>
                      <td className={`mine${values[0] === top && top > 0 ? " leader" : ""}`}>
                        {values[0].toLocaleString()}
                      </td>
                      {live.map((p, i) => (
                        <td key={p.peerId} className={values[i + 1] === top && top > 0 ? "leader" : ""}>
                          {values[i + 1].toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!!elsewhere.length && (
            <p className="muted small peer-fight-elsewhere">
              Not matched right now:{" "}
              {elsewhere
                .map((m) => `${m.by} (${m.row.zone ?? "unknown zone"}, ${when(m.row.endedAt || m.row.startedAt)})`)
                .join(" · ")}
            </p>
          )}
        </>
      )}
      <span className="hint">
        Nobody else&rsquo;s figures can change yours — these sit beside your own and nothing more.
      </span>
    </section>
  );
}
