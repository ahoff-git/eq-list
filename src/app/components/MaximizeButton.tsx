"use client";
import { api } from "@/lib/api";
import { useMaximized } from "@/lib/hooks";

/**
 * The maximize/restore control for a window title bar, so our frameless windows behave like
 * ordinary ones. Unlike `PinButton` this owns its own state: "am I maximized" is a fact about
 * the window rather than something the page decides, and it arrives from the main process —
 * which means the glyph stays right even when the window is maximized by something else
 * (a double-click on the titlebar, Win+Up, the taskbar).
 *
 * Not used by the cast-alert overlay, which is click-through and `maximizable: false`.
 */
export default function MaximizeButton() {
  const maximized = useMaximized();
  return (
    <button
      className="wc"
      title={maximized ? "Restore down" : "Maximize"}
      onClick={() => api()?.win.toggleMaximize()}
    >
      {maximized ? "❐" : "▢"}
    </button>
  );
}
