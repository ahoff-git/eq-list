# 0026: The interface scale only shrinks, and it scales the window, not the font

## Status

Accepted

## Context

`overlay.fontScale` existed from early on: a Settings slider (0.8–1.6) plus A− / A+ buttons on
the title bar, persisted with the rest of the overlay settings. It never did anything. Nothing
read the value — `applyOverlaySettings` pushed opacity and always-on-top onto the window and
stopped there, and no renderer applied a font size either. `specs/overlay-ui` claimed it "is
applied by the renderer", which was simply untrue, so the gap survived several passes over this
code.

Two things were wrong once we looked at it properly:

- **Direction.** The app is an overlay sitting on top of the game. The adjustment players
  actually want is "take up less of my screen"; nobody asks their HUD to get bigger. A range
  centred on 1.0 with room above it means the default is already larger than most people want,
  and the useful half of the range is the half below.
- **Mechanism.** The CSS is px-based throughout — paddings, borders, icon sizes, the map
  key, the sparklines. Scaling only text would shrink the letters inside boxes that stayed
  the same size and pull the layout apart. Converting the whole stylesheet to `rem` is a
  large, risky change for a cosmetic setting.

## Decision

**100% is the maximum and the scale only goes down.** `UI_SCALE = { min: 0.6, max: 1, step: 0.05 }`
in `src/shared/constants.ts` is the single range the slider, the title-bar buttons, and the
main process all read; `clampUiScale()` pins any value into it (and answers `max` for a missing
or non-finite one). The stored default drops to 0.9, and the value is clamped when settings load
so anything an earlier A+ click saved above 1 comes back down instead of suddenly rendering
bigger than the app ever has.

**It is applied as the window's zoom factor**, not a font size: `applyUiScale()` calls
`webContents.setZoomFactor()` over every `BrowserWindow`, so text, spacing, and icons scale
together and the map window shrinks with the app rather than separately. Zoom belongs to the
frame and resets on navigation, so it is re-applied on `did-finish-load` as well as when the
setting changes — the map window is created on demand and has to catch up to the current value.

The setting keeps its `overlay.fontScale` key. Renaming it would break every persisted
`settings.json` for no user-visible gain; the label in the UI now reads "Interface scale".

## Consequences

The setting works, and it works on both windows at once. Because zoom is a frame property, it
scales things a font size never could (the canvas map included) without touching the stylesheet.

Zoom does not resize the window itself, so shrinking the interface leaves empty space inside the
current bounds rather than pulling the frame in — the user resizes to suit. Chromium's zoom is
also per-origin under the hood; applying it per-`webContents` on load keeps that from surprising
us, but any future window must go through `load()` to inherit the scale.

The floor is 0.6 because below that the smaller text in the damage tables stops being readable at
typical overlay sizes. That is a judgement call, not a measured limit.

Legacy: the range used to be 0.8–1.6. Stored values above 1 are silently clamped on load; there
is no migration file, just the clamp.
