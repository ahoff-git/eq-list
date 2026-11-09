# 0379: Quitting writes every pending save, and a session end counts as quitting

## Status

Accepted

## Context

Most stores keep their changes in memory and write them a moment later (`createSaver`: 400 ms for the panel
settings, 2 s for achievements, goals, the game clock and more, up to 4 s for the peer stores), so a burst of
changes is one write. Quitting is when that moment has to be brought forward, and two things were wrong with how.

**The list.** `before-quit` flushed a list of stores written out by hand in `main.ts`, and nothing made the
list complete. The achievements and the panel settings (`ui-state.ts`) were never on it. Proved on the real
app by changing one thing through each store's own API and quitting at once: the game clock (on the list)
reached disk; the achievement and the setting (not on it) did not, and `achievements.json` did not exist
afterwards. For an achievement the loss is permanent, not just a few seconds: the log's read position *is*
written straight through ([ADR 0044](./0044-the-log-position-outlives-the-app.md)), so the lines that
progressed it are never read again.

**The event.** Windows ending the session — a shutdown, a restart for updates, a log-off — never emits
`before-quit` (Electron's documentation says so; `session-end` on a window is the event for it), and the
process is ended a moment later. Nothing in the app listened for it, so on every PC shutdown the last seconds
of every store were lost, the ones on the list included. Reproduced without shutting anything down by sending
the test window the real `WM_ENDSESSION` message (which makes Electron emit `session-end`) and ending the
process: an achievement, a setting and a game-clock alarm made just before all failed to reach disk.

The ledgers behind the log (kills, loot, faction, fights) are SQLite and commit as they go; they were never at
risk. This is about the JSON stores.

## Decision

- **A saver is registered while it has a write waiting.** `createSaver` adds itself to a set when it arms its
  timer and removes itself when it writes, and `flushPendingSavers()` writes whatever is in the set. A store can
  no longer be forgotten by being left off a list.
- **`main.ts` calls it after the hand-written list**, which stays for what it is good at — ordering (pending
  faction hits must be filed before the faction ledger is flushed) — and logs how many it caught that the list
  had not.
- **A session end saves exactly as quitting does.** What `before-quit` ran is now `saveEverything`, called from
  `before-quit` and from every window's `session-end` (the first one does the work; the rest return), after
  marking the window state as quitting.

## Consequences

- The same probes, run again: all three changes reach disk after a plain quit and after a simulated session end,
  and the debug log says how many saves the hand-written list had missed (2).
- The unit-testable part is the registry (`json-store.test.ts`). The `session-end` wiring is not unit-testable
  without Electron; it is verified by the `WM_ENDSESSION` probe described in the testing README.
- A crash, a kill from Task Manager, or a power cut still loses up to a store's debounce window. The SQLite
  ledgers are unaffected, and the log position, written straight through, is never ahead of them.
- A new store needs nothing to be safe at quit; it only needs to use `createSaver`. One that writes its file
  some other way still has to be flushed by hand.
