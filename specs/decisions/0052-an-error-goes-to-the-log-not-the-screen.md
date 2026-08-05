# 0052: An error goes to the log, not over the game

## Status

Accepted

## Context

Every window this app owns is frameless, transparent and always-on-top, and two of them
(the cast-alert overlay, the screengrab selector) are stretched across a whole monitor on
purpose ([ADR 0009](./0009-single-window-with-tray.md), and the alert overlay in
`electron/windows.ts`). That is the right shape for something that sits over EverQuest —
and it is exactly the shape that turns any full-viewport UI into a blackout of the game.

Next's dev error overlay is full-viewport UI. A single uncaught error in the alert window —
a window whose whole point is being invisible and click-through until it has something to
say — paints its dark backdrop over the primary display and takes focus. In a browser tab
that is a debugging aid. Here it lands mid-fight, on top of the thing the player is doing,
and the click-through window it hijacks is the one that can't be clicked away.

The overlay was also the *only* place renderer errors were going. Nothing installed
`window.onerror` or an `unhandledrejection` listener, and no route had an `error.tsx`, so a
render crash was a blank window plus whatever DevTools had — and DevTools only open when
`EQL_DEVTOOLS` is set. Meanwhile the app already has a perfectly good place for this:
`setLogSink` mirrors every log to `eqlist-debug.log`, `pipeRendererConsole` feeds each
window's console into it, and the tray has an "Open debug log" item pointing at the file.

## Decision

**The dev overlay never renders**, killed at the stylesheet (`[data-nextjs-dev-overlay],
nextjs-portal { display: none !important }`) rather than by configuration, because there is
no Next option that disables it — `devIndicators: false` only removes the badge.

That rule is injected **from the main process**, by `webContents.insertCSS` in `load()`
(`electron/windows.ts`), not written into `globals.css`. It first lived in `globals.css` and
that could not work, because the worst case is the one a stylesheet in the app can't reach:
on a **compile error** Next serves a document with no app bundle, so app CSS never loads,
and the overlay mounts straight onto `<body>` and calls `focus()` on itself. Injecting from
the Electron side is independent of whether the app built at all, and `load()` is the one
place every window goes through. It re-injects per document, since `insertCSS` is dropped on
navigation and `next dev` reloads on its own. Dev-only, so a packaged build never runs it.

**Errors go to the log instead**, by the three routes an error can take:

- `installErrorReporting` (`src/lib/error-reporting.ts`) listens for `error` and
  `unhandledrejection`. It is mounted once in the root layout via `ErrorReporter`, so every
  window gets it — unlike `useRendererDebug`, which each window has to remember to call.
- `crashBoundary(where)` builds the default export for an `error.tsx`. A React render crash
  is logged with the window it came from.
- The main process logs `uncaughtException` and `unhandledRejection` to the same file,
  instead of Electron's default dialog — which is another window over the game.

**A crash fallback is silent in the windows that cover the game.** `alert/error.tsx` and
`select/error.tsx` pass `{ visible: false }`: those windows are click-through or own a whole
display, and a crashed one can no longer handle its own dismissal, so any notice drawn there
is a box the player is stuck with. The app window shows a small in-window `.crash` notice with
a "Try again"; it is bounded by a window the player can already move, resize and hide.

Handling `uncaughtException` in main means the app keeps running after one, rather than
exiting. For an overlay that is the better trade — a broken feature beats the whole thing
vanishing mid-fight — and the log says what broke.

## Consequences

An error can no longer black out the screen. The failure mode it replaces is quieter, and
deliberately so: what used to be an unmissable overlay is now a line in `eqlist-debug.log`,
reachable from the tray. That is the point, but it does mean a renderer error is easy to
miss unless you go looking — this trades noticing for not being interrupted.

The same rule hides **build** errors in dev, not just runtime ones. A compile failure now
shows up only in the `next dev` terminal, and the window keeps displaying the last good
render (or nothing, on a fresh load). Anyone working on the renderer needs that terminal
visible; there is no on-screen signal any more.

Hiding the overlay from the Electron side means it is hidden only in **our** windows. Open
`localhost:3000` in a browser and the overlay is back, in full — which is the escape hatch
for anyone who wants to read a stack trace without the terminal.

Surviving an `uncaughtException` means the app can now run on in a state it would previously
have died in. The log records it, but a half-initialised subsystem stays half-initialised,
and the next symptom may look unrelated to the line that explains it. `EQL_DEVTOOLS=1` still
opens real DevTools when a crash needs interrogating rather than reading about.

Every route in the app is now inside an error boundary, which changes what a render crash
costs: it takes out that route's subtree rather than the window, and `reset` re-renders it.
