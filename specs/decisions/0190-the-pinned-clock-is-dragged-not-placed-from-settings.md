# 0190: The pinned clock is dragged into position directly, not placed from Settings

## Status

Accepted

## Context

The game clock ([ADR 0186](./0186-the-game-clock-runs-forward-from-the-last-time-reading.md)) so far only ever lived in the status bar. The ask was for a version that floats over the game itself — click the status-bar clock to show it, and be able to put it wherever it's wanted, without the click-through overlay swallowing every click that lands on it.

There's already a positioning system for exactly this kind of thing: cast alerts and pinned spawn timers (`SpawnOverlay`) both wear an `AlertPositionValue` — a preset corner, or a custom spot placed once, in Settings, via "Place a spot" (a dedicated placement mode: the whole overlay dims, a click captures the point, Esc cancels). That system exists because an alert rule has a *look* to configure alongside its position — color, sound, animation, duration — and the position picker is one more field in that same editor.

The clock has none of that. It's one element, always shown the same way, with nothing to configure but where it sits. Sending a player to Settings, into "Place a spot" mode, back out, and into a position dropdown to move one thing is a lot of travel for a gesture that could just be "grab it and drag it" — and the click-through machinery the alert overlay already has (`clickThrough.ts`'s `SOLID` islands) turns out to support exactly that with no new plumbing: a press that starts on a marked island holds the whole window solid until release, which is already how a buff reminder's ✕ survives a window that is otherwise glass to the game underneath it.

## Decision

**The pinned clock is a `SOLID` island in the alert overlay that you drag directly, storing a free-form `{fx, fy}` fraction of the display — not an `AlertPositionValue`, and not routed through the existing "Place a spot" flow.** `game-clock-tracker.ts` persists `pinned: boolean` and `pinAt: {fx, fy}` next to the anchor and the alarms. Clicking the status-bar clock (`GameClock.tsx`) toggles `pinned`; while pinned, `GameClockOverlay.tsx` renders `GameClockFace` (the same presentational piece the status bar uses) at `pinAt`, and a mousedown-drag-mouseup on it updates the position — locally during the drag for no round-trip lag, written back to main once, on release.

This is a deliberately different shape from the alert position system, not an oversight: `AlertPositionValue` exists to let *several* differently-styled things share a small vocabulary of corners plus a handful of named custom spots, chosen from a dropdown next to a style editor. A single element with nothing to style doesn't need a vocabulary — it needs wherever the player just put it, which a live `{fx, fy}` says more simply and precisely (any point, not just eight corners and whatever spots were placed ahead of time) than a position enum would.

## Consequences

Placing the clock costs one drag, no menu. The tradeoff is that it shares nothing with the alert-position system: it can't be set to "wherever a saved alert style already sits," and there's no dropdown listing it as a spot other things could be pointed at. Neither loss matters yet — nothing else has asked to share a spot with the clock — and if that changes, the fix is additive (offer `AlertPositionValue` as a second way to place it) rather than a rework of what's here.

The position is stored per-install, like the rest of `game-clock.json` — it is not part of what's shared with peers ([ADR 0189](./0189-the-clock-reading-is-shared-like-a-mirrored-page.md)), which is exactly right: where *you* like your own HUD is not a fact about the server.
