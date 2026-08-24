# 0009: One translucent window + a system tray (merge overlay and control window)

## Status
Accepted

One window plus a tray stands. The `clickThrough` *retention* noted below is reversed by
[0032](./0032-remove-dead-overlay-surface.md); click-through came back as a working per-window
feature in [0073](./0073-a-click-through-window-keeps-its-chrome.md).

## Context
The app shipped two windows: an opaque, framed **control window** (list / hunt /
search / session / settings) and a small, frameless, translucent, always-on-top
**overlay** float (list / hunt with drop expansions). Users found the split
awkward — they wanted the overlay's look everywhere and all the control-window
functionality in one place — and asked to collapse the two into a single window,
with the developer-only options moved out of the UI.

## Decision
There is now **one window**: a frameless, transparent, resizable float that keeps
the overlay's translucent look (`.app.glass`) and hosts the whole app (the five
tabs, wrapped in `NavProvider`). The title bar is the drag handle and carries the
window controls — **pin** (always-on-top, toggling `overlay.alwaysOnTop`),
**minimize**, and **hide-to-tray**.

- Window behaviour is set in `windows.ts` (`createMainWindow`): frameless +
  transparent + resizable, `alwaysOnTop` from settings, opacity via `setOpacity`.
  `applyOverlaySettings` drives the live window. The old `createOverlayWindow` and
  the `/overlay` route are removed.
- A **system tray** (`main.ts`) holds show/hide plus the dev-only options that left
  the Settings tab: **Debug logging**, **Open debug log**, **Reset window position**,
  and **Quit**. The tray menu's "Debug logging" checkbox is rebuilt on settings
  change so it stays in sync.
- Closing (✕) **hides to tray** (`win.hide()`); the app stays resident so the tray
  and the global hotkey (`Ctrl/Cmd+Shift+O`) can bring it back. `window-all-closed`
  no longer quits; Quit is the tray's job.
- Click-through was dropped (a single window can't ignore the mouse without locking
  the user out); the `clickThrough` setting is retained but no longer applied.

## Consequences
- One surface, one styling, all functionality — no window-role split in the UI and
  the panels are shared verbatim.
- The old overlay's *inline per-item drop expansion* is kept: each list entry has an
  expandable ▸ showing drops-by-zone + colored other sources (alongside the **Hunt**
  tab's zones → mobs view).
- The app behaves like a tray resident: the window persists across hide/show, and
  the only way to fully exit is the tray's Quit.
- `win.role()`, the overlay window-state helpers, and the `clickThrough` setting are
  now vestigial; kept to limit churn, safe to remove later.
- Supersedes the two-window description in [overlay-ui](../overlay-ui/README.md); the
  Electron-shell decision ([ADR 0002](./0002-electron-shell-over-nextjs.md)) is
  unaffected.
