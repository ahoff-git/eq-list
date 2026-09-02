# 0182: Window management is Windows' job

## Status

Accepted

## Context

[ADR 0108](./0108-a-frameless-window-snaps-like-a-framed-one.md) built Aero Snap by hand: a drag
loop in `window-drag.ts`, zone geometry in `shared/window-snap.ts`, a gesture hook in
`lib/windowDrag.ts`, a spare `BrowserWindow` as the snap preview, three IPC channels, and a test
file for the arithmetic — about 670 lines standing in for behaviour the OS already has.

It also worked, as far as it went. What it could never reach is everything Windows does *without* a
drag: **Win+←/→/↑/↓**, **Win+Shift+←/→** across monitors, **Win+Z** snap layouts, Aero Shake,
FancyZones. Those are not gestures a window can offer itself — they are the shell moving the
foreground window — and they were simply missing. `globalShortcut.register("Super+Left")` returns
`false` (as do Right, Up, and Win+Shift+Left): the shell reserves them, so there was no route to
reimplementing those either.

ADR 0108 named the cause as `frame: false` and `-webkit-app-region: drag` — "Chromium's own move
loop, and the OS is never told that a window is being dragged by its title." Measured against real
window handles, that is not what was happening:

- `WM_NCHITTEST` inside an `app-region: drag` element returns **`HTCAPTION`** on a frameless window,
  transparent or not. The OS *is* told, and correctly.
- The actual blocker is **`transparent: true`**. Electron strips `WS_THICKFRAME` from a
  per-pixel-alpha window — even with `thickFrame: true` set explicitly — and a window with no sizing
  border is one Windows refuses to snap by any route. An otherwise identical opaque window carries
  `WS_THICKFRAME | WS_CAPTION | WS_MAXIMIZEBOX` and snaps on `Win+←` immediately.

So the cost was misattributed. It was never the frame; it was the alpha. And the alpha was buying
almost nothing: the CSS background is *solid* (translucency is `win.setOpacity()` and always has
been — [ADR 0009](./0009-single-window-with-tray.md)), so `transparent: true` bought the four
rounded corners and nothing else. Windows 11's DWM rounds and clips an opaque frameless window on
its own, which covers even that. `setOpacity` and DWM acrylic both keep `WS_THICKFRAME`, so
whole-window translucency was never in tension with snapping — only per-pixel alpha was.

This supersedes 0108, and narrows [ADR 0002](./0002-electron-shell-over-nextjs.md)'s "transparent
always-on-top window" to what the app actually needs: **always-on-top, and translucent by
opacity**.

## Decision

**The app's floats are opaque, and Windows manages them.** `transparent: true` is gone from the main
and map windows; `-webkit-app-region: drag` is back on `.titlebar` and is the whole of how a window
is moved. No JS watches the pointer to move a window.

**`window-drag.ts`, `shared/window-snap.ts`, `lib/windowDrag.ts`, `window-snap.test.ts` and the
`win:dragStart` / `win:dragMove` / `win:dragEnd` channels are deleted.** A feature the OS provides
is not a feature to own; the tests that came with it were tests of Windows' arithmetic.

**`no-drag` is the CSS property again**, not a class read in JS. It stays spelled the same
everywhere it is already applied, so the rule a title bar was written to is unchanged: **every
control in a caption carries `no-drag`**, or the press moves the window instead of pressing it. A
caption region swallows presses over it, so an unmarked control is one that cannot be clicked.

**Translucency stays exactly where it was**: `win.setOpacity()`, driven by the slider and the ◐
toggle. It sets `WS_EX_LAYERED`, which snapping does not mind.

**The corners are the OS's.** No `border-radius` on `.app.glass` / `.map-win`: with an opaque window
a CSS radius has nothing to reveal but the window's own backdrop, and it fights the DWM clip that
draws the corner the user actually sees.

**The click-through overlays keep `transparent: true`** — the alert banner and the lookup selector,
which are `movable: false` and `resizable: false` and so have no window management to lose. Per-pixel
alpha is load-bearing there and costs nothing.

## Consequences

Every Windows window gesture now works on the app's floats, including the ones that were previously
unreachable at any price: drag to an edge for a half or a quarter with the OS's own preview, drag to
the top to maximize, drag a snapped window loose, Escape to cancel, double-click the caption,
Win+arrows, Win+Shift+arrows across monitors, Win+Z layouts, Aero Shake, and third-party tools like
FancyZones — none of it code we hold.

About 670 lines and one IPC surface go, and with them a class of bug that only a hand-rolled drag
can have: a drag whose owning renderer died mid-gesture (the `DRAG_IDLE_MS` watchdog), a preview
window left on top of the game, a window rescaled mid-drag by a monitor's DPI, a `dragStart` with no
`dragEnd`. `neutralizeOverlays()` has one less overlay to neutralize.

The float is no longer see-through at its corners, which is the whole of what was traded. DWM's
corner radius is tighter than the 10px the CSS asked for, and outside it now sits the window's own
backdrop rather than the desktop.

`MaximizeButton` and `useMaximized` stay: a frameless window still draws its own ▢ / ❐, and main
still reports `maximize`/`unmaximize` so the glyph follows a caption double-click, a Win+↑ or the
taskbar. That reporting is now the *only* thing main does about window placement.

The drag gestures are verified by hand, not in CI. Style flags, the `HTCAPTION` hit-test, Win+←, and
double-click-to-maximize were all measured directly on the running window, but Windows' modal move
loop does not respond to injected mouse input — a native Notepad window ignores a synthetic caption
drag identically — so "drag to the left edge and it snaps to a half" is a line in
[manual QA](../testing/manual-qa.md) and always will be.
