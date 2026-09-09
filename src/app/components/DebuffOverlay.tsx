"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { SOLID } from "@/lib/clickThrough";
import { useBuffs, useSettings } from "@/lib/hooks";
import { alertPlacement, alertStyle, BUFF_STYLE_ID } from "@/shared/alert-styles";
import { durationErratic, heldMs, targetLabel } from "@/shared/buff-tracking";
import { formatDuration } from "@/shared/duration";
import { clockSkew } from "@/shared/spawn-timers";
import type { AlertPositionValue, BuffInstance, KnownBuff } from "@/shared/types";

/**
 * The debuffs you're keeping on something you're fighting — up and missing both — drawn over the
 * game (ADR 0202).
 *
 * `BuffOverlay` next door only ever shows what's **missing**, because for an ordinary self-buff
 * "it's up" needs no glance — you put it there once and forget it. Crowd control is the opposite:
 * you are juggling several timers at once, and "still holding" is exactly as worth a glance as
 * "just broke", which is why this is its own component rather than one more filter on that one.
 * `onEnemy` rows are excluded there and owned here, so nothing is ever drawn twice.
 *
 * A mob whose display name is shared by another instance gets a `#slot` suffix, the same way
 * `SpawnOverlay` numbers two clocks for one camp — because EQ's log names a mob only by that string,
 * and two same-named adds mezzed at once are two rows to tell apart, not one refreshed.
 *
 * **The "up" figure is a prediction, not a fact**, and says so by wearing `~`. The game states a
 * duration *formula*, not a number (`spell-file.ts`), so this is learned instead — the shortest
 * confirmed rise-to-fade gap seen this session, the same technique `spawn-timers.ts` uses for a
 * respawn. It only ever ratchets down, which is the safe direction for a reminder that exists
 * because letting the thing lapse is bad: better an early warning than a late one.
 *
 * **Both states carry a ✕**, and they mean different things. On a lapsed row it's `BuffOverlay`'s
 * gesture: "I know, stop reminding me." On an up row it's new: the order-based slot is a heuristic
 * that can guess wrong — a recast on the same mob read as a second one — so this is "that isn't
 * real, forget it", removing the instance outright rather than merely acknowledging it.
 *
 * Rides the existing alert window, like every other piece drawn over the game.
 */
/**
 * Where a debuff lands when nobody picked a look for it — `BuffOverlay`'s corner is `BUFF_STYLE_ID`'s
 * `top-left`, and both boards default there since a debuff with no style of its own falls back to
 * the very same id. Out of the box that put a crowd-control class's two *standing* boards on the
 * same pixel — a mez/root list drawn under, or over, the missing-buffs list it has nothing to do
 * with. A row that names its own saved style still goes exactly where that style says (below); this
 * only redirects the shared, unconfigured fallback.
 */
const DEBUFF_DEFAULT_POSITION: AlertPositionValue = "bottom-left";

