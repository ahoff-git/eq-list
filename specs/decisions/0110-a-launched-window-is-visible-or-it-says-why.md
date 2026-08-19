# 0110: A launched window is visible, or it says why

## Status

Accepted

## Context

Every window this app opens is frameless, transparent, and drawn entirely by its renderer. So a window
with no renderer is not a *broken* window — it is an **invisible** one. It still takes a slot in the
taskbar, still accepts a click, and shows nothing at all when clicked, because there is nothing on it to
show. The user's report was exactly that: *"sometimes the windows spawn in the task bar, but clicking
them never actually opens anything."*

[ADR 0105](./0105-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md) settled what happens
when a renderer **dies** while the app is running. This is the same idea at **launch**, and an audit
found seven ways a launch could end with nothing on screen and nothing said:

1. **A window was shown only from `ready-to-show`.** That event is a *paint*: a renderer that fails to
   load, hangs, or dies on the way up never produces one. It also fires once per window, so a window
   whose first load failed would never be shown again however well the reload went. The saved-bounds
   re-assert (there for mixed-DPI monitors) hung off the same single event.
2. **An HTTP error wasn't treated as a failure.** A 404 from the `app://` handler (missing or half-built
   `out/`) and a 500 from `next dev` (a compile error) are, to Chromium, perfectly successful
   navigations whose body happens to say "Not found". `did-fail-load` never fires, so nothing in the app
   noticed — and on a transparent frameless window the result is pixel-identical to the app working.
3. **`applyToggles` could not clear click-through.** `makeHarmless` forces click-through *on* to get a
   broken window off the screen, but the restore only ever set it, never cleared it — and the renderer
   couldn't undo it either, since `useClickThrough` starts out believing the window is solid and so
   sends nothing. One `unresponsive` during a busy launch left the window passing every click to the
   desktop for the rest of the session: painted, in the taskbar, unclickable. ADR 0105 already claimed
   this was reversible.
4. **A throw during startup left a process with no interface.** Anything failing before startup got a
   window up landed in `unhandledRejection`, was logged, and left the app resident with no window, no
   tray, and `window-all-closed` deliberately keeping it alive — findable only in Task Manager, with no
   reason given. Nearby: a deep link or second launch arriving mid-boot created a window *before* the
   `app://` handler existed (so it could only load nothing), and a missing tray icon became a blank,
   unaimable gap in the notification area rather than a logged problem.
5. **`overlay.opacity` was the one stored number nothing validated.** Both scales are clamped on load;
   opacity was passed to the window constructor as-is, so a 0 in the settings file opened every window
   at zero opacity — present, clickable, invisible.
6. **Both launchers handed Electron `process.env` unfiltered.** With `ELECTRON_RUN_AS_NODE` set — an
   editor extension host, a task runner, a shell that once exported it — the same binary starts as a
   bare Node process and dies on the first line of Electron API. A launch that works in one terminal and
   not in another.
7. **The dev launcher assumed `next dev` got port 3000.** It doesn't insist: if 3000 is taken it prints
   a warning and moves up. `dev-electron.mjs` waited on a hardcoded `localhost:3000` (and `windows.ts`
   hardcoded the same URL), so the wait never came good and Electron was never launched — two minutes of
   silence, then nothing. This one was found the way the others were reported: `npm run dev` had stopped
   launching the app. The cause was a **whole orphaned `npm run dev` tree from the previous day** whose
   Electron half had died — which is what finding 6 does — leaving the Next half squatting 3000 and
   answering 404s, so `concurrently -k` never reaped it and every later dev run inherited the problem.
   One bad launch had been poisoning every launch after it. And had the squatter answered 200 instead,
   the wait would have *succeeded* and pointed a transparent window at a stranger's server: invisible
   again, by yet another route.

## Decision

**A launched window ends up on screen showing something, or it says out loud why it could not.**

**A window is shown by a latch, not by an event.** `ready-to-show`, `did-finish-load` and a 3s deadline
all feed one `once` latch: whichever arrives first shows the window, so "never shown" is not an outcome
any of them can produce. The latch is shared with main.ts's `afterLoad`, which wanted the same shape and
had its own copy of the flag. The bounds re-assert hangs off both load signals for the same reason.

