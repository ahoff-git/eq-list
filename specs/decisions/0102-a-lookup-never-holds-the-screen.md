# 0102: A lookup never holds the screen longer than it is useful

## Status

Accepted

## Context

The screengrab lookup covers **every** display with a frameless, transparent, always-on-top window
that takes input, and leaves them there until something takes them away. Three things were expected
to: a drag (which starts the read), Escape, or a click on nothing.

Each of those depends on the selector's renderer being alive and focused, and on the read returning.
None of it was guaranteed, and each way it broke had the same symptom — **the mouse stops working**,
over the whole desktop, mid-fight, with nothing on screen to explain it:

- The window was shown **from construction**, before its renderer existed, and — the case actually
  hit — the selector is a statically exported page, so `out/select/index.html` already contains
  `Drag over an item name · Esc to cancel`. That markup paints before React hydrates. **A selector
  that never hydrates looks exactly like a working one and honours nothing**: no drag, no Escape, the
  hint sitting there promising otherwise. This is what the bug report described, and no amount of
  bounding the read would have touched it.
- Escape only reaches a **focused** window. A game reclaiming the foreground left the selectors on
  top, still swallowing clicks, with the one key that cancels them going elsewhere.
- `close()` asks the renderer to unload, so a wedged page can **refuse to go away** — which is the
  one thing a rescue path must not be able to do.
- Every route out — Escape, the hotkey, the deadline — went through `lookup.ts`'s own list of
  selectors. A window missing from that list (a racing open, a throw partway through a multi-monitor
  set) is therefore **unkillable by design**: the more stuck it is, the less the app can see it.
- The page drew **no background at all**, so every pixel of a transparent window was fully
  see-through: on Windows that lets a click sail past the page to the game underneath, and it makes
  a live selector visually identical to a stuck one.
- The read was **unbounded**. Tesseract's worker is created lazily and downloads a language model on
  first run; a worker that never answers, or one wedged mid-job, left the "reading text…" overlay up
  for ever — and, because the wedge was cached in `workerPromise`, so did every lookup after it.
- The lookup hotkey only ever meant **open**, so pressing it at a stuck selector built another set.

There was no recovery short of killing the app, which is a hard thing to do without a mouse.

## Decision

**Holding the screen is a bounded loan, and `lookup.ts` is what calls it in.** One deadline is armed
for as long as selectors exist, re-armed per phase, and it ends the only way that helps: close
everything. Waiting for a drag gets 10s — long enough to aim at a frozen tooltip, short enough that a
dead selector is a blip; showing a read gets 6s.

**A read's budget and the screen's are separate numbers, because they answer different questions.**
The deadline gives up on *showing* the read, not on the read: a first run that spends a minute
downloading the model still fills Search when it lands, it just doesn't get to sit on top of the game
while it does. Held to one number, either the screen is hostage to the slowest honest case or every
first lookup fails.

**`ocr.ts` bounds each wait it makes, and a blown budget costs the worker.** Recognizing an upscaled
item name is fast, so a tight budget there is what detects a worker that stopped answering; getting a
worker can mean a model download, so that budget is generous. Either way the worker is **discarded
and terminated**, since a wedged one never recovers on its own and the cached promise would hand it to
every later read. `warm()` starts the download when the selector opens, so the wait is spent while the
user aims rather than out of the read's budget.

**A selector is shown only when the renderer says it is listening.** The window is created hidden and
`reveal()` is the only way onto the screen; the select page calls `lookup.ready()` from the effect
that attaches its handlers, and a selector that never reports is closed. Being *loaded* is not the
same as being *interactive* and only the renderer knows the difference — `ready-to-show` and
`did-finish-load` both fire for a page that will never hydrate. A load failure, an unresponsive
window and a dead render process cancel the lookup for the same reason. Failing invisible costs a
keypress; failing visible costs the desktop.

The drag budget is timed from that report rather than from the hotkey, because a window nobody can see
yet has not been offered to anyone.

**Going away is not negotiable: `destroy()`, never `close()`.** These windows hold no state and have
nothing to save, so there is nothing to be polite about, and politeness is exactly what let a wedged
page keep the screen.

**Escape gets three routes out, because each fails differently.** The page's own `keydown` needs a
hydrated page *and* focus. A **`before-input-event` handler in main** needs only focus — it reads the
key before the page does, so it works on a page that never hydrated. A **global shortcut**, held for
the seconds a lookup lives, needs neither. One key, promised by the hint, answered by whichever route
is still standing; the game gets its Escape straight back when the lookup ends.

**"Close them all" means all of them, not the ones we remembered.** `windows.ts` registers every
selector it creates and `destroyLookupWindows()` is what every route out calls, so a window that
`lookup.ts` lost track of dies with the rest — and `isOpen()` asks the registry too, since the
hotkey is a rescue as much as a shortcut and the untracked window is exactly why someone is reaching
for it. A discrepancy between the two is logged rather than smoothed over: it means a bug upstream.

**The selector paints a faint wash rather than nothing.** It makes every pixel hit-test, and it makes
"armed" and "stuck" look different, which is the difference the user was left to guess at. The crop
comes from the screenshot taken before the window existed, so the wash cannot reach OCR.

**The hotkey toggles.** The escape hatch that matters most is the one that doesn't depend on the
broken thing: a global shortcut is delivered whatever has focus, where Escape is not.

Rejected alternatives:

- **A shorter deadline covering everything** (a few seconds, whatever the phase). It is the right
  instinct about the screen and the wrong one about the read — see above.
- **Making the selectors click-through.** They exist to take a drag; that is the feature.
- **Cancelling the read on timeout.** A promise cannot be cancelled, so this would be the same
  ignoring-a-late-result we already do, dressed as more. What *is* actionable is the worker, and that
  is what gets dropped.
- **A watchdog in the renderer.** It would be the one place already suspect when this goes wrong.
  Whoever owns the windows has to be the one to close them.
- **Turning the selector into a client-only page** so no hint is painted before hydration. It hides
  the symptom and keeps the fault: a page that fails to hydrate would then be an *invisible*
  fullscreen click-eater, which is worse to diagnose. The window not being on screen at all is the
  property worth having.

## Consequences

- A lookup left alone closes itself, so `Ctrl/Cmd+Shift+L` pressed by accident costs ten seconds of
  nothing rather than a scramble for the keyboard. Both budgets and the reason for each sit in
  `DEADLINE`, one edit away.
- OCR text can now arrive **after** the overlay has gone — the control window comes forward with the
  name in Search. Only on a first run over a slow connection, and better than the alternative, but it
  is a result with no visible cause while it is in flight.
- `lookup:ready` is IPC the renderer **must** send or its window never appears, which is an unusual
  coupling: the select page can no longer be rendered anywhere but under a main process that is
  waiting for it. That is already true of everything else it does (`capture`, `cancel`) — but it does
  mean a **broken preload** now shows nothing at all rather than a broken selector. The log says so;
  the deliberate choice is that a lookup which silently does nothing beats one that takes the desktop.
- Window bookkeeping now lives in two places on purpose: `lookup.ts` knows which selector holds which
  display's screenshot, `windows.ts` knows which windows exist. Only the second is trusted to close
  them.
- `Ocr` gained `warm()`, and the read paths gained a shared `withTimeout` (`src/shared/deadline.ts`)
  — the one place that turns an unbounded promise into a bounded one, tested on its own, including
  that an abandoned promise settling late cannot crash the app.
- A read that times out still degrades to "" as it always has, so a wedge reads to the user as "it
  didn't find anything" rather than as an error. The log says which budget was missed.
