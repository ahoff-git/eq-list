# 0073: A click-through window keeps its chrome

## Status

Accepted

## Context

The floats sit over EverQuest, always on top. Anything they cover is a part of the game you can't
click — which is the whole cost of running them at the size that makes them readable. Passing their
clicks through removes that cost, but a window that eats *no* clicks can't be moved, can't be
switched between tabs, and — the fatal one — can't be used to turn the mode off again. Electron's
own `setIgnoreMouseEvents` is all-or-nothing per window, so "optionally click-through" is only
useful if it can be answered per *region*.

## Decision

Both floats — the app window and the map — can be put in **click-through mode**, a per-window toggle
(👻) in the title bar beside the pin and the ◐ opacity override, persisted per window in
`localStorage` (`STORAGE_KEYS.clickThrough` / `mapClickThrough`).

**The mode has a hole in it, and the hole is the content.** Each window marks exactly **one**
pass-through region — the list's `.panel`, the map's `.map-body` — by spreading `PASS_THROUGH` onto
it at the window's own composition site. Clicks landing there go to the game; everywhere else (title
bar, tab bar, toolbar, status bar, any open side panel) the window is a window. The rule is stated
by what passes *through*, not by what stays solid, because the content is one element and the chrome
is a dozen — and because the failure mode of forgetting to mark something then leaves it clickable
rather than leaving the user unable to click anything.

**The renderer decides, the main process obeys.** `useClickThrough` (`src/lib/clickThrough.ts`)
watches the cursor and sends `win.setClickThrough(on|off)` at the crossings only;
`setIgnoreMouseEvents(enabled, { forward: true })` in main is the whole main-process side. This is
[ADR 0035](./0035-cast-alert-overlay-window.md)'s mechanism and
[ADR 0045](./0045-place-a-custom-alert-spot.md)'s lend-it-a-click, generalised from "for one moment"
to "region by region": `forward` keeps mouse **moves** flowing to the renderer while clicks go to the
game, which is what lets a window that can't be clicked still see the cursor arrive over a control
and ask for itself back.

**A press holds the window.** While a mouse button is down the mode never changes, so a drag that
began on a control (moving the window by its title bar, a slider) isn't dropped when it wanders
across the pass-through region.

This is the working feature [ADR 0032](./0032-remove-dead-overlay-surface.md) said click-through
should come back as. It does not restore the `overlay.clickThrough` *setting* that ADR deleted: the
map and the list want it at different moments, so it belongs to each window the way the ◐ override
and the map's pin already do, not to one shared value.

## Consequences

You can fight through the map: read the zone, watch your dot, and swing at what's in front of you
without moving or hiding the window. The list can sit over the game as a heads-up display and stay
one click (its own title bar) from being interactive again.

While the mode is on, its region is a **glance**, not a surface. Only mouse moves are forwarded — the
wheel is not — so the panel can't be scrolled, the map can't be zoomed or panned, and no row, pin or
`ItemLink` in there can be clicked. Hover still works, which is more than it sounds: an item's stat
card and every explanatory tooltip still appear under the cursor. Working in the window means turning
the mode off, which is why the toggle is in the chrome and not in Settings.

`forward` is honoured on Windows and macOS; on Linux, Electron ignores it and the mode degrades to
all-or-nothing (the chrome would stop responding too), so it is not a mode to offer there.

The crossing is an IPC round trip, so a click delivered in the same millisecond the cursor enters a
control can be swallowed. Clicking again works, which is the recoverable direction of the two.
