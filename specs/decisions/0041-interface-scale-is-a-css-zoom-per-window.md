# 0041: The interface scale is a CSS zoom per window, not Chromium's

## Status

Accepted

## Context

[ADR 0026](./0026-interface-scale-only-shrinks.md) settled *what* the interface scale means — it
shrinks the whole interface rather than the font, and 100% is the ceiling — and implemented it with
`webContents.setZoomFactor` from the main process, pushed onto every window.

Then the map window needed its **own** scale: one window is a column of text you shrink to reclaim
desk space, the other is a picture you enlarge to read, and one number can't serve both. The
obvious change was to keep `setZoomFactor` and aim it per window — apply `fontScale` to everything
except the map, and `mapFontScale` to the map.

That silently doesn't work, and the reason is worth writing down. **Chromium's zoom is per
origin**, not per window, and every window here is served from a single one (`app://local`
packaged, `localhost:3000` in dev). Measured with two windows on one origin:

```
set A=0.6 then B=1.0  →  A: 1     B: 1        (B's call moved A too)
set A=0.75            →  A: 0.75  B: 0.75     (A's call moved B)
```

So the two scales overwrote each other and whichever ran last won for both windows — the map's
A−/A+ moved the main window, and vice versa. The same test against `file://` URLs shows them
independent, which is a trap: file URLs get opaque per-file origins, so it "passes" while proving
nothing about the real app.

## Decision

**Each window applies its own scale in its own renderer, as a CSS `zoom` on the document root**
(`useUiScale`). CSS zoom is per document, so two windows hold two scales. The main process no
longer touches zoom at all; `applyOverlaySettings` is left with always-on-top.

`overlay.fontScale` is the main window's (and the alert overlay's, unchanged); the map window's is
`overlay.mapFontScale`, stepped by its own copy of the shared `ScaleButtons`. Both are still
clamped by `clampUiScale`, so ADR 0026's ceiling stands.

**The window shells changed from `height: 100vh` to `height: 100%`.** Under a zoomed root a `vh`
length is scaled by the zoom, so a `100vh` shell covers only `scale` of the window and leaves a gap
— at 60% that's a window that's 40% empty. `zoom` expands the initial containing block instead
(measured: a 446px window reports `documentElement.clientHeight` 744 at zoom 0.6), so a percentage
height fills it exactly.

## Consequences

Verified end to end on the built pages, driven by the app's own settings and hooks: the main window
at 0.6 and the map at 1.0, simultaneously, each shell covering 100% of its window.

The screengrab selector is no longer incidentally zoomed. Its crop maths is ratio-based — the
renderer sends its own view size alongside the rect — so it stays correct, and with no zoom the
ratio is simply 1.

Anything added to a window shell must use percentage heights, not `vh`, or it will come up short at
any scale below 100%. That's the one trap this introduces, and it's why both shells carry a comment
saying so.

A future window that wants a third scale adds a settings field and one `useUiScale` call. Nothing
in the main process needs to know.
