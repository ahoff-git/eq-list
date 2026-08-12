"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/hooks";
import { playAlertSound, DEFAULT_ALERT_SOUND } from "@/lib/alertSounds";
import type { AlertLocation, AlertPositionValue, AlertStyle, CastAlertEvent } from "@/shared/types";

const DEFAULT_DURATION_MS = 6000;
const MIN_DURATION_MS = 1000;
const MAX_ALERTS = 4; // cap so a caster spamming a spell can't bury the screen

interface ActiveAlert extends CastAlertEvent {
  id: number;
  /** The style it fired with — fixed at that moment, so nothing later restyles it. */
  resolved: AlertStyle;
}

/**
 * The dispel-prep alert surface: a banner and a colored screen-border flash when the main
 * process reports a watched spell beginning to cast (see Settings → Cast alerts). Its whole
 * appearance — color, on-screen position, motion, how long it lingers, and which beep — comes
 * from `settings.castAlerts`, so the user tunes it.
 *
 * Split across windows so the alert lands where it's useful without beeping twice:
 *   - the **alert overlay** window (`/alert`) draws the visuals *over the game* — `showVisual`,
 *     `canBeep=false` (it's click-through and never focused, so it can't reliably unlock audio);
 *   - the always-alive **main** window owns the sound — `canBeep`, `showVisual=false`.
 *
 * Renders nothing until an alert fires (and nothing at all when `showVisual` is false). Each
 * banner auto-dismisses after `durationMs`.
 */
export default function CastAlerts({ canBeep = true, showVisual = true }: { canBeep?: boolean; showVisual?: boolean }) {
  const settings = useSettings();
  const ca = settings?.castAlerts;
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const nextId = useRef(0);
  // A changing key remounts the flash overlay so its one-shot animation replays; null hides it.
  const [flashKey, setFlashKey] = useState<number | null>(null);
  const flashCount = useRef(0);
  /**
   * The style an alert should be shown in. It arrives *with* the alert, already resolved from
   * the defaults and the matching watch's overrides (`alertStyle`) — this window only knows the
   * defaults, so anything per-watch could only come this way. The settings are the fallback for
   * a payload without one.
   */
  const styleOf = (e: CastAlertEvent): AlertStyle => ({
    sound: e.style?.sound ?? ca?.sound ?? false,
    flash: e.style?.flash ?? ca?.flash ?? false,
    color: e.style?.color ?? ca?.color ?? "#e5534b",
    soundName: e.style?.soundName ?? ca?.soundName ?? DEFAULT_ALERT_SOUND,
    position: e.style?.position ?? ca?.position ?? "top",
    durationMs: e.style?.durationMs ?? ca?.durationMs ?? DEFAULT_DURATION_MS,
    animation: e.style?.animation ?? ca?.animation ?? "pulse",
  });
  // Reached from a mount-once subscription, so it goes through a ref.
  const styleRef = useRef(styleOf);
  styleRef.current = styleOf;
  const canBeepRef = useRef(true);
  canBeepRef.current = canBeep;
  const showVisualRef = useRef(true);
  showVisualRef.current = showVisual;

  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.alerts.onCast((e) => {
      const style = styleRef.current(e);
      if (canBeepRef.current && style.sound) playAlertSound(style.soundName);
      if (!showVisualRef.current) return; // a beep-only instance (the main window)
      const id = nextId.current++;
      // The resolved style rides along on the active alert: one already on screen must keep the
      // look it fired with, whatever the next alert (or a settings edit) says.
      setAlerts((prev) => [{ ...e, id, resolved: style }, ...prev].slice(0, MAX_ALERTS));
      if (style.flash) setFlashKey(++flashCount.current);
      const ms = Math.max(MIN_DURATION_MS, style.durationMs);
      window.setTimeout(() => setAlerts((prev) => prev.filter((x) => x.id !== id)), ms);
    });
  }, []);

  if (!showVisual || (!alerts.length && flashKey === null)) return null;

  // A custom property carries each alert's color into the CSS (border + flash), falling back to
  // the app's red if it's ever unset. Per *alert*, not per window, now that a watch can have its
  // own — the flash is one screen-wide effect, so the newest alert's color wins it.
  const accent = (color: string) => ({ "--alert-color": color }) as CSSProperties;
  const flashColor = alerts[0]?.resolved.color ?? ca?.color ?? "#e5534b";
  // One stack per position: two alerts can now want different corners of the screen (or different
  // placed spots).
  const stacks = new Map<AlertPositionValue, ActiveAlert[]>();
  for (const a of alerts) stacks.set(a.resolved.position, [...(stacks.get(a.resolved.position) ?? []), a]);
  const locations = ca?.locations ?? [];

  return (
    <>
      {flashKey !== null && (
        <div
          className="cast-flash"
          key={flashKey}
          style={accent(flashColor)}
          aria-hidden
          onAnimationEnd={() => setFlashKey(null)}
        />
      )}
      {[...stacks].map(([position, stack]) => {
        const place = placement(position, locations);
        return (
        <div className={`cast-alerts no-drag ${place.className}`} style={place.style} key={position}>
          {stack.map((a) => {
            const view = banner(a);
            return (
              <button
                key={a.id}
                className={`cast-alert anim-${a.resolved.animation}`}
                style={accent(a.resolved.color)}
                title="Dismiss"
                onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
              >
                <span className="ca-icon">{view.icon}</span>
                <span className="ca-text">{view.body}</span>
                {view.hint && <span className="ca-hint">{view.hint}</span>}
              </button>
            );
          })}
        </div>
        );
      })}
    </>
  );
}

/**
 * What one banner shows. The three prompts are told apart by their icon before a word is read:
 * a cast says stop that, a fade says do it again, and a line is the game talking — so it shows the
 * log's own sentence and offers no call to action, because there isn't one to give.
 *
 * A watch that gave its own `message` gets that instead, and no hint: the point of writing your own
 * wording is that it already says what to do, and "re-cast!" under "RE-CAST BREEZE" is noise. The
 * icon stays, since which kind of prompt it is doesn't change with the words.
 */
function banner(a: CastAlertEvent): { icon: string; body: ReactNode; hint?: string } {
  const icon = a.event === "line" ? "💬" : a.event === "fade" ? "⏳" : "⚠";
  if (a.message?.trim()) return { icon, body: <b>{a.message}</b> };
  if (a.event === "line") return { icon: "💬", body: <b>{a.text || a.spell}</b> };
  if (a.event === "fade") {
    return {
      icon: "⏳",
      body: (
        <>
          <b>{a.spell}</b> faded{a.target ? <> on <b>{a.target}</b></> : ""}
        </>
      ),
      hint: "re-cast!",
    };
  }
  return {
    icon: "⚠",
    body: (
      <>
        <b>{a.caster}</b> casting <b>{a.spell}</b>
      </>
    ),
    hint: "dispel!",
  };
}

/**
 * How a stack of alerts at one position is placed: a preset CSS class, or — for a `loc:<id>`
 * custom spot — the placed fraction as an absolute point (centred on it). A `loc:` that no longer
 * resolves (the spot was deleted) falls back to the top rather than dropping the alert.
 */
function placement(
  position: AlertPositionValue,
  locations: AlertLocation[],
): { className: string; style?: CSSProperties } {
  if (position.startsWith("loc:")) {
    const loc = locations.find((l) => `loc:${l.id}` === position);
    if (loc) return { className: "pos-custom", style: { left: `${loc.fx * 100}%`, top: `${loc.fy * 100}%` } };
    return { className: "pos-top" };
  }
  return { className: `pos-${position}` };
}
