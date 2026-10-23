"use client";
import { useSpawnBoard } from "@/lib/hooks";
import { describeRespawn, timerForMob } from "@/shared/mob/spawn-timers";
import { mobKey } from "@/shared/mob/mob-stats";
import { ZoneLink } from "@/app/components/map/MapLink";

/**
 * How long this mob has taken to come back, at each camp the spawn board has timed it (ADR 0334).
 *
 * The board's own figure, worded the board's way (`describeRespawn`), so a page and the Timers tab
 * can't disagree about one camp. Renders nothing until a camp has a figure.
 */
export default function MobRespawns({ mob }: { mob: string }) {
  const key = mobKey(mob);
  const timed = useSpawnBoard().known.filter((k) => k.kind === "mob" && k.respawn && timerForMob(k.key, key));
  if (!timed.length) return null;
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>
        Respawn
      </h4>
      <ul>
        {timed.map((k) => (
          <li key={k.key}>
            <ZoneLink zone={k.place} /> <span className="muted small">{describeRespawn(k.respawn!)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
