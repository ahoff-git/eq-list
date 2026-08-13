# 0074: How a window was left is window state, not a setting

## Status

Accepted

## Context

Each float carries three title-bar toggles — **pin** (always-on-top), **◐ opacity** and
**👻 click-through** — and by the time all three existed they were kept in three different places,
none of them the same as where the window's own size and position live:

- **pin**: `overlay.alwaysOnTop`, a *setting*, pushed onto the main window by `applyOverlaySettings`.
  One app-wide value for a thing that is plainly per window — so the map window, which needs its own
  answer, kept a **second** one in `localStorage` and corrected itself a frame after opening. Two
  sources, one of which briefly won.
- **◐ opacity**: nowhere. Deliberately transient, on the grounds that flipping a window solid is a
  momentary thing you undo. In practice a window you want solid stays wanted solid, and every
  restart quietly undid it.
- **👻 click-through** ([ADR 0073](./0073-a-click-through-window-keeps-its-chrome.md)): `localStorage`,
  a key per window, applied by the renderer once it had mounted.

Meanwhile bounds, and whether the window was left maximized, have always been in
`window-state.json` — read by the *constructor*, so a window opens where it was rather than
arriving there. That is what all six of these facts are: not preferences about the app, but the
condition one window was left in.

The split showed up as flicker (a window opening translucent and going solid, or opening pinned and
unpinning), and as the one bug that had no innocent explanation: the map window's pin was decided by
the *main window's* setting until its renderer loaded.

## Decision

**`window-state.json` holds how each window was left** — its bounds, its maximized flag, and now a
`toggles` record per role: `WindowToggles { pinned?, opaque?, clickThrough? }`. `OverlaySettings`
keeps only what is genuinely one preference for the whole app: how translucent (`opacity`), how
large (`fontScale`, `mapFontScale`), and the rest.

**`overlay.alwaysOnTop` is deleted**, following [ADR 0032](./0032-remove-dead-overlay-surface.md)'s
precedent: nothing in the Settings UI ever showed it, and a per-window fact stored app-wide is what
forced the map's second copy. With it goes `applyOverlaySettings`, which
[ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md) had already reduced to that one
line — settings changes now push nothing onto a window.

**Main applies the state when it creates the window.** Opacity in the constructor (`windowOpacity`,
the one rule both ends use: the ◐ wins over the slider), always-on-top and click-through immediately
after. So the window is already right before it is shown, and the very first click after launch
lands where the user left it pointing.

**The renderer owns them afterwards, through one hook.** `useWindowToggle(key)` reads
`win.getState()` once, holds the value, and writes changes back with `win.saveState({key: value})`;
`useWindowPin`, `useWindowOpacity` and `useClickThrough` are the three appliers over it. **Nothing is
applied before the saved value arrives** — main already applied it, and asserting the default over it
is precisely the flash this removes. The renderer never says *which* window it is (it doesn't know):
main reads the role off the sender, so a window with no saved state (the alert overlay, a screengrab
selector) reads empty and writes nowhere.

**Remembering and applying stay separate channels.** `win.setOpacity` / `setAlwaysOnTop` /
`setClickThrough` still just do the thing. That matters most for click-through, which flips many
times a second as the cursor crosses between the map and the toolbar: those are moments, not
choices, and only the choice is written down.

## Consequences

Pin, ◐, 👻, size, position and maximized all survive a restart, in one file, applied in one place, at
the moment the window is created — no flicker, and no window that disagrees with itself while it
loads. The map and the list hold independent answers to all three toggles because they are different
windows, which is what they always were.

Settings shrinks to preferences. Nothing in `overlay` is pushed onto a window from the settings
listener any more; the scale is applied by each renderer (ADR 0041) and the opacity slider by
`useWindowOpacity`, which is the only place that knows whether that window's ◐ is on.

A user upgrading loses their old pin state — `overlay.alwaysOnTop` and the map's `localStorage` key
are both gone — and both windows come back pinned, which is the default they almost certainly held.
Old keys left in `settings.json` and `localStorage` are ignored, not migrated: one toggle each,
one flip to restore.

"Reset window position" still clears bounds and the maximized flag only. The toggles are not what
makes a window unreachable, and a reset that also unpinned the app would be a second surprise.
