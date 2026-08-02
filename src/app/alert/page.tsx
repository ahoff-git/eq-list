"use client";
import CastAlerts from "../components/CastAlerts";

/**
 * The cast-alert overlay window's page: nothing but the alert visuals on a transparent body,
 * so it can float click-through over the game (see `createAlertWindow` in electron/windows.ts).
 * The beep stays on the main window — this window is never focused and can't unlock audio.
 */
export default function AlertOverlay() {
  return <CastAlerts canBeep={false} showVisual />;
}
