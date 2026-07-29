# 0019: Parse each log line once, and let one tracker own the session

## Status
Accepted

## Context
Two problems had the same root: text was being handled as text for far too long, and more
than one thing was reading it.

**Re-parsing.** The watcher handed each raw line to every parser in turn, and each parser
independently re-ran the timestamp regex before looking at the message. With seven parsers
that's up to seven splits of every line to produce at most one event. Measured over a real
6,240-line log: the redundant splitting alone costs ~14ms, while a single pass that splits
*and* matches everything costs ~16ms — so nearly half the work was thrown away.

**Two owners.** `session-stats.ts` and `combat-stats.ts` both consumed kill and experience
events and kept their own tallies. That produced a user-visible bug — two "reset session"
buttons that meant different things, so resetting from the Session tab left half of that
tab's own numbers standing — and a smaller one: the older module counted `<pet> has been
slain by …` as a kill, because it had no idea which pet was yours.

## Decision
**One split, one dispatch, `logId` on every event.**

- `splitLine(raw, logId)` is the only place a raw log string is taken apart. It returns a
  `LogLine` (`logId`, `at`, `message`, `raw`), and **every** parser takes that instead of a
  string. A line with no timestamp is the continuation of a wrapped message, never an
  event, so `splitLine` returns null and the line is dropped.
- `parse-line.ts` runs the matchers in cost order (combat first — it's the bulk of a real
  log) and returns the one event a line produces. The watcher calls it once per line and
  fans the result out by `event.kind`.
- Every event carries **`logId`**, a monotonic per-run line counter, so anything downstream
  can point back at the source line without holding or re-reading text. Combined with
  `raw` (carried, never re-parsed) that's enough to find any event in the file.
- `LogEventBase` declares `logId`/`raw`/`at` once instead of thirteen times.

**One tracker owns the session.** `combat-stats.ts` absorbed the experience-gain count and
the solo/party split — about five lines, since it already tracked kills, experience percent
and per-mob attribution — and `session-stats.ts` and its test are gone. `recordXp` now
takes the parsed `XpEvent` rather than loose numbers, which is the same principle as above:
hand the object along, don't re-derive it.

Rejected alternatives:
- **Keeping string-taking wrappers on every parser** for compatibility. Two entry points
  per parser is exactly the ambiguity this ADR removes; the tests instead build a `LogLine`
  in one small helper, which keeps them reading as "raw line in, event out".
- **Dropping `raw` from events** to save memory. It's a slice of a string that already
  exists, it costs nothing to carry, and it makes a debug log or an unexpected event
  self-explanatory. `logId` is for pointing at the line; `raw` is for reading it.
- **Keeping both trackers and just syncing the resets.** That patches the symptom; two
  places counting the same events stays a bug waiting to happen.

## Consequences
- Adding a new event kind means one matcher plus one entry in `parse-line.ts`. Nothing else
  in the pipeline learns about strings.
- Ordering the matchers is now purely about cost, never correctness — each returns null for
  lines it doesn't own.
- `logId` is **per run**, not a file line number: the watcher normally starts mid-file. It
  identifies a line within a session; it isn't a durable reference.
- The Session tab now reads the combat tracker, so its counters and the meter can't
  disagree, one reset clears everything, and the pet's own death is no longer a kill.
- One less module and test to keep in step. The remaining trackers (`xp-progress`,
  `hp-estimate`) are deliberately separate: they hold *persistent player state*, not
  session tallies, and they survive resets that the combat tracker does not.
