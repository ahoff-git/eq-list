"use client";
import CastAlerts from "../components/CastAlerts";
import AlertPlacement from "../components/AlertPlacement";

/**
 * The cast-alert overlay window's page: the alert visuals on a transparent body, so it can float
 * click-through over the game (see `createAlertWindow` in electron/windows.ts). `AlertPlacement`
 * rides along, invisible until the user is placing a custom spot. The beep stays on the main
 * window — this one is never focused and can't unlock audio.
 */
export default function AlertOverlay() {
  return (
    <>
      <CastAlerts canBeep={false} showVisual />
      <AlertPlacement />
    </>
  );
}
