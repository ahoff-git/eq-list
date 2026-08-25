"use client";
import { useSettings, useSpawns } from "@/lib/hooks";
import { alertPlacement, alertStyle } from "@/shared/alert-styles";
import { countdownMs, formatCountdown } from "@/shared/spawn-timers";
import type { AlertPositionValue, RunningSpawn } from "@/shared/types";

/**
 * The countdowns a player asked to keep in front of them, drawn over the game.
 *
 * A banner answers "it's up **now**" and then goes away. This answers a different question, and the
 * one a camper asks far more often: **how long left.** Getting that from the Timers tab means
 * alt-tabbing out of the fight to look at a number, which is exactly what an overlay exists to
 * prevent — so a timer can be pinned here and simply *stay* there while it runs.
 *
 * **Opt-in per timer**, like `notify` and for the same reason: everything you kill is tracked, and a
 * list of every named you happened to pass would be a wall of text over the game rather than a
 * glance. Nothing renders at all until you pin one.
 *
 * **Each countdown sits where its own alert would.** It answers to the same style — the defaults, or
 * the saved one the timer wears — so a player who put their alerts bottom-right gets their clocks in
 * the corner they already look at, custom placed spots included. Two timers wearing different styles
 * are two stacks, exactly as two banners at different positions are.
 *
 * The style is resolved **here**, from the id, rather than being sent resolved. That is the opposite
 * of a banner and deliberately so: a banner is frozen at the moment it fired, while this is a live
 * readout and restyling it should move it there and then.
 *
 * It rides the existing alert overlay window (`/alert`) rather than opening a third: that window is
 * already frameless, transparent, always-on-top and click-through over the game, and a second one
 * would be a second lot of window state to keep, place and remember.
 */
export default function SpawnOverlay() {
  const { view, now } = useSpawns();
  const ca = useSettings()?.castAlerts;
  const pinned = view.running.filter((t) => t.onScreen);
  if (!pinned.length || !ca) return null;

  // Resolved once per timer — the position groups it and the colour marks it, and asking twice
  // would be two chances for the two to disagree.
  const looks = pinned.map((timer) => ({ timer, style: alertStyle(ca, { styleId: timer.styleId }) }));
  // One stack per position, so timers wearing different looks land in different corners.
  const stacks = new Map<AlertPositionValue, typeof looks>();
  for (const look of looks) stacks.set(look.style.position, [...(stacks.get(look.style.position) ?? []), look]);
  const locations = ca.locations ?? [];

  return (
    <>
      {[...stacks].map(([position, stack]) => {
        const place = alertPlacement(position, locations);
        return (
          <div className={`overlay-at spawn-hud no-drag ${place.className}`} style={place.style} key={position}>
            {stack.map(({ timer, style }) => (
              <HudRow key={timer.id} timer={timer} now={now} color={style.color} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/** The same five states the panel shows, said in the space of a HUD line. */
const HUD: Record<RunningSpawn["state"], { clock: string; cls: string }> = {
  waiting: { clock: "", cls: "" },
  window: { clock: "", cls: "window" },
  up: { clock: "UP", cls: "due" },
  alive: { clock: "ALIVE", cls: "alive" },
  stale: { clock: "", cls: "" },
};

/**
 * One line. The style's **colour** marks the row's edge so a pinned timer is recognisable as the
 * same thing its banner will be — but the state still owns the clock, because "up" and "waiting"
 * have to stay tellable apart at a glance whatever colour the player chose.
 */
function HudRow({ timer, now, color }: { timer: RunningSpawn; now: number; color: string }) {
  const phase = HUD[timer.state];
  // The one word that can't be shared: nothing spawned, so a timer the player made says DONE where
  // a mob says UP (ADR 0135). An override rather than a second table, because every other state
  // reads the same in both and two tables would be two places to keep in step.
  const clock = timer.kind === "custom" && phase.clock === "UP" ? "DONE" : phase.clock;
  return (
    <div className={`spawn-hud-row ${phase.cls}`} style={{ borderLeftColor: color }}>
      <span className="shr-clock">{clock || formatCountdown(countdownMs(timer, now))}</span>
      <span className="shr-name">{timer.mob}</span>
    </div>
  );
}
