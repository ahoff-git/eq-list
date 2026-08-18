"use client";
import CastAlerts from "../components/CastAlerts";
import AlertPlacement from "../components/AlertPlacement";
import SpawnOverlay from "../components/SpawnOverlay";

/**
 * The cast-alert overlay window's page: the alert visuals on a transparent body, so it can float
 * click-through over the game (see `createAlertWindow` in electron/windows.ts). `AlertPlacement`
 * rides along, invisible until the user is placing a custom spot. The beep stays on the main
 * window — this one is never focused and can't unlock audio.
 *
 * `SpawnOverlay` shares the window rather than opening a third, because everything that makes this
 * one right for a banner — frameless, transparent, always-on-top, click-through — is what a pinned
 * countdown wants too, and a second window would be a second lot of state to place and remember.
 * Both render nothing until they have something to say.
 */
export default function AlertOverlay() {
  return (
    <>
      <CastAlerts canBeep={false} showVisual />
      <SpawnOverlay />
      <AlertPlacement />
    </>
  );
}
