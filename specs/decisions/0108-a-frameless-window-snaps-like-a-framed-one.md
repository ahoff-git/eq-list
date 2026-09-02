# 0108: A frameless window snaps like a framed one

## Status

Superseded by 0182

## Context

Both of the app's windows are `frame: false` — the float look this whole overlay rests on
([ADR 0074](./0074-how-a-window-was-left-is-window-state.md) for what else that costs us) — and they
were dragged by `-webkit-app-region: drag` on `.titlebar`, one line of CSS, since the first build.

That line is not "make this a caption". It is Chromium's own move loop: the browser process reads the
press and moves the window, and the OS is never told that a window is being dragged by its title. So
**everything Windows does with a dragged caption never happened here** — and it is not a short list.
Take the window to the left edge and nothing snapped it to a half; take it to the top and nothing
maximized it; no zone preview ever appeared; and, because a maximized window couldn't be pulled
loose, dragging one just slid a full-screen rectangle around the desktop. Double-clicking the bar did
nothing either, which is the one that reads most like a bug: the ❐ / ▢ button sitting three inches to
the right *did* maximize and restore, so the window plainly had the state — the bar just wouldn't
answer the gesture everyone tries first.

The trap is that all of this looks like a settings problem or an Electron flag, and isn't. There is no
`snappable: true`. `titleBarStyle: "hidden"` would hand the non-client area back to Windows — and
with it the native frame, the shadow, the square corners and the end of `transparent: true`, which is
the app's entire appearance. Aero Snap for a frameless window is not a switch to find; it is
behaviour to build.

Two smaller facts shaped how:

- **The renderer is the only side that sees the gesture.** The pointer going down, moving and coming
  up are DOM events in the window; nothing in main is told about them.
- **The renderer is the worst possible source of screen coordinates.** Each window applies the
  interface scale as a CSS `zoom` on the document root
  ([ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md)), and the desktop can be mixed-DPI
  — the same arrangement that used to inflate a restored window by 1.25× on every launch
  (`restoreBounds` in `windows.ts`). A drag driven by `event.screenX` would drift by the scale factor
  and land the window somewhere the pointer isn't.

## Decision

**The titlebar drag is ours, and it snaps.** `-webkit-app-region: drag` is gone; a press on the
titlebar is a gesture the renderer watches and the main process acts on.

**The renderer owns the gesture, main owns the window, and no coordinate crosses between them.**
`useWindowDrag` sends three things — `dragStart`, `dragMove`, `dragEnd(how)` — and `dragMove` is a
*pulse*, not a position: every coordinate in `window-drag.ts` comes from
`screen.getCursorScreenPoint()`, which is already in the same DIP space as `getBounds`/`setBounds`.
So a window's CSS `zoom` and a monitor's scale factor are, by construction, not something the drag
can get wrong.

**The geometry is pure and lives on its own** (`shared/window-snap.ts`, tested without a screen):
which zone a cursor is in, what rectangle that means, whether a press has travelled far enough to be
a drag, and where to put a window pulled loose from a maximize. The zones are the set Windows offers
a mouse: **top → maximize, sides → halves, the corner bands of those sides → quarters**, and the
bottom edge means nothing, because it means nothing there either.

**The cursor decides, not the window.** You snap by taking the *pointer* to the edge; a window
hanging half off the screen with the pointer in the middle of it is not snapping. The band is a few
pixels wide (`SNAP.edge`) for the same reason — reaching the edge is the gesture, and a wide band
would grab windows that were only being dragged past.

**A drag doesn't start until the cursor leaves the spot it was pressed in** (`SNAP.threshold`).
Without that, a plain click on a window already sitting at an edge would snap it, and the second
press of a double-click would move the window out from under itself.

**Dragging a maximized or snapped window pulls it loose, under the pointer.** Proportionally, not by
the grip it had: grab a 3440-wide caption near its right end and an absolute grip drops a 460-wide
window entirely to the left of the cursor, dropping the drag on the floor. Coming back from a
*maximize* needs no help from us (Electron's `unmaximize` remembers), but a half or a quarter is an
ordinary resize as far as the OS is concerned, so `window-drag.ts` remembers what a window it snapped
was before — in a `WeakMap`, so a closed window's memory closes with it.

**Ending a drag is three different things, and the renderer says which.** Released → snap; **Escape**
→ put the window back exactly where the press found it (maximized again, if it was); and *lost* —
focus taken by another app, the window unmounted — → leave it where it got to, because nobody let go
of anything. Snapping a gesture nobody completed would place a window off an accident.

**Double-clicking the titlebar calls the same `win.toggleMaximize()` the ❐ / ▢ button calls**, so the
glyph, its tooltip and the squared-off corners (`.app.glass.maximized`) follow a double-click for
free: main reports maximize/unmaximize on the channel `useMaximized` already listens to, from
whatever source — our button, the bar, Win+Up, the taskbar. The button was always the display of that
state; this adds a second way to change it, not a second copy of it.

**`no-drag` still means exactly what it meant.** The class was `-webkit-app-region: no-drag`; it is
now the marker `useWindowDrag` looks for. So the rule both title bars were written to — every control
carries it, or the press moves the window instead of pressing it — is unchanged, and no control had to
be touched.

**One `Titlebar` component owns all of it**, since both windows had written the same bare
`<div className="titlebar">` and would each have had to remember to wire the gesture.

**The snap preview is a window with nothing loaded in it.** It is one flat translucent rectangle, so a
renderer would only add a page that could fail to paint or stop answering while sitting on top of the
game — the exact failure
[ADR 0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) is about. It is
unfocusable and click-through, `destroy()`ed the moment the drag ends, dropped by
`neutralizeOverlays()` if main crashes mid-gesture, and abandoned by a ten-second idle timer if the
renderer holding the drag dies — at its very worst it is a coloured rectangle that cannot take a
click.

## Consequences

Dragging is now IPC-driven — about one empty message per frame while the pointer moves, with main
doing the arithmetic and one `setBounds`. That is the price of the behaviour, and it buys the drag
back from Chromium: the same path now does snapping, the pull-loose and the double-click, none of
which the CSS could ever have done.

The gesture depends on the renderer, so a window whose page is wedged cannot be dragged by its bar.
That is not a new exposure — a frameless window's ✕, pin and keys were already the renderer's, which
is what [ADR 0131](./0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) answers —
and the drag adds nothing that outlives it: main drops the gesture and the preview when the pulses
stop.

A window snapped to a half is saved at that size, since to `rememberBounds` a snap is an ordinary
resize — so it reopens as a half rather than at its old size. That matches what the player last chose
to look at. The in-session memory of the pre-snap size (the `WeakMap`) is deliberately *not*
persisted: "the size it was before you snapped it, three days ago" is not a fact anybody is holding.

Rejected:

- **`titleBarStyle: "hidden"`** — the native non-client area would bring snapping for free and take
  the app's appearance with it (`transparent: true`, the rounded float, the shadow).
- **Keeping `-webkit-app-region: drag` and adding snapping around it** — main can see a window
  *moving* (`will-move`, `moved`) but is never told the drag **ended**, and the release is the only
  moment a snap may happen. There is no mouse-button state to poll.
- **Sending `screenX`/`screenY` from the renderer** — the obvious version, wrong under a CSS `zoom`
  and on a mixed-DPI desktop, in a way that only shows up on other people's monitors.
- **A wide snap band, or snapping off the window's edge rather than the cursor's position** — both
  snap windows the user was only moving past.
- **Keyboard snapping (Win+←/→)** — the OS already owns those chords, and a window that answered them
  itself would be a second, competing implementation of a gesture nobody asked us for.
