"use client";
import { crashBoundary } from "../components/CrashBoundary";

/**
 * The screengrab selector covers a whole display and a crashed one can't handle its own
 * Escape, so a visible fallback would be an undismissable pane over the game. Log only —
 * the window is closed from the main process when the grab ends.
 */
export default crashBoundary("the screengrab selector", { visible: false });
