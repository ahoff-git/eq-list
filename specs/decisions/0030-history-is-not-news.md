# 0030: A log line that already happened is history, not news

## Status

Accepted

## Context

The watcher anchors at the end of the log when it starts, so launching mid-session doesn't
replay hours of play. That rule only ever covered the log that happened to be newest at the
time. Every *other* log in the folder was unknown to the watcher, so the first time one of them
was written to — which is what switching characters looks like — it was treated as a file that
had just appeared and read **from the top**.

Measured with two characters whose logs both predated launch: startup correctly ingested
nothing, then switching characters ingested **120 phantom kills**. Everything downstream took
them at face value — kills re-recorded into the heatmap, experience re-counted, loot re-matched
against the shopping list (so its counts jump), fights re-filed into history, and a cast alert
fired for every spell that character had ever been cast at.

The alert is the sharpest version of the problem. "⚠ casting Root — dispel!" is a call to act
*now*; raising it for a fight that ended hours ago is not a slightly-wrong number, it is a false
alarm, and a replay produces them by the hundred.

## Decision

**Only a log that genuinely appeared after watching began is read from the top.** On `start`,
every eqlog already in the folder is recorded at its current length. Switching to any of them
later resumes from there, so the app follows what is being written and ignores what was written
before it was watching. A file that shows up afterwards — a new session, the sim's fresh log —
still reads fully, which is the behaviour that rule was for.

**An alert must be about something that just happened.** `matchCast` takes the line's timestamp
and refuses anything older than `LIVE_WITHIN_MS` (30 seconds — generous beside a cast time,
tight beside any replay). An unreadable timestamp is allowed through, because a missed alert is
the worse of the two failures.

## Consequences

The two guards are deliberately independent. The watcher fix removes the replays we know about;
the freshness check means that any *future* path that feeds old lines in — a rotation, a
recovery, a feature nobody has written yet — can't turn them into alarms. Belt and braces on the
one behaviour that interrupts the player.

Remembered offsets live in memory, so they last a session. Across a restart the startup anchor
does the same job, and the two agree.

A caveat worth stating: resuming from a remembered length means anything written to a log *while
it wasn't the active one* is skipped, not queued. That's correct for the case this fixes — you
weren't playing that character — but it does mean the app never sees two characters' logs
growing at once. Nothing in EQ does that to one account, so it hasn't been designed for.