export default function DebuffOverlay() {
  const view = useBuffs();
  const ca = useSettings()?.castAlerts;
  // `useBuffs` deliberately stays a fetch behind (see its own doc comment) — fine for "up or down",
  // but this HUD's whole point is a countdown, and one pinned to the timestamp of the last buff event
  // only moves when some other buff happens to change, which reads as stuck. So this overlay keeps
  // its own half-second pulse, `now` measured against main's clock the same way `useSpawns` does.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const skew = useMemo(() => clockSkew(view.now, Date.now()), [view]);
  const now = Date.now() + skew;
  const wanted = new Map(view.known.map((k) => [k.key, k]));
  const onScreen = (b: BuffInstance) => b.onEnemy && wanted.get(b.key)?.onScreen !== false;
  // Lapsed first, so the urgent half leads a stack that has both.
  const rows = [...view.lapsed.filter(onScreen), ...view.active.filter(onScreen)];
  if (!rows.length || !ca) return null;

  // Numbered only where it disambiguates — a placeholder row reading the same name twice is a wall
  // of one word otherwise (same rule `SpawnOverlay` follows for a shared camp).
  const several = new Set(
    rows.filter((b, i) => rows.some((o, j) => j !== i && o.key === b.key && o.target === b.target)).map((b) => `${b.key} ${b.target}`),
  );
  const looks = rows.map((buff) => {
    const styleId = wanted.get(buff.key)?.styleId;
    const style = alertStyle(ca, { styleId: styleId ?? BUFF_STYLE_ID });
    // Only an explicit choice earns the position that choice named — the shared fallback is
    // redirected to this board's own corner instead (see `DEBUFF_DEFAULT_POSITION`).
    const position = styleId ? style.position : DEBUFF_DEFAULT_POSITION;
    return { buff, known: wanted.get(buff.key), style, position };
  });
  const stacks = new Map<AlertPositionValue, typeof looks>();
  for (const look of looks) stacks.set(look.position, [...(stacks.get(look.position) ?? []), look]);
  const locations = ca.locations ?? [];

  return (
    <>
      {[...stacks].map(([position, stack]) => {
        const place = alertPlacement(position, locations);
        return (
          <div className={`overlay-at debuff-hud no-drag ${place.className}`} style={place.style} key={position}>
            {stack.map(({ buff, known, style }) => (
              <HudRow
                key={`${buff.key} ${buff.target}#${buff.slot}`}
                buff={buff}
                known={known}
                now={now}
                color={style.color}
                several={several.has(`${buff.key} ${buff.target}`)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * How much longer an up instance is predicted to hold, in seconds — `undefined` if never learned, or
 * if what's been learned disagrees with itself too much to show as a figure
 * ([ADR 0206](../../../specs/decisions/0206-a-duration-that-disagrees-with-itself-says-so.md)). A
 * mez broken early by a stray nuke, or a charm that failed its first resist check, would otherwise
 * ratchet the estimate down once and read every ordinary cast afterwards as expiring seconds after
 * it lands — the countdown becoming the alert nobody trusts, instead of the one that mattered.
 */
function predictedRemaining(buff: BuffInstance, known: KnownBuff | undefined, now: number): number | undefined {
  if (known?.durationSeconds === undefined) return undefined;
  if (durationErratic({ seconds: known.durationSeconds, spreadSeconds: known.durationSpreadSeconds, count: known.durationSamples ?? 0 })) {
    return undefined;
  }
  return Math.max(0, known.durationSeconds - Math.round(heldMs(buff, now) / 1000));
}

function HudRow({
  buff,
  known,
  now,
  color,
  several,
}: {
  buff: BuffInstance;
  known: KnownBuff | undefined;
  now: number;
  color: string;
  several: boolean;
}) {
  const remaining = buff.up ? predictedRemaining(buff, known, now) : undefined;
  const clock = buff.up
    ? remaining === undefined
      ? `up ${formatDuration(Math.round(heldMs(buff, now) / 1000))}`
      : remaining > 0
        ? `~${formatDuration(remaining)} left`
        : "~overdue"
    : "broke free";
  return (
    <div className={`debuff-hud-row ${buff.up ? "up" : "lapsed"}`} style={{ borderLeftColor: color }}>
      <button
        {...SOLID}
        className="dhr-x"
        title={buff.up ? "That isn't real — forget this instance" : "Stand this one down"}
        onClick={() =>
          void (buff.up
            ? api()?.buffs.clearInstance(buff.key, buff.target, buff.slot)
            : api()?.buffs.dismiss(buff.key, buff.target, buff.slot))
        }
      >
        ✕
      </button>
      <span className="dhr-clock">{clock}</span>
      <span className="dhr-name">{buff.spell}</span>
      <span className="dhr-who">
        {targetLabel(buff.target)}
        {several && <em className="spawn-slot"> #{buff.slot}</em>}
      </span>
    </div>
  );
}
