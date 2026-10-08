# 0285: A catch-up poll is capped and chained

## Status
Accepted

## Context
`log-watcher.ts`'s `poll()` reads everything appended to the log since the last cursor position in
one `readNew(offset, size)` call and runs the whole batch through `splitLine` → `parseSplitLine` →
every `bus.emit(...)` listener (the combat meter, kill log, HP tracking, alerts) without yielding to
the event loop. [ADR 0044](./0044-the-log-position-outlives-the-app.md) made the gap between runs
*news rather than history* — read once, on the next start — which is exactly what makes the gap can
be large: a player who closes the app for an evening comes back to a multi-megabyte backlog.

Measured on a real log, parsing alone costs ~20ms/MB, and the downstream fan-out costs more than the
parse itself. An uncapped read of an evening's backlog is therefore a multi-second, uninterruptible
stall in the main process on the very first poll after a restart — long enough that the renderer
appears hung, which is the one failure mode an Electron app cannot recover from gracefully (there is
no spinner for "the main process is busy"; the window just stops responding to input).

The watcher already tracks a catch-up pass's shape for other reasons: `catchingUp` (`{ file, bytes,
lastAt? }`) is set once per `start()` and reported to `onCaughtUp` so a caller (`main.ts`) can decide
whether the gap means "last night's fights" (reset the live meter) or "still the same sitting" (carry
on) — see `isSameSitting`. Both of `main.ts`'s `onCaughtUp` handlers assume it fires **exactly once**
per catch-up: one settles the in-progress fight and conditionally resets the meter, the other takes
the UI off mute. Firing it once per chunk instead of once at the true end would make a multi-chunk
restart reset the meter after every chunk, or take the UI off mute before the gap was actually read.

## Decision
**Cap how many bytes one `poll()` pass reads and processes at `MAX_CATCHUP_BYTES_PER_POLL = 1024 *
1024` (1 MiB). When a pass stops short of the gap's end, `poll()` reschedules itself via
`setImmediate` instead of waiting for the next `POLL_MS` (500ms) tick, and `onCaughtUp` is deferred
until a pass finishes the gap with nothing left to read.**

**Why 1 MiB.** At ~20ms/MB to parse, plus a fan-out that costs *more* than the parse, a chunk's total
main-thread cost is comfortably under the ~100ms threshold where a pause starts reading as a freeze
rather than a blip — while staying large enough that an ordinary poll (a player actively logged in,
a few new lines every 500ms) almost always reads its whole, tiny gap in a single pass and pays no
chunking overhead at all. A cap in the low hundreds of KB would turn a multi-megabyte backlog into
dozens of passes for no real benefit — per-pass cost is already imperceptible at 1 MiB — while a cap
in the tens of MB would let a single pass run long enough to be felt again. 1 MiB is the point where
the per-chunk cost is reliably small without manufacturing busywork out of chunks the player would
never notice.

**Why `setImmediate`, not a separate scheduler.** The existing `busy` flag already prevents
`poll()` from re-entering itself; `setImmediate(poll)` queued from inside the same `finally` block
that clears `busy` is simplest-possible-correct — the queued call cannot run until the current call
has returned and cleared `busy`, so there is no possible overlap with the interval timer's own next
tick, and no new state is needed to track "is a continuation pending". A full backlog therefore
clears across several freed-up event-loop turns rather than either one giant tick or several seconds
of wall-clock waiting on `POLL_MS`.

**Why `onCaughtUp` is gated on a local `leftoverBacklog` flag, not on `offset === size` read a second
time.** `poll()` already knows, from the read it just did (`to < size`, where `to` is the capped read
end), whether this pass stopped short of the gap. That single boolean, computed once per pass, is
what both decisions (reschedule immediately / report `caughtUp` now) key off — so the "is the gap
actually done" question is answered in exactly one place and the two decisions can never disagree
about it.

**`stop()` has to cancel the queued continuation too, not just the regular tick.** `clearInterval`
stops the normal `POLL_MS` timer dead, but it was never going to touch a `setImmediate(poll)` already
queued by a capped pass — `setImmediate` isn't cancellable that way, and `stop()` didn't know one might
be pending. Confirmed by a direct repro (two watcher instances sharing a cursor, a real multi-chunk
gap, `stop()` called the instant `start()` returns): without a guard, the queued continuation kept
running after `stop()`, re-emitted backlog events the caller was never told to expect, and even
revived `status().watching` back to `true` — with the timer already cleared, so nothing was left to
service it again. `poll()` now checks `if (!timer) return;` first thing, before the `busy` check:
`timer` is set by `start()` and cleared only by `stop()`, so it is already the exact "has watching
actually stopped" signal this needs, with no new field required. Pinned in
`electron/tests/log-watcher.test.ts`: stopping right after `start()` returns, mid-catch-up, leaves
`loot` events frozen at whatever the one allowed pass emitted and `status()` at `{ watching: false }`
even a full second later — long enough for the whole backlog to have been chewed through had the
queued chain been left to run.

**`remember()` (the on-disk cursor checkpoint) is unchanged: still called once per `poll()` pass,
immediately after that pass's lines are ingested.** It was already a per-*pass* checkpoint, not a
per-*catch-up* one, in the pre-chunking code (there was only ever one pass per catch-up before this
change). Checkpointing after a 1 MiB chunk instead of after the whole gap only shrinks the window a
crash can replay — from "the whole gap" to "at most one more 1 MiB chunk" — which is strictly more
crash-safe, not less, and costs nothing extra: no new write path was added, chunking just makes the
already-existing write happen more often.

## Consequences
- `MAX_CATCHUP_BYTES_PER_POLL` is a new exported-adjacent constant in `log-watcher.ts`, next to
  `POLL_MS`.
- `poll()` reads `Math.min(size, offset + MAX_CATCHUP_BYTES_PER_POLL)` instead of `size`, tracks a
  per-call `leftoverBacklog` flag, and its `finally` block reschedules via `setImmediate` instead of
  reporting `caughtUp` whenever that flag is set.
- `onCaughtUp` still fires exactly once per `start()`, with `bytes` totaling the entire gap across
  every chunk and `lastAt` holding the last event's timestamp from the final chunk — `main.ts`'s two
  handlers (meter reset / sitting-continuity decision, and taking the UI off mute) need no changes.
- A normal, non-catch-up poll (a gap smaller than 1 MiB) is byte-for-byte the same single-pass
  behavior as before; the cap only engages when a gap is actually large enough to matter.
- `electron/tests/log-watcher.test.ts` gained three cases: a backlog several times the cap reports
  `caughtUp` exactly once with the whole gap's byte count (and still parses and emits every chunk's
  lines); an ordinary small gap is confirmed to behave exactly as it did pre-chunking; and stopping
  mid-catch-up actually stays stopped, with no straggler pass reviving it.
- `catchUp()` (the separate, already-bounded zone/`/loc` recovery pass run on `switchTarget`, capped
  at 4 MiB via `CATCHUP_WINDOWS`) is untouched — it is a different read path for a different purpose
  and was never the one this backlog-freeze report measured.