**An HTTP error is a dead renderer.** `guardRenderer` reads the response code off `did-navigate` and
routes 4xx/5xx into the same handler as a crash, a hang, and a failed load — it is the same fact:
nothing is driving this window.

**Recovery means a page was *served*, not a load *finished*.** The corollary, and a bug the fix above
exposed while it was being tested: an error page finishes loading like any other, so the "healthy again"
signal that re-arms a rescue was being satisfied by the very 404 it was rescuing from — the window
reloaded, "recovered", 404'd, reloaded, for ever. `guardRenderer` now reports `served` only for a load
that carried a real document, and both the main/map revival and the alert overlay's rebuild hang their
one-attempt guard on that. (The overlay's rebuild also now compares against the window that actually
died rather than the current one, which could only ever compare a window with itself.)

**A window given up on shows a page that cannot fail to load.** After its one reload attempt, the window
gets an opaque built-in notice — a `data:` URL, because the reason it is needed is that *loading a page
did not work* — naming the tray's **Open debug log** and **Quit**. Anything fetched from a dev server,
the `app://` handler, or the app bundle could fail for the very reason being reported; this can't. It
stays click-through and un-pinned: there is nothing on it to click, and a notice that ate clicks over
the game would be its own version of the problem.

**The dev URL is discovered once and passed along, never assumed twice.** `dev-electron.mjs` sweeps
`EQL_DEV_PORT`(=3000) upward for a port that serves *this* renderer — a 2xx carrying the app's own title,
which neither a stranger's server nor a stale instance of ours produces — and hands the winner to Electron
as `EQL_DEV_URL`, which `windows.ts` reads. If nothing serves it in time, the script says what each port
answered and exits, instead of timing out silently. It also names the likely culprit when the start port
is held, because a stale `next dev` is what holds it. What it will **not** do is kill that process: a
launcher that reaches for something it did not start, on a port it does not own, is a worse bug than the
one it fixes.

**Coming back from harmless is stated in both directions**, so a window that hiccuped once is clickable
again. **A launch that produces no app takes a dialog and exits** — the one case where ADR 0052's "an
error goes to the log, not the screen" loses to silence, since there is no window to put it in and
staying resident is not a service to anybody. **Opacity is clamped where both processes read it**
(`windowOpacity`), and **both launchers strip `ELECTRON_RUN_AS_NODE`** from the environment they hand
Electron.

Rejected alternatives:

- **Showing every window unconditionally at creation.** That guarantees a taskbar button, which is the
  symptom rather than the fix — an empty transparent window shown early is exactly what was reported.
- **Retrying the load until it works.** The failure that prompted this (`out/` missing) never resolves
  itself, and unbounded retry is how the reload loop above came to exist in the first place.
- **A frame or titlebar on the failure page** so it could be closed normally. Frameless is a constructor
  option; a window cannot grow a titlebar at runtime. The tray is already the app's second interface and
  already carries both useful actions.
- **Validating `out/` before creating any window.** Cheap, and worth the one log line it now gets — but
  it covers only one of the ways a renderer fails to arrive, so the window layer has to handle the rest
  regardless.

## Consequences

- A broken renderer is now loud: a warning per failed load, a warning when a window is given up on, and
  a visible page in the window itself. What it replaces was indistinguishable from the app not starting.
- The reveal deadline means a window can be shown before it has painted, so a very slow first load can
  flash an empty frame instead of appearing complete. That is the trade: an empty window that fills in
  beats an invisible one that never does.
- The failure page is the first thing in the app that puts text on screen without the renderer, so it
  carries its own styling and can drift from the app's look. It is deliberately plain for that reason.
- `wait-on` is no longer used by anything: the sweep replaced it, because "is a port answering" was
  never the question — "is *our* renderer answering, and where" was. The dependency is still declared;
  removing it is a separate call.
- A dev run whose start port is taken now prints two extra warning lines every time. That is the point:
  the condition was previously silent and self-perpetuating.
- The launch path stays untested as such — it is Electron window lifecycle — but the two pure rules under
  it (the show latch, the opacity floor) are pinned in `window-launch.test.ts`, and every failure mode is
  in [manual-qa](../testing/manual-qa.md) with the way to force it.
