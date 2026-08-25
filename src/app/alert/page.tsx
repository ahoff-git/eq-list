"use client";
import CastAlerts from "../components/CastAlerts";
import AlertPlacement from "../components/AlertPlacement";
import SpawnOverlay from "../components/SpawnOverlay";
import BuffOverlay from "../components/BuffOverlay";

/**
 * The cast-alert overlay window's page: the alert visuals on a transparent body, so it can float
 * click-through over the game (see `createAlertWindow` in electron/windows.ts). `AlertPlacement`
 * rides along, invisible until the user is placing a custom spot. The beep stays on the main
 * window — this one is never focused and can't unlock audio.
 *
 * `SpawnOverlay` and `BuffOverlay` share the window rather than opening more, because everything
 * that makes this one right for a banner — frameless, transparent, always-on-top, click-through — is
 * what a pinned countdown and a standing "you are missing this" want too, and each extra window
 * would be another lot of state to place and remember. All of them render nothing until they have
 * something to say.
 */
export default function AlertOverlay() {
  return (
    <>
      <CastAlerts canBeep={false} showVisual />
      <SpawnOverlay />
      <BuffOverlay />
      <AlertPlacement />
    </>
  );
}
