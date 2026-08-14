# 0089: A rule is checked against the log file, not against this session

## Status

Accepted

Supersedes the **recent-lines** half of
[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md); the rest of that decision stands.

## Context

[ADR 0085](./0085-a-rule-can-be-tested-shared-and-borrowed.md) gave a rule a replay: the ✓ drawer
says which of the log's recent lines the rule *would* have fired on. The lines came from a ring
buffer in the main process, filled from the watcher's `onLine` channel — the last 2000 lines to go
past **since the app launched**.

Reported from use: it never finds anything.

The buffer is empty, and for a structural reason rather than a bug. A watcher pointed at a log it has
never read [pins itself at the end of the file](./0030-history-is-not-news.md) rather than replaying
it, and a log it *has* read resumes from the cursor — so on a quiet launch nothing at all comes
through `onLine`. Meanwhile the person using the feature is, almost by definition, **not playing**:
you write a rule after the evening that made you want one. So the check answered "nothing logged yet
this session" to exactly the person it was built for — and that sentence reads as *your rule matches
nothing*, which is worse than useless. It is a confident wrong answer.

The whole argument for a replay was that it turns "go and make it happen again" into an answer now.
A session buffer quietly reintroduces the wait it was meant to remove.

## Decision

**Read the tail of the log file, on demand.** `log.recent()` now seeks to the last `TAIL_BYTES`
(512 KB, a few thousand lines) of the file the watcher is following, drops the part-line it lands in,
parses with `splitLine` and returns the last `TAIL_LINES` (3000). One seek and a bounded read, so a
15 MB log costs what a fresh one does — the watcher's own catch-up recovers the zone exactly this
way, for exactly this reason.

`recent-lines.ts` and its tests are **deleted** rather than left as a second source. Two answers to
"what has the log said lately" is how they come to disagree, and the file is the one that is true
whether or not the app was running.

**A missing log is an empty answer, not an error.** No game installed, no folder set yet, a log
deleted mid-session — all ordinary, and the panel says which of them it is in its own words ("No log
file to read — check the log folder on the Settings tab") rather than being handed an exception.

**How far back is the reader's choice.** The default slice answers nearly everything and costs
nothing, but a rule about a named, a raid call or a fade you see twice a week needs more log — and
*nothing found* is only worth believing once you have looked as far back as the thing you are waiting
for. So **"search further back"** climbs `TAIL_STEPS` (512 KB → 2 MB → 8 MB → 32 MB, the same
widening the watcher does to find a zone line), and the panel always says which of the two answers it
is giving: "in the last 3,412 lines" or "in the whole log (12,908 lines)". The button disappears when
the file has been read to its start, because a button that cannot change the answer is one more thing
to wonder about.

**The tail crosses the IPC boundary as text, not as lines.** At the deep end that is tens of
thousands of `LogLine` objects, and a structured-clone of that many small objects costs far more than
the string they came from — while `parseLogText` on the far side is work `dryRun` was going to do
anyway. So: read bytes in main, parse where they are used.

**The reading stays where it was: pure, in the renderer.** Main hands over text; `dryRun` judges the
lines, so the answer still re-computes on every keystroke while a rule is being typed — at every
depth, since widening only changes how much was fetched.

## Consequences

The check now answers about **last night**, which is when rules get written. Verified by running it:
against a 63-line sample log the app had never watched live, a raw-text rule for "invites you"
reports *1 match in the last 63 lines* and shows the sentence — where the ring buffer would have
reported nothing at all.

**It reads a file on each check** instead of holding lines in memory. That is the right way round:
the cost is paid when somebody opens the drawer, not continuously by every line the watcher reads,
and it is bounded by bytes rather than by how long the app has been up.

**A rule about something genuinely rare can still find nothing at the first depth** — and now the
panel says so *and* offers the next step rather than leaving "0 matches" as the last word. Only once
the whole file has been read does it say the wording must be wrong, which is the one point at which
that claim is true.

**The deep steps are a real read**: 32 MB is past any EQ log we've measured, so the ladder ends at
"all of it" in practice rather than at a cap somebody would hit. The cost is paid on an explicit
click, and only then.

Two smaller things follow. The tail is read from **the file the watcher is following**, so on a
machine with several characters' logs the check describes the same log the alerts do. And nothing
about the alert path holds state that a restart clears any more: main's `onLine` handler is one line
again, feeding only the router.
