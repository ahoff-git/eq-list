# 0105: An overlay that cannot be operated does not keep the screen

## Status

Accepted

## Context

Every window this app puts over the game is frameless and always-on-top, and two of them cover a
whole display. None of them has an OS titlebar: the drag handle, the ✕, the key handling and — for
the alert overlay — the click-through that makes it harmless are all drawn or driven by **the
renderer**.

So a renderer that dies, hangs, or never hydrates does not produce a broken window. It produces a
window that **nobody can operate**: nothing to press, no key it will answer, and, if it was solid at
that moment, a transparent sheet over the screen that swallows every click. The user's report of the
screengrab selector ([ADR 0102](./0102-a-lookup-never-holds-the-screen.md)) was one instance of a
pattern the rest of the app shared, and an audit found four more:

1. **Placing a custom alert spot made the overlay solid with no way back but the renderer.**
   `alertPlaceStart` set `setIgnoreMouseEvents(false)` + `setFocusable(true)` on a transparent,
   always-on-top window covering the entire display, and only `alertPlaceDone` — sent by that same
   renderer — put it back. A crash, a hang, or a page that never hydrated left the display
   permanently unclickable, **invisibly**, with the promise awaiting a click nobody could make.
2. **Nothing in the app reacted to a renderer dying.** No window listened for
   `render-process-gone`, `unresponsive`, or a failed load. A crashed alert overlay stayed on screen
   painted with its last frame — and being `focusable: false`, it could not even be alt-tabbed to.
3. **`closeAlertWindow()` asked politely.** `close()` runs the renderer's unload, so the one page
   wedged enough to need closing was the one that could refuse.
4. **A dead main or map window is an uncloseable brick.** Frameless and pinned above the game, with
   its titlebar — its only close button — drawn by the renderer that just died.
5. **An uncaught exception in main deliberately keeps the app running** (better than vanishing
   mid-fight, [ADR 0052](./0052-an-error-goes-to-the-log-not-the-screen.md)), which also means it
   keeps whatever half-finished window state the throw interrupted — including an overlay left
   solid — while the code that would have restored it is the code that just died.

## Decision

**A window that can no longer be operated does not get to keep the screen.** One rule, three
mechanisms, applied to every window over the game.

**`guardRenderer` treats crashed, hung and failed-to-load as one fact** — nothing is driving this
window any more — and reports whether it is *fatal*. A hang is not: Chromium says `responsive` when
the renderer catches up, so the reaction to a hang must be reversible.

**`makeHarmless` is what every reaction does first**: never on top, never taking a click. It is the
half that has to be unconditional, because it is the half the user feels.

What follows differs by what the window is worth:

- **Pure overlays are destroyed.** The alert overlay holds no state and rebuilds in a frame, so it
  goes — and comes back, **once**, on the same display, because destroying it silently would trade a
  stuck screen for alerts that stopped working. A rebuild that dies too is left down rather than
  respawned for ever. Here a hang counts as fatal: a hung overlay cannot show an alert either, so
  waiting preserves nothing.
- **The app's own windows are stripped and revived.** Main and map are the app, so destroying them is
  not on the table; they are made harmless, then reloaded once. A window that comes back gets its
  saved pin and click-through back with it, or a crash would quietly demote it.

**The solid state is time-boxed and cannot depend on the renderer to end.** Placement gets a 30s
deadline, an Escape read in **main** via `before-input-event` (which needs no hydration), and a
teardown if the overlay goes away — any of which restores click-through *before* resolving anything,
so no later failure can leave the screen captured. Whether the overlay may take a click now has a
single owner, `setAlertInteractive`, because interactive is a *borrowed* state and click-through is
the resting one; splitting those two settings across call sites is how a window ends up solid with
nothing to click.

**A main-process crash neutralizes every overlay before carrying on.** We have no idea what was
half-done when the throw happened, and the code that would have put it back is the code that died.
A broken feature beats losing the app, and losing the app beats a desktop that will not take a click.

Rejected alternatives:

- **Exiting the app on any renderer crash.** It is the letter of "crash and close", but the app is a
  companion to a game running full-screen underneath: taking the whole thing down mid-fight to fix a
  window is a worse outcome than the window fixing itself.
- **Reloading on a hang.** `unresponsive` fires for a renderer that is merely busy, and throwing away
  a live window's state for being slow is a bug wearing a fix's clothes. Unblock, and wait.
- **A "panic" hotkey to close all overlays.** Another thing to remember, at the one moment nobody
  will remember it — and it would still be no use if the input path itself is what broke.
- **Leaving the alert overlay down after a crash** rather than rebuilding. Simpler, and quietly turns
  off the feature the user is depending on.

## Consequences

- Overlays now fail *closed*. The visible cost is that a crashed alert overlay blinks out and back,
  and a crashed main window reloads — both louder than the silent breakage they replace, and both in
  the log.
- `unresponsive` is a coarse signal, so a main window busy enough to trip it briefly loses its pin
  and click-through until `responsive` lands. Being un-pinned for a second is a fair price for never
  being un-closeable.
- The alert overlay can rebuild itself, which makes `createAlertWindow` reentrant in a new way: it
  now also has to remember which display it was asked for, since a rebuild has nobody to ask.
- Nothing here is unit-tested — it is all Electron window lifecycle. The failure modes are written up
  in [manual-qa](../testing/manual-qa.md) with the way to force each one.
