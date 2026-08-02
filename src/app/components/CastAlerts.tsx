"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/hooks";
import type { CastAlertEvent } from "@/shared/types";

const ALERT_MS = 6000; // how long a banner stays up
const MAX_ALERTS = 4; // cap so a caster spamming a spell can't bury the screen

interface ActiveAlert extends CastAlertEvent {
  id: number;
}

/**
 * The dispel-prep alert surface: flashes a banner (and optionally beeps) when the main
 * process reports a watched spell beginning to cast (see Settings → Cast alerts). Mounted
 * in the overlay + map windows; renders nothing until an alert fires. Each banner auto-
 * dismisses after a few seconds, or on click.
 *
 * `canBeep` lets only the always-alive main window own the sound, so an alert doesn't beep
 * twice when the map window is also open — both still show the banner.
 */
export default function CastAlerts({ canBeep = true }: { canBeep?: boolean }) {
  const settings = useSettings();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const nextId = useRef(0);
  // A changing key remounts the flash overlay so its one-shot animation replays; null hides it.
  const [flashKey, setFlashKey] = useState<number | null>(null);
  const flashCount = useRef(0);
  // Read the toggles through refs so the subscription can stay mount-once.
  const soundRef = useRef(false);
  soundRef.current = canBeep && (settings?.castAlerts?.sound ?? false);
  const flashRef = useRef(false);
  flashRef.current = settings?.castAlerts?.flash ?? false;

  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.alerts.onCast((e) => {
      const id = nextId.current++;
      setAlerts((prev) => [{ ...e, id }, ...prev].slice(0, MAX_ALERTS));
      if (soundRef.current) beep();
      if (flashRef.current) setFlashKey(++flashCount.current);
      window.setTimeout(() => setAlerts((prev) => prev.filter((x) => x.id !== id)), ALERT_MS);
    });
  }, []);

  if (!alerts.length && flashKey === null) return null;
  return (
    <>
      {flashKey !== null && (
        <div className="cast-flash" key={flashKey} aria-hidden onAnimationEnd={() => setFlashKey(null)} />
      )}
      {alerts.length > 0 && (
        <div className="cast-alerts no-drag">
          {alerts.map((a) => (
            <button
              key={a.id}
              className="cast-alert"
              title="Dismiss"
              onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
            >
              <span className="ca-icon">⚠</span>
              <span className="ca-text">
                <b>{a.caster}</b> casting <b>{a.spell}</b>
              </span>
              <span className="ca-hint">dispel!</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// A short two-tone alert via Web Audio, so there's no bundled sound asset. One context is
// reused across alerts; any failure (no audio device) leaves the visual banner as the alert.
let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  } catch {
    /* no audio available — the banner still fires */
  }
}
