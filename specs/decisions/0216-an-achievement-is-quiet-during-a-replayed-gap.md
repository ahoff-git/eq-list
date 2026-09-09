# 0216: An achievement is quiet during a replayed gap

## Status

Accepted

## Context

`high-scores.ts` mutes itself (`setQuiet(true)`) the moment it's created and stays muted until
`watcher.onCaughtUp` fires, because a log gap is replayed through the exact same live path a running
game feeds it: launch the app after a night away and every record the backlog contains — real,
personal-best hits from hours ago — arrives exactly like a hit landed a second ago. Rule 3 of that
file's own header says it plainly: "Everything logged while the app was shut is replayed... a banner
for a hit you landed last night is a lie about the present."

The achievement tracker (`achievement-tracker.ts`, ADR 0212) receives precisely the same events —
`watcher.onCombat`, `watcher.onLine`, `watcher.onZone`, `scores.onRecord`, `watcher.onKill` — over the
same replayed backlog, and had no equivalent gate. A player who closes the app mid-camp and reopens it
the next evening would have every criterion the gap happens to satisfy — a zone arrival, a hill-giant
kill crossing a tally's threshold, an entire achievement finishing outright — banner and 🎉-party as if
it had just happened, when in fact none of it did. This is the same failure mode ADR 0212's own design
intent explicitly rules out: an achievement banner means "you just did this," not "the log says you did
this at some point before right now."

## Decision

`AchievementTracker` gains a `setQuiet(quiet: boolean): void` method, mirroring `HighScoreTracker`'s
own field for field: a local `quiet` flag, defaulting to `false`, checked by the one function that ever
calls `raise()` (`announce`). Progress itself — `progress.done`, `progress.tally`,
`progress.completedAt`, `progress.resultAnnounced`, `progress.announcedCriteria` — updates exactly the
same whether quiet or not; only the banner is skipped. This matches `high-scores.ts`'s `claim()`, which
records a beaten score to the board regardless of `quiet` and gates only the listener callback that
raises the banner.

`main.ts` wires it the same way it wires `scores`: `achievements.setQuiet(true)` right after
construction, and `achievements.setQuiet(false)` added to the existing second `watcher.onCaughtUp`
listener (the one registered after the debug-logging handler, so it runs after `combat.reset()` has
already banked the in-progress fight the replay was in the middle of) — both trackers come off mute in
the same call, at the same moment, for the same reason.

Because criteria/tallies/completion all still land while quiet, a multi-criterion achievement finished
entirely inside a replayed gap will show as fully done — correctly — the moment the panel is opened;
it simply never interrupted the player with a banner for something that had already happened.

## Consequences

- A restart after a log gap files every criterion the backlog satisfies, silently — matching
  `high-scores.ts`'s behavior exactly, and closing the one place achievements diverged from it.
- `announceProgress`'s internal bookkeeping (`resultAnnounced`, `announcedCriteria`) still advances
  while quiet, so unmuting never triggers a retroactive announcement for something the gap already
  finished — the criterion is already marked "announced," just never actually spoken.
- Any future hook added to `achievement-tracker.ts` that can fire from a replayed event must route its
  banner through `announce()` (or check `quiet` itself) rather than calling `raise()` directly, or it
  reopens exactly this gap.
