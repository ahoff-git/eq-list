"use client";
import { useEffect } from "react";
import { installErrorReporting } from "@/lib/error-reporting";

/**
 * Mounted once in the root layout, so every window logs its uncaught errors without each
 * page having to remember to ask (unlike `useRendererDebug`, which is per-window state).
 * Renders nothing — an overlay that floats over the game shows errors in the log, not on
 * the screen.
 */
export default function ErrorReporter() {
  useEffect(installErrorReporting, []);
  return null;
}
